// ===== 操作履歴表示サイドバー機能（キャッシュ+差分同期対応） =====

/**
 * 機能:
 * - サイドバーで操作履歴を表示
 * - フィルター機能（日付範囲、メンバー、アクション種類）
 * - ページネーション（10件ずつ読み込み）
 * - キャッシュ機能（再表示時は読み取り0回）
 * - 差分同期（新しい履歴のみリアルタイム追加）
 */

let historyState = {
    currentFilters: {
        dateRange: '7', // デフォルト: 過去7日
        member: 'all',
        action: 'all'
    },
    cache: new Map(), // キャッシュ: フィルター条件ごとに保存
    listener: null, // リアルタイムリスナー
    lastTimestamp: null, // 最後に取得した履歴のタイムスタンプ
    loadedDocIds: new Set() // 既に取得済みのドキュメントID
};

// キャッシュキーを生成
function getCacheKey() {
    return `${historyState.currentFilters.dateRange}_${historyState.currentFilters.member}_${historyState.currentFilters.action}`;
}

// サイドバーを開く
async function openHistorySidebar() {
    const sidebar = document.getElementById('historySidebar');
    const overlay = document.getElementById('historyOverlay');
    
    if (!sidebar || !overlay) {
        console.error('History sidebar elements not found');
        return;
    }
    
    sidebar.classList.add('active');
    overlay.classList.add('active');
    
    // キャッシュがあれば表示、なければ読み込み
    const cacheKey = getCacheKey();
    if (historyState.cache.has(cacheKey)) {
        console.log('📦 Loading from cache (0 reads)');
        displayCachedHistory(cacheKey);
        
        // 差分同期：キャッシュより新しい履歴のみ取得
        await syncNewHistoryLogs();
        
        // リスナーを開始
        startRealtimeListener();
    } else {
        console.log('🔄 Loading from Firestore');
        // 履歴を読み込んでからリスナーを開始
        await loadHistoryLogs();
        startRealtimeListener();
    }
}

// キャッシュから履歴を表示
function displayCachedHistory(cacheKey) {
    const cachedData = historyState.cache.get(cacheKey);
    const container = document.getElementById('historyLogsContainer');
    const countElement = document.getElementById('historyResultCount');
    const loadMoreBtn = document.getElementById('loadMoreHistoryBtn');
    
    // キャッシュされたHTMLを表示
    container.innerHTML = cachedData.html;
    countElement.textContent = cachedData.count;
    
    // lastTimestampを復元（キャッシュから）
    historyState.lastTimestamp = cachedData.lastTimestamp || null;
    
    // loadedDocIdsを復元（重複防止のため）
    if (cachedData.loadedDocIds) {
        historyState.loadedDocIds = new Set(cachedData.loadedDocIds);
        console.log(`📦 Restored ${historyState.loadedDocIds.size} doc IDs from cache`);
    } else {
        historyState.loadedDocIds.clear();
    }
    
    // さらに読み込みボタンは常に非表示
    loadMoreBtn.style.display = 'none';
    
    console.log('📦 Restored from cache, lastTimestamp:', historyState.lastTimestamp);
}

// 差分同期：キャッシュより新しい履歴のみ取得
async function syncNewHistoryLogs() {
    if (!historyState.lastTimestamp) {
        console.log('⏭️ No lastTimestamp, skipping sync');
        return;
    }
    
    const container = document.getElementById('historyLogsContainer');
    const countElement = document.getElementById('historyResultCount');
    
    try {
        console.log('🔄 Syncing new logs since:', historyState.lastTimestamp);
        
        // lastTimestampより新しい履歴のみ取得
        let query = db.collection('audit_logs')
            .orderBy('timestamp', 'desc')
            .where('timestamp', '>', historyState.lastTimestamp);
        
        // 日付範囲フィルター
        if (historyState.currentFilters.dateRange !== 'all') {
            const daysAgo = parseInt(historyState.currentFilters.dateRange);
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - daysAgo);
            startDate.setHours(0, 0, 0, 0);
            query = query.where('timestamp', '>=', startDate);
        }
        
        const snapshot = await query.get();
        
        console.log(`🔄 Sync: Read ${snapshot.size} new documents`);
        
        if (snapshot.empty) {
            console.log('✅ No new logs to sync');
            return;
        }
        
        // クライアント側でメンバーとアクションフィルター
        let newLogs = [];
        
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            
            // 重複チェック
            if (historyState.loadedDocIds.has(doc.id)) {
                return;
            }
            
            // メンバーフィルター
            if (historyState.currentFilters.member !== 'all' && 
                data.eventData?.member !== historyState.currentFilters.member) {
                return;
            }
            
            // アクションフィルター
            if (historyState.currentFilters.action !== 'all' && 
                data.action !== historyState.currentFilters.action) {
                return;
            }
            
            newLogs.push({ id: doc.id, data: data });
        });
        
        console.log(`✅ Synced ${newLogs.length} new filtered logs`);
        
        if (newLogs.length === 0) {
            return;
        }
        
        // 新しい履歴を逆順で追加（最新が一番上になるように）
        newLogs.reverse().forEach(log => {
            const html = generateHistoryLogHTML(log.data, log.id);
            container.insertAdjacentHTML('afterbegin', html);
            historyState.loadedDocIds.add(log.id);
            
            // lastTimestampを更新
            const logTimestamp = log.data.timestamp?.toDate ? log.data.timestamp.toDate() : new Date(log.data.timestamp);
            if (!historyState.lastTimestamp || logTimestamp > historyState.lastTimestamp) {
                historyState.lastTimestamp = logTimestamp;
            }
        });
        
        // フィルターの使用状況をチェック
        const hasFilters = historyState.currentFilters.member !== 'all' || 
                          historyState.currentFilters.action !== 'all';
        const isDefaultState = !hasFilters && historyState.currentFilters.dateRange === '7';
        
        // デフォルト状態の場合、10件維持
        if (isDefaultState) {
            const allItems = container.querySelectorAll('.history-log-item');
            if (allItems.length > 10) {
                console.log('📌 Keeping only 10 most recent items after sync');
                for (let i = 10; i < allItems.length; i++) {
                    allItems[i].remove();
                }
            }
        }
        
        // カウントを更新
        const finalCount = container.querySelectorAll('.history-log-item').length;
        countElement.textContent = finalCount;
        
        // キャッシュを更新
        const cacheKey = getCacheKey();
        historyState.cache.set(cacheKey, {
            html: container.innerHTML,
            count: finalCount,
            lastTimestamp: historyState.lastTimestamp,
            loadedDocIds: new Set(historyState.loadedDocIds)
        });
        
        console.log('💾 Cache updated after sync');
        
    } catch (error) {
        console.error('Failed to sync new logs:', error);
    }
}

// フィルターの表示/非表示を切り替え
function toggleHistoryFilters() {
    const container = document.getElementById('historyFiltersContainer');
    const icon = document.getElementById('filterToggleIcon');
    
    if (container.style.display === 'none') {
        container.style.display = 'block';
        icon.textContent = '▲';
    } else {
        container.style.display = 'none';
        icon.textContent = '▼';
    }
}

// サイドバーを閉じる
function closeHistorySidebar() {
    const sidebar = document.getElementById('historySidebar');
    const overlay = document.getElementById('historyOverlay');
    
    sidebar.classList.remove('active');
    overlay.classList.remove('active');
    
    // リアルタイムリスナーを停止
    stopRealtimeListener();
    
    // キャッシュは保持（差分同期のため）
    console.log('💾 Cache preserved for next open');
}

// リアルタイムリスナーを開始
function startRealtimeListener() {
    // 既存のリスナーを停止
    stopRealtimeListener();
    
    console.log('🎧 Starting realtime listener for new history logs');
    
    // 現在の最新タイムスタンプ以降の履歴を監視（日付フィルターのみ）
    let query = db.collection('audit_logs')
        .orderBy('timestamp', 'desc');
    
    // 日付範囲フィルターのみFirestoreで実行
    if (historyState.currentFilters.dateRange !== 'all') {
        const daysAgo = parseInt(historyState.currentFilters.dateRange);
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysAgo);
        startDate.setHours(0, 0, 0, 0);
        query = query.where('timestamp', '>=', startDate);
    }
    
    // 初回スナップショットをスキップするフラグ
    let isFirstSnapshot = true;
    
    // リスナーを設定
    historyState.listener = query.onSnapshot((snapshot) => {
        console.log(`📡 Snapshot received: ${snapshot.size} docs, ${snapshot.docChanges().length} changes`);
        
        // 初回スナップショットは無視（既にloadHistoryLogsで読み込み済み）
        if (isFirstSnapshot) {
            isFirstSnapshot = false;
            console.log('⏭️ Skipping initial snapshot (already loaded)');
            return;
        }
        
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
                const log = change.doc.data();
                const logTimestamp = log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
                
                // 重複チェック（既に表示されている履歴は追加しない）
                if (historyState.loadedDocIds.has(change.doc.id)) {
                    console.log('⏭️ Skipping duplicate log:', change.doc.id);
                    return;
                }
                
                // クライアント側でメンバーとアクションフィルターをチェック
                let passesFilter = true;
                
                if (historyState.currentFilters.member !== 'all') {
                    passesFilter = passesFilter && (log.eventData?.member === historyState.currentFilters.member);
                }
                
                if (historyState.currentFilters.action !== 'all') {
                    passesFilter = passesFilter && (log.action === historyState.currentFilters.action);
                }
                
                if (passesFilter) {
                    console.log('✨ New history log detected:', change.doc.id);
                    prependNewHistoryLog(log, change.doc.id);
                    
                    // loadedDocIdsに追加
                    historyState.loadedDocIds.add(change.doc.id);
                    
                    // 最新タイムスタンプを更新
                    if (!historyState.lastTimestamp || logTimestamp > historyState.lastTimestamp) {
                        historyState.lastTimestamp = logTimestamp;
                    }
                } else {
                    console.log('⏭️ Skipping log (does not match filters):', change.doc.id);
                }
            }
        });
    }, (error) => {
        console.error('Realtime listener error:', error);
    });
}

// 新しい履歴を先頭に追加
function prependNewHistoryLog(log, logId) {
    const container = document.getElementById('historyLogsContainer');
    const countElement = document.getElementById('historyResultCount');
    
    const html = generateHistoryLogHTML(log, logId);
    
    // 先頭に追加
    container.insertAdjacentHTML('afterbegin', html);
    
    // loadedDocIdsに追加
    historyState.loadedDocIds.add(logId);
    
    // 現在の履歴アイテムを取得
    const allItems = container.querySelectorAll('.history-log-item');
    
    // フィルターの使用状況をチェック
    const hasFilters = historyState.currentFilters.member !== 'all' || 
                      historyState.currentFilters.action !== 'all';
    const isDefaultState = !hasFilters && historyState.currentFilters.dateRange === '7';
    
    // デフォルト状態（フィルターなし）の場合のみ10件維持
    if (isDefaultState && allItems.length > 10) {
        console.log('📌 Keeping only 10 most recent items (default state)');
        // 11件目以降を削除
        for (let i = 10; i < allItems.length; i++) {
            allItems[i].remove();
        }
    }
    
    // カウントを更新
    const finalCount = container.querySelectorAll('.history-log-item').length;
    countElement.textContent = finalCount;
    
    // キャッシュを更新
    const cacheKey = getCacheKey();
    if (historyState.cache.has(cacheKey)) {
        const cachedData = historyState.cache.get(cacheKey);
        cachedData.html = container.innerHTML;
        cachedData.count = finalCount;
        cachedData.lastTimestamp = historyState.lastTimestamp;
        cachedData.loadedDocIds = new Set(historyState.loadedDocIds);
    }
    
    // アニメーション効果
    const newItem = container.firstElementChild;
    if (newItem) {
        newItem.style.animation = 'slideIn 0.3s ease-out';
        setTimeout(() => {
            newItem.style.animation = '';
        }, 300);
    }
}

// リアルタイムリスナーを停止
function stopRealtimeListener() {
    if (historyState.listener) {
        console.log('🛑 Stopping realtime listener');
        historyState.listener();
        historyState.listener = null;
    }
}

// 履歴を読み込む
async function loadHistoryLogs() {
    const container = document.getElementById('historyLogsContainer');
    const loadMoreBtn = document.getElementById('loadMoreHistoryBtn');
    const countElement = document.getElementById('historyResultCount');
    
    container.innerHTML = '<div style="text-align:center;padding:20px;color:#666">読み込み中...</div>';
    
    // さらに読み込みボタンは常に非表示（新仕様）
    loadMoreBtn.style.display = 'none';
    
    try {
        // クエリを構築
        let query = db.collection('audit_logs').orderBy('timestamp', 'desc');
        
        // 日付範囲フィルター
        if (historyState.currentFilters.dateRange !== 'all') {
            const daysAgo = parseInt(historyState.currentFilters.dateRange);
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - daysAgo);
            startDate.setHours(0, 0, 0, 0);
            query = query.where('timestamp', '>=', startDate);
        }
        
        // フィルターなしの場合のみ10件制限
        const hasFilters = historyState.currentFilters.member !== 'all' || 
                          historyState.currentFilters.action !== 'all';
        
        if (!hasFilters && historyState.currentFilters.dateRange === '7') {
            // デフォルト状態（過去7日、フィルターなし）→ 10件のみ
            query = query.limit(10);
            console.log('📊 Loading latest 10 items (no filters)');
        } else {
            // フィルター使用時 → 範囲内の全件
            console.log('📊 Loading all items in filtered range');
        }
        
        const snapshot = await query.get();
        
        console.log(`📊 Read count: ${snapshot.size} documents`);
        
        if (snapshot.empty) {
            container.innerHTML = '<div style="text-align:center;padding:40px;color:#999">📭 履歴がありません</div>';
            countElement.textContent = '0';
            return;
        }
        
        // クライアント側でメンバーとアクションフィルター
        let filteredDocs = [];
        
        for (const doc of snapshot.docs) {
            const data = doc.data();
            
            // メンバーフィルター
            if (historyState.currentFilters.member !== 'all' && 
                data.eventData?.member !== historyState.currentFilters.member) {
                continue;
            }
            
            // アクションフィルター
            if (historyState.currentFilters.action !== 'all' && 
                data.action !== historyState.currentFilters.action) {
                continue;
            }
            
            // フィルター通過
            filteredDocs.push(doc);
        }
        
        console.log(`✅ Filtered: ${filteredDocs.length} docs`);
        
        if (filteredDocs.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:40px;color:#999">📭 履歴がありません</div>';
            countElement.textContent = '0';
            return;
        }
        
        // 最新のタイムスタンプを保存（リアルタイムリスナー用）
        const firstLog = filteredDocs[0].data();
        const firstTimestamp = firstLog.timestamp?.toDate ? firstLog.timestamp.toDate() : new Date(firstLog.timestamp);
        historyState.lastTimestamp = firstTimestamp;
        
        // loadedDocIdsをクリアして再構築
        historyState.loadedDocIds.clear();
        
        // HTMLを生成
        let html = '';
        filteredDocs.forEach(doc => {
            const log = doc.data();
            html += generateHistoryLogHTML(log, doc.id);
            historyState.loadedDocIds.add(doc.id);
        });
        
        container.innerHTML = html;
        countElement.textContent = filteredDocs.length;
        
        console.log(`📊 Displayed: ${filteredDocs.length} items`);
        
        // キャッシュに保存
        const cacheKey = getCacheKey();
        historyState.cache.set(cacheKey, {
            html: container.innerHTML,
            count: filteredDocs.length,
            lastTimestamp: historyState.lastTimestamp,
            loadedDocIds: new Set(historyState.loadedDocIds)
        });
        
        console.log(`💾 Cached with key: ${cacheKey}`);
        
    } catch (error) {
        console.error('Failed to load history logs:', error);
        container.innerHTML = '<div style="text-align:center;padding:20px;color:#f44336">❌ 履歴の読み込みに失敗しました</div>';
    }
}

// 履歴ログのHTMLを生成
function generateHistoryLogHTML(log, logId) {
    const timestamp = log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
    const timeStr = formatTimestamp(timestamp);
    
    // アクションアイコンと色
    let actionIcon = '';
    let actionColor = '';
    let actionText = '';
    
    switch(log.action) {
        case 'create':
            actionIcon = '🆕';
            actionColor = '#4caf50';
            actionText = '追加';
            break;
        case 'update':
            actionIcon = '✏️';
            actionColor = '#2196f3';
            actionText = '変更';
            break;
        case 'delete':
            actionIcon = '🗑️';
            actionColor = '#f44336';
            actionText = '削除';
            break;
    }
    
    // メンバー名を取得
    const memberName = app?.teamMembers?.find(m => m.id === log.eventData?.member)?.displayName || log.eventData?.member || '不明';
    
    // 変更内容を生成
    let changesHTML = '';
    if (log.changes && Object.keys(log.changes).length > 0) {
        changesHTML = '<div style="margin-top:8px;padding:8px;background:#f5f5f5;border-radius:4px;font-size:12px">';
        changesHTML += '<div style="font-weight:600;margin-bottom:4px;color:#666">変更内容:</div>';
        
        for (const [field, change] of Object.entries(log.changes)) {
            const fieldName = getFieldDisplayName(field);
            changesHTML += `<div style="margin:2px 0;color:#555">
                ${fieldName}: <span style="color:#f44336">${change.old}</span> → <span style="color:#4caf50">${change.new}</span>
            </div>`;
        }
        
        changesHTML += '</div>';
    }
    
    return `
        <div class="history-log-item" style="display:flex;background:#fff;margin-bottom:12px;border-radius:4px;box-shadow:0 1px 3px rgba(0,0,0,0.1);overflow:hidden">
            <div style="background:${actionColor};color:white;writing-mode:vertical-rl;text-orientation:upright;padding:12px 8px;font-weight:700;font-size:14px;letter-spacing:2px;display:flex;align-items:center;justify-content:center;min-width:32px">
                ${actionText}
            </div>
            <div style="flex:1;padding:12px;position:relative">
                <div style="position:absolute;top:12px;right:12px;background:${actionColor};color:white;width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;text-align:center;line-height:1.2;padding:4px">
                    ${memberName}
                </div>
                <div style="margin-right:60px">
                    <div style="font-size:18px;font-weight:700;color:#333;margin-bottom:8px">
                        ${log.eventData?.memberName || '不明'}
                    </div>
                    <div style="font-size:13px;color:#555;line-height:1.6">
                        <div><strong>日付:</strong> ${log.eventData?.date || '不明'}</div>
                        <div><strong>時間:</strong> ${log.eventData?.time || log.eventData?.startTime || '範囲'}</div>
                        <div><strong>種類:</strong> ${getTypeLabel(log.eventData?.type)}</div>
                    </div>
                    ${changesHTML}
                </div>
                <div style="position:absolute;bottom:12px;right:12px;font-size:11px;color:#999">
                    ${timeStr}
                </div>
            </div>
        </div>
    `;
}

// タイムスタンプをフォーマット
function formatTimestamp(date) {
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'たった今';
    if (minutes < 60) return `${minutes}分前`;
    if (hours < 24) return `${hours}時間前`;
    if (days < 7) return `${days}日前`;
    
    // 1週間以上前は日時を表示
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    
    return `${year}/${month}/${day} ${hour}:${minute}`;
}

// フィールド名の表示名を取得
function getFieldDisplayName(field) {
    const fieldNames = {
        time: '時間',
        date: '日付',
        type: '種類',
        surname: '姓',
        firstname: '名',
        displayName: '表示名',
        startTime: '開始時刻',
        endTime: '終了時刻'
    };
    return fieldNames[field] || field;
}

// イベントタイプのラベルを取得
function getTypeLabel(type) {
    const typeLabels = {
        '20min': '20分',
        '40min': '40分',
        '60min': '60分',
        'visit': '訪問',
        'workinjury20': '労災20',
        'workinjury40': '労災40',
        'accident': '事故',
        'day': 'デイ',
        'meeting': '担会',
        'other': 'その他'
    };
    return typeLabels[type] || type;
}

// フィルターを適用
async function applyHistoryFilters() {
    // フィルター値を取得
    historyState.currentFilters.dateRange = document.getElementById('historyDateRange').value;
    historyState.currentFilters.member = document.getElementById('historyMemberFilter').value;
    historyState.currentFilters.action = document.getElementById('historyActionFilter').value;
    
    // リアルタイムリスナーを停止
    stopRealtimeListener();
    
    // キャッシュがあれば表示、なければ読み込み
    const cacheKey = getCacheKey();
    if (historyState.cache.has(cacheKey)) {
        console.log('📦 Loading filtered results from cache (0 reads)');
        displayCachedHistory(cacheKey);
        // キャッシュから復元後、リスナーを開始
        startRealtimeListener();
    } else {
        console.log('🔄 Loading filtered results from Firestore');
        // 履歴を読み込んでからリスナーを開始
        await loadHistoryLogs();
        startRealtimeListener();
    }
}

// フィルターをリセット
function resetHistoryFilters() {
    document.getElementById('historyDateRange').value = '7';
    document.getElementById('historyMemberFilter').value = 'all';
    document.getElementById('historyActionFilter').value = 'all';
    
    applyHistoryFilters();
}

// メンバーフィルターを初期化
function initHistoryMemberFilter() {
    const select = document.getElementById('historyMemberFilter');
    if (!select || !app || !app.teamMembers) return;
    
    // 既存のオプションをクリア（"すべて"以外）
    while (select.options.length > 1) {
        select.remove(1);
    }
    
    // メンバーを追加
    app.teamMembers.forEach(member => {
        const option = document.createElement('option');
        option.value = member.id;
        option.textContent = member.displayName;
        select.appendChild(option);
    });
}

// オーバーレイクリックでサイドバーを閉じる
document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('historyOverlay');
    if (overlay) {
        overlay.addEventListener('click', closeHistorySidebar);
    }
    
    // アプリ初期化後にメンバーフィルターを設定
    const waitForApp = setInterval(() => {
        if (window.app && window.app.teamMembers) {
            clearInterval(waitForApp);
            initHistoryMemberFilter();
        }
    }, 1000);
});

// CSSアニメーションを追加
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(20px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
`;
document.head.appendChild(style);

console.log('✅ History sidebar feature loaded (with cache + realtime sync)');

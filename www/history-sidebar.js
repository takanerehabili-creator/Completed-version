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
    lastDoc: null,
    hasMore: true,
    currentFilters: {
        dateRange: 7, // デフォルト: 過去7日
        member: 'all',
        action: 'all'
    },
    cache: new Map(), // キャッシュ: フィルター条件ごとに保存
    listener: null, // リアルタイムリスナー
    lastTimestamp: null // 最後に取得した履歴のタイムスタンプ
};

// キャッシュキーを生成
function getCacheKey() {
    return `${historyState.currentFilters.dateRange}_${historyState.currentFilters.member}_${historyState.currentFilters.action}`;
}

// サイドバーを開く
function openHistorySidebar() {
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
    } else {
        console.log('🔄 Loading from Firestore');
        historyState.lastDoc = null;
        historyState.hasMore = true;
        loadHistoryLogs();
    }
    
    // リアルタイムリスナーを開始
    startRealtimeListener();
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
    
    // ページネーション状態を復元
    historyState.lastDoc = cachedData.lastDoc;
    historyState.hasMore = cachedData.hasMore;
    historyState.lastTimestamp = cachedData.lastTimestamp;
    
    loadMoreBtn.style.display = cachedData.hasMore ? 'block' : 'none';
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
}

// リアルタイムリスナーを開始
function startRealtimeListener() {
    // 既存のリスナーを停止
    stopRealtimeListener();
    
    console.log('🎧 Starting realtime listener for new history logs');
    
    // 現在の最新タイムスタンプ以降の履歴を監視
    let query = db.collection('audit_logs')
        .orderBy('timestamp', 'desc');
    
    // 最後のタイムスタンプがあれば、それ以降のみ監視
    if (historyState.lastTimestamp) {
        query = query.where('timestamp', '>', historyState.lastTimestamp);
    }
    
    // フィルター適用
    if (historyState.currentFilters.dateRange !== 'all') {
        const daysAgo = parseInt(historyState.currentFilters.dateRange);
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysAgo);
        startDate.setHours(0, 0, 0, 0);
        query = query.where('timestamp', '>=', startDate);
    }
    
    if (historyState.currentFilters.member !== 'all') {
        query = query.where('eventData.member', '==', historyState.currentFilters.member);
    }
    
    if (historyState.currentFilters.action !== 'all') {
        query = query.where('action', '==', historyState.currentFilters.action);
    }
    
    // リスナーを設定
    historyState.listener = query.onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
                const log = change.doc.data();
                const logTimestamp = log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
                
                // 初回読み込み時は追加しない（重複防止）
                if (historyState.lastTimestamp && logTimestamp > historyState.lastTimestamp) {
                    console.log('✨ New history log detected:', change.doc.id);
                    prependNewHistoryLog(log, change.doc.id);
                    
                    // 最新タイムスタンプを更新
                    if (!historyState.lastTimestamp || logTimestamp > historyState.lastTimestamp) {
                        historyState.lastTimestamp = logTimestamp;
                    }
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
    
    // カウントを更新
    const currentCount = parseInt(countElement.textContent);
    countElement.textContent = currentCount + 1;
    
    // キャッシュを更新
    const cacheKey = getCacheKey();
    if (historyState.cache.has(cacheKey)) {
        const cachedData = historyState.cache.get(cacheKey);
        cachedData.html = container.innerHTML;
        cachedData.count = currentCount + 1;
        cachedData.lastTimestamp = historyState.lastTimestamp;
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
async function loadHistoryLogs(loadMore = false) {
    const container = document.getElementById('historyLogsContainer');
    const loadMoreBtn = document.getElementById('loadMoreHistoryBtn');
    const countElement = document.getElementById('historyResultCount');
    
    if (!loadMore) {
        container.innerHTML = '<div style="text-align:center;padding:20px;color:#666">読み込み中...</div>';
        historyState.lastDoc = null;
        historyState.lastTimestamp = null;
    }
    
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
        
        // メンバーフィルター
        if (historyState.currentFilters.member !== 'all') {
            query = query.where('eventData.member', '==', historyState.currentFilters.member);
        }
        
        // アクションフィルター
        if (historyState.currentFilters.action !== 'all') {
            query = query.where('action', '==', historyState.currentFilters.action);
        }
        
        // ページネーション
        if (loadMore && historyState.lastDoc) {
            query = query.startAfter(historyState.lastDoc);
        }
        
        query = query.limit(10);
        
        const snapshot = await query.get();
        
        console.log(`📊 Read count: ${snapshot.size} documents`);
        
        if (snapshot.empty) {
            if (!loadMore) {
                container.innerHTML = '<div style="text-align:center;padding:40px;color:#999">📭 履歴がありません</div>';
                countElement.textContent = '0';
            }
            historyState.hasMore = false;
            loadMoreBtn.style.display = 'none';
            return;
        }
        
        // 最後のドキュメントとタイムスタンプを保存
        historyState.lastDoc = snapshot.docs[snapshot.docs.length - 1];
        historyState.hasMore = snapshot.size === 10;
        
        // 最新のタイムスタンプを保存
        const firstLog = snapshot.docs[0].data();
        const firstTimestamp = firstLog.timestamp?.toDate ? firstLog.timestamp.toDate() : new Date(firstLog.timestamp);
        if (!historyState.lastTimestamp || firstTimestamp > historyState.lastTimestamp) {
            historyState.lastTimestamp = firstTimestamp;
        }
        
        // HTMLを生成
        let html = '';
        if (!loadMore) {
            html = ''; // リセット
        }
        
        snapshot.forEach(doc => {
            const log = doc.data();
            html += generateHistoryLogHTML(log, doc.id);
        });
        
        if (loadMore) {
            container.innerHTML += html;
        } else {
            container.innerHTML = html;
        }
        
        // 件数を更新
        const currentCount = container.querySelectorAll('.history-log-item').length;
        countElement.textContent = currentCount;
        
        // 「さらに読み込む」ボタンの表示/非表示
        loadMoreBtn.style.display = historyState.hasMore ? 'block' : 'none';
        
        // キャッシュに保存
        const cacheKey = getCacheKey();
        historyState.cache.set(cacheKey, {
            html: container.innerHTML,
            count: currentCount,
            lastDoc: historyState.lastDoc,
            hasMore: historyState.hasMore,
            lastTimestamp: historyState.lastTimestamp
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
        <div class="history-log-item" style="border-left:4px solid ${actionColor};background:#fff;padding:12px;margin-bottom:12px;border-radius:4px;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
                <div>
                    <span style="font-size:18px;margin-right:6px">${actionIcon}</span>
                    <span style="font-weight:600;color:${actionColor};font-size:14px">${actionText}</span>
                </div>
                <div style="font-size:12px;color:#999">${timeStr}</div>
            </div>
            <div style="font-size:13px;color:#333;line-height:1.6">
                <div><strong>患者:</strong> ${log.eventData?.memberName || '不明'}</div>
                <div><strong>担当:</strong> ${memberName}</div>
                <div><strong>日付:</strong> ${log.eventData?.date || '不明'}</div>
                <div><strong>時間:</strong> ${log.eventData?.time || log.eventData?.startTime || '範囲'}</div>
                <div><strong>種類:</strong> ${getTypeLabel(log.eventData?.type)}</div>
            </div>
            ${changesHTML}
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
function applyHistoryFilters() {
    // フィルター値を取得
    historyState.currentFilters.dateRange = document.getElementById('historyDateRange').value;
    historyState.currentFilters.member = document.getElementById('historyMemberFilter').value;
    historyState.currentFilters.action = document.getElementById('historyActionFilter').value;
    
    // リアルタイムリスナーを再起動
    stopRealtimeListener();
    
    // キャッシュがあれば表示、なければ読み込み
    const cacheKey = getCacheKey();
    if (historyState.cache.has(cacheKey)) {
        console.log('📦 Loading filtered results from cache (0 reads)');
        displayCachedHistory(cacheKey);
    } else {
        console.log('🔄 Loading filtered results from Firestore');
        historyState.lastDoc = null;
        historyState.hasMore = true;
        loadHistoryLogs();
    }
    
    // リアルタイムリスナーを開始
    startRealtimeListener();
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

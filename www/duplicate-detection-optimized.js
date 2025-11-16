// ===== 既存の重複予定を視覚的に表示する機能（読み取り最適化版） =====

/**
 * 読み取り数の最適化:
 * 1. 既にキャッシュされている週のデータのみを使用
 * 2. 追加のFirestoreクエリは実行しない
 * 3. アプリのメモリ内データ（app.weekCache）から重複を検出
 */

// === メイン機能: キャッシュから重複予定をチェック ===
function findDuplicatesFromCache() {
    if (!app || !app.weekCache) {
        app.showNotification('アプリが初期化されていません', 'error');
        return;
    }
    
    showLoading('重複予定をチェック中...');
    
    try {
        console.log('=== Duplicate Check from Cache (No reads) ===');
        
        // キャッシュされている全週のイベントを取得
        const allEvents = [];
        let weekCount = 0;
        
        app.weekCache.forEach((weekEvents, weekKey) => {
            allEvents.push(...weekEvents);
            weekCount++;
        });
        
        console.log(`Checking ${allEvents.length} events from ${weekCount} cached weeks`);
        console.log(`📊 読み取り数: 0回（キャッシュのみ使用）`);
        
        if (allEvents.length === 0) {
            hideLoading();
            app.showNotification('キャッシュにデータがありません。週を移動してデータを読み込んでください', 'info');
            return;
        }
        
        // イベントを日付×メンバーでグループ化
        const eventsByDateAndMember = new Map();
        
        allEvents.forEach(event => {
            // 時間情報がないイベントはスキップ
            if (!event.time && event.type !== 'day' && event.type !== 'meeting') {
                return;
            }
            
            const key = `${event.date}_${event.member}`;
            if (!eventsByDateAndMember.has(key)) {
                eventsByDateAndMember.set(key, []);
            }
            eventsByDateAndMember.get(key).push(event);
        });
        
        console.log(`Grouped into ${eventsByDateAndMember.size} date-member combinations`);
        
        // 重複を検出
        const duplicates = [];
        
        eventsByDateAndMember.forEach((events, key) => {
            if (events.length < 2) return;
            
            // 時間順にソート
            events.sort((a, b) => {
                const timeA = a.time || a.startTime || '00:00';
                const timeB = b.time || b.startTime || '00:00';
                return timeA.localeCompare(timeB);
            });
            
            // 重複をチェック
            for (let i = 0; i < events.length; i++) {
                const event1 = events[i];
                const time1 = event1.time || event1.startTime;
                if (!time1) continue;
                
                const [hour1, min1] = time1.split(':').map(Number);
                const start1 = hour1 * 60 + min1;
                const duration1 = getDuration(event1.type);
                const end1 = start1 + duration1;
                
                for (let j = i + 1; j < events.length; j++) {
                    const event2 = events[j];
                    const time2 = event2.time || event2.startTime;
                    if (!time2) continue;
                    
                    const [hour2, min2] = time2.split(':').map(Number);
                    const start2 = hour2 * 60 + min2;
                    const duration2 = getDuration(event2.type);
                    const end2 = start2 + duration2;
                    
                    // 時間の重複をチェック
                    const hasOverlap = (start1 < end2) && (end1 > start2);
                    
                    if (hasOverlap) {
                        duplicates.push({
                            date: event1.date,
                            member: event1.member,
                            events: [
                                {
                                    ...event1,
                                    startMinutes: start1,
                                    endMinutes: end1,
                                    timeRange: `${time1} - ${formatMinutes(end1)}`
                                },
                                {
                                    ...event2,
                                    startMinutes: start2,
                                    endMinutes: end2,
                                    timeRange: `${time2} - ${formatMinutes(end2)}`
                                }
                            ]
                        });
                    }
                }
            }
        });
        
        console.log(`Found ${duplicates.length} duplicate conflicts`);
        
        hideLoading();
        
        if (duplicates.length === 0) {
            app.showNotification('✅ キャッシュ内で重複している予定は見つかりませんでした', 'success');
            return;
        }
        
        // モーダルで表示
        displayDuplicatesModal(duplicates, weekCount);
        
    } catch (error) {
        console.error('Duplicate check error:', error);
        hideLoading();
        app.showNotification('重複チェックに失敗しました: ' + error.message, 'error');
    }
}

// === ヘルパー関数 ===

function getDuration(type) {
    switch(type) {
        case '40min':
        case 'workinjury40':
        case 'visit':
            return 40;
        case '60min':
            return 60;
        case 'day':
        case 'meeting':
            return 0;
        case '20min':
        case 'workinjury20':
        case 'accident':
        default:
            return 20;
    }
}

function formatMinutes(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}:${minutes.toString().padStart(2, '0')}`;
}

function getTypeLabel(type) {
    const typeLabels = {
        '20min': '20分', '40min': '40分', '60min': '60分',
        'visit': '訪問', 'workinjury20': '労災20', 'workinjury40': '労災40',
        'accident': '事故', 'day': 'デイ', 'meeting': '担会', 'other': 'その他'
    };
    return typeLabels[type] || type;
}

// === モーダル表示 ===

function displayDuplicatesModal(duplicates, weekCount) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.style.zIndex = '10001';
    modal.id = 'duplicatesModal';
    modal.style.transition = 'opacity 0.2s';
    modal.style.opacity = '0';
    
    // 重複リストHTML
    let duplicatesHTML = '';
    duplicates.forEach((dup, index) => {
        const memberName = app.teamMembers.find(m => m.id === dup.member)?.displayName || dup.member;
        
        let eventsHTML = '';
        dup.events.forEach(event => {
            const displayName = event.displayName || `${event.surname || ''}${event.firstname || ''}`;
            const typeLabel = getTypeLabel(event.type);
            
            eventsHTML += `
                <div style="padding:10px;margin:5px 0;background:#fff;border-left:3px solid #f44336;border-radius:4px">
                    <div style="font-weight:600;color:#333;margin-bottom:5px">
                        👤 ${displayName}
                    </div>
                    <div style="font-size:13px;color:#666">
                        ⏰ ${event.timeRange} (${typeLabel})
                    </div>
                </div>
            `;
        });
        
        duplicatesHTML += `
            <div style="background:#ffebee;padding:15px;margin-bottom:15px;border-radius:8px;border:2px solid #f44336">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                    <div>
                        <div style="font-weight:600;font-size:15px;color:#c62828">
                            ⚠️ 重複 ${index + 1}
                        </div>
                        <div style="font-size:13px;color:#666;margin-top:5px">
                            📅 ${dup.date} - ${memberName}
                        </div>
                    </div>
                    <button class="action-btn" onclick="jumpToDate('${dup.date}')" 
                            style="padding:6px 12px;font-size:12px;white-space:nowrap">
                        📅 表示
                    </button>
                </div>
                <div style="background:#fff;padding:10px;border-radius:4px">
                    ${eventsHTML}
                </div>
            </div>
        `;
    });
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width:700px;max-height:80vh">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
                <h2 class="modal-header" style="margin:0;color:#c62828">⚠️ 重複している予定</h2>
                <button onclick="closeDuplicatesModal()" style="background:none;border:none;font-size:24px;cursor:pointer;color:#666;line-height:1">×</button>
            </div>
            
            <div style="background:#e3f2fd;border-left:4px solid #2196f3;padding:15px;margin-bottom:15px;border-radius:4px">
                <div style="font-weight:600;color:#1976d2;margin-bottom:8px">
                    📊 読み取り数: 0回
                </div>
                <div style="font-size:13px;color:#666;line-height:1.6">
                    キャッシュされている${weekCount}週分のデータから検出しました。<br>
                    追加のFirestoreクエリは実行していません。
                </div>
            </div>
            
            <div style="background:#fff3e0;border-left:4px solid #ff9800;padding:15px;margin-bottom:20px;border-radius:4px">
                <div style="font-weight:600;color:#f57c00;margin-bottom:8px">
                    ${duplicates.length}件の重複が見つかりました
                </div>
                <div style="font-size:13px;color:#666;line-height:1.6">
                    同じ時間枠に複数の予定が入力されています。<br>
                    必要に応じて調整してください。
                </div>
            </div>
            
            <div style="max-height:400px;overflow-y:auto;margin-bottom:20px">
                ${duplicatesHTML}
            </div>
            
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
                <div style="font-size:12px;color:#666">
                    💡 ヒント: 「表示」ボタンで該当日にジャンプします
                </div>
                <button class="action-btn secondary" onclick="closeDuplicatesModal()">
                    閉じる
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // フェードインアニメーション
    setTimeout(() => {
        modal.style.opacity = '1';
    }, 10);
}

function closeDuplicatesModal() {
    const modal = document.getElementById('duplicatesModal');
    if (modal) {
        // フェードアウトアニメーション
        modal.style.opacity = '0';
        setTimeout(() => {
            if (modal.parentNode) {
                document.body.removeChild(modal);
            }
        }, 200);
    }
}

function jumpToDate(dateStr) {
    // モーダルを閉じる
    closeDuplicatesModal();
    
    // 少し待ってからジャンプ（モーダルが完全に閉じるのを待つ）
    setTimeout(() => {
        try {
            const targetDate = new Date(dateStr);
            const monday = app.getMondayOfWeek(targetDate);
            app.currentStartDate = monday;
            app.currentWeekKey = app.getWeekKey(monday);
            
            // 週のデータをロード
            app.createWeekListenerIfNeeded(app.currentWeekKey).then(() => {
                app.updateCurrentWeekEvents();
                app.renderTable();
                app.updateWeekDisplay();
                app.updatePrevWeekButton();
                app.updateNextWeekButton();
                
                // ハイライト
                highlightDateColumn(dateStr);
                
                app.showNotification(`${dateStr}にジャンプしました`, 'info');
            }).catch(error => {
                console.error('Jump to date error:', error);
                app.showNotification('ジャンプに失敗しました', 'error');
            });
        } catch (error) {
            console.error('Date parsing error:', error);
            app.showNotification('日付の解析に失敗しました', 'error');
        }
    }, 100);
}

function highlightDateColumn(dateStr) {
    setTimeout(() => {
        const cells = document.querySelectorAll(`td[data-date="${dateStr}"]`);
        cells.forEach(cell => {
            cell.style.transition = 'background-color 0.3s';
            cell.style.backgroundColor = '#fff3e0';
            
            setTimeout(() => {
                cell.style.backgroundColor = '';
            }, 3000);
        });
    }, 100);
}

// === 自動ハイライト機能（オプション） ===

function highlightDuplicatesInTable() {
    if (!app || !app.events) return;
    
    const eventsByCell = new Map();
    
    app.events.forEach(event => {
        if (!event.time) return;
        
        const [hour, min] = event.time.split(':').map(Number);
        const start = hour * 60 + min;
        const duration = getDuration(event.type);
        const end = start + duration;
        
        const key = `${event.date}_${event.member}`;
        if (!eventsByCell.has(key)) {
            eventsByCell.set(key, []);
        }
        eventsByCell.get(key).push({...event, start, end});
    });
    
    // 各セルで重複をチェック
    eventsByCell.forEach((events, key) => {
        if (events.length < 2) return;
        
        for (let i = 0; i < events.length; i++) {
            for (let j = i + 1; j < events.length; j++) {
                const hasOverlap = (events[i].start < events[j].end) && (events[i].end > events[j].start);
                
                if (hasOverlap) {
                    // 重複している全イベントをハイライト
                    [events[i], events[j]].forEach(event => {
                        const cell = document.querySelector(
                            `td[data-date="${event.date}"][data-member="${event.member}"][data-time="${event.time}"]`
                        );
                        if (cell) {
                            cell.classList.add('has-duplicate');
                            cell.style.borderLeft = '3px solid #f44336';
                            cell.title = `⚠️ この時間枠に複数の予定があります`;
                        }
                    });
                }
            }
        }
    });
}

console.log('✅ Duplicate detection feature loaded (cache-only, 0 reads)');

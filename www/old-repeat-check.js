// ===== 古い繰り返し予定チェック機能 =====

/**
 * 機能:
 * 1. repeatPatternが無い古い繰り返し予定を検出
 * 2. repeatParentでグループ化
 * 3. 日付間隔から繰り返しパターンを推測
 * 4. 親データの有無を確認
 * 5. 削除して再登録する機能
 */

// モーダルを開く
async function openOldRepeatCheckModal() {
    showLoading('古い繰り返し予定をチェック中...');
    
    try {
        // repeatParentがあるが、repeatPatternが無いイベントを検索
        const snapshot = await db.collection('events')
            .where('repeatParent', '!=', null)
            .get();
        
        const oldRepeats = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            if (!data.repeatPattern) {
                oldRepeats.push({id: doc.id, ...data});
            }
        });
        
        console.log(`Found ${oldRepeats.length} old repeat events without repeatPattern`);
        
        if (oldRepeats.length === 0) {
            hideLoading();
            app.showNotification('古い繰り返し予定は見つかりませんでした', 'success');
            return;
        }
        
        // グループ化して分析
        const groups = await analyzeOldRepeats(oldRepeats);
        
        hideLoading();
        
        // モーダルを表示
        displayOldRepeatModal(groups, oldRepeats.length);
        
    } catch (error) {
        console.error('Old repeat check error:', error);
        hideLoading();
        app.showNotification('チェックに失敗しました', 'error');
    }
}

// 古い繰り返し予定を分析
async function analyzeOldRepeats(oldRepeats) {
    const groups = new Map();
    
    // repeatParentでグループ化
    oldRepeats.forEach(event => {
        const parentId = event.repeatParent;
        if (!groups.has(parentId)) {
            groups.set(parentId, []);
        }
        groups.get(parentId).push(event);
    });
    
    console.log(`Grouped into ${groups.size} repeat groups`);
    
    // 各グループを分析
    const analyzedGroups = [];
    
    for (const [parentId, events] of groups) {
        // 日付順にソート
        events.sort((a, b) => a.date.localeCompare(b.date));
        
        const firstEvent = events[0];
        const lastEvent = events[events.length - 1];
        
        // 繰り返しパターンを推測
        let repeatPattern = '不明';
        let intervalDays = 0;
        
        if (events.length >= 2) {
            const date1 = new Date(events[0].date);
            const date2 = new Date(events[1].date);
            intervalDays = Math.round((date2 - date1) / (1000 * 60 * 60 * 24));
            
            if (intervalDays === 1) repeatPattern = '毎日';
            else if (intervalDays === 7) repeatPattern = '毎週';
            else if (intervalDays === 14) repeatPattern = '隔週';
            else if (intervalDays >= 28 && intervalDays <= 31) repeatPattern = '毎月';
            else repeatPattern = `${intervalDays}日ごと`;
        }
        
        // 親データが存在するかチェック
        let parentExists = false;
        try {
            const parentDoc = await db.collection('events').doc(parentId).get();
            parentExists = parentDoc.exists;
        } catch (error) {
            console.error('Parent check error:', error);
        }
        
        // 曜日を取得
        const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][new Date(firstEvent.date).getDay()];
        
        analyzedGroups.push({
            parentId,
            events,
            firstEvent,
            lastEvent,
            count: events.length,
            repeatPattern,
            intervalDays,
            parentExists,
            dayOfWeek,
            displayName: firstEvent.displayName || `${firstEvent.surname || ''}${firstEvent.firstname || ''}`,
            member: firstEvent.member,
            time: firstEvent.time || firstEvent.startTime,
            type: firstEvent.type
        });
    }
    
    // 最終日が近い順にソート
    analyzedGroups.sort((a, b) => a.lastEvent.date.localeCompare(b.lastEvent.date));
    
    return analyzedGroups;
}

// モーダルを表示
function displayOldRepeatModal(groups, totalCount) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.style.zIndex = '10001';
    modal.id = 'oldRepeatCheckModal';
    
    // グループリストHTML
    let groupsHTML = '';
    groups.forEach((group, index) => {
        const warningIcon = group.parentExists ? '' : '⚠️ ';
        const parentStatus = group.parentExists ? '' : '<span style="color:#f57c00;font-size:12px">親データ削除済み</span>';
        
        // 種類ラベル
        const typeLabels = {
            '20min': '20分', '40min': '40分', '60min': '60分',
            'visit': '訪問', 'workinjury20': '労災20', 'workinjury40': '労災40',
            'accident': '事故', 'day': 'デイ', 'meeting': '担会', 'other': 'その他'
        };
        const typeLabel = typeLabels[group.type] || group.type;
        
        groupsHTML += `
            <div class="old-repeat-group" style="background:white;padding:15px;margin-bottom:10px;border-radius:8px;border:1px solid #ddd">
                <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px">
                    <div style="flex:1">
                        <div style="font-weight:600;font-size:15px;color:#333;margin-bottom:5px">
                            ${warningIcon}📌 ${group.displayName}
                        </div>
                        <div style="font-size:13px;color:#666;line-height:1.6">
                            ${group.repeatPattern} ${group.dayOfWeek}曜 ${group.time} (${typeLabel})
                        </div>
                        <div style="font-size:12px;color:#999;line-height:1.6">
                            ${group.count}件のイベント（${group.firstEvent.date} 〜 ${group.lastEvent.date}）
                        </div>
                        ${parentStatus}
                    </div>
                    <div style="display:flex;flex-direction:column;gap:5px">
                        <button class="action-btn" onclick="showGroupDetails(${index})" 
                                style="padding:6px 12px;font-size:12px;white-space:nowrap">
                            全表示
                        </button>
                        <button class="action-btn primary" onclick="deleteAndRecreate(${index})" 
                                style="padding:6px 12px;font-size:12px;white-space:nowrap">
                            再登録
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width:700px;max-height:80vh">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
                <h2 class="modal-header" style="margin:0">🔍 古い繰り返し予定の確認</h2>
                <button onclick="closeOldRepeatCheckModal()" style="background:none;border:none;font-size:24px;cursor:pointer;color:#666">×</button>
            </div>
            
            <div style="background:#fff3e0;border-left:4px solid #ff9800;padding:15px;margin-bottom:20px;border-radius:4px">
                <div style="font-weight:600;color:#f57c00;margin-bottom:8px">⚠️ 以下の予定は自動生成されません</div>
                <div style="font-size:13px;color:#666;line-height:1.6">
                    これらの予定は古い形式で作成されているため、期限切れ後に新しい予定が自動生成されません。<br>
                    重要な繰り返し予定は、削除して再登録することをおすすめします。
                </div>
            </div>
            
            <div style="margin-bottom:15px;padding:10px;background:#f5f5f5;border-radius:4px">
                <div style="font-weight:600;color:#333">
                    合計: ${groups.length}グループ（${totalCount}件のイベント）
                </div>
            </div>
            
            <div style="max-height:400px;overflow-y:auto;margin-bottom:20px">
                ${groupsHTML}
            </div>
            
            <div style="display:flex;justify-content:flex-end;gap:10px">
                <button class="action-btn secondary" onclick="closeOldRepeatCheckModal()">
                    閉じる
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // グループデータをグローバルに保存
    window.oldRepeatGroups = groups;
}

// モーダルを閉じる
function closeOldRepeatCheckModal() {
    const modal = document.getElementById('oldRepeatCheckModal');
    if (modal) {
        document.body.removeChild(modal);
    }
    window.oldRepeatGroups = null;
}

// グループの詳細を表示
function showGroupDetails(groupIndex) {
    const group = window.oldRepeatGroups[groupIndex];
    
    let eventsHTML = '';
    group.events.forEach(event => {
        eventsHTML += `
            <div style="padding:8px;border-bottom:1px solid #eee;font-size:13px">
                📅 ${event.date} ${event.time || event.startTime || ''} - ${event.displayName || event.surname + event.firstname}
            </div>
        `;
    });
    
    const detailModal = document.createElement('div');
    detailModal.className = 'modal';
    detailModal.style.display = 'flex';
    detailModal.style.zIndex = '10002';
    detailModal.id = 'groupDetailModal';
    
    detailModal.innerHTML = `
        <div class="modal-content" style="max-width:600px">
            <h2 class="modal-header">${group.displayName} の全イベント</h2>
            <div style="margin:20px 0">
                <div style="font-weight:600;margin-bottom:10px">
                    ${group.repeatPattern} ${group.dayOfWeek}曜 ${group.time} - 合計${group.count}件
                </div>
                <div style="max-height:400px;overflow-y:auto;border:1px solid #ddd;border-radius:4px">
                    ${eventsHTML}
                </div>
            </div>
            <div style="display:flex;justify-content:flex-end;gap:10px">
                <button class="action-btn secondary" onclick="closeGroupDetailModal()">閉じる</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(detailModal);
}

// 詳細モーダルを閉じる
function closeGroupDetailModal() {
    const modal = document.getElementById('groupDetailModal');
    if (modal) {
        document.body.removeChild(modal);
    }
}

// 削除して再登録
async function deleteAndRecreate(groupIndex) {
    const group = window.oldRepeatGroups[groupIndex];
    
    const confirmMsg = `以下の繰り返し予定を削除して再登録しますか？\n\n` +
        `${group.displayName}\n` +
        `${group.repeatPattern} ${group.dayOfWeek}曜 ${group.time}\n` +
        `${group.count}件のイベントが削除されます\n\n` +
        `削除後、予約モーダルが開きますので、同じ内容で新規登録してください。`;
    
    if (!confirm(confirmMsg)) return;
    
    showLoading(`${group.count}件の予定を削除中...`);
    
    try {
        // すべてのイベントを削除
        const batch = db.batch();
        group.events.forEach(event => {
            const ref = db.collection('events').doc(event.id);
            batch.delete(ref);
        });
        
        await batch.commit();
        console.log(`Deleted ${group.count} events from group ${group.parentId}`);
        
        hideLoading();
        app.showNotification(`${group.count}件の予定を削除しました`, 'success');
        
        // ⭐ モーダルは閉じない（開いたままにする）
        // closeOldRepeatCheckModal(); ← コメントアウト
        if (document.getElementById('groupDetailModal')) {
            closeGroupDetailModal();
        }
        
        // グループリストから削除したグループを除外して再表示
        window.oldRepeatGroups.splice(groupIndex, 1);
        
        // グループが残っている場合は再表示、0になったら閉じる
        if (window.oldRepeatGroups.length > 0) {
            // 合計件数を再計算
            const totalCount = window.oldRepeatGroups.reduce((sum, g) => sum + g.count, 0);
            
            // モーダルを再描画
            const modal = document.getElementById('oldRepeatCheckModal');
            if (modal) {
                document.body.removeChild(modal);
            }
            displayOldRepeatModal(window.oldRepeatGroups, totalCount);
        } else {
            closeOldRepeatCheckModal();
            app.showNotification('すべての古い繰り返し予定を処理しました', 'success');
        }
        
        // 少し待ってから予約モーダルを開く
        setTimeout(() => {
            // 最初のイベントの情報で予約モーダルを開く
            const firstEvent = group.firstEvent;
            app.openModal(firstEvent.member, firstEvent.date, firstEvent.time || firstEvent.startTime);
            
            // フォームに値を設定
            setTimeout(() => {
                if (firstEvent.surname) {
                    document.getElementById('surnameInput').value = firstEvent.surname;
                }
                if (firstEvent.firstname) {
                    document.getElementById('firstnameInput').value = firstEvent.firstname;
                }
                
                // 種類を選択
                const typeOption = document.querySelector(`.type-option[data-type="${firstEvent.type}"]`);
                if (typeOption) {
                    typeOption.click();
                }
                
                // 繰り返しを推測して設定
                const repeatSelect = document.getElementById('repeatSelect');
                if (repeatSelect) {
                    let repeatValue = 'none';
                    if (group.intervalDays === 1) repeatValue = 'daily';
                    else if (group.intervalDays === 7) repeatValue = 'weekly';
                    else if (group.intervalDays === 14) repeatValue = 'biweekly1';
                    
                    repeatSelect.value = repeatValue;
                }
                
                app.showNotification('同じ内容で新規登録してください', 'info');
            }, 300);
        }, 500);
        
    } catch (error) {
        console.error('Delete and recreate error:', error);
        hideLoading();
        app.showNotification('削除に失敗しました', 'error');
    }
}

console.log('✅ Old repeat check feature loaded');

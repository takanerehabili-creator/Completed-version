// 削除できない予定の管理機能（修正版）

let troubleSearchResults = [];

// 予定を検索
window.searchTroubleEvents = async function() {
    const staff = document.getElementById('troubleDeleteStaff').value;
    const date = document.getElementById('troubleDeleteDate').value;
    const name = document.getElementById('troubleDeleteName').value.trim();
    
    if (!staff && !date && !name) {
        app.showNotification('検索条件を1つ以上指定してください', 'error');
        return;
    }
    
    showLoading('予定を検索中...');
    
    try {
        // Firestoreから検索
        let query = db.collection('events');
        
        if (staff) {
            query = query.where('member', '==', staff);
        }
        if (date) {
            query = query.where('date', '==', date);
        }
        
        const snapshot = await query.get();
        troubleSearchResults = [];
        
        snapshot.forEach(doc => {
            const data = doc.data();
            const fullName = (data.surname || '') + (data.firstname || '');
            
            // 名前フィルタ
            if (name && !fullName.includes(name)) {
                return;
            }
            
            troubleSearchResults.push({
                id: doc.id,
                ...data
            });
        });
        
        // 結果を表示
        displayTroubleResults();
        hideLoading();
        
    } catch (error) {
        console.error('検索エラー:', error);
        app.showNotification('検索に失敗しました', 'error');
        hideLoading();
    }
};

// 検索結果を表示
function displayTroubleResults() {
    const resultsDiv = document.getElementById('troubleEventResults');
    const countSpan = document.getElementById('troubleResultCount');
    const listDiv = document.getElementById('troubleEventList');
    const deleteAllBtn = document.getElementById('deleteAllBtn');
    
    countSpan.textContent = `検索結果: ${troubleSearchResults.length}件`;
    
    if (troubleSearchResults.length === 0) {
        resultsDiv.style.display = 'block';
        listDiv.innerHTML = '<p style="color:#666;text-align:center;padding:20px">該当する予定が見つかりませんでした</p>';
        deleteAllBtn.style.display = 'none';
        return;
    }
    
    resultsDiv.style.display = 'block';
    deleteAllBtn.style.display = 'inline-block';
    
    let html = '';
    troubleSearchResults.forEach((event, index) => {
        const fullName = (event.surname || '') + (event.firstname || '');
        const time = event.time || event.startTime || '';
        const displayName = fullName || event.displayName || '-';
        
        html += `
            <div style="background:white;padding:12px;margin-bottom:8px;border-radius:6px;border:1px solid #ddd">
                <div style="display:flex;justify-content:space-between;align-items:start">
                    <div style="flex:1">
                        <div style="font-weight:600;color:#333;margin-bottom:5px">
                            ${displayName} (${event.member})
                        </div>
                        <div style="font-size:13px;color:#666">
                            📅 ${event.date} ${time ? '⏰ ' + time : ''}
                        </div>
                        <div style="font-size:12px;color:#999;margin-top:3px">
                            種類: ${getTypeLabel(event.type)} 
                            ${event.repeat && event.repeat !== 'none' ? '| 繰り返し: ' + getRepeatLabel(event.repeat) : ''}
                        </div>
                        ${event.repeatParent ? `<div style="font-size:11px;color:#f57c00;margin-top:2px">親ID: ${event.repeatParent}</div>` : ''}
                    </div>
                    <button class="action-btn danger" onclick="deleteTroubleEvent(${index})" 
                            style="margin-left:10px;padding:6px 12px;font-size:12px">削除</button>
                </div>
            </div>
        `;
    });
    
    listDiv.innerHTML = html;
}

// 種類ラベル
function getTypeLabel(type) {
    const labels = {
        '20min': '20分',
        '40min': '40分',
        '60min': '60分',
        'visit': '訪問',
        'workinjury20': '労災20分',
        'workinjury40': '労災40分',
        'accident': '事故',
        'day': 'デイ',
        'meeting': '担会',
        'other': 'その他'
    };
    return labels[type] || type;
}

// 繰り返しラベル
function getRepeatLabel(repeat) {
    const labels = {
        'weekly': '毎週',
        'biweekly1': '隔週(1週間おき)',
        'biweekly2': '隔週(2週間おき)',
        'daily': '毎日',
        'monthly': '毎月'
    };
    return labels[repeat] || repeat;
}

// 削除後のリフレッシュ処理
async function refreshAfterDelete() {
    console.log('=== 削除後のリフレッシュ開始 ===');
    
    // キャッシュクリア
    app.weekCache.clear();
    app.loadedWeeks.clear();
    
    // 現在の週のキーを取得
    const weekKey = app.getWeekKey(app.currentWeekStart);
    console.log('Current week key:', weekKey);
    
    // 週リスナーを再設定
    console.log('週リスナーを再設定中...');
    await app.setupWeekListener(weekKey);
    
    // テーブルを再描画
    if (app.tableReadyForDisplay) {
        console.log('テーブルを再描画中...');
        app.renderTable();
    }
    
    console.log('=== リフレッシュ完了 ===');
}

// 個別削除
window.deleteTroubleEvent = async function(index) {
    const event = troubleSearchResults[index];
    
    const confirmMsg = `以下の予定を削除しますか？\n\n` +
        `名前: ${event.surname || ''}${event.firstname || ''}\n` +
        `日付: ${event.date}\n` +
        `時間: ${event.time || event.startTime || ''}\n\n` +
        `※親イベントの場合、すべての繰り返しも削除されます`;
    
    if (!confirm(confirmMsg)) return;
    
    showLoading('削除中...');
    
    try {
        // Firestoreから削除
        await db.collection('events').doc(event.id).delete();
        console.log('✅ Firestoreから削除:', event.id);
        
        // 子イベントも削除
        if (event.repeat && event.repeat !== 'none') {
            const childEvents = await db.collection('events')
                .where('repeatParent', '==', event.id)
                .get();
            
            const batch = db.batch();
            childEvents.forEach(doc => {
                batch.delete(doc.ref);
                console.log('子イベント削除予定:', doc.id);
            });
            await batch.commit();
            console.log('✅ 子イベント削除完了');
        }
        
        // ローカルキャッシュから削除
        app.events = app.events.filter(e => e.id !== event.id && e.repeatParent !== event.id);
        console.log('✅ ローカルキャッシュから削除');
        
        // 検索結果から削除
        troubleSearchResults.splice(index, 1);
        displayTroubleResults();
        
        // リフレッシュ
        await refreshAfterDelete();
        
        hideLoading();
        app.showNotification('削除しました', 'success');
        
    } catch (error) {
        console.error('削除エラー:', error);
        app.showNotification('削除に失敗しました', 'error');
        hideLoading();
    }
};

// すべて削除
window.deleteAllTroubleEvents = async function() {
    if (troubleSearchResults.length === 0) return;
    
    const confirmMsg = `検索結果の${troubleSearchResults.length}件すべてを削除しますか？\n\n` +
        `※この操作は取り消せません\n※親イベントの場合、すべての繰り返しも削除されます`;
    
    if (!confirm(confirmMsg)) return;
    
    showLoading(`${troubleSearchResults.length}件を削除中...`);
    
    try {
        const batch = db.batch();
        const parentIds = new Set();
        
        // すべてのイベントを削除
        for (const event of troubleSearchResults) {
            const ref = db.collection('events').doc(event.id);
            batch.delete(ref);
            console.log('削除予定:', event.id);
            
            if (event.repeat && event.repeat !== 'none') {
                parentIds.add(event.id);
            }
        }
        
        await batch.commit();
        console.log('✅ 親イベント削除完了');
        
        // 子イベントも削除
        if (parentIds.size > 0) {
            const childBatch = db.batch();
            for (const parentId of parentIds) {
                const childEvents = await db.collection('events')
                    .where('repeatParent', '==', parentId)
                    .get();
                
                childEvents.forEach(doc => {
                    childBatch.delete(doc.ref);
                });
            }
            await childBatch.commit();
            console.log('✅ 子イベント削除完了');
        }
        
        // ローカルキャッシュから削除
        const deletedIds = new Set(troubleSearchResults.map(e => e.id));
        app.events = app.events.filter(e => !deletedIds.has(e.id) && !deletedIds.has(e.repeatParent));
        console.log('✅ ローカルキャッシュから削除');
        
        // 結果をクリア
        troubleSearchResults = [];
        displayTroubleResults();
        
        // リフレッシュ
        await refreshAfterDelete();
        
        hideLoading();
        app.showNotification('すべて削除しました', 'success');
        
    } catch (error) {
        console.error('一括削除エラー:', error);
        app.showNotification('削除に失敗しました', 'error');
        hideLoading();
    }
};

console.log('✅ Trouble delete functions loaded');

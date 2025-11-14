// ===== 改善された削除機能 =====

/**
 * 要件:
 * 1. 「この予定のみ削除」: 親イベントを削除しても子イベントは残り、繰り返し設定も維持
 * 2. 「この日以降を削除」: 削除実行日以降のすべての関連イベントを削除、それより前は維持
 */

// 「この予定のみ削除」の改善版
FirebaseScheduleManager.prototype.deleteEventOnly = async function(id) {
    const event = this.events.find(e => e.id === id);
    if (!event) {
        this.showNotification('予定が見つかりません', 'error');
        return;
    }
    
    const isParent = event.repeat && event.repeat !== 'none';
    const hasChildren = this.events.some(e => e.repeatParent === id);
    
    let confirmMsg = `この予定を削除しますか？\n\n`;
    confirmMsg += `${event.displayName || event.surname + event.firstname}\n`;
    confirmMsg += `${event.date} ${event.time || event.startTime || ''}\n\n`;
    
    if (isParent || hasChildren) {
        confirmMsg += `⚠️ この予定は繰り返し設定の親です。\n`;
        confirmMsg += `この予定のみを削除し、他の繰り返しは維持されます。\n`;
        confirmMsg += `繰り返し設定も引き続き有効です。`;
    }
    
    if (!confirm(confirmMsg)) return;
    
    showLoading('削除中...');
    updateSyncStatus('syncing');
    
    try {
        // Firestoreから削除
        await db.collection('events').doc(id).delete();
        console.log(`✅ Deleted event: ${id}`);
        
        // 親イベントを削除した場合、子イベントにrepeatPatternが保存されているので
        // 自動生成は継続される（何もしなくてOK）
        
        // ローカルキャッシュから該当イベントのみ削除（子イベントは残す）
        const eventIndex = this.events.findIndex(e => e.id === id);
        if (eventIndex !== -1) {
            this.events.splice(eventIndex, 1);
        }
        
        // 全週キャッシュから該当イベントのみ削除
        this.weekCache.forEach((weekEvents, weekKey) => {
            const index = weekEvents.findIndex(e => e.id === id);
            if (index !== -1) {
                weekEvents.splice(index, 1);
                this.weekCache.set(weekKey, weekEvents);
            }
        });
        
        // ⭐ 削除されたIDをトラッキング（リスナーからの復活を防ぐ）
        if (!this.deletedEventIds) {
            this.deletedEventIds = new Set();
        }
        this.deletedEventIds.add(id);
        
        // 5秒後にトラッキングをクリア（リスナーが安定するまで）
        setTimeout(() => {
            if (this.deletedEventIds) {
                this.deletedEventIds.delete(id);
            }
        }, 5000);
        
        // テーブル再描画
        this.renderTable();
        
        hideLoading();
        updateSyncStatus('synced');
        this.showNotification('予定を削除しました', 'success');
        
    } catch (error) {
        console.error('Delete event only error:', error);
        hideLoading();
        updateSyncStatus('error');
        this.showNotification('削除に失敗しました', 'error');
    }
};

// 「この日以降を削除」の改善版（インデックス不要）
FirebaseScheduleManager.prototype.deleteFromDateImproved = async function(id) {
    const event = this.events.find(e => e.id === id);
    if (!event) {
        this.showNotification('予定が見つかりません', 'error');
        return;
    }
    
    const cutoffDate = event.date;
    const parentId = event.repeatParent || id;
    
    // ⭐ ローカルキャッシュから削除対象を検索（インデックス不要）
    const previewEvents = this.events.filter(e => {
        // 同じ親IDを持つイベント、または親イベント自身
        const isSameGroup = (e.id === parentId || e.repeatParent === parentId);
        // cutoffDate以降のイベント
        const isAfterCutoff = e.date >= cutoffDate;
        return isSameGroup && isAfterCutoff;
    });
    
    if (previewEvents.length === 0) {
        this.showNotification('削除対象の予定が見つかりませんでした', 'info');
        return;
    }
    
    // 確認メッセージ
    let confirmMsg = `${cutoffDate}以降の繰り返し予定を削除しますか？\n\n`;
    confirmMsg += `削除される予定: ${previewEvents.length}件\n`;
    confirmMsg += `${cutoffDate}より前の予定は維持されます\n\n`;
    confirmMsg += `この操作は取り消せません。`;
    
    if (!confirm(confirmMsg)) return;
    
    showLoading(`${previewEvents.length}件の予定を削除中...`);
    updateSyncStatus('syncing');
    
    try {
        // バッチ削除（Firestoreから直接削除）
        const deletedIds = new Set();
        
        for (let i = 0; i < previewEvents.length; i += 500) {
            const batch = db.batch();
            const batchEvents = previewEvents.slice(i, i + 500);
            
            batchEvents.forEach(evt => {
                const ref = db.collection('events').doc(evt.id);
                batch.delete(ref);
                deletedIds.add(evt.id);
            });
            
            await batch.commit();
            console.log(`Batch ${Math.floor(i/500) + 1} committed: ${batchEvents.length} events`);
        }
        
        console.log(`✅ Deleted ${deletedIds.size} events from ${cutoffDate}`);
        
        // ローカルキャッシュから削除（正確に削除IDのみ）
        this.events = this.events.filter(e => !deletedIds.has(e.id));
        
        // 全週キャッシュから削除
        this.weekCache.forEach((weekEvents, weekKey) => {
            const filtered = weekEvents.filter(e => !deletedIds.has(e.id));
            this.weekCache.set(weekKey, filtered);
        });
        
        // 削除されたIDをトラッキング（リスナーからの復活を防ぐ）
        if (!this.deletedEventIds) {
            this.deletedEventIds = new Set();
        }
        deletedIds.forEach(id => this.deletedEventIds.add(id));
        
        // 5秒後にトラッキングをクリア（リスナーが安定するまで）
        setTimeout(() => {
            deletedIds.forEach(id => {
                if (this.deletedEventIds) {
                    this.deletedEventIds.delete(id);
                }
            });
        }, 5000);
        
        // テーブル再描画
        this.renderTable();
        
        hideLoading();
        updateSyncStatus('synced');
        this.showNotification(`${cutoffDate}以降の予定を削除しました（${deletedIds.size}件）`, 'success');
        
    } catch (error) {
        console.error('Delete from date error:', error);
        hideLoading();
        updateSyncStatus('error');
        this.showNotification('削除に失敗しました', 'error');
    }
};

// 削除モーダルを表示（選択肢を提供）
FirebaseScheduleManager.prototype.showDeleteModal = function(id) {
    const event = this.events.find(e => e.id === id);
    if (!event) return;
    
    const isRepeating = (event.repeat && event.repeat !== 'none') || 
                        event.repeatParent || 
                        this.events.some(e => e.repeatParent === id);
    
    if (!isRepeating) {
        // 単発予約の場合は直接削除
        this.deleteEventOnly(id);
        return;
    }
    
    // 繰り返しイベントの場合、選択肢を表示
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.style.zIndex = '10001';
    
    const eventName = event.displayName || (event.surname + event.firstname) || '予定';
    const eventDate = event.date;
    const eventTime = event.time || event.startTime || '';
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width:500px">
            <h2 class="modal-header" style="color:#d32f2f">繰り返し予定の削除</h2>
            <div style="margin:20px 0">
                <div style="background:#f5f5f5;padding:15px;border-radius:8px;margin-bottom:20px">
                    <div style="font-weight:600;font-size:16px;margin-bottom:5px">${eventName}</div>
                    <div style="font-size:14px;color:#666">📅 ${eventDate} ${eventTime ? '⏰ ' + eventTime : ''}</div>
                </div>
                
                <p style="font-weight:600;margin-bottom:15px;font-size:15px">削除方法を選択してください:</p>
                
                <div style="display:flex;flex-direction:column;gap:12px">
                    <button class="action-btn" id="deleteOnlyBtn" 
                            style="padding:15px;text-align:left;background:white;border:2px solid #2196f3;color:#2196f3">
                        <div style="font-weight:600;margin-bottom:5px">📌 この予定のみ削除</div>
                        <div style="font-size:12px;opacity:0.8">他の繰り返し予定は維持され、自動生成も継続します</div>
                    </button>
                    
                    <button class="action-btn danger" id="deleteFromBtn" 
                            style="padding:15px;text-align:left">
                        <div style="font-weight:600;margin-bottom:5px">🗑️ この日以降を削除</div>
                        <div style="font-size:12px;opacity:0.8">${eventDate}以降のすべての繰り返し予定を削除</div>
                    </button>
                    
                    <button class="action-btn secondary" id="cancelDeleteBtn" 
                            style="padding:12px">
                        キャンセル
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const deleteOnlyBtn = modal.querySelector('#deleteOnlyBtn');
    const deleteFromBtn = modal.querySelector('#deleteFromBtn');
    const cancelBtn = modal.querySelector('#cancelDeleteBtn');
    
    const cleanup = () => {
        document.body.removeChild(modal);
    };
    
    deleteOnlyBtn.onclick = () => {
        cleanup();
        this.deleteEventOnly(id);
    };
    
    deleteFromBtn.onclick = () => {
        cleanup();
        this.deleteFromDateImproved(id);
    };
    
    cancelBtn.onclick = () => {
        cleanup();
    };
};

// 既存のdeleteEvent関数を保存
const originalDeleteEvent = FirebaseScheduleManager.prototype.deleteEvent;

// 既存のdeleteEvent関数を拡張
FirebaseScheduleManager.prototype.deleteEvent = async function() {
    // 編集中のイベントIDを取得
    if (!this.editingEvent || !this.editingEvent.id) return;
    
    const eventId = this.editingEvent.id;
    const event = this.events.find(e => e.id === eventId);
    if (!event) return;
    
    const isRepeating = (event.repeat && event.repeat !== 'none') || 
                        event.repeatParent || 
                        this.events.some(e => e.repeatParent === eventId);
    
    if (isRepeating) {
        // 繰り返しイベント → モーダルを表示
        this.closeModal(); // 編集モーダルを閉じる
        this.showDeleteModal(eventId);
    } else {
        // 単発予約 → 元の削除処理を実行
        await originalDeleteEvent.call(this);
    }
};

console.log('✅ Improved delete feature loaded');

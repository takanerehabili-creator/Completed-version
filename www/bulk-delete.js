// ===== まとめて削除機能 =====

let bulkDeleteMode = false;
let bulkDeleteEvents = [];

// まとめて削除モードの切り替え
function toggleBulkDeleteMode() {
    bulkDeleteMode = !bulkDeleteMode;
    
    const btn = document.getElementById('bulkDeleteBtn');
    const btnMobile = document.getElementById('bulkDeleteBtnMobile');
    const executeBtn = document.getElementById('bulkDeleteExecuteBtn');
    const executeBtnMobile = document.getElementById('bulkDeleteExecuteBtnMobile');
    const bulkReservationBtn = document.getElementById('bulkReservationBtn');
    const bulkReservationBtnMobile = document.getElementById('bulkReservationBtnMobile');
    const bulkProceedBtn = document.getElementById('bulkProceedBtn');
    const bulkProceedBtnMobile = document.getElementById('bulkProceedBtnMobile');
    
    if (bulkDeleteMode) {
        // まとめて削除モード開始
        if (btn) {
            btn.classList.add('active');
            btn.style.background = 'linear-gradient(135deg, #f44336 0%, #d32f2f 100%)';
            btn.style.color = 'white';
        }
        if (btnMobile) {
            btnMobile.classList.add('active');
            btnMobile.style.background = 'linear-gradient(135deg, #f44336 0%, #d32f2f 100%)';
            btnMobile.style.color = 'white';
        }
        if (executeBtn) executeBtn.style.display = 'none';
        if (executeBtnMobile) executeBtnMobile.style.display = 'none';
        bulkDeleteEvents = [];
        
        // まとめて予約を無効化
        if (typeof bulkReservationMode !== 'undefined' && bulkReservationMode) {
            toggleBulkReservationMode();
        }
        if (bulkReservationBtn) {
            bulkReservationBtn.disabled = true;
            bulkReservationBtn.style.opacity = '0.5';
            bulkReservationBtn.style.cursor = 'not-allowed';
        }
        if (bulkReservationBtnMobile) {
            bulkReservationBtnMobile.disabled = true;
            bulkReservationBtnMobile.style.opacity = '0.5';
            bulkReservationBtnMobile.style.cursor = 'not-allowed';
        }
        if (bulkProceedBtn) bulkProceedBtn.style.display = 'none';
        if (bulkProceedBtnMobile) bulkProceedBtnMobile.style.display = 'none';
        
        console.log('Bulk delete mode activated');
    } else {
        // まとめて削除モード終了
        if (btn) {
            btn.classList.remove('active');
            btn.style.background = '';
            btn.style.color = '';
        }
        if (btnMobile) {
            btnMobile.classList.remove('active');
            btnMobile.style.background = '';
            btnMobile.style.color = '';
        }
        if (executeBtn) executeBtn.style.display = 'none';
        if (executeBtnMobile) executeBtnMobile.style.display = 'none';
        bulkDeleteEvents = [];
        
        // まとめて予約を有効化
        if (bulkReservationBtn) {
            bulkReservationBtn.disabled = false;
            bulkReservationBtn.style.opacity = '';
            bulkReservationBtn.style.cursor = '';
        }
        if (bulkReservationBtnMobile) {
            bulkReservationBtnMobile.disabled = false;
            bulkReservationBtnMobile.style.opacity = '';
            bulkReservationBtnMobile.style.cursor = '';
        }
        
        // 選択状態をクリア
        clearBulkDeleteSelections();
        
        console.log('Bulk delete mode deactivated');
    }
}

// 選択状態をクリア
function clearBulkDeleteSelections() {
    document.querySelectorAll('.event.bulk-delete-selected').forEach(evt => {
        evt.classList.remove('bulk-delete-selected');
    });
}

// イベントクリック処理
function handleBulkDeleteEventClick(eventElement, eventId) {
    if (!bulkDeleteMode) return false;
    
    // 既に選択されているか確認
    const index = bulkDeleteEvents.findIndex(e => e === eventId);
    
    if (index > -1) {
        // 選択解除
        bulkDeleteEvents.splice(index, 1);
        eventElement.classList.remove('bulk-delete-selected');
    } else {
        // 選択
        bulkDeleteEvents.push(eventId);
        eventElement.classList.add('bulk-delete-selected');
    }
    
    // ボタン表示を更新
    updateBulkDeleteButton();
    
    return true;
}

// 削除ボタンの表示を更新
function updateBulkDeleteButton() {
    const executeBtn = document.getElementById('bulkDeleteExecuteBtn');
    const executeBtnMobile = document.getElementById('bulkDeleteExecuteBtnMobile');
    const countSpan = document.getElementById('bulkDeleteCount');
    const countSpanMobile = document.getElementById('bulkDeleteCountMobile');
    
    if (bulkDeleteEvents.length > 0) {
        if (executeBtn) executeBtn.style.display = 'inline-block';
        if (executeBtnMobile) executeBtnMobile.style.display = 'inline-block';
        if (countSpan) countSpan.textContent = bulkDeleteEvents.length;
        if (countSpanMobile) countSpanMobile.textContent = bulkDeleteEvents.length;
    } else {
        if (executeBtn) executeBtn.style.display = 'none';
        if (executeBtnMobile) executeBtnMobile.style.display = 'none';
    }
}

// まとめて削除を実行
async function executeBulkDelete() {
    if (bulkDeleteEvents.length === 0) {
        window.app.showNotification('削除する予定を選択してください', 'error');
        return;
    }
    
    const count = bulkDeleteEvents.length;
    const confirmMsg = `選択した${count}件の予定を削除しますか？\n\nこの操作は取り消せません。`;
    
    if (!confirm(confirmMsg)) {
        return;
    }
    
    try {
        window.app.showNotification(`${count}件の予定を削除しています...`, 'info');
        
        // Firestoreから削除
        const batch = db.batch();
        
        for (const eventId of bulkDeleteEvents) {
            const docRef = db.collection('events').doc(eventId);
            batch.delete(docRef);
        }
        
        await batch.commit();
        
        console.log(`Successfully deleted ${count} events`);
        
        // モードを先に終了（renderTableより前に）
        bulkDeleteMode = false;
        bulkDeleteEvents = [];
        
        const btn = document.getElementById('bulkDeleteBtn');
        const btnMobile = document.getElementById('bulkDeleteBtnMobile');
        const executeBtn = document.getElementById('bulkDeleteExecuteBtn');
        const executeBtnMobile = document.getElementById('bulkDeleteExecuteBtnMobile');
        const bulkReservationBtn = document.getElementById('bulkReservationBtn');
        const bulkReservationBtnMobile = document.getElementById('bulkReservationBtnMobile');
        
        if (btn) {
            btn.classList.remove('active');
            btn.style.background = '';
            btn.style.color = '';
        }
        if (btnMobile) {
            btnMobile.classList.remove('active');
            btnMobile.style.background = '';
            btnMobile.style.color = '';
        }
        if (executeBtn) executeBtn.style.display = 'none';
        if (executeBtnMobile) executeBtnMobile.style.display = 'none';
        
        if (bulkReservationBtn) {
            bulkReservationBtn.disabled = false;
            bulkReservationBtn.style.opacity = '';
            bulkReservationBtn.style.cursor = '';
        }
        if (bulkReservationBtnMobile) {
            bulkReservationBtnMobile.disabled = false;
            bulkReservationBtnMobile.style.opacity = '';
            bulkReservationBtnMobile.style.cursor = '';
        }
        
        clearBulkDeleteSelections();
        
        window.app.showNotification(`${count}件の予定を削除しました`, 'success');
        
        // onSnapshotが自動的に検知して再描画されるため、何もしない
        
    } catch (error) {
        console.error('Bulk delete failed:', error);
        window.app.showNotification('削除に失敗しました', 'error');
    }
}

// イベントリスナーを設定
function attachBulkDeleteListeners() {
    document.querySelectorAll('.event').forEach(evt => {
        if (evt.classList.contains('event-holiday')) return;
        
        const eventId = evt.dataset.eventId;
        if (!eventId) return;
        
        // クリックイベント（まとめて削除モード用）
        evt.addEventListener('click', (e) => {
            if (bulkDeleteMode) {
                e.preventDefault();
                e.stopPropagation();
                handleBulkDeleteEventClick(evt, eventId);
            }
        }, { capture: true });
    });
}

// テーブル再描画時にリスナーを再設定
const originalRenderTableForDelete = FirebaseScheduleManager.prototype.renderTable;
FirebaseScheduleManager.prototype.renderTable = function() {
    const result = originalRenderTableForDelete.call(this);
    
    setTimeout(() => {
        attachBulkDeleteListeners();
        
        // まとめて削除モード中の場合、選択状態を復元
        if (bulkDeleteMode) {
            bulkDeleteEvents.forEach(eventId => {
                const evt = document.querySelector(`.event[data-event-id="${eventId}"]`);
                if (evt) {
                    evt.classList.add('bulk-delete-selected');
                }
            });
        }
    }, 100);
    
    return result;
};

console.log('✅ Bulk delete feature loaded');

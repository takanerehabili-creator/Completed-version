// ===== まとめて予約機能 =====

// まとめて予約モードの状態管理
let bulkReservationMode = false;
let selectedCells = [];

// まとめて予約モードの切り替え
window.toggleBulkReservationMode = function() {
    bulkReservationMode = !bulkReservationMode;
    const btn = document.getElementById('bulkReservationBtn');
    const btnMobile = document.getElementById('bulkReservationBtnMobile');
    const proceedBtn = document.getElementById('bulkProceedBtn');
    const proceedBtnMobile = document.getElementById('bulkProceedBtnMobile');
    const tableContainer = document.getElementById('tableContainer');
    
    if (bulkReservationMode) {
        // モード開始
        if (btn) btn.classList.add('active');
        if (btnMobile) btnMobile.classList.add('active');
        if (proceedBtn) proceedBtn.style.display = 'inline-block';
        if (proceedBtnMobile) proceedBtnMobile.style.display = 'inline-block';
        tableContainer.classList.add('bulk-mode');
        selectedCells = [];
        updateBulkSelectionDisplay();
        app.showNotification('予約したい時間枠をクリックしてください', 'info');
    } else {
        // モード終了
        if (btn) btn.classList.remove('active');
        if (btnMobile) btnMobile.classList.remove('active');
        if (proceedBtn) proceedBtn.style.display = 'none';
        if (proceedBtnMobile) proceedBtnMobile.style.display = 'none';
        tableContainer.classList.remove('bulk-mode');
        clearBulkSelection();
    }
};

// まとめて予約をキャンセル
window.cancelBulkReservation = function() {
    toggleBulkReservationMode();
};

// 選択をクリア
function clearBulkSelection() {
    document.querySelectorAll('.schedule-cell.selected').forEach(cell => {
        cell.classList.remove('selected');
    });
    selectedCells = [];
    updateBulkSelectionDisplay();
}

// 選択表示を更新
function updateBulkSelectionDisplay() {
    const countSpan = document.getElementById('bulkSelectionCount');
    const countSpanMobile = document.getElementById('bulkSelectionCountMobile');
    const proceedBtn = document.getElementById('bulkProceedBtn');
    const proceedBtnMobile = document.getElementById('bulkProceedBtnMobile');
    
    if (countSpan) countSpan.textContent = selectedCells.length;
    if (countSpanMobile) countSpanMobile.textContent = selectedCells.length;
    if (proceedBtn) proceedBtn.disabled = selectedCells.length === 0;
    if (proceedBtnMobile) proceedBtnMobile.disabled = selectedCells.length === 0;
}

// セルクリック処理（まとめて予約モード用）
function handleBulkCellClick(cell, member, date, time) {
    if (!bulkReservationMode) return false;
    
    // 既に予定がある場合は選択不可
    if (cell.querySelector('.event-item')) {
        app.showNotification('既に予定がある時間枠は選択できません', 'error');
        return true;
    }
    
    // デイスケジュールの時間は選択不可
    if (cell.classList.contains('day-schedule-bg')) {
        app.showNotification('デイスケジュールの時間枠は選択できません', 'error');
        return true;
    }
    
    const cellId = `${member}-${date}-${time}`;
    const index = selectedCells.findIndex(c => c.id === cellId);
    
    if (index >= 0) {
        // 選択解除
        selectedCells.splice(index, 1);
        cell.classList.remove('selected');
    } else {
        // 選択追加
        selectedCells.push({
            id: cellId,
            member,
            date,
            time,
            cell
        });
        cell.classList.add('selected');
    }
    
    updateBulkSelectionDisplay();
    return true;
}

// 予約へ進む
window.proceedToBulkReservation = function() {
    if (selectedCells.length === 0) {
        app.showNotification('時間枠を選択してください', 'error');
        return;
    }
    
    // 選択されたセルの情報を保存
    app.bulkReservationCells = [...selectedCells];
    
    // まとめて予約モードを終了
    toggleBulkReservationMode();
    
    // 最初のセルで予約モーダルを開く
    const firstCell = app.bulkReservationCells[0];
    app.openModal(firstCell.member, firstCell.date, firstCell.time);
    
    // モーダルヘッダーにまとめて予約情報を表示
    const header = document.getElementById('modalHeader');
    header.textContent = `まとめて予約 (${app.bulkReservationCells.length}件の時間枠)`;
    
    // 予約種類をリセット（デイ/担会が選択されないようにする）
    app.selectedType = null;
    document.querySelectorAll('.type-option').forEach(o => o.classList.remove('selected'));
    
    // デイ/担会ボタンを非表示にする
    document.querySelectorAll('.type-option').forEach(option => {
        if (option.dataset.type === 'day' || option.dataset.type === 'meeting') {
            option.style.display = 'none';
        }
    });
};

// 既存のsaveEvent関数をラップしてまとめて予約に対応
const originalSaveEvent = FirebaseScheduleManager.prototype.saveEvent;
FirebaseScheduleManager.prototype.saveEvent = async function() {
    // まとめて予約モード中かチェック
    if (this.bulkReservationCells && this.bulkReservationCells.length > 0) {
        await saveBulkReservations.call(this);
    } else {
        // 通常の予約
        await originalSaveEvent.call(this);
    }
};

// まとめて予約の保存処理
async function saveBulkReservations() {
    console.log('=== saveBulkReservations START ===');
    console.log('this.selectedType:', this.selectedType);
    
    if (!this.selectedType) {
        this.showNotification('予定種類を選択してください', 'error');
        return;
    }
    
    // モーダルからデータを取得
    let surname = '', firstname = '', displayName = '';
    let startTime = '', endTime = '';
    
    console.log('Selected type check:', this.selectedType);
    
    if (this.selectedType === 'day' || this.selectedType === 'meeting') {
        console.log('⚠️ WARNING: Day/Meeting type detected in bulk reservation!');
        this.showNotification('まとめて予約ではデイ/担会は使用できません', 'error');
        return;
    }
    
    // 通常予約のみ
    surname = document.getElementById('surnameInput').value.trim();
    firstname = document.getElementById('firstnameInput').value.trim();
    
    if (!surname) {
        this.showNotification('姓を入力してください', 'error');
        return;
    }
    displayName = firstname ? `${surname}${firstname}` : surname;
    
    console.log('Surname:', surname, 'Firstname:', firstname);
    console.log('Selected cells:', this.bulkReservationCells.length);
    
    const repeat = document.getElementById('repeatSelect').value;
    
    // 確認メッセージ
    const cellsText = this.bulkReservationCells.slice(0, 5).map(c => 
        `${c.member} ${c.date} ${c.time}`
    ).join('\n') + (this.bulkReservationCells.length > 5 ? `\n...他${this.bulkReservationCells.length - 5}件` : '');
    
    if (!confirm(`選択した${this.bulkReservationCells.length}件すべてに同じ予約を登録します。\n\n${cellsText}\n\nよろしいですか？`)) {
        return;
    }
    
    showLoading('まとめて予約を登録中...');
    
    try {
        let successCount = 0;
        let errorCount = 0;
        const batch = db.batch();
        
        // すべての選択枠に同じ予約を登録
        for (const cell of this.bulkReservationCells) {
            try {
                // 祝日チェック
                if (this.isHoliday(cell.date)) {
                    console.log(`Skip holiday: ${cell.date}`);
                    errorCount++;
                    continue;
                }
                
                // 有給・公休日チェック
                if (this.isStaffLeave(cell.member, cell.date, cell.time)) {
                    console.log(`Skip staff leave: ${cell.member} ${cell.date} ${cell.time}`);
                    errorCount++;
                    continue;
                }
                
                // イベントデータを作成（通常イベントのみ）
                console.log(`Processing cell: ${cell.member} ${cell.date} ${cell.time}`);
                
                // 時間計算
                const times = this.calculateModalStartEndTimeSequential(cell.member, cell.date, cell.time, this.selectedType);
                console.log('Calculated times:', times);
                
                // 衝突チェック（this.eventsから直接検索）
                const existingEvent = this.events.find(e => 
                    e.member === cell.member && e.date === cell.date && e.time === cell.time
                );
                if (existingEvent) {
                    console.log(`Skip existing event: ${cell.member} ${cell.date} ${cell.time}`);
                    errorCount++;
                    continue;
                }
                
                const eventData = {
                    member: cell.member,
                    date: cell.date,
                    time: cell.time,
                    startTime: times.startTime,
                    endTime: times.endTime,
                    surname: surname,
                    firstname: firstname,
                    displayName: displayName,
                    type: this.selectedType,
                    repeat: 'none',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    lastModified: Date.now()
                };
                
                console.log('Event data:', eventData);
                
                // Firestoreに追加
                const newDocRef = db.collection('events').doc();
                batch.set(newDocRef, eventData);
                
                successCount++;
                
            } catch (error) {
                console.error(`Failed to prepare reservation for ${cell.member} ${cell.date} ${cell.time}:`, error);
                errorCount++;
            }
        }
        
        // バッチ保存
        await batch.commit();
        
        hideLoading();
        
        // 結果を通知
        if (errorCount === 0) {
            this.showNotification(`${successCount}件の予約を登録しました`, 'success');
        } else {
            this.showNotification(`${successCount}件成功、${errorCount}件スキップ`, 'warning');
        }
        
        // まとめて予約データをクリア
        this.bulkReservationCells = null;
        
        // デイ/担会ボタンを再表示
        document.querySelectorAll('.type-option').forEach(option => {
            if (option.dataset.type === 'day' || option.dataset.type === 'meeting') {
                option.style.display = '';
            }
        });
        
        // モーダルを閉じる
        this.closeModal();
        
        updateSyncStatus('synced');
        
    } catch (error) {
        hideLoading();
        console.error('Bulk reservation error:', error);
        this.showNotification('まとめて予約に失敗しました', 'error');
        this.bulkReservationCells = null;
        
        // デイ/担会ボタンを再表示
        document.querySelectorAll('.type-option').forEach(option => {
            if (option.dataset.type === 'day' || option.dataset.type === 'meeting') {
                option.style.display = '';
            }
        });
        
        updateSyncStatus('error');
    }
}

console.log('✅ Bulk reservation feature loaded');

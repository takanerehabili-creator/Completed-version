// 管理画面関連(FirebaseScheduleManagerクラスに追加)

FirebaseScheduleManager.prototype.openManagement = function() {
    this.renderStaffList();
    this.renderHolidayList();
    this.renderDayScheduleList();
    this.renderStaffOverrideList();
    this.renderStaffLeaveList();
    this.updateStaffLeaveSelect();
    this.updateStaffOverrideSelects();
    this.updateDayScheduleStaffSelect();
    
    // 祝日年選択を初期化
    if (typeof initHolidayYearSelect === 'function') {
        initHolidayYearSelect();
    }
    
    const modal = document.getElementById('managementModal');
    modal.style.display = 'block';
};

FirebaseScheduleManager.prototype.closeManagement = function() {
    document.getElementById('managementModal').style.display = 'none';
    document.getElementById('newStaffSurname').value = '';
    document.getElementById('newStaffFirstname').value = '';
    document.getElementById('newHolidayDate').value = '';
};

// ⭐ スタッフ入れ替えセレクトボックス更新
FirebaseScheduleManager.prototype.updateStaffOverrideSelects = function() {
    const originalSelect = document.getElementById('overrideOriginalStaff');
    const replacementSelect = document.getElementById('overrideReplacementStaff');
    
    if (!originalSelect || !replacementSelect) return;
    
    const currentOriginal = originalSelect.value;
    const currentReplacement = replacementSelect.value;
    
    originalSelect.innerHTML = '<option value="">スタッフを選択</option>';
    replacementSelect.innerHTML = '<option value="">スタッフを選択</option>';
    
    this.teamMembers.forEach(m => {
        const name = `${m.surname || ''}${m.firstname || ''}`;
        
        const option1 = document.createElement('option');
        option1.value = name;
        option1.textContent = name;
        originalSelect.appendChild(option1);
        
        const option2 = document.createElement('option');
        option2.value = name;
        option2.textContent = name;
        replacementSelect.appendChild(option2);
    });
    
    originalSelect.value = currentOriginal;
    replacementSelect.value = currentReplacement;
};

// ⭐ デイスケジュール用セレクトボックス更新
FirebaseScheduleManager.prototype.updateDayScheduleStaffSelect = function() {
    const select = document.getElementById('dayScheduleStaffSelect');
    
    if (!select) return;
    
    const currentValue = select.value;
    
    select.innerHTML = '<option value="">スタッフを選択</option>';
    
    this.teamMembers.forEach(m => {
        const name = `${m.surname || ''}${m.firstname || ''}`;
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
    });
    
    select.value = currentValue;
};

// ⭐ スタッフ入れ替えリスト表示
FirebaseScheduleManager.prototype.renderStaffOverrideList = function() {
    const list = document.getElementById('staffOverrideList');
    if (!list) return;
    list.innerHTML = '';
    
    if (this.staffOverrides.length === 0) {
        list.innerHTML = '<div style="padding:20px;text-align:center;color:#666">登録されたスタッフ入れ替えはありません</div>';
        return;
    }
    
    const sortedOverrides = [...this.staffOverrides].sort((a, b) => a.date.localeCompare(b.date));
    
    sortedOverrides.forEach((override) => {
        const originalIndex = this.staffOverrides.findIndex(o => o.id === override.id);
        
        const item = document.createElement('div');
        item.className = 'list-item';
        
        const date = this.createLocalDate(override.date);
        const days = ['日','月','火','水','木','金','土'];
        const dateText = `${date.getMonth() + 1}/${date.getDate()}(${days[date.getDay()]})`;
        
        item.innerHTML = `
            <div class="list-info" style="flex-direction:column;align-items:flex-start;gap:4px">
                <div style="font-weight:600;color:#d32f2f">${dateText}</div>
                <div style="font-size:13px;color:#666">${override.originalStaff} → ${override.replacementStaff}</div>
            </div>
            <div class="list-actions">
                <button class="small-btn delete" onclick="app.deleteStaffOverride(${originalIndex})">削除</button>
            </div>`;
        list.appendChild(item);
    });
};

// ⭐ スタッフ入れ替え追加
FirebaseScheduleManager.prototype.addStaffOverride = async function() {
    const dateInput = document.getElementById('overrideDate');
    const originalSelect = document.getElementById('overrideOriginalStaff');
    const replacementSelect = document.getElementById('overrideReplacementStaff');
    
    const date = dateInput.value;
    const originalStaff = originalSelect.value;
    const replacementStaff = replacementSelect.value;
    
    if (!date) {
        this.showNotification('日付を選択してください', 'error');
        return;
    }
    
    if (!originalStaff) {
        this.showNotification('休みにするスタッフを選択してください', 'error');
        return;
    }
    
    if (!replacementStaff) {
        this.showNotification('代わりに出勤するスタッフを選択してください', 'error');
        return;
    }
    
    if (originalStaff === replacementStaff) {
        this.showNotification('同じスタッフを選択することはできません', 'error');
        return;
    }
    
    const duplicate = this.staffOverrides.find(o => 
        o.date === date && 
        (o.originalStaff === originalStaff || o.replacementStaff === replacementStaff)
    );
    
    if (duplicate) {
        this.showNotification('その日には既に入れ替え設定が存在します', 'error');
        return;
    }
    
    // ⭐ 該当日の元スタッフの予約を確認
    const reservationsToTransfer = this.events.filter(e => 
        e.member === originalStaff && e.date === date
    );
    
    let shouldTransfer = false;
    
    if (reservationsToTransfer.length > 0) {
        const dateObj = this.createLocalDate(date);
        const days = ['日','月','火','水','木','金','土'];
        const dateText = `${dateObj.getMonth() + 1}/${dateObj.getDate()}(${days[dateObj.getDay()]})`;
        
        const message = `${dateText}に${originalStaff}の予約が${reservationsToTransfer.length}件あります。\n\n` +
                       `これらの予約を${replacementStaff}に引き継ぎますか？\n\n` +
                       `「はい」を選択すると、予約のスタッフが自動的に${replacementStaff}に変更されます。\n` +
                       `「いいえ」を選択すると、予約はそのまま${originalStaff}に残ります。`;
        
        shouldTransfer = confirm(message);
    }
    
    try {
        updateSyncStatus('syncing');
        
        await db.collection('staffOverrides').add({
            date,
            originalStaff,
            replacementStaff,
            createdAt: new Date()
        });
        
        // ⭐ 予約を引き継ぐ場合の処理
        if (shouldTransfer && reservationsToTransfer.length > 0) {
            this.showNotification(`予約を引き継ぎ中... (${reservationsToTransfer.length}件)`, 'info');
            
            const batch = db.batch();
            for (const event of reservationsToTransfer) {
                const eventRef = db.collection('events').doc(event.id);
                batch.update(eventRef, {
                    member: replacementStaff,
                    updatedAt: new Date()
                });
            }
            await batch.commit();
            
            this.showNotification(`スタッフ入れ替えを追加し、${reservationsToTransfer.length}件の予約を引き継ぎました`, 'success');
        } else {
            updateSyncStatus('synced');
            this.showNotification('スタッフ入れ替えを追加しました', 'success');
        }
        
        dateInput.value = '';
        originalSelect.value = '';
        replacementSelect.value = '';
        
        this.renderStaffOverrideList();
        
        if (this.tableReadyForDisplay) {
            this.renderTable();
        }
        
    } catch (error) {
        updateSyncStatus('error');
        this.showNotification('スタッフ入れ替えの追加に失敗しました', 'error');
        console.error('Add staff override error:', error);
    }
};

// ⭐ スタッフ入れ替え削除
FirebaseScheduleManager.prototype.deleteStaffOverride = async function(i) {
    const override = this.staffOverrides[i];
    const date = this.createLocalDate(override.date);
    const days = ['日','月','火','水','木','金','土'];
    const dateText = `${date.getMonth() + 1}/${date.getDate()}(${days[date.getDay()]})`;
    
    if (confirm(`${dateText}のスタッフ入れ替えを削除しますか?\n${override.originalStaff} → ${override.replacementStaff}`)) {
        // ⭐ 該当日の代わりスタッフの予約を確認（元々引き継がれた可能性のある予約）
        const reservationsToRevert = this.events.filter(e => 
            e.member === override.replacementStaff && e.date === override.date
        );
        
        let shouldRevert = false;
        
        if (reservationsToRevert.length > 0) {
            const message = `${dateText}に${override.replacementStaff}の予約が${reservationsToRevert.length}件あります。\n\n` +
                           `これらの予約を${override.originalStaff}に戻しますか？\n\n` +
                           `「はい」を選択すると、予約のスタッフが${override.originalStaff}に変更されます。\n` +
                           `「いいえ」を選択すると、予約は${override.replacementStaff}のまま残ります。`;
            
            shouldRevert = confirm(message);
        }
        
        try {
            updateSyncStatus('syncing');
            
            // ⭐ 予約を元に戻す場合の処理
            if (shouldRevert && reservationsToRevert.length > 0) {
                this.showNotification(`予約を元に戻し中... (${reservationsToRevert.length}件)`, 'info');
                
                const batch = db.batch();
                for (const event of reservationsToRevert) {
                    const eventRef = db.collection('events').doc(event.id);
                    batch.update(eventRef, {
                        member: override.originalStaff,
                        updatedAt: new Date()
                    });
                }
                await batch.commit();
            }
            
            // スタッフ入れ替え設定を削除
            await db.collection('staffOverrides').doc(override.id).delete();
            
            updateSyncStatus('synced');
            
            if (shouldRevert && reservationsToRevert.length > 0) {
                this.showNotification(`スタッフ入れ替えを削除し、${reservationsToRevert.length}件の予約を元に戻しました`, 'success');
            } else {
                this.showNotification('スタッフ入れ替えを削除しました', 'success');
            }
            
            this.renderStaffOverrideList();
            
            if (this.tableReadyForDisplay) {
                this.renderTable();
            }
        } catch (error) {
            updateSyncStatus('error');
            this.showNotification('スタッフ入れ替えの削除に失敗しました', 'error');
        }
    }
};

// ⭐⭐⭐ 有給・公休日管理機能 ⭐⭐⭐

// 有給・公休日セレクトボックス更新
FirebaseScheduleManager.prototype.updateStaffLeaveSelect = function() {
    const select = document.getElementById('leaveStaffSelect');
    
    if (!select) return;
    
    const currentValue = select.value;
    
    select.innerHTML = '<option value="">スタッフを選択</option>';
    
    this.teamMembers.forEach(m => {
        const name = `${m.surname || ''}${m.firstname || ''}`;
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
    });
    
    select.value = currentValue;
    
    // ⭐ 時間セレクトボックスも初期化
    this.updateLeaveTimeSelects();
};

// ⭐ 有給・公休日の時間セレクトボックス初期化
FirebaseScheduleManager.prototype.updateLeaveTimeSelects = function() {
    const startSelect = document.getElementById('leaveStartTime');
    const endSelect = document.getElementById('leaveEndTime');
    
    if (!startSelect || !endSelect) return;
    
    const currentStart = startSelect.value;
    const currentEnd = endSelect.value;
    
    // 開始時間: 9:00～17:40
    startSelect.innerHTML = '<option value="">選択してください</option>';
    this.timeSlots.forEach(time => {
        // 18:00未満の時間を追加（9:00を含む）
        if (time !== '18:00') {
            const option = document.createElement('option');
            option.value = time;
            option.textContent = time;
            startSelect.appendChild(option);
        }
    });
    
    // 終了時間: 9:20～18:00
    endSelect.innerHTML = '<option value="">選択してください</option>';
    this.timeSlots.forEach(time => {
        // 9:00以外を追加
        if (time !== '9:00') {
            const option = document.createElement('option');
            option.value = time;
            option.textContent = time;
            endSelect.appendChild(option);
        }
    });
    
    // 18:00も追加
    const option18 = document.createElement('option');
    option18.value = '18:00';
    option18.textContent = '18:00';
    endSelect.appendChild(option18);
    
    startSelect.value = currentStart;
    endSelect.value = currentEnd;
};

// 有給・公休日リスト表示
FirebaseScheduleManager.prototype.renderStaffLeaveList = function() {
    const list = document.getElementById('staffLeaveList');
    if (!list) return;
    list.innerHTML = '';
    
    if (this.staffLeaves.length === 0) {
        list.innerHTML = '<div style="padding:20px;text-align:center;color:#666">登録された有給・公休日はありません</div>';
        return;
    }
    
    const sortedLeaves = [...this.staffLeaves].sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.startTime.localeCompare(b.startTime);
    });
    
    sortedLeaves.forEach((leave) => {
        const originalIndex = this.staffLeaves.findIndex(l => l.id === leave.id);
        
        const item = document.createElement('div');
        item.className = 'list-item';
        
        const date = this.createLocalDate(leave.date);
        const days = ['日','月','火','水','木','金','土'];
        const dateText = `${date.getMonth() + 1}/${date.getDate()}(${days[date.getDay()]})`;
        
        item.innerHTML = `
            <div class="list-info" style="flex-direction:column;align-items:flex-start;gap:4px">
                <div style="font-weight:600;color:#4285f4">${leave.staffName}</div>
                <div style="font-size:13px;color:#666">${dateText} ${leave.startTime}〜${leave.endTime}</div>
            </div>
            <div class="list-actions">
                <button class="small-btn delete" onclick="app.deleteStaffLeave(${originalIndex})">削除</button>
            </div>`;
        list.appendChild(item);
    });
};

// 有給・公休日追加
FirebaseScheduleManager.prototype.addStaffLeave = async function() {
    const staffSelect = document.getElementById('leaveStaffSelect');
    const dateInput = document.getElementById('leaveDate');
    const startTimeInput = document.getElementById('leaveStartTime');
    const endTimeInput = document.getElementById('leaveEndTime');
    
    const staffName = staffSelect.value;
    const date = dateInput.value;
    const startTime = startTimeInput.value;
    const endTime = endTimeInput.value;
    
    if (!staffName) {
        this.showNotification('スタッフを選択してください', 'error');
        return;
    }
    
    if (!date) {
        this.showNotification('日付を選択してください', 'error');
        return;
    }
    
    if (!startTime) {
        this.showNotification('開始時間を入力してください', 'error');
        return;
    }
    
    if (!endTime) {
        this.showNotification('終了時間を入力してください', 'error');
        return;
    }
    
    // ⭐ 時刻を分に変換して比較
    const timeToMinutes = (time) => {
        const [hours, minutes] = time.split(':').map(Number);
        return hours * 60 + minutes;
    };
    
    if (timeToMinutes(startTime) >= timeToMinutes(endTime)) {
        this.showNotification('終了時間は開始時間より後にしてください', 'error');
        return;
    }
    
    // 重複チェック
    const duplicate = this.staffLeaves.find(l => 
        l.staffName === staffName && 
        l.date === date &&
        ((timeToMinutes(startTime) >= timeToMinutes(l.startTime) && timeToMinutes(startTime) < timeToMinutes(l.endTime)) ||
         (timeToMinutes(endTime) > timeToMinutes(l.startTime) && timeToMinutes(endTime) <= timeToMinutes(l.endTime)) ||
         (timeToMinutes(startTime) <= timeToMinutes(l.startTime) && timeToMinutes(endTime) >= timeToMinutes(l.endTime)))
    );
    
    if (duplicate) {
        this.showNotification('その時間帯には既に休み設定が存在します', 'error');
        return;
    }
    
    try {
        updateSyncStatus('syncing');
        
        // ⭐ 時刻を分に変換するヘルパー関数
        const timeToMinutes = (time) => {
            const [hours, minutes] = time.split(':').map(Number);
            return hours * 60 + minutes;
        };
        
        const startMinutes = timeToMinutes(startTime);
        const endMinutes = timeToMinutes(endTime);
        
        // ⭐ 休み設定の時間範囲内にある既存予定を削除
        const eventsToDelete = this.events.filter(e => {
            if (e.member !== staffName || e.date !== date) return false;
            
            // イベントの時間範囲をチェック
            if (e.startTime && e.endTime) {
                // 範囲イベント（デイ、担会、休みなど）
                const eventStart = timeToMinutes(e.startTime);
                const eventEnd = timeToMinutes(e.endTime);
                return (eventStart < endMinutes && eventEnd > startMinutes);
            } else {
                // 通常イベント（20分、40分など）
                const eventMinutes = timeToMinutes(e.time);
                return eventMinutes >= startMinutes && eventMinutes < endMinutes;
            }
        });
        
        // 既存予定を削除
        if (eventsToDelete.length > 0) {
            const deletePromises = eventsToDelete.map(e => 
                db.collection('events').doc(e.id).delete()
            );
            await Promise.all(deletePromises);
            console.log(`Deleted ${eventsToDelete.length} conflicting events`);
        }
        
        // 有給・公休日を追加
        await db.collection('staffLeaves').add({
            staffName,
            date,
            startTime,
            endTime,
            createdAt: new Date()
        });
        
        updateSyncStatus('synced');
        
        if (eventsToDelete.length > 0) {
            this.showNotification(`有給・公休日を追加しました（${eventsToDelete.length}件の既存予定を削除）`, 'success');
        } else {
            this.showNotification('有給・公休日を追加しました', 'success');
        }
        
        staffSelect.value = '';
        dateInput.value = '';
        startTimeInput.value = '';
        endTimeInput.value = '';
        
        this.renderStaffLeaveList();
        
        if (this.tableReadyForDisplay) {
            this.renderTable();
        }
        
    } catch (error) {
        updateSyncStatus('error');
        this.showNotification('有給・公休日の追加に失敗しました', 'error');
        console.error('Add staff leave error:', error);
    }
};

// 有給・公休日削除
FirebaseScheduleManager.prototype.deleteStaffLeave = async function(i) {
    const leave = this.staffLeaves[i];
    const date = this.createLocalDate(leave.date);
    const days = ['日','月','火','水','木','金','土'];
    const dateText = `${date.getMonth() + 1}/${date.getDate()}(${days[date.getDay()]})`;
    
    if (confirm(`${leave.staffName}の有給・公休日を削除しますか?\n${dateText} ${leave.startTime}〜${leave.endTime}`)) {
        try {
            updateSyncStatus('syncing');
            await db.collection('staffLeaves').doc(leave.id).delete();
            updateSyncStatus('synced');
            this.showNotification('有給・公休日を削除しました', 'success');
            
            this.renderStaffLeaveList();
            
            if (this.tableReadyForDisplay) {
                this.renderTable();
            }
        } catch (error) {
            updateSyncStatus('error');
            this.showNotification('有給・公休日の削除に失敗しました', 'error');
        }
    }
};


// 既存の管理機能（スタッフ管理）
FirebaseScheduleManager.prototype.renderStaffList = function() {
    const list = document.getElementById('staffList');
    if (!list) return;
    list.innerHTML = '';
    this.teamMembers.forEach((m, i) => {
        const item = document.createElement('div');
        item.className = 'list-item';
        const workdays = m.workdays || [1,2,3,4,5];
        const dayNames = ['月','火','水','木','金','土'];
        const checkboxes = dayNames.map((day, idx) => {
            const checked = workdays.includes(idx + 1) ? 'checked' : '';
            return `<label class="workday-checkbox">
                <input type="checkbox" ${checked} onchange="app.updateWorkday(${i},${idx + 1},this.checked)">
                <span class="checkmark"></span>
                <span class="day-label">${day}</span>
            </label>`;
        }).join('');
        
        item.innerHTML = `
            <div class="list-info">
                <div class="staff-name" id="staffName_${i}">
                    <div class="display-name" style="font-weight:600;margin-bottom:8px">${m.surname}</div>
                    <div class="workdays-section">
                        <div style="font-size:12px;color:#666;margin-bottom:6px">出勤曜日:</div>
                        <div class="workday-checkboxes">${checkboxes}</div>
                    </div>
                    <div class="edit-inputs" style="display:none;margin-bottom:8px">
                        <input type="text" id="editSurname_${i}" class="form-input" value="${m.surname}" placeholder="姓" style="margin-right:5px;flex:1" lang="ja" inputmode="text" autocomplete="off">
                        <input type="text" id="editFirstname_${i}" class="form-input" value="${m.firstname || ''}" placeholder="名" style="flex:1" lang="ja" inputmode="text" autocomplete="off">
                    </div>
                </div>
            </div>
            <div class="list-actions">
                <button class="small-btn edit" onclick="app.editStaff(${i})">編集</button>
                <button class="small-btn save" onclick="app.saveStaff(${i})" style="display:none">保存</button>
                <button class="small-btn cancel" onclick="app.cancelEdit(${i})" style="display:none">キャンセル</button>
                <button class="small-btn delete" onclick="app.deleteStaff(${i})">削除</button>
            </div>`;
        list.appendChild(item);
    });
};

FirebaseScheduleManager.prototype.updateWorkday = async function(staffIdx, dayIdx, isChecked) {
    if (!this.teamMembers[staffIdx].workdays) this.teamMembers[staffIdx].workdays = [];
    if (isChecked) {
        if (!this.teamMembers[staffIdx].workdays.includes(dayIdx)) {
            this.teamMembers[staffIdx].workdays.push(dayIdx);
        }
    } else {
        this.teamMembers[staffIdx].workdays = this.teamMembers[staffIdx].workdays.filter(d => d !== dayIdx);
    }
    this.teamMembers[staffIdx].workdays.sort();
    
    try {
        updateSyncStatus('syncing');
        await this.saveTeamMemberToFirestore(this.teamMembers[staffIdx]);
        updateSyncStatus('synced');
        this.showNotification('出勤曜日を更新しました', 'success');
        
        if (this.tableReadyForDisplay) {
            this.renderTable();
        }
    } catch (error) {
        updateSyncStatus('error');
        this.showNotification('出勤曜日の更新に失敗しました', 'error');
    }
};

FirebaseScheduleManager.prototype.editStaff = function(i) {
    const name = document.getElementById(`staffName_${i}`);
    const display = name.querySelector('.display-name');
    const inputs = name.querySelector('.edit-inputs');
    const workdays = name.querySelector('.workdays-section');
    const editBtn = name.parentElement.parentElement.querySelector('.edit');
    const saveBtn = name.parentElement.parentElement.querySelector('.save');
    const cancelBtn = name.parentElement.parentElement.querySelector('.cancel');
    
    display.style.display = 'none';
    inputs.style.display = 'flex';
    inputs.style.gap = '5px';
    workdays.style.display = 'none';
    editBtn.style.display = 'none';
    saveBtn.style.display = 'inline-block';
    cancelBtn.style.display = 'inline-block';
    
    setTimeout(() => {
        const firstInput = inputs.querySelector('.form-input');
        if (firstInput) {
            firstInput.focus();
        }
    }, 100);
};

FirebaseScheduleManager.prototype.saveStaff = async function(i) {
    const newSurname = document.getElementById(`editSurname_${i}`).value.trim();
    const newFirstname = document.getElementById(`editFirstname_${i}`).value.trim();
    
    if (!newSurname) {
        this.showNotification('姓は必須です', 'error');
        return;
    }
    
    const oldName = `${this.teamMembers[i].surname || ''}${this.teamMembers[i].firstname || ''}`;
    const newName = `${newSurname}${newFirstname}`;
    
    try {
        updateSyncStatus('syncing');
        const batch = db.batch();
        
        const eventsToUpdate = [];
        this.weekCache.forEach((weekEvents) => {
            weekEvents.forEach(e => {
                if (e.member === oldName) {
                    eventsToUpdate.push(e);
                }
            });
        });
        
        this.events.forEach(e => {
            if (e.member === oldName) {
                const exists = eventsToUpdate.find(existing => existing.id === e.id);
                if (!exists) {
                    eventsToUpdate.push(e);
                }
            }
        });
        
        eventsToUpdate.forEach(e => {
            batch.update(db.collection('events').doc(e.id), { member: newName });
        });
        
        const updatedMember = {
            ...this.teamMembers[i],
            surname: newSurname,
            firstname: newFirstname
        };
        batch.update(db.collection('teamMembers').doc(this.teamMembers[i].id), updatedMember);
        
        await batch.commit();
        updateSyncStatus('synced');
        this.showNotification('スタッフ情報を更新しました', 'success');
        this.renderStaffList();
    } catch (error) {
        updateSyncStatus('error');
        this.showNotification('スタッフ情報の更新に失敗しました', 'error');
        console.error('Save staff error:', error);
    }
};

FirebaseScheduleManager.prototype.cancelEdit = function(i) {
    this.renderStaffList();
};

FirebaseScheduleManager.prototype.deleteStaff = async function(i) {
    if (this.teamMembers.length <= 1) {
        this.showNotification('スタッフは最低1人必要です', 'error');
        return;
    }
    const m = this.teamMembers[i];
    const name = `${m.surname || ''} ${m.firstname || ''}`;
    if (confirm(`${name}を削除しますか?\n関連する予定も全て削除されます。`)) {
        try {
            updateSyncStatus('syncing');
            const memberName = `${m.surname || ''}${m.firstname || ''}`;
            
            const relatedEvents = [];
            this.weekCache.forEach((weekEvents) => {
                weekEvents.forEach(e => {
                    if (e.member === memberName) {
                        relatedEvents.push(e);
                    }
                });
            });
            
            this.events.forEach(e => {
                if (e.member === memberName) {
                    const exists = relatedEvents.find(existing => existing.id === e.id);
                    if (!exists) {
                        relatedEvents.push(e);
                    }
                }
            });
            
            const batch = db.batch();
            relatedEvents.forEach(e => {
                batch.delete(db.collection('events').doc(e.id));
            });
            batch.delete(db.collection('teamMembers').doc(m.id));
            
            await batch.commit();
            updateSyncStatus('synced');
            this.showNotification('スタッフを削除しました', 'success');
            this.renderStaffList();
        } catch (error) {
            updateSyncStatus('error');
            this.showNotification('スタッフの削除に失敗しました', 'error');
        }
    }
};

FirebaseScheduleManager.prototype.addStaff = async function() {
    const surname = document.getElementById('newStaffSurname').value.trim();
    const firstname = document.getElementById('newStaffFirstname').value.trim();
    
    if (!surname) {
        this.showNotification('姓は必須です', 'error');
        const surnameInput = document.getElementById('newStaffSurname');
        if (surnameInput) {
            surnameInput.focus();
        }
        return;
    }
    
    const name = `${surname}${firstname}`;
    if (this.teamMembers.some(m => `${m.surname}${m.firstname}` === name)) {
        this.showNotification('同じ名前のスタッフが既に存在します', 'error');
        return;
    }
    
    try {
        updateSyncStatus('syncing');
        await this.saveTeamMemberToFirestore({surname, firstname, workdays: [1,2,3,4,5]});
        updateSyncStatus('synced');
        this.showNotification('新しいスタッフを追加しました', 'success');
        document.getElementById('newStaffSurname').value = '';
        document.getElementById('newStaffFirstname').value = '';
    } catch (error) {
        updateSyncStatus('error');
        this.showNotification('スタッフの追加に失敗しました', 'error');
    }
};

FirebaseScheduleManager.prototype.saveTeamMemberToFirestore = async function(memberData) {
    try {
        if (memberData.id) {
            await db.collection('teamMembers').doc(memberData.id).set(memberData, { merge: true });
        } else {
            await db.collection('teamMembers').add(memberData);
        }
    } catch (error) {
        console.error('Save team member error:', error);
        throw error;
    }
};

// 祝日管理
FirebaseScheduleManager.prototype.addHoliday = async function() {
    const input = document.getElementById('newHolidayDate');
    const date = input.value;
    if (!date) {
        this.showNotification('日付を選択してください', 'error');
        return;
    }
    if (this.holidays.some(h => h.date === date)) {
        this.showNotification('その日は既に祝日として登録されています', 'error');
        return;
    }
    
    try {
        updateSyncStatus('syncing');
        const d = this.createLocalDate(date);
        const name = `祝日 ${d.getMonth() + 1}/${d.getDate()}`;
        
        const eventsToDelete = [];
        this.weekCache.forEach((weekEvents) => {
            weekEvents.forEach(e => {
                if (e.date === date) {
                    eventsToDelete.push(e);
                }
            });
        });
        
        this.events.forEach(e => {
            if (e.date === date) {
                const exists = eventsToDelete.find(existing => existing.id === e.id);
                if (!exists) {
                    eventsToDelete.push(e);
                }
            }
        });
        
        const batch = db.batch();
        eventsToDelete.forEach(e => {
            batch.delete(db.collection('events').doc(e.id));
        });
        
        const holidayRef = db.collection('holidays').doc();
        batch.set(holidayRef, {date, name});
        
        await batch.commit();
        updateSyncStatus('synced');
        this.showNotification(`${name}を追加しました`, 'success');
        input.value = '';
        
        // 祝日リストを再読み込みして更新
        await this.loadHolidays();
        this.renderHolidayList();
        
    } catch (error) {
        updateSyncStatus('error');
        this.showNotification('祝日の追加に失敗しました', 'error');
    }
};

FirebaseScheduleManager.prototype.deleteHoliday = async function(i) {
    const h = this.holidays[i];
    if (confirm(`${h.name}(${h.date})を祝日から削除しますか?`)) {
        try {
            updateSyncStatus('syncing');
            await db.collection('holidays').doc(h.id).delete();
            updateSyncStatus('synced');
            this.showNotification('祝日を削除しました', 'success');
            
            // 祝日リストを再読み込みして更新
            await this.loadHolidays();
            this.renderHolidayList();
            
        } catch (error) {
            updateSyncStatus('error');
            this.showNotification('祝日の削除に失敗しました', 'error');
        }
    }
};

FirebaseScheduleManager.prototype.renderHolidayList = function() {
    const list = document.getElementById('holidayList');
    if (!list) return;
    list.innerHTML = '';
    if (this.holidays.length === 0) {
        list.innerHTML= '<div style="padding:20px;text-align:center;color:#666">登録された祝日はありません</div>';
        return;
    }
    this.holidays.forEach((h, i) => {
        const item = document.createElement('div');
        item.className = 'list-item';
        item.innerHTML = `
            <div class="list-info">
                <span style="font-weight:600;color:#d32f2f;min-width:100px">${h.date}</span>
                <span style="color:#666">${h.name}</span>
            </div>
            <div class="list-actions">
                <button class="small-btn delete" onclick="app.deleteHoliday(${i})">削除</button>
            </div>`;
        list.appendChild(item);
    });
};

// デイスケジュール管理
FirebaseScheduleManager.prototype.renderDayScheduleList = function() {
    const list = document.getElementById('dayScheduleList');
    if (!list) return;
    list.innerHTML = '';
    if (this.daySchedules.length === 0) {
        list.innerHTML = '<div style="padding:20px;text-align:center;color:#666">登録されたデイ設定はありません</div>';
        return;
    }
    
    const groupedByStaff = {};
    this.daySchedules.forEach((ds, i) => {
        if (!groupedByStaff[ds.staffName]) {
            groupedByStaff[ds.staffName] = [];
        }
        groupedByStaff[ds.staffName].push({...ds, originalIndex: i});
    });
    
    Object.keys(groupedByStaff).forEach(staffName => {
        const item = document.createElement('div');
        item.className = 'list-item';
        item.style.flexDirection = 'column';
        item.style.alignItems = 'flex-start';
        
        const schedules = groupedByStaff[staffName];
        
        item.innerHTML = `
            <div style="width:100%;display:flex;justify-content:space-between;align-items:flex-start">
                <div style="flex:1">
                    <div style="font-weight:600;color:#388e3c;margin-bottom:6px;font-size:15px">${staffName}</div>
                    <div style="display:flex;flex-wrap:wrap;gap:6px">
                        ${schedules.map((ds, idx) => {
                            const dayNames = ['日','月','火','水','木','金','土'];
                            const daysText = (ds.daysOfWeek || []).map(d => dayNames[d]).join('・');
                            
                            // パターン表示の判定を修正
                            let patternText = '';
                            let patternColor = '#666';
                            let timeText = '';
                            
                            if (ds.pattern === 'pattern1') {
                                patternText = '①';
                                patternColor = '#388e3c';
                            } else if (ds.pattern === 'pattern2') {
                                patternText = '②';
                                patternColor = '#1976d2';
                            } else if (ds.pattern === 1) {
                                // 古いデータ対応
                                patternText = '①';
                                patternColor = '#388e3c';
                            } else if (ds.pattern === 2) {
                                // 古いデータ対応
                                patternText = '②';
                                patternColor = '#1976d2';
                            } else {
                                // カスタム - 時間を表示
                                patternText = 'カスタム';
                                timeText = ds.startTime && ds.endTime ? `${ds.startTime}-${ds.endTime}` : '';
                            }
                            
                            return `
                                <div style="display:inline-flex;align-items:center;gap:4px;background:#f5f5f5;padding:4px 8px;border-radius:4px;font-size:12px">
                                    <span style="color:#666">${daysText}</span>
                                    <span style="color:${patternColor};font-weight:600">${patternText}</span>
                                    ${timeText ? `<span style="color:#999;font-size:11px">${timeText}</span>` : ''}
                                    <button onclick="app.deleteDaySchedule(${ds.originalIndex})" style="background:none;border:none;color:#d32f2f;cursor:pointer;padding:0 4px;font-size:14px;line-height:1">×</button>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            </div>`;
        list.appendChild(item);
    });
};

FirebaseScheduleManager.prototype.addDaySchedule = async function() {
    const staffSelect = document.getElementById('dayScheduleStaffSelect');
    const patternSelect = document.getElementById('daySchedulePattern');
    const startTimeInput = document.getElementById('dayScheduleStartTime');
    const endTimeInput = document.getElementById('dayScheduleEndTime');
    const dayCheckboxes = document.querySelectorAll('#dayScheduleDaysSection input[type="checkbox"]:checked');
    
    const staffName = staffSelect.value;
    const patternValue = patternSelect.value;
    const daysOfWeek = Array.from(dayCheckboxes).map(cb => parseInt(cb.value));
    
    if (!staffName) {
        this.showNotification('スタッフを選択してください', 'error');
        return;
    }
    
    if (daysOfWeek.length === 0) {
        this.showNotification('曜日を選択してください', 'error');
        return;
    }
    
    // パターンに応じて時間を設定
    let timeRanges = [];
    
    if (patternValue === 'pattern1') {
        // パターン① 9:20-14:40
        timeRanges = [
            { startTime: '09:20', endTime: '14:40' }
        ];
    } else if (patternValue === 'pattern2') {
        // パターン② 13:00-14:40
        timeRanges = [
            { startTime: '13:00', endTime: '14:40' }
        ];
    } else {
        // カスタム
        const startTime = startTimeInput.value;
        const endTime = endTimeInput.value;
        
        if (!startTime || !endTime) {
            this.showNotification('時間を入力してください', 'error');
            return;
        }
        
        timeRanges = [{ startTime, endTime }];
    }
    
    try {
        updateSyncStatus('syncing');
        
        // 各時間範囲でデイ設定を追加
        for (const timeRange of timeRanges) {
            await db.collection('daySchedules').add({
                staffName,
                daysOfWeek,
                startTime: timeRange.startTime,
                endTime: timeRange.endTime,
                pattern: patternValue,
                createdAt: new Date()
            });
        }
        
        updateSyncStatus('synced');
        this.showNotification('デイ設定を追加しました', 'success');
        
        dayCheckboxes.forEach(cb => cb.checked = false);
        startTimeInput.value = '';
        endTimeInput.value = '';
        
        this.renderDayScheduleList();
        
        if (this.tableReadyForDisplay) {
            this.renderTable();
        }
        
    } catch (error) {
        updateSyncStatus('error');
        this.showNotification('デイ設定の追加に失敗しました', 'error');
        console.error('Add day schedule error:', error);
    }
};

FirebaseScheduleManager.prototype.deleteDaySchedule = async function(i) {
    const ds = this.daySchedules[i];
    const dayNames = ['日','月','火','水','木','金','土'];
    const daysText = (ds.daysOfWeek || []).map(d => dayNames[d]).join('・');
    
    // パターン判定を修正
    let patternText = '';
    if (ds.pattern === 'pattern1') {
        patternText = 'パターン① 9:20-14:40';
    } else if (ds.pattern === 'pattern2') {
        patternText = 'パターン② 13:00-14:40';
    } else if (ds.pattern === 1) {
        patternText = 'パターン①';
    } else if (ds.pattern === 2) {
        patternText = 'パターン②';
    } else {
        patternText = `カスタム ${ds.startTime || ''}-${ds.endTime || ''}`;
    }
    
    if (confirm(`${ds.staffName}のデイ設定を削除しますか?\n(${daysText} ${patternText})`)) {
        try {
            updateSyncStatus('syncing');
            await db.collection('daySchedules').doc(ds.id).delete();
            updateSyncStatus('synced');
            this.showNotification('デイ設定を削除しました', 'success');
            
            this.renderDayScheduleList();
            
            if (this.tableReadyForDisplay) {
                this.renderTable();
            }
        } catch (error) {
            updateSyncStatus('error');
            this.showNotification('デイ設定の削除に失敗しました', 'error');
        }
    }
};

// ⭐ 週移動・カレンダー・イベント関連（リスナー最適化版）
FirebaseScheduleManager.prototype.changeWeekOptimized = async function(direction) {
    if (direction === -1) {
        const todayWeekStart = this.getMondayOfWeek(new Date());
        const newStartDate = new Date(this.currentStartDate);
        newStartDate.setDate(newStartDate.getDate() - 7);
        
        if (newStartDate < todayWeekStart) {
            this.showNotification('今週より前には戻れません', 'error');
            return;
        }
    }
    
    if (direction === 1) {
        const todayWeekStart = this.getMondayOfWeek(new Date());
        const newStartDate = new Date(this.currentStartDate);
        newStartDate.setDate(newStartDate.getDate() + 7);
        
        const maxFutureDate = new Date(todayWeekStart);
        maxFutureDate.setDate(maxFutureDate.getDate() + (7 * 3));
        
        if (newStartDate > maxFutureDate) {
            this.showNotification('これ以上先の週へはカレンダーから移動してください', 'error');
            return;
        }
    }
    
    const newStartDate = new Date(this.currentStartDate);
    newStartDate.setDate(newStartDate.getDate() + (direction * 7));
    const newWeekKey = this.getWeekKey(newStartDate);

    console.log(`Changing week from ${this.currentWeekKey} to ${newWeekKey}`);

    // ⭐ 新しい週のリスナーを作成（まだなければ）
    if (!this.weekListeners.has(newWeekKey)) {
        console.log(`Creating listener for new week: ${newWeekKey}`);
        showLoading(`${newWeekKey}の週を読み込み中...`);
        try {
            await this.createWeekListenerIfNeeded(newWeekKey);
            hideLoading();
        } catch (error) {
            console.error('Failed to create week listener:', error);
            hideLoading();
            this.showNotification('週の読み込みに失敗しました', 'error');
            return;
        }
    } else {
        console.log(`Week ${newWeekKey} already has listener`);
    }
    
    // ⭐ 週を移動してからクリーンアップ
    this.currentStartDate = newStartDate;
    this.currentWeekKey = newWeekKey;
    
    this.updateWeekDisplay();
    this.updatePrevWeekButton();
    this.updateNextWeekButton();
    this.updateCurrentWeekEvents();
    this.renderTable();
    
    // ⭐ クリーンアップは移動後に実行
    this.cleanupOldListeners();
    
    // ⭐ 週移動の通知を表示
    if (typeof window.showWeekChangeNotification === 'function') {
        window.showWeekChangeNotification(this);
    }
    
    console.log(`Week changed successfully. Active listeners: ${this.weekListeners.size}`);
};

FirebaseScheduleManager.prototype.goToToday = async function() {
    const todayWeekStart = this.getMondayOfWeek(new Date());
    const todayWeekKey = this.getWeekKey(todayWeekStart);
    
    if (todayWeekKey === this.currentWeekKey) {
        setTimeout(() => this.scrollToToday(), 100);
        this.showNotification('今日に移動しました', 'success');
        return;
    }
    
    try {
        if (!this.weekListeners.has(todayWeekKey)) {
            showLoading('今日の週を読み込み中...');
            await this.createWeekListenerIfNeeded(todayWeekKey);
            hideLoading();
        }
        
        // ⭐ クリーンアップ実行
        this.cleanupOldListeners();
        
        this.currentStartDate = todayWeekStart;
        this.currentWeekKey = todayWeekKey;
        
        this.updateWeekDisplay();
        this.updatePrevWeekButton();
        this.updateNextWeekButton();
        this.updateCurrentWeekEvents();
        this.renderTable();
        
        setTimeout(() => this.scrollToToday(), 100);
        this.showNotification('今日に移動しました', 'success');
        
    } catch (error) {
        console.error('Go to today error:', error);
        this.showNotification('今日への移動に失敗しました', 'error');
    }
};

FirebaseScheduleManager.prototype.scrollToToday = function() {
    const today = this.formatDate(new Date());
    const cell = document.querySelector(`[data-date="${today}"]`);
    if (cell) {
        const area = document.querySelector('.main');
        const rect = cell.getBoundingClientRect();
        const containerRect = area.getBoundingClientRect();
        const scrollLeft = area.scrollLeft + rect.left - containerRect.left - 80;
        area.scrollTo({left: Math.max(0, scrollLeft), behavior: 'smooth'});
    }
};

FirebaseScheduleManager.prototype.openCalendarModal = function() {
    this.calendarCurrentDate = new Date();
    this.renderCalendar();
    document.getElementById('calendarModal').style.display = 'block';
};

FirebaseScheduleManager.prototype.closeCalendarModal = function() {
    document.getElementById('calendarModal').style.display = 'none';
};

FirebaseScheduleManager.prototype.changeCalendarMonth = function(dir) {
    this.calendarCurrentDate.setMonth(this.calendarCurrentDate.getMonth() + dir);
    this.renderCalendar();
};

FirebaseScheduleManager.prototype.renderCalendar = function() {
    const year = this.calendarCurrentDate.getFullYear();
    const month = this.calendarCurrentDate.getMonth();
    document.getElementById('calendarTitle').textContent = `${year}年${month + 1}月`;
    
    const firstDay = new Date(year, month, 1);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());
    const today = new Date();
    
    let html = '';
    ['日', '月', '火', '水', '木', '金', '土'].forEach(day => {
        html += `<div class="calendar-day-header">${day}</div>`;
    });
    
    for (let i = 0; i < 42; i++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i);
        const isCurrentMonth = date.getMonth() === month;
        const isToday = date.toDateString() === today.toDateString();
        let classes = 'calendar-day';
        if (!isCurrentMonth) classes += ' other-month';
        if (isToday) classes += ' today';
        html += `<div class="${classes}" onclick="selectCalendarDate('${this.formatDate(date)}')">${date.getDate()}</div>`;
    }
    document.getElementById('calendarGrid').innerHTML = html;
};

FirebaseScheduleManager.prototype.selectCalendarDate = async function(dateString) {
    const selectedDate = this.createLocalDate(dateString);
    const selectedWeekStart = this.getMondayOfWeek(selectedDate);
    const selectedWeekKey = this.getWeekKey(selectedWeekStart);
    
    try {
        if (!this.weekListeners.has(selectedWeekKey)) {
            showLoading('選択された週を読み込み中...');
            await this.createWeekListenerIfNeeded(selectedWeekKey);
            hideLoading();
        }
        
        // ⭐ 先にcurrentWeekKeyを設定（クリーンアップで保護されるように）
        this.currentStartDate = selectedWeekStart;
        this.currentWeekKey = selectedWeekKey;
        
        // ⭐ その後でクリーンアップ実行
        this.cleanupOldListeners();
        
        this.updateWeekDisplay();
        this.updatePrevWeekButton();
        this.updateNextWeekButton();
        this.updateCurrentWeekEvents();
        this.renderTable();
        this.closeCalendarModal();
        
        setTimeout(() => {
            const cell = document.querySelector(`[data-date="${dateString}"]`);
            if (cell) {
                const area = document.querySelector('.main');
                const rect = cell.getBoundingClientRect();
                const containerRect = area.getBoundingClientRect();
                const scrollLeft = area.scrollLeft + rect.left - containerRect.left - 80;
                area.scrollTo({left: Math.max(0, scrollLeft), behavior: 'smooth'});
            }
        }, 100);
        this.showNotification(`${selectedDate.toLocaleDateString('ja-JP')}の週に移動しました`, 'success');
        
    } catch (error) {
        console.error('Calendar date selection error:', error);
        this.showNotification('週の移動に失敗しました', 'error');
    }
};

FirebaseScheduleManager.prototype.setupEvents = function() {
    document.querySelectorAll('.type-option').forEach(opt => {
        opt.addEventListener('click', () => {
            document.querySelectorAll('.type-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            this.selectedType = opt.dataset.type;
            this.toggleInputs(this.selectedType);
            this.updateSelectedTimeDisplay();
        });
    });
    
    // ⭐ 新患トグルのイベントリスナー
    const newPatientToggle = document.getElementById('newPatientToggle');
    const newPatientLabel = document.getElementById('newPatientLabel');
    if (newPatientToggle && newPatientLabel) {
        newPatientToggle.addEventListener('change', () => {
            if (newPatientToggle.checked) {
                newPatientLabel.textContent = '新患';
            } else {
                newPatientLabel.textContent = '既存患者';
            }
        });
    }
    
    document.addEventListener('dragstart', e => this.handleDragStart(e));
    document.addEventListener('dragend', e => this.handleDragEnd(e));
    document.addEventListener('dragover', e => this.handleDragOver(e));
    document.addEventListener('drop', e => this.handleDrop(e));
    
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            this.closeModal();
            this.closeCalendarModal();
        }
    });
    
    window.addEventListener('click', e => {
        // モーダル外クリックで閉じる機能を無効化
        // if (e.target === document.getElementById('eventModal')) this.closeModal();
        if (e.target === document.getElementById('calendarModal')) this.closeCalendarModal();
    });

    const headerElement = document.querySelector('.header');
    if (headerElement) {
        headerElement.addEventListener('touchstart', e => this.handleTouchStart(e), {passive: false});
        headerElement.addEventListener('touchend', e => this.handleTouchEnd(e), {passive: false});
    }
};

FirebaseScheduleManager.prototype.handleDragStart = function(e) {
    if (e.target.classList.contains('event') && !e.target.classList.contains('event-holiday')) {
        const eventType = Array.from(e.target.classList).find(c => c.startsWith('event-'))?.replace('event-', '');
        if (eventType === 'day' || eventType === 'meeting' || eventType === 'break') {
            return;
        }
        
        this.dragInfo = {id: e.target.dataset.eventId, element: e.target};
        e.target.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    }
};

FirebaseScheduleManager.prototype.handleDragEnd = function(e) {
    if (e.target.classList.contains('event')) {
        e.target.classList.remove('dragging');
        this.dragInfo = null;
        document.querySelectorAll('.schedule-cell').forEach(c => c.classList.remove('drag-hover'));
    }
};

FirebaseScheduleManager.prototype.handleDragOver = function(e) {
    if (e.target.classList.contains('schedule-cell') && !e.target.classList.contains('holiday') && this.dragInfo) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        document.querySelectorAll('.schedule-cell').forEach(c => c.classList.remove('drag-hover'));
        e.target.classList.add('drag-hover');
    }
};

FirebaseScheduleManager.prototype.handleDrop = async function(e) {
    if (e.target.classList.contains('schedule-cell') && !e.target.classList.contains('holiday') && this.dragInfo) {
        e.preventDefault();
        e.target.classList.remove('drag-hover');
        
        const member = e.target.dataset.member;
        const date = e.target.dataset.date;
        const time = e.target.dataset.time;
        const eventIndex = this.events.findIndex(ev => ev.id === this.dragInfo.id);
        if (eventIndex === -1) return;
        
        const conflict = this.events.find(ev => ev.member === member && ev.date === date && ev.time === time && ev.id !== this.dragInfo.id);
        if (conflict) {
            this.showNotification('その時間には既に予定があります', 'error');
            return;
        }
        
        try {
            updateSyncStatus('syncing');
            const eventData = { ...this.events[eventIndex] };
            eventData.member = member;
            eventData.date = date;
            eventData.time = time;
            eventData.updatedAt = new Date();
            
            // ⭐ ドラッグ移動も手動変更としてマーク
            if (eventData.repeatParent) {
                eventData.manuallyModified = true;
                console.log('Marking dragged event as manually modified');
            }
            
            await this.saveEventToFirestore(eventData);
            updateSyncStatus('synced');
            this.showNotification('予定を移動しました', 'success');
        } catch (error) {
            updateSyncStatus('error');
            this.showNotification('予定の移動に失敗しました', 'error');
        }
    }
};

FirebaseScheduleManager.prototype.handleTouchStart = function(e) {
    if (e.touches.length === 2) {
        e.preventDefault();
        e.stopPropagation();
        const now = Date.now();
        
        if (this.firstTapTime && (now - this.firstTapTime) < 500) {
            this.openManagement();
            this.firstTapTime = null;
            if (this.doubleTapTimer) {
                clearTimeout(this.doubleTapTimer);
                this.doubleTapTimer = null;
            }
        } else {
            this.firstTapTime = now;
            this.doubleTapTimer = setTimeout(() => {
                this.firstTapTime = null;
                this.doubleTapTimer = null;
            }, 500);
        }
    }
};

FirebaseScheduleManager.prototype.handleTouchEnd = function(e) {
};
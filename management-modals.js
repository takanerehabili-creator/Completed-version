// ===== 管理モーダル制御関数 =====

// スタッフ管理モーダル
function openStaffManagement() {
    document.getElementById('staffManagementModal').style.display = 'flex';
    // スタッフリストを更新
    if (window.app && window.app.renderStaffList) {
        window.app.renderStaffList();
    }
}

function closeStaffManagement() {
    document.getElementById('staffManagementModal').style.display = 'none';
}

// 有給・公休日管理モーダル
function openLeaveManagement() {
    document.getElementById('leaveManagementModal').style.display = 'flex';
    // 有給リストを更新
    if (window.app && window.app.renderStaffLeaveList) {
        window.app.renderStaffLeaveList();
    }
    // スタッフセレクトを更新
    updateLeaveStaffSelect();
}

function closeLeaveManagement() {
    document.getElementById('leaveManagementModal').style.display = 'none';
}

// スタッフ入れ替え管理モーダル
function openOverrideManagement() {
    document.getElementById('overrideManagementModal').style.display = 'flex';
    // 入れ替えリストを更新
    if (window.app && window.app.renderStaffOverrideList) {
        window.app.renderStaffOverrideList();
    }
    // スタッフセレクトを更新
    updateOverrideStaffSelects();
}

function closeOverrideManagement() {
    document.getElementById('overrideManagementModal').style.display = 'none';
}

// デイスケジュール管理モーダル
function openDayScheduleManagement() {
    document.getElementById('dayScheduleManagementModal').style.display = 'flex';
    // デイスケジュールリストを更新
    if (window.app && window.app.renderDayScheduleList) {
        window.app.renderDayScheduleList();
    }
    // スタッフセレクトを更新
    updateDayScheduleStaffSelect();
}

function closeDayScheduleManagement() {
    document.getElementById('dayScheduleManagementModal').style.display = 'none';
}

// 祝日管理モーダル
function openHolidayManagement() {
    document.getElementById('holidayManagementModal').style.display = 'flex';
    // 祝日リストを更新
    if (window.app && window.app.renderHolidayList) {
        window.app.renderHolidayList();
    }
    // 年選択を初期化
    if (typeof initHolidayYearSelect === 'function') {
        initHolidayYearSelect();
    }
}

function closeHolidayManagement() {
    document.getElementById('holidayManagementModal').style.display = 'none';
}

// スタッフセレクト更新関数
function updateLeaveStaffSelect() {
    if (!window.app || !window.app.teamMembers) return;
    
    const select = document.getElementById('leaveStaffSelect');
    if (!select) return;
    
    const currentValue = select.value;
    select.innerHTML = '<option value="">スタッフを選択</option>';
    
    window.app.teamMembers.forEach(m => {
        const name = `${m.surname || ''}${m.firstname || ''}`;
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
    });
    
    select.value = currentValue;
}

function updateOverrideStaffSelects() {
    if (!window.app || !window.app.teamMembers) return;
    
    const select1 = document.getElementById('overrideOriginalStaff');
    const select2 = document.getElementById('overrideReplacementStaff');
    
    if (!select1 || !select2) return;
    
    const current1 = select1.value;
    const current2 = select2.value;
    
    select1.innerHTML = '<option value="">スタッフを選択</option>';
    select2.innerHTML = '<option value="">スタッフを選択</option>';
    
    window.app.teamMembers.forEach(m => {
        const name = `${m.surname || ''}${m.firstname || ''}`;
        
        const option1 = document.createElement('option');
        option1.value = name;
        option1.textContent = name;
        select1.appendChild(option1);
        
        const option2 = document.createElement('option');
        option2.value = name;
        option2.textContent = name;
        select2.appendChild(option2);
    });
    
    select1.value = current1;
    select2.value = current2;
}

function updateDayScheduleStaffSelect() {
    if (!window.app || !window.app.teamMembers) return;
    
    const select = document.getElementById('dayScheduleStaffSelect');
    if (!select) return;
    
    const currentValue = select.value;
    select.innerHTML = '<option value="">スタッフを選択</option>';
    
    window.app.teamMembers.forEach(m => {
        const name = `${m.surname || ''}${m.firstname || ''}`;
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
    });
    
    select.value = currentValue;
}

console.log('✅ Management modals functions loaded');

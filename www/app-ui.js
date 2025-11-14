// UI表示関連のメソッド(FirebaseScheduleManagerクラスに追加)

FirebaseScheduleManager.prototype.showMinimalTable = function() {
    const tableContainer = document.getElementById('tableContainer');
    const mainTable = document.getElementById('mainTable');
    
    let html = '<thead><tr><th class="time-cell header">時間</th>';
    
    const days = ['月','火','水','木','金','土'];
    for (let i = 0; i < 6; i++) {
        const date = new Date(this.currentStartDate);
        date.setDate(date.getDate() + i);
        html += `<th class="date-cell">${date.getMonth() + 1}/${date.getDate()}(${days[i < 5 ? i : 0]})</th>`;
    }
    html += '</tr></thead><tbody>';
    
    this.timeSlots.forEach(time => {
        html += `<tr><td class="time-cell row">${time}</td>`;
        for (let i = 0; i < 6; i++) {
            html += `<td class="schedule-cell"><div class="time-bg">${time}</div></td>`;
        }
        html += '</tr>';
    });
    
    html += '</tbody>';
    mainTable.innerHTML = html;
    tableContainer.classList.add('ready');
    this.minimalDataLoaded = true;
    console.log('Minimal table displayed');
};

FirebaseScheduleManager.prototype.showEmergencyTable = function() {
    const mainTable = document.getElementById('mainTable');
    mainTable.innerHTML = `
        <tbody>
            <tr>
                <td style="padding:40px;text-align:center;color:#666;font-size:16px">
                    スケジュールデータの読み込みに失敗しました<br>
                    <button onclick="location.reload()" style="margin-top:10px;padding:8px 16px;background:#4285f4;color:white;border:none;border-radius:6px;cursor:pointer">
                        再読み込み
                    </button>
                </td>
            </tr>
        </tbody>
    `;
};

FirebaseScheduleManager.prototype.ensureTableDisplay = function() {
    const tableContainer = document.getElementById('tableContainer');
    const mainTable = document.getElementById('mainTable');
    
    if (!mainTable.querySelector('thead') || mainTable.innerHTML.includes('読み込んでいます')) {
        console.log('Ensuring table display...');
        setTimeout(() => {
            this.renderTable();
        }, 500);
    }
    
    tableContainer.classList.add('ready');
};

FirebaseScheduleManager.prototype.renderTable = function() {
    if (!this.tableReadyForDisplay) {
        console.log('Table not ready for display, skipping render');
        return;
    }
    
    console.log('Rendering table with events:', this.events.length);
    const tableElement = document.getElementById('mainTable');
    const builtTable = this.buildTable();
    
    if (builtTable) {
        tableElement.innerHTML = builtTable;
        this.attachEvents();
        
        const tableContainer = document.getElementById('tableContainer');
        tableContainer.classList.add('ready');
        
        console.log('Table rendered successfully');
    } else {
        console.warn('Failed to build table');
    }
};

// ⭐ スタッフ入れ替え対応版のbuildTable
FirebaseScheduleManager.prototype.buildTable = function() {
    if (this.teamMembers.length === 0) {
        console.log('No team members available, showing placeholder');
        return `<tbody><tr><td style="padding:40px;text-align:center;color:#666">スタッフデータを読み込み中...</td></tr></tbody>`;
    }
    
    let html = '<thead class="header-row"><tr><th class="time-cell header">時間</th>';
    
    for (let i = 0; i < 6; i++) {
        const date = new Date(this.currentStartDate);
        date.setDate(date.getDate() + i);
        const dateString = this.formatDate(date);
        const days = ['日','月','火','水','木','金','土'];
        const isHol = this.isHoliday(dateString);
        const holidayName = this.getHolidayName(dateString);
        const dayOfWeek = date.getDay();
        
        // ⭐ 入れ替え対応: getStaffForDate()を使用
        const staff = this.getStaffForDate(dateString);
        
        if (staff.length > 0) {
            const cellClass = i < 5 ? 'date-cell divider' : 'date-cell';
            const holidayClass = isHol ? ' holiday' : '';
            const text = isHol ? `${date.getMonth() + 1}/${date.getDate()}(${days[dayOfWeek]}) ${holidayName}` : `${date.getMonth() + 1}/${date.getDate()}(${days[dayOfWeek]})`;
            html += `<th class="${cellClass}${holidayClass}" colspan="${staff.length}">${text}</th>`;
        }
    }
    
    html += '</tr><tr><th class="time-cell header"></th>';
    
    for (let i = 0; i < 6; i++) {
        const date = new Date(this.currentStartDate);
        date.setDate(date.getDate() + i);
        const dateString = this.formatDate(date);
        
        // ⭐ 入れ替え対応: getStaffForDate()を使用
        const staff = this.getStaffForDate(dateString);
        
        staff.forEach((m, idx) => {
            const isLastStaffOfDay = idx === staff.length - 1;
            const cellClass = isLastStaffOfDay && i < 5 ? 'member-cell divider' : 'member-cell';
            
            html += `<th class="${cellClass}"><div>${m.surname || ''}</div></th>`;
        });
    }
    
    html += '</tr></thead><tbody>';
    
    const rangeEventCells = new Map();
    const processedNormalCells = new Set();  // ⭐ 追加: 通常イベントのスキップ管理
    
    // 範囲イベント（デイ・担会）の事前処理
    this.events.forEach(e => {
        if (e.startTime && e.endTime && !e.time) {  // timeフィールドがない範囲イベントのみ
            const startIdx = this.timeSlots.indexOf(e.startTime);
            let endIdx = this.timeSlots.indexOf(e.endTime);
            if (endIdx === -1) endIdx = this.timeSlots.length;
            
            for (let i = startIdx; i < endIdx; i++) {
                const cellKey = `${e.member}-${e.date}-${this.timeSlots[i]}`;
                if (!rangeEventCells.has(cellKey)) {
                    rangeEventCells.set(cellKey, []);
                }
                rangeEventCells.get(cellKey).push(e);
            }
        }
    });
    
    // ⭐ 追加: 通常イベント（40分・60分・訪問）の事前処理
    this.events.forEach(e => {
        if (e.time && (e.type === '40min' || e.type === 'workinjury40' || e.type === '60min' || e.type === 'visit')) {
            const timeIdx = this.timeSlots.indexOf(e.time);
            if (timeIdx !== -1) {
                // 60分と訪問は3セル、40分は2セル占有
                const cellCount = (e.type === '60min' || e.type === 'visit') ? 3 : 2;
                for (let i = 1; i < cellCount; i++) {
                    if (timeIdx + i < this.timeSlots.length) {
                        const cellKey = `${e.member}-${e.date}-${this.timeSlots[timeIdx + i]}`;
                        processedNormalCells.add(cellKey);
                    }
                }
            }
        }
    });
    
    const processedRangeEvents = new Set();
    
    this.timeSlots.forEach(time => {
        const isLunch = this.isLunchTime(time);
        html += `<tr ${isLunch ? 'class="lunch"' : ''}><td class="time-cell row">${time}</td>`;
        
        for (let i = 0; i < 6; i++) {
            const date = new Date(this.currentStartDate);
            date.setDate(date.getDate() + i);
            const dateString = this.formatDate(date);
            const isHol = this.isHoliday(dateString);
            
            // ⭐ 入れ替え対応: getStaffForDate()を使用
            const staff = this.getStaffForDate(dateString);
            
            staff.forEach((m, idx) => {
                const memberName = `${m.surname || ''}${m.firstname || ''}`;
                const cellKey = `${memberName}-${dateString}-${time}`;
                
                // ⭐ 追加: 通常イベントでスキップ対象の場合は何も描画しない
                if (processedNormalCells.has(cellKey)) {
                    return;
                }
                
                const rangeEventsInCell = rangeEventCells.get(cellKey) || [];
                const rangeEventStartingHere = rangeEventsInCell.find(e => 
                    e.startTime === time && e.member === memberName && !e.time  // timeフィールドがない場合のみ範囲イベント
                );
                
                if (rangeEventStartingHere && !processedRangeEvents.has(rangeEventStartingHere.id)) {
                    processedRangeEvents.add(rangeEventStartingHere.id);
                    
                    const startIdx = this.timeSlots.indexOf(rangeEventStartingHere.startTime);
                    let endIdx = this.timeSlots.indexOf(rangeEventStartingHere.endTime);
                    if (endIdx === -1) endIdx = this.timeSlots.length;
                    const rowspan = endIdx - startIdx;
                    
                    const isLastStaffOfDay = idx === staff.length - 1;
                    let cellClass = isLastStaffOfDay && i < 5 ? 'schedule-cell divider' : 'schedule-cell';
                    if (isHol) cellClass += ' holiday';
                    
                    const isDayCell = this.isDaySchedule(memberName, dateString, time);
                    if (isDayCell && !isHol) cellClass += ' day-schedule-bg';  // ⭐ 祝日でない場合のみ
                    
                    const isLeaveCell = this.isStaffLeave(memberName, dateString, time);
                    if (isLeaveCell) cellClass += " staff-leave-bg";
                    
                    const eventHtml = this.buildEvent(memberName, dateString, time, isHol);
                    
                    html += `<td class="${cellClass}" data-member="${memberName}" data-date="${dateString}" data-time="${time}" rowspan="${rowspan}">${eventHtml}</td>`;
                } else if (!rangeEventsInCell.some(e => this.timeSlots.indexOf(e.startTime) < this.timeSlots.indexOf(time) && e.member === memberName)) {
                    const isLastStaffOfDay = idx === staff.length - 1;
                    let cellClass = isLastStaffOfDay && i < 5 ? 'schedule-cell divider' : 'schedule-cell';
                    if (isHol) cellClass += ' holiday';
                    
                    const isDayCell = this.isDaySchedule(memberName, dateString, time);
                    if (isDayCell && !isHol) cellClass += ' day-schedule-bg';  // ⭐ 祝日でない場合のみ
                    
                    const isLeaveCell = this.isStaffLeave(memberName, dateString, time);
                    if (isLeaveCell) cellClass += " staff-leave-bg";
                    
                    const eventHtml = this.buildEvent(memberName, dateString, time, isHol);
                    
                    // ⭐ 追加: 40分・60分・訪問の場合はrowspanを設定
                    const normalEvent = this.events.find(e => e.member === memberName && e.date === dateString && e.time === time);
                    let rowspanAttr = '';
                    if (normalEvent) {
                        if (normalEvent.type === '60min' || normalEvent.type === 'visit') {
                            rowspanAttr = ' rowspan="3"';
                        } else if (normalEvent.type === '40min' || normalEvent.type === 'workinjury40') {
                            rowspanAttr = ' rowspan="2"';
                        }
                    }
                    
                    html += `<td class="${cellClass}" data-member="${memberName}" data-date="${dateString}" data-time="${time}"${rowspanAttr}>${eventHtml}</td>`;
                }
            });
        }
        html += '</tr>';
    });
    
    return html + '</tbody>';
};

FirebaseScheduleManager.prototype.buildEvent = function(member, date, time, isHoliday) {
    if (isHoliday) return '';
    
    // ⭐ 休み設定チェック - 休みの場合は時間のみ表示
    if (this.isStaffLeave(member, date, time)) {
        return `<div class="time-bg">${time}</div>`;
    }
    
    let eventHtmls = [];
    
    const rangeEvent = this.events.find(e => 
        e.member === member && e.date === date && 
        e.startTime && e.endTime && 
        !e.time &&  // timeフィールドがない場合のみ範囲イベント
        e.startTime === time
    );
    
    if (rangeEvent) {
        const startIdx = this.timeSlots.indexOf(rangeEvent.startTime);
        let endIdx = this.timeSlots.indexOf(rangeEvent.endTime);
        if (endIdx === -1) endIdx = this.timeSlots.length;
        const height = (endIdx - startIdx) * 50 - 4;
        
        let content = rangeEvent.type === 'meeting' ? '担会' : '';
        eventHtmls.push(`<div class="event event-${rangeEvent.type}" 
            style="height: ${height}px; z-index: 5;"
            draggable="false"
            data-event-id="${rangeEvent.id}"
            onclick="event.stopPropagation(); if(window.app && window.app.editEvent) window.app.editEvent('${rangeEvent.id}');">
            ${content}
        </div>`);
    }
    
    const normalEvent = this.events.find(e => 
        e.member === member && e.date === date && e.time === time
    );
    
    if (normalEvent) {
        let content = '';
        if (['20min', '40min', '60min', 'visit', 'workinjury20', 'workinjury40', 'accident', 'other'].includes(normalEvent.type)) {
            const surname = normalEvent.surname || '';
            const firstname = normalEvent.firstname || '';
            const getSize = (text) => this.getEventFontSize(text);
            const surnameDisplay = surname.substring(0, 10);
            const firstnameDisplay = firstname.substring(0, 10);
            content = `<div style="line-height:1.1; white-space: normal; overflow: visible; word-break: break-all;">
                ${surnameDisplay ? `<div style="font-size:${getSize(surname)};">${surnameDisplay}</div>` : ''}
                ${firstnameDisplay ? `<div style="font-size:${getSize(firstname)};">${firstnameDisplay}</div>` : ''}
            </div>`;
        }
        
        // 60分・訪問は3セル分の高さ、40分は2セル分の高さ、20分予約は1セル分
        const eventHeight = (normalEvent.type === '60min' || normalEvent.type === 'visit') ? '146px' :
                           (normalEvent.type === '40min' || normalEvent.type === 'workinjury40') ? '96px' : '46px';
        
        // ⭐ 新患クラスを追加
        const newPatientClass = normalEvent.isNewPatient ? ' new-patient' : '';
        
        eventHtmls.push(`<div class="event event-${normalEvent.type}${newPatientClass}" 
            style="height: ${eventHeight}; z-index: 10;"
            draggable="true" 
            data-event-id="${normalEvent.id}">
            ${content}
        </div>`);
    }
    
    if (eventHtmls.length === 0) {
        return `<div class="time-bg">${time}</div>`;
    }
    
    return eventHtmls.join('');
};

FirebaseScheduleManager.prototype.attachEvents = function() {
    document.querySelectorAll('.schedule-cell').forEach(cell => {
        if (cell.classList.contains('holiday')) return;
        cell.addEventListener('click', e => {
            if (e.target.classList.contains('event') || e.target.closest('.event')) return;
            const member = cell.dataset.member;
            const date = cell.dataset.date;
            const time = cell.dataset.time;
            
            // まとめて予約モードの場合
            if (typeof handleBulkCellClick !== 'undefined' && handleBulkCellClick(cell, member, date, time)) {
                return;
            }
            
            this.openModal(member, date, time, null);
        });
    });

    document.querySelectorAll('.event').forEach(evt => {
        if (evt.classList.contains('event-holiday')) return;
        evt.addEventListener('click', e => {
            e.stopPropagation();
            this.editEvent(evt.dataset.eventId);
        });
    });
};

FirebaseScheduleManager.prototype.updateWeekDisplay = function() {
    const end = new Date(this.currentStartDate);
    end.setDate(end.getDate() + 5);
    const displayText = `${this.currentStartDate.toLocaleDateString('ja-JP', {month:'numeric',day:'numeric'})} - ${end.toLocaleDateString('ja-JP', {month:'numeric',day:'numeric'})}`;
    const desktopDisplay = document.getElementById('weekDisplay');
    const mobileDisplay = document.getElementById('weekDisplayMobile');
    if (desktopDisplay) desktopDisplay.textContent = displayText;
    if (mobileDisplay) mobileDisplay.textContent = displayText;
};

FirebaseScheduleManager.prototype.updatePrevWeekButton = function() {
    const todayWeekStart = this.getMondayOfWeek(new Date());
    const canGoPrev = this.currentStartDate > todayWeekStart;
    
    const prevBtn = document.getElementById('prevWeekBtn');
    const prevBtnMobile = document.getElementById('prevWeekBtnMobile');
    
    if (prevBtn) {
        prevBtn.disabled = !canGoPrev;
    }
    if (prevBtnMobile) {
        prevBtnMobile.disabled = !canGoPrev;
    }
};

// ⭐ 新規追加: 次週ボタンの状態更新
FirebaseScheduleManager.prototype.updateNextWeekButton = function() {
    const todayWeekStart = this.getMondayOfWeek(new Date());
    const maxFutureDate = new Date(todayWeekStart);
    maxFutureDate.setDate(maxFutureDate.getDate() + (7 * 3)); // 3週先まで
    
    const nextWeekDate = new Date(this.currentStartDate);
    nextWeekDate.setDate(nextWeekDate.getDate() + 7);
    
    const canGoNext = nextWeekDate <= maxFutureDate;
    
    const nextBtn = document.getElementById('nextWeekBtn');
    const nextBtnMobile = document.getElementById('nextWeekBtnMobile');
    
    if (nextBtn) {
        nextBtn.disabled = !canGoNext;
    }
    if (nextBtnMobile) {
        nextBtnMobile.disabled = !canGoNext;
    }
};

// モーダル管理
FirebaseScheduleManager.prototype.openModal = function(member, date, time, existingEvent = null) {
    this.editStartTime = Date.now();
    
    if (existingEvent) {
        this.originalEventData = { ...existingEvent };
    } else {
        this.originalEventData = null;
    }
    
    const effectiveTime = existingEvent && existingEvent.startTime ? existingEvent.startTime : time;
    
    this.clickedCell = { 
        member, 
        date, 
        time: effectiveTime
    };
    
    if (existingEvent) {
        this.editingEvent = existingEvent;
        this.selectedType = existingEvent.type;
        
        document.getElementById('modalHeader').textContent = '予約編集';
        this.updateSelectedTimeDisplay();
        this.setupDeleteBtns(existingEvent);
        
        document.getElementById('surnameInput').value = existingEvent.surname || '';
        document.getElementById('firstnameInput').value = existingEvent.firstname || '';
        
        document.getElementById('repeatSelect').value = existingEvent.repeat || 'none';
        document.querySelectorAll('.type-option').forEach(o => {
            o.classList.remove('selected');
            if (o.dataset.type === existingEvent.type) o.classList.add('selected');
        });
        
        // ⭐ 新患トグルを設定
        const newPatientToggle = document.getElementById('newPatientToggle');
        const newPatientLabel = document.getElementById('newPatientLabel');
        if (existingEvent.isNewPatient) {
            newPatientToggle.checked = true;
            newPatientLabel.textContent = '新患';
        } else {
            newPatientToggle.checked = false;
            newPatientLabel.textContent = '既存患者';
        }
        
        // ⭐ 衝突チェックセクションの表示制御
        const conflictCheckSection = document.getElementById('conflictCheckSection');
        if (conflictCheckSection) {
            const repeatValue = existingEvent.repeat || 'none';
            if (repeatValue !== 'none') {
                conflictCheckSection.style.display = 'block';
            } else {
                conflictCheckSection.style.display = 'none';
            }
        }
        
        this.toggleInputs(existingEvent.type);
        
        if (existingEvent.startTime && existingEvent.endTime) {
            this.populateTimeRangeSelects(existingEvent.startTime, existingEvent.endTime);
        }
    } else {
        this.editingEvent = null;
        this.selectedType = null;
        document.getElementById('modalHeader').textContent = '予約追加';
        this.updateSelectedTimeDisplay();
        this.hideDeleteBtns();
        
        document.getElementById('surnameInput').value = '';
        document.getElementById('firstnameInput').value = '';
        
        // ⭐ 新患トグルをリセット
        const newPatientToggle = document.getElementById('newPatientToggle');
        const newPatientLabel = document.getElementById('newPatientLabel');
        newPatientToggle.checked = false;
        newPatientLabel.textContent = '既存患者';
        
        // ⭐ 衝突チェックトグルをリセット
        const conflictCheckToggle = document.getElementById('conflictCheckToggle');
        const conflictCheckLabel = document.getElementById('conflictCheckLabel');
        const conflictCheckSection = document.getElementById('conflictCheckSection');
        if (conflictCheckToggle && conflictCheckLabel && conflictCheckSection) {
            conflictCheckToggle.checked = true;
            conflictCheckLabel.textContent = 'ON（チェックする）';
            conflictCheckSection.style.display = 'none';
        }
        
        document.getElementById('repeatSelect').value = 'none';
        document.querySelectorAll('.type-option').forEach(o => o.classList.remove('selected'));
        document.getElementById('surnameSection').classList.remove('hidden');
        document.getElementById('firstnameSection').classList.remove('hidden');
        document.getElementById('timeRangeSection').style.display = 'none';
        document.getElementById('repeatSection').classList.remove('hidden');
    }
    
    const modal = document.getElementById('eventModal');
    modal.style.display = 'block';
    const modalContent = modal.querySelector('.modal-content');
    modalContent.scrollTop = 0;
    
    setTimeout(() => {
        if (!existingEvent) {
            if (!this.selectedType || ['20min', '40min', '60min', 'visit', 'workinjury20', 'workinjury40', 'accident', 'other'].includes(this.selectedType)) {
                const firstInput = document.getElementById('surnameInput');
                if (firstInput) {
                    firstInput.focus();
                }
            }
        }
    }, 300);
};

FirebaseScheduleManager.prototype.closeModal = function() {
    document.getElementById('eventModal').style.display = 'none';
    this.editingEvent = null;
    this.editStartTime = null;
    this.originalEventData = null;
};

FirebaseScheduleManager.prototype.toggleInputs = function(type) {
    const surname = document.getElementById('surnameSection');
    const firstname = document.getElementById('firstnameSection');
    const timeRange = document.getElementById('timeRangeSection');
    const repeat = document.getElementById('repeatSection');
    const newPatientSection = document.getElementById('newPatientSection');
    
    // ⭐ 新患トグルは対象の予定タイプでのみ表示
    const newPatientTypes = ['20min', '40min', '60min', 'visit', 'workinjury20', 'workinjury40', 'accident'];
    
    if (type === '20min' || type === '40min' || type === '60min' || type === 'visit' || type === 'workinjury20' || type === 'workinjury40' || type === 'accident' || type === 'other') {
        surname.classList.remove('hidden');
        firstname.classList.remove('hidden');
        timeRange.style.display = 'none';
        repeat.classList.remove('hidden');
        
        // ⭐ 新患トグルの表示制御
        if (newPatientTypes.includes(type)) {
            newPatientSection.style.display = 'block';
        } else {
            newPatientSection.style.display = 'none';
        }
    } else if (type === 'day' || type === 'meeting') {
        surname.classList.add('hidden');
        firstname.classList.add('hidden');
        timeRange.style.display = 'block';
        newPatientSection.style.display = 'none';
        
        // デイと担会は両方とも繰り返しを非表示
        repeat.classList.add('hidden');
        
        this.populateTimeRangeSelects(this.clickedCell.time, this.timeSlots[this.timeSlots.indexOf(this.clickedCell.time) + 1] || '18:00');
    }
};

FirebaseScheduleManager.prototype.updateSelectedTimeDisplay = function() {
    const display = document.getElementById('selectedTimeDisplay');
    if (!this.clickedCell) return;
    
    const date = this.createLocalDate(this.clickedCell.date);
    const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
    const member = this.clickedCell.member;
    
    if (!this.selectedType) {
        display.textContent = `${dateStr} ${this.clickedCell.time} - ${member}`;
        return;
    }

    if (this.selectedType === 'day' || this.selectedType === 'meeting') {
        const startSelect = document.getElementById('startTimeSelect');
        const endSelect = document.getElementById('endTimeSelect');
        
        if (startSelect && endSelect && startSelect.value && endSelect.value) {
            const typeName = this.selectedType === 'day' ? 'デイ' : '担当者会議';
            display.textContent = `${dateStr} ${member} | ${startSelect.value} - ${endSelect.value} (${typeName})`;
        } else {
            display.textContent = `${dateStr} ${member} | 時間範囲を選択してください`;
        }
    } else if (this.selectedType === '20min' || this.selectedType === '40min' || this.selectedType === '60min' ||
               this.selectedType === 'visit' ||
               this.selectedType === 'workinjury20' || this.selectedType === 'workinjury40' || 
               this.selectedType === 'accident' || this.selectedType === 'other') {
        const calculatedTimes = this.calculateModalStartEndTimeSequential(member, this.clickedCell.date, this.clickedCell.time, this.selectedType);
        const duration = (this.selectedType === '40min' || this.selectedType === 'workinjury40' || this.selectedType === 'visit') ? '40分' :
                        (this.selectedType === '60min') ? '60分' : '20分';
        display.textContent = `${dateStr} ${member} | ${calculatedTimes.startTime} - ${calculatedTimes.endTime} (${duration})`;
    }
};

FirebaseScheduleManager.prototype.populateTimeRangeSelects = function(startTime, endTime) {
    const startSelect = document.getElementById('startTimeSelect');
    const endSelect = document.getElementById('endTimeSelect');
    
    startSelect.innerHTML = '';
    this.timeSlots.forEach(time => {
        const option = document.createElement('option');
        option.value = time;
        option.textContent = time;
        if (time === startTime) option.selected = true;
        startSelect.appendChild(option);
    });
    
    this.updateEndTimeOptions(startTime);
    
    const endOptions = endSelect.querySelectorAll('option');
    endOptions.forEach(opt => {
        if (opt.value === endTime) opt.selected = true;
    });
    
    startSelect.addEventListener('change', (e) => {
        this.updateEndTimeOptions(e.target.value);
        this.updateSelectedTimeDisplay();
    });
    
    endSelect.addEventListener('change', () => {
        this.updateSelectedTimeDisplay();
    });
};

FirebaseScheduleManager.prototype.updateEndTimeOptions = function(startTime) {
    const endSelect = document.getElementById('endTimeSelect');
    const startIdx = this.timeSlots.indexOf(startTime);
    
    endSelect.innerHTML = '';
    for (let i = startIdx + 1; i < this.timeSlots.length; i++) {
        const option = document.createElement('option');
        option.value = this.timeSlots[i];
        option.textContent = this.timeSlots[i];
        endSelect.appendChild(option);
    }
    
    const finalOption = document.createElement('option');
    finalOption.value = '18:00';
    finalOption.textContent = '18:00';
    endSelect.appendChild(finalOption);
};

FirebaseScheduleManager.prototype.setupDeleteBtns = function(event) {
    this.hideDeleteBtns();
    if (this.isRepeating(event)) {
        document.getElementById('deleteSingleButton').style.display = 'inline-block';
        document.getElementById('deleteFromButton').style.display = 'inline-block';
    } else {
        document.getElementById('deleteButton').style.display = 'inline-block';
    }
};

FirebaseScheduleManager.prototype.hideDeleteBtns = function() {
    ['deleteButton', 'deleteSingleButton', 'deleteFromButton'].forEach(id => {
        document.getElementById(id).style.display = 'none';
    });
};

FirebaseScheduleManager.prototype.calculateModalStartEndTimeSequential = function(memberName, dateString, selectedTime, eventType) {
    const dayEvents = this.events
        .filter(e => e.member === memberName && e.date === dateString && 
                (e.type === '20min' || e.type === '40min' || e.type === '60min' ||
                 e.type === 'visit' ||
                 e.type === 'workinjury20' || e.type === 'workinjury40' || 
                 e.type === 'accident' || e.type === 'other'))
        .sort((a, b) => this.timeSlots.indexOf(a.time) - this.timeSlots.indexOf(b.time));
    
    const virtualEvent = { time: selectedTime, type: eventType };
    const allEvents = [...dayEvents, virtualEvent].sort((a, b) => this.timeSlots.indexOf(a.time) - this.timeSlots.indexOf(b.time));
    
    const result = [];
    let lastEndTime = null;
    
    allEvents.forEach((event, index) => {
        let startTime;
        
        if (index === 0 || !this.isConsecutiveEventForSequentialCalculation(allEvents, index, dateString, memberName)) {
            startTime = event.time;
            lastEndTime = null;
        } else {
            const [hour, minute] = lastEndTime.split(':').map(Number);
            const totalMinutes = hour * 60 + minute + 1;
            const adjustedHour = Math.floor(totalMinutes / 60);
            const adjustedMinute = totalMinutes % 60;
            startTime = `${adjustedHour.toString().padStart(2, '0')}:${adjustedMinute.toString().padStart(2, '0')}`;
        }
        
        const duration = (event.type === '40min' || event.type === 'workinjury40' || event.type === 'visit') ? 41 : 
                        (event.type === '60min') ? 61 : 21;
        const [startHour, startMinute] = startTime.split(':').map(Number);
        const endTotalMinutes = startHour * 60 + startMinute + duration;
        const endHour = Math.floor(endTotalMinutes / 60);
        const endMinute = endTotalMinutes % 60;
        const endTime = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`;
        
        lastEndTime = endTime;
        
        result.push({
            time: event.time,
            type: event.type,
            startTime,
            endTime
        });
    });
    
    const selectedResult = result.find(r => r.time === selectedTime && r.type === eventType);
    return selectedResult || { startTime: selectedTime, endTime: selectedTime };
};

FirebaseScheduleManager.prototype.isConsecutiveEventForSequentialCalculation = function(events, currentIndex, dateString, memberName) {
    if (currentIndex === 0) return false;
    
    const currentEvent = events[currentIndex];
    const prevEvent = events[currentIndex - 1];
    
    const currentTimeIndex = this.timeSlots.indexOf(currentEvent.time);
    const prevTimeIndex = this.timeSlots.indexOf(prevEvent.time);
    
    // ⭐ 訪問は開始セル + 4（最後の占有セルの次）が連続の開始
    // Excel出力と同じロジック
    const expectedNextIndex = (prevEvent.type === 'visit') ? prevTimeIndex + 4 :
                              (prevEvent.type === '60min') ? prevTimeIndex + 3 :
                              (prevEvent.type === '40min' || prevEvent.type === 'workinjury40') ? prevTimeIndex + 2 : 
                              prevTimeIndex + 1;
    
    if (currentTimeIndex !== expectedNextIndex) return false;
    
    for (let checkIndex = prevTimeIndex + 1; checkIndex < currentTimeIndex; checkIndex++) {
        const checkTime = this.timeSlots[checkIndex];
        const blockingEvent = this.events.find(e => 
            e.member === memberName && 
            e.date === dateString && 
            e.time === checkTime &&
            ['meeting', 'day', 'break'].includes(e.type)
        );
        if (blockingEvent) {
            return false;
        }
    }
    return true;
};
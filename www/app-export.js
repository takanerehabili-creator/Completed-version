// PDF/Excel出力機能(共有ダイアログ最終版)

FirebaseScheduleManager.prototype.exportExcel = async function() {
    try {
        this.showNotification('Excel出力中...', 'success');
        const wb = XLSX.utils.book_new();
        
        this.teamMembers.forEach(staff => {
            const memberName = `${staff.surname || ''}${staff.firstname || ''}`;
            const data = this.generateStaffExcelData(staff);
            // ⭐ cellDates: true オプションでDateオブジェクトを正しく処理
            const ws = XLSX.utils.aoa_to_sheet(data, { cellDates: true });
            
            // ⭐ 日付セルに日付フォーマットを適用
            for (let i = 0; i < 6; i++) {
                const col = i * 5; // A列, F列, K列, P列, U列, Z列
                const cellAddress = XLSX.utils.encode_cell({r: 0, c: col}); // A1, F1, K1...
                if (ws[cellAddress] && ws[cellAddress].v) {
                    ws[cellAddress].t = 'd'; // セルタイプを日付に
                    ws[cellAddress].z = 'yyyy/m/d'; // 日付フォーマット
                }
            }
            
            const colWidths = [];
            for (let i = 0; i < 6; i++) {
                colWidths.push(
                    {wch: 18},
                    {wch: 10},
                    {wch: 10},
                    {wch: 6},
                    {wch: 6}
                );
            }
            ws['!cols'] = colWidths;
            
            let sheetName = memberName || 'スタッフ';
            sheetName = sheetName.replace(/[\\\/\*\?\[\]]/g, '_').substring(0, 31);
            
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
        });
        
        const fileName = `schedule_staff_${this.formatDate(this.currentStartDate)}.xlsx`;
        
        if (isCapacitorApp) {
            try {
                const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                const base64 = await this.blobToBase64(blob);
                const base64Data = base64.split(',')[1];
                
                const Share = window.Capacitor?.Plugins?.Share;
                const Filesystem = window.Capacitor?.Plugins?.Filesystem;
                
                if (Filesystem) {
                    // ⭐ Step 1: DOCUMENTSフォルダに保存
                    const result = await Filesystem.writeFile({
                        path: fileName,
                        data: base64Data,
                        directory: 'DOCUMENTS'
                    });
                    
                    console.log('Excel file saved to DOCUMENTS:', result.uri);
                    
                    // 保存完了を通知
                    this.showNotification(`Excelファイルを保存しました\nDocuments/${fileName}`, 'success');
                    
                    // ⭐ Step 2: 共有メニューを表示（任意）
                    if (Share) {
                        setTimeout(async () => {
                            try {
                                await Share.share({
                                    title: fileName,
                                    text: 'Excelファイル',
                                    url: result.uri,
                                    dialogTitle: '共有または別の場所に保存'
                                });
                            } catch (shareErr) {
                                console.log('Share cancelled or failed:', shareErr);
                            }
                        }, 300);
                    }
                } else {
                    XLSX.writeFile(wb, fileName);
                }
                
            } catch (error) {
                console.error('Excel export error:', error);
                XLSX.writeFile(wb, fileName);
            }
        } else {
            XLSX.writeFile(wb, fileName);
            this.showNotification('Excelファイルをダウンロードしました', 'success');
        }
        
    } catch (error) {
        this.showNotification('Excel出力に失敗しました', 'error');
        console.error('Excelエラー:', error);
    }
};

FirebaseScheduleManager.prototype.exportPDF = async function() {
    try {
        this.showNotification('PDF出力中...', 'success');
        const {jsPDF} = window.jspdf;
        const doc = new jsPDF('landscape', 'mm', 'a4');
        await this.createPDF(doc, 0, true);
        await this.createPDF(doc, 3, false);
        
        const fileName = `schedule_${this.formatDate(this.currentStartDate)}.pdf`;
        
        if (isCapacitorApp) {
            try {
                const pdfOutput = doc.output('datauristring');
                const base64Data = pdfOutput.split(',')[1];
                
                const Share = window.Capacitor?.Plugins?.Share;
                const Filesystem = window.Capacitor?.Plugins?.Filesystem;
                
                if (Filesystem) {
                    // ⭐ Step 1: DOCUMENTSフォルダに保存
                    const result = await Filesystem.writeFile({
                        path: fileName,
                        data: base64Data,
                        directory: 'DOCUMENTS'
                    });
                    
                    console.log('PDF file saved to DOCUMENTS:', result.uri);
                    
                    // 保存完了を通知
                    this.showNotification(`PDFファイルを保存しました\nDocuments/${fileName}`, 'success');
                    
                    // ⭐ Step 2: 共有メニューを表示（任意）
                    if (Share) {
                        setTimeout(async () => {
                            try {
                                await Share.share({
                                    title: fileName,
                                    text: 'PDFファイル',
                                    url: result.uri,
                                    dialogTitle: '共有または別の場所に保存'
                                });
                            } catch (shareErr) {
                                console.log('Share cancelled or failed:', shareErr);
                            }
                        }, 300);
                    }
                } else {
                    doc.save(fileName);
                }
                
            } catch (error) {
                console.error('PDF export error:', error);
                doc.save(fileName);
            }
        } else {
            doc.save(fileName);
            this.showNotification('PDFを出力しました', 'success');
        }
        
    } catch (error) {
        this.showNotification('PDF出力に失敗しました', 'error');
        console.error('PDF export error:', error);
    }
};

// ヘルパー関数
FirebaseScheduleManager.prototype.blobToBase64 = function(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

// Excel data generation
FirebaseScheduleManager.prototype.generateStaffExcelData = function(staff) {
    const memberName = `${staff.surname || ''}${staff.firstname || ''}`;
    const workdays = staff.workdays || [1,2,3,4,5];
    
    const headerRow1 = [];
    const headerRow2 = [];
    
    for (let i = 0; i < 6; i++) {
        const date = new Date(this.currentStartDate);
        date.setDate(date.getDate() + i);
        const dayOfWeek = date.getDay();
        const days = ['日','月','火','水','木','金','土'];
        const isHol = this.isHoliday(this.formatDate(date));
        const holidayName = this.getHolidayName(this.formatDate(date));
        
        // ⭐ タイムゾーンの影響を受けないように、年月日を直接指定してDateオブジェクトを作成
        const excelDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        
        headerRow1.push(excelDate, '', '', '', '');
        headerRow2.push('名前', '開始時間', '終了時間', '単位', '種類');
    }
    
    const data = [headerRow1, headerRow2];
    
    const dailySchedules = {};
    for (let i = 0; i < 6; i++) {
        const date = new Date(this.currentStartDate);
        date.setDate(date.getDate() + i);
        const dayOfWeek = date.getDay();
        const dateString = this.formatDate(date);
        
        if (workdays.includes(dayOfWeek) && !this.isHoliday(dateString)) {
            const dayEvents = this.events
                .filter(e => e.member === memberName && e.date === dateString && 
                       (e.type === '20min' || e.type === '40min' || e.type === '60min' ||
                        e.type === 'visit' ||
                        e.type === 'workinjury20' || e.type === 'workinjury40' || 
                        e.type === 'accident'))
                .sort((a, b) => this.timeSlots.indexOf(a.time) - this.timeSlots.indexOf(b.time));
            
            dailySchedules[i] = this.calculateStartEndTimes(dayEvents, dateString, memberName);
        } else {
            dailySchedules[i] = [];
        }
    }
    
    const maxRows = Math.max(...Object.values(dailySchedules).map(schedule => schedule.length), 1);
    
    for (let rowIdx = 0; rowIdx < maxRows; rowIdx++) {
        const row = [];
        
        for (let i = 0; i < 6; i++) {
            const schedule = dailySchedules[i] || [];
            if (rowIdx < schedule.length) {
                const item = schedule[rowIdx];
                row.push(item.customerName, item.startTime, item.endTime, item.unit, item.type);
            } else {
                row.push('', '', '', '', '');
            }
        }
        
        data.push(row);
    }
    
    return data;
};

FirebaseScheduleManager.prototype.calculateStartEndTimes = function(events, dateString, memberName) {
    const result = [];
    let lastEndTime = null;
    
    events.forEach((event, index) => {
        let startTime;
        
        if (index === 0 || !this.isConsecutiveEvent(events, index, dateString, memberName)) {
            startTime = event.time;
            lastEndTime = null;
        } else {
            const [hour, minute] = lastEndTime.split(':').map(Number);
            const totalMinutes = hour * 60 + minute + 1;
            const adjustedHour = Math.floor(totalMinutes / 60);
            const adjustedMinute = totalMinutes % 60;
            startTime = `${adjustedHour.toString().padStart(2, '0')}:${adjustedMinute.toString().padStart(2, '0')}`;
        }
        
        // 労災20分・40分、60分、訪問にも対応
        const duration = (event.type === '40min' || event.type === 'workinjury40' || event.type === 'visit') ? 41 : 
                        (event.type === '60min') ? 61 : 21;
        const [startHour, startMinute] = startTime.split(':').map(Number);
        const endTotalMinutes = startHour * 60 + startMinute + duration;
        const endHour = Math.floor(endTotalMinutes / 60);
        const endMinute = endTotalMinutes % 60;
        const endTime = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`;
        
        lastEndTime = endTime;
        
        const customerName = event.surname && event.firstname ? 
            `${event.surname} ${event.firstname}` : 
            (event.surname || '');
        
        // 労災20分・40分、60分、訪問にも対応
        const unit = (event.type === '60min') ? 3 :
                     (event.type === '40min' || event.type === 'workinjury40' || event.type === 'visit') ? 2 : 1;
        
        let eventType = '';
        if (event.type === '20min' || event.type === '40min' || event.type === '60min') {
            eventType = '外';
        } else if (event.type === 'visit') {
            eventType = '訪';
        } else if (event.type === 'workinjury20' || event.type === 'workinjury40') {
            eventType = '労';
        } else if (event.type === 'accident') {
            eventType = '事';
        }
        
        result.push({
            customerName,
            startTime,
            endTime,
            unit,
            type: eventType
        });
    });
    
    return result;
};

FirebaseScheduleManager.prototype.isConsecutiveEvent = function(events, currentIndex, dateString, memberName) {
    if (currentIndex === 0) return false;
    
    const currentEvent = events[currentIndex];
    const prevEvent = events[currentIndex - 1];
    
    const currentTimeIndex = this.timeSlots.indexOf(currentEvent.time);
    const prevTimeIndex = this.timeSlots.indexOf(prevEvent.time);
    
    // ⭐ 訪問は開始セル + 3（最後の占有セルの次）が連続の開始
    // 例: 9:40開始の訪問 → 9:40, 10:00, 10:20を占有 → 次は10:40（9:40 + 4セル）
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

FirebaseScheduleManager.prototype.createPDF = async function(doc, startDay, isFirst) {
    return new Promise(async resolve => {
        try {
            const temp = document.createElement('div');
            temp.style.cssText = 'position:fixed;top:-20000px;width:1800px;background:#fff;font-family:sans-serif;border-radius:8px;overflow:hidden';
            document.body.appendChild(temp);
            
            const header = document.createElement('div');
            header.style.cssText = 'background:linear-gradient(135deg,#4285f4,#34a853);color:#fff;padding:4px;text-align:center;font-weight:bold;font-size:20px';
            const start = new Date(this.currentStartDate);
            start.setDate(start.getDate() + startDay);
            const end = new Date(this.currentStartDate);
            const endDay = Math.min(startDay + 2, 5);
            end.setDate(end.getDate() + endDay);
            const days = ['月','火','水','木','金','土'];
            
            const startEra = this.getJapaneseEra(start);
            const endEra = this.getJapaneseEra(end);
            
            header.textContent = `スケジュール表 ${startEra}${start.getMonth() + 1}/${start.getDate()}(${days[start.getDay()-1]}) - ${endEra}${end.getMonth() + 1}/${end.getDate()}(${days[end.getDay()-1]})`;
            temp.appendChild(header);
            
            const tableDiv = document.createElement('div');
            tableDiv.style.cssText = 'padding:2px;background:#fff';
            const table = document.createElement('table');
            table.style.cssText = 'border-collapse:collapse;width:100%;font-size:13px;font-family:sans-serif';
            table.innerHTML = this.build3DayPDF(startDay);
            tableDiv.appendChild(table);
            temp.appendChild(tableDiv);
            
            await new Promise(r => setTimeout(r, 2000));
            const canvas = await html2canvas(temp, {scale:1,useCORS:true,backgroundColor:'#fff',logging:false});
            
            if (!isFirst) doc.addPage();
            const pdfW = 287, pdfH = 200;
            const imgW = pdfW, imgH = (canvas.height * imgW) / canvas.width;
            if (imgH > pdfH) {
                const adjW = (canvas.width * pdfH) / canvas.height;
                const xOffset = (pdfW - adjW) / 2;
                doc.addImage(canvas.toDataURL('image/png'), 'PNG', 2 + xOffset, 2, adjW, pdfH);
            } else {
                // 下寄りに配置: yOffsetを計算して下に配置
                const yOffset = pdfH - imgH;
                doc.addImage(canvas.toDataURL('image/png'), 'PNG', 2, 2 + yOffset, imgW, imgH);
            }
            document.body.removeChild(temp);
        } catch (error) {
            console.error('PDF作成エラー:', error);
        }
        resolve();
    });
};

FirebaseScheduleManager.prototype.build3DayPDF = function(startDay) {
    const daysToShow = Math.min(3, 6 - startDay);
    const dailyStaff = [];
    let totalColumns = 0;
    
    for (let d = 0; d < daysToShow; d++) {
        const date = new Date(this.currentStartDate);
        date.setDate(date.getDate() + startDay + d);
        const dayOfWeek = date.getDay();
        const dateString = this.formatDate(date);
        const isHol = this.isHoliday(dateString);
        
        if (isHol) {
            dailyStaff.push([]);
            totalColumns += 1;
        } else {
            const staff = this.teamMembers.filter(m => (m.workdays || [1,2,3,4,5]).includes(dayOfWeek));
            dailyStaff.push(staff);
            totalColumns += staff.length;
        }
    }
    
    const cellW = totalColumns > 0 ? Math.floor(1750 / totalColumns) : 140;
    let html = '<thead><tr><th style="background:#4285f4;color:#fff;padding:10px;text-align:center;font-weight:bold;border:1px solid #ddd;width:50px;font-size:15px">時間</th>';
    
    for (let d = 0; d < daysToShow; d++) {
        const date = new Date(this.currentStartDate);
        date.setDate(date.getDate() + startDay + d);
        const days = ['日','月','火','水','木','金','土'];
        const dateStr = this.formatDate(date);
        const isHol = this.isHoliday(dateStr);
        const holidayName = this.getHolidayName(dateStr);
        const bg = isHol ? '#ff6b6b' : '#b3e5fc';
        const color = isHol ? '#fff' : '#000';
        const text = isHol ? `${date.getMonth() + 1}/${date.getDate()}(${days[date.getDay()]}) ${holidayName}` : `${date.getMonth() + 1}/${date.getDate()}(${days[date.getDay()]})`;
        
        const colspan = isHol ? 1 : Math.max(dailyStaff[d].length, 1);
        const borderRight = d < daysToShow - 1 ? 'border-right:5px solid #2c3e50;' : '';
        html += `<th style="background:${bg};color:${color};padding:8px;text-align:center;font-weight:bold;border:1px solid #ddd;${borderRight}font-size:15px" colspan="${colspan}">${text}</th>`;
        if (d < daysToShow - 1) {
            html += `<th style="background:#4285f4;color:#fff;padding:10px;text-align:center;font-weight:bold;border:1px solid #ddd;width:50px;font-size:15px">時間</th>`;
        }
    }
    
    html += '</tr><tr><th style="background:#34a853;color:#fff;padding:8px;text-align:center;font-weight:bold;border:1px solid #ddd;width:50px;font-size:13px"></th>';
    
    for (let d = 0; d < daysToShow; d++) {
        const date = new Date(this.currentStartDate);
        date.setDate(date.getDate() + startDay + d);
        const dateStr = this.formatDate(date);
        const isHol = this.isHoliday(dateStr);
        
        if (isHol) {
            const borderRight = d < daysToShow - 1 ? 'border-right:5px solid #2c3e50;' : '';
            html += `<th style="background:#ffc0cb;color:#666;padding:8px;text-align:center;font-weight:bold;border:1px solid #ddd;${borderRight}width:${cellW}px;font-size:14px;line-height:1.2">祝日</th>`;
        } else {
            dailyStaff[d].forEach((m, idx) => {
                const isLast = idx === dailyStaff[d].length - 1;
                const borderRight = (d < daysToShow - 1 && isLast) ? 'border-right:5px solid #2c3e50;' : '';
                
                html += `<th style="background:#fff;color:#000;padding:8px;text-align:center;font-weight:bold;border:1px solid #ddd;${borderRight}width:${cellW}px;font-size:14px;line-height:1.2">${m.surname}<br>${m.firstname}</th>`;
            });
        }
        if (d < daysToShow - 1) {
            html += `<th style="background:#34a853;color:#fff;padding:8px;text-align:center;font-weight:bold;border:1px solid #ddd;width:50px;font-size:13px"></th>`;
        }
    }
    html += '</tr></thead><tbody>';
    
    const processedCells = new Map();
    
    this.timeSlots.forEach((time, timeIdx) => {
        const isLunch = this.isLunchTime(time);
        const lunchBg = isLunch ? 'background:#f5f5f5;' : 'background:#fff;';
        html += `<tr><td style="${lunchBg}padding:6px;text-align:center;font-weight:bold;border:1px solid #ddd;width:50px;font-size:13px">${time}</td>`;
        
        for (let d = 0; d < daysToShow; d++) {
            const date = new Date(this.currentStartDate);
            date.setDate(date.getDate() + startDay + d);
            const dateString = this.formatDate(date);
            const isHol = this.isHoliday(dateString);
            
            if (isHol) {
                const borderRight = d < daysToShow - 1 ? 'border-right:5px solid #2c3e50;' : '';
                html += `<td style="${lunchBg}padding:2px;border:1px solid #ddd;${borderRight}width:${cellW}px;height:38px;background:#ffc0cb;text-align:center;vertical-align:middle;font-size:20px"></td>`;
            } else {
                dailyStaff[d].forEach((m, idx) => {
                    const memberName = `${m.surname || ''}${m.firstname || ''}`;
                    const cellKey = `${memberName}-${dateString}-${time}`;
                    
                    if (processedCells.has(cellKey)) {
                        return;
                    }
                    
                    const isLast = idx === dailyStaff[d].length - 1;
                const borderRight = (d < daysToShow - 1 && isLast) ? 'border-right:5px solid #2c3e50;' : '';
                
                // ⭐ この3行を追加
                const isDayCell = this.isDaySchedule(memberName, dateString, time);
                const isLeaveCell = this.isStaffLeave(memberName, dateString, time);
                const dayBg = isDayCell ? 'background:rgba(165,214,167,0.4);' : '';
                const leaveBg = isLeaveCell ? 'background:rgba(158,158,158,0.6);' : '';
                
                let cellStyle = `${lunchBg}${dayBg}${leaveBg}padding:2px;border:1px solid #ddd;${borderRight}width:${cellW}px;height:38px;position:relative;text-align:center;vertical-align:middle;font-size:20px`;
                let content = '';
                let rowspanAttr = '';
                    
                    const rangeEvent = this.events.find(e => 
                        e.member === memberName && 
                        e.date === dateString && 
                        e.startTime && 
                        e.endTime && 
                        e.startTime === time
                    );
                    
                    if (rangeEvent) {
                        const startIdx = this.timeSlots.indexOf(rangeEvent.startTime);
                        let endIdx = this.timeSlots.indexOf(rangeEvent.endTime);
                        if (endIdx === -1) endIdx = this.timeSlots.length;
                        const rowspan = endIdx - startIdx;
                        const cellH = (rowspan * 38) + ((rowspan - 1) * 2);
                        
                        for (let i = startIdx + 1; i < endIdx; i++) {
                            processedCells.set(`${memberName}-${dateString}-${this.timeSlots[i]}`, true);
                        }
                        
                        let eventBg = '';
                        let displayContent = '';
                        
                        if (rangeEvent.type === 'day') {
                            eventBg = '#a5d6a7';
                            displayContent = 'デイ';
                        } else if (rangeEvent.type === 'meeting') {
                            eventBg = '#bcaaa4';
                            displayContent = '担会';
                        } else if (rangeEvent.type === 'break') {
                            eventBg = '#ccc';
                            displayContent = '休み';
                        }
                        
                        content = `<div style="background:${eventBg};color:#000;padding:4px;border-radius:4px;height:${cellH}px;display:flex;align-items:center;justify-content:center;font-weight:bold;line-height:1.1;flex-direction:column;box-sizing:border-box;margin:-1px 0">${displayContent}</div>`;
                        rowspanAttr = ` rowspan="${rowspan}"`;
                        html += `<td${rowspanAttr} style="${cellStyle}">${content}</td>`;
                    } else {
                        // ⭐ 有給・公休が設定されている場合は予約データを表示しない
                        if (isLeaveCell) {
                            content = '';
                            html += `<td style="${cellStyle}">${content}</td>`;
                        } else {
                            const event = this.events.find(e => e.member === memberName && e.date === dateString && e.time === time);
                        
                            if (event) {
                                let eventBg = '', cellH = 38;
                            
                                // ⭐ 新患の場合は濃い色を使用
                                const isNewPatient = event.isNewPatient;
                            
                                switch (event.type) {
                                    case '20min': 
                                        eventBg = isNewPatient ? '#0288d1' : 'rgba(173,216,230,0.8)'; 
                                        break;
                                    case '40min': 
                                        eventBg = isNewPatient ? '#0288d1' : 'rgba(173,216,230,0.8)'; 
                                        cellH = 78;
                                        rowspanAttr = ' rowspan="2"';
                                        if (timeIdx + 1 < this.timeSlots.length) {
                                            processedCells.set(`${memberName}-${dateString}-${this.timeSlots[timeIdx + 1]}`, true);
                                        }
                                        break;
                                    case '60min': 
                                        eventBg = isNewPatient ? '#0288d1' : 'rgba(173,216,230,0.8)'; 
                                        cellH = 118;
                                        rowspanAttr = ' rowspan="3"';
                                        if (timeIdx + 1 < this.timeSlots.length) {
                                            processedCells.set(`${memberName}-${dateString}-${this.timeSlots[timeIdx + 1]}`, true);
                                        }
                                        if (timeIdx + 2 < this.timeSlots.length) {
                                            processedCells.set(`${memberName}-${dateString}-${this.timeSlots[timeIdx + 2]}`, true);
                                        }
                                        break;
                                    case 'visit':
                                        eventBg = isNewPatient ? '#f57c00' : 'rgba(255,204,128,0.8)';
                                        cellH = 118;
                                        rowspanAttr = ' rowspan="3"';
                                        if (timeIdx + 1 < this.timeSlots.length) {
                                            processedCells.set(`${memberName}-${dateString}-${this.timeSlots[timeIdx + 1]}`, true);
                                        }
                                        if (timeIdx + 2 < this.timeSlots.length) {
                                            processedCells.set(`${memberName}-${dateString}-${this.timeSlots[timeIdx + 2]}`, true);
                                        }
                                        break;
                                    case 'workinjury20': 
                                        eventBg = isNewPatient ? '#f9a825' : '#fff59d'; 
                                        break;
                                    case 'workinjury40': 
                                        eventBg = isNewPatient ? '#f9a825' : '#fff59d'; 
                                        cellH = 78;
                                        rowspanAttr = ' rowspan="2"';
                                        if (timeIdx + 1 < this.timeSlots.length) {
                                            processedCells.set(`${memberName}-${dateString}-${this.timeSlots[timeIdx + 1]}`, true);
                                        }
                                        break;
                                    case 'accident': eventBg = '#ffcdd2'; break;
                                    case 'crutch': eventBg = '#cfd8dc'; break;
                                    case 'other': eventBg = '#e1bee7'; break;
                                }
                            
                                // ⭐ 新患の場合は文字色を白に
                                const textColor = isNewPatient && (event.type === '20min' || event.type === '40min' || event.type === '60min' || event.type === 'visit') ? '#fff' : '#000';
                            
                                let displayContent = '';
                                if (event.type === '20min' || event.type === '40min' || event.type === '60min' ||
                                    event.type === 'visit' ||
                                    event.type === 'workinjury20' || event.type === 'workinjury40' || 
                                    event.type === 'accident' || event.type === 'crutch' || event.type === 'other') {
                                    const surname = event.surname || '';
                                    const firstname = event.firstname || '';
                                    const getSize = text => text.length <= 4 ? '13.5px' : text.length === 5 ? '11px' : '9px';
                                    const sDisplay = surname.substring(0, 10);
                                    const fDisplay = firstname.substring(0, 10);
                                    if (fDisplay) {
                                        displayContent = `<div style="line-height:1.1"><div style="font-size:${getSize(surname)}">${sDisplay}</div><div style="font-size:${getSize(firstname)}">${fDisplay}</div></div>`;
                                    } else {
                                        displayContent = `<div style="line-height:1.1"><div style="font-size:${getSize(surname)}">${sDisplay}</div></div>`;
                                    }
                                }
                            
                                content = `<div style="background:${eventBg};color:${textColor};padding:4px;border-radius:4px;height:${cellH}px;display:flex;align-items:center;justify-content:center;font-weight:bold;line-height:1.1;flex-direction:column">${displayContent}</div>`;
                                html += `<td${rowspanAttr} style="${cellStyle}">${content}</td>`;
                            } else {
                                content = `<div style="color:#ddd;font-size:12px;display:flex;align-items:center;justify-content:center;height:100%">${time}</div>`;
                                html += `<td style="${cellStyle}">${content}</td>`;
                            }
                        }
                    }
                });
            }
            if (d < daysToShow - 1) {
                html += `<td style="${lunchBg}padding:6px;text-align:center;font-weight:bold;border:1px solid #ddd;width:50px;font-size:13px">${time}</td>`;
            }
        }
        html += '</tr>';
    });
    return html + '</tbody>';
};

// 集計関数: 9:00~18:00の予定をカウント
FirebaseScheduleManager.prototype.calculateStaffCount = function(memberName, dateString) {
    let count = 0;
    
    // 9:00~18:00の範囲内の予定を取得
    const targetEvents = this.events.filter(e => {
        if (e.member !== memberName || e.date !== dateString) return false;
        if (!e.time) return false;
        
        const timeIdx = this.timeSlots.indexOf(e.time);
        // 9:00は index 0、18:00は index 27
        return timeIdx >= 0 && timeIdx <= 27;
    });
    
    targetEvents.forEach(event => {
        if (event.type === '20min') {
            count += 1;
        } else if (event.type === '40min') {
            count += 2;
        } else if (event.type === '60min') {
            count += 3;
        } else if (event.type === 'visit') {
            count += 2;
        } else if (event.type === 'workinjury20') {
            count += 1;
        } else if (event.type === 'workinjury40') {
            count += 2;
        } else if (event.type === 'accident') {
            count += 1;
        } else if (event.type === 'other') {
            count += 1;
        }
        // デイ、担会、休みは0なので何もしない
    });
    
    return count;
};
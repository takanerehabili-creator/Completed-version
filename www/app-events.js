// イベント保存・削除機能(FirebaseScheduleManagerクラスに追加するメソッド)

FirebaseScheduleManager.prototype.saveEvent = async function() {
    // ⭐ ローディング状態を開始
    const saveBtn = document.getElementById('saveEventBtn');
    if (saveBtn) {
        saveBtn.classList.add('loading');
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="spinner"></span>保存中...';
    }
    
    if (!this.selectedType) {
        this.showNotification('予定種類を選択してください', 'error');
        // ⭐ ローディング状態を解除
        if (saveBtn) {
            saveBtn.classList.remove('loading');
            saveBtn.disabled = false;
            saveBtn.textContent = '保存';
        }
        return;
    }

    const {member, date, time} = this.clickedCell;
    if (this.isHoliday(date)) {
        this.showNotification('祝日には予定を追加できません', 'error');
        // ⭐ ローディング状態を解除
        if (saveBtn) {
            saveBtn.classList.remove('loading');
            saveBtn.disabled = false;
            saveBtn.textContent = '保存';
        }
        return;
    }
    
    // ⭐ 有給・公休日チェック
    const hasStaffLeave = this.isStaffLeave(member, date, time);
    if (hasStaffLeave) {
        this.showNotification("この時間枠は休み設定されており、予定を追加できません", "error");
        // ⭐ ローディング状態を解除
        if (saveBtn) {
            saveBtn.classList.remove('loading');
            saveBtn.disabled = false;
            saveBtn.textContent = '保存';
        }
        return;
    }

    let surname = '', firstname = '', displayName = '';
    let startTime = '', endTime = '';
    
    if (this.selectedType === 'day' || this.selectedType === 'meeting') {
        startTime = document.getElementById('startTimeSelect').value;
        endTime = document.getElementById('endTimeSelect').value;
        
        if (!startTime || !endTime) {
            this.showNotification('開始時刻と終了時刻を選択してください', 'error');
            // ⭐ ローディング状態を解除
            if (saveBtn) {
                saveBtn.classList.remove('loading');
                saveBtn.disabled = false;
                saveBtn.textContent = '保存';
            }
            return;
        }
        
        const startIdx = this.timeSlots.indexOf(startTime);
        let endIdx = this.timeSlots.indexOf(endTime);
        if (endIdx === -1 && endTime === '18:00') {
            endIdx = this.timeSlots.length;
        }
        
        if (startIdx >= endIdx) {
            this.showNotification('終了時刻は開始時刻より後を選択してください', 'error');
            // ⭐ ローディング状態を解除
            if (saveBtn) {
                saveBtn.classList.remove('loading');
                saveBtn.disabled = false;
                saveBtn.textContent = '保存';
            }
            return;
        }
        
        displayName = this.selectedType === 'meeting' ? '担会' : '';
    } else if (this.selectedType === '20min' || this.selectedType === '40min' || this.selectedType === '60min' ||
               this.selectedType === 'visit' ||
               this.selectedType === 'workinjury20' || this.selectedType === 'workinjury40' || 
               this.selectedType === 'accident' || this.selectedType === 'other') {
        surname = document.getElementById('surnameInput').value.trim();
        firstname = document.getElementById('firstnameInput').value.trim();
        
        if (!surname) {
            this.showNotification('姓を入力してください', 'error');
            const surnameInput = document.getElementById('surnameInput');
            if (surnameInput) {
                surnameInput.focus();
            }
            // ⭐ ローディング状態を解除
            if (saveBtn) {
                saveBtn.classList.remove('loading');
                saveBtn.disabled = false;
                saveBtn.textContent = '保存';
            }
            return;
        }
        displayName = firstname ? `${surname}${firstname}` : surname;
    }

    const repeat = document.getElementById('repeatSelect').value;

    if (this.editingEvent && this.editingEvent.id) {
        const currentEvent = this.events.find(e => e.id === this.editingEvent.id);
        
        if (currentEvent && currentEvent.lastModified && currentEvent.lastModified > this.editStartTime) {
            const originalInfo = this.originalEventData ? 
                `元の内容: ${this.originalEventData.surname || ''} ${this.originalEventData.firstname || ''}` :
                '元の内容: (不明)';
            const currentInfo = `現在の内容: ${currentEvent.surname || ''} ${currentEvent.firstname || ''}`;
            const yourEdit = `あなたの編集: ${surname || ''} ${firstname || ''}`;
            
            const userChoice = confirm(
                '⚠️ この予約は他の端末で編集されています。\n' +
                '上書きしますか?\n\n' +
                `${originalInfo}\n` +
                `${currentInfo}\n` +
                `${yourEdit}`
            );
            
            if (!userChoice) {
                this.closeModal();
                this.showNotification('編集をキャンセルしました', 'info');
                // ⭐ ローディング状態を解除
                if (saveBtn) {
                    saveBtn.classList.remove('loading');
                    saveBtn.disabled = false;
                    saveBtn.textContent = '保存';
                }
                return;
            }
        }
    }

    try {
        updateSyncStatus('syncing');
        
        if (this.selectedType === 'day' || this.selectedType === 'meeting') {
            const conflict = this.checkTimeRangeConflict(member, date, startTime, endTime, this.editingEvent ? this.editingEvent.id : null);
            if (conflict) {
                this.showNotification('その時間範囲には既にデイ/担会があります', 'error');
                updateSyncStatus('synced');
                // ⭐ ローディング状態を解除
                if (saveBtn) {
                    saveBtn.classList.remove('loading');
                    saveBtn.disabled = false;
                    saveBtn.textContent = '保存';
                }
                return;
            }
            
            const eventData = {
                surname: '', firstname: '', member, displayName, date,
                startTime, endTime,
                type: this.selectedType, 
                repeat: this.selectedType === 'day' ? repeat : 'none',
                createdAt: new Date(),
                updatedAt: new Date()
            };
            
            if (this.editingEvent) {
                eventData.id = this.editingEvent.id;
                
                const oldRepeat = this.editingEvent.repeat || 'none';
                const newRepeat = eventData.repeat;
                
                await this.saveEventToFirestore(eventData);
                
                if (oldRepeat === 'none' && newRepeat !== 'none') {
                    this.showNotification('繰り返し予定を生成中...（6ヶ月分）', 'info');
                    await this.generateRepeatingRangeEvents(eventData, eventData.id, date);
                    this.showNotification('予定を更新し、繰り返しイベントを生成しました（6ヶ月分）', 'success');
                } else if (oldRepeat !== 'none' && newRepeat === 'none') {
                    await this.deleteRelatedRepeatingEvents(eventData.id, date);
                    this.showNotification('予定を更新し、繰り返しイベントを削除しました', 'success');
                } else {
                    this.showNotification('予定を更新しました', 'success');
                }
            } else {
                const newId = await this.saveEventToFirestore(eventData);
                
                if (this.selectedType === 'day' && repeat !== 'none') {
                    this.showNotification('繰り返し予定を生成中...（6ヶ月分）', 'info');
                    await this.generateRepeatingRangeEvents(eventData, newId, date);
                    this.showNotification('予定を追加しました（6ヶ月分の繰り返し）', 'success');
                } else {
                    this.showNotification('予定を追加しました', 'success');
                }
            }
        } else {
            const conflict = this.events.find(e => 
                e.member === member && e.date === date && e.time === time && e.id !== (this.editingEvent ? this.editingEvent.id : null)
            );
            if (conflict) {
                this.showNotification('その時間には既に予定があります', 'error');
                updateSyncStatus('synced');
                return;
            }

            const eventData = {
                surname, firstname, member, displayName, date, time,
                type: this.selectedType, repeat,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            
            // ⭐ 新患フラグを設定（OFFの場合は明示的にfalseを設定）
            const newPatientToggle = document.getElementById('newPatientToggle');
            if (newPatientToggle) {
                if (newPatientToggle.checked) {
                    eventData.isNewPatient = true;
                } else {
                    eventData.isNewPatient = false;
                }
            }

            if (this.editingEvent) {
                eventData.id = this.editingEvent.id;
                
                const oldRepeat = this.editingEvent.repeat || 'none';
                const newRepeat = eventData.repeat;
                
                await this.saveEventToFirestore(eventData);
                
                if (oldRepeat === 'none' && newRepeat !== 'none') {
                    // ⭐ 繰り返し予定保存用のオーバーレイを表示
                    showRepeatSaveOverlay('6ヶ月分の繰り返し予定を生成中...');
                    
                    this.showNotification('繰り返し予定を生成中...（6ヶ月分）', 'info');
                    await this.generateRepeatingInFirestore(eventData, eventData.id, date);
                    this.showNotification('予定を更新し、繰り返しイベントを生成しました（6ヶ月分）', 'success');
                    
                    // ⭐ オーバーレイを非表示
                    hideRepeatSaveOverlay();
                } else if (oldRepeat !== 'none' && newRepeat === 'none') {
                    // ⭐ オーバーレイを表示
                    showRepeatSaveOverlay('繰り返しイベントを削除中...');
                    
                    await this.deleteRelatedRepeatingEvents(eventData.id, date);
                    this.showNotification('予定を更新し、繰り返しイベントを削除しました', 'success');
                    
                    // ⭐ オーバーレイを非表示
                    hideRepeatSaveOverlay();
                } else {
                    this.showNotification('予定を更新しました', 'success');
                }
            } else {
                const newId = await this.saveEventToFirestore(eventData);
                if (repeat !== 'none') {
                    // ⭐ 繰り返し予定保存用のオーバーレイを表示
                    showRepeatSaveOverlay('繰り返し予定を確認中...');
                    
                    // 繰り返し予定には常に衝突チェックを実行
                    this.showNotification('繰り返し予定を生成中...（6ヶ月分）', 'info');
                    
                    const conflicts = await this.checkRepeatConflicts(eventData, newId, date);
                    if (conflicts && conflicts.length > 0) {
                        // ⭐ オーバーレイを非表示にして衝突モーダルを表示
                        hideRepeatSaveOverlay();
                        
                        // ⭐ 衝突チェック中の表示を更新
                        if (saveBtn) {
                            saveBtn.innerHTML = '<span class="spinner"></span>衝突を検出しました';
                        }
                        this.showConflictModal(conflicts, async (action) => {
                            if (action === 'replace') {
                                // ⭐ オーバーレイを再表示
                                showRepeatSaveOverlay('既存の予定を置き換え中...');
                                
                                // ⭐ 置き換え処理中の表示
                                if (saveBtn) {
                                    saveBtn.innerHTML = '<span class="spinner"></span>置き換え中...';
                                }
                                this.showNotification('繰り返し予定を生成中...（既存を置き換え）', 'info');
                                for (const c of conflicts) await db.collection('events').doc(c.id).delete();
                                await this.generateRepeatingInFirestore(eventData, newId, date);
                                this.showNotification('繰り返し予定を作成しました（既存を置き換え）', 'success');
                                
                                // ⭐ オーバーレイを非表示
                                hideRepeatSaveOverlay();
                                
                                // ⭐ ローディング状態を解除
                                if (saveBtn) {
                                    saveBtn.classList.remove('loading');
                                    saveBtn.disabled = false;
                                    saveBtn.textContent = '保存';
                                }
                                this.closeModal();
                                location.reload();
                            } else if (action === 'skip') {
                                // ⭐ オーバーレイを再表示
                                showRepeatSaveOverlay('衝突日をスキップして保存中...');
                                
                                // ⭐ スキップ処理中の表示
                                if (saveBtn) {
                                    saveBtn.innerHTML = '<span class="spinner"></span>スキップ中...';
                                }
                                this.showNotification('繰り返し予定を生成中...（衝突日をスキップ）', 'info');
                                await this.generateRepeatingWithSkip(eventData, newId, date, conflicts);
                                this.showNotification('繰り返し予定を作成しました（衝突日をスキップ）', 'success');
                                
                                // ⭐ オーバーレイを非表示
                                hideRepeatSaveOverlay();
                                
                                // ⭐ ローディング状態を解除
                                if (saveBtn) {
                                    saveBtn.classList.remove('loading');
                                    saveBtn.disabled = false;
                                    saveBtn.textContent = '保存';
                                }
                                this.closeModal();
                                location.reload();
                            } else {
                                // ⭐ キャンセル時にもオーバーレイを非表示
                                hideRepeatSaveOverlay();
                                
                                await db.collection('events').doc(newId).delete();
                                this.showNotification('繰り返し設定をキャンセルしました', 'info');
                                // ⭐ ローディング状態を解除
                                if (saveBtn) {
                                    saveBtn.classList.remove('loading');
                                    saveBtn.disabled = false;
                                    saveBtn.textContent = '保存';
                                }
                            }
                        });
                        return;
                    }
                    
                    // ⭐ オーバーレイのメッセージを更新
                    showRepeatSaveOverlay('6ヶ月分の繰り返し予定を生成中...');
                    
                    await this.generateRepeatingInFirestore(eventData, newId, date);
                    this.showNotification('繰り返し予定を作成しました（6ヶ月分）', 'success');
                    
                    // ⭐ オーバーレイを非表示
                    hideRepeatSaveOverlay();
                } else {
                    this.showNotification('予定を追加しました', 'success');
                }
            }
        }
        
        updateSyncStatus('synced');
        // ⭐ ローディング状態を解除
        if (saveBtn) {
            saveBtn.classList.remove('loading');
            saveBtn.disabled = false;
            saveBtn.textContent = '保存';
        }
        
    } catch (error) {
        this.showNotification('予定の保存に失敗しました', 'error');
        updateSyncStatus('error');
        console.error('Save event error:', error);
        
        // ⭐ エラー時にオーバーレイを非表示
        hideRepeatSaveOverlay();
        
        // ⭐ エラー時もローディング状態を解除
        if (saveBtn) {
            saveBtn.classList.remove('loading');
            saveBtn.disabled = false;
            saveBtn.textContent = '保存';
        }
    }

    // ⭐ モーダルクローズ時にもオーバーレイを確実に非表示
    hideRepeatSaveOverlay();
    
    this.closeModal();
};

// 繰り返しイベント生成(基準日から正確に計算) - memberを保持
FirebaseScheduleManager.prototype.generateRepeatingRangeEvents = async function(baseEvent, parentId, baseDate) {
    const batch = db.batch();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 3);
    
    const baseDateTime = this.createLocalDate(baseDate);
    const baseDayOfWeek = baseDateTime.getDay();
    const intervalDays = this.getInterval(baseEvent.repeat);
    let occurrenceCount = 1;
    
    console.log(`Generating repeating range events from base date: ${baseDate} (day: ${baseDayOfWeek}), member: ${baseEvent.member}, interval: ${intervalDays} days`);
    
    while (true) {
        const nextDate = new Date(baseDateTime);
        nextDate.setDate(baseDateTime.getDate() + (intervalDays * occurrenceCount));
        
        if (nextDate > endDate) break;
        
        const dateStr = this.formatDate(nextDate);
        const nextDayOfWeek = nextDate.getDay();
        
        if (nextDayOfWeek === baseDayOfWeek && !this.isHoliday(dateStr)) {
            const docRef = db.collection('events').doc();
            batch.set(docRef, {
                ...baseEvent,
                date: dateStr,
                member: baseEvent.member,
                repeatParent: parentId,
                createdAt: new Date(),
                updatedAt: new Date(),
                lastModified: Date.now()
            });
            console.log(`Generated event for ${dateStr} (occurrence ${occurrenceCount}, day: ${nextDayOfWeek}, member: ${baseEvent.member})`);
        } else {
            console.log(`Skipped ${dateStr} - day mismatch (expected: ${baseDayOfWeek}, got: ${nextDayOfWeek}) or holiday`);
        }
        
        occurrenceCount++;
    }

    try {
        await batch.commit();
        console.log(`Generated repeating range events (holidays and day mismatches skipped)`);
    } catch (error) {
        console.error('Generate repeating range events error:', error);
    }
};

FirebaseScheduleManager.prototype.generateRepeatingInFirestore = async function(baseEvent, parentId, baseDate) {
    const batch = db.batch();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 3);
    
    const baseDateTime = this.createLocalDate(baseDate);
    const baseDayOfWeek = baseDateTime.getDay();
    const intervalDays = this.getInterval(baseEvent.repeat);
    let occurrenceCount = 1;
    
    console.log(`Generating repeating events from base date: ${baseDate} (day: ${baseDayOfWeek}), member: ${baseEvent.member}, interval: ${intervalDays} days`);
    
    while (true) {
        const nextDate = new Date(baseDateTime);
        nextDate.setDate(baseDateTime.getDate() + (intervalDays * occurrenceCount));
        
        if (nextDate > endDate) break;
        
        const dateStr = this.formatDate(nextDate);
        const nextDayOfWeek = nextDate.getDay();
        
        if (nextDayOfWeek === baseDayOfWeek && !this.isHoliday(dateStr)) {
            const docRef = db.collection('events').doc();
            batch.set(docRef, {
                ...baseEvent,
                date: dateStr,
                member: baseEvent.member,
                repeatParent: parentId,
                createdAt: new Date(),
                updatedAt: new Date(),
                lastModified: Date.now()
            });
            console.log(`Generated event for ${dateStr} (occurrence ${occurrenceCount}, day: ${nextDayOfWeek}, member: ${baseEvent.member})`);
        } else {
            console.log(`Skipped ${dateStr} - day mismatch (expected: ${baseDayOfWeek}, got: ${nextDayOfWeek}) or holiday`);
        }
        
        occurrenceCount++;
    }

    try {
        await batch.commit();
        console.log(`Generated repeating events (holidays and day mismatches skipped)`);
    } catch (error) {
        console.error('Generate repeating events error:', error);
    }
};

FirebaseScheduleManager.prototype.saveEventToFirestore = async function(eventData) {
    try {
        const dataWithTimestamp = {
            ...eventData,
            lastModified: Date.now()
        };
        
        if (dataWithTimestamp.id && dataWithTimestamp.id.includes('temp_')) {
            delete dataWithTimestamp.id;
            const docRef = await db.collection('events').add(dataWithTimestamp);
            return docRef.id;
        } else if (dataWithTimestamp.id) {
            await db.collection('events').doc(dataWithTimestamp.id).set(dataWithTimestamp, { merge: true });
            return dataWithTimestamp.id;
        } else {
            const docRef = await db.collection('events').add(dataWithTimestamp);
            return docRef.id;
        }
    } catch (error) {
        console.error('Save event error:', error);
        throw error;
    }
};

FirebaseScheduleManager.prototype.deleteEventFromFirestore = async function(eventId) {
    try {
        await db.collection('events').doc(eventId).delete();
    } catch (error) {
        console.error('Delete event error:', error);
        throw error;
    }
};

FirebaseScheduleManager.prototype.deleteEvent = async function() {
    if (!this.editingEvent || !this.editingEvent.id) return;
    if (confirm('この予定を削除しますか?')) {
        try {
            const eventId = this.editingEvent.id;
            
            updateSyncStatus('syncing');
            await this.deleteEventFromFirestore(eventId);
            
            // ⭐ ローカルキャッシュを即座に更新
            this.events = this.events.filter(e => e.id !== eventId);
            
            // ⭐ 週キャッシュも更新
            for (const [weekKey, weekEvents] of this.weekCache.entries()) {
                const filtered = weekEvents.filter(e => e.id !== eventId);
                this.weekCache.set(weekKey, filtered);
            }
            
            // ⭐ 削除されたIDをトラッキング（リスナーからの復活を防ぐ）
            if (!this.deletedEventIds) {
                this.deletedEventIds = new Set();
            }
            this.deletedEventIds.add(eventId);
            
            // 5秒後にトラッキングをクリア（リスナーが安定するまで）
            setTimeout(() => {
                if (this.deletedEventIds) {
                    this.deletedEventIds.delete(eventId);
                }
            }, 5000);
            
            updateSyncStatus('synced');
            this.showNotification('予定を削除しました', 'success');
            this.closeModal();
            
            // ⭐ 即座にテーブルを再描画
            if (this.tableReadyForDisplay) {
                this.renderTable();
            }
        } catch (error) {
            updateSyncStatus('error');
            this.showNotification('予定の削除に失敗しました', 'error');
        }
    }
};

FirebaseScheduleManager.prototype.deleteSingle = async function() {
    if (!this.editingEvent || !this.editingEvent.id) return;
    
    if (!confirm('この日の予定のみを削除しますか?')) {
        return;
    }

    const eventId = this.editingEvent.id;
    
    this.closeModal();
    
    try {
        updateSyncStatus('syncing');
        
        console.log('Deleting single event:', eventId);
        
        await this.deleteEventFromFirestore(eventId);
        
        // ⭐ ローカルキャッシュを即座に更新
        this.events = this.events.filter(e => e.id !== eventId);
        
        // ⭐ 週キャッシュも更新
        for (const [weekKey, weekEvents] of this.weekCache.entries()) {
            const filtered = weekEvents.filter(e => e.id !== eventId);
            this.weekCache.set(weekKey, filtered);
        }
        
        // ⭐ 削除されたIDをトラッキング（リスナーからの復活を防ぐ）
        if (!this.deletedEventIds) {
            this.deletedEventIds = new Set();
        }
        this.deletedEventIds.add(eventId);
        
        // 5秒後にトラッキングをクリア（リスナーが安定するまで）
        setTimeout(() => {
            if (this.deletedEventIds) {
                this.deletedEventIds.delete(eventId);
            }
        }, 5000);
        
        updateSyncStatus('synced');
        this.showNotification('この日の予定のみを削除しました', 'success');
        
        // ⭐ 即座にテーブルを再描画
        if (this.tableReadyForDisplay) {
            this.renderTable();
        }
        
    } catch (error) {
        updateSyncStatus('error');
        console.error('Delete single event error:', error);
        this.showNotification('予定の削除に失敗しました', 'error');
    }
};

FirebaseScheduleManager.prototype.deleteFrom = async function() {
    if (!this.editingEvent || !this.editingEvent.id) return;
    
    const current = {
        id: this.editingEvent.id,
        date: this.editingEvent.date,
        member: this.editingEvent.member,
        type: this.editingEvent.type,
        repeatParent: this.editingEvent.repeatParent
    };
    const cutoffDateStr = current.date;
    
    if (!confirm(`${cutoffDateStr}以降の繰り返し予定を全て削除しますか?`)) {
        return;
    }
    
    this.closeModal();
    
    try {
        updateSyncStatus('syncing');
        showLoading('削除対象を検索中...');
        
        console.log('=== Starting deleteFrom (Improved Version) ===');
        console.log('Current event:', current);
        console.log('Cutoff date:', cutoffDateStr);
        
        const parentId = current.repeatParent || current.id;
        console.log('Parent ID:', parentId);
        
        const allRelatedEvents = [];
        const deletedEventIds = new Set();
        
        const searchEndDate = new Date(this.createLocalDate(cutoffDateStr));
        searchEndDate.setFullYear(searchEndDate.getFullYear() + 1);
        const searchEndStr = this.formatDate(searchEndDate);
        
        console.log('Search range:', cutoffDateStr, 'to', searchEndStr);
        
        try {
            const query1 = await db.collection('events')
                .where('repeatParent', '==', parentId)
                .get();
            
            console.log(`Query 1 (repeatParent): ${query1.size} documents`);
            
            query1.forEach(doc => {
                const data = doc.data();
                if (data.date >= cutoffDateStr) {
                    allRelatedEvents.push({ id: doc.id, ...data });
                    deletedEventIds.add(doc.id);
                    console.log(`Added: ${doc.id} (${data.date})`);
                }
            });
        } catch (error) {
            console.error('Query 1 error:', error);
        }
        
        try {
            const parentDoc = await db.collection('events').doc(parentId).get();
            if (parentDoc.exists) {
                const parentData = { id: parentDoc.id, ...parentDoc.data() };
                console.log(`Parent event date: ${parentData.date}`);
                if (parentData.date >= cutoffDateStr) {
                    const exists = allRelatedEvents.find(e => e.id === parentData.id);
                    if (!exists) {
                        allRelatedEvents.push(parentData);
                        deletedEventIds.add(parentDoc.id);
                        console.log(`Added parent: ${parentDoc.id} (${parentData.date})`);
                    }
                }
            }
        } catch (error) {
            console.error('Parent check error:', error);
        }
        
        if (current.member && current.type) {
            try {
                console.log('Additional search by member and type...');
                const query3 = await db.collection('events')
                    .where('member', '==', current.member)
                    .where('type', '==', current.type)
                    .where('date', '>=', cutoffDateStr)
                    .where('date', '<=', searchEndStr)
                    .get();
                
                console.log(`Query 3 (member/type/date): ${query3.size} documents`);
                
                query3.forEach(doc => {
                    const data = doc.data();
                    if ((data.repeatParent === parentId) || (doc.id === parentId)) {
                        if (!deletedEventIds.has(doc.id)) {
                            allRelatedEvents.push({ id: doc.id, ...data });
                            deletedEventIds.add(doc.id);
                            console.log(`Added from query3: ${doc.id} (${data.date})`);
                        }
                    }
                });
            } catch (error) {
                console.error('Query 3 error:', error);
            }
        }
        
        console.log(`Total events to delete: ${allRelatedEvents.length}`);
        console.log('Event details:', allRelatedEvents.map(e => `${e.id} (${e.date})`));
        
        if (allRelatedEvents.length === 0) {
            hideLoading();
            updateSyncStatus('synced');
            this.showNotification('削除対象の繰り返し予定が見つかりませんでした', 'info');
            return;
        }
        
        showLoading(`${allRelatedEvents.length}件の予定を削除中...`);
        let deletedCount = 0;
        
        for (let i = 0; i < allRelatedEvents.length; i += 500) {
            const batch = db.batch();
            const batchEvents = allRelatedEvents.slice(i, i + 500);
            
            batchEvents.forEach(event => {
                const ref = db.collection('events').doc(event.id);
                batch.delete(ref);
            });
            
            await batch.commit();
            deletedCount += batchEvents.length;
            showLoading(`削除中... ${deletedCount}/${allRelatedEvents.length}`);
            console.log(`Batch ${Math.floor(i/500) + 1} committed: ${deletedCount}/${allRelatedEvents.length}`);
        }
        
        console.log('All batches committed. Cleaning cache...');
        
        this.weekCache.forEach((weekEvents, weekKey) => {
            const beforeCount = weekEvents.length;
            const filtered = weekEvents.filter(e => !deletedEventIds.has(e.id));
            this.weekCache.set(weekKey, filtered);
            if (beforeCount !== filtered.length) {
                console.log(`Cleaned week ${weekKey}: ${beforeCount} -> ${filtered.length}`);
            }
        });
        
        const beforeEventsCount = this.events.length;
        this.events = this.events.filter(e => !deletedEventIds.has(e.id));
        console.log(`Cleaned this.events: ${beforeEventsCount} -> ${this.events.length}`);
        
        this.renderTable();
        
        hideLoading();
        updateSyncStatus('synced');
        console.log('=== deleteFrom completed successfully ===');
        this.showNotification(`この日以降の繰り返し予定を削除しました(${deletedCount}件)`, 'success');
        
    } catch (error) {
        hideLoading();
        updateSyncStatus('error');
        console.error('=== deleteFrom error ===', error);
        this.showNotification('繰り返し予定の削除に失敗しました: ' + error.message, 'error');
    }
};

FirebaseScheduleManager.prototype.deleteRelatedRepeatingEvents = async function(parentId, excludeDate) {
    try {
        const query = await db.collection('events')
            .where('repeatParent', '==', parentId)
            .get();
        
        const batch = db.batch();
        let deleteCount = 0;
        
        query.forEach(doc => {
            const eventData = doc.data();
            if (eventData.date !== excludeDate) {
                batch.delete(doc.ref);
                deleteCount++;
            }
        });
        
        if (deleteCount > 0) {
            await batch.commit();
            console.log(`Deleted ${deleteCount} related repeating events`);
        }
    } catch (error) {
        console.error('Delete related repeating events error:', error);
        throw error;
    }
};

FirebaseScheduleManager.prototype.checkTimeRangeConflict = function(member, date, startTime, endTime, excludeId = null) {
    const startIdx = this.timeSlots.indexOf(startTime);
    let endIdx = this.timeSlots.indexOf(endTime);
    if (endIdx === -1 && endTime === '18:00') {
        endIdx = this.timeSlots.length;
    }
    
    return this.events.find(e => {
        if (e.id === excludeId) return false;
        if (e.member !== member || e.date !== date) return false;
        if (!e.startTime || !e.endTime) return false;
        
        const eStartIdx = this.timeSlots.indexOf(e.startTime);
        let eEndIdx = this.timeSlots.indexOf(e.endTime);
        if (eEndIdx === -1 && e.endTime === '18:00') {
            eEndIdx = this.timeSlots.length;
        }
        
        return (startIdx < eEndIdx && endIdx > eStartIdx);
    });
};

FirebaseScheduleManager.prototype.isRepeating = function(event) {
    return (event.repeat && event.repeat !== 'none') || event.repeatParent || this.events.some(e => e.repeatParent === event.id);
};

FirebaseScheduleManager.prototype.editEvent = function(id) {
    const event = this.events.find(e => e.id === id);
    if (!event) return;
    
    this.openModal(event.member, event.date, event.time || event.startTime, event);
};
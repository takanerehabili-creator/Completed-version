// FirebaseScheduleManagerクラス定義とコアメソッド

class FirebaseScheduleManager {
    constructor() {
        this.timeSlots = [];
        for (let h = 9; h < 18; h++) {
            this.timeSlots.push(`${h}:00`, `${h}:20`, `${h}:40`);
        }
        this.timeSlots.push('18:00');  // ⭐ 18:00を追加
        
        this.events = [];
        this.teamMembers = [];
        this.holidays = [];
        this.daySchedules = [];
        this.staffOverrides = [];
        this.staffLeaves = [];
        this.currentStartDate = this.getMondayOfWeek(new Date());
        this.currentWeekKey = this.getWeekKey(this.currentStartDate);
        this.clickedCell = null;
        this.editingEvent = null;
        this.selectedType = null;
        this.dragInfo = null;
        this.isOnline = navigator.onLine;
        this.tableReadyForDisplay = false;
        this.minimalDataLoaded = false;
        
        // 週別キャッシュとリスナー管理
        this.weekCache = new Map();
        this.weekListeners = new Map();
        this.loadedWeeks = new Set();
        this.deletedEventIds = new Set(); // ⭐ 削除済みイベントのトラッキング（ゾンビ化防止）
        
        // カレンダー用
        this.calendarCurrentDate = new Date();
        
        // 編集開始時刻（競合検出用）
        this.editStartTime = null;
        this.originalEventData = null;
        
        // タッチイベント用
        this.firstTapTime = null;
        this.doubleTapTimer = null;
        
        // Galaxy Tab A9+判定を追加
        this.isGalaxyTab = /SM-X\d{3}/i.test(navigator.userAgent);
        
        console.log('Device:', this.isGalaxyTab ? 'Galaxy Tab' : 'Other');
        
        // ⭐ 再接続管理用
        this.reconnectionAttempts = new Map(); // weekKey -> { count, lastAttempt }
        this.maxReconnectionAttempts = 1; // 自動再接続は1回のみ
        this.reconnectionCooldown = 60000; // 1分のクールダウン
        
        this.init();
    }
    
    async init() {
        console.log('Initializing FirebaseScheduleManager...');
        
        try {
            showLoading('初期化中...');
            
            // 基本データのロード
            await Promise.all([
                this.loadTeamMembers(),
                this.loadHolidays(),
                this.loadDaySchedules(),
                this.loadStaffOverrides(),
                this.loadStaffLeaves()
            ]);
            
            console.log(`Team members loaded: ${this.teamMembers.length}`);
            console.log(`Holidays loaded: ${this.holidays.length}`);
            console.log(`Day schedules loaded: ${this.daySchedules.length}`);
            console.log(`Staff overrides loaded: ${this.staffOverrides.length}`);
            console.log(`Staff leaves loaded: ${this.staffLeaves.length}`);
            
            this.showMinimalTable();
            
            // ⭐ 初期起動時は今週のみリスナー作成
            await this.createWeekListenerIfNeeded(this.currentWeekKey);
            
            this.tableReadyForDisplay = true;
            
            if (typeof this.setupEvents === 'function') {
                this.setupEvents();
            } else {
                console.warn('setupEvents method not found, will be set up later');
            }
            this.updateWeekDisplay();
            this.updatePrevWeekButton();
            this.updateNextWeekButton();
            this.updateConnectionStatus();
            
            hideLoading();
            
            setTimeout(() => {
                this.renderTable();
                this.ensureTableDisplay();
            }, 500);
            
            console.log('FirebaseScheduleManager initialized successfully');
            
        } catch (error) {
            console.error('Initialization error:', error);
            hideLoading();
            this.showEmergencyTable();
            this.showNotification('データの読み込みに失敗しました', 'error');
        }
    }
    
    async loadStaffOverrides() {
        try {
            const snapshot = await db.collection('staffOverrides').get();
            if (window.readCounter) window.readCounter.increment(snapshot.size);
            this.staffOverrides = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            db.collection('staffOverrides').onSnapshot(snapshot => {
                if (window.readCounter) window.readCounter.increment(snapshot.docChanges().length);
                this.staffOverrides = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                
                if (this.tableReadyForDisplay) {
                    this.renderTable();
                }
            }, error => {
                console.error('Staff overrides listener error:', error);
            });
            
        } catch (error) {
            console.error('Load staff overrides error:', error);
            this.staffOverrides = [];
        }
    }
    
    getStaffForDate(dateString) {
        const date = this.createLocalDate(dateString);
        const dayOfWeek = date.getDay();
        
        let staff = this.teamMembers.filter(m => 
            (m.workdays || [1,2,3,4,5]).includes(dayOfWeek)
        );
        
        // 🆕 全日の入れ替えのみここで処理
        const overrides = this.staffOverrides.filter(o => 
            o.date === dateString && (!o.timeSlot || o.timeSlot === 'all')
        );
        
        if (overrides.length > 0) {
            overrides.forEach(override => {
                staff = staff.filter(m => {
                    const memberName = `${m.surname || ''}${m.firstname || ''}`;
                    return memberName !== override.originalStaff;
                });
                
                const replacementMember = this.teamMembers.find(m => {
                    const memberName = `${m.surname || ''}${m.firstname || ''}`;
                    return memberName === override.replacementStaff;
                });
                
                if (replacementMember) {
                    const alreadyExists = staff.some(s => s.id === replacementMember.id);
                    if (!alreadyExists) {
                        staff.push(replacementMember);
                    }
                }
            });
        }
        
        return staff;
    }
    
    // 🆕 時間帯別のスタッフ取得関数
    getStaffForTimeSlot(dateString, time) {
        const staff = this.getStaffForDate(dateString);
        
        if (!time) return staff;
        
        // 時間を分に変換
        const [hour, minute] = time.split(':').map(Number);
        const timeInMinutes = hour * 60 + minute;
        
        // 半日の入れ替えをチェック
        const halfDayOverrides = this.staffOverrides.filter(o => 
            o.date === dateString && (o.timeSlot === 'morning' || o.timeSlot === 'afternoon')
        );
        
        if (halfDayOverrides.length === 0) return staff;
        
        let modifiedStaff = [...staff];
        
        halfDayOverrides.forEach(override => {
            let shouldApply = false;
            
            if (override.timeSlot === 'morning') {
                // 午前: 9:00-12:40 (540-760分)
                shouldApply = timeInMinutes >= 540 && timeInMinutes <= 760;
            } else if (override.timeSlot === 'afternoon') {
                // 午後: 13:00-18:00 (780-1080分)
                shouldApply = timeInMinutes >= 780 && timeInMinutes <= 1080;
            }
            
            if (shouldApply) {
                // 元のスタッフを除外
                modifiedStaff = modifiedStaff.filter(m => {
                    const memberName = `${m.surname || ''}${m.firstname || ''}`;
                    return memberName !== override.originalStaff;
                });
                
                // 代わりのスタッフを追加
                const replacementMember = this.teamMembers.find(m => {
                    const memberName = `${m.surname || ''}${m.firstname || ''}`;
                    return memberName === override.replacementStaff;
                });
                
                if (replacementMember) {
                    const alreadyExists = modifiedStaff.some(s => s.id === replacementMember.id);
                    if (!alreadyExists) {
                        modifiedStaff.push(replacementMember);
                    }
                }
            }
        });
        
        return modifiedStaff;
    }
    
    // 🆕 1日全体のスタッフリストを取得（全時間帯統合）
    getAllStaffForDate(dateString) {
        const baseStaff = this.getStaffForDate(dateString);
        
        // 半日入れ替えをチェック
        const halfDayOverrides = this.staffOverrides.filter(o => 
            o.date === dateString && (o.timeSlot === 'morning' || o.timeSlot === 'afternoon')
        );
        
        if (halfDayOverrides.length === 0) return baseStaff;
        
        // 全時間帯のスタッフを統合
        const allStaffSet = new Set();
        
        // 基本スタッフを追加
        baseStaff.forEach(m => {
            const name = `${m.surname || ''}${m.firstname || ''}`;
            allStaffSet.add(name);
        });
        
        // 半日入れ替えのスタッフを追加
        halfDayOverrides.forEach(override => {
            // 元のスタッフも残す（別の時間帯で必要）
            allStaffSet.add(override.originalStaff);
            // 代わりのスタッフも追加
            allStaffSet.add(override.replacementStaff);
        });
        
        // スタッフオブジェクトに変換
        const allStaff = [];
        allStaffSet.forEach(name => {
            const member = this.teamMembers.find(m => {
                const memberName = `${m.surname || ''}${m.firstname || ''}`;
                return memberName === name;
            });
            if (member) {
                allStaff.push(member);
            }
        });
        
        return allStaff;
    }
    
    // 🆕 特定の時間帯にスタッフが有効かチェック
    isStaffActiveAtTime(memberName, dateString, time) {
        if (!time) return true;
        
        // 時間を分に変換
        const [hour, minute] = time.split(':').map(Number);
        const timeInMinutes = hour * 60 + minute;
        
        // このスタッフが元々出勤予定か
        const date = this.createLocalDate(dateString);
        const dayOfWeek = date.getDay();
        const member = this.teamMembers.find(m => {
            const name = `${m.surname || ''}${m.firstname || ''}`;
            return name === memberName;
        });
        
        if (!member) return false;
        
        const isScheduledToday = (member.workdays || [1,2,3,4,5]).includes(dayOfWeek);
        
        // 全日入れ替えチェック
        const allDayOverride = this.staffOverrides.find(o => 
            o.date === dateString && 
            (!o.timeSlot || o.timeSlot === 'all') &&
            (o.originalStaff === memberName || o.replacementStaff === memberName)
        );
        
        if (allDayOverride) {
            // 全日入れ替えがある
            if (allDayOverride.originalStaff === memberName) {
                return false; // 休みになった
            } else {
                return true; // 代わりに出勤
            }
        }
        
        // 半日入れ替えチェック
        const halfDayOverride = this.staffOverrides.find(o => 
            o.date === dateString && 
            (o.timeSlot === 'morning' || o.timeSlot === 'afternoon') &&
            (o.originalStaff === memberName || o.replacementStaff === memberName)
        );
        
        if (halfDayOverride) {
            let isInTimeSlot = false;
            
            if (halfDayOverride.timeSlot === 'morning') {
                isInTimeSlot = timeInMinutes >= 540 && timeInMinutes <= 760;
            } else if (halfDayOverride.timeSlot === 'afternoon') {
                isInTimeSlot = timeInMinutes >= 780 && timeInMinutes <= 1080;
            }
            
            if (isInTimeSlot) {
                // この時間帯に入れ替えあり
                if (halfDayOverride.originalStaff === memberName) {
                    return false; // この時間帯は休み
                } else {
                    return true; // この時間帯に代わりに出勤
                }
            } else {
                // この時間帯は入れ替えなし
                if (halfDayOverride.originalStaff === memberName) {
                    return isScheduledToday; // 元々の勤務予定通り
                } else {
                    return false; // 代わりスタッフはこの時間帯には出勤しない
                }
            }
        }
        
        // 入れ替えなし
        return isScheduledToday;
    }
    
    async loadDaySchedules() {
        try {
            const snapshot = await db.collection('daySchedules').get();
            if (window.readCounter) window.readCounter.increment(snapshot.size);
            this.daySchedules = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            db.collection('daySchedules').onSnapshot(snapshot => {
                if (window.readCounter) window.readCounter.increment(snapshot.docChanges().length);
                this.daySchedules = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                
                if (this.tableReadyForDisplay) {
                    this.renderTable();
                }
            }, error => {
                console.error('Day schedules listener error:', error);
            });
            
        } catch (error) {
            console.error('Load day schedules error:', error);
            this.daySchedules = [];
        }
    }
    
    isDaySchedule(memberName, dateString, timeString) {
        const date = this.createLocalDate(dateString);
        const dayOfWeek = date.getDay();
        
        return this.daySchedules.some(ds => {
            if (ds.staffName !== memberName) return false;
            if (!ds.daysOfWeek || !ds.daysOfWeek.includes(dayOfWeek)) return false;
            
            const timeIdx = this.timeSlots.indexOf(timeString);
            if (timeIdx === -1) return false;
            
            // 新しいデータ構造（startTime/endTime）と古いデータ構造（pattern）の両方に対応
            let startTime, endTime;
            
            if (ds.startTime && ds.endTime) {
                // 新しいデータ構造
                // 時刻文字列を正規化（"09:20" → "9:20"）
                startTime = ds.startTime.replace(/^0(\d)/, '$1');
                endTime = ds.endTime.replace(/^0(\d)/, '$1');
            } else if (ds.pattern === 1) {
                // 古いデータ構造 - パターン①
                startTime = '9:20';
                endTime = '14:40';
            } else if (ds.pattern === 2) {
                // 古いデータ構造 - パターン②
                startTime = '13:00';
                endTime = '14:40';
            } else {
                return false;
            }
            
            const startIdx = this.timeSlots.indexOf(startTime);
            const endIdx = this.timeSlots.indexOf(endTime);
            
            return timeIdx >= startIdx && timeIdx <= endIdx;
        });
    }
    
    getWeekKey(date) {
        const monday = this.getMondayOfWeek(date);
        return this.formatDate(monday);
    }
    
    getMondayOfWeek(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + diff);
        d.setHours(0, 0, 0, 0);
        return d;
    }
    
    createLocalDate(dateString) {
        const [year, month, day] = dateString.split('-').map(Number);
        return new Date(year, month - 1, day);
    }
    
    formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    
    getJapaneseEra(date) {
        const year = date.getFullYear();
        if (year >= 2019) {
            const reiwaYear = year - 2018;
            return `令和${reiwaYear}年`;
        } else if (year >= 1989) {
            const heiseiYear = year - 1988;
            return `平成${heiseiYear}年`;
        }
        return `${year}年`;
    }
    
    isLunchTime(time) {
        return time === '12:20' || time === '12:40' || time === '13:00' || time === '13:20' || time === '18:00';
    }
    
    isHoliday(dateString) {
        return this.holidays.some(h => h.date === dateString);
    }
    
    getHolidayName(dateString) {
        const holiday = this.holidays.find(h => h.date === dateString);
        return holiday ? holiday.name : '';
    }
    
    getInterval(repeat) {
        switch(repeat) {
            case 'daily': return 1;
            case 'weekly': return 7;
            case 'monthly': return 30;
            default: return 0;
        }
    }
    
    getEventFontSize(text) {
        if (!text) return '13px';
        const len = text.length;
        
        if (this.isGalaxyTab) {
            if (len <= 4) return '12px';
            if (len === 5) return '9.5px';
            return '8px';
        } else {
            if (len <= 4) return '13.5px';
            if (len === 5) return '11px';
            return '9px';
        }
    }
    
    async loadTeamMembers() {
        try {
            const snapshot = await db.collection('teamMembers').orderBy('surname').get();
            if (window.readCounter) window.readCounter.increment(snapshot.size);
            this.teamMembers = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            db.collection('teamMembers').onSnapshot(snapshot => {
                if (window.readCounter) window.readCounter.increment(snapshot.docChanges().length);
                this.teamMembers = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                
                if (this.tableReadyForDisplay) {
                    this.renderTable();
                }
            }, error => {
                console.error('Team members listener error:', error);
            });
            
        } catch (error) {
            console.error('Load team members error:', error);
            throw error;
        }
    }
    
    async loadHolidays() {
        try {
            const snapshot = await db.collection('holidays').orderBy('date').get();
            if (window.readCounter) window.readCounter.increment(snapshot.size);
            this.holidays = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            db.collection('holidays').onSnapshot(snapshot => {
                if (window.readCounter) window.readCounter.increment(snapshot.docChanges().length);
                this.holidays = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                
                if (this.tableReadyForDisplay) {
                    this.renderTable();
                }
            }, error => {
                console.error('Holidays listener error:', error);
            });
            
        } catch (error) {
            console.error('Load holidays error:', error);
            throw error;
        }
    }
    
    async createWeekListenerIfNeeded(weekKey) {
        if (this.weekListeners.has(weekKey)) {
            console.log(`Week listener already exists for ${weekKey}`);
            return;
        }
        
        const monday = this.createLocalDate(weekKey);
        const startDate = this.formatDate(monday);
        const endDate = new Date(monday);
        endDate.setDate(monday.getDate() + 6);
        const endDateStr = this.formatDate(endDate);
        
        console.log(`Creating listener for week ${weekKey} (${startDate} to ${endDateStr})`);
        
        const query = db.collection('events')
            .where('date', '>=', startDate)
            .where('date', '<=', endDateStr);
        
        const unsubscribe = query.onSnapshot(snapshot => {
            console.log(`Week ${weekKey} snapshot received: ${snapshot.size} events`);
            
            if (window.readCounter) window.readCounter.increment(snapshot.docChanges().length);
            
            const weekEvents = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })).filter(event => {
                // ⭐ 削除済みイベントを無視（ゾンビ化防止）
                if (this.deletedEventIds && this.deletedEventIds.has(event.id)) {
                    console.log(`⚠️ Ignoring deleted event from listener: ${event.id}`);
                    return false;
                }
                return true;
            });
            
            this.weekCache.set(weekKey, weekEvents);
            this.loadedWeeks.add(weekKey);
            
            if (weekKey === this.currentWeekKey) {
                this.updateCurrentWeekEvents();
                if (this.tableReadyForDisplay) {
                    this.renderTable();
                }
            }
            
            // ⭐ 正常にデータ取得できたら再接続カウントをリセット
            if (this.reconnectionAttempts.has(weekKey)) {
                this.reconnectionAttempts.delete(weekKey);
                this.hideReconnectButton();
            }
            
            this.updateCacheStatus();
        }, error => {
            console.error(`Week ${weekKey} listener error:`, error);
            
            // ⭐ エラー時の自動再接続処理
            this.handleListenerError(weekKey, error);
        });
        
        this.weekListeners.set(weekKey, unsubscribe);
    }
    
    async generateRepeatingRangeEvents(baseEvent, parentId, baseDate) {
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
    }
    
    async generateRepeatingEvents(baseEvent, parentId, baseDate) {
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
    }
    
    updateCurrentWeekEvents() {
        const weekEvents = this.weekCache.get(this.currentWeekKey) || [];
        this.events = weekEvents;
        console.log(`Current week events updated: ${this.events.length} events`);
    }
    
    // ⭐ クリーンアップ: 今週+3週先の範囲外のリスナーを削除
    cleanupOldListeners() {
        // ⭐ 常に「実際の今日の週」を基準にする
        const todayWeekStart = this.getMondayOfWeek(new Date());
        const maxFutureDate = new Date(todayWeekStart);
        maxFutureDate.setDate(maxFutureDate.getDate() + (7 * 3)); // 今週+3週先
        
        console.log(`Cleaning up listeners outside range: ${this.formatDate(todayWeekStart)} to ${this.formatDate(maxFutureDate)}`);
        console.log(`Current displayed week: ${this.currentWeekKey}`);
        
        const listenersToDelete = [];
        
        this.weekListeners.forEach((unsubscribe, weekKey) => {
            const weekDate = this.createLocalDate(weekKey);
            
            // 今週より前、または今週+3週より後のリスナーを削除候補に追加
            if (weekDate < todayWeekStart || weekDate > maxFutureDate) {
                // ただし、現在表示中の週は保護
                if (weekKey !== this.currentWeekKey) {
                    listenersToDelete.push(weekKey);
                }
            }
        });
        
        // 削除実行
        listenersToDelete.forEach(weekKey => {
            const unsubscribe = this.weekListeners.get(weekKey);
            if (unsubscribe) {
                unsubscribe();
            }
            this.weekListeners.delete(weekKey);
            this.weekCache.delete(weekKey);
            this.loadedWeeks.delete(weekKey);
            console.log(`Cleaned up week: ${weekKey}`);
        });
        
        console.log(`Active listeners after cleanup: ${this.weekListeners.size}`);
    }
    
    updateCacheStatus() {
        const cacheCount = this.loadedWeeks.size;
        const statusElements = ['cacheStatus', 'cacheStatusMobile'];
        statusElements.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = `キャッシュ: ${cacheCount}週`;
            }
        });
    }
    
    updateConnectionStatus() {
        const status = document.getElementById('connectionStatus');
        if (!status) return;
        
        if (this.isOnline) {
            status.className = 'connection-status online';
            status.textContent = 'オンライン';
        } else {
            status.className = 'connection-status offline';
            status.textContent = 'オフライン';
        }
    }
    
    async handleAppResume() {
        console.log('App resumed');
        
        // ⭐ 何もしない - Firestoreの自動再接続に任せる
        console.log('Trusting Firestore auto-reconnection...');
    }
    
    handleListenerError(weekKey, error) {
        console.log(`Handling listener error for ${weekKey}:`, error.code, error.message);
        
        // 再接続が必要なエラーコードかチェック
        const reconnectableErrors = ['unavailable', 'failed-precondition', 'unauthenticated', 'deadline-exceeded'];
        if (!reconnectableErrors.includes(error.code)) {
            console.log('Non-reconnectable error, skipping auto-reconnect');
            return;
        }
        
        // 再接続試行の履歴を取得
        const attemptInfo = this.reconnectionAttempts.get(weekKey) || { count: 0, lastAttempt: 0 };
        const now = Date.now();
        
        // クールダウン期間中かチェック
        if (now - attemptInfo.lastAttempt < this.reconnectionCooldown) {
            console.log(`Cooldown period active for ${weekKey}, skipping reconnection`);
            return;
        }
        
        // 最大試行回数をチェック
        if (attemptInfo.count >= this.maxReconnectionAttempts) {
            console.log(`Max reconnection attempts reached for ${weekKey}`);
            
            // ⭐ ユーザーに通知して手動リフレッシュボタンを表示
            if (weekKey === this.currentWeekKey) {
                this.showReconnectButton();
                this.showNotification('接続に問題があります。リフレッシュボタンを押してください。', 'warning');
            }
            return;
        }
        
        // 再接続を試行
        attemptInfo.count++;
        attemptInfo.lastAttempt = now;
        this.reconnectionAttempts.set(weekKey, attemptInfo);
        
        console.log(`Scheduling reconnection attempt ${attemptInfo.count} for ${weekKey} in 5 seconds...`);
        
        setTimeout(async () => {
            console.log(`Attempting to reconnect listener for ${weekKey}...`);
            
            // 既存のリスナーを削除
            if (this.weekListeners.has(weekKey)) {
                const unsubscribe = this.weekListeners.get(weekKey);
                if (unsubscribe) unsubscribe();
                this.weekListeners.delete(weekKey);
            }
            
            // 新しいリスナーを作成
            try {
                await this.createWeekListenerIfNeeded(weekKey);
                console.log(`Successfully reconnected listener for ${weekKey}`);
                
                if (weekKey === this.currentWeekKey) {
                    this.showNotification('接続を復旧しました', 'success');
                }
            } catch (err) {
                console.error(`Failed to reconnect listener for ${weekKey}:`, err);
                
                if (weekKey === this.currentWeekKey) {
                    this.showReconnectButton();
                    this.showNotification('接続に問題があります。リフレッシュボタンを押してください。', 'warning');
                }
            }
        }, 5000);
    }
    
    async handleNetworkReconnect() {
        console.log('Network reconnected');
        this.isOnline = true;
        this.updateConnectionStatus();
        
        // ⭐ 何もしない - Firestoreの自動再接続に任せる
    }
    
    showReconnectButton() {
        const btn = document.getElementById('reconnectBtn');
        if (btn) {
            btn.style.display = 'inline-block';
        }
        
        const btnMobile = document.getElementById('reconnectBtnMobile');
        if (btnMobile) {
            btnMobile.style.display = 'inline-block';
        }
    }
    
    hideReconnectButton() {
        const btn = document.getElementById('reconnectBtn');
        if (btn) {
            btn.style.display = 'none';
        }
        
        const btnMobile = document.getElementById('reconnectBtnMobile');
        if (btnMobile) {
            btnMobile.style.display = 'none';
        }
    }
    
    async manualReconnect() {
        console.log('Manual reconnect initiated by user');
        
        const currentWeek = this.currentWeekKey;
        
        // 再接続カウントをリセット
        this.reconnectionAttempts.delete(currentWeek);
        
        // 既存のリスナーを削除
        if (this.weekListeners.has(currentWeek)) {
            const unsubscribe = this.weekListeners.get(currentWeek);
            if (unsubscribe) unsubscribe();
            this.weekListeners.delete(currentWeek);
        }
        
        this.hideReconnectButton();
        showLoading('再接続中...');
        
        try {
            await this.createWeekListenerIfNeeded(currentWeek);
            this.showNotification('接続を復旧しました', 'success');
        } catch (error) {
            console.error('Manual reconnect failed:', error);
            this.showNotification('再接続に失敗しました', 'error');
            this.showReconnectButton();
        } finally {
            hideLoading();
        }
    }
    
    showNotification(msg, type = 'success') {
        showNotificationWebview(msg, type);
    }
    
    debugStaffOrder(dateString) {
        const date = this.createLocalDate(dateString);
        const dayOfWeek = date.getDay();
        const staff = this.teamMembers.filter(m => (m.workdays || [1,2,3,4,5]).includes(dayOfWeek));
        console.log(`=== Staff order for ${dateString} (day ${dayOfWeek}) ===`);
        staff.forEach((m, idx) => {
            const memberName = `${m.surname || ''}${m.firstname || ''}`;
            console.log(`  ${idx}: ${memberName} (workdays: ${m.workdays || [1,2,3,4,5]})`);
        });
        return staff;
    }
    
    destroy() {
        console.log('Destroying FirebaseScheduleManager...');
        
        this.weekListeners.forEach(unsubscribe => {
            if (unsubscribe) unsubscribe();
        });
        
        this.weekListeners.clear();
        this.weekCache.clear();
        this.loadedWeeks.clear();
    }
    
    // ⭐ 有給・公休日の背景色判定
    isStaffLeave(memberName, dateString, timeString) {
        // 時刻を分に変換するヘルパー関数
        const timeToMinutes = (time) => {
            const [hours, minutes] = time.split(':').map(Number);
            return hours * 60 + minutes;
        };
        
        return this.staffLeaves.some(leave => {
            if (leave.staffName !== memberName) return false;
            if (leave.date !== dateString) return false;
            
            // 時間が休み設定の範囲内かチェック（分に変換して比較）
            const timeMinutes = timeToMinutes(timeString);
            const startMinutes = timeToMinutes(leave.startTime);
            const endMinutes = timeToMinutes(leave.endTime);
            
            return timeMinutes >= startMinutes && timeMinutes < endMinutes;
        });
    }
    
    // ⭐ 有給・公休日データのロード
    async loadStaffLeaves() {
        try {
            const snapshot = await db.collection('staffLeaves').get();
            if (window.readCounter) window.readCounter.increment(snapshot.size);
            this.staffLeaves = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            db.collection('staffLeaves').onSnapshot(snapshot => {
                if (window.readCounter) window.readCounter.increment(snapshot.docChanges().length);
                this.staffLeaves = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                
                if (this.tableReadyForDisplay) {
                    this.renderTable();
                }
            }, error => {
                console.error('Staff leaves listener error:', error);
            });
            
        } catch (error) {
            console.error('Load staff leaves error:', error);
            this.staffLeaves = [];
        }
    }
}

window.FirebaseScheduleManager = FirebaseScheduleManager;

console.log('✅ app-core.js loaded, FirebaseScheduleManager:', typeof FirebaseScheduleManager);

// 繰り返し間隔を取得
FirebaseScheduleManager.prototype.getInterval = function(repeat) {
    switch(repeat) {
        case 'weekly': return 7;
        case 'biweekly1': return 14;  // 隔週(1週間おき) = 2週間ごと
        case 'biweekly2': return 21;  // 隔週(2週間おき) = 3週間ごと
        default: return 7;
    }
};

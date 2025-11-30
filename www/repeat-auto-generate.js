// ===== 繰り返し予定の自動生成機能（最適化版 + 衝突チェック対応） =====

/**
 * 要件:
 * 1. 初回作成時に6ヶ月分を生成
 * 2. アプリ起動時に「今日から2ヶ月先」までデータがあるかチェック
 * 3. 不足していれば6ヶ月分を追加生成
 * 4. 親イベントが削除されても、子イベントから繰り返し設定を読み取って継続
 * 5. ⭐ NEW: 自動生成時に既存予約との衝突をチェックし、衝突日はスキップ
 * 
 * 最適化:
 * - チェックは毎週月曜日の初回起動時のみ実行（読み取り回数を削減）
 */

// ⭐ ヘルパー関数: 時間範囲の重複チェック
function checkTimeOverlap(time1, type1, time2, type2) {
    if (!time1 || !time2) return false;
    
    // 各イベントの時間範囲を計算
    const getDuration = (type) => {
        switch(type) {
            case '40min':
            case 'workinjury40':
            case 'visit':
                return 40;
            case '60min':
                return 60;
            case '20min':
            case 'workinjury20':
            case 'accident':
            default:
                return 20;
        }
    };
    
    const [hour1, min1] = time1.split(':').map(Number);
    const start1 = hour1 * 60 + min1;
    const end1 = start1 + getDuration(type1);
    
    const [hour2, min2] = time2.split(':').map(Number);
    const start2 = hour2 * 60 + min2;
    const end2 = start2 + getDuration(type2);
    
    // 時間範囲の重複判定
    return (start1 < end2) && (end1 > start2);
}

// 繰り返しパターンを子イベントに保存するための拡張（衝突チェック対応）
FirebaseScheduleManager.prototype.generateRepeatingInFirestoreExtended = async function(baseEvent, parentId, baseDate) {
    const batch = db.batch();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 6); // 6ヶ月分生成
    
    const baseDateTime = this.createLocalDate(baseDate);
    const intervalDays = this.getInterval(baseEvent.repeat);
    let occurrenceCount = 1;
    let skippedCount = 0;
    
    console.log(`=== 6ヶ月分の繰り返し生成開始（衝突チェック有効） ===`);
    console.log('Base date:', baseDate);
    console.log('Parent ID:', parentId);
    console.log('Interval:', intervalDays, 'days');
    console.log('End date:', this.formatDate(endDate));
    
    while (true) {
        const nextDate = new Date(baseDateTime);
        nextDate.setDate(baseDateTime.getDate() + (intervalDays * occurrenceCount));
        
        if (nextDate > endDate) break;
        
        const nextDateStr = this.formatDate(nextDate);
        
        // 祝日チェック
        if (this.isHoliday(nextDateStr)) {
            console.log(`Skipped holiday: ${nextDateStr}`);
            occurrenceCount++;
            continue;
        }
        
        // 有給・公休日チェック
        if (this.isStaffLeave(baseEvent.member, nextDateStr, baseEvent.time)) {
            console.log(`Skipped staff leave: ${nextDateStr}`);
            occurrenceCount++;
            continue;
        }
        
        // ⭐ NEW: 既存予約との衝突チェック
        try {
            const snapshot = await db.collection('events')
                .where('member', '==', baseEvent.member)
                .where('date', '==', nextDateStr)
                .get();
            
            let hasConflict = false;
            snapshot.forEach(doc => {
                const data = doc.data();
                
                // ⭐ 同じ繰り返しグループのイベントが既に存在する場合はスキップ
                if (data.repeatParent === parentId) {
                    console.log(`⏭️ Event already exists from same repeat group on ${nextDateStr}:`);
                    console.log(`  Existing: ${data.time} - ${data.displayName || data.surname + data.firstname}`);
                    console.log(`  → Skipping to preserve manual changes`);
                    hasConflict = true;
                    return;
                }
                
                // 親イベント自身との衝突は無視
                if (doc.id === parentId) {
                    return;
                }
                
                // 時間情報がない場合はスキップ
                if (!data.time) {
                    return;
                }
                
                // 時間範囲の重複チェック（他の繰り返しグループや単発予約との衝突）
                if (checkTimeOverlap(baseEvent.time, baseEvent.type, data.time, data.type)) {
                    console.log(`⚠️ Conflict detected on ${nextDateStr}:`);
                    console.log(`  Auto-generate: ${baseEvent.time} (${baseEvent.type})`);
                    console.log(`  Existing: ${data.time} (${data.type}) - ${data.displayName || data.surname + data.firstname}`);
                    hasConflict = true;
                }
            });
            
            if (hasConflict) {
                console.log(`⏭️ Skipped conflict date: ${nextDateStr}`);
                skippedCount++;
                occurrenceCount++;
                continue;
            }
        } catch (error) {
            console.error(`Error checking conflicts for ${nextDateStr}:`, error);
            // エラーが発生しても続行（安全のため）
        }
        
        // 子イベントに繰り返しパターンを保存
        const repeatEvent = {
            ...baseEvent,
            date: nextDateStr,
            repeatParent: parentId,
            repeatPattern: {  // ⭐ 繰り返し設定を保存
                type: baseEvent.repeat,
                intervalDays: intervalDays,
                baseDate: baseDate,
                originalTime: baseEvent.time  // ⭐ 元の時刻を保存
            },
            createdAt: new Date(),
            updatedAt: new Date(),
            lastModified: Date.now()
        };
        
        // ⭐ undefinedフィールドを削除（Firestoreエラー回避）
        Object.keys(repeatEvent).forEach(key => {
            if (repeatEvent[key] === undefined) {
                delete repeatEvent[key];
            }
        });
        
        // ⭐⭐⭐ 【最終確認チェック】他の端末が既に作成していないか確認
        try {
            const finalCheck = await db.collection('events')
                .where('member', '==', baseEvent.member)
                .where('date', '==', nextDateStr)
                .where('repeatParent', '==', parentId)
                .get();
            
            if (finalCheck.size > 0) {
                console.log(`⏭️ Final check: Already created by another device on ${nextDateStr}`);
                skippedCount++;
                occurrenceCount++;
                continue;
            }
        } catch (error) {
            console.error(`❌ Final check error for ${nextDateStr}:`, error);
            // エラー時は安全のためスキップ
            skippedCount++;
            occurrenceCount++;
            continue;
        }
        
        const newDocRef = db.collection('events').doc();
        batch.set(newDocRef, repeatEvent);
        
        console.log(`✅ Generated: ${nextDateStr} (occurrence ${occurrenceCount})`);
        occurrenceCount++;
    }
    
    await batch.commit();
    console.log(`=== 生成完了: ${occurrenceCount - 1 - skippedCount}件生成、${skippedCount}件スキップ ===`);
};

// 範囲イベント（デイ・担会）用の6ヶ月生成（衝突チェック対応）
FirebaseScheduleManager.prototype.generateRepeatingRangeEventsExtended = async function(baseEvent, parentId, baseDate) {
    const batch = db.batch();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 6); // 6ヶ月分生成
    
    const baseDateTime = this.createLocalDate(baseDate);
    const baseDayOfWeek = baseDateTime.getDay();
    const intervalDays = this.getInterval(baseEvent.repeat);
    let occurrenceCount = 1;
    let skippedCount = 0;
    
    console.log(`=== 範囲イベント6ヶ月分の生成開始（衝突チェック有効） ===`);
    console.log('Base date:', baseDate, 'Day of week:', baseDayOfWeek);
    console.log('Parent ID:', parentId);
    console.log('Interval:', intervalDays, 'days');
    
    while (true) {
        const nextDate = new Date(baseDateTime);
        nextDate.setDate(baseDateTime.getDate() + (intervalDays * occurrenceCount));
        
        if (nextDate > endDate) break;
        
        const dateStr = this.formatDate(nextDate);
        const nextDayOfWeek = nextDate.getDay();
        
        if (nextDayOfWeek === baseDayOfWeek && !this.isHoliday(dateStr)) {
            // ⭐ NEW: 既存の範囲イベントとの衝突チェック
            try {
                const snapshot = await db.collection('events')
                    .where('member', '==', baseEvent.member)
                    .where('date', '==', dateStr)
                    .get();
                
                let hasConflict = false;
                snapshot.forEach(doc => {
                    const data = doc.data();
                    
                    // ⭐ 同じ繰り返しグループのイベントが既に存在する場合はスキップ
                    if (data.repeatParent === parentId) {
                        console.log(`⏭️ Range event already exists from same repeat group on ${dateStr}`);
                        console.log(`  → Skipping to preserve manual changes`);
                        hasConflict = true;
                        return;
                    }
                    
                    // 親イベント自身との衝突は無視
                    if (doc.id === parentId) {
                        return;
                    }
                    
                    // 同じタイプ（デイ or 担会）の範囲イベントがあれば衝突
                    if (data.type === 'day' || data.type === 'meeting') {
                        console.log(`⚠️ Range event conflict detected on ${dateStr}:`);
                        console.log(`  Auto-generate: ${baseEvent.type}`);
                        console.log(`  Existing: ${data.type}`);
                        hasConflict = true;
                    }
                });
                
                if (hasConflict) {
                    console.log(`⏭️ Skipped conflict date: ${dateStr}`);
                    skippedCount++;
                    occurrenceCount++;
                    continue;
                }
            } catch (error) {
                console.error(`Error checking range conflicts for ${dateStr}:`, error);
                // エラーが発生しても続行（安全のため）
            }
            
            const repeatEvent = {
                ...baseEvent,
                date: dateStr,
                member: baseEvent.member,
                repeatParent: parentId,
                repeatPattern: {  // ⭐ 繰り返し設定を保存
                    type: baseEvent.repeat,
                    intervalDays: intervalDays,
                    baseDate: baseDate,
                    baseDayOfWeek: baseDayOfWeek
                },
                createdAt: new Date(),
                updatedAt: new Date(),
                lastModified: Date.now()
            };
            
            // ⭐ undefinedフィールドを削除（Firestoreエラー回避）
            Object.keys(repeatEvent).forEach(key => {
                if (repeatEvent[key] === undefined) {
                    delete repeatEvent[key];
                }
            });
            
            // ⭐⭐⭐ 【最終確認チェック】他の端末が既に作成していないか確認
            try {
                const finalCheck = await db.collection('events')
                    .where('member', '==', baseEvent.member)
                    .where('date', '==', dateStr)
                    .where('repeatParent', '==', parentId)
                    .get();
                
                if (finalCheck.size > 0) {
                    console.log(`⏭️ Final check: Range event already created by another device on ${dateStr}`);
                    skippedCount++;
                    occurrenceCount++;
                    continue;
                }
            } catch (error) {
                console.error(`❌ Final check error for range event on ${dateStr}:`, error);
                // エラー時は安全のためスキップ
                skippedCount++;
                occurrenceCount++;
                continue;
            }
            
            const docRef = db.collection('events').doc();
            batch.set(docRef, repeatEvent);
            console.log(`✅ Generated: ${dateStr} (occurrence ${occurrenceCount})`);
        }
        
        occurrenceCount++;
    }
    
    await batch.commit();
    console.log(`=== 範囲イベント生成完了: スキップ ${skippedCount}件 ===`);
};

// ⭐ 多数派のスタッフ名を判定
function determineMajorityStaff(events) {
    if (!events || events.length === 0) {
        return null;
    }
    
    // スタッフ名の頻度をカウント
    const staffFrequency = {};
    
    events.forEach(event => {
        const staff = event.member;
        if (staff) {
            staffFrequency[staff] = (staffFrequency[staff] || 0) + 1;
        }
    });
    
    if (Object.keys(staffFrequency).length === 0) {
        return null;
    }
    
    console.log('  Staff frequency:', staffFrequency);
    
    // 最頻値を取得
    let majorityStaff = null;
    let maxCount = 0;
    
    for (const [staff, count] of Object.entries(staffFrequency)) {
        if (count > maxCount) {
            maxCount = count;
            majorityStaff = staff;
        }
    }
    
    const total = events.length;
    const ratio = maxCount / total;
    
    console.log(`  Majority staff: ${majorityStaff} (${maxCount}/${total} = ${(ratio * 100).toFixed(1)}%)`);
    
    return {
        staff: majorityStaff,
        count: maxCount,
        total: total,
        ratio: ratio
    };
}

// ⭐ 名前変更されたイベントを除外してフィルタリング
function filterOutNameChanges(events) {
    if (!events || events.length === 0) {
        return {
            original: [],
            nameChanged: [],
            majorityStaff: null,
            majorityRatio: 0
        };
    }
    
    // 多数派を判定
    const majority = determineMajorityStaff(events);
    
    if (!majority || !majority.staff) {
        console.log('  ⚠️ Could not determine majority staff');
        return {
            original: events,
            nameChanged: [],
            majorityStaff: null,
            majorityRatio: 0
        };
    }
    
    // 多数派と異なるスタッフ名を持つイベントを分離
    const originalEvents = [];
    const nameChangedEvents = [];
    
    events.forEach(event => {
        if (event.member === majority.staff) {
            originalEvents.push(event);
        } else {
            nameChangedEvents.push(event);
            console.log(`  📝 Name changed: ${event.id} (${event.date}) - ${majority.staff} → ${event.member}`);
        }
    });
    
    console.log(`  Original events (${majority.staff}): ${originalEvents.length}`);
    console.log(`  Name changed events: ${nameChangedEvents.length}`);
    
    return {
        original: originalEvents,
        nameChanged: nameChangedEvents,
        majorityStaff: majority.staff,
        majorityRatio: majority.ratio
    };
}

// ⭐ スマート時刻判定: 多数決 + 連続変更検知
function determineOptimalTime(events) {
    if (!events || events.length === 0) {
        return null;
    }
    
    // 日付順にソート（古い→新しい）
    const sortedEvents = events
        .filter(e => e.time) // timeがあるものだけ
        .sort((a, b) => a.date.localeCompare(b.date));
    
    if (sortedEvents.length === 0) {
        return null;
    }
    
    console.log('=== Smart Time Detection ===');
    console.log(`Total events: ${sortedEvents.length}`);
    
    // 1️⃣ 連続変更検知（直近3件）
    const recentThree = sortedEvents.slice(-3);
    if (recentThree.length === 3) {
        const times = recentThree.map(e => e.time);
        const allSame = times.every(t => t === times[0]);
        
        if (allSame) {
            console.log(`✅ Consecutive change detected: ${times[0]} (last 3 events)`);
            console.log('→ Using this time (operational change detected)');
            return times[0];
        } else {
            console.log(`Recent 3 times: ${times.join(', ')} (not consistent)`);
        }
    }
    
    // 2️⃣ 多数決（直近10件）
    const recentTen = sortedEvents.slice(-10);
    const timeFrequency = {};
    
    recentTen.forEach(event => {
        const time = event.time;
        timeFrequency[time] = (timeFrequency[time] || 0) + 1;
    });
    
    console.log('Time frequency (last 10 events):', timeFrequency);
    
    // 最頻値を取得
    let mostCommonTime = null;
    let maxCount = 0;
    
    for (const [time, count] of Object.entries(timeFrequency)) {
        if (count > maxCount) {
            maxCount = count;
            mostCommonTime = time;
        }
    }
    
    console.log(`✅ Most common time: ${mostCommonTime} (${maxCount}/${recentTen.length} occurrences)`);
    console.log('→ Using majority vote result');
    
    return mostCommonTime;
}

// ⭐ 今週の月曜日の日付を取得
function getThisMonday() {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=日曜, 1=月曜, ...
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // 日曜の場合は前週の月曜
    const monday = new Date(today);
    monday.setDate(today.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    return monday.toISOString().split('T')[0]; // YYYY-MM-DD
}

// ⭐ 日付から曜日を取得（日本語）
function getDayOfWeek(dateStr) {
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    const date = new Date(dateStr);
    return dayNames[date.getDay()];
}

// ===== 保留データ管理機能 =====

// ⭐ 保留データを保存
function savePendingGeneration(pendingData) {
    const pendingList = getPendingGenerations();
    pendingList.push(pendingData);
    localStorage.setItem('pendingGenerations', JSON.stringify(pendingList));
    
    // バッジ更新
    updatePendingBadge();
}

// ⭐ 保留データ一覧を取得
function getPendingGenerations() {
    const data = localStorage.getItem('pendingGenerations');
    return data ? JSON.parse(data) : [];
}

// ⭐ 保留データを削除
function removePendingGeneration(pendingId) {
    let pendingList = getPendingGenerations();
    pendingList = pendingList.filter(item => item.id !== pendingId);
    localStorage.setItem('pendingGenerations', JSON.stringify(pendingList));
    
    // バッジ更新
    updatePendingBadge();
}

// ⭐ すべての保留データをクリア
function clearAllPendingGenerations() {
    localStorage.removeItem('pendingGenerations');
    updatePendingBadge();
}

// ⭐ お知らせバッジを更新
function updatePendingBadge() {
    const pendingList = getPendingGenerations();
    const count = pendingList.length;
    
    const badge = document.getElementById('pending-badge');
    if (badge) {
        if (count > 0) {
            badge.textContent = count;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    }
}

// ⭐ 最適化: チェックが必要か判定
function shouldRunRepeatCheck() {
    const lastCheck = localStorage.getItem('lastRepeatCheck');
    const thisMonday = getThisMonday();
    
    console.log('=== Repeat Check Decision ===');
    console.log('Last check:', lastCheck || 'never');
    console.log('This Monday:', thisMonday);
    
    if (!lastCheck) {
        // 初回実行
        console.log('→ First time, should run');
        return true;
    }
    
    if (lastCheck < thisMonday) {
        // 前回チェックが今週の月曜より前
        console.log('→ Last check was before this Monday, should run');
        return true;
    }
    
    // 今週既にチェック済み
    console.log('→ Already checked this week, skip');
    return false;
}

// アプリ起動時のチェック＆自動生成（最適化版 + 衝突チェック + 名前変更除外対応）
FirebaseScheduleManager.prototype.checkAndGenerateFutureRepeats = async function() {
    console.log('=== 繰り返しイベントのチェック開始（衝突チェック + 名前変更除外対応） ===');
    
    // ⭐ 最適化: 週1回のみ実行
    if (!shouldRunRepeatCheck()) {
        console.log('⏭️ Skipping repeat check (already done this week)');
        return;
    }
    
    const today = new Date();
    const twoMonthsLater = new Date(today);
    twoMonthsLater.setMonth(today.getMonth() + 2);
    
    const todayStr = this.formatDate(today);
    const twoMonthsLaterStr = this.formatDate(twoMonthsLater);
    
    console.log('Today:', todayStr);
    console.log('Target date (2 months later):', twoMonthsLaterStr);
    
    try {
        // repeatPatternを持つすべてのイベントを取得（孤立した繰り返しを含む）
        const snapshot = await db.collection('events')
            .where('repeatPattern', '!=', null)
            .get();
        
        console.log(`Found ${snapshot.size} events with repeatPattern`);
        
        // 繰り返しグループごとに最新の日付を確認
        const repeatGroups = new Map();
        
        snapshot.forEach(doc => {
            const data = doc.data();
            const parentId = data.repeatParent || doc.id;
            
            if (!repeatGroups.has(parentId)) {
                repeatGroups.set(parentId, {
                    latestDate: data.date,
                    latestEvent: { id: doc.id, ...data },
                    events: []
                });
            }
            
            const group = repeatGroups.get(parentId);
            group.events.push({ id: doc.id, ...data });
            
            if (data.date > group.latestDate) {
                group.latestDate = data.date;
                group.latestEvent = { id: doc.id, ...data };
            }
        });
        
        console.log(`Found ${repeatGroups.size} repeat groups`);
        
        // 各グループについて2ヶ月先までデータがあるかチェック
        let generatedCount = 0;
        let nameChangedGroupCount = 0;
        let skippedGroupCount = 0;
        
        for (const [parentId, group] of repeatGroups) {
            console.log(`\n=== Checking group: ${parentId} ===`);
            console.log(`Total events: ${group.events.length}`);
            console.log(`Latest date: ${group.latestDate}`);
            
            // ⭐ 名前変更を除外してフィルタリング
            const filtered = filterOutNameChanges(group.events);
            
            console.log(`📊 Filter results:`);
            console.log(`  - Original events: ${filtered.original.length}`);
            console.log(`  - Name changed events: ${filtered.nameChanged.length}`);
            console.log(`  - Majority staff: ${filtered.majorityStaff}`);
            
            if (filtered.nameChanged.length > 0) {
                nameChangedGroupCount++;
                console.log(`⚠️ This group contains ${filtered.nameChanged.length} name-changed event(s)`);
            }
            
            if (filtered.original.length === 0) {
                console.log(`⏭️ SKIP: All events have been renamed`);
                console.log('   → This repeat group is now managed manually');
                skippedGroupCount++;
                continue;
            }
            
            // 名前変更の割合をチェック
            const nameChangeRatio = filtered.nameChanged.length / group.events.length;
            if (nameChangeRatio > 0) {
                console.log(`  Name change ratio: ${(nameChangeRatio * 100).toFixed(1)}%`);
            }
            
            if (nameChangeRatio >= 0.8) {
                console.log(`⏭️ SKIP: Too many name changes (${(nameChangeRatio * 100).toFixed(1)}%)`);
                console.log('   → Most events have been renamed, consider creating a new repeat schedule');
                skippedGroupCount++;
                continue;
            }
            
            if (group.latestDate < twoMonthsLaterStr) {
                console.log(`⚠️ Need to generate more events (latest: ${group.latestDate}, need until: ${twoMonthsLaterStr})`);
                console.log(`📅 Generation will be triggered`);
                
                const pattern = group.latestEvent.repeatPattern;
                if (!pattern) {
                    console.log('No repeat pattern found, skipping');
                    continue;
                }
                
                // ⭐ 元のスタッフ名のイベントの中から最新を取得
                const sortedOriginal = filtered.original.sort((a, b) => 
                    b.date.localeCompare(a.date)
                );
                const latestOriginal = sortedOriginal[0];
                
                console.log(`Using latest original event: ${latestOriginal.id} (${latestOriginal.date})`);
                console.log(`  Member: ${latestOriginal.member}`);
                console.log(`  Time: ${latestOriginal.time}`);
                
                // ⭐ 元の時刻を取得（repeatPatternから、または最も古いイベントから）
                let originalTime = null;
                if (pattern.originalTime) {
                    // 新しいデータ: repeatPatternに保存されている
                    originalTime = pattern.originalTime;
                    console.log(`Original time from repeatPattern: ${originalTime}`);
                } else {
                    // 既存データ: グループ内で最も古いイベントから取得
                    const oldestEvent = filtered.original.sort((a, b) => 
                        a.date.localeCompare(b.date)
                    )[0];
                    originalTime = oldestEvent.time;
                    console.log(`Original time from oldest event: ${originalTime} (${oldestEvent.date})`);
                }
                
                // ⭐ スマート時刻判定を実行（名前変更を除外したイベントで判定）
                const optimalTime = determineOptimalTime(filtered.original);
                const timeToUse = optimalTime || latestOriginal.time;
                
                console.log(`Determined time to use: ${timeToUse}`);
                
                // ⭐ 変更検出: 名前変更または時間変更があるか
                const hasNameChange = filtered.nameChanged.length > 0;
                const hasTimeChange = originalTime !== timeToUse;
                
                let shouldGenerate = true;
                let finalMember = latestOriginal.member;
                let finalSurname = latestOriginal.surname;
                let finalFirstname = latestOriginal.firstname;
                let finalDisplayName = latestOriginal.displayName;
                let finalTime = timeToUse;
                
                // ⭐ 名前変更または時間変更がある場合、保留リストに自動保存
                if (hasNameChange || hasTimeChange) {
                    console.log(`\n⚠️ Changes detected in group ${parentId}:`);
                    console.log(`  - hasNameChange: ${hasNameChange} (${filtered.nameChanged.length} events)`);
                    console.log(`  - hasTimeChange: ${hasTimeChange} (${latestOriginal.time} → ${timeToUse})`);
                    
                    if (hasNameChange) {
                        console.log(`  - Name changes: ${filtered.nameChanged.length} event(s)`);
                        const changedNames = [...new Set(filtered.nameChanged.map(e => e.member))].join(', ');
                        console.log(`    Changed to: ${changedNames}`);
                    }
                    if (hasTimeChange) {
                        console.log(`  - Time change: ${latestOriginal.time} → ${timeToUse}`);
                    }
                    
                    console.log(`💾 Auto-saving to pending list...`);
                    
                    // ⭐ 元の予約の患者名を取得
                    const originalPatientName = latestOriginal.surname && latestOriginal.firstname 
                        ? `${latestOriginal.surname} ${latestOriginal.firstname}` 
                        : latestOriginal.displayName || '（患者名なし）';
                    
                    // ⭐ 元の予約の曜日を取得
                    const originalDayOfWeek = getDayOfWeek(latestOriginal.date);
                    
                    // ⭐ 変更された予約の情報を詳細に取得
                    const changedEventsDetails = filtered.nameChanged.map(e => {
                        const patientName = e.surname && e.firstname 
                            ? `${e.surname} ${e.firstname}` 
                            : e.displayName || '（患者名なし）';
                        const dayOfWeek = getDayOfWeek(e.date);
                        return {
                            date: e.date,
                            dayOfWeek: dayOfWeek,
                            time: e.time,
                            member: e.member,
                            patientName: patientName
                        };
                    });
                    
                    // ⭐ 保留データとして保存
                    const pendingData = {
                        id: `pending_${Date.now()}_${parentId}`,
                        parentId: parentId,
                        timestamp: new Date().toISOString(),
                        originalPatientName: originalPatientName,
                        member: latestOriginal.member,
                        surname: latestOriginal.surname,
                        firstname: latestOriginal.firstname,
                        displayName: latestOriginal.displayName,
                        dayOfWeek: originalDayOfWeek,
                        time: timeToUse,
                        originalTime: originalTime,  // ⭐ 真の元の時刻を保存
                        hasNameChange: hasNameChange,
                        hasTimeChange: hasTimeChange,
                        nameChangedCount: filtered.nameChanged.length,
                        changedEventsDetails: changedEventsDetails,
                        latestDate: group.latestDate,
                        type: latestOriginal.type,
                        startTime: latestOriginal.startTime,
                        endTime: latestOriginal.endTime,
                        repeatPattern: pattern
                    };
                    
                    // localStorageに保存
                    savePendingGeneration(pendingData);
                    console.log(`💾 Saved as pending generation: ${pendingData.id}`);
                    
                    skippedGroupCount++;
                    shouldGenerate = false;
                }
                
                // 生成実行
                if (shouldGenerate) {
                    // 最新の日付から6ヶ月分追加生成
                    const baseEvent = {
                        member: finalMember,
                        surname: finalSurname,
                        firstname: finalFirstname,
                        displayName: finalDisplayName,
                        time: finalTime,
                        startTime: latestOriginal.startTime,
                        endTime: latestOriginal.endTime,
                        type: latestOriginal.type,
                        repeat: pattern.type
                    };
                    
                    console.log(`Generating 6 months from: ${group.latestDate}`);
                    console.log(`Base event:`, baseEvent);
                    
                    if (latestOriginal.type === 'day' || latestOriginal.type === 'meeting') {
                        // 範囲イベント
                        await this.generateRepeatingRangeEventsExtended(baseEvent, parentId, group.latestDate);
                    } else {
                        // 通常イベント
                        await this.generateRepeatingInFirestoreExtended(baseEvent, parentId, group.latestDate);
                    }
                    
                    generatedCount++;
                    console.log(`✅ Generation completed for group ${parentId}`);
                }
            } else {
                console.log(`✅ Group has enough future events`);
            }
        }
        
        // ⭐ チェック完了を記録
        const thisMonday = getThisMonday();
        localStorage.setItem('lastRepeatCheck', thisMonday);
        console.log(`✅ Repeat check completed and recorded: ${thisMonday}`);
        
        // ⭐ 詳細レポート
        console.log(`\n=== Auto-Generation Summary ===`);
        console.log(`Generated: ${generatedCount} group(s)`);
        console.log(`Groups with name changes: ${nameChangedGroupCount}`);
        console.log(`Skipped groups: ${skippedGroupCount}`);
        
        if (generatedCount > 0) {
            this.showNotification(`${generatedCount}個の繰り返し予定を更新しました（衝突日・名前変更は除外）`, 'info');
        }
        
        if (nameChangedGroupCount > 0) {
            console.log(`ℹ️ ${nameChangedGroupCount}個のグループで名前変更を検出しました`);
        }
        
        if (skippedGroupCount > 0) {
            this.showNotification(`${skippedGroupCount}個の繰り返しグループは手動管理が必要です`, 'warning');
        }
        
        if (generatedCount === 0 && skippedGroupCount === 0) {
            console.log('\n=== すべての繰り返し予定は最新です ===');
        }
        
    } catch (error) {
        console.error('Check and generate error:', error);
    }
};

// 既存の繰り返し生成関数をオーバーライド（6ヶ月版を使用）
const originalGenerateRepeating = FirebaseScheduleManager.prototype.generateRepeatingInFirestore;
FirebaseScheduleManager.prototype.generateRepeatingInFirestore = async function(baseEvent, parentId, baseDate) {
    // 6ヶ月版を使用
    await this.generateRepeatingInFirestoreExtended(baseEvent, parentId, baseDate);
};

const originalGenerateRangeRepeating = FirebaseScheduleManager.prototype.generateRepeatingRangeEvents;
FirebaseScheduleManager.prototype.generateRepeatingRangeEvents = async function(baseEvent, parentId, baseDate) {
    // 6ヶ月版を使用
    await this.generateRepeatingRangeEventsExtended(baseEvent, parentId, baseDate);
};

// アプリ起動時に自動チェックを実行
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Waiting for app initialization...');
    
    // appが初期化されるまで待つ
    const waitForApp = setInterval(async () => {
        if (window.app && window.app.checkAndGenerateFutureRepeats && window.db) {
            clearInterval(waitForApp);
            
            // 5秒待ってから実行（初期データロード完了を待つ）
            setTimeout(async () => {
                console.log('Running automatic repeat check (optimized - weekly on Monday, with conflict detection)...');
                await window.app.checkAndGenerateFutureRepeats();
            }, 5000);
        }
    }, 1000);
});

console.log('✅ Repeat auto-generate feature loaded (optimized version with conflict detection + name change exclusion)');// ===== 保留中の自動生成管理UI =====

// ⭐ お知らせパネルを表示（スタッフ毎にグループ化）
function showPendingGenerationsPanel() {
    const pendingList = getPendingGenerations();
    
    if (pendingList.length === 0) {
        alert('保留中の自動生成はありません');
        return;
    }
    
    // スタッフ毎にグループ化
    const groupedByStaff = {};
    pendingList.forEach(item => {
        const staffName = item.member || '（スタッフ名なし）';
        if (!groupedByStaff[staffName]) {
            groupedByStaff[staffName] = [];
        }
        groupedByStaff[staffName].push(item);
    });
    
    // オーバーレイを作成
    const overlay = document.createElement('div');
    overlay.id = 'pending-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        z-index: 10000;
        display: flex;
        justify-content: center;
        align-items: center;
    `;
    
    // パネルを作成
    const panel = document.createElement('div');
    panel.style.cssText = `
        background: white;
        border-radius: 12px;
        padding: 30px;
        max-width: 900px;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 10px 40px rgba(0,0,0,0.3);
    `;
    
    // ヘッダー
    let html = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid #e0e0e0; padding-bottom: 15px;">
            <h2 style="margin: 0; color: #333; font-size: 24px;">
                🔔 保留中の自動生成
                <span style="background: #ff6b6b; color: white; padding: 4px 10px; border-radius: 12px; font-size: 14px; margin-left: 10px;">
                    ${pendingList.length}件
                </span>
            </h2>
            <button onclick="closePendingPanel()" style="
                background: #f5f5f5;
                border: none;
                padding: 8px 15px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 18px;
                color: #666;
            ">✕</button>
        </div>
    `;
    
    // スタッフ毎にグループ表示
    Object.keys(groupedByStaff).sort().forEach(staffName => {
        const items = groupedByStaff[staffName];
        
        html += `
            <div style="
                border: 2px solid #2196f3;
                border-radius: 10px;
                padding: 15px;
                margin-bottom: 20px;
                background: #f8f9fa;
            ">
                <div style="
                    font-size: 18px;
                    font-weight: bold;
                    color: #2196f3;
                    margin-bottom: 15px;
                    padding-bottom: 10px;
                    border-bottom: 1px solid #e0e0e0;
                ">
                    📋 スタッフ: ${staffName}
                    <span style="
                        background: #2196f3;
                        color: white;
                        padding: 2px 8px;
                        border-radius: 10px;
                        font-size: 14px;
                        margin-left: 10px;
                    ">${items.length}件</span>
                </div>
                
                ${items.map((item, index) => {
                    const changedInfo = [];
                    if (item.hasNameChange) {
                        changedInfo.push(`スタッフ名変更: ${item.nameChangedCount}件`);
                    }
                    if (item.hasTimeChange) {
                        changedInfo.push(`時刻変更: ${item.originalTime} → ${item.time}`);
                    }
                    const changedText = changedInfo.join('、');
                    
                    return `
                        <div style="
                            background: white;
                            border: 1px solid #e0e0e0;
                            border-radius: 8px;
                            padding: 15px;
                            margin-bottom: 10px;
                        ">
                            <!-- 患者名クリックで詳細表示 -->
                            <div onclick="togglePendingDetail('${item.id}')" style="
                                cursor: pointer;
                                display: flex;
                                justify-content: space-between;
                                align-items: center;
                                padding: 5px;
                            ">
                                <div style="flex: 1;">
                                    <div style="
                                        font-size: 16px;
                                        font-weight: bold;
                                        color: #333;
                                        margin-bottom: 5px;
                                    ">
                                        ${item.originalPatientName}
                                    </div>
                                    <div style="color: #666; font-size: 13px;">
                                        📅 毎週${item.dayOfWeek}曜日 ⏰ ${item.time}
                                    </div>
                                </div>
                                <div style="color: #999; font-size: 20px;" id="arrow-${item.id}">▼</div>
                            </div>
                            
                            <!-- 詳細情報（初期状態は非表示） -->
                            <div id="detail-${item.id}" style="display: none; margin-top: 15px; padding-top: 15px; border-top: 1px solid #f0f0f0;">
                                <div style="margin-bottom: 15px;">
                                    <div style="color: #666; font-size: 14px; line-height: 1.8;">
                                        <div><strong>患者名:</strong> ${item.originalPatientName}</div>
                                        <div><strong>スタッフ:</strong> ${item.member}</div>
                                        <div><strong>曜日:</strong> 毎週${item.dayOfWeek}曜日</div>
                                        <div><strong>時刻:</strong> ${item.time}</div>
                                    </div>
                                    <div style="
                                        background: #fff3cd;
                                        border: 1px solid #ffc107;
                                        border-radius: 6px;
                                        padding: 8px 12px;
                                        font-size: 12px;
                                        color: #856404;
                                        margin-top: 10px;
                                    ">
                                        保留日時: ${new Date(item.timestamp).toLocaleString('ja-JP', {
                                            year: 'numeric',
                                            month: '2-digit',
                                            day: '2-digit',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                    </div>
                                </div>
                                
                                ${changedText ? `
                                <div style="
                                    background: #fff3e0;
                                    border-left: 4px solid #ff9800;
                                    padding: 12px;
                                    margin-bottom: 15px;
                                    border-radius: 4px;
                                ">
                                    <div style="color: #ff9800; font-weight: bold; margin-bottom: 5px;">⚠️ 検出された変更</div>
                                    <div style="color: #666; font-size: 14px;">${changedText}</div>
                                </div>
                                ` : ''}
                                
                                ${item.hasNameChange ? `
                                <div style="
                                    background: #f5f5f5;
                                    border: 1px solid #e0e0e0;
                                    border-radius: 6px;
                                    padding: 12px;
                                    margin-bottom: 15px;
                                    max-height: 150px;
                                    overflow-y: auto;
                                ">
                                    <div style="font-size: 13px; color: #666; font-weight: bold; margin-bottom: 8px;">変更された予約:</div>
                                    ${item.changedEventsDetails.slice(0, 5).map(detail => `
                                        <div style="font-size: 12px; color: #333; padding: 4px 0; border-bottom: 1px solid #e0e0e0;">
                                            ${detail.date}(${detail.dayOfWeek}) ${detail.time} ${detail.member} → ${detail.patientName}
                                        </div>
                                    `).join('')}
                                    ${item.changedEventsDetails.length > 5 ? `
                                        <div style="font-size: 12px; color: #999; padding: 4px 0;">
                                            ...他${item.changedEventsDetails.length - 5}件
                                        </div>
                                    ` : ''}
                                </div>
                                ` : ''}
                                
                                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                                    <button onclick="executePendingGeneration('${item.id}')" style="
                                        background: #4CAF50;
                                        color: white;
                                        border: none;
                                        padding: 10px 20px;
                                        border-radius: 6px;
                                        cursor: pointer;
                                        font-weight: bold;
                                        font-size: 14px;
                                        transition: background 0.2s;
                                    " onmouseover="this.style.background='#45a049'" onmouseout="this.style.background='#4CAF50'">
                                        ✓ 生成する
                                    </button>
                                    <button onclick="deletePendingGeneration('${item.id}')" style="
                                        background: #f44336;
                                        color: white;
                                        border: none;
                                        padding: 10px 20px;
                                        border-radius: 6px;
                                        cursor: pointer;
                                        font-weight: bold;
                                        font-size: 14px;
                                        transition: background 0.2s;
                                    " onmouseover="this.style.background='#da190b'" onmouseout="this.style.background='#f44336'">
                                        ✕ 削除
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    });
    
    // すべてクリアボタン
    html += `
        <div style="text-align: center; margin-top: 20px; padding-top: 20px; border-top: 2px solid #e0e0e0;">
            <button onclick="clearAllPending()" style="
                background: #9e9e9e;
                color: white;
                border: none;
                padding: 10px 30px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                transition: background 0.2s;
            " onmouseover="this.style.background='#757575'" onmouseout="this.style.background='#9e9e9e'">
                すべてクリア
            </button>
        </div>
    `;
    
    panel.innerHTML = html;
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
}

// ⭐ 詳細表示のトグル
window.togglePendingDetail = function(itemId) {
    const detailDiv = document.getElementById(`detail-${itemId}`);
    const arrow = document.getElementById(`arrow-${itemId}`);
    
    if (detailDiv.style.display === 'none') {
        detailDiv.style.display = 'block';
        arrow.textContent = '▲';
    } else {
        detailDiv.style.display = 'none';
        arrow.textContent = '▼';
    }
};

// ⭐ パネルを閉じる
window.closePendingPanel = function() {
    const overlay = document.getElementById('pending-overlay');
    if (overlay) {
        overlay.remove();
    }
};

// ⭐ 保留データを実行
window.executePendingGeneration = async function(pendingId) {
    const pendingList = getPendingGenerations();
    const item = pendingList.find(p => p.id === pendingId);
    
    if (!item) {
        alert('データが見つかりません');
        return;
    }
    
    // 確認ダイアログ
    const confirmMessage = `以下の内容で6ヶ月分を生成しますか？\n\n` +
        `患者名: ${item.originalPatientName}\n` +
        `スタッフ: ${item.member}\n` +
        `曜日: 毎週${item.dayOfWeek}曜日\n` +
        `時刻: ${item.time}`;
    
    if (!confirm(confirmMessage)) {
        return;
    }
    
    try {
        // 生成処理
        const baseEvent = {
            member: item.member,
            surname: item.surname,
            firstname: item.firstname,
            displayName: item.displayName,
            time: item.time,
            startTime: item.startTime,
            endTime: item.endTime,
            type: item.type,
            repeat: item.repeatPattern.type
        };
        
        console.log('Generating from pending data:', baseEvent);
        
        if (item.type === 'day' || item.type === 'meeting') {
            await app.generateRepeatingRangeEventsExtended(baseEvent, item.parentId, item.latestDate);
        } else {
            await app.generateRepeatingInFirestoreExtended(baseEvent, item.parentId, item.latestDate);
        }
        
        // 保留データから削除
        removePendingGeneration(pendingId);
        
        alert('✅ 6ヶ月分の予定を生成しました');
        
        // パネルを更新
        closePendingPanel();
        showPendingGenerationsPanel();
        
    } catch (error) {
        console.error('Generation error:', error);
        alert('⚠️ 生成中にエラーが発生しました: ' + error.message);
    }
};

// ⭐ 保留データを削除
window.deletePendingGeneration = function(pendingId) {
    if (confirm('この保留データを削除しますか？')) {
        removePendingGeneration(pendingId);
        
        // パネルを更新
        closePendingPanel();
        const remaining = getPendingGenerations();
        if (remaining.length > 0) {
            showPendingGenerationsPanel();
        } else {
            alert('すべての保留データが削除されました');
        }
    }
};

// ⭐ すべての保留データをクリア
window.clearAllPending = function() {
    if (confirm('すべての保留データを削除しますか？')) {
        clearAllPendingGenerations();
        closePendingPanel();
        alert('すべての保留データを削除しました');
    }
};

// ⭐ お知らせボタンをクリックした際の処理
window.openPendingNotifications = function() {
    showPendingGenerationsPanel();
};

console.log('✅ Pending generations UI loaded');

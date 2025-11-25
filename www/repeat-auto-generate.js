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
                // 同じ繰り返しグループは除外（自分自身との衝突は無視）
                if (data.repeatParent === parentId || doc.id === parentId) {
                    return;
                }
                
                // 時間情報がない場合はスキップ
                if (!data.time) {
                    return;
                }
                
                // 時間範囲の重複チェック
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
                baseDate: baseDate
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
                    // 同じ繰り返しグループは除外
                    if (data.repeatParent === parentId || doc.id === parentId) {
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
            
            const docRef = db.collection('events').doc();
            batch.set(docRef, repeatEvent);
            console.log(`✅ Generated: ${dateStr} (occurrence ${occurrenceCount})`);
        }
        
        occurrenceCount++;
    }
    
    await batch.commit();
    console.log(`=== 範囲イベント生成完了: スキップ ${skippedCount}件 ===`);
};

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

// アプリ起動時のチェック＆自動生成（最適化版 + 衝突チェック対応）
FirebaseScheduleManager.prototype.checkAndGenerateFutureRepeats = async function() {
    console.log('=== 繰り返しイベントのチェック開始（衝突チェック有効） ===');
    
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
        
        for (const [parentId, group] of repeatGroups) {
            console.log(`\nChecking group: ${parentId}`);
            console.log(`Latest date: ${group.latestDate}`);
            
            if (group.latestDate < twoMonthsLaterStr) {
                console.log(`⚠️ Need to generate more events (latest: ${group.latestDate}, need until: ${twoMonthsLaterStr})`);
                
                const pattern = group.latestEvent.repeatPattern;
                if (!pattern) {
                    console.log('No repeat pattern found, skipping');
                    continue;
                }
                
                // ⭐ スマート時刻判定を実行
                const optimalTime = determineOptimalTime(group.events);
                const timeToUse = optimalTime || group.latestEvent.time;
                
                console.log(`Determined time to use: ${timeToUse}`);
                
                // 最新の日付から6ヶ月分追加生成
                const baseEvent = {
                    member: group.latestEvent.member,
                    surname: group.latestEvent.surname,
                    firstname: group.latestEvent.firstname,
                    displayName: group.latestEvent.displayName,
                    time: timeToUse,  // ⭐ スマート判定結果を使用
                    startTime: group.latestEvent.startTime,
                    endTime: group.latestEvent.endTime,
                    type: group.latestEvent.type,
                    repeat: pattern.type
                };
                
                if (group.latestEvent.type === 'day' || group.latestEvent.type === 'meeting') {
                    // 範囲イベント
                    await this.generateRepeatingRangeEventsExtended(baseEvent, parentId, group.latestDate);
                } else {
                    // 通常イベント
                    await this.generateRepeatingInFirestoreExtended(baseEvent, parentId, group.latestDate);
                }
                
                generatedCount++;
            } else {
                console.log(`✅ Group has enough future events`);
            }
        }
        
        // ⭐ チェック完了を記録
        const thisMonday = getThisMonday();
        localStorage.setItem('lastRepeatCheck', thisMonday);
        console.log(`✅ Repeat check completed and recorded: ${thisMonday}`);
        
        if (generatedCount > 0) {
            console.log(`\n=== ${generatedCount}個の繰り返しグループに追加生成しました（衝突はスキップ） ===`);
            this.showNotification(`${generatedCount}個の繰り返し予定を更新しました（衝突日は自動スキップ）`, 'info');
        } else {
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

console.log('✅ Repeat auto-generate feature loaded (optimized version with conflict detection)');

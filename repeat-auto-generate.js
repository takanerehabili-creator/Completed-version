// ===== 繰り返し予定の自動生成機能（最適化版） =====

/**
 * 要件:
 * 1. 初回作成時に6ヶ月分を生成
 * 2. アプリ起動時に「今日から2ヶ月先」までデータがあるかチェック
 * 3. 不足していれば6ヶ月分を追加生成
 * 4. 親イベントが削除されても、子イベントから繰り返し設定を読み取って継続
 * 
 * 最適化:
 * - チェックは毎週月曜日の初回起動時のみ実行（読み取り回数を削減）
 */

// 繰り返しパターンを子イベントに保存するための拡張
FirebaseScheduleManager.prototype.generateRepeatingInFirestoreExtended = async function(baseEvent, parentId, baseDate) {
    const batch = db.batch();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 6); // 6ヶ月分生成
    
    const baseDateTime = this.createLocalDate(baseDate);
    const intervalDays = this.getInterval(baseEvent.repeat);
    let occurrenceCount = 1;
    
    console.log(`=== 6ヶ月分の繰り返し生成開始 ===`);
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
        
        const newDocRef = db.collection('events').doc();
        batch.set(newDocRef, repeatEvent);
        
        console.log(`Generated: ${nextDateStr} (occurrence ${occurrenceCount})`);
        occurrenceCount++;
    }
    
    await batch.commit();
    console.log(`=== 生成完了: ${occurrenceCount - 1}件 ===`);
};

// 範囲イベント（デイ・担会）用の6ヶ月生成
FirebaseScheduleManager.prototype.generateRepeatingRangeEventsExtended = async function(baseEvent, parentId, baseDate) {
    const batch = db.batch();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 6); // 6ヶ月分生成
    
    const baseDateTime = this.createLocalDate(baseDate);
    const baseDayOfWeek = baseDateTime.getDay();
    const intervalDays = this.getInterval(baseEvent.repeat);
    let occurrenceCount = 1;
    
    console.log(`=== 範囲イベント6ヶ月分の生成開始 ===`);
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
            
            const docRef = db.collection('events').doc();
            batch.set(docRef, repeatEvent);
            console.log(`Generated: ${dateStr} (occurrence ${occurrenceCount})`);
        }
        
        occurrenceCount++;
    }
    
    await batch.commit();
    console.log(`=== 範囲イベント生成完了 ===`);
};

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

// アプリ起動時のチェック＆自動生成（最適化版）
FirebaseScheduleManager.prototype.checkAndGenerateFutureRepeats = async function() {
    console.log('=== 繰り返しイベントのチェック開始 ===');
    
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
                
                // 最新の日付から6ヶ月分追加生成
                const baseEvent = {
                    member: group.latestEvent.member,
                    surname: group.latestEvent.surname,
                    firstname: group.latestEvent.firstname,
                    displayName: group.latestEvent.displayName,
                    time: group.latestEvent.time,
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
            console.log(`\n=== ${generatedCount}個の繰り返しグループに追加生成しました ===`);
            this.showNotification(`${generatedCount}個の繰り返し予定を更新しました`, 'info');
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
                console.log('Running automatic repeat check (optimized - weekly on Monday)...');
                await window.app.checkAndGenerateFutureRepeats();
            }, 5000);
        }
    }, 1000);
});

console.log('✅ Repeat auto-generate feature loaded (optimized version)');

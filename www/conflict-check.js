// ===== 繰り返し設定時の衝突チェック機能 =====

// 1. 衝突チェックメソッド（Firestoreから直接取得）
FirebaseScheduleManager.prototype.checkRepeatConflicts = async function(baseEvent, parentId, baseDate) {
    const conflicts = [];
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 3);
    
    const baseDateTime = this.createLocalDate(baseDate);
    const intervalDays = this.getInterval(baseEvent.repeat);
    let occurrenceCount = 1;
    
    console.log('=== 衝突チェック開始 ===');
    console.log('baseEvent:', baseEvent);
    console.log('parentId:', parentId);
    console.log('interval:', intervalDays, 'days');
    
    while (true) {
        const nextDate = new Date(baseDateTime);
        nextDate.setDate(baseDateTime.getDate() + (intervalDays * occurrenceCount));
        
        if (nextDate > endDate) break;
        
        const nextDateStr = this.formatDate(nextDate);
        
        // Firestoreから直接チェック
        if (baseEvent.type === 'day' || baseEvent.type === 'meeting') {
            // 範囲イベントの場合
            const snapshot = await db.collection('events')
                .where('member', '==', baseEvent.member)
                .where('date', '==', nextDateStr)
                .get();
            
            snapshot.forEach(doc => {
                const data = doc.data();
                if ((data.type === 'day' || data.type === 'meeting') && 
                    doc.id !== parentId && 
                    data.repeatParent !== parentId) {
                    console.log('衝突検出:', nextDateStr, data);
                    conflicts.push({
                        date: nextDateStr,
                        time: data.startTime || '',
                        name: data.displayName || '',
                        type: data.type,
                        id: doc.id
                    });
                }
            });
        } else {
            // 通常イベント（20分など）の場合
            const snapshot = await db.collection('events')
                .where('member', '==', baseEvent.member)
                .where('date', '==', nextDateStr)
                .where('time', '==', baseEvent.time)
                .get();
            
            snapshot.forEach(doc => {
                if (doc.id !== parentId && doc.data().repeatParent !== parentId) {
                    const data = doc.data();
                    console.log('衝突検出:', nextDateStr, data);
                    conflicts.push({
                        date: nextDateStr,
                        time: baseEvent.time,
                        name: (data.surname || '') + (data.firstname || ''),
                        type: data.type,
                        id: doc.id
                    });
                }
            });
        }
        
        occurrenceCount++;
    }
    
    console.log(`衝突チェック完了: ${conflicts.length}件の衝突`);
    return conflicts;
};

// 2. 衝突解決モーダル
FirebaseScheduleManager.prototype.showConflictModal = function(conflicts, onResolve) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.style.zIndex = '10001';
    
    const conflictList = conflicts.slice(0, 10).map(c => 
        `<li style="margin:5px 0;font-size:13px">
            📅 ${c.date} ⏰ ${c.time} - ${c.name || c.type}
        </li>`
    ).join('');
    
    const moreText = conflicts.length > 10 ? 
        `<p style="color:#666;font-size:12px;margin-top:10px">...他${conflicts.length - 10}件</p>` : '';
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width:500px">
            <h2 class="modal-header" style="color:#d32f2f">⚠️ 既存の予定との衝突</h2>
            <div style="margin:20px 0">
                <p style="margin-bottom:15px;font-weight:600">
                    繰り返し設定する日程に既存の予定が${conflicts.length}件あります:
                </p>
                <div style="background:#fff3e0;border-left:4px solid #ff9800;padding:15px;max-height:200px;overflow-y:auto">
                    <ul style="margin:0;padding-left:20px">
                        ${conflictList}
                    </ul>
                    ${moreText}
                </div>
            </div>
            <div style="margin:20px 0;padding:15px;background:#f5f5f5;border-radius:8px">
                <p style="font-weight:600;margin-bottom:10px">どのように処理しますか？</p>
                <div style="display:flex;flex-direction:column;gap:10px">
                    <button class="action-btn primary" id="replaceBtn" style="padding:12px">
                        🔄 既存の予定を削除して置き換える
                    </button>
                    <button class="action-btn" id="skipBtn" style="padding:12px;background:#4caf50">
                        ⏭️ 既存の予定がある日はスキップする
                    </button>
                    <button class="action-btn secondary" id="cancelBtn" style="padding:12px">
                        キャンセル
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const replaceBtn = modal.querySelector('#replaceBtn');
    const skipBtn = modal.querySelector('#skipBtn');
    const cancelBtn = modal.querySelector('#cancelBtn');
    
    const cleanup = () => {
        document.body.removeChild(modal);
    };
    
    replaceBtn.onclick = () => {
        cleanup();
        onResolve('replace');
    };
    
    skipBtn.onclick = () => {
        cleanup();
        onResolve('skip');
    };
    
    cancelBtn.onclick = () => {
        cleanup();
        onResolve('cancel');
    };
};

// 3. スキップ付き繰り返し生成（通常イベント）
FirebaseScheduleManager.prototype.generateRepeatingWithSkip = async function(baseEvent, parentId, baseDate, conflicts) {
    const batch = db.batch();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 3);
    
    const baseDateTime = this.createLocalDate(baseDate);
    const intervalDays = this.getInterval(baseEvent.repeat);
    const conflictDates = new Set(conflicts.map(c => c.date));
    
    let occurrenceCount = 1;
    let createdCount = 0;
    
    console.log(`Generating with skip - conflict dates:`, conflictDates);
    
    while (true) {
        const nextDate = new Date(baseDateTime);
        nextDate.setDate(baseDateTime.getDate() + (intervalDays * occurrenceCount));
        
        if (nextDate > endDate) break;
        
        const nextDateStr = this.formatDate(nextDate);
        
        // 衝突する日はスキップ
        if (conflictDates.has(nextDateStr)) {
            console.log(`Skipping conflict date: ${nextDateStr}`);
            occurrenceCount++;
            continue;
        }
        
        const repeatEvent = {
            ...baseEvent,
            date: nextDateStr,
            repeatParent: parentId,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        
        const newDocRef = db.collection('events').doc();
        batch.set(newDocRef, repeatEvent);
        
        this.events.push({
            id: newDocRef.id,
            ...repeatEvent
        });
        
        createdCount++;
        occurrenceCount++;
    }
    
    await batch.commit();
    console.log(`Created ${createdCount} repeat events (skipped ${conflicts.length} conflicts)`);
};

// 4. スキップ付き繰り返し生成（範囲イベント）
FirebaseScheduleManager.prototype.generateRangeRepeatingWithSkip = async function(baseEvent, parentId, baseDate, conflicts) {
    const batch = db.batch();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 3);
    
    const baseDateTime = this.createLocalDate(baseDate);
    const intervalDays = this.getInterval(baseEvent.repeat);
    const conflictDates = new Set(conflicts.map(c => c.date));
    
    let occurrenceCount = 1;
    let createdCount = 0;
    
    while (true) {
        const nextDate = new Date(baseDateTime);
        nextDate.setDate(baseDateTime.getDate() + (intervalDays * occurrenceCount));
        
        if (nextDate > endDate) break;
        
        const nextDateStr = this.formatDate(nextDate);
        
        // 衝突する日はスキップ
        if (conflictDates.has(nextDateStr)) {
            occurrenceCount++;
            continue;
        }
        
        const repeatEvent = {
            ...baseEvent,
            date: nextDateStr,
            repeatParent: parentId,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        
        const newDocRef = db.collection('events').doc();
        batch.set(newDocRef, repeatEvent);
        
        this.events.push({
            id: newDocRef.id,
            ...repeatEvent
        });
        
        createdCount++;
        occurrenceCount++;
    }
    
    await batch.commit();
    console.log(`Created ${createdCount} range repeat events (skipped ${conflicts.length} conflicts)`);
};

console.log('✅ Conflict check feature loaded');

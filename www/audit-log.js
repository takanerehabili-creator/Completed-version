// ===== 操作履歴記録機能（Audit Log） =====

/**
 * 機能:
 * - 予約の追加/変更/削除を自動記録
 * - Firestoreのaudit_logsコレクションに保存
 * - 読み取り数は増加しない（書き込みのみ）
 */

// 履歴を記録する関数
async function recordAuditLog(action, eventData, changes = null) {
    try {
        const logEntry = {
            action: action, // "create" | "update" | "delete"
            timestamp: new Date(),
            eventId: eventData.id || null,
            eventData: {
                member: eventData.member,
                memberName: eventData.displayName || `${eventData.surname || ''}${eventData.firstname || ''}`,
                date: eventData.date,
                time: eventData.time || eventData.startTime || null,
                type: eventData.type,
                repeatParent: eventData.repeatParent || null
            }
        };
        
        // 変更内容がある場合のみ追加
        if (changes && Object.keys(changes).length > 0) {
            logEntry.changes = changes;
        }
        
        // Firestoreに保存
        await db.collection('audit_logs').add(logEntry);
        
        console.log('📝 Audit log recorded:', action, eventData.date, eventData.time);
    } catch (error) {
        console.error('Failed to record audit log:', error);
        // エラーが発生しても処理は続行（履歴記録の失敗で本処理を止めない）
    }
}

// 既存の保存関数をラップして履歴記録を追加
if (typeof FirebaseScheduleManager !== 'undefined') {
    
    // ===== イベント保存時の履歴記録 =====
    const originalSaveEvent = FirebaseScheduleManager.prototype.saveEventToFirestore;
    FirebaseScheduleManager.prototype.saveEventToFirestore = async function(eventData) {
        const isUpdate = !!eventData.id;
        
        // 変更前のデータを取得（更新の場合）
        let oldEventData = null;
        if (isUpdate) {
            const existingEvent = this.events.find(e => e.id === eventData.id);
            if (existingEvent) {
                oldEventData = { ...existingEvent };
            }
        }
        
        // 元の保存処理を実行
        const result = await originalSaveEvent.call(this, eventData);
        
        // 履歴を記録
        if (isUpdate && oldEventData) {
            // 変更内容を抽出
            const changes = {};
            const fieldsToCheck = ['time', 'date', 'type', 'surname', 'firstname', 'displayName', 'startTime', 'endTime'];
            
            fieldsToCheck.forEach(field => {
                if (eventData[field] !== oldEventData[field] && 
                    eventData[field] !== undefined && 
                    oldEventData[field] !== undefined) {
                    changes[field] = {
                        old: oldEventData[field],
                        new: eventData[field]
                    };
                }
            });
            
            if (Object.keys(changes).length > 0) {
                await recordAuditLog('update', { ...eventData, id: eventData.id }, changes);
            }
        } else {
            // 新規作成
            await recordAuditLog('create', { ...eventData, id: result });
        }
        
        return result;
    };
    
    // ===== イベント削除時の履歴記録 =====
    const originalDeleteEventFromFirestore = FirebaseScheduleManager.prototype.deleteEventFromFirestore;
    FirebaseScheduleManager.prototype.deleteEventFromFirestore = async function(eventId) {
        // 削除前のデータを取得
        const eventToDelete = this.events.find(e => e.id === eventId);
        
        // 元の削除処理を実行
        const result = await originalDeleteEventFromFirestore.call(this, eventId);
        
        // 履歴を記録
        if (eventToDelete) {
            await recordAuditLog('delete', { ...eventToDelete, id: eventId });
        }
        
        return result;
    };
    
    // ===== 一括削除時の履歴記録 =====
    // Note: 一括削除はdeleteEventFromFirestoreを呼び出すので、上記で記録される
    
    console.log('✅ Audit log feature loaded');
}

// グローバルに公開（手動での記録が必要な場合に備えて）
window.recordAuditLog = recordAuditLog;

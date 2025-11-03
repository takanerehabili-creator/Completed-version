// ===== データバックアップ＆復元機能 =====

/**
 * 機能:
 * 1. 全データをJSON形式でダウンロード（バックアップ作成）
 * 2. JSONファイルから復元
 * 3. 復元前に自動バックアップ
 * 4. 安全確認機能
 */

// バックアップするコレクション一覧
const BACKUP_COLLECTIONS = [
    'events',           // 予定
    'holidays',         // 祝日
    'teamMembers',      // スタッフ
    'staffLeaves',      // 有給・公休日
    'staffOverrides',   // スタッフ入れ替え
    'daySchedules'      // デイスケジュール
];

// バックアップ作成
async function createBackup() {
    const confirmMsg = `全データのバックアップを作成しますか？\n\n` +
        `以下のデータが含まれます:\n` +
        `- 予定\n` +
        `- 祝日\n` +
        `- スタッフ情報\n` +
        `- 有給・公休日\n` +
        `- スタッフ入れ替え\n` +
        `- デイスケジュール`;
    
    if (!confirm(confirmMsg)) return;
    
    showLoading('バックアップを作成中...');
    
    try {
        const backup = {
            version: '1.0',
            createdAt: new Date().toISOString(),
            data: {}
        };
        
        let totalCount = 0;
        
        // 各コレクションのデータを取得
        for (const collectionName of BACKUP_COLLECTIONS) {
            console.log(`Backing up collection: ${collectionName}`);
            
            const snapshot = await db.collection(collectionName).get();
            
            backup.data[collectionName] = snapshot.docs.map(doc => {
                const data = doc.data();
                
                // Timestampオブジェクトを文字列に変換
                const cleanedData = {};
                for (const [key, value] of Object.entries(data)) {
                    if (value && typeof value.toDate === 'function') {
                        cleanedData[key] = value.toDate().toISOString();
                    } else {
                        cleanedData[key] = value;
                    }
                }
                
                return {
                    id: doc.id,
                    ...cleanedData
                };
            });
            
            totalCount += snapshot.size;
            console.log(`  → ${snapshot.size} documents`);
        }
        
        hideLoading();
        
        // JSONファイルとしてダウンロード
        const dataStr = JSON.stringify(backup, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        const filename = `backup-${new Date().toISOString().split('T')[0]}-${Date.now()}.json`;
        
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        console.log(`Backup created: ${totalCount} documents`);
        app.showNotification(`バックアップを作成しました（${totalCount}件）`, 'success');
        
    } catch (error) {
        console.error('Backup creation error:', error);
        hideLoading();
        app.showNotification('バックアップの作成に失敗しました', 'error');
    }
}

// バックアップ復元モーダルを開く
function openRestoreModal() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.style.zIndex = '10001';
    modal.id = 'restoreModal';
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width:600px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
                <h2 class="modal-header" style="margin:0">📥 バックアップから復元</h2>
                <button onclick="closeRestoreModal()" style="background:none;border:none;font-size:24px;cursor:pointer;color:#666">×</button>
            </div>
            
            <div style="background:#fff3e0;border-left:4px solid #ff9800;padding:15px;margin-bottom:20px;border-radius:4px">
                <div style="font-weight:600;color:#f57c00;margin-bottom:8px">⚠️ 重要な注意事項</div>
                <div style="font-size:13px;color:#666;line-height:1.6">
                    復元を実行すると、現在のデータは<strong>完全に上書き</strong>されます。<br>
                    復元前に自動的に現在のデータをバックアップします。
                </div>
            </div>
            
            <div class="form-section">
                <label class="form-label">バックアップファイルを選択:</label>
                <input type="file" id="restoreFileInput" accept=".json" 
                       style="width:100%;padding:10px;border:2px dashed #ddd;border-radius:8px;cursor:pointer"
                       onchange="previewBackup(this)">
            </div>
            
            <div id="backupPreview" style="display:none;margin-top:20px">
                <div style="background:#f5f5f5;padding:15px;border-radius:8px;margin-bottom:20px">
                    <div style="font-weight:600;margin-bottom:10px">📋 バックアップ情報</div>
                    <div id="backupInfo" style="font-size:13px;line-height:1.8"></div>
                </div>
                
                <div style="display:flex;gap:10px;justify-content:flex-end">
                    <button class="action-btn secondary" onclick="closeRestoreModal()">キャンセル</button>
                    <button class="action-btn danger" onclick="executeRestore()">復元を実行</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// 復元モーダルを閉じる
function closeRestoreModal() {
    const modal = document.getElementById('restoreModal');
    if (modal) {
        document.body.removeChild(modal);
    }
    window.selectedBackupFile = null;
    window.selectedBackupData = null;
}

// バックアップファイルをプレビュー
async function previewBackup(input) {
    const file = input.files[0];
    if (!file) return;
    
    try {
        const text = await file.text();
        const backup = JSON.parse(text);
        
        // バリデーション
        if (!backup.version || !backup.data) {
            app.showNotification('無効なバックアップファイルです', 'error');
            return;
        }
        
        // 情報を表示
        let infoHTML = `<div style="color:#666">`;
        infoHTML += `📅 作成日時: ${new Date(backup.createdAt).toLocaleString('ja-JP')}<br>`;
        infoHTML += `📦 バージョン: ${backup.version}<br><br>`;
        infoHTML += `<strong>含まれるデータ:</strong><br>`;
        
        let totalDocs = 0;
        for (const [collectionName, docs] of Object.entries(backup.data)) {
            const count = docs.length;
            totalDocs += count;
            
            const labels = {
                'events': '予定',
                'holidays': '祝日',
                'teamMembers': 'スタッフ',
                'staffLeaves': '有給・公休日',
                'staffOverrides': 'スタッフ入れ替え',
                'daySchedules': 'デイスケジュール'
            };
            
            const label = labels[collectionName] || collectionName;
            infoHTML += `- ${label}: ${count}件<br>`;
        }
        
        infoHTML += `<br><strong>合計: ${totalDocs}件</strong>`;
        infoHTML += `</div>`;
        
        document.getElementById('backupInfo').innerHTML = infoHTML;
        document.getElementById('backupPreview').style.display = 'block';
        
        // グローバルに保存
        window.selectedBackupFile = file;
        window.selectedBackupData = backup;
        
    } catch (error) {
        console.error('Preview error:', error);
        app.showNotification('ファイルの読み込みに失敗しました', 'error');
    }
}

// 復元を実行
async function executeRestore() {
    if (!window.selectedBackupData) {
        app.showNotification('バックアップファイルを選択してください', 'error');
        return;
    }
    
    const backup = window.selectedBackupData;
    
    // 最終確認
    const totalDocs = Object.values(backup.data).reduce((sum, docs) => sum + docs.length, 0);
    
    const confirmMsg = `本当に復元を実行しますか？\n\n` +
        `復元されるデータ: ${totalDocs}件\n\n` +
        `⚠️ 現在のデータは完全に上書きされます\n` +
        `⚠️ この操作は取り消せません\n\n` +
        `続行する前に、現在のデータを自動バックアップします。`;
    
    if (!confirm(confirmMsg)) return;
    
    closeRestoreModal();
    showLoading('復元中... (1/3) 現在のデータをバックアップ中');
    
    try {
        // ステップ1: 現在のデータをバックアップ
        console.log('Step 1: Creating safety backup...');
        await createSafetyBackup();
        
        // ステップ2: 現在のデータを削除
        showLoading('復元中... (2/3) 現在のデータを削除中');
        console.log('Step 2: Deleting current data...');
        await deleteAllData();
        
        // ステップ3: バックアップから復元
        showLoading('復元中... (3/3) データを復元中');
        console.log('Step 3: Restoring from backup...');
        await restoreData(backup);
        
        hideLoading();
        
        const successMsg = `復元が完了しました！\n\n` +
            `復元されたデータ: ${totalDocs}件\n\n` +
            `ページを再読み込みします。`;
        
        alert(successMsg);
        location.reload();
        
    } catch (error) {
        console.error('Restore error:', error);
        hideLoading();
        app.showNotification('復元に失敗しました', 'error');
    }
}

// 安全のために現在のデータをバックアップ（自動）
async function createSafetyBackup() {
    const backup = {
        version: '1.0',
        createdAt: new Date().toISOString(),
        type: 'safety-backup',
        data: {}
    };
    
    for (const collectionName of BACKUP_COLLECTIONS) {
        const snapshot = await db.collection(collectionName).get();
        
        backup.data[collectionName] = snapshot.docs.map(doc => {
            const data = doc.data();
            
            const cleanedData = {};
            for (const [key, value] of Object.entries(data)) {
                if (value && typeof value.toDate === 'function') {
                    cleanedData[key] = value.toDate().toISOString();
                } else {
                    cleanedData[key] = value;
                }
            }
            
            return {
                id: doc.id,
                ...cleanedData
            };
        });
    }
    
    // ダウンロード
    const dataStr = JSON.stringify(backup, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const filename = `safety-backup-${new Date().toISOString().split('T')[0]}-${Date.now()}.json`;
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    console.log('Safety backup created');
}

// 全データを削除
async function deleteAllData() {
    for (const collectionName of BACKUP_COLLECTIONS) {
        console.log(`Deleting collection: ${collectionName}`);
        
        const snapshot = await db.collection(collectionName).get();
        
        // バッチで削除（500件ずつ）
        const batches = [];
        let currentBatch = db.batch();
        let batchCount = 0;
        
        snapshot.docs.forEach(doc => {
            currentBatch.delete(doc.ref);
            batchCount++;
            
            if (batchCount === 500) {
                batches.push(currentBatch.commit());
                currentBatch = db.batch();
                batchCount = 0;
            }
        });
        
        if (batchCount > 0) {
            batches.push(currentBatch.commit());
        }
        
        await Promise.all(batches);
        console.log(`  → Deleted ${snapshot.size} documents`);
    }
}

// データを復元
async function restoreData(backup) {
    for (const [collectionName, docs] of Object.entries(backup.data)) {
        console.log(`Restoring collection: ${collectionName}`);
        
        // バッチで書き込み（500件ずつ）
        const batches = [];
        let currentBatch = db.batch();
        let batchCount = 0;
        
        docs.forEach(doc => {
            const { id, ...data } = doc;
            
            // ISO文字列をTimestampに戻す
            const processedData = {};
            for (const [key, value] of Object.entries(data)) {
                if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
                    processedData[key] = firebase.firestore.Timestamp.fromDate(new Date(value));
                } else {
                    processedData[key] = value;
                }
            }
            
            const docRef = db.collection(collectionName).doc(id);
            currentBatch.set(docRef, processedData);
            batchCount++;
            
            if (batchCount === 500) {
                batches.push(currentBatch.commit());
                currentBatch = db.batch();
                batchCount = 0;
            }
        });
        
        if (batchCount > 0) {
            batches.push(currentBatch.commit());
        }
        
        await Promise.all(batches);
        console.log(`  → Restored ${docs.length} documents`);
    }
}

console.log('✅ Backup & Restore feature loaded');

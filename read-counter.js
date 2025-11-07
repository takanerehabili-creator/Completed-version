// ✅ 全体合計優先版カウンター

class TotalFocusedReadCounter {
    constructor() {
        this.storageKey = 'firestore_read_count';
        this.dateKey = 'firestore_read_date';
        this.sharedTotalKey = 'firestore_shared_total'; // 全端末共有の合計
        this.sharedTotalTimestampKey = 'firestore_shared_total_timestamp';
        this.deviceIdKey = 'firestore_device_id';
        this.dailyLimit = 50000;
        
        this.initCounter();
        this.initDeviceId();
        this.wrapFirestoreOperations();
        this.setupRealtimeSync(); // ⭐ リアルタイム同期
    }
    
    // Firestore操作をラップ
    wrapFirestoreOperations() {
        if (!window.db) {
            setTimeout(() => this.wrapFirestoreOperations(), 1000);
            return;
        }
        
        const db = window.db;
        
        // Query.get()
        const QueryProto = Object.getPrototypeOf(db.collection('_test'));
        const originalGet = QueryProto.get;
        QueryProto.get = async function(...args) {
            const result = await originalGet.apply(this, args);
            if (window.readCounter && result.docs) {
                window.readCounter.increment(result.docs.length);
            }
            return result;
        };
        
        // DocumentReference.get()
        const docRef = db.collection('_test').doc('_test');
        const DocRefProto = Object.getPrototypeOf(docRef);
        const originalDocGet = DocRefProto.get;
        DocRefProto.get = async function(...args) {
            const result = await originalDocGet.apply(this, args);
            if (window.readCounter) {
                window.readCounter.increment(1);
            }
            return result;
        };
        
        // onSnapshot
        const originalOnSnapshot = QueryProto.onSnapshot;
        QueryProto.onSnapshot = function(optionsOrObserverOrOnNext, observerOrOnNextOrOnError, onError) {
            let isFirstSnapshot = true;
            
            const wrappedCallback = (snapshot) => {
                if (window.readCounter && snapshot.docs) {
                    window.readCounter.increment(snapshot.docs.length);
                    isFirstSnapshot = false;
                }
                
                if (typeof optionsOrObserverOrOnNext === 'function') {
                    optionsOrObserverOrOnNext(snapshot);
                } else if (optionsOrObserverOrOnNext && optionsOrObserverOrOnNext.next) {
                    optionsOrObserverOrOnNext.next(snapshot);
                }
            };
            
            return originalOnSnapshot.call(this, wrappedCallback, observerOrOnNextOrOnError, onError);
        };
        
        console.log('✅ Firestore operations wrapped (total-focused version)');
    }
    
    // カウンターをインクリメント
    increment(count = 1) {
        const currentCount = this.getCount();
        const newCount = currentCount + count;
        localStorage.setItem(this.storageKey, String(newCount));
        
        // ⭐ 全体合計も即座に更新
        this.updateSharedTotal(count);
        
        this.updateDisplay();
        
        // 即座にFirestoreに同期（全体合計のため）
        this.syncToFirestoreImmediate();
        
        return newCount;
    }
    
    // ⭐ 共有合計を更新（ローカル推定値）
    updateSharedTotal(increment) {
        const currentTotal = this.getSharedTotal();
        const newTotal = currentTotal + increment;
        localStorage.setItem(this.sharedTotalKey, String(newTotal));
        localStorage.setItem(this.sharedTotalTimestampKey, String(Date.now()));
    }
    
    // 共有合計を取得
    getSharedTotal() {
        return parseInt(localStorage.getItem(this.sharedTotalKey) || '0', 10);
    }
    
    // ⭐ Firestoreに即座に同期（書き込みのみ、読み取りゼロ）
    async syncToFirestoreImmediate() {
        // デバウンス: 連続呼び出しを防ぐ
        if (this.syncTimeout) {
            clearTimeout(this.syncTimeout);
        }
        
        this.syncTimeout = setTimeout(async () => {
            await this.performSync();
        }, 2000); // 2秒のデバウンス
    }
    
    async performSync() {
        if (!window.db) return;
        
        try {
            const count = this.getCount();
            const today = this.getToday();
            
            // ⭐ 書き込みのみ（読み取りゼロ）
            await db.collection('readAnalytics').doc(`${today}_${this.deviceId}`).set({
                deviceId: this.deviceId,
                count: count,
                date: today,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            console.log(`✅ Synced: ${count} reads (write-only)`);
            
        } catch (error) {
            console.error('Sync failed:', error);
        }
    }
    
    // ⭐ リアルタイム同期を設定（onSnapshotで全体合計を監視）
    setupRealtimeSync() {
        // アプリ起動後5秒待ってから開始
        setTimeout(() => {
            this.startRealtimeListener();
        }, 5000);
    }
    
    async startRealtimeListener() {
        if (!window.db) return;
        
        const today = this.getToday();
        
        console.log('🔄 Starting realtime sync for total count...');
        
        // ⭐ onSnapshotでリアルタイム監視（初回のみ読み取り消費）
        this.unsubscribe = db.collection('readAnalytics')
            .where('date', '==', today)
            .onSnapshot(
                (snapshot) => {
                    let total = 0;
                    const deviceCount = snapshot.size;
                    
                    snapshot.docs.forEach(doc => {
                        const data = doc.data();
                        total += data.count || 0;
                    });
                    
                    // ⭐ 全体合計を更新
                    localStorage.setItem(this.sharedTotalKey, String(total));
                    localStorage.setItem(this.sharedTotalTimestampKey, String(Date.now()));
                    
                    console.log(`📊 Total updated: ${total} reads from ${deviceCount} devices (realtime)`);
                    
                    this.updateDisplay();
                    // アラート機能は無効化
                    // this.checkAlerts(total);
                },
                (error) => {
                    console.error('Realtime sync error:', error);
                }
            );
    }
    
    // ⭐ アラート判定（無効化）
    /*
    checkAlerts(total) {
        const today = this.getToday();
        const alert45Key = `read_alert_45000_${today}`;
        const alert48Key = `read_alert_48000_${today}`;
        
        if (total >= 48000 && !localStorage.getItem(alert48Key)) {
            localStorage.setItem(alert48Key, 'true');
            this.showAlert('danger', total);
        } else if (total >= 45000 && !localStorage.getItem(alert45Key)) {
            localStorage.setItem(alert45Key, 'true');
            this.showAlert('warning', total);
        }
    }
    
    showAlert(level, total) {
        const remaining = 50000 - total;
        const percentage = ((total / 50000) * 100).toFixed(1);
        
        let message;
        if (level === 'danger') {
            message = 
                `🚨 読み込み制限が迫っています！\n\n` +
                `全体の読み込み数: ${total.toLocaleString()}回 (${percentage}%)\n` +
                `残り: ${remaining.toLocaleString()}回\n\n` +
                `【重要】\n` +
                `・他の端末での利用を停止してください\n` +
                `・明日（太平洋時間0:00）にリセットされます\n` +
                `・書き込みは継続できます`;
        } else {
            message = 
                `⚠️ 読み込み制限が近づいています\n\n` +
                `全体の読み込み数: ${total.toLocaleString()}回 (${percentage}%)\n` +
                `残り: ${remaining.toLocaleString()}回\n\n` +
                `【推奨】\n` +
                `・複数端末での利用を控えてください\n` +
                `・明日（太平洋時間0:00）にリセットされます`;
        }
        
        alert(message);
    }
    */
    
    // 表示を更新
    updateDisplay() {
        const deviceCount = this.getCount();
        const totalCount = this.getSharedTotal();
        const timestamp = localStorage.getItem(this.sharedTotalTimestampKey);
        const lastUpdate = timestamp ? new Date(parseInt(timestamp)).toLocaleTimeString('ja-JP', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        }) : '未取得';
        
        const remaining = Math.max(0, this.dailyLimit - totalCount);
        const percentage = ((totalCount / this.dailyLimit) * 100).toFixed(1);
        
        // ヘッダー表示
        const counterElement = document.getElementById('readCounter');
        if (counterElement) {
            counterElement.innerHTML = 
                `📊 全体: <strong>${totalCount.toLocaleString()}</strong>回 (${percentage}%) ` +
                `| 端末: ${deviceCount.toLocaleString()}回 ` +
                `<span style="font-size:11px;color:#999">${lastUpdate}</span>`;
            
            // 色を変更
            counterElement.classList.remove('warning', 'danger', 'critical');
            if (totalCount >= 50000) {
                counterElement.classList.add('critical');
            } else if (totalCount >= 45000) {
                counterElement.classList.add('danger');
            } else if (totalCount >= 40000) {
                counterElement.classList.add('warning');
            }
        }
        
        // 管理画面表示
        const managementTotalElement = document.getElementById('managementTotalCount');
        if (managementTotalElement) {
            managementTotalElement.textContent = `${totalCount.toLocaleString()}回`;
        }
        
        const managementCountElement = document.getElementById('managementReadCount');
        if (managementCountElement) {
            managementCountElement.textContent = `${deviceCount.toLocaleString()}回 (この端末)`;
        }
        
        const managementRemainingElement = document.getElementById('managementRemaining');
        if (managementRemainingElement) {
            managementRemainingElement.textContent = `残り: ${remaining.toLocaleString()}回 (使用率: ${percentage}%)`;
            
            if (totalCount >= 48000) {
                managementRemainingElement.style.color = '#f44336';
            } else if (totalCount >= 40000) {
                managementRemainingElement.style.color = '#ff9800';
            } else {
                managementRemainingElement.style.color = '#4caf50';
            }
        }
    }
    
    // 初期化
    initCounter() {
        const today = this.getToday();
        const savedDate = localStorage.getItem(this.dateKey);
        
        if (savedDate !== today) {
            localStorage.setItem(this.storageKey, '0');
            localStorage.setItem(this.dateKey, today);
            localStorage.setItem(this.sharedTotalKey, '0');
            localStorage.setItem(this.sharedTotalTimestampKey, '0');
        }
    }
    
    initDeviceId() {
        let deviceId = localStorage.getItem(this.deviceIdKey);
        if (!deviceId) {
            deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem(this.deviceIdKey, deviceId);
        }
        this.deviceId = deviceId;
    }
    
    getToday() {
        const now = new Date();
        const pacificTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
        return `${pacificTime.getFullYear()}-${String(pacificTime.getMonth() + 1).padStart(2, '0')}-${String(pacificTime.getDate()).padStart(2, '0')}`;
    }
    
    getCount() {
        return parseInt(localStorage.getItem(this.storageKey) || '0', 10);
    }
    
    // クリーンアップ
    destroy() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
    }
}

// 初期化
window.readCounter = new TotalFocusedReadCounter();

// ページアンロード時にクリーンアップ
window.addEventListener('beforeunload', () => {
    if (window.readCounter) {
        window.readCounter.destroy();
    }
});

// Firebase Consoleを開く
function openFirebaseConsole() {
    const projectId = firebase.app().options.projectId;
    const url = `https://console.firebase.google.com/project/${projectId}/firestore/usage`;
    window.open(url, '_blank');
}

console.log('✅ Total-Focused Read Counter loaded');
console.log('📊 Realtime sync enabled - total count updates automatically');

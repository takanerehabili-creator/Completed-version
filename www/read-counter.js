// ✅ 全体合計優先版カウンター（読み取り最適化版 - リスナー維持）

class TotalFocusedReadCounter {
    constructor() {
        this.storageKey = 'firestore_read_count';
        this.dateKey = 'firestore_read_date';
        this.sharedTotalKey = 'firestore_shared_total'; // 全端末共有の合計
        this.sharedTotalTimestampKey = 'firestore_shared_total_timestamp';
        this.deviceIdKey = 'firestore_device_id';
        this.dailyLimit = 50000;
        this.unsubscribe = null;
        this.isListenerActive = false;
        this.lastSnapshotTime = 0;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        
        this.initCounter();
        this.initDeviceId();
        this.wrapFirestoreOperations();
        this.setupRealtimeSync(); // ⭐ リアルタイム同期
        this.setupVisibilityListener(); // ⭐ ページ表示状態の監視
        this.setupPeriodicCheck(); // ⭐ 定期的な状態チェック（読み取りなし）
    }
    
    // ⭐ ページの表示状態を監視（スリープ復帰検出）
    setupVisibilityListener() {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                console.log('📱 Page became visible - checking connection...');
                this.handleWakeup();
            }
        });
        
        // ページフォーカスイベントも追加
        window.addEventListener('focus', () => {
            console.log('📱 Window focused - checking connection...');
            this.handleWakeup();
        });
    }
    
    // ⭐ スリープ復帰時の処理（リスナーは維持、状態のみチェック）
    async handleWakeup() {
        const now = Date.now();
        const timeSinceLastSnapshot = now - this.lastSnapshotTime;
        
        // リスナーからのデータ受信が2分以上ない場合のみ対処
        if (timeSinceLastSnapshot > 120000) {
            console.log(`⚠️ No snapshot for ${Math.round(timeSinceLastSnapshot/1000)}s`);
            
            // まずはリスナーが生きているか確認
            if (!this.isListenerActive || !this.unsubscribe) {
                console.log('🔄 Listener appears dead, reconnecting...');
                await this.reconnectListener();
            } else {
                // リスナーは生きているが反応がない場合は、手動で1回だけ取得
                console.log('📊 Fetching latest count (listener still active)...');
                await this.fetchTotalCountOnce();
            }
        } else {
            console.log(`✅ Listener healthy (last snapshot: ${Math.round(timeSinceLastSnapshot/1000)}s ago)`);
        }
    }
    
    // ⭐ リスナーを再接続（最終手段のみ）
    async reconnectListener() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('❌ Max reconnect attempts reached');
            return;
        }
        
        this.reconnectAttempts++;
        
        // 既存のリスナーをクリーンアップ
        if (this.unsubscribe) {
            try {
                this.unsubscribe();
            } catch (e) {
                console.log('Unsubscribe error (expected):', e);
            }
            this.unsubscribe = null;
        }
        
        this.isListenerActive = false;
        
        // 少し待ってから再接続
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        await this.startRealtimeListener();
    }
    
    // ⭐ 定期的な状態チェック（読み取りなし、タイマーのみ）
    setupPeriodicCheck() {
        setInterval(() => {
            const now = Date.now();
            const timeSinceLastSnapshot = now - this.lastSnapshotTime;
            
            // 5分以上スナップショットがない場合、リスナーが死んでいる可能性
            if (this.isListenerActive && timeSinceLastSnapshot > 300000) {
                console.log('⚠️ Listener appears stalled, will check on next wakeup');
                this.isListenerActive = false;
            }
        }, 60000); // 60秒ごとにチェック（読み取りなし）
    }
    
    // ⭐ 即座に全体カウントを1回だけ取得（緊急用・手動用）
    async fetchTotalCountOnce() {
        if (!window.db) return;
        
        try {
            const today = this.getToday();
            
            console.log('🔍 Fetching total count once...');
            
            // 直接クエリを実行（読み取り消費）
            const snapshot = await db.collection('readAnalytics')
                .where('date', '==', today)
                .get();
            
            let total = 0;
            const deviceCount = snapshot.size;
            
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                total += data.count || 0;
            });
            
            // 全体合計を更新
            localStorage.setItem(this.sharedTotalKey, String(total));
            localStorage.setItem(this.sharedTotalTimestampKey, String(Date.now()));
            
            console.log(`✅ Total fetched: ${total} reads from ${deviceCount} devices`);
            
            this.updateDisplay();
            
        } catch (error) {
            console.error('❌ Fetch total count failed:', error);
        }
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
            const wrappedCallback = (snapshot) => {
                if (window.readCounter && snapshot.docs) {
                    window.readCounter.increment(snapshot.docs.length);
                }
                
                if (typeof optionsOrObserverOrOnNext === 'function') {
                    optionsOrObserverOrOnNext(snapshot);
                } else if (optionsOrObserverOrOnNext && optionsOrObserverOrOnNext.next) {
                    optionsOrObserverOrOnNext.next(snapshot);
                }
            };
            
            return originalOnSnapshot.call(this, wrappedCallback, observerOrOnNextOrOnError, onError);
        };
        
        console.log('✅ Firestore operations wrapped (read-optimized version)');
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
        
        // 既にアクティブな場合はスキップ
        if (this.isListenerActive && this.unsubscribe) {
            console.log('Listener already active, skipping...');
            return;
        }
        
        const today = this.getToday();
        
        console.log('🔄 Starting realtime sync for total count...');
        
        try {
            // ⭐ onSnapshotでリアルタイム監視（初回のみ読み取り消費、以降は差分のみ）
            this.unsubscribe = db.collection('readAnalytics')
                .where('date', '==', today)
                .onSnapshot(
                    (snapshot) => {
                        // スナップショット受信時刻を記録
                        this.lastSnapshotTime = Date.now();
                        
                        let total = 0;
                        const deviceCount = snapshot.size;
                        
                        snapshot.docs.forEach(doc => {
                            const data = doc.data();
                            total += data.count || 0;
                        });
                        
                        // ⭐ 全体合計を更新
                        localStorage.setItem(this.sharedTotalKey, String(total));
                        localStorage.setItem(this.sharedTotalTimestampKey, String(Date.now()));
                        
                        const changeType = snapshot.docChanges().length > 0 ? 'with changes' : 'no changes';
                        console.log(`📊 Total updated: ${total} reads from ${deviceCount} devices (${changeType})`);
                        
                        this.updateDisplay();
                        this.isListenerActive = true;
                        this.reconnectAttempts = 0; // 成功したらリセット
                    },
                    (error) => {
                        console.error('Realtime sync error:', error);
                        this.isListenerActive = false;
                        
                        // エラーが発生したら再接続を試みる（5秒後）
                        setTimeout(() => {
                            if (!this.isListenerActive) {
                                this.reconnectListener();
                            }
                        }, 5000);
                    }
                );
                
            console.log('✅ Realtime listener started');
            
        } catch (error) {
            console.error('Failed to start listener:', error);
            this.isListenerActive = false;
        }
    }
    
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
            const statusIcon = this.isListenerActive ? '🔴' : '⚪';
            counterElement.innerHTML = 
                `${statusIcon} 全体: <strong>${totalCount.toLocaleString()}</strong>回 (${percentage}%) ` +
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
        this.isListenerActive = false;
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

// ⭐ 管理画面で手動リフレッシュ（読み取り1回消費）
function refreshTotalCount() {
    if (window.readCounter) {
        window.readCounter.fetchTotalCountOnce();
    }
}

console.log('✅ Total-Focused Read Counter loaded (Read-Optimized)');
console.log('📊 Realtime sync with listener preservation (differential updates only)');
console.log('🔴 = Connected | ⚪ = Disconnected');

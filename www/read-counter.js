// Firestore読み取りカウンター機能

// カウンター管理クラス
class FirestoreReadCounter {
    constructor() {
        this.storageKey = 'firestore_read_count';
        this.dateKey = 'firestore_read_date';
        this.deviceIdKey = 'firestore_device_id';
        this.totalCountKey = 'firestore_total_count';
        this.totalCountTimestampKey = 'firestore_total_timestamp';
        this.dailyLimit = 50000;
        this.warningThreshold = 40000; // 80%
        this.dangerThreshold = 48000;  // 96%
        this.syncInterval = 5 * 60 * 1000; // 5分
        
        this.initCounter();
        this.initDeviceId();
        this.startAutoSync();
        this.updateDisplay();
    }
    
    // カウンター初期化
    initCounter() {
        const today = this.getToday();
        const savedDate = localStorage.getItem(this.dateKey);
        
        // 日付が変わっていたらリセット
        if (savedDate !== today) {
            localStorage.setItem(this.storageKey, '0');
            localStorage.setItem(this.dateKey, today);
            localStorage.setItem(this.totalCountKey, '0');
            localStorage.setItem(this.totalCountTimestampKey, '0');
        }
    }
    
    // 端末IDを初期化
    initDeviceId() {
        let deviceId = localStorage.getItem(this.deviceIdKey);
        if (!deviceId) {
            deviceId = this.generateDeviceId();
            localStorage.setItem(this.deviceIdKey, deviceId);
        }
        this.deviceId = deviceId;
    }
    
    // ユニークな端末IDを生成
    generateDeviceId() {
        return 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    // 今日の日付を取得（YYYY-MM-DD形式）
    getToday() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }
    
    // 読み取り回数を取得
    getCount() {
        return parseInt(localStorage.getItem(this.storageKey) || '0', 10);
    }
    
    // 合計読み取り回数を取得
    getTotalCount() {
        return parseInt(localStorage.getItem(this.totalCountKey) || '0', 10);
    }
    
    // 合計取得時刻を取得
    getTotalTimestamp() {
        return parseInt(localStorage.getItem(this.totalCountTimestampKey) || '0', 10);
    }
    
    // 読み取り回数をインクリメント
    increment(count = 1) {
        const currentCount = this.getCount();
        const newCount = currentCount + count;
        localStorage.setItem(this.storageKey, String(newCount));
        this.updateDisplay();
        return newCount;
    }
    
    // 自動同期を開始
    startAutoSync() {
        // 初回送信
        this.syncToFirestore();
        
        // 5分ごとに自動送信
        setInterval(() => {
            this.syncToFirestore();
        }, this.syncInterval);
    }
    
    // Firestoreに送信
    async syncToFirestore() {
        if (!window.db) return;
        
        try {
            const count = this.getCount();
            const today = this.getToday();
            
            await db.collection('readAnalytics').doc(`${today}_${this.deviceId}`).set({
                deviceId: this.deviceId,
                count: count,
                date: today,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            console.log(`Auto sync: ${count} reads sent to Firestore`);
        } catch (error) {
            console.error('Failed to sync to Firestore:', error);
        }
    }
    
    // 全端末の合計を取得
    async fetchTotalCount() {
        if (!window.db) return;
        
        try {
            const today = this.getToday();
            const snapshot = await db.collection('readAnalytics')
                .where('date', '==', today)
                .get();
            
            let total = 0;
            snapshot.docs.forEach(doc => {
                total += doc.data().count || 0;
            });
            
            localStorage.setItem(this.totalCountKey, String(total));
            localStorage.setItem(this.totalCountTimestampKey, String(Date.now()));
            
            this.updateDisplay();
            
            console.log(`Total count fetched: ${total} reads from ${snapshot.size} devices`);
            return total;
        } catch (error) {
            console.error('Failed to fetch total count:', error);
            return null;
        }
    }
    
    // 表示を更新
    updateDisplay() {
        const count = this.getCount();
        const totalCount = this.getTotalCount();
        const totalTimestamp = this.getTotalTimestamp();
        const remaining = Math.max(0, this.dailyLimit - count);
        
        // ヘッダーの表示を更新
        const counterElement = document.getElementById('readCounter');
        if (counterElement) {
            const lastUpdated = totalTimestamp > 0 ? new Date(totalTimestamp).toLocaleTimeString('ja-JP', {hour: '2-digit', minute: '2-digit'}) : '未取得';
            counterElement.innerHTML = `📊 ${count.toLocaleString()}回 (端末) | 全体: ${totalCount.toLocaleString()}回 <span class="refresh-btn" onclick="refreshTotalCount()" title="全体の最新値を取得 (最終: ${lastUpdated})">🔄</span>`;
            
            // 警告レベルに応じて色を変更
            counterElement.classList.remove('warning', 'danger');
            if (count >= this.dangerThreshold) {
                counterElement.classList.add('danger');
            } else if (count >= this.warningThreshold) {
                counterElement.classList.add('warning');
            }
        }
        
        // 管理画面の表示を更新
        const managementCountElement = document.getElementById('managementReadCount');
        if (managementCountElement) {
            managementCountElement.textContent = `${count.toLocaleString()}回 (この端末)`;
        }
        
        const managementTotalElement = document.getElementById('managementTotalCount');
        if (managementTotalElement) {
            managementTotalElement.textContent = `${totalCount.toLocaleString()}回`;
        }
        
        const managementRemainingElement = document.getElementById('managementRemaining');
        if (managementRemainingElement) {
            const percentage = ((totalCount / this.dailyLimit) * 100).toFixed(1);
            managementRemainingElement.textContent = `残り: ${Math.max(0, this.dailyLimit - totalCount).toLocaleString()}回 (使用率: ${percentage}%)`;
            
            // 色を変更
            if (totalCount >= this.dangerThreshold) {
                managementRemainingElement.style.color = '#f44336';
            } else if (totalCount >= this.warningThreshold) {
                managementRemainingElement.style.color = '#ff9800';
            } else {
                managementRemainingElement.style.color = '#4caf50';
            }
        }
    }
    
    // リセット（テスト用）
    reset() {
        localStorage.setItem(this.storageKey, '0');
        localStorage.setItem(this.totalCountKey, '0');
        this.updateDisplay();
    }
}

// グローバルインスタンス
let readCounter;

// 初期化
function initReadCounter() {
    readCounter = new FirestoreReadCounter();
    window.readCounter = readCounter;  // ⭐ グローバルに公開
}

// Firebase Consoleを開く
function openFirebaseConsole() {
    // Firebase Console の使用状況ページを開く
    // プロジェクトIDは実際のものに置き換えてください
    const projectId = firebase.app().options.projectId;
    const url = `https://console.firebase.google.com/project/${projectId}/firestore/usage`;
    window.open(url, '_blank');
}

// 全体の読み取り回数を更新
async function refreshTotalCount() {
    if (!window.readCounter) return;
    
    const btn = event.target;
    btn.style.opacity = '0.5';
    btn.style.pointerEvents = 'none';
    
    await window.readCounter.fetchTotalCount();
    
    btn.style.opacity = '1';
    btn.style.pointerEvents = 'auto';
}

// Firestoreの読み取りをラップする関数
function wrapFirestoreReads() {
    if (!firebase.firestore) return;
    
    const db = firebase.firestore();
    
    // get()をラップ
    const originalGet = db.collection('').constructor.prototype.get;
    db.collection('').constructor.prototype.get = async function(...args) {
        const result = await originalGet.apply(this, args);
        if (readCounter && result && result.docs) {
            readCounter.increment(result.docs.length || 1);
        }
        return result;
    };
    
    // onSnapshot()をラップ
    const originalOnSnapshot = db.collection('').constructor.prototype.onSnapshot;
    db.collection('').constructor.prototype.onSnapshot = function(...args) {
        const unsubscribe = originalOnSnapshot.apply(this, args);
        
        // 最初のスナップショットでカウント
        const originalCallback = args[0];
        if (typeof originalCallback === 'function') {
            args[0] = function(snapshot) {
                if (readCounter && snapshot && snapshot.docs) {
                    readCounter.increment(snapshot.docs.length || 1);
                }
                return originalCallback.apply(this, arguments);
            };
        }
        
        return unsubscribe;
    };
}

// すぐに初期化（スクリプトロード時）
initReadCounter();

// ページロード完了時にも再確認
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (!window.readCounter) initReadCounter();
    });
} else {
    if (!window.readCounter) initReadCounter();
}

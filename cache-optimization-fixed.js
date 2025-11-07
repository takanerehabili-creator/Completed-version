// ===== キャッシュ実装の統合ファイル（修正版） =====
// 修正内容: onSnapshotの5秒遅延を削除し、即座にリアルタイム同期を開始

// ===== IndexedDBキャッシュ機能 =====

/**
 * IndexedDBを使った永続キャッシュ機能
 * 
 * 目的:
 * - 祝日、スタッフなどの静的データをキャッシュ
 * - アプリ起動時の読み取り回数を大幅削減
 * - 起動速度の向上
 */

// IndexedDBの初期化
FirebaseScheduleManager.prototype.initIndexedDB = async function() {
    if (this.indexedDB) return; // 既に初期化済み
    
    return new Promise((resolve, reject) => {
        console.log('📦 Initializing IndexedDB...');
        
        const request = indexedDB.open('ScheduleAppCache', 1);
        
        request.onerror = () => {
            console.error('❌ IndexedDB initialization failed:', request.error);
            reject(request.error);
        };
        
        request.onsuccess = () => {
            this.indexedDB = request.result;
            console.log('✅ IndexedDB initialized');
            resolve();
        };
        
        request.onupgradeneeded = (event) => {
            console.log('🔧 Creating IndexedDB object store...');
            const db = event.target.result;
            
            if (!db.objectStoreNames.contains('cache')) {
                db.createObjectStore('cache');
                console.log('✅ Object store "cache" created');
            }
        };
    });
};

// キャッシュデータを取得
FirebaseScheduleManager.prototype.getCachedData = async function(key) {
    try {
        if (!this.indexedDB) await this.initIndexedDB();
        
        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['cache'], 'readonly');
            const store = transaction.objectStore('cache');
            const request = store.get(key);
            
            request.onsuccess = () => {
                const result = request.result;
                if (result) {
                    const age = Date.now() - result.timestamp;
                    const ageMinutes = Math.round(age / 1000 / 60);
                    console.log(`📦 Cache hit for "${key}" (age: ${ageMinutes} minutes)`);
                } else {
                    console.log(`📦 Cache miss for "${key}"`);
                }
                resolve(result);
            };
            
            request.onerror = () => {
                console.error('❌ Failed to get cache:', request.error);
                reject(request.error);
            };
        });
    } catch (error) {
        console.error('getCachedData error:', error);
        return null;
    }
};

// キャッシュデータを保存
FirebaseScheduleManager.prototype.setCachedData = async function(key, value) {
    try {
        if (!this.indexedDB) await this.initIndexedDB();
        
        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['cache'], 'readwrite');
            const store = transaction.objectStore('cache');
            const request = store.put(value, key);
            
            request.onsuccess = () => {
                console.log(`💾 Cache saved for "${key}"`);
                resolve();
            };
            
            request.onerror = () => {
                console.error('❌ Failed to save cache:', request.error);
                reject(request.error);
            };
        });
    } catch (error) {
        console.error('setCachedData error:', error);
    }
};

// 特定のキャッシュをクリア
FirebaseScheduleManager.prototype.clearCacheKey = async function(key) {
    try {
        if (!this.indexedDB) await this.initIndexedDB();
        
        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['cache'], 'readwrite');
            const store = transaction.objectStore('cache');
            const request = store.delete(key);
            
            request.onsuccess = () => {
                console.log(`🗑️ Cache cleared for "${key}"`);
                resolve();
            };
            
            request.onerror = () => {
                console.error('❌ Failed to clear cache:', request.error);
                reject(request.error);
            };
        });
    } catch (error) {
        console.error('clearCacheKey error:', error);
    }
};

// 全キャッシュをクリア
FirebaseScheduleManager.prototype.clearAllCache = async function() {
    try {
        if (!this.indexedDB) await this.initIndexedDB();
        
        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['cache'], 'readwrite');
            const store = transaction.objectStore('cache');
            const request = store.clear();
            
            request.onsuccess = () => {
                console.log('🗑️ All cache cleared');
                this.showNotification('キャッシュをクリアしました', 'success');
                resolve();
            };
            
            request.onerror = () => {
                console.error('❌ Failed to clear all cache:', request.error);
                reject(request.error);
            };
        });
    } catch (error) {
        console.error('clearAllCache error:', error);
    }
};

// キャッシュが有効かチェック
FirebaseScheduleManager.prototype.isCacheValid = function(cached, maxAgeMs) {
    if (!cached || !cached.timestamp) return false;
    
    const age = Date.now() - cached.timestamp;
    return age < maxAgeMs;
};

console.log('✅ IndexedDB cache functions loaded');

// ===== 祝日読み込み（キャッシュ対応版 - 即座にonSnapshot起動） =====

FirebaseScheduleManager.prototype.loadHolidays = async function() {
    try {
        console.log('📅 Loading holidays...');
        
        // ⭐ ステップ1: キャッシュから読み込み（即座に表示）
        const cached = await this.getCachedData('holidays');
        const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 1週間
        
        if (cached && this.isCacheValid(cached, CACHE_DURATION)) {
            console.log('✅ Using cached holidays (instant display)');
            this.holidays = cached.data;
            
            // 画面が準備できていれば即座に表示
            if (this.tableReadyForDisplay) {
                this.renderTable();
            }
        }
        
        // ⭐ ステップ2: onSnapshotを即座に起動（遅延なし）
        console.log('🔄 Starting holidays onSnapshot (immediate)...');
        
        db.collection('holidays').onSnapshot(
            snapshot => {
                console.log('📅 Holidays updated via onSnapshot');
                
                this.holidays = [];
                snapshot.forEach(doc => {
                    this.holidays.push({
                        id: doc.id,
                        ...doc.data()
                    });
                });
                
                // キャッシュを更新
                this.setCachedData('holidays', {
                    data: this.holidays,
                    timestamp: Date.now()
                });
                
                // 画面を更新
                if (this.tableReadyForDisplay) {
                    this.renderTable();
                }
            },
            error => {
                console.error('Holidays listener error:', error);
            }
        );
        
    } catch (error) {
        console.error('Load holidays error:', error);
        throw error;
    }
};

console.log('✅ Cached holidays loader loaded (immediate sync)');

// ===== スタッフ、デイスケジュール、有給、入れ替えのキャッシュ対応（即座にonSnapshot起動） =====

// スタッフ読み込み（キャッシュ対応版 - 即座にonSnapshot起動）
FirebaseScheduleManager.prototype.loadTeamMembers = async function() {
    try {
        console.log('👥 Loading team members...');
        
        // ⭐ キャッシュから読み込み（有効期間: 1日）
        const cached = await this.getCachedData('teamMembers');
        const CACHE_DURATION = 24 * 60 * 60 * 1000; // 1日
        
        if (cached && this.isCacheValid(cached, CACHE_DURATION)) {
            console.log('✅ Using cached team members');
            this.teamMembers = cached.data;
            
            if (this.tableReadyForDisplay) {
                this.renderTable();
            }
        }
        
        // ⭐ onSnapshotを即座に起動（遅延なし）
        console.log('🔄 Starting team members onSnapshot (immediate)...');
        
        db.collection('teamMembers').onSnapshot(
            snapshot => {
                console.log('👥 Team members updated via onSnapshot');
                
                this.teamMembers = [];
                snapshot.forEach(doc => {
                    this.teamMembers.push({
                        id: doc.id,
                        ...doc.data()
                    });
                });
                
                this.setCachedData('teamMembers', {
                    data: this.teamMembers,
                    timestamp: Date.now()
                });
                
                if (this.tableReadyForDisplay) {
                    this.renderTable();
                }
            },
            error => {
                console.error('Team members listener error:', error);
            }
        );
        
    } catch (error) {
        console.error('Load team members error:', error);
        throw error;
    }
};

// デイスケジュール読み込み（キャッシュ対応版 - 即座にonSnapshot起動）
FirebaseScheduleManager.prototype.loadDaySchedules = async function() {
    try {
        console.log('📋 Loading day schedules...');
        
        const cached = await this.getCachedData('daySchedules');
        const CACHE_DURATION = 24 * 60 * 60 * 1000; // 1日
        
        if (cached && this.isCacheValid(cached, CACHE_DURATION)) {
            console.log('✅ Using cached day schedules');
            this.daySchedules = cached.data;
            
            if (this.tableReadyForDisplay) {
                this.renderTable();
            }
        }
        
        // ⭐ onSnapshotを即座に起動（遅延なし）
        console.log('🔄 Starting day schedules onSnapshot (immediate)...');
        
        db.collection('daySchedules').onSnapshot(
            snapshot => {
                console.log('📋 Day schedules updated via onSnapshot');
                
                this.daySchedules = [];
                snapshot.forEach(doc => {
                    this.daySchedules.push({
                        id: doc.id,
                        ...doc.data()
                    });
                });
                
                this.setCachedData('daySchedules', {
                    data: this.daySchedules,
                    timestamp: Date.now()
                });
                
                if (this.tableReadyForDisplay) {
                    this.renderTable();
                }
            },
            error => {
                console.error('Day schedules listener error:', error);
            }
        );
        
    } catch (error) {
        console.error('Load day schedules error:', error);
        throw error;
    }
};

// 有給・公休日読み込み（キャッシュ対応版 - 即座にonSnapshot起動）
FirebaseScheduleManager.prototype.loadStaffLeaves = async function() {
    try {
        console.log('🌴 Loading staff leaves...');
        
        const cached = await this.getCachedData('staffLeaves');
        const CACHE_DURATION = 24 * 60 * 60 * 1000; // 1日
        
        if (cached && this.isCacheValid(cached, CACHE_DURATION)) {
            console.log('✅ Using cached staff leaves');
            this.staffLeaves = cached.data;
            
            if (this.tableReadyForDisplay) {
                this.renderTable();
            }
        }
        
        // ⭐ onSnapshotを即座に起動（遅延なし）
        console.log('🔄 Starting staff leaves onSnapshot (immediate)...');
        
        db.collection('staffLeaves').onSnapshot(
            snapshot => {
                console.log('🌴 Staff leaves updated via onSnapshot');
                
                this.staffLeaves = [];
                snapshot.forEach(doc => {
                    this.staffLeaves.push({
                        id: doc.id,
                        ...doc.data()
                    });
                });
                
                this.setCachedData('staffLeaves', {
                    data: this.staffLeaves,
                    timestamp: Date.now()
                });
                
                if (this.tableReadyForDisplay) {
                    this.renderTable();
                }
            },
            error => {
                console.error('Staff leaves listener error:', error);
            }
        );
        
    } catch (error) {
        console.error('Load staff leaves error:', error);
        throw error;
    }
};

// スタッフ入れ替え読み込み（キャッシュ対応版 - 即座にonSnapshot起動）
FirebaseScheduleManager.prototype.loadStaffOverrides = async function() {
    try {
        console.log('🔄 Loading staff overrides...');
        
        const cached = await this.getCachedData('staffOverrides');
        const CACHE_DURATION = 24 * 60 * 60 * 1000; // 1日
        
        if (cached && this.isCacheValid(cached, CACHE_DURATION)) {
            console.log('✅ Using cached staff overrides');
            this.staffOverrides = cached.data;
            
            if (this.tableReadyForDisplay) {
                this.renderTable();
            }
        }
        
        // ⭐ onSnapshotを即座に起動（遅延なし）
        console.log('🔄 Starting staff overrides onSnapshot (immediate)...');
        
        db.collection('staffOverrides').onSnapshot(
            snapshot => {
                console.log('🔄 Staff overrides updated via onSnapshot');
                
                this.staffOverrides = [];
                snapshot.forEach(doc => {
                    this.staffOverrides.push({
                        id: doc.id,
                        ...doc.data()
                    });
                });
                
                this.setCachedData('staffOverrides', {
                    data: this.staffOverrides,
                    timestamp: Date.now()
                });
                
                if (this.tableReadyForDisplay) {
                    this.renderTable();
                }
            },
            error => {
                console.error('Staff overrides listener error:', error);
            }
        );
        
    } catch (error) {
        console.error('Load staff overrides error:', error);
        throw error;
    }
};

console.log('✅ All cached data loaders with immediate sync loaded');

// ===== 週単位のイベント読み込み（最適化版） =====

// 週範囲の計算
FirebaseScheduleManager.prototype.getWeekRange = function(weekStart) {
    const start = new Date(weekStart);
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    
    return {
        startDate: this.formatDate(start),
        endDate: this.formatDate(end)
    };
};

// 週キーの生成
FirebaseScheduleManager.prototype.getWeekKey = function(weekStart) {
    return this.formatDate(weekStart);
};

// 現在の週の変更を検知
FirebaseScheduleManager.prototype.startWeekListener = function(weekStart) {
    const weekKey = this.getWeekKey(weekStart);
    
    // 既にリスナーが登録されていればスキップ
    if (this.weekListeners.has(weekKey)) {
        console.log(`✅ Week listener already active for ${weekKey}`);
        return;
    }
    
    const range = this.getWeekRange(weekStart);
    console.log(`🔄 Starting listener for week: ${weekKey} (${range.startDate} - ${range.endDate})`);
    
    // onSnapshotでリアルタイム監視
    const unsubscribe = db.collection('events')
        .where('date', '>=', range.startDate)
        .where('date', '<=', range.endDate)
        .onSnapshot(
            snapshot => {
                console.log(`📊 Week ${weekKey} updated: ${snapshot.size} events`);
                
                const weekEvents = [];
                snapshot.forEach(doc => {
                    weekEvents.push({
                        id: doc.id,
                        ...doc.data()
                    });
                });
                
                // キャッシュを更新
                this.weekCache.set(weekKey, weekEvents);
                
                // 表示中の週の場合は画面を更新
                if (this.currentWeekKey === weekKey) {
                    this.events = weekEvents;
                    
                    if (this.tableReadyForDisplay) {
                        this.renderTable();
                    }
                }
            },
            error => {
                console.error(`Week ${weekKey} listener error:`, error);
            }
        );
    
    // unsubscribe関数を保存
    this.weekListeners.set(weekKey, unsubscribe);
};

// 不要な週のリスナーをクリーンアップ
FirebaseScheduleManager.prototype.cleanupOldListeners = function() {
    const currentWeek = this.currentWeekKey;
    const keepWeeks = new Set([currentWeek]);
    
    // 前後1週のキーも保持
    const currentDate = new Date(currentWeek);
    const prevWeek = new Date(currentDate);
    prevWeek.setDate(prevWeek.getDate() - 7);
    const nextWeek = new Date(currentDate);
    nextWeek.setDate(nextWeek.getDate() + 7);
    
    keepWeeks.add(this.getWeekKey(prevWeek));
    keepWeeks.add(this.getWeekKey(nextWeek));
    
    // 不要なリスナーを削除
    for (const [weekKey, unsubscribe] of this.weekListeners.entries()) {
        if (!keepWeeks.has(weekKey)) {
            console.log(`🗑️ Cleaning up listener for week: ${weekKey}`);
            unsubscribe();
            this.weekListeners.delete(weekKey);
        }
    }
};

// 週の変更時に呼び出す
FirebaseScheduleManager.prototype.changeWeekOptimized = async function(direction) {
    // 週を変更
    this.currentWeekStart.setDate(this.currentWeekStart.getDate() + (direction * 7));
    this.currentWeekKey = this.getWeekKey(this.currentWeekStart);
    
    // 新しい週のリスナーを起動
    this.startWeekListener(this.currentWeekStart);
    
    // キャッシュから即座にデータを取得
    const weekEvents = this.weekCache.get(this.currentWeekKey);
    if (weekEvents) {
        console.log(`✅ Using cached data for week ${this.currentWeekKey}`);
        this.events = weekEvents;
    } else {
        console.log(`⏳ Waiting for week ${this.currentWeekKey} data...`);
        this.events = [];
    }
    
    // 画面を更新
    this.renderTable();
    
    // 古いリスナーをクリーンアップ
    this.cleanupOldListeners();
};

console.log('✅ Optimized week-based event loading with immediate sync loaded');

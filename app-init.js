// Capacitor初期化とアプリ起動
// このファイルは最後に読み込まれるため、すべてのクラスと関数が利用可能

// ⚠️ 重要: すべてのスクリプトが完全に読み込まれるまで待つ
window.addEventListener('load', async () => {
    console.log('Window loaded - All scripts ready');
    
    // クラスとすべてのメソッドが利用可能になるまで待つ
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // すべてのメソッドが読み込まれるまで待機
    let retries = 0;
    while (retries < 20) {
        if (typeof FirebaseScheduleManager !== 'undefined') {
            // prototypeメソッドの確認
            const hasEditEvent = typeof FirebaseScheduleManager.prototype.editEvent === 'function';
            const hasSaveEvent = typeof FirebaseScheduleManager.prototype.saveEvent === 'function';
            const hasOpenModal = typeof FirebaseScheduleManager.prototype.openModal === 'function';
            
            console.log('Method check:', {
                editEvent: hasEditEvent,
                saveEvent: hasSaveEvent,
                openModal: hasOpenModal
            });
            
            if (hasEditEvent && hasSaveEvent && hasOpenModal) {
                console.log('✅ All required methods loaded on prototype');
                break;
            }
        }
        console.log('⏳ Waiting for methods to load... (retry ' + retries + ')');
        await new Promise(resolve => setTimeout(resolve, 150));
        retries++;
    }
    
    if (retries >= 20) {
        console.error('❌ Failed to load all methods after 20 retries');
        console.error('Available methods:', Object.getOwnPropertyNames(FirebaseScheduleManager.prototype));
    }
    
    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
        isCapacitorApp = true;
        console.log('Running in Capacitor webview environment');
        
        try {
            if (window.Capacitor.Plugins) {
                CapacitorApp = window.Capacitor.Plugins.App;
                StatusBar = window.Capacitor.Plugins.StatusBar;
                SplashScreen = window.Capacitor.Plugins.SplashScreen;
                Network = window.Capacitor.Plugins.Network;
                Keyboard = window.Capacitor.Plugins.Keyboard;
                Haptics = window.Capacitor.Plugins.Haptics;
                Toast = window.Capacitor.Plugins.Toast;
                Dialog = window.Capacitor.Plugins.Dialog;
            }
            
            if (StatusBar) {
                await StatusBar.setBackgroundColor({ color: '#4285f4' });
                await StatusBar.setStyle({ style: 'dark' });
            }
            
            if (SplashScreen) {
                await SplashScreen.hide();
            }
            
            if (CapacitorApp) {
                CapacitorApp.addListener('appStateChange', handleAppStateChange);
                CapacitorApp.addListener('backButton', handleBackButton);
            }
            
            if (Network) {
                Network.addListener('networkStatusChange', handleNetworkChange);
            }
            
            if (Keyboard) {
                Keyboard.addListener('keyboardWillShow', handleKeyboardShow);
                Keyboard.addListener('keyboardWillHide', handleKeyboardHide);
            }
            
        } catch (error) {
            console.error('Capacitor plugins initialization error:', error);
        }
    }
    
    // クラスの存在を確認してからインスタンス化
    if (typeof FirebaseScheduleManager !== 'undefined') {
        console.log('✅ FirebaseScheduleManager class found, creating instance...');
        app = new FirebaseScheduleManager();
        console.log('✅ App instance created successfully');
        
        // ⭐ グローバル関数を即座に登録（HTMLのonclick用）
        console.log('Registering global functions...');
        
        window.changeWeek = async (dir) => {
            if (!app) return;
            try {
                showLoading(`${dir > 0 ? '次' : '前'}の週を読み込み中...`);
                await app.changeWeekOptimized(dir);
                hideLoading();
            } catch (error) {
                console.error('Week change error:', error);
                app.showNotification('週の移動に失敗しました', 'error');
                hideLoading();
            }
        };

        window.goToToday = () => { if (app && app.goToToday) app.goToToday(); };
        window.openCalendarModal = () => { if (app && app.openCalendarModal) app.openCalendarModal(); };
        window.closeCalendarModal = () => { if (app && app.closeCalendarModal) app.closeCalendarModal(); };
        window.changeCalendarMonth = dir => { if (app && app.changeCalendarMonth) app.changeCalendarMonth(dir); };
        window.selectCalendarDate = dateString => { if (app && app.selectCalendarDate) app.selectCalendarDate(dateString); };
        window.closeEvent = () => { if (app && app.closeModal) app.closeModal(); };
        window.saveEvent = () => { if (app && app.saveEvent) app.saveEvent(); };
        window.deleteEvent = () => { if (app && app.deleteEvent) app.deleteEvent(); };
        window.deleteSingle = () => { if (app && app.deleteSingle) app.deleteSingle(); };
        window.deleteFrom = () => { if (app && app.deleteFrom) app.deleteFrom(); };
        window.exportPDF = () => { if (app && app.exportPDF) app.exportPDF(); };
        window.exportExcel = () => { if (app && app.exportExcel) app.exportExcel(); };
        window.openManagement = () => { if (app && app.openManagement) app.openManagement(); };
        window.closeManagement = () => { if (app && app.closeManagement) app.closeManagement(); };
        window.addStaff = () => { if (app && app.addStaff) app.addStaff(); };
        window.addStaffLeave = () => { if (app && app.addStaffLeave) app.addStaffLeave(); };
        window.addHoliday = () => { if (app && app.addHoliday) app.addHoliday(); };
        window.addDaySchedule = () => { if (app && app.addDaySchedule) app.addDaySchedule(); };
        
        console.log('✅ Global functions registered');
    } else {
        console.error('❌ FirebaseScheduleManager class not found!');
        console.error('Available globals:', Object.keys(window));
    }
});

// Capacitorイベントハンドラー
function handleAppStateChange(state) {
    console.log('App state changed:', state);
    
    if (state.isActive && app) {
        setTimeout(() => {
            app.handleAppResume();
        }, 500);
    }
}

function handleBackButton() {
    if (document.getElementById('eventModal').style.display === 'block') {
        closeEvent();
        return;
    }
    if (document.getElementById('calendarModal').style.display === 'block') {
        closeCalendarModal();
        return;
    }
    if (document.getElementById('managementModal').style.display === 'block') {
        closeManagement();
        return;
    }
    
    if (CapacitorApp) {
        CapacitorApp.minimizeApp();
    }
}

function handleNetworkChange(status) {
    console.log('Network status changed:', status);
    
    const offlineIndicator = document.getElementById('offlineIndicator');
    if (status.connected) {
        offlineIndicator.style.display = 'none';
        if (app) {
            app.handleNetworkReconnect();
        }
    } else {
        offlineIndicator.style.display = 'block';
        if (app) {
            app.isOnline = false;
            app.updateConnectionStatus();
        }
    }
}

function handleKeyboardShow(info) {
    document.body.style.paddingBottom = `${info.keyboardHeight}px`;
}

function handleKeyboardHide() {
    document.body.style.paddingBottom = '';
}

// ブラウザ用のネットワークリスナー
function setupBrowserNetworkListeners() {
    window.addEventListener('online', () => {
        document.getElementById('offlineIndicator').style.display = 'none';
        if (app) {
            app.handleNetworkReconnect();
        }
    });
    
    window.addEventListener('offline', () => {
        document.getElementById('offlineIndicator').style.display = 'block';
        if (app) {
            app.isOnline = false;
            app.updateConnectionStatus();
        }
    });
}

// ユーティリティ関数
function showLoading(message = 'データ読み込み中...') {
    const indicator = document.getElementById('loadingIndicator');
    if (indicator) {
        indicator.textContent = message;
        indicator.style.display = 'block';
    }
}

function hideLoading() {
    const indicator = document.getElementById('loadingIndicator');
    if (indicator) {
        indicator.style.display = 'none';
    }
}

function updateSyncStatus(status) {
    const syncElement = document.getElementById('syncStatus');
    if (!syncElement) return;
    
    syncElement.className = `sync-status ${status}`;
    
    switch(status) {
        case 'synced':
            syncElement.textContent = '同期済み';
            break;
        case 'syncing':
            syncElement.textContent = '同期中';
            break;
        case 'error':
            syncElement.textContent = '同期エラー';
            break;
    }
}

function showNotificationWebview(msg, type = 'success') {
    if (isCapacitorApp && Toast) {
        Toast.show({
            text: msg,
            duration: 'short',
            position: 'top'
        });
    }
    
    if (isCapacitorApp && Haptics) {
        if (type === 'success') {
            Haptics.impact({ style: 'light' });
        } else if (type === 'error') {
            Haptics.impact({ style: 'heavy' });
        }
    }
    
    const n = document.createElement('div');
    n.className = `notification ${type}`;
    n.textContent = msg;
    document.body.appendChild(n);
    setTimeout(() => n.classList.add('visible'), 100);
    
    // スワイプで消す機能（タッチ＋マウス対応）
    let startX = 0;
    let currentX = 0;
    let isDragging = false;
    let autoHideTimer = null;
    
    // タッチ開始
    const handleStart = (e) => {
        startX = e.touches ? e.touches[0].clientX : e.clientX;
        isDragging = true;
        n.style.transition = 'none';
        n.style.cursor = 'grabbing';
        // タッチ開始時に自動非表示タイマーをクリア
        if (autoHideTimer) {
            clearTimeout(autoHideTimer);
            autoHideTimer = null;
        }
    };
    
    // タッチ移動
    const handleMove = (e) => {
        if (!isDragging) return;
        currentX = e.touches ? e.touches[0].clientX : e.clientX;
        const deltaX = currentX - startX;
        
        // 右方向のスワイプのみ許可
        if (deltaX > 0) {
            n.style.transform = `translateX(${deltaX}px)`;
            n.style.opacity = Math.max(0.3, 1 - deltaX / 300);
        }
    };
    
    // タッチ終了
    const handleEnd = () => {
        if (!isDragging) return;
        isDragging = false;
        const deltaX = currentX - startX;
        
        n.style.transition = 'all .3s ease-out';
        n.style.cursor = 'grab';
        
        // 100px以上スワイプしたら消す
        if (deltaX > 100) {
            n.style.transform = 'translateX(400px)';
            n.style.opacity = '0';
            setTimeout(() => {
                if (document.body.contains(n)) {
                    document.body.removeChild(n);
                }
            }, 300);
        } else {
            // 元の位置に戻す
            n.style.transform = 'translateX(0)';
            n.style.opacity = '1';
            // 自動非表示タイマーを再設定
            startAutoHideTimer();
        }
        
        startX = 0;
        currentX = 0;
    };
    
    // タップ/クリックで消す機能
    const handleClick = (e) => {
        // ドラッグ中はクリックイベントを無視
        if (Math.abs(currentX - startX) > 5) return;
        
        if (autoHideTimer) {
            clearTimeout(autoHideTimer);
        }
        n.classList.remove('visible');
        setTimeout(() => {
            if (document.body.contains(n)) {
                document.body.removeChild(n);
            }
        }, 300);
    };
    
    // タッチイベント
    n.addEventListener('touchstart', handleStart, { passive: true });
    n.addEventListener('touchmove', handleMove, { passive: true });
    n.addEventListener('touchend', handleEnd);
    
    // マウスイベント
    n.addEventListener('mousedown', handleStart);
    n.addEventListener('mousemove', handleMove);
    n.addEventListener('mouseup', handleEnd);
    n.addEventListener('mouseleave', () => {
        if (isDragging) {
            handleEnd();
        }
    });
    
    n.addEventListener('click', handleClick);
    
    // カーソルスタイル
    n.style.cursor = 'grab';
    
    // 自動非表示タイマーを設定する関数
    const startAutoHideTimer = () => {
        const displayTime = type === 'error' ? 10000 : 3000;
        autoHideTimer = setTimeout(() => {
            n.classList.remove('visible');
            setTimeout(() => {
                if (document.body.contains(n)) {
                    document.body.removeChild(n);
                }
            }, 300);
        }, displayTime);
    };
    
    // 初回の自動非表示タイマーを開始
    startAutoHideTimer();
}

// グローバルエラーハンドリング
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    updateSyncStatus('error');
    if (app) {
        app.showNotification('予期しないエラーが発生しました', 'error');
    }
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    updateSyncStatus('error');
    if (app) {
        app.showNotification('処理中にエラーが発生しました', 'error');
    }
});

// メモリ最適化(Capacitor用)
if (isCapacitorApp) {
    document.addEventListener('touchstart', function() {}, {passive: true});
    document.addEventListener('touchmove', function() {}, {passive: true});
    
    window.addEventListener('pagehide', () => {
        if (app && app.weekCache) {
            const cacheKeys = Array.from(app.weekCache.keys());
            if (cacheKeys.length > 2) {
                const keysToDelete = cacheKeys.slice(0, -2);
                keysToDelete.forEach(key => {
                    if (key !== app.currentWeekKey) {
                        app.weekCache.delete(key);
                        app.loadedWeeks.delete(key);
                    }
                });
                console.log('Cleaned up cache for memory optimization');
            }
        }
    });
}

// app-init.jsのグローバル関数登録部分に以下を追加してください

// 既存のグローバル関数の後に追加
window.addStaffOverride = () => app && app.addStaffOverride();
window.deleteStaffOverride = (i) => app && app.deleteStaffOverride(i);

// 既存のopenManagement関数を拡張
const originalOpenManagement = window.openManagement;
window.openManagement = function() {
    if (originalOpenManagement) originalOpenManagement();
    if (app && app.updateStaffOverrideSelects) {
        app.updateStaffOverrideSelects();
    }
};

// スタッフセレクトボックス動的更新用スクリプト（HTMLの最後に追加）
window.addEventListener('load', function() {
    setTimeout(() => {
        const originalOpen = window.openManagement;
        window.openManagement = function() {
            if (originalOpen) originalOpen();
            updateStaffOverrideSelects();
        };
        
        function updateStaffOverrideSelects() {
            setTimeout(() => {
                if (window.app && window.app.teamMembers) {
                    const select1 = document.getElementById('overrideOriginalStaff');
                    const select2 = document.getElementById('overrideReplacementStaff');
                    if (select1 && select2) {
                        const current1 = select1.value;
                        const current2 = select2.value;
                        
                        select1.innerHTML = '<option value="">スタッフを選択</option>';
                        select2.innerHTML = '<option value="">スタッフを選択</option>';
                        
                        window.app.teamMembers.forEach(m => {
                            const name = `${m.surname || ''}${m.firstname || ''}`;
                            
                            const option1 = document.createElement('option');
                            option1.value = name;
                            option1.textContent = name;
                            select1.appendChild(option1);
                            
                            const option2 = document.createElement('option');
                            option2.value = name;
                            option2.textContent = name;
                            select2.appendChild(option2);
                        });
                        
                        select1.value = current1;
                        select2.value = current2;
                    }
                }
            }, 100);
        }
    }, 2000);
});

// デバッグ用関数
window.debugApp = () => {
    if (!app) {
        console.log('App not initialized');
        return;
    }
    
    console.log('=== App Debug Info ===');
    console.log('Current week:', app.currentWeekKey);
    console.log('Loaded weeks:', Array.from(app.loadedWeeks));
    console.log('Active week listeners:', app.weekListeners.size);
    console.log('Cache size:', app.weekCache.size);
    console.log('Current events count:', app.events.length);
    console.log('Team members:', app.teamMembers.length);
    console.log('Holidays:', app.holidays.length);
    console.log('Day schedules:', app.daySchedules.length);
    console.log('Online status:', app.isOnline);
};

// 一括メニューの表示/非表示を切り替え
let bulkMenuOpen = false;

function toggleBulkMenu() {
    // 一括予約モードまたは一括削除モードがアクティブな場合はキャンセル
    if (typeof bulkReservationMode !== 'undefined' && bulkReservationMode) {
        toggleBulkReservationMode();
        bulkMenuOpen = false;
        closeBulkMenuUI();
        return;
    }
    
    if (typeof bulkDeleteMode !== 'undefined' && bulkDeleteMode) {
        toggleBulkDeleteMode();
        bulkMenuOpen = false;
        closeBulkMenuUI();
        return;
    }
    
    // モードがアクティブでない場合は通常のトグル動作
    bulkMenuOpen = !bulkMenuOpen;
    
    const bulkMenuBtn = document.getElementById('bulkMenuBtn');
    const bulkMenuBtnMobile = document.getElementById('bulkMenuBtnMobile');
    const bulkMenuButtons = document.getElementById('bulkMenuButtons');
    const bulkMenuButtonsMobile = document.getElementById('bulkMenuButtonsMobile');
    
    if (bulkMenuOpen) {
        // メニューを開く
        if (bulkMenuBtn) {
            bulkMenuBtn.classList.add('active');
            bulkMenuBtn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
            bulkMenuBtn.style.color = 'white';
        }
        if (bulkMenuBtnMobile) {
            bulkMenuBtnMobile.classList.add('active');
            bulkMenuBtnMobile.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
            bulkMenuBtnMobile.style.color = 'white';
        }
        if (bulkMenuButtons) bulkMenuButtons.style.display = 'flex';
        if (bulkMenuButtonsMobile) bulkMenuButtonsMobile.style.display = 'flex';
    } else {
        closeBulkMenuUI();
    }
}

// 一括メニューUIを閉じる
function closeBulkMenuUI() {
    const bulkMenuBtn = document.getElementById('bulkMenuBtn');
    const bulkMenuBtnMobile = document.getElementById('bulkMenuBtnMobile');
    const bulkMenuButtons = document.getElementById('bulkMenuButtons');
    const bulkMenuButtonsMobile = document.getElementById('bulkMenuButtonsMobile');
    
    if (bulkMenuBtn) {
        bulkMenuBtn.classList.remove('active');
        bulkMenuBtn.style.background = '';
        bulkMenuBtn.style.color = '';
    }
    if (bulkMenuBtnMobile) {
        bulkMenuBtnMobile.classList.remove('active');
        bulkMenuBtnMobile.style.background = '';
        bulkMenuBtnMobile.style.color = '';
    }
    if (bulkMenuButtons) bulkMenuButtons.style.display = 'none';
    if (bulkMenuButtonsMobile) bulkMenuButtonsMobile.style.display = 'none';
}

console.log('=== Schedule Manager 完全版 (デイスケジュール対応) ===');
console.log('✅ デイスケジュール機能追加');
console.log('✅ 背景色表示対応');
console.log('Ready for production use');
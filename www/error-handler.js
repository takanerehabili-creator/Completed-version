// ===== エラーハンドリング強化機能 =====

/**
 * 機能:
 * 1. エラーの種類を自動判別
 * 2. ユーザーに分かりやすいメッセージを表示
 * 3. エラーログをlocalStorageに保存
 * 4. 自動リトライ機能
 * 5. グローバルエラーキャッチ
 */

// ===== エラー分析 =====

function analyzeError(error) {
    if (!error) {
        return {
            type: 'unknown',
            message: '不明なエラーが発生しました',
            userAction: 'ページを再読み込み',
            retryable: false
        };
    }

    // ネットワークエラー
    if (error.code === 'unavailable' || error.message?.includes('Failed to fetch') || !navigator.onLine) {
        return {
            type: 'network',
            message: 'インターネット接続が切れています。接続を確認してください。',
            userAction: '接続を確認してページを再読み込み',
            retryable: true,
            retryDelay: 5000
        };
    }
    
    // 権限エラー
    if (error.code === 'permission-denied') {
        return {
            type: 'permission',
            message: 'データへのアクセス権限がありません。',
            userAction: 'ページを再読み込み',
            retryable: false
        };
    }
    
    // クォータ超過
    if (error.code === 'resource-exhausted') {
        return {
            type: 'quota',
            message: '本日の利用上限に達しました。明日以降に再度お試しください。',
            userAction: '明日まで待つ',
            retryable: false
        };
    }
    
    // タイムアウト
    if (error.code === 'deadline-exceeded' || error.message?.includes('timeout')) {
        return {
            type: 'timeout',
            message: '処理に時間がかかっています。もう一度お試しください。',
            userAction: '再試行する',
            retryable: true,
            retryDelay: 3000
        };
    }
    
    // Firestore接続エラー
    if (error.code === 'failed-precondition') {
        return {
            type: 'firestore',
            message: 'データベース接続エラーです。ページを再読み込みしてください。',
            userAction: 'ページを再読み込み',
            retryable: true,
            retryDelay: 5000
        };
    }
    
    // その他のエラー
    return {
        type: 'unknown',
        message: 'エラーが発生しました。ページを再読み込みしてください。',
        userAction: 'ページを再読み込み',
        retryable: true,
        retryDelay: 5000
    };
}

// ===== エラーログ管理 =====

function logError(functionName, error, errorInfo) {
    try {
        const errorLog = {
            timestamp: new Date().toISOString(),
            function: functionName,
            type: errorInfo.type,
            message: error?.message || 'Unknown error',
            code: error?.code || null,
            stack: error?.stack || null,
            userAgent: navigator.userAgent,
            online: navigator.onLine,
            url: window.location.href
        };
        
        // localStorageに保存（最大100件）
        let logs = [];
        try {
            logs = JSON.parse(localStorage.getItem('errorLogs') || '[]');
        } catch (e) {
            console.warn('Failed to parse error logs, resetting:', e);
            logs = [];
        }
        
        logs.push(errorLog);
        
        // 古いログを削除（最新100件のみ保持）
        if (logs.length > 100) {
            logs = logs.slice(-100);
        }
        
        localStorage.setItem('errorLogs', JSON.stringify(logs));
        
        console.log('✅ Error logged:', errorLog);
    } catch (e) {
        console.error('Failed to log error:', e);
    }
}

// ⭐ エラーログを表示
function showErrorLogs() {
    try {
        const logs = JSON.parse(localStorage.getItem('errorLogs') || '[]');
        
        if (logs.length === 0) {
            alert('エラーログはありません');
            return;
        }
        
        // モーダルを作成
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'block';
        modal.style.zIndex = '10000';
        
        const content = document.createElement('div');
        content.className = 'modal-content';
        content.style.maxWidth = '800px';
        content.style.maxHeight = '80vh';
        content.style.overflow = 'auto';
        
        const header = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:2px solid #e0e0e0; padding-bottom:15px;">
                <h2 style="margin:0;">📋 エラーログ (${logs.length}件)</h2>
                <div>
                    <button onclick="clearErrorLogs()" style="margin-right:10px; padding:8px 15px; background:#f44336; color:white; border:none; border-radius:6px; cursor:pointer;">
                        すべてクリア
                    </button>
                    <button onclick="closeErrorLogsModal()" style="padding:8px 15px; background:#f5f5f5; border:none; border-radius:6px; cursor:pointer; font-size:18px;">
                        ✕
                    </button>
                </div>
            </div>
        `;
        
        const logHtml = logs.reverse().map((log, index) => `
            <div style="border:1px solid #ddd; padding:15px; margin-bottom:10px; border-radius:8px; background:#fafafa;">
                <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                    <strong style="color:#333;">${logs.length - index}. ${new Date(log.timestamp).toLocaleString('ja-JP')}</strong>
                    <span style="padding:2px 8px; background:${
                        log.type === 'network' ? '#ff9800' :
                        log.type === 'permission' ? '#f44336' :
                        log.type === 'timeout' ? '#ff9800' :
                        '#9e9e9e'
                    }; color:white; border-radius:4px; font-size:12px;">${log.type}</span>
                </div>
                <div style="margin-bottom:5px;"><strong>機能:</strong> ${log.function}</div>
                <div style="margin-bottom:5px;"><strong>メッセージ:</strong> ${log.message}</div>
                ${log.code ? `<div style="margin-bottom:5px;"><strong>コード:</strong> ${log.code}</div>` : ''}
                <div style="margin-bottom:5px;"><strong>オンライン:</strong> ${log.online ? '✅' : '❌'}</div>
                ${log.stack ? `
                    <details style="margin-top:10px;">
                        <summary style="cursor:pointer; color:#666;">スタックトレース</summary>
                        <pre style="font-size:11px; background:#f5f5f5; padding:10px; border-radius:4px; overflow:auto; max-height:200px;">${log.stack}</pre>
                    </details>
                ` : ''}
            </div>
        `).join('');
        
        content.innerHTML = header + logHtml;
        modal.appendChild(content);
        document.body.appendChild(modal);
        
        // モーダルのIDを設定
        modal.id = 'errorLogsModal';
        
    } catch (e) {
        console.error('Failed to show error logs:', e);
        alert('エラーログの表示に失敗しました');
    }
}

// ⭐ エラーログモーダルを閉じる
function closeErrorLogsModal() {
    const modal = document.getElementById('errorLogsModal');
    if (modal) {
        modal.remove();
    }
}

// ⭐ エラーログをクリア
function clearErrorLogs() {
    if (confirm('すべてのエラーログを削除しますか？')) {
        localStorage.removeItem('errorLogs');
        closeErrorLogsModal();
        alert('エラーログを削除しました');
    }
}

// グローバルに関数を公開
window.showErrorLogs = showErrorLogs;
window.closeErrorLogsModal = closeErrorLogsModal;
window.clearErrorLogs = clearErrorLogs;

// ===== 自動リトライ機能 =====

const retryManager = {
    counts: {},
    maxRetries: 3,
    
    canRetry(key) {
        const count = this.counts[key] || 0;
        return count < this.maxRetries;
    },
    
    incrementRetry(key) {
        this.counts[key] = (this.counts[key] || 0) + 1;
    },
    
    resetRetry(key) {
        delete this.counts[key];
    },
    
    scheduleRetry(fn, delay, key) {
        if (!this.canRetry(key)) {
            console.log(`❌ Max retry attempts (${this.maxRetries}) reached for ${key}`);
            return false;
        }
        
        this.incrementRetry(key);
        const attemptNum = this.counts[key];
        
        console.log(`🔄 Scheduling retry ${attemptNum}/${this.maxRetries} for ${key} in ${delay}ms...`);
        
        setTimeout(() => {
            console.log(`🔄 Retrying ${key} (attempt ${attemptNum})...`);
            fn();
        }, delay);
        
        return true;
    }
};

// ===== 改善版通知表示 =====

function showEnhancedNotification(message, type = 'info', options = {}) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        background: ${
            type === 'error' ? '#f44336' :
            type === 'warning' ? '#ff9800' :
            type === 'success' ? '#4caf50' :
            '#2196f3'
        };
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        z-index: 9999;
        min-width: 300px;
        max-width: 500px;
        font-size: 14px;
        line-height: 1.5;
        animation: slideIn 0.3s ease-out;
    `;
    
    let html = `<div style="display:flex; align-items:flex-start; gap:10px;">`;
    
    // アイコン
    const icon = 
        type === 'error' ? '⚠️' :
        type === 'warning' ? '⚠️' :
        type === 'success' ? '✅' :
        'ℹ️';
    
    html += `<div style="font-size:20px;">${icon}</div>`;
    html += `<div style="flex:1;">`;
    html += `<div style="margin-bottom:${options.action ? '10px' : '0'};">${message}</div>`;
    
    // アクションボタン
    if (options.action) {
        html += `
            <button onclick="${options.action.handler}; this.parentElement.parentElement.parentElement.remove();" 
                    style="padding:6px 12px; background:rgba(255,255,255,0.3); color:white; border:1px solid white; 
                           border-radius:4px; cursor:pointer; font-size:13px; margin-right:8px;">
                ${options.action.label}
            </button>
        `;
    }
    
    html += `</div>`;
    html += `<button onclick="this.parentElement.parentElement.remove()" 
                     style="background:none; border:none; color:white; font-size:20px; cursor:pointer; padding:0; line-height:1;">
                ✕
             </button>`;
    html += `</div>`;
    
    notification.innerHTML = html;
    document.body.appendChild(notification);
    
    // 自動削除（アクションがある場合は長めに表示）
    const duration = options.duration || (options.action ? 10000 : 5000);
    setTimeout(() => {
        if (notification.parentElement) {
            notification.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }
    }, duration);
}

// CSSアニメーションを追加
if (!document.getElementById('error-handler-styles')) {
    const style = document.createElement('style');
    style.id = 'error-handler-styles';
    style.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(400px);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        @keyframes slideOut {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(400px);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);
}

// ===== グローバルエラーハンドラ =====

// Promiseのエラーをキャッチ
window.addEventListener('unhandledrejection', (event) => {
    console.error('❌ Unhandled promise rejection:', event.reason);
    
    const errorInfo = analyzeError(event.reason);
    logError('unhandledRejection', event.reason, errorInfo);
    
    // ユーザーに通知
    showEnhancedNotification(
        errorInfo.message,
        'error',
        errorInfo.retryable ? {
            action: {
                label: '再読み込み',
                handler: 'location.reload()'
            }
        } : {}
    );
    
    // デフォルトのエラー表示を抑制
    event.preventDefault();
});

// JavaScriptエラーをキャッチ
window.addEventListener('error', (event) => {
    console.error('❌ Global JavaScript error:', event.error);
    
    const errorInfo = analyzeError(event.error);
    logError('globalError', event.error, errorInfo);
    
    // ユーザーに通知（重要なエラーのみ）
    if (!event.filename?.includes('chrome-extension')) {
        showEnhancedNotification(
            'アプリケーションエラーが発生しました。ページを再読み込みしてください。',
            'error',
            {
                action: {
                    label: '再読み込み',
                    handler: 'location.reload()'
                }
            }
        );
    }
});

// ===== FirebaseScheduleManagerへの統合 =====

// アプリ初期化後にエラーハンドリング機能を追加
document.addEventListener('DOMContentLoaded', () => {
    console.log('🛡️ Error handler initialized');
    
    // 既存のFirebaseScheduleManagerにエラーハンドリング機能を追加
    setTimeout(() => {
        if (window.FirebaseScheduleManager && window.FirebaseScheduleManager.prototype) {
            // analyzeError メソッドを追加
            if (!window.FirebaseScheduleManager.prototype.analyzeError) {
                window.FirebaseScheduleManager.prototype.analyzeError = analyzeError;
            }
            
            // logError メソッドを追加
            if (!window.FirebaseScheduleManager.prototype.logError) {
                window.FirebaseScheduleManager.prototype.logError = logError;
            }
            
            // showEnhancedNotification メソッドを追加
            if (!window.FirebaseScheduleManager.prototype.showEnhancedNotification) {
                window.FirebaseScheduleManager.prototype.showEnhancedNotification = showEnhancedNotification;
            }
            
            // scheduleRetry メソッドを追加
            if (!window.FirebaseScheduleManager.prototype.scheduleRetry) {
                window.FirebaseScheduleManager.prototype.scheduleRetry = function(fn, key) {
                    retryManager.scheduleRetry(fn, 5000, key);
                };
            }
            
            console.log('✅ Error handling methods added to FirebaseScheduleManager');
        }
    }, 1000);
});

console.log('✅ Error handler module loaded');

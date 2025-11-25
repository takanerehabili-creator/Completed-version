// ===== サイドバー検索機能 =====

// サイドバーを開く
function openSearchSidebar() {
    const sidebar = document.getElementById('searchSidebar');
    const overlay = document.getElementById('searchOverlay');
    
    if (sidebar && overlay) {
        sidebar.classList.add('open');
        overlay.classList.add('open');
        
        // 入力欄にフォーカス
        const input = document.getElementById('sidebarSearchInput');
        if (input) {
            input.value = '';
            setTimeout(() => input.focus(), 300);
        }
        
        // 前回の検索結果をクリア
        const resultsDiv = document.getElementById('sidebarSearchResults');
        if (resultsDiv) {
            resultsDiv.style.display = 'none';
        }
    }
}

// サイドバーを閉じる
function closeSearchSidebar() {
    const sidebar = document.getElementById('searchSidebar');
    const overlay = document.getElementById('searchOverlay');
    
    if (sidebar) {
        sidebar.classList.remove('open');
    }
    if (overlay) {
        overlay.classList.remove('open');
    }
}

// 名前で検索（サイドバー版）
function searchBySidebar() {
    const searchInput = document.getElementById('sidebarSearchInput');
    if (!searchInput) {
        app.showNotification('検索ボックスが見つかりません', 'error');
        return;
    }
    
    const searchTerm = searchInput.value.trim();
    
    if (!searchTerm) {
        app.showNotification('検索する名前を入力してください', 'error');
        return;
    }
    
    // 検索中表示
    const resultsDiv = document.getElementById('sidebarSearchResults');
    const listDiv = document.getElementById('sidebarSearchResultList');
    const countSpan = document.getElementById('sidebarSearchResultCount');
    
    if (resultsDiv) {
        resultsDiv.style.display = 'block';
    }
    if (listDiv) {
        listDiv.innerHTML = '<div style="padding:20px;text-align:center;color:#666">検索中...</div>';
    }
    
    try {
        // 今週の月曜日を取得
        const today = new Date();
        const mondayOfThisWeek = app.getMondayOfWeek(today);
        const thisMondayStr = mondayOfThisWeek.toISOString().split('T')[0];
        
        // 3ヶ月後の日付を取得
        const threeMonthsLater = new Date(today);
        threeMonthsLater.setMonth(today.getMonth() + 3);
        const threeMonthsLaterStr = threeMonthsLater.toISOString().split('T')[0];
        
        console.log('検索範囲:', thisMondayStr, 'から', threeMonthsLaterStr);
        console.log('検索ワード:', searchTerm);
        
        // キャッシュから検索
        const searchLower = searchTerm.toLowerCase();
        const results = app.events.filter(event => {
            // 日付チェック
            if (!event.date) return false;
            if (event.date < thisMondayStr) return false;
            if (event.date > threeMonthsLaterStr) return false;
            
            // 名前で検索（部分一致）
            const surname = (event.surname || '').toLowerCase();
            const firstname = (event.firstname || '').toLowerCase();
            const displayName = (event.displayName || '').toLowerCase();
            
            return surname.includes(searchLower) || 
                   firstname.includes(searchLower) || 
                   displayName.includes(searchLower);
        });
        
        console.log('検索結果:', results.length, '件');
        
        // 日付・時刻順にソート
        results.sort((a, b) => {
            if (a.date !== b.date) {
                return a.date.localeCompare(b.date);
            }
            const timeA = a.time || a.startTime || '';
            const timeB = b.time || b.startTime || '';
            return timeA.localeCompare(timeB);
        });
        
        // 結果を表示
        displaySidebarSearchResults(results, searchTerm);
        
    } catch (error) {
        console.error('検索エラー:', error);
        app.showNotification('検索に失敗しました', 'error');
        if (listDiv) {
            listDiv.innerHTML = '<div style="padding:20px;text-align:center;color:#d32f2f">検索に失敗しました</div>';
        }
    }
}

// 検索結果を表示（サイドバー版）
function displaySidebarSearchResults(results, searchTerm) {
    const resultsDiv = document.getElementById('sidebarSearchResults');
    const countSpan = document.getElementById('sidebarSearchResultCount');
    const listDiv = document.getElementById('sidebarSearchResultList');
    
    if (!resultsDiv || !countSpan || !listDiv) {
        console.error('検索結果表示エリアが見つかりません');
        return;
    }
    
    // 結果件数を表示
    countSpan.textContent = results.length;
    
    // 結果エリアを表示
    resultsDiv.style.display = 'block';
    
    // 結果がない場合
    if (results.length === 0) {
        listDiv.innerHTML = '<div style="padding:20px;text-align:center;color:#666">該当する予定が見つかりませんでした</div>';
        return;
    }
    
    // 予定種類のラベル
    const typeLabels = {
        '20min': '20分',
        '40min': '40分',
        '60min': '60分',
        'visit': '訪問',
        'workinjury20': '労災20',
        'workinjury40': '労災40',
        'accident': '事故',
        'day': 'デイ',
        'meeting': '担会',
        'other': 'その他'
    };
    
    // 結果リストを作成
    let html = '';
    results.forEach(event => {
        const surname = event.surname || '';
        const firstname = event.firstname || '';
        const displayName = surname + firstname || event.displayName || '-';
        const date = event.date || '-';
        const time = event.time || event.startTime || '-';
        const member = event.member || '-';
        const eventId = event.id || '';
        const typeLabel = typeLabels[event.type] || event.type || '-';
        
        // 検索ワードをハイライト
        const highlightedName = displayName.replace(
            new RegExp(`(${searchTerm})`, 'gi'),
            '<span style="background:#ffeb3b;font-weight:bold;padding:2px 4px;border-radius:3px">$1</span>'
        );
        
        // 日付を読みやすく
        const dateObj = app.createLocalDate(date);
        const days = ['日', '月', '火', '水', '木', '金', '土'];
        const dateText = `${dateObj.getMonth() + 1}/${dateObj.getDate()}(${days[dateObj.getDay()]})`;
        
        html += `
            <div class="sidebar-result-item" onclick="jumpToDateFromSidebar('${date}', '${eventId}')">
                <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:5px">
                    <div style="font-weight:600;font-size:15px;color:#333">
                        ${highlightedName}
                    </div>
                    <div style="font-size:11px;color:#fff;background:#4285f4;padding:2px 6px;border-radius:3px;white-space:nowrap">
                        ${typeLabel}
                    </div>
                </div>
                <div style="font-size:13px;color:#666;margin-bottom:3px">
                    📅 ${dateText} ${time !== '-' ? '⏰ ' + time : ''}
                </div>
                <div style="font-size:12px;color:#999">
                    担当: ${member}
                </div>
            </div>
        `;
    });
    
    listDiv.innerHTML = html;
}

// サイドバーから日付にジャンプ
async function jumpToDateFromSidebar(dateString, eventId) {
    console.log('=== サイドバーからジャンプ ===');
    console.log('日付:', dateString, 'イベントID:', eventId);
    
    // サイドバーを閉じる
    closeSearchSidebar();
    
    // 少し待ってから移動（アニメーション完了を待つ）
    await new Promise(resolve => setTimeout(resolve, 300));
    
    showLoading(`${dateString}の予定に移動中...`);
    
    try {
        // 該当週に移動
        if (app && typeof app.selectCalendarDate === 'function') {
            await app.selectCalendarDate(dateString);
            
            // レンダリング完了を待つ
            await new Promise(resolve => setTimeout(resolve, 800));
            
            hideLoading();
            
            // イベントをハイライト
            if (eventId) {
                highlightEventSimple(eventId);
            }
            
        } else {
            hideLoading();
            app.showNotification('日付への移動に失敗しました', 'error');
        }
        
    } catch (error) {
        console.error('ジャンプエラー:', error);
        hideLoading();
        app.showNotification('日付への移動に失敗しました', 'error');
    }
}

// シンプルなハイライト処理
function highlightEventSimple(eventId) {
    console.log('ハイライト:', eventId);
    
    // 既存のハイライトを削除
    document.querySelectorAll('.event-highlight').forEach(el => {
        el.classList.remove('event-highlight');
    });
    
    // 該当イベントを探す
    const eventElement = document.querySelector(`.event[data-event-id="${eventId}"]`);
    
    if (eventElement) {
        console.log('✅ イベント発見');
        
        // ハイライト追加
        eventElement.classList.add('event-highlight');
        
        // スクロール
        const mainContainer = document.querySelector('.main');
        if (mainContainer) {
            const eventRect = eventElement.getBoundingClientRect();
            const containerRect = mainContainer.getBoundingClientRect();
            
            const scrollLeft = mainContainer.scrollLeft + (eventRect.left - containerRect.left) - (containerRect.width / 2) + (eventRect.width / 2);
            const scrollTop = mainContainer.scrollTop + (eventRect.top - containerRect.top) - (containerRect.height / 2) + (eventRect.height / 2);
            
            mainContainer.scrollTo({
                left: Math.max(0, scrollLeft),
                top: Math.max(0, scrollTop),
                behavior: 'smooth'
            });
        }
        
        // 3秒後にハイライト解除
        setTimeout(() => {
            eventElement.classList.remove('event-highlight');
        }, 3000);
    } else {
        console.warn('❌ イベントが見つかりません');
    }
}

// Enterキーで検索
document.addEventListener('DOMContentLoaded', function() {
    const searchInput = document.getElementById('sidebarSearchInput');
    if (searchInput) {
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                searchBySidebar();
            }
        });
    }
    
    // オーバーレイクリックで閉じる
    const overlay = document.getElementById('searchOverlay');
    if (overlay) {
        overlay.addEventListener('click', function() {
            closeSearchSidebar();
        });
    }
});

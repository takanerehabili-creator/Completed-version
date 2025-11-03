// ===== 名前検索機能（最適化版） =====

// 検索モーダルを開く
function openSearchModal() {
    document.getElementById('searchModal').style.display = 'flex';
    document.getElementById('searchNameInput').focus();
}

// 検索モーダルを閉じる
function closeSearchModal() {
    document.getElementById('searchModal').style.display = 'none';
}

// 検索結果をクリア
function clearSearchResults() {
    document.getElementById('searchNameInput').value = '';
    document.getElementById('searchResults').style.display = 'none';
    document.getElementById('searchResultList').innerHTML = '';
}

// 名前で検索（最適化版）
async function searchByName() {
    const searchInput = document.getElementById('searchNameInput').value.trim();
    
    if (!searchInput) {
        app.showNotification('検索する名前を入力してください', 'error');
        return;
    }
    
    showLoading('検索中...');
    
    try {
        // ⭐ 最適化: 検索範囲を今日から3ヶ月先に限定（JavaScript側でフィルタ）
        const today = new Date();
        const threeMonthsLater = new Date(today);
        threeMonthsLater.setMonth(today.getMonth() + 3);
        
        const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
        const threeMonthsLaterStr = threeMonthsLater.toISOString().split('T')[0];
        
        console.log('=== Search Optimization ===');
        console.log('Search range:', todayStr, 'to', threeMonthsLaterStr);
        console.log('Search input:', searchInput);
        
        // Firestoreから検索（名前のみで検索、日付はJavaScript側でフィルタ）
        const results = [];
        
        // 姓で検索
        const surnameQuery = await db.collection('events')
            .where('surname', '>=', searchInput)
            .where('surname', '<=', searchInput + '\uf8ff')
            .get();
        
        surnameQuery.forEach(doc => {
            const data = doc.data();
            // ⭐ 日付範囲をJavaScript側でフィルタ
            if (data.date && data.date >= todayStr && data.date <= threeMonthsLaterStr) {
                results.push({
                    id: doc.id,
                    ...data
                });
            }
        });
        
        console.log('Surname results (filtered):', results.length);
        
        // 名で検索
        const firstnameQuery = await db.collection('events')
            .where('firstname', '>=', searchInput)
            .where('firstname', '<=', searchInput + '\uf8ff')
            .get();
        
        firstnameQuery.forEach(doc => {
            const data = doc.data();
            // ⭐ 日付範囲をJavaScript側でフィルタ
            if (data.date && data.date >= todayStr && data.date <= threeMonthsLaterStr) {
                // 重複を避ける
                if (!results.find(r => r.id === doc.id)) {
                    results.push({
                        id: doc.id,
                        ...data
                    });
                }
            }
        });
        
        console.log('Firstname results (filtered):', results.length);
        
        // displayNameでも検索（姓名が結合されている場合）
        const displayNameQuery = await db.collection('events')
            .where('displayName', '>=', searchInput)
            .where('displayName', '<=', searchInput + '\uf8ff')
            .get();
        
        displayNameQuery.forEach(doc => {
            const data = doc.data();
            // ⭐ 日付範囲をJavaScript側でフィルタ
            if (data.date && data.date >= todayStr && data.date <= threeMonthsLaterStr) {
                // 重複を避ける
                if (!results.find(r => r.id === doc.id)) {
                    results.push({
                        id: doc.id,
                        ...data
                    });
                }
            }
        });
        
        console.log('DisplayName results (filtered):', results.length);
        
        hideLoading();
        
        // 今週の月曜日を計算
        const dayOfWeek = today.getDay(); // 0=日曜日, 1=月曜日, ...
        const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // 日曜日の場合は前の月曜日
        const thisMonday = new Date(today);
        thisMonday.setDate(today.getDate() + daysToMonday);
        thisMonday.setHours(0, 0, 0, 0);
        
        const thisMondayString = thisMonday.toISOString().split('T')[0]; // YYYY-MM-DD形式
        
        console.log('Today:', todayStr);
        console.log('This Monday:', thisMondayString);
        
        // 今週以降の結果のみをフィルタリング
        const filteredResults = results.filter(event => {
            if (!event.date) return false;
            return event.date >= thisMondayString;
        });
        
        console.log('Total results:', results.length);
        console.log('Filtered results (this week and later):', filteredResults.length);
        
        // 結果を日付順にソート
        filteredResults.sort((a, b) => {
            if (a.date !== b.date) {
                return a.date.localeCompare(b.date);
            }
            if (a.time && b.time) {
                return a.time.localeCompare(b.time);
            }
            return 0;
        });
        
        // 結果を表示
        displaySearchResults(filteredResults, searchInput);
        
    } catch (error) {
        console.error('Search error:', error);
        hideLoading();
        app.showNotification('検索に失敗しました', 'error');
    }
}

// 検索結果を表示
function displaySearchResults(results, searchTerm) {
    const resultsDiv = document.getElementById('searchResults');
    const countSpan = document.getElementById('searchResultCount');
    const listDiv = document.getElementById('searchResultList');
    
    countSpan.textContent = results.length;
    
    if (results.length === 0) {
        resultsDiv.style.display = 'block';
        listDiv.innerHTML = '<p style="text-align:center;color:#666;padding:20px">該当する予定が見つかりませんでした</p>';
        return;
    }
    
    resultsDiv.style.display = 'block';
    
    let html = '';
    results.forEach(event => {
        const surname = event.surname || '';
        const firstname = event.firstname || '';
        const displayName = surname + firstname || event.displayName || '-';
        const date = event.date || '-';
        const time = event.time || event.startTime || '-';
        const member = event.member || '-';
        const eventId = event.id || ''; // ⭐ イベントIDを取得
        
        // ハイライト表示
        const highlightedName = displayName.replace(
            new RegExp(`(${searchTerm})`, 'gi'),
            '<span style="background:#ffeb3b;font-weight:bold">$1</span>'
        );
        
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
        const typeLabel = typeLabels[event.type] || event.type || '-';
        
        html += `
            <div class="search-result-item" onclick="jumpToDate('${date}', '${eventId}')" 
                 style="background:white;padding:12px;margin-bottom:8px;border-radius:6px;cursor:pointer;border:1px solid #ddd;transition:all 0.2s"
                 onmouseover="this.style.background='#f0f0f0';this.style.borderColor='#4285f4'"
                 onmouseout="this.style.background='white';this.style.borderColor='#ddd'">
                <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:5px">
                    <div style="font-weight:600;font-size:16px;color:#333">
                        ${highlightedName}
                    </div>
                    <div style="font-size:12px;color:#fff;background:#4285f4;padding:3px 8px;border-radius:4px">
                        ${typeLabel}
                    </div>
                </div>
                <div style="font-size:14px;color:#666;margin-bottom:3px">
                    📅 ${date} ${time !== '-' ? '⏰ ' + time : ''}
                </div>
                <div style="font-size:13px;color:#999">
                    担当: ${member}
                </div>
            </div>
        `;
    });
    
    listDiv.innerHTML = html;
}

// 日付にジャンプ（改善版：該当イベントまでスクロール）
async function jumpToDate(dateString, eventId) {
    try {
        // モーダルを閉じる
        closeSearchModal();
        
        showLoading(`${dateString}の予定に移動中...`);
        
        // selectCalendarDate関数を使用して日付にジャンプ
        if (app && app.selectCalendarDate) {
            await app.selectCalendarDate(dateString);
            hideLoading();
            
            // ⭐ renderTable完了を待つ仕組み
            waitForRenderComplete(() => {
                scrollToEvent(eventId, dateString);
            });
        } else {
            hideLoading();
            app.showNotification('日付への移動に失敗しました', 'error');
        }
        
    } catch (error) {
        console.error('Jump to date error:', error);
        hideLoading();
        app.showNotification('日付への移動に失敗しました', 'error');
    }
}

// renderTable完了を待つ関数
function waitForRenderComplete(callback, attempts = 0) {
    const maxAttempts = 20; // 最大10秒待つ（20回 × 500ms）
    
    // イベント要素が存在するかチェック（レンダリング完了の目印）
    const hasEvents = document.querySelectorAll('.event').length > 0;
    
    // または、tableReadyForDisplayフラグをチェック
    const isTableReady = window.app && window.app.tableReadyForDisplay;
    
    if (hasEvents || attempts >= maxAttempts) {
        console.log(`Render complete detected (attempt ${attempts + 1})`);
        callback();
    } else {
        console.log(`Waiting for render... (attempt ${attempts + 1}/${maxAttempts})`);
        setTimeout(() => {
            waitForRenderComplete(callback, attempts + 1);
        }, 500);
    }
}

// 該当イベントまでスクロールしてハイライト
function scrollToEvent(eventId, dateString) {
    try {
        // イベント要素を探す（data-event-id属性で検索）
        const eventElement = document.querySelector(`.event[data-event-id="${eventId}"]`);
        
        if (eventElement) {
            console.log('Found event element:', eventId);
            
            // ⭐ メインコンテナを取得（.mainがスクロールコンテナ）
            const mainContainer = document.querySelector('.main');
            
            if (mainContainer) {
                // イベント要素の位置を取得
                const eventRect = eventElement.getBoundingClientRect();
                const containerRect = mainContainer.getBoundingClientRect();
                
                // 現在のスクロール位置
                const startScrollLeft = mainContainer.scrollLeft;
                const startScrollTop = mainContainer.scrollTop;
                
                // イベントを画面中央に配置するための目標スクロール位置を計算
                const targetScrollLeft = startScrollLeft + (eventRect.left - containerRect.left) - (containerRect.width / 2) + (eventRect.width / 2);
                const targetScrollTop = startScrollTop + (eventRect.top - containerRect.top) - (containerRect.height / 2) + (eventRect.height / 2);
                
                const finalScrollLeft = Math.max(0, targetScrollLeft);
                const finalScrollTop = Math.max(0, targetScrollTop);
                
                console.log('Scrolling to:', { left: finalScrollLeft, top: finalScrollTop });
                
                // ⭐ カスタムスクロールアニメーション（1秒かけてスクロール）
                const duration = 1000; // 1秒
                const startTime = performance.now();
                
                function animateScroll(currentTime) {
                    const elapsed = currentTime - startTime;
                    const progress = Math.min(elapsed / duration, 1);
                    
                    // イージング関数（ease-in-out）
                    const easeProgress = progress < 0.5
                        ? 2 * progress * progress
                        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
                    
                    // 現在のスクロール位置を計算
                    const currentLeft = startScrollLeft + (finalScrollLeft - startScrollLeft) * easeProgress;
                    const currentTop = startScrollTop + (finalScrollTop - startScrollTop) * easeProgress;
                    
                    mainContainer.scrollLeft = currentLeft;
                    mainContainer.scrollTop = currentTop;
                    
                    if (progress < 1) {
                        requestAnimationFrame(animateScroll);
                    } else {
                        // スクロール完了後にハイライト
                        setTimeout(() => {
                            highlightEvent(eventElement);
                        }, 100);
                    }
                }
                
                requestAnimationFrame(animateScroll);
            } else {
                // フォールバック: 通常のscrollIntoView
                eventElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                    inline: 'center'
                });
                
                setTimeout(() => {
                    highlightEvent(eventElement);
                }, 600);
            }
            
            app.showNotification(`予定を表示しました`, 'success');
        } else {
            console.log('Event element not found, trying column highlight');
            // イベント要素が見つからない場合は列をハイライト（フォールバック）
            highlightTargetDate(dateString);
            app.showNotification(`${dateString}の週に移動しました`, 'success');
        }
        
    } catch (error) {
        console.error('Scroll to event error:', error);
        // エラーの場合は列をハイライト
        highlightTargetDate(dateString);
        app.showNotification(`${dateString}の週に移動しました`, 'success');
    }
}

// イベントをハイライト表示
function highlightEvent(eventElement) {
    // 元のスタイルを保存
    const originalTransform = eventElement.style.transform;
    const originalBoxShadow = eventElement.style.boxShadow;
    const originalZIndex = eventElement.style.zIndex;
    
    // アニメーション用のスタイルを追加
    eventElement.style.transition = 'all 0.3s ease';
    eventElement.style.transform = 'scale(1.1)';
    eventElement.style.boxShadow = '0 0 20px 5px rgba(255, 235, 59, 0.8)';
    eventElement.style.zIndex = '1000';
    
    // 点滅アニメーション（3回）
    let blinkCount = 0;
    const blinkInterval = setInterval(() => {
        if (blinkCount >= 6) {
            clearInterval(blinkInterval);
            
            // 元に戻す
            setTimeout(() => {
                eventElement.style.transform = originalTransform;
                eventElement.style.boxShadow = originalBoxShadow;
                eventElement.style.zIndex = originalZIndex;
                
                // トランジション解除
                setTimeout(() => {
                    eventElement.style.transition = '';
                }, 300);
            }, 500);
            
            return;
        }
        
        // 点滅（背景色を交互に変更）
        if (blinkCount % 2 === 0) {
            eventElement.style.backgroundColor = '#fff59d'; // 明るい黄色
        } else {
            eventElement.style.backgroundColor = ''; // 元の色
        }
        
        blinkCount++;
    }, 200);
}

// 該当日を一時的にハイライト表示
function highlightTargetDate(dateString) {
    try {
        // 該当日の列を探す
        const table = document.getElementById('mainTable');
        if (!table) return;
        
        // dateStringフォーマット: YYYY-MM-DD
        const parts = dateString.split('-');
        if (parts.length !== 3) return;
        
        const month = parseInt(parts[1], 10);
        const day = parseInt(parts[2], 10);
        const searchPattern = `${month}/${day}`;
        
        const headerCells = table.querySelectorAll('th.date-header');
        let targetColumnIndex = -1;
        
        headerCells.forEach((cell, index) => {
            const cellText = cell.textContent || '';
            // ヘッダーに日付が含まれているか確認（例: "10/27(月)"）
            if (cellText.includes(searchPattern)) {
                targetColumnIndex = index + 1; // +1 because time column is first
            }
        });
        
        if (targetColumnIndex === -1) {
            console.log('Target date column not found:', searchPattern);
            return;
        }
        
        console.log('Highlighting column:', targetColumnIndex);
        
        // 該当列のすべてのセルを一時的にハイライト
        const rows = table.querySelectorAll('tr');
        rows.forEach(row => {
            const cell = row.children[targetColumnIndex];
            if (cell) {
                const originalBg = window.getComputedStyle(cell).backgroundColor;
                cell.style.background = '#fff3cd';
                cell.style.transition = 'background 0.5s ease-out';
                
                setTimeout(() => {
                    cell.style.background = '';
                    // トランジション終了後に元のスタイルを復元
                    setTimeout(() => {
                        cell.style.transition = '';
                    }, 500);
                }, 2000);
            }
        });
    } catch (error) {
        console.error('Highlight error:', error);
    }
}

console.log('✅ Search feature loaded (optimized version)');

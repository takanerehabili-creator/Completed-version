// ===== 名前検索機能 =====

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

// 名前で検索
async function searchByName() {
    const searchInput = document.getElementById('searchNameInput').value.trim();
    
    if (!searchInput) {
        app.showNotification('検索する名前を入力してください', 'error');
        return;
    }
    
    showLoading('検索中...');
    
    try {
        // Firestoreから全予定を取得（姓または名に部分一致）
        const results = [];
        
        // 姓で検索
        const surnameQuery = await db.collection('events')
            .where('surname', '>=', searchInput)
            .where('surname', '<=', searchInput + '\uf8ff')
            .get();
        
        surnameQuery.forEach(doc => {
            const data = doc.data();
            results.push({
                id: doc.id,
                ...data
            });
        });
        
        // 名で検索
        const firstnameQuery = await db.collection('events')
            .where('firstname', '>=', searchInput)
            .where('firstname', '<=', searchInput + '\uf8ff')
            .get();
        
        firstnameQuery.forEach(doc => {
            const data = doc.data();
            // 重複を避ける
            if (!results.find(r => r.id === doc.id)) {
                results.push({
                    id: doc.id,
                    ...data
                });
            }
        });
        
        // displayNameでも検索（姓名が結合されている場合）
        const displayNameQuery = await db.collection('events')
            .where('displayName', '>=', searchInput)
            .where('displayName', '<=', searchInput + '\uf8ff')
            .get();
        
        displayNameQuery.forEach(doc => {
            const data = doc.data();
            // 重複を避ける
            if (!results.find(r => r.id === doc.id)) {
                results.push({
                    id: doc.id,
                    ...data
                });
            }
        });
        
        hideLoading();
        
        // 今週の月曜日を計算
        const today = new Date();
        const dayOfWeek = today.getDay(); // 0=日曜日, 1=月曜日, ...
        const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // 日曜日の場合は前の月曜日
        const thisMonday = new Date(today);
        thisMonday.setDate(today.getDate() + daysToMonday);
        thisMonday.setHours(0, 0, 0, 0);
        
        const thisMondayString = thisMonday.toISOString().split('T')[0]; // YYYY-MM-DD形式
        
        console.log('Today:', today.toISOString().split('T')[0]);
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
            <div class="search-result-item" onclick="jumpToDate('${date}')" 
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

// 日付にジャンプ
async function jumpToDate(dateString) {
    try {
        // モーダルを閉じる
        closeSearchModal();
        
        showLoading(`${dateString}の週に移動中...`);
        
        // selectCalendarDate関数を使用して日付にジャンプ
        if (app && app.selectCalendarDate) {
            await app.selectCalendarDate(dateString);
            hideLoading();
            app.showNotification(`${dateString}の週に移動しました`, 'success');
            
            // 該当日を少し強調表示
            setTimeout(() => {
                highlightTargetDate(dateString);
            }, 500);
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

console.log('✅ Search feature loaded');

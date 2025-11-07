// ===== 祝日インターネット取得機能 =====

// 年選択セレクトボックスを初期化
function initHolidayYearSelect() {
    const select = document.getElementById('holidayYear');
    if (!select) return;
    
    // 既にoptionがある場合はスキップ（重複防止）
    if (select.options.length > 1) return;
    
    const currentYear = new Date().getFullYear();
    
    // 既存のoption（"年を選択"）以外をクリア
    while (select.options.length > 1) {
        select.remove(1);
    }
    
    // 今年から5年先まで
    for (let year = currentYear; year <= currentYear + 5; year++) {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = `${year}年`;
        select.appendChild(option);
    }
    
    // デフォルトで今年を選択
    select.value = currentYear;
}

// インターネットから祝日を取得
async function fetchHolidaysFromInternet() {
    const yearSelect = document.getElementById('holidayYear');
    const selectedYear = yearSelect.value;
    
    if (!selectedYear) {
        app.showNotification('年を選択してください', 'error');
        return;
    }
    
    const confirmMsg = `${selectedYear}年の日本の祝日をインターネットから取得して追加しますか？\n\n既に登録されている同じ日付の祝日は上書きされます。`;
    
    if (!confirm(confirmMsg)) {
        return;
    }
    
    showLoading('祝日データを取得中...');
    
    try {
        // 内閣府の祝日CSVをCORSプロキシ経由で取得
        const csvUrl = 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv';
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(csvUrl)}`;
        
        const response = await fetch(proxyUrl);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // レスポンスをテキストとして取得
        const arrayBuffer = await response.arrayBuffer();
        
        // Shift-JISからUTF-8にデコード
        const decoder = new TextDecoder('shift-jis');
        const csvText = decoder.decode(arrayBuffer);
        
        // CSVをパース
        const holidays = parseHolidayCSV(csvText, selectedYear);
        
        if (holidays.length === 0) {
            hideLoading();
            app.showNotification(`${selectedYear}年の祝日データが見つかりませんでした`, 'error');
            return;
        }
        
        // Firestoreに保存
        const batch = db.batch();
        let addedCount = 0;
        
        for (const holiday of holidays) {
            // 日付をドキュメントIDとして使用（重複を防ぐ）
            const docRef = db.collection('holidays').doc(holiday.date);
            batch.set(docRef, {
                date: holiday.date,
                name: holiday.name,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                source: 'internet'
            });
            addedCount++;
        }
        
        await batch.commit();
        
        hideLoading();
        
        app.showNotification(`${selectedYear}年の祝日 ${addedCount}件を追加しました`, 'success');
        
        // 祝日リストを再読み込み
        if (app && app.loadHolidays) {
            await app.loadHolidays();
            app.renderHolidayList();
        }
        
        console.log(`Added ${addedCount} holidays for year ${selectedYear}`);
        
    } catch (error) {
        console.error('Failed to fetch holidays:', error);
        hideLoading();
        
        // エラーの種類に応じたメッセージ
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            app.showNotification('インターネット接続を確認してください', 'error');
        } else {
            app.showNotification('祝日の取得に失敗しました。しばらくしてから再度お試しください。', 'error');
        }
    }
}

// CSV文字列をパースして祝日データを抽出
function parseHolidayCSV(csvText, targetYear) {
    const holidays = [];
    
    try {
        // 行に分割
        const lines = csvText.split(/\r?\n/);
        
        // ヘッダー行をスキップ（1行目）
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            // カンマで分割
            const parts = line.split(',');
            if (parts.length < 2) continue;
            
            const dateStr = parts[0].trim();
            const name = parts[1].trim();
            
            // 日付フォーマット: YYYY/MM/DD
            const dateParts = dateStr.split('/');
            if (dateParts.length !== 3) continue;
            
            const year = parseInt(dateParts[0], 10);
            const month = dateParts[1].padStart(2, '0');
            const day = dateParts[2].padStart(2, '0');
            
            // 指定された年のみ抽出
            if (year === parseInt(targetYear, 10)) {
                holidays.push({
                    date: `${year}-${month}-${day}`,
                    name: name
                });
            }
        }
        
    } catch (error) {
        console.error('CSV parse error:', error);
    }
    
    return holidays;
}

// 祝日データのプレビュー（デバッグ用）
function previewHolidays(holidays) {
    console.log('=== Holidays Preview ===');
    holidays.forEach(h => {
        console.log(`${h.date}: ${h.name}`);
    });
    console.log(`Total: ${holidays.length} holidays`);
}

console.log('✅ Holiday fetch feature loaded');

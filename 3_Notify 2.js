/** 1. 業務查詢通知：當客戶貨量不足時，彙整至群組通知對應業務 */
function handleSalesPush(auth, queries, fullReply, userId) {
  const isQueryingQty = queries.some(q => q.includes('坪') || q.includes('片') || q.includes('p'));
  const isProblematic = fullReply.includes('❌') || fullReply.includes('🟠') || fullReply.includes('不足');
  
  if ((auth.level === 'free' || auth.level === 'class') && isQueryingQty && isProblematic) {
    const salesLabel = auth.salesID ? auth.salesID : '未指派';
    const msg = `📥 客戶貨量預警\n` +
                `[${salesLabel}]\n` +
                `──────\n` +
                `👤 業務：${salesLabel}\n` +
                `👥 客戶：${auth.name}\n` +
                `💬 內容：${queries.join(' ')}\n\n` +
                `📎 系統回覆摘要：\n${fullReply.substring(0, 150)}...`;

    pushTelegram(msg);
  }
}

/** 2. 保留追蹤通知：新進榜 + 超過60天未更新進度 (取代舊到期提醒) */
function sendReservationExpiryAlerts() {
  const reserveData = getReserveSheet();
  if (!reserveData || reserveData.length < 2) return;
  const h = getHeaderMap(reserveData);

  const idxDate   = h['保留日期'] >= 0 ? h['保留日期'] : h['日期'];
  const idxBiz    = h['客戶業務'] >= 0 ? h['客戶業務'] : h['業務'];
  const idxCode   = h['編號'];
  const idxPcs    = h['數量'];
  const idxCase   = h['案名'];
  const idxAddr   = h['地址'] >= 0 ? h['地址'] : h['工地'];
  const idxDep    = h['訂金確認'];
  if (idxDate < 0 || idxBiz < 0) return;

  const today = new Date(); today.setHours(0,0,0,0);
  const daysSince = (d) => Math.floor((today - d) / 86400000);
  const { emailMap, levelMap, kingEmails } = getBizEmailMap_();

  // 用 ScriptProperties 記錄上次檢查日期，判斷「新進榜」
  const propKey = 'LAST_RESERVE_CHECK';
  const lastCheckStr = PropertiesService.getScriptProperties().getProperty(propKey);
  const lastCheck = lastCheckStr ? new Date(lastCheckStr) : new Date(today.getTime() - 7*86400000);
  PropertiesService.getScriptProperties().setProperty(propKey, Utilities.formatDate(today, 'GMT+8', 'yyyy/MM/dd'));

  const newEntries = [];     // 新進榜
  const over60NoProgress = []; // 超過60天未更新

  for (let i = 1; i < reserveData.length; i++) {
    const r = reserveData[i];
    const rawDate = r[idxDate];
    if (!rawDate) continue;
    let rDate;
    try { rDate = (rawDate instanceof Date) ? new Date(rawDate) : new Date(String(rawDate)); } catch(e) { continue; }
    if (isNaN(rDate.getTime())) continue;
    rDate.setHours(0,0,0,0);

    const biz = String(r[idxBiz] || '未指定').trim();
    const days = daysSince(rDate);
    const isPaid = !!r[idxDep];
    const code = String(r[idxCode] || '?').toUpperCase();

    // 新進榜：保留日期在上次檢查之後
    if (rDate >= lastCheck && rDate <= today) {
      newEntries.push({
        biz, code, days,
        pcs: r[idxPcs] || 0,
        caseName: String(r[idxCase] || (idxAddr >= 0 ? r[idxAddr] : '') || '未命名').trim(),
        rDate: Utilities.formatDate(rDate, 'GMT+8', 'MM/dd'),
        deposit: isPaid ? '💰已付' : '🈚未付'
      });
    }

    // 超過60天且未付訂金（未更新進度）
    if (days >= 60 && !isPaid) {
      over60NoProgress.push({
        biz, code, days,
        pcs: r[idxPcs] || 0,
        caseName: String(r[idxCase] || (idxAddr >= 0 ? r[idxAddr] : '') || '未命名').trim(),
        rDate: Utilities.formatDate(rDate, 'GMT+8', 'MM/dd'),
        deposit: '🈚未付'
      });
    }
  }

  if (newEntries.length === 0 && over60NoProgress.length === 0) return;

  // 彙整給管理員
  const subject = '👑 保留追蹤通知';
  let body = '管理者您好，\n\n';

  if (newEntries.length > 0) {
    body += `📌 新進榜保留單 (${newEntries.length} 筆)\n`;
    body += `──────\n`;
    newEntries.forEach(it => {
      body += `  ${it.caseName} | ${it.code} (${it.pcs}片) | ${it.biz} | ${it.rDate} ${it.deposit}\n`;
    });
    body += '\n';
  }

  if (over60NoProgress.length > 0) {
    body += `⚠️ 超過60天未更新進度 (${over60NoProgress.length} 筆)\n`;
    body += `──────\n`;
    over60NoProgress.forEach(it => {
      body += `  ${it.caseName} | ${it.code} (${it.pcs}片) | ${it.biz} | 已留${it.days}天 ${it.deposit}\n`;
    });
    body += '\n';
  }

  body += `— 高雅瓷 AI 客服`;
  kingEmails.forEach(email => sendEmailNotification(subject, body, null, email));
}

/** 3. 通用 Email 發送工具 */
function sendEmailNotification(subject, body, replyTo, toEmail) {
  try {
    const recipient = toEmail || CONFIG.ADMIN_EMAIL;
    if (!recipient) return;
    GmailApp.sendEmail(recipient, subject, body, { name: '高雅瓷戰情室' });
  } catch(e) {
    console.error("Email 發送失敗：" + e);
  }
}

/** 4. 取得報表用 Email 對應表 */
function getBizEmailMap_() {
  const result = { emailMap: {}, levelMap: {}, kingEmails: [] };
  try {
    const ss = SpreadsheetApp.openById(CONFIG.DATA_SS_ID);
    const wlSheet = ss.getSheetByName(SHEET_NAME.WHITELIST);
    const wlData = wlSheet.getDataRange().getValues();
    const hdr = wlData[0];
    const nameCol = hdr.indexOf('名字'), emailCol = hdr.indexOf('EMAIL'), levelCol = hdr.indexOf('等級'); 

    wlData.slice(1).forEach(r => {
      const name = String(r[nameCol] || '').trim(), email = String(r[emailCol] || '').trim(), level = String(r[levelCol] || '').toLowerCase();
      if (!name || !email) return;
      result.emailMap[name] = email;
      result.levelMap[name] = level;
      if (['king', 'queen', 'admin'].includes(level)) result.kingEmails.push(email);
    });
  } catch(e) {}
  return result;
}

function isTaiwanHoliday() {
  try {
    const calendarId = "zh-tw.taiwan#holiday@group.v.calendar.google.com";
    const calendar = CalendarApp.getCalendarById(calendarId);
    const now = new Date();
    const events = calendar.getEventsForDay(now);
    return events.length > 0;
  } catch (e) { return false; }
}

/** 5. 產品新缺貨提醒：保留超過庫存一半 + 庫存低於月銷量x5個月 */
function sendProductStockAlerts() {
  const priceData = getPriceSheet();
  const stockData = getStockSheet();
  const reserveData = getMainSheet();
  const salesData = getMonthSheet();
  if (!priceData || priceData.length < 2) return;

  const pMap = getHeaderMap(priceData);
  const sMap = getHeaderMap(stockData);
  const rMap = getHeaderMap(reserveData);
  const salesMap = { date: -1, cust: -1, amt: -1, code: -1 };
  if (salesData && salesData.length > 1) {
    const h = salesData[0].map(v => String(v).trim());
    salesMap.date = h.indexOf('單據日期') >= 0 ? h.indexOf('單據日期') : h.indexOf('日期');
    salesMap.amt  = h.indexOf('金額');
    salesMap.code = h.indexOf('產品編號') >= 0 ? h.indexOf('產品編號') : h.indexOf('編號');
  }

  const now = new Date();
  const sixMonthsAgo = new Date(now.getTime() - 180 * 86400000);

  // 計算各產品過去6個月月均銷量
  const monthlySales = {};
  if (salesData && salesMap.date >= 0 && salesMap.amt >= 0 && salesMap.code >= 0) {
    for (let i = 1; i < salesData.length; i++) {
      const row = salesData[i];
      const d = (row[salesMap.date] instanceof Date) ? row[salesMap.date] : new Date(String(row[salesMap.date]));
      if (isNaN(d.getTime()) || d < sixMonthsAgo) continue;
      const code = String(row[salesMap.code] || '').toUpperCase().trim();
      const amt = parseFloat(row[salesMap.amt]) || 0;
      if (!code || amt <= 0) continue;
      if (!monthlySales[code]) monthlySales[code] = [];
      monthlySales[code].push(amt);
    }
  }
  const avgMonthlySales = {};
  Object.keys(monthlySales).forEach(code => {
    const total = monthlySales[code].reduce((a, b) => a + b, 0);
    avgMonthlySales[code] = total / 6;
  });

  // 計算各產品庫存與保留量
  const stockQty = {};
  for (let i = 1; i < stockData.length; i++) {
    const code = String(stockData[i][sMap['編號']]).toUpperCase().trim();
    const qty = parseFloat(stockData[i][sMap['片數']]) || 0;
    if (code && !String(stockData[i][sMap['品名']]).includes('小計')) {
      stockQty[code] = (stockQty[code] || 0) + qty;
    }
  }

  const reservedQty = {};
  for (let i = 1; i < reserveData.length; i++) {
    const code = String(reserveData[i][rMap['編號']]).toUpperCase().trim();
    const qty = parseFloat(reserveData[i][rMap['數量']]) || 0;
    if (code) reservedQty[code] = (reservedQty[code] || 0) + qty;
  }

  // 取得價目表的中文系列對應
  const codeSeries = {};
  const idxCode = pMap['編號'];
  const idxSeries = pMap['中文系列'];
  for (let i = 1; i < priceData.length; i++) {
    const code = String(priceData[i][idxCode]).toUpperCase().trim();
    const series = String(priceData[i][idxSeries] || '').trim();
    if (code) codeSeries[code] = series;
  }

  const ratioAlerts = [];   // 保留超過庫存一半
  const stockAlerts = [];   // 庫存低於月銷量x5個月

  const allCodes = new Set([...Object.keys(stockQty), ...Object.keys(reservedQty)]);
  allCodes.forEach(code => {
    const stock = stockQty[code] || 0;
    const reserved = reservedQty[code] || 0;
    if (stock <= 0) return;
    const series = codeSeries[code] || '-';

    // 保留超過庫存一半
    const ratio = reserved / stock;
    if (ratio > 0.5) {
      ratioAlerts.push({ code, series, stock, reserved, ratio: Math.round(ratio * 100) });
    }

    // 庫存低於月銷量x5個月
    const avg = avgMonthlySales[code] || 0;
    if (avg > 0) {
      const monthsOfStock = stock / avg;
      if (monthsOfStock < 5) {
        stockAlerts.push({ code, series, stock, avg: Math.round(avg), months: Math.round(monthsOfStock * 10) / 10 });
      }
    }
  });

  if (ratioAlerts.length === 0 && stockAlerts.length === 0) return;

  ratioAlerts.sort((a, b) => b.ratio - a.ratio);
  stockAlerts.sort((a, b) => a.months - b.months);

  // 實務上可改為HTML，此處用純文字
  let body = '管理者您好，\n\n';
  let subject = '🚨';

  if (ratioAlerts.length > 0) {
    subject += ' 保留超佔 |';
    body += '📌 保留超過庫存一半之產品\n──────\n';
    ratioAlerts.forEach(it => {
      body += `  ${it.code} (${it.series}) | 庫存${it.stock}片 | 保留${it.reserved}片 | 佔比${it.ratio}%\n`;
    });
    body += '\n';
  }

  if (stockAlerts.length > 0) {
    subject += ' 庫存低水位 |';
    body += '📌 庫存低於月銷量x5個月\n──────\n';
    stockAlerts.forEach(it => {
      body += `  ${it.code} (${it.series}) | 庫存${it.stock}片 | 月均${it.avg}片 | 僅夠${it.months}個月\n`;
    });
    body += '\n';
  }

  subject += ' 產品庫存警示';
  body += '— 高雅瓷 AI 客服';
  sendEmailNotification(subject, body);
}

/** 6. 每日綜合日報：業績 + 查詢記錄 (18:30 執行) */
function sendDailyQuerySummary() {
  try {
    const today = new Date();
    if (today.getDay() === 0 || today.getDay() === 6 || isTaiwanHoliday()) return;
    const todayStr = Utilities.formatDate(today, "Asia/Taipei", "yyyy/MM/dd");
    const dateLabel = Utilities.formatDate(today, "Asia/Taipei", "M/d");
    const dayNames = ['日','一','二','三','四','五','六'];
    const dayName = dayNames[today.getDay()];

    // ── A. 業績資料 ──
    const salesData = getMonthSheet();
    const sH = salesData && salesData.length > 1 ? salesData[0].map(v => String(v).trim()) : [];
    const sMap = {
      date: sH.indexOf('單據日期'), sales: sH.indexOf('負責業務') >= 0 ? sH.indexOf('負責業務') : sH.indexOf('業務'),
      cust: sH.indexOf('客戶名稱') >= 0 ? sH.indexOf('客戶名稱') : sH.indexOf('客戶'),
      amt: sH.indexOf('金額'), code: sH.indexOf('產品編號') >= 0 ? sH.indexOf('產品編號') : sH.indexOf('編號'),
      type: sH.indexOf('類別')
    };

    const todayStart = new Date(today); todayStart.setHours(0,0,0,0);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    let todayTotal = 0, monthTotal = 0;
    const custToday = {}, custMonth = {};
    const salesToday = {}, salesMonth = {};
    const seriesCount = {};
    const sizeCount = {};

    const priceData = getPriceSheet();
    const pMap = priceData && priceData.length > 0 ? getHeaderMap(priceData) : {};
    const pCodeIdx = pMap['編號'], pSeriesIdx = pMap['中文系列'], pSizeIdx = pMap['尺寸(cm)'];
    const codeSeries = {}, codeSize = {};
    if (priceData && pCodeIdx !== undefined) {
      for (let i = 1; i < priceData.length; i++) {
        const c = String(priceData[i][pCodeIdx]).toUpperCase().trim();
        if (c) {
          if (pSeriesIdx !== undefined) codeSeries[c] = String(priceData[i][pSeriesIdx] || '').trim();
          if (pSizeIdx !== undefined) codeSize[c] = String(priceData[i][pSizeIdx] || '').trim();
        }
      }
    }

    if (salesData && sMap.date >= 0 && sMap.amt >= 0) {
      for (let i = 1; i < salesData.length; i++) {
        const row = salesData[i];
        let d = row[sMap.date];
        if (d instanceof Date) {} else if (typeof d === 'string' || typeof d === 'number') { d = parseRocDate(d); }
        if (!(d instanceof Date) || isNaN(d.getTime())) continue;
        const amt = parseFloat(row[sMap.amt]) || 0;
        if (amt <= 0) continue;
        const sName = String(row[sMap.sales] || '').trim();
        const cName = String(row[sMap.cust] || '').trim();
        const code = String(row[sMap.code] || '').toUpperCase().trim();
        const series = codeSeries[code] || '其他';

        const isToday = d >= todayStart;
        const isMonth = d >= monthStart;

        if (isToday) {
          todayTotal += amt;
          custToday[cName] = (custToday[cName] || 0) + amt;
          salesToday[sName] = (salesToday[sName] || 0) + amt;
        }
        if (isMonth) {
          monthTotal += amt;
          custMonth[cName] = (custMonth[cName] || 0) + amt;
          salesMonth[sName] = (salesMonth[sName] || 0) + amt;
          if (series) seriesCount[series] = (seriesCount[series] || 0) + amt;
          const size = codeSize[code];
          if (size) sizeCount[size] = (sizeCount[size] || 0) + amt;
        }
      }
    }

    // ── B. 查詢記錄 ──
    const ss = getSpreadsheetInstance();
    const logSheet = ss.getSheetByName(SHEET_NAME.LOG);
    const logRows = [];
    if (logSheet) {
      const lastRow = logSheet.getLastRow();
      if (lastRow > 1) {
        const data = logSheet.getRange(1, 1, lastRow, 17).getValues();
        for (let i = 1; i < data.length; i++) {
          const rowDate = data[i][0];
          if (!rowDate) continue;
          const rowDateStr = rowDate instanceof Date ? Utilities.formatDate(rowDate, "Asia/Taipei", "yyyy/MM/dd") : String(rowDate).substring(0, 10);
          if (rowDateStr === todayStr) {
            logRows.push({
              time: data[i][0], name: data[i][3], level: data[i][4],
              input: data[i][5], productCode: data[i][8], reqQty: data[i][9],
              availPcs: data[i][10], status: data[i][11], salesName: data[i][16]
            });
          }
        }
      }
    }

    logRows.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    const oosRows = logRows.filter(r => {
      if (r.status !== '不足' && r.status !== '查無') return false;
      const lv = String(r.level || '').toLowerCase();
      return lv !== 'sales' && lv !== 'king' && lv !== 'queen' && lv !== 'admin' && lv !== 'premium';
    });
    const okRows = logRows.filter(r => r.status === '充足' || (r.status !== '不足' && r.status !== '查無'));

    // ── 組 HTML ──
    const topCust = Object.entries(custToday).sort((a,b) => b[1]-a[1]).slice(0,10);
    const topSales = Object.entries(salesToday).sort((a,b) => b[1]-a[1]);
    const topSeries = Object.entries(seriesCount).sort((a,b) => b[1]-a[1]).slice(0,5);
    const topSizes = Object.entries(sizeCount).sort((a,b) => b[1]-a[1]).slice(0,5);

    const fmtW = (v) => v >= 10000 ? (v/10000).toFixed(1)+'萬' : v >= 1000 ? (v/1000).toFixed(1)+'千' : v+'元';
    const custTotal = Object.values(custToday).reduce((a,b) => a+b, 0) || 1;

    let html = `<div style="font-family: -apple-system,'PingFang TC',sans-serif; max-width:700px; margin:0 auto; color:#333;">`;
    html += `<h2 style="color:#1e40af; border-bottom:3px solid #1e40af; padding-bottom:8px;">📊 每日綜合日報 ${dateLabel} (${dayName})</h2>`;

    // 1. 今日銷貨
    html += `<h3 style="color:#059669;">💰 今日銷貨：${fmtW(todayTotal)}</h3>`;
    html += `<h3 style="color:#2563eb;">📅 當月累計：${fmtW(monthTotal)}</h3>`;

    // 2. 客戶排名
    html += `<h3>🏆 銷售客戶排行 Top 10</h3>`;
    html += `<table style="width:100%; border-collapse:collapse; font-size:13px; margin-bottom:15px;">`;
    html += `<tr style="background:#1e293b; color:white;"><th style="padding:8px; text-align:left;">排名</th><th style="padding:8px; text-align:left;">客戶</th><th style="padding:8px; text-align:right;">當日</th><th style="padding:8px; text-align:right;">當月</th><th style="padding:8px; text-align:right;">佔比</th></tr>`;
    topCust.forEach(([name, amt], idx) => {
      const mAmt = custMonth[name] || 0;
      const pct = Math.round(amt / custTotal * 100);
      html += `<tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:6px 8px;">${idx+1}</td><td style="padding:6px 8px;">${name}</td><td style="padding:6px 8px; text-align:right;">${fmtW(amt)}</td><td style="padding:6px 8px; text-align:right;">${fmtW(mAmt)}</td><td style="padding:6px 8px; text-align:right;">${pct}%</td></tr>`;
    });
    html += `</table>`;

    // 3. 業務統計
    html += `<h3>👥 業務銷售統計</h3>`;
    html += `<table style="width:100%; border-collapse:collapse; font-size:13px; margin-bottom:15px;">`;
    html += `<tr style="background:#1e293b; color:white;"><th style="padding:8px; text-align:left;">業務</th><th style="padding:8px; text-align:right;">當日</th><th style="padding:8px; text-align:right;">當月</th><th style="padding:8px; text-align:right;">佔比</th></tr>`;
    topSales.forEach(([name, amt]) => {
      const mAmt = salesMonth[name] || 0;
      const pct = Math.round(amt / custTotal * 100);
      html += `<tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:6px 8px;">${name}</td><td style="padding:6px 8px; text-align:right;">${fmtW(amt)}</td><td style="padding:6px 8px; text-align:right;">${fmtW(mAmt)}</td><td style="padding:6px 8px; text-align:right;">${pct}%</td></tr>`;
    });
    html += `</table>`;

    // 4. 系列排行
    html += `<h3>📦 系列銷售 Top 5</h3>`;
    html += `<table style="width:100%; border-collapse:collapse; font-size:13px; margin-bottom:15px;">`;
    html += `<tr style="background:#1e293b; color:white;"><th style="padding:8px; text-align:left;">系列</th><th style="padding:8px; text-align:right;">金額</th></tr>`;
    topSeries.forEach(([name, amt]) => {
      html += `<tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:6px 8px;">${name}</td><td style="padding:6px 8px; text-align:right;">${fmtW(amt)}</td></tr>`;
    });
    html += `</table>`;

    // 5. 尺寸排行
    html += `<h3>📐 尺寸銷售 Top 5</h3>`;
    html += `<table style="width:100%; border-collapse:collapse; font-size:13px; margin-bottom:15px;">`;
    html += `<tr style="background:#1e293b; color:white;"><th style="padding:8px; text-align:left;">尺寸</th><th style="padding:8px; text-align:right;">金額</th></tr>`;
    topSizes.forEach(([name, amt]) => {
      html += `<tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:6px 8px;">${name}</td><td style="padding:6px 8px; text-align:right;">${fmtW(amt)}</td></tr>`;
    });
    html += `</table>`;

    // 6. 查詢不足記錄 (字體放大)
    html += `<hr style="border:1px solid #dc2626; margin:20px 0;">`;
    html += `<h2 style="color:#dc2626; font-size:22px;">🚨 今日缺貨/查無查詢 (客戶記錄)</h2>`;
    if (oosRows.length === 0) {
      html += `<p style="font-size:16px; color:#16a34a;">✅ 今日無客戶缺貨查詢</p>`;
    } else {
      html += `<table style="width:100%; border-collapse:collapse; font-size:16px; margin-bottom:15px; background:#fff5f5;">`;
      html += `<tr style="background:#dc2626; color:white; font-size:16px;"><th style="padding:12px; text-align:left;">客戶</th><th style="padding:12px; text-align:left;">查詢編號</th><th style="padding:12px; text-align:center;">需求片數</th><th style="padding:12px; text-align:center;">結果</th></tr>`;
      oosRows.forEach(it => {
        html += `<tr style="border-bottom:2px solid #fecaca;"><td style="padding:10px 12px; font-weight:bold; font-size:16px;">${it.name || '客戶'}</td><td style="padding:10px 12px; font-weight:bold; font-size:16px;">${it.productCode || '-'}</td><td style="padding:10px 12px; text-align:center; font-size:16px;">${it.reqQty || '-'}</td><td style="padding:10px 12px; text-align:center; color:#dc2626; font-weight:bold; font-size:16px;">${it.status}</td></tr>`;
      });
      html += `</table>`;
    }

    // 7. 查詢充足記錄 (放最下面)
    html += `<hr style="border:1px solid #e2e8f0; margin:15px 0;">`;
    html += `<h3 style="color:#16a34a;">✅ 今日充足查詢記錄</h3>`;
    if (okRows.length === 0) {
      html += `<p>無</p>`;
    } else {
      html += `<table style="width:100%; border-collapse:collapse; font-size:12px;">`;
      html += `<tr style="background:#f2f2f2; font-weight:bold;"><th style="padding:6px 8px;">客戶</th><th style="padding:6px 8px;">品號</th><th style="padding:6px 8px;">狀態</th></tr>`;
      okRows.forEach(it => {
        html += `<tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:4px 8px;">${it.name || '-'}</td><td style="padding:4px 8px;">${it.productCode || '-'}</td><td style="padding:4px 8px; color:#16a34a;">${it.status}</td></tr>`;
      });
      html += `</table>`;
    }

    html += `<p style="font-size:12px; color:#94a3b8; margin-top:20px;">高雅瓷 AI 系統自動發送</p>`;
    html += `</div>`;

    const subject = `📊 每日綜合日報 ${dateLabel} | 銷貨${fmtW(todayTotal)} | 查詢${logRows.length}筆`;
    GmailApp.sendEmail(CONFIG.ADMIN_EMAIL, subject, '', { htmlBody: html, name: '高雅瓷戰情室' });
  } catch(err) {
    console.error("sendDailyQuerySummary 執行失敗：" + err);
  }
}

/** 7. 查詢多維度分析報告產出 (週報與月報)，加入中文系列 */
function runAnalytics(days) {
  const ss = getSpreadsheetInstance();
  const logSheet = ss.getSheetByName(SHEET_NAME.LOG);
  if (!logSheet) return null;
  const lastRow = logSheet.getLastRow();
  if (lastRow <= 1) return null;

  // 讀取價目表中文系列對應
  const priceData = getPriceSheet();
  const pMap = priceData && priceData.length > 0 ? getHeaderMap(priceData) : {};
  const codeSeriesMap = {};
  if (pMap['編號'] !== undefined) {
    for (let i = 1; i < priceData.length; i++) {
      const c = String(priceData[i][pMap['編號']]).toUpperCase().trim();
      if (c) codeSeriesMap[c] = String(priceData[i][pMap['中文系列']] || '').trim();
    }
  }
  
  const data = logSheet.getRange(1, 1, lastRow, 17).getValues();
  const now = new Date();
  const thresholdMs = days * 24 * 60 * 60 * 1000;
  
  const filteredRows = [];
  for (let i = 1; i < data.length; i++) {
    const rowDate = data[i][0];
    if (!rowDate || !(rowDate instanceof Date)) continue;
    if (now - rowDate < thresholdMs) {
      filteredRows.push({
        time: rowDate,
        sid: data[i][1],
        uid: data[i][2],
        name: data[i][3],
        level: data[i][4],
        input: data[i][5],
        note: data[i][6],
        email: data[i][7],
        productCode: String(data[i][8] || "").toUpperCase().trim(),
        reqQty: data[i][9],
        availPcs: data[i][10],
        status: data[i][11],
        size: data[i][12],
        color: data[i][13],
        spec: data[i][14],
        salesName: data[i][16]
      });
    }
  }
  
  if (filteredRows.length === 0) return null;

  const getSeries = (code) => codeSeriesMap[code] || '-';
  
  // 1. Top queried product codes (含中文系列)
  const codeCounts = {};
  filteredRows.forEach(r => {
    if (r.productCode) {
      codeCounts[r.productCode] = (codeCounts[r.productCode] || 0) + 1;
    }
  });
  const topCodes = Object.entries(codeCounts)
    .map(([code, count]) => ({ code, count, series: getSeries(code) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
    
  // 2. Top queried out-of-stock (含中文系列)
  const oosCounts = {};
  filteredRows.forEach(r => {
    if (r.productCode && (r.status === "不足" || r.status === "查無")) {
      oosCounts[r.productCode] = (oosCounts[r.productCode] || 0) + 1;
    }
  });
  const topOOS = Object.entries(oosCounts)
    .map(([code, count]) => ({ code, count, series: getSeries(code) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
    
  // 3. Conversion Analysis (In-stock -> Reserved in 7 days)
  const reserveRows = getReserveSheet();
  const rMap = getHeaderMap(reserveRows);
  const reserveList = [];
  if (reserveRows && reserveRows.length > 1) {
    const codeIdx = rMap['編號'];
    const clientIdx = rMap['客戶'] >= 0 ? rMap['客戶'] : rMap['公司'];
    const dateIdx = rMap['保留日期'] >= 0 ? rMap['保留日期'] : rMap['日期'];
    
    for (let i = 1; i < reserveRows.length; i++) {
      const rDateVal = reserveRows[i][dateIdx];
      let rDate = null;
      if (rDateVal instanceof Date) rDate = rDateVal;
      else if (rDateVal) rDate = new Date(String(rDateVal));
      
      reserveList.push({
        code: String(reserveRows[i][codeIdx] || "").toUpperCase().trim(),
        client: String(reserveRows[i][clientIdx] || "").trim().toLowerCase(),
        date: rDate
      });
    }
  }
  
  let inStockCount = 0;
  let convertedCount = 0;
  
  filteredRows.forEach(r => {
    if (r.productCode && r.status === "充足") {
      inStockCount++;
      const qTime = r.time;
      const clientNameClean = r.name ? r.name.toLowerCase().split('-')[0] : "";
      
      const isConverted = reserveList.some(res => {
        if (!res.date || !res.code.includes(r.productCode)) return false;
        const clientMatch = clientNameClean && (res.client.includes(clientNameClean) || clientNameClean.includes(res.client));
        if (!clientMatch) return false;
        
        const diffDays = (res.date - qTime) / (1000 * 60 * 60 * 24);
        return diffDays >= 0 && diffDays <= 7;
      });
      
      if (isConverted) convertedCount++;
    }
  });
  
  const conversionRate = inStockCount > 0 ? (convertedCount / inStockCount * 100).toFixed(1) : 0;
  
  // 4. Bounce Analysis
  let oosQueryCount = 0;
  let oosFollowedBySearch = 0;
  const sortedRows = [...filteredRows].sort((a, b) => a.time.getTime() - b.time.getTime());
  
  sortedRows.forEach((r, idx) => {
    if (r.productCode && (r.status === "不足" || r.status === "查無")) {
      oosQueryCount++;
      const qTime = r.time;
      const nextSearch = sortedRows.slice(idx + 1).find(nr => {
        if (nr.uid !== r.uid) return false;
        const diffHours = (nr.time - qTime) / (1000 * 60 * 60);
        return diffHours > 0 && diffHours <= 24 && nr.productCode !== r.productCode;
      });
      if (nextSearch) oosFollowedBySearch++;
    }
  });
  
  const bounceRate = oosQueryCount > 0 ? ((1 - (oosFollowedBySearch / oosQueryCount)) * 100).toFixed(1) : 100;
  
  // 5. Size and Color Preferences
  const sizeCounts = {};
  const colorCounts = {};
  
  filteredRows.forEach(r => {
    if (r.size) sizeCounts[r.size] = (sizeCounts[r.size] || 0) + 1;
    if (r.color) {
      const cleanColor = r.color.split('-')[0].trim();
      if (cleanColor) colorCounts[cleanColor] = (colorCounts[cleanColor] || 0) + 1;
    }
  });
  
  const topSizes = Object.entries(sizeCounts)
    .map(([size, count]) => ({ size, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
    
  const topColors = Object.entries(colorCounts)
    .map(([color, count]) => ({ color, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
    
  return {
    totalQueries: filteredRows.length,
    topCodes, topOOS,
    inStockCount, convertedCount, conversionRate,
    oosQueryCount, oosFollowedBySearch, bounceRate,
    topSizes, topColors
  };
}

/** 8. 每週一週報分析 (08:30 執行) */
function sendWeeklyQueryAnalysis() {
  try {
    const today = new Date();
    if (today.getDay() === 0 || today.getDay() === 6 || isTaiwanHoliday()) return;
    const todayStr = Utilities.formatDate(today, "Asia/Taipei", "yyyy/MM/dd");
    const report = runAnalytics(7);

    // 讀取中文系列對應
    const priceData = getPriceSheet();
    const pMap = priceData && priceData.length > 0 ? getHeaderMap(priceData) : {};
    const codeSeriesMap = {}, codeSizeMap = {};
    if (pMap['編號'] !== undefined) {
      for (let i = 1; i < priceData.length; i++) {
        const c = String(priceData[i][pMap['編號']]).toUpperCase().trim();
        if (c) {
          codeSeriesMap[c] = String(priceData[i][pMap['中文系列']] || '').trim();
          codeSizeMap[c] = String(priceData[i][pMap['尺寸(cm)']] || '').trim();
        }
      }
    }

    // ── 週業績統計 ──
    const salesData = getMonthSheet();
    const sH = salesData && salesData.length > 1 ? salesData[0].map(v => String(v).trim()) : [];
    const sMap = {
      date: sH.indexOf('單據日期'), sales: sH.indexOf('負責業務') >= 0 ? sH.indexOf('負責業務') : sH.indexOf('業務'),
      cust: sH.indexOf('客戶名稱') >= 0 ? sH.indexOf('客戶名稱') : sH.indexOf('客戶'),
      amt: sH.indexOf('金額'), code: sH.indexOf('產品編號') >= 0 ? sH.indexOf('產品編號') : sH.indexOf('編號')
    };

    const weekAgo = new Date(today.getTime() - 7 * 86400000);
    let weekTotal = 0;
    const weekCust = {}, weekSales = {}, weekSeries = {}, weekSizes = {};
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    let monthTotal = 0;
    const monthCust = {}, monthSales = {};

    if (salesData && sMap.date >= 0 && sMap.amt >= 0) {
      for (let i = 1; i < salesData.length; i++) {
        const row = salesData[i];
        let d = row[sMap.date];
        if (!(d instanceof Date)) d = parseRocDate(d);
        if (!(d instanceof Date) || isNaN(d.getTime())) continue;
        const amt = parseFloat(row[sMap.amt]) || 0;
        if (amt <= 0) continue;
        const sName = String(row[sMap.sales] || '').trim();
        const cName = String(row[sMap.cust] || '').trim();
        const code = String(row[sMap.code] || '').toUpperCase().trim();
        const series = codeSeriesMap[code] || '其他';
        const size = codeSizeMap[code] || '-';

        if (d >= weekAgo) {
          weekTotal += amt;
          weekCust[cName] = (weekCust[cName] || 0) + amt;
          weekSales[sName] = (weekSales[sName] || 0) + amt;
          if (series) weekSeries[series] = (weekSeries[series] || 0) + amt;
          if (size) weekSizes[size] = (weekSizes[size] || 0) + amt;
        }
        if (d >= monthStart) {
          monthTotal += amt;
          monthCust[cName] = (monthCust[cName] || 0) + amt;
          monthSales[sName] = (monthSales[sName] || 0) + amt;
        }
      }
    }

    const fmtW = (v) => v >= 10000 ? (v/10000).toFixed(1)+'萬' : v >= 1000 ? (v/1000).toFixed(1)+'千' : v+'元';
    const topCustW = Object.entries(weekCust).sort((a,b) => b[1]-a[1]).slice(0,10);
    const topSalesW = Object.entries(weekSales).sort((a,b) => b[1]-a[1]);
    const topSeriesW = Object.entries(weekSeries).sort((a,b) => b[1]-a[1]).slice(0,5);
    const topSizesW = Object.entries(weekSizes).sort((a,b) => b[1]-a[1]).slice(0,5);
    const custTotal = Object.values(weekCust).reduce((a,b) => a+b, 0) || 1;

    const FS = '18px';
    let html = `<div style="font-family: -apple-system,'PingFang TC',sans-serif; max-width:800px; margin:0 auto; color:#1e293b;">`;
    html += `<h2 style="font-size:24px; color:#1e40af; border-bottom:3px solid #1e40af; padding-bottom:8px;">📊 每週綜合報告 (${todayStr})</h2>`;

    // 週業績摘要
    html += `<h3 style="font-size:20px; color:#059669;">💰 本週銷貨：${fmtW(weekTotal)}</h3>`;
    html += `<h3 style="font-size:20px; color:#2563eb;">📅 當月累計：${fmtW(monthTotal)}</h3>`;

    html += `<h3 style="font-size:20px;">🏆 本週客戶排行 Top 10</h3>`;
    html += `<table style="width:100%; border-collapse:collapse; font-size:${FS};"><tr style="background:#1e293b; color:white;"><th style="padding:10px 12px; text-align:left;">客戶</th><th style="padding:10px 12px; text-align:right;">本週</th><th style="padding:10px 12px; text-align:right;">月累計</th><th style="padding:10px 12px; text-align:right;">佔比</th></tr>`;
    topCustW.forEach(([name, amt]) => {
      const m = monthCust[name] || 0;
      html += `<tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:8px 12px; font-weight:bold;">${name}</td><td style="padding:8px 12px; text-align:right;">${fmtW(amt)}</td><td style="padding:8px 12px; text-align:right;">${fmtW(m)}</td><td style="padding:8px 12px; text-align:right;">${Math.round(amt/custTotal*100)}%</td></tr>`;
    });
    html += `</table>`;

    html += `<h3 style="font-size:20px;">👥 業務統計</h3>`;
    html += `<table style="width:100%; border-collapse:collapse; font-size:${FS};"><tr style="background:#1e293b; color:white;"><th style="padding:10px 12px; text-align:left;">業務</th><th style="padding:10px 12px; text-align:right;">本週</th><th style="padding:10px 12px; text-align:right;">月累計</th><th style="padding:10px 12px; text-align:right;">佔比</th></tr>`;
    topSalesW.forEach(([name, amt]) => {
      const m = monthSales[name] || 0;
      html += `<tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:8px 12px; font-weight:bold;">${name}</td><td style="padding:8px 12px; text-align:right;">${fmtW(amt)}</td><td style="padding:8px 12px; text-align:right;">${fmtW(m)}</td><td style="padding:8px 12px; text-align:right;">${Math.round(amt/custTotal*100)}%</td></tr>`;
    });
    html += `</table>`;

    html += `<h3 style="font-size:20px;">📦 系列銷售 Top 5</h3>`;
    html += `<table style="width:100%; border-collapse:collapse; font-size:${FS};"><tr style="background:#1e293b; color:white;"><th style="padding:10px 12px; text-align:left;">系列</th><th style="padding:10px 12px; text-align:right;">金額</th></tr>`;
    topSeriesW.forEach(([name, amt]) => {
      html += `<tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:8px 12px; font-weight:bold;">${name}</td><td style="padding:8px 12px; text-align:right;">${fmtW(amt)}</td></tr>`;
    });
    html += `</table>`;

    html += `<h3 style="font-size:20px;">📐 尺寸銷售 Top 5</h3>`;
    html += `<table style="width:100%; border-collapse:collapse; font-size:${FS};"><tr style="background:#1e293b; color:white;"><th style="padding:10px 12px; text-align:left;">尺寸</th><th style="padding:10px 12px; text-align:right;">金額</th></tr>`;
    topSizesW.forEach(([name, amt]) => {
      html += `<tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:8px 12px; font-weight:bold;">${name}</td><td style="padding:8px 12px; text-align:right;">${fmtW(amt)}</td></tr>`;
    });
    html += `</table>`;

    // 查詢分析
    if (report) {
      html += `<hr style="border:1px solid #1e40af; margin:20px 0;">`;
      html += `<h3 style="font-size:22px; color:#1e40af;">🔍 查詢分析 (7天共 ${report.totalQueries} 筆)</h3>`;

      html += `<h4 style="font-size:20px;">🔥 熱門查詢 Top 10</h4>`;
      html += `<table style="width:100%; border-collapse:collapse; font-size:${FS};"><tr style="background:#f1f5f9; font-weight:bold;"><th style="padding:10px 12px; text-align:left;">品號</th><th style="padding:10px 12px; text-align:left;">系列</th><th style="padding:10px 12px; text-align:center;">次數</th></tr>`;
      report.topCodes.forEach(item => {
        html += `<tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:8px 12px; font-weight:bold;">${item.code}</td><td style="padding:8px 12px;">${item.series}</td><td style="padding:8px 12px; text-align:center;">${item.count}次</td></tr>`;
      });
      html += `</table>`;

      html += `<h4 style="font-size:20px; color:#dc2626; margin-top:15px;">❌ 缺貨查詢 Top 5</h4>`;
      if (report.topOOS.length > 0) {
        html += `<table style="width:100%; border-collapse:collapse; font-size:${FS}; color:#dc2626;"><tr style="background:#fef2f2; font-weight:bold;"><th style="padding:10px 12px; text-align:left;">品號</th><th style="padding:10px 12px; text-align:left;">系列</th><th style="padding:10px 12px; text-align:center;">次數</th></tr>`;
        report.topOOS.forEach(item => {
          html += `<tr style="border-bottom:1px solid #fecaca;"><td style="padding:8px 12px; font-weight:bold;">${item.code}</td><td style="padding:8px 12px;">${item.series}</td><td style="padding:8px 12px; text-align:center; font-weight:bold;">${item.count}次</td></tr>`;
        });
        html += `</table>`;
      } else {
        html += `<p style="color:#16a34a; font-size:18px;">🎉 無缺貨查詢</p>`;
      }

      html += `<p style="font-size:18px; margin-top:12px; font-weight:bold;">📈 轉化率 ${report.conversionRate}% | 流失率 ${report.bounceRate}%</p>`;
    }

    html += `<p style="font-size:14px; color:#94a3b8; margin-top:24px;">高雅瓷 AI 系統自動發送</p>`;
    html += `</div>`;

    GmailApp.sendEmail(CONFIG.ADMIN_EMAIL, `📊 每週綜合報告 ${todayStr} | 銷貨${fmtW(weekTotal)}`, '', { htmlBody: html, name: '高雅瓷戰情室' });
  } catch(err) {
    console.error("sendWeeklyQueryAnalysis 執行失敗：" + err);
  }
}

/** 9. 每月一號月報分析 (09:00 執行) */
function sendMonthlyQueryAnalysis() {
  try {
    const report = runAnalytics(30);
    const todayStr = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy/MM/dd");
    
    if (!report) {
      GmailApp.sendEmail(CONFIG.ADMIN_EMAIL, `📊 庫存查詢月報統計 (${todayStr}) - 無查詢數據`, "過去 30 天內無任何查詢紀錄。");
      return;
    }

    // 月份業績統計
    const today = new Date();
    const salesData = getMonthSheet();
    const sH = salesData && salesData.length > 1 ? salesData[0].map(v => String(v).trim()) : [];
    const sMap = {
      date: sH.indexOf('單據日期'), cust: sH.indexOf('客戶名稱') >= 0 ? sH.indexOf('客戶名稱') : sH.indexOf('客戶'),
      amt: sH.indexOf('金額'), code: sH.indexOf('產品編號') >= 0 ? sH.indexOf('產品編號') : sH.indexOf('編號')
    };
    const priceData = getPriceSheet();
    const pM = priceData && priceData.length > 0 ? getHeaderMap(priceData) : {};
    const codeSeriesMap = {};
    if (pM['編號'] !== undefined) {
      for (let i = 1; i < priceData.length; i++) {
        const c = String(priceData[i][pM['編號']]).toUpperCase().trim();
        if (c) codeSeriesMap[c] = String(priceData[i][pM['中文系列']] || '').trim();
      }
    }

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    let monthTotal = 0;
    const monthSeries = {};
    if (salesData && sMap.date >= 0 && sMap.amt >= 0) {
      for (let i = 1; i < salesData.length; i++) {
        const row = salesData[i];
        let d = row[sMap.date];
        if (!(d instanceof Date)) d = parseRocDate(d);
        if (!(d instanceof Date) || isNaN(d.getTime())) continue;
        if (d < monthStart) continue;
        const amt = parseFloat(row[sMap.amt]) || 0;
        if (amt <= 0) continue;
        monthTotal += amt;
        const code = String(row[sMap.code] || '').toUpperCase().trim();
        const series = codeSeriesMap[code] || '其他';
        if (series) monthSeries[series] = (monthSeries[series] || 0) + amt;
      }
    }
    const fmtW = (v) => v >= 10000 ? (v/10000).toFixed(1)+'萬' : v >= 1000 ? (v/1000).toFixed(1)+'千' : v+'元';
    const topMSeries = Object.entries(monthSeries).sort((a,b) => b[1]-a[1]).slice(0,5);
    
    const FS = '18px';
    let html = `<div style="font-family: -apple-system,'PingFang TC',sans-serif; max-width:800px; margin:0 auto; color:#1e293b;">`;
    html += `<h2 style="font-size:24px; color:#1e40af; border-bottom:3px solid #1e40af; padding-bottom:8px;">📊 月度綜合報告 (${todayStr})</h2>`;
    html += `<h3 style="font-size:20px; color:#059669;">💰 本月累計銷貨：${fmtW(monthTotal)}</h3>`;

    html += `<h3 style="font-size:20px;">📦 系列銷售 Top 5 (中文系列)</h3>`;
    html += `<table style="width:100%; border-collapse:collapse; font-size:${FS};"><tr style="background:#1e293b; color:white;"><th style="padding:10px 12px; text-align:left;">系列</th><th style="padding:10px 12px; text-align:right;">金額</th></tr>`;
    topMSeries.forEach(([name, amt]) => {
      html += `<tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:8px 12px; font-weight:bold;">${name}</td><td style="padding:8px 12px; text-align:right;">${fmtW(amt)}</td></tr>`;
    });
    html += `</table>`;

    // 查詢分析
    html += `<hr style="border:1px solid #1e40af; margin:20px 0;">`;
    html += `<h3 style="font-size:22px; color:#1e40af;">🔍 查詢分析 (30天共 ${report.totalQueries} 筆)</h3>`;
    html += `<h4 style="font-size:20px;">🔥 熱門查詢 Top 10</h4>`;
    html += `<table style="width:100%; border-collapse:collapse; font-size:${FS};"><tr style="background:#f1f5f9; font-weight:bold;"><th style="padding:10px 12px; text-align:left;">品號</th><th style="padding:10px 12px; text-align:left;">系列</th><th style="padding:10px 12px; text-align:center;">次數</th></tr>`;
    report.topCodes.forEach(item => {
      html += `<tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:8px 12px; font-weight:bold;">${item.code}</td><td style="padding:8px 12px;">${item.series}</td><td style="padding:8px 12px; text-align:center;">${item.count}次</td></tr>`;
    });
    html += `</table>`;

    html += `<h4 style="font-size:20px; color:#dc2626; margin-top:15px;">❌ 缺貨查詢 Top 5</h4>`;
    if (report.topOOS.length > 0) {
      html += `<table style="width:100%; border-collapse:collapse; font-size:${FS}; color:#dc2626;"><tr style="background:#fef2f2; font-weight:bold;"><th style="padding:10px 12px; text-align:left;">品號</th><th style="padding:10px 12px; text-align:left;">系列</th><th style="padding:10px 12px; text-align:center;">次數</th></tr>`;
      report.topOOS.forEach(item => {
        html += `<tr style="border-bottom:1px solid #fecaca;"><td style="padding:8px 12px; font-weight:bold;">${item.code}</td><td style="padding:8px 12px;">${item.series}</td><td style="padding:8px 12px; text-align:center; font-weight:bold;">${item.count}次</td></tr>`;
      });
      html += `</table>`;
    } else {
      html += `<p style="color:#16a34a; font-size:18px;">🎉 無缺貨查詢</p>`;
    }
    html += `<p style="font-size:18px; margin-top:12px; font-weight:bold;">📈 轉化率 ${report.conversionRate}% | 流失率 ${report.bounceRate}%</p>`;

    html += `<p style="font-size:14px; color:#94a3b8; margin-top:24px;">高雅瓷 AI 系統自動發送</p>`;
    html += `</div>`;
    
    GmailApp.sendEmail(CONFIG.ADMIN_EMAIL, `📊 月度綜合報告 ${todayStr} | 銷貨${fmtW(monthTotal)}`, '', { htmlBody: html, name: '高雅瓷戰情室' });
  } catch(err) {
    console.error("sendMonthlyQueryAnalysis 執行失敗：" + err);
  }
}

// ============================================================
// 9. 大老闆每日彙整報表：三家並列比較
// ============================================================
const BRANCH_SS = {
  '高雅瓷': { id: CONFIG.DATA_SS_ID, priceSheet: '編號價目表', salesSheet: '經銷銷售報表' },
  '安帝嘉': { id: '16QNID9hLs2K1iy_ePo7MxYxhW4kpDrDlfEIZ2p83ixo', priceSheet: '編號價目表', salesSheet: '經銷銷售報表' },
  '喜悅納': { id: '1uFKKWBfulg-GmCbJsSomimT5LW5r0N2w28rubrPveTA', priceSheet: '編號價目表', salesSheet: '經銷銷售報表' },
};

function getBranchPriceMap(ssId, sheetName) {
  const pm = {};
  try {
    const ss = SpreadsheetApp.openById(ssId);
    const sh = ss.getSheetByName(sheetName);
    if (!sh || sh.getLastRow() < 2) return pm;
    const rows = sh.getDataRange().getValues();
    const h = rows[0].map(v => String(v).trim());
    const idxCode = h.indexOf('編號');
    const idxSeries = h.indexOf('中文系列');
    if (idxCode < 0 || idxSeries < 0) return pm;
    for (let i = 1; i < rows.length; i++) {
      const code = String(rows[i][idxCode] || '').toUpperCase().trim();
      if (code) pm[code] = String(rows[i][idxSeries] || '其他').trim();
    }
  } catch (e) { console.error(`讀取價目表失敗 (${ssId}): ${e}`); }
  return pm;
}

function getBranchDaySales(ssId, salesSheet, priceMap) {
  const today = new Date();
  const todayStart = new Date(today); todayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const result = { todayTotal: 0, monthTotal: 0, custToday: {}, custMonth: {}, salesToday: {}, seriesMonth: {} };
  try {
    const ss = SpreadsheetApp.openById(ssId);
    const sh = ss.getSheetByName(salesSheet);
    if (!sh || sh.getLastRow() < 2) return result;
    const rows = sh.getDataRange().getValues();
    const h = rows[0].map(v => String(v).trim());
    const sMap = {
      date: h.indexOf('單據日期'), sales: h.indexOf('負責業務') >= 0 ? h.indexOf('負責業務') : h.indexOf('業務'),
      cust: h.indexOf('客戶名稱') >= 0 ? h.indexOf('客戶名稱') : h.indexOf('客戶'),
      amt: h.indexOf('金額'), code: h.indexOf('產品編號') >= 0 ? h.indexOf('產品編號') : h.indexOf('編號'),
    };
    if (sMap.date < 0 || sMap.amt < 0) return result;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      let d = row[sMap.date];
      if (d instanceof Date) {} else if (typeof d === 'string' || typeof d === 'number') { d = parseRocDate(d); }
      if (!(d instanceof Date) || isNaN(d.getTime())) continue;
      const amt = parseFloat(row[sMap.amt]) || 0;
      if (amt <= 0) continue;
      const sName = String(row[sMap.sales] || '').trim();
      const cName = String(row[sMap.cust] || '').trim();
      const code = String(row[sMap.code] || '').toUpperCase().trim();
      const series = (priceMap && priceMap[code]) || '其他';
      if (d >= todayStart) {
        result.todayTotal += amt;
        result.custToday[cName] = (result.custToday[cName] || 0) + amt;
        result.salesToday[sName] = (result.salesToday[sName] || 0) + amt;
      }
      if (d >= monthStart) {
        result.monthTotal += amt;
        result.custMonth[cName] = (result.custMonth[cName] || 0) + amt;
        result.seriesMonth[series] = (result.seriesMonth[series] || 0) + amt;
      }
    }
  } catch (e) { console.error(`讀取銷售資料失敗 (${ssId}): ${e}`); }
  return result;
}

function sendBossDailyReport() {
  try {
    const today = new Date();
    const dateLabel = Utilities.formatDate(today, "Asia/Taipei", "M/d (") + ['日','一','二','三','四','五','六'][today.getDay()] + ')';
    const fmtW = (v) => v >= 10000 ? (v/10000).toFixed(1)+'萬' : v >= 1000 ? (v/1000).toFixed(1)+'千' : v+'元';

    const companies = ['高雅瓷', '安帝嘉', '喜悅納'];
    const colorMap = { '高雅瓷': '#2563eb', '安帝嘉': '#dc2626', '喜悅納': '#7c3aed' };
    const results = {};

    for (const name of companies) {
      const cfg = BRANCH_SS[name];
      const priceMap = getBranchPriceMap(cfg.id, cfg.priceSheet);
      results[name] = getBranchDaySales(cfg.id, cfg.salesSheet, priceMap);
    }

    // ── 今日總和 ──
    const grandToday = companies.reduce((s, n) => s + results[n].todayTotal, 0);
    const grandMonth = companies.reduce((s, n) => s + results[n].monthTotal, 0);

    // ── 合併客戶排行 ──
    const allCust = {};
    companies.forEach(n => {
      Object.entries(results[n].custToday).forEach(([c, a]) => {
        allCust[c + ' (' + n + ')'] = a;
      });
    });
    const topCust = Object.entries(allCust).sort((a, b) => b[1] - a[1]).slice(0, 10);

    // ── 合併業務排行 ──
    const allSales = {};
    companies.forEach(n => {
      Object.entries(results[n].salesToday).forEach(([s, a]) => {
        allSales[s + ' (' + n + ')'] = a;
      });
    });
    const topSales = Object.entries(allSales).sort((a, b) => b[1] - a[1]).slice(0, 10);

    // ── 合併系列排行 ──
    const allSeries = {};
    companies.forEach(n => {
      Object.entries(results[n].seriesMonth).forEach(([s, a]) => {
        allSeries[s + ' (' + n + ')'] = a;
      });
    });
    const topSeries = Object.entries(allSeries).sort((a, b) => b[1] - a[1]).slice(0, 10);

    // ── 組 HTML ──
    const cardStyle = (color) => `flex:1; background:white; border-radius:12px; padding:18px; text-align:center; border-top:4px solid ${color}; box-shadow:0 2px 8px rgba(0,0,0,0.05);`;

    let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,'PingFang TC',sans-serif;">
    <div style="max-width:680px;margin:30px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
      <div style="background:linear-gradient(135deg,#1e293b 0%,#334155 100%);padding:35px;text-align:center;">
        <div style="font-size:32px;margin-bottom:8px;">&#128202;</div>
        <h1 style="margin:0;color:white;font-size:22px;font-weight:900;">三家每日業績總覽</h1>
        <p style="margin:6px 0 0;color:rgba(255,255,255,0.7);font-size:14px;">${dateLabel} | 總銷貨 ${fmtW(grandToday)}</p>
      </div>
      <div style="display:flex;padding:25px;gap:12px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">`;

    companies.forEach(name => {
      const r = results[name];
      const c = colorMap[name];
      html += `<div style="${cardStyle(c)}">
        <div style="font-size:15px;font-weight:900;color:${c};margin-bottom:10px;">${name}</div>
        <div style="font-size:11px;color:#64748b;font-weight:700;">&#127942; 今日</div>
        <div style="font-size:22px;font-weight:900;color:#1e293b;margin:4px 0 12px;">${fmtW(r.todayTotal)}</div>
        <div style="font-size:11px;color:#64748b;font-weight:700;">&#128176; 當月</div>
        <div style="font-size:22px;font-weight:900;color:#059669;">${fmtW(r.monthTotal)}</div>
      </div>`;
    });

    html += `</div><div style="padding:25px;">

      <h2 style="margin:0 0 15px;font-size:16px;color:#1e293b;border-left:4px solid #2563eb;padding-left:12px;">&#127942; 今日客戶排行 Top 10</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="background:#1e293b;color:white;"><th style="padding:10px 15px;text-align:left;">排名</th><th style="padding:10px 15px;text-align:left;">客戶</th><th style="padding:10px 15px;text-align:right;">當日</th><th style="padding:10px 15px;text-align:right;">佔比</th></tr></thead>
        <tbody>${topCust.map(([name, amt], idx) => {
          const pct = Math.round(amt / grandToday * 100);
          const [cName, comp] = name.split(' (');
          return `<tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:8px 15px;">${idx+1}</td><td style="padding:8px 15px;">${cName} <span style="font-size:11px;color:${colorMap[comp?.replace(')','')] || '#94a3b8'};font-weight:700;">${comp?.replace(')','')}</span></td><td style="padding:8px 15px;text-align:right;font-weight:700;">${fmtW(amt)}</td><td style="padding:8px 15px;text-align:right;">${pct}%</td></tr>`;
        }).join('')}</tbody>
      </table>

      <h2 style="margin:20px 0 15px;font-size:16px;color:#1e293b;border-left:4px solid #7c3aed;padding-left:12px;">&#128101; 今日業務排行</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="background:#1e293b;color:white;"><th style="padding:10px 15px;text-align:left;">排名</th><th style="padding:10px 15px;text-align:left;">業務</th><th style="padding:10px 15px;text-align:right;">當日</th><th style="padding:10px 15px;text-align:right;">佔比</th></tr></thead>
        <tbody>${topSales.map(([name, amt], idx) => {
          const pct = Math.round(amt / grandToday * 100);
          const [sName, comp] = name.split(' (');
          return `<tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:8px 15px;">${idx+1}</td><td style="padding:8px 15px;">${sName} <span style="font-size:11px;color:${colorMap[comp?.replace(')','')] || '#94a3b8'};font-weight:700;">${comp?.replace(')','')}</span></td><td style="padding:8px 15px;text-align:right;font-weight:700;">${fmtW(amt)}</td><td style="padding:8px 15px;text-align:right;">${pct}%</td></tr>`;
        }).join('')}</tbody>
      </table>

      <h2 style="margin:20px 0 15px;font-size:16px;color:#1e293b;border-left:4px solid #059669;padding-left:12px;">&#128230; 系列銷售排行 (當月)</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="background:#1e293b;color:white;"><th style="padding:10px 15px;text-align:left;">排名</th><th style="padding:10px 15px;text-align:left;">系列</th><th style="padding:10px 15px;text-align:right;">當月</th><th style="padding:10px 15px;text-align:right;">佔比</th></tr></thead>
        <tbody>${topSeries.map(([name, amt], idx) => {
          const pct = Math.round(amt / grandMonth * 100);
          const [serName, comp] = name.split(' (');
          return `<tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:8px 15px;">${idx+1}</td><td style="padding:8px 15px;">${serName} <span style="font-size:11px;color:${colorMap[comp?.replace(')','')] || '#94a3b8'};font-weight:700;">${comp?.replace(')','')}</span></td><td style="padding:8px 15px;text-align:right;font-weight:700;">${fmtW(amt)}</td><td style="padding:8px 15px;text-align:right;">${pct}%</td></tr>`;
        }).join('')}</tbody>
      </table>

      <div style="margin-top:25px;padding:20px;background:#f8fafc;border-radius:12px;display:flex;gap:12px;text-align:center;">
        ${companies.map(name => {
          const r = results[name];
          const c = colorMap[name];
          return `<div style="flex:1;padding:12px;background:white;border-radius:8px;border:1px solid #e2e8f0;">
            <div style="font-size:13px;font-weight:700;color:${c};margin-bottom:6px;">${name}</div>
            <div style="font-size:11px;color:#64748b;">今日 ${fmtW(r.todayTotal)}</div>
            <div style="font-size:11px;color:#64748b;">當月 ${fmtW(r.monthTotal)}</div>
          </div>`;
        }).join('')}
      </div>

      <p style="font-size:12px;color:#94a3b8;margin-top:20px;text-align:center;">Titan System 自動發送</p>
    </div></body></html>`;

    GmailApp.sendEmail('titankou2002@gmail.com', `📊 三家每日業績總覽 ${dateLabel} | 合計 ${fmtW(grandToday)}`, '', { htmlBody: html, name: 'Titan戰情室' });
  } catch (err) {
    console.error("sendBossDailyReport 執行失敗：" + err);
  }
}

/** 8. 註冊排程觸發器 */
function registerAnalysisTriggers() {
  const handlerFuncs = [
    'sendDailyQueryLog',         // 改版：排除業務查詢、字體放大、欄位精簡
    'sendWeeklyQueryAnalysis',
    'sendMonthlyQueryAnalysis',
    'sendProductStockAlerts',
    'dailyPerformanceAutoPush'
  ];
  // 舊版函式名：一併刪除殘留觸發器，避免孤兒觸發器造成重複寄信
  const legacyFuncs = [
    'sendDailyQuerySummary',
    'sendBossDailyReport'
  ];
  
  ScriptApp.getProjectTriggers().forEach(t => {
    if (handlerFuncs.includes(t.getHandlerFunction()) || legacyFuncs.includes(t.getHandlerFunction())) {
      ScriptApp.deleteTrigger(t);
    }
  });
  
  ScriptApp.newTrigger('sendDailyQueryLog')
    .timeBased()
    .atHour(18)
    .nearMinute(30)
    .everyDays(1)
    .create();
    
  ScriptApp.newTrigger('sendWeeklyQueryAnalysis')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(8)
    .nearMinute(30)
    .create();
    
  ScriptApp.newTrigger('sendMonthlyQueryAnalysis')
    .timeBased()
    .onMonthDay(1)
    .atHour(9)
    .nearMinute(0)
    .create();

  // 每週六早上檢查庫存警示
  ScriptApp.newTrigger('sendProductStockAlerts')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SATURDAY)
    .atHour(8)
    .nearMinute(0)
    .create();

  // 每日 18:00 業績戰報（推 Telegram，平日/假日判斷寫在函式內部）
  ScriptApp.newTrigger('dailyPerformanceAutoPush')
    .timeBased()
    .atHour(18)
    .nearMinute(0)
    .everyDays(1)
    .create();
}


/**
 * 🔹 每日查詢日報 v2（18:25 觸發）
 * 改版：① 只顯示客戶查詢（排除業務自查）
 *       ② 字體放大 20px
 *       ③ 移除「負責業務」欄
 *       ④ 移除「等級」（客戶名稱直接顯示）
 *       ⑤ 移除「品號」與「規格」欄
 *       最終欄位：時間 | 客戶名稱 | 查詢內容 | 狀態
 */
function sendDailyQueryLog() {
  try {
    const today = new Date();
    if (today.getDay() === 0 || today.getDay() === 6) return; // 週末不寄
    const todayStr = Utilities.formatDate(today, 'Asia/Taipei', 'yyyy/MM/dd');
    const dateLabel = Utilities.formatDate(today, 'Asia/Taipei', 'yyyy/MM/dd');

    const ss = getSpreadsheetInstance();
    const logSheet = ss.getSheetByName(SHEET_NAME.LOG);
    if (!logSheet) return;
    const lastRow = logSheet.getLastRow();
    if (lastRow <= 1) return;

    const data = logSheet.getRange(1, 1, lastRow, 17).getValues();

    // 排除業務/管理員帳號
    const SKIP_LEVELS = new Set(['sales', 'king', 'queen', 'admin', 'premium', 'staff']);
    const rows = [];

    for (let i = 1; i < data.length; i++) {
      const rowDate = data[i][0];
      if (!rowDate) continue;
      const rowDateStr = rowDate instanceof Date
        ? Utilities.formatDate(rowDate, 'Asia/Taipei', 'yyyy/MM/dd')
        : String(rowDate).substring(0, 10);
      if (rowDateStr !== todayStr) continue;

      const level = String(data[i][4] || '').trim().toLowerCase();
      if (SKIP_LEVELS.has(level)) continue;

      const timeStr = rowDate instanceof Date
        ? Utilities.formatDate(rowDate, 'Asia/Taipei', 'HH:mm:ss')
        : String(rowDate).substring(11, 19);

      rows.push({
        time:   timeStr,
        name:   String(data[i][3] || '-').trim(),
        input:  String(data[i][5] || '-').trim(),
        status: String(data[i][11] || '-').trim()
      });
    }

    rows.sort((a, b) => a.time.localeCompare(b.time));

    const FS = '20px';
    const statusColor = s =>
      (s === '不足' || s === '查無') ? '#dc2626' :
       s === '充足'                   ? '#16a34a' : '#374151';

    let html = `<div style="font-family:-apple-system,'PingFang TC',sans-serif;max-width:800px;margin:0 auto;color:#1e293b;">`;
    html += `<h2 style="font-size:24px;color:#1e40af;border-bottom:3px solid #1e40af;padding-bottom:8px;">🔹 今日客戶查詢日報 (${dateLabel})</h2>`;
    html += `<p style="font-size:${FS};color:#475569;">今日共有 <strong>${rows.length}</strong> 筆客戶查詢，明細如下：</p>`;

    if (rows.length === 0) {
      html += `<p style="font-size:${FS};color:#16a34a;">✅ 今日無客戶查詢紀錄</p>`;
    } else {
      html += `<table style="width:100%;border-collapse:collapse;font-size:${FS};">`;
      html += `<tr style="background:#1e293b;color:white;">
        <th style="padding:12px 14px;text-align:left;white-space:nowrap;">時間</th>
        <th style="padding:12px 14px;text-align:left;">客戶名稱</th>
        <th style="padding:12px 14px;text-align:left;">查詢內容</th>
        <th style="padding:12px 14px;text-align:center;">狀態</th>
      </tr>`;
      rows.forEach((r, idx) => {
        const bg = idx % 2 === 0 ? '#f8fafc' : '#ffffff';
        html += `<tr style="background:${bg};border-bottom:1px solid #e2e8f0;">
          <td style="padding:10px 14px;white-space:nowrap;font-size:18px;color:#64748b;">${r.time}</td>
          <td style="padding:10px 14px;font-weight:bold;">${r.name}</td>
          <td style="padding:10px 14px;">${r.input}</td>
          <td style="padding:10px 14px;text-align:center;font-weight:bold;color:${statusColor(r.status)};">${r.status}</td>
        </tr>`;
      });
      html += `</table>`;
    }

    html += `<p style="font-size:14px;color:#94a3b8;margin-top:24px;">高雅瓷 AI 系統自動發送</p></div>`;

    const subject = `🔹 今日查詢日報 (${dateLabel}) - 共 ${rows.length} 筆`;
    GmailApp.sendEmail(CONFIG.ADMIN_EMAIL, subject, '', { htmlBody: html, name: '高雅瓷戰情室' });

  } catch (err) {
    console.error('sendDailyQueryLog 失敗：' + err);
  }
}

/**
 * 🧪 測試專用：一鍵測試寄出所有排程信件
 * 可在 GAS 介面直接選取此函數點擊「▶ 執行」
 */
function testSendAllNotifications() {
  console.log("🚀 開始測試發送所有排程 Email 通知...");
  
  try {
    console.log("1/5 發送 [今日客戶查詢日報 (新版)]...");
    sendDailyQueryLog();
  } catch(e) { console.error("sendDailyQueryLog 測試失敗: " + e); }

  try {
    console.log("2/5 發送 [查詢多維度分析週報]...");
    sendWeeklyQueryAnalysis();
  } catch(e) { console.error("sendWeeklyQueryAnalysis 測試失敗: " + e); }

  try {
    console.log("3/5 發送 [查詢多維度分析月報]...");
    sendMonthlyQueryAnalysis();
  } catch(e) { console.error("sendMonthlyQueryAnalysis 測試失敗: " + e); }

  try {
    console.log("4/5 發送 [產品庫存與保留警示]...");
    sendProductStockAlerts();
  } catch(e) { console.error("sendProductStockAlerts 測試失敗: " + e); }

  console.log("🎉 所有排程 Email 測試完成！請至您的 Gmail 信箱查看測試結果。");
}


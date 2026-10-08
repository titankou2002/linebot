/**
 * 高雅瓷 AI 智能客服 - 2026 業績戰略引擎 (v1.7 - 群組省錢版)
 * 檔案：7_Performance.gs
 */

const PERFORMANCE_GROUP_ID = "C5b96fce67bba1f2722008256de301cfd";

const PERFORMANCE_TARGET = {
  SLEEP_ANNUAL: 3000000, 
  TOTAL_ANNUAL: 60000000 
};

function getStrategicPerformance(targetSalesName) {
  const salesRows = getMonthSheet(); 
  if (!salesRows || salesRows.length < 2) return "⚠️ 報表讀取失敗";

  const headers = salesRows[0];
  const map = {
    date: findHeaderIndex(headers, ['單據日期', '日期']),
    type: findHeaderIndex(headers, ['類別']),
    sales: findHeaderIndex(headers, ['負責業務', '業務']),
    cust: findHeaderIndex(headers, ['客戶名稱', '客戶']),
    amt: findHeaderIndex(headers, ['金額']),
    code: findHeaderIndex(headers, ['產品編號', '編號'])
  };

  let lastDate = null;
  for (let i = salesRows.length - 1; i >= 1; i--) {
    const d = parseRocDate(salesRows[i][map.date]);
    if (d && parseFloat(salesRows[i][map.amt]) !== 0) { lastDate = d; break; }
  }
  if (!lastDate) return "⚠️ 查無業績數據";

  const tY = lastDate.getFullYear(), tM = lastDate.getMonth();
  const tTs = lastDate.getTime();

  const salesList = ['謝博皓', '潘右森', '陳勁多'];
  const data = {
    todayTotal: 0, monthTotal: 0, yearTotal: 0,
    todaySleep: 0, monthSleep: 0, yearSleep: 0,
    salesData: {}, 
    shipments: []  
  };
  
  salesList.forEach(n => data.salesData[n] = { today: 0, month: 0, year: 0 });

  const custMtd = {};
  const shipMap = {}; 
  
  const sleepSet = new Set();
  const sleepRows = _getSheetRowsByName('睡美人', 'sleepRows');
  if (sleepRows.length > 1) {
    for(let j=1; j<sleepRows.length; j++) { sleepSet.add(String(sleepRows[j][0]).trim().toUpperCase()); }
  }

  for (let i = 1; i < salesRows.length; i++) {
    const row = salesRows[i];
    const date = parseRocDate(row[map.date]);
    if (!date) continue;

    const rowTs = date.getTime();
    const rowY = date.getFullYear(), rowM = date.getMonth();
    const amt = parseFloat(row[map.amt]) || 0;
    const type = String(row[map.type] || "");
    const code = String(row[map.code] || "").toUpperCase().replace(/[\s\-]/g, '');
    let sName = String(row[map.sales] || "").trim();
    const cName = mergeCustomer(row[map.cust]);
    const isSleep = sleepSet.has(code);

    if (sName.includes('陳育瑋')) sName = '陳勁多';

    if (rowY === tY && rowTs <= tTs) {
      data.yearTotal += amt;
      if (isSleep) data.yearSleep += amt;
      if (salesList.includes(sName)) data.salesData[sName].year += amt;
    }

    if (rowY === tY && rowM === tM && rowTs <= tTs) {
      data.monthTotal += amt;
      if (isSleep) data.monthSleep += amt;
      if (salesList.includes(sName)) data.salesData[sName].month += amt;
      custMtd[cName] = (custMtd[cName] || 0) + amt;
    }

    if (rowTs === tTs && !type.includes('退') && amt > 0) {
      data.todayTotal += amt;
      if (isSleep) data.todaySleep += amt;
      if (salesList.includes(sName)) data.salesData[sName].today += amt;
      shipMap[cName] = (shipMap[cName] || 0) + amt;
    }
  }

  Object.keys(shipMap).forEach(c => {
    const mtd = custMtd[c] || 0;
    data.shipments.push({
      cust: c,
      today: shipMap[c],
      month: mtd,
      lamp: (mtd >= 200000 ? '🔴' : (mtd >= 100000 ? '🟠' : '🟢'))
    });
  });
  data.shipments.sort((a, b) => b.today - a.today);

  return assembleReportText(lastDate, data, targetSalesName);
}

function assembleReportText(date, data, targetSales) {
  const rocDate = (date.getFullYear() - 1911) + "/" + (date.getMonth() + 1).toString().padStart(2,'0') + "/" + date.getDate().toString().padStart(2,'0');
  
  let res = targetSales ? `📊 業績戰術簡報 (${rocDate})\n` : `📊 今日業績統計 (${rocDate})\n`;
  
  if (!targetSales) {
    ['謝博皓', '潘右森', '陳勁多'].forEach(name => {
      const s = data.salesData[name];
      res += `👱${name}：${toW(s.today)}/${toW(s.month)}\n`;
    });
  } else {
    const s = data.salesData[targetSales] || { today: 0, month: 0, year: 0 };
    res += `👱 業務：${targetSales}\n`;
    res += `💰 本月：${toW(s.month)}\n`;
    res += `💰 年度：${toW(s.year)}(累計)\n`; 
    return res.trim();
  }

  res += `\n今日出貨\n`;
  data.shipments.forEach(s => {
    res += `${s.lamp} ${s.cust} (${toW(s.today, true)}/月${toW(s.month)})\n`;
  });

  const sleepAchieve = Math.round((data.yearSleep / PERFORMANCE_TARGET.SLEEP_ANNUAL) * 100);
  res += `\n✅ 睡美人：${toW(data.todaySleep)}/月${toW(data.monthSleep)}\n`;
  res += `✅ 年度：${toW(data.yearSleep)}/${sleepAchieve}%\n`;

  const totalAchieve = Math.round((data.yearTotal / PERFORMANCE_TARGET.TOTAL_ANNUAL) * 100);
  res += `\n🏆 今日：${toW(data.todayTotal)}\n`;
  res += `💰 本月：${toW(data.monthTotal)}\n`;
  res += `💰 今年：${toW(data.yearTotal)}\n`;
  res += `💰 達成：${totalAchieve}%`;

  return res.trim();
}

/** 🚩 [v24.2] 睡美人專屬業績戰報 */
function handleSleepBeautyPerformance() {
  const salesRows = getMonthSheet();
  if (!salesRows || salesRows.length < 2) return "⚠️ 報表讀取失敗";
  
  const headers = salesRows[0];
  const map = {
    date: findHeaderIndex(headers, ['單據日期', '日期']),
    amt: findHeaderIndex(headers, ['金額']),
    code: findHeaderIndex(headers, ['產品編號', '編號'])
  };

  const sleepSet = new Set();
  const sleepRows = _getSheetRowsByName('睡美人', 'sleepRows');
  if (sleepRows.length > 1) {
    for(let j=1; j<sleepRows.length; j++) { sleepSet.add(String(sleepRows[j][0]).trim().toUpperCase()); }
  }

  let lastDate = null;
  for (let i = salesRows.length - 1; i >= 1; i--) {
    const d = parseRocDate(salesRows[i][map.date]);
    if (d && parseFloat(salesRows[i][map.amt]) !== 0) { lastDate = d; break; }
  }
  if (!lastDate) return "⚠️ 查無數據";

  const tY = lastDate.getFullYear(), tM = lastDate.getMonth();
  const tTs = lastDate.getTime();
  
  let today = 0, month = 0, year = 0;

  for (let i = 1; i < salesRows.length; i++) {
    const row = salesRows[i];
    const date = parseRocDate(row[map.date]);
    if (!date) continue;

    const code = String(row[map.code] || "").toUpperCase().replace(/[\s\-]/g, '');
    if (!sleepSet.has(code)) continue;

    const amt = parseFloat(row[map.amt]) || 0;
    const rowTs = date.getTime();
    const rowY = date.getFullYear(), rowM = date.getMonth();

    if (rowY === tY && rowTs <= tTs) year += amt;
    if (rowY === tY && rowM === tM && rowTs <= tTs) month += amt;
    if (rowTs === tTs) today += amt;
  }

  const achieve = Math.round((year / PERFORMANCE_TARGET.SLEEP_ANNUAL) * 100);
  const rocDate = (lastDate.getFullYear() - 1911) + "/" + (lastDate.getMonth() + 1).toString().padStart(2,'0') + "/" + lastDate.getDate().toString().padStart(2,'0');

  return `💎 睡美人精品業績 (${rocDate})\n` +
         `───────\n` +
         `💰 今日：${toW(today)}\n` +
         `💰 本月：${toW(month)}\n` +
         `💰 今年：${toW(year)}\n` +
         `🎯 達成：${achieve}% (目標${Math.round(PERFORMANCE_TARGET.SLEEP_ANNUAL/10000)}萬)`;
}

function toW(amt, showK) {
  const absAmt = Math.abs(amt);
  if (absAmt >= 10000) return Math.round(amt / 10000) + "萬";
  if (absAmt >= 1000) return (amt / 1000).toFixed(1) + "千";
  return amt + "元";
}

function findHeaderIndex(headers, candidates) {
  for (let cand of candidates) {
    const idx = headers.findIndex(h => String(h).includes(cand));
    if (idx !== -1) return idx;
  }
  return -1;
}

function dailyPerformanceAutoPush() {
  const now = new Date();
  const dow = now.getDay(); 
  
  if (dow === 0 || dow === 6) {
    console.log("今日為週末，取消自動業績推播。");
    return;
  }

  if (typeof isTaiwanHoliday === 'function' && isTaiwanHoliday()) {
    console.log("今日為假日，不發送業績報表。");
    return;
  }

  const report = getStrategicPerformance(null); 
  
  if (!report.startsWith("⚠️")) {
    pushTelegram(report);
    console.log("每日業績戰報已送出至 Telegram 群組！");
  } else {
    console.log("業績報表生成失敗，取消推播。");
  }
}

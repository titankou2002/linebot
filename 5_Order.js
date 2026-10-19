/**
 * 高雅瓷 AI 智能客服 - 2026 保留管理引擎 (v30.1 - 精準缺貨標註版)
 * 檔案：5_Order.gs
 * 🚩 【最高開發原則】：
 * 1. 個別標註：單品可用量不足時，主動標記「(不足)」，確保 LINE 圖卡紅綠辨識正確。
 * 2. 格式同步：(保留暫存) 欄位 A-I 完全比照「雲端保留」排列，同步變色巡檢。
 * 3. 流量戰術：核准後無聲處理，由小姐人工標註回覆。
 * 4. 嚴禁縮寫：全量輸出。 [cite: 2026-01-29]
 */

/** 1. 產生保留單 LIFF 按鈕卡片 */
function handleTemplateRequest(q, auth, priceData, priceMap) {
  const cmdMatch = q.match(/下保留\s*([a-zA-Z0-9-]*)\s*(\d+(?:\.\d+)?\s*(?:坪|p|片|箱|包)?)?/i);
  const code = cmdMatch ? (cmdMatch[1] || '').toUpperCase() : '';
  const qty  = cmdMatch ? (cmdMatch[2] || '').replace(/\s/g, '') : '';

  // 組 LIFF URL，帶入已知的品號和數量與防快取參數
  const params = new URLSearchParams_GAS();
  if (code) params.set('code', code);
  if (qty)  params.set('qty',  qty.replace(/[^0-9.]/g, ''));
  params.set('v', String(Math.floor(Date.now() / 60000)));
  const qs      = params.toString() ? '?' + params.toString() : '';
  const liffUrl = `https://liff.line.me/${CONFIG.LIFF_ID_RESERVE}${qs}`;

  const authName = String(auth.name || '');
  const company  = auth.company || authName.split('-')[0] || '高雅瓷';
  const userRealName = authName.includes('-') ? authName.split('-')[1] : authName;
  const displayTitle = (userRealName && userRealName !== company) ? `${company} ${userRealName}` : company;

  // 根據台北時間取得問候語與隨機心情短語
  const taipeiHour = parseInt(Utilities.formatDate(new Date(), "Asia/Taipei", "H"));
  let timeGreeting = "您好！😊";
  if (taipeiHour >= 5 && taipeiHour < 12) timeGreeting = "早安！☀️";
  else if (taipeiHour >= 12 && taipeiHour < 18) timeGreeting = "午安！☕";
  else timeGreeting = "晚安！🌙";

  const randomGreetings = [
    "今天也是活力滿滿的一天！✨",
    "祝您接單順利，一切順心！🤝",
    "辛苦了，忙碌之餘也記得喝杯水喔！💧",
    "祝您今天順利滿滿！🌟"
  ];
  const randomQuote = randomGreetings[Math.floor(Math.random() * randomGreetings.length)];
  const displayGreeting = `${timeGreeting}\n${randomQuote}\n\n感謝你使用線上保留系統，\n請點擊下方按鈕進行保留。`;

  const flex = {
    type: 'bubble',
    size: 'kilo',
    header: {
      type: 'box', layout: 'vertical',
      backgroundColor: '#000000', paddingAll: '18px',
      contents: [
        { type: 'text', text: '線上保留申請', weight: 'bold', size: 'lg', color: '#ffffff' },
        { type: 'text', text: displayTitle, size: 'sm', color: '#a8a8a8', margin: 'xs', weight: 'bold' }
      ]
    },
    body: {
      type: 'box', layout: 'vertical', spacing: 'sm',
      backgroundColor: '#000000', paddingAll: '18px',
      contents: [
        ...(code ? [{
          type: 'box', layout: 'horizontal', spacing: 'sm', margin: 'none',
          contents: [
            { type: 'text', text: '品號', size: 'sm', color: '#a8a8a8', flex: 2 },
            { type: 'text', text: code, size: 'sm', color: '#ffffff', flex: 5, weight: 'bold' }
          ]
        }] : []),
        ...(qty ? [{
          type: 'box', layout: 'horizontal', spacing: 'sm',
          contents: [
            { type: 'text', text: '數量', size: 'sm', color: '#a8a8a8', flex: 2 },
            { type: 'text', text: qty, size: 'sm', color: '#ffffff', flex: 5, weight: 'bold' }
          ]
        }] : []),
        {
          type: 'box', layout: 'vertical', margin: 'md',
          backgroundColor: '#121212',
          borderColor: '#1c1c1e',
          borderWidth: '1px',
          cornerRadius: '8px', paddingAll: '12px',
          contents: [{
            type: 'text', wrap: true, size: 'xs', color: '#e4e6eb',
            align: 'center',
            text: displayGreeting
          }]
        }
      ]
    },
    footer: {
      type: 'box', layout: 'vertical',
      backgroundColor: '#000000', paddingAll: '14px',
      contents: [{
        type: 'box',
        layout: 'vertical',
        background: {
          type: 'linearGradient',
          angle: '45deg',
          startColor: '#f09433',
          endColor: '#bc1888'
        },
        cornerRadius: '20px',
        paddingAll: '10px',
        action: { type: 'uri', label: '立即填寫保留單', uri: liffUrl },
        contents: [{
          type: 'text',
          text: '立即填寫保留單',
          color: '#ffffff',
          weight: 'bold',
          size: 'sm',
          align: 'center'
        }]
      }]
    }
  };

  return flex;
}

/**
 * 🚩 [客戶自助] 產生「我的保留單」LIFF 按鈕卡片。
 * 沿用既有的 CONFIG.LIFF_ID_RESERVE（跟填保留單同一個 LIFF app，這樣不用麻煩使用者再去
 * LINE Developers Console 建立新的 LIFF app）——加一個 mode=myReservations 參數，LIFF
 * 會把這個參數一起帶到 doGet，doGet 那邊看到這個參數就會改渲染 cpanel_tracking.html
 * 而不是預設的 reservation_form.html。
 */
function buildMyReservationsLiffFlex_(auth) {
  const liffUrl = `https://liff.line.me/${CONFIG.LIFF_ID_RESERVE}?mode=myReservations`;

  const authName = String(auth.name || '');
  const company  = auth.company || authName.split('-')[0] || '高雅瓷';
  const userRealName = authName.includes('-') ? authName.split('-')[1] : authName;
  const displayTitle = (userRealName && userRealName !== company) ? `${company} ${userRealName}` : company;

  return {
    type: 'bubble',
    size: 'kilo',
    header: {
      type: 'box', layout: 'vertical',
      backgroundColor: '#000000', paddingAll: '18px',
      contents: [
        { type: 'text', text: '📋 我的保留單', weight: 'bold', size: 'lg', color: '#ffffff' },
        { type: 'text', text: displayTitle, size: 'sm', color: '#a8a8a8', margin: 'xs', weight: 'bold' }
      ]
    },
    body: {
      type: 'box', layout: 'vertical', spacing: 'sm',
      backgroundColor: '#000000', paddingAll: '18px',
      contents: [{
        type: 'box', layout: 'vertical', margin: 'none',
        backgroundColor: '#121212',
        borderColor: '#1c1c1e',
        borderWidth: '1px',
        cornerRadius: '8px', paddingAll: '12px',
        contents: [{
          type: 'text', wrap: true, size: 'xs', color: '#e4e6eb', align: 'center',
          text: '點下方按鈕，一次查看您所有的保留單。\n可以直接修改數量：\n減少或取消立即生效，\n增加需業務確認後才生效。'
        }]
      }]
    },
    footer: {
      type: 'box', layout: 'vertical',
      backgroundColor: '#000000', paddingAll: '14px',
      contents: [{
        type: 'box',
        layout: 'vertical',
        background: { type: 'linearGradient', angle: '45deg', startColor: '#f09433', endColor: '#bc1888' },
        cornerRadius: '20px',
        paddingAll: '10px',
        action: { type: 'uri', label: '查看我的保留單', uri: liffUrl },
        contents: [{ type: 'text', text: '查看我的保留單', color: '#ffffff', weight: 'bold', size: 'sm', align: 'center' }]
      }]
    }
  };
}

// URLSearchParams polyfill for GAS（無原生 URLSearchParams）
function URLSearchParams_GAS() {
  const pairs = [];
  return {
    set: (k, v) => pairs.push([k, v]),
    toString: () => pairs.map(([k,v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&')
  };
}

function resolveStockFirstOrderMatch_(inputCode, db, maps) {
  const stockRows = Array.isArray(db.stock) ? db.stock : [];
  const priceData = Array.isArray(db.price) ? db.price : [];
  const stockMap = maps.stock || (typeof getHeaderMap === 'function' ? getHeaderMap(stockRows) : {});
  const priceMap = maps.price || (typeof getHeaderMap === 'function' ? getHeaderMap(priceData) : {});
  const pick = (row, map, keys) => {
    if (!row || !map) return "";
    for (const key of keys) {
      const idx = map[key];
      if (idx !== undefined) {
        const val = String(row[idx] || "").trim();
        if (val) return val;
      }
    }
    return "";
  };

  let stockMatch = { code: '', rows: [] };
  if (typeof findStockFirstMatch_ === 'function') {
    stockMatch = findStockFirstMatch_(inputCode, stockRows, stockMap) || stockMatch;
  } else {
    const clean = String(inputCode || '').toUpperCase().replace(/\s+/g, '').trim();
    stockMatch.code = clean;
    stockMatch.rows = stockRows.filter(r => {
      return String(r[stockMap['編號']] || '').toUpperCase().replace(/\s+/g, '').trim() === clean;
    });
  }

  const stockCode = String(stockMatch.code || '').toUpperCase().trim();
  const priceResult = (stockCode && typeof getGroupedRows === 'function')
    ? getGroupedRows(stockCode, priceData, priceMap)
    : { primary: null, recommendations: [] };

  let primary = priceResult.primary || null;
  if (!primary && stockMatch.rows && stockMatch.rows.length > 0) {
    const firstStockRow = stockMatch.rows[0];
    primary = {};
    if (priceMap['編號'] !== undefined) primary[priceMap['編號']] = stockCode;
    if (priceMap['中文系列'] !== undefined) primary[priceMap['中文系列']] = "";
    if (priceMap['顏色'] !== undefined) primary[priceMap['顏色']] = "";
    if (priceMap['風格面感'] !== undefined) primary[priceMap['風格面感']] = "";
    if (priceMap['尺寸(cm)'] !== undefined) primary[priceMap['尺寸(cm)']] = pick(firstStockRow, stockMap, ['表定尺寸', '尺寸', '實際尺寸', '規格', '備註(批號+尺寸)']);
    if (priceMap['片/坪'] !== undefined) {
      primary[priceMap['片/坪']] = (typeof getPcsPerPingFallback_ === 'function')
        ? getPcsPerPingFallback_(firstStockRow, stockMap)
        : 1;
    }
  }

  return {
    code: stockCode,
    stockRows: stockMatch.rows || [],
    primary,
    recommendations: priceResult.recommendations || [],
    stockMap,
    priceMap
  };
}

/** 2. 核心處理：解析保留單並寫入「(保留暫存)」(同步變色版) */
function handleOrderRequest(input, auth, sourceId, db, maps) {
  const isTemplateRequest = ['下保留', '填保留單', '保留單', '填預留單'].some(k => input.includes(k));
  const isFilling = input.includes('●案名') || input.includes('案名：');

  if (isTemplateRequest && !isFilling) {
    return handleTemplateRequest(input, auth, db.price, maps.price);
  }

  var cleanInput = input;
  if (input.includes('💡') || input.includes('──────')) {
    var parts = input.split(/💡|──────/);
    cleanInput = parts[parts.length - 2] || parts[parts.length - 1]; 
  }

  try {
    var caseName = (cleanInput.match(/●?案名[：: ]*(.*)/) || ["",""])[1].trim();
    var address = (cleanInput.match(/●?地址[：: ]*(.*)/) || ["",""])[1].trim();
    var timeNote = (cleanInput.match(/●?進場日期[：: ]*(.*)/) || ["",""])[1].trim();

    let productEntries = [];
    for (let i = 1; i <= 5; i++) {
      let pMatch = cleanInput.match(new RegExp("●產品" + i + "[：: ]*([a-zA-Z0-9-]*)"));
      let qMatch = cleanInput.match(new RegExp("●數量" + i + "[：: ]*(.*)"));
      if (pMatch && pMatch[1].trim()) {
        productEntries.push({ 
          code: pMatch[1].trim().toUpperCase(), 
          qty: qMatch ? qMatch[1].trim() : "" 
        });
      }
    }

    if (!caseName || productEntries.length === 0) {
      return "⚠️ 資訊不足：請填寫「●案名」與「●產品編號」。";
    }

    const bizParts = String(auth.name || "").split('-');
    const company = bizParts[0] || "未知公司";
    const userName = bizParts[1] || "客戶";

    const now = new Date();
    const expire = new Date();
    expire.setDate(now.getDate() + 14);

    let checkDetails = [], overallShortage = false;
    let uiCodes = [], uiQtys = [], uiSizes = [];
    let itemsToBuffer = [];

    productEntries.forEach(entry => {
      const resolved = resolveStockFirstOrderMatch_(entry.code, db, maps);
      let code = resolved.code || String(entry.code || '').toUpperCase();
      let qtyStr = entry.qty, sizeStr = "-";

      if (resolved.primary) {
        code = String(resolved.primary[resolved.priceMap['編號']]).toUpperCase();
        sizeStr = String(resolved.primary[resolved.priceMap['尺寸(cm)']] || "-");
        let ratio = (typeof getPcsPerPingFallback_ === 'function')
          ? getPcsPerPingFallback_(resolved.primary, resolved.priceMap)
          : (safeN(resolved.primary[resolved.priceMap['片/坪']]) || 1);
        const totalStockPcs = db.stock.filter(r => String(r[resolved.stockMap['編號']]).toUpperCase() === code && !String(r[resolved.stockMap['品名']]).includes("小計")).reduce((acc, r) => acc + safeN(r[resolved.stockMap['片數']]), 0);
        const totalReservedPcs = db.main.filter(r => String(r[maps.main['編號']]).toUpperCase() === code).reduce((acc, r) => acc + safeN(r[maps.main['數量']]), 0);
        const availPcs = totalStockPcs - totalReservedPcs;
        const reqQtyVal = parseFloat(qtyStr.replace(/[^\d.-]/g, '')) || 0;
        const reqQtyInPcs = (qtyStr.includes('坪') || qtyStr.toLowerCase().includes('p')) ? (reqQtyVal * ratio) : reqQtyVal;
        
        const isThisItemShort = availPcs < reqQtyInPcs * 0.95;
        if (isThisItemShort) overallShortage = true;
        checkDetails.push(`${code}:${Math.round(availPcs)}片${isThisItemShort ? "(不足)" : ""}`);
      } else {
        checkDetails.push(`${code}:查無(不足)`); overallShortage = true;
      }
      
      uiCodes.push(code); uiQtys.push(qtyStr); uiSizes.push(sizeStr);
      itemsToBuffer.push({ c: code, q: qtyStr, s: sizeStr });
    });

    const ss = (typeof getFormSpreadsheetInstance === 'function') ? getFormSpreadsheetInstance() : SpreadsheetApp.openById(CONFIG.FORM_SS_ID);
    let orderReqSheet = ss.getSheetByName("(保留暫存)");
    if (!orderReqSheet) {
      orderReqSheet = ss.insertSheet("(保留暫存)");
      const headers = ["編號", "數量", "公司", "地址", "申請人", "申請時間", "到期時間", "案名", "進場日期", "申請單號", "來源ID", "狀態"];
      orderReqSheet.appendRow(headers);
      orderReqSheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#D9E1F2");
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    const requestId = "REQ-" + Utilities.formatDate(new Date(), "GMT+8", "MMdd-HHmm") + "-" + (Math.floor(Math.random() * 900) + 100);

    itemsToBuffer.forEach(item => {
      orderReqSheet.appendRow([
        item.c, item.q, company, address, userName, now, expire, caseName, timeNote, requestId, sourceId, "待核准"
      ]);
      
      const lastRow = orderReqSheet.getLastRow();
      orderReqSheet.getRange(lastRow, 12).setBackground("#FFF2CC"); // 塗黃
    });
    lock.releaseLock();
    if (typeof clearStockAndReserveCache === 'function') clearStockAndReserveCache();

    let stockStatus = overallShortage ? "不足" : "充足";
    let currentStockMsg = checkDetails.join("|");

    if (typeof buildOrderApprovalTelegramText_ === 'function') {
      const tgMsg = buildOrderApprovalTelegramText_(auth, caseName, address, uiCodes.join(','), uiSizes.join(','), uiQtys.join(','), timeNote, sourceId, stockStatus, currentStockMsg, overallShortage, requestId);
      const pushRes = pushTelegram(tgMsg.text, tgMsg.buttons);

      // 📧 同步發送郵件通知（維持不動）
      const mailBody = `📥 **收到新的保留申請**\n──────\n` +
                       `👤 申請人：${auth.name}\n` +
                       `🏢 項目：${caseName}\n` +
                       `📍 案名：${caseName}\n` +
                       `📦 產品：${uiCodes.join(',')}\n` +
                       `🔢 數量：${uiQtys.join(',')}\n` +
                       `⏳ 進場：${timeNote}\n` +
                       `📊 庫存：${stockStatus} (${currentStockMsg})\n\n` +
                       `請至試算表「(保留暫存)」分頁進行審核。`;
      sendEmailNotification("新保留申請：" + caseName, mailBody);

      if (pushRes && pushRes.getResponseCode() === 200) {
        return "📩 保換申請已同步格式寫入(保留暫存)，小姐核准後會回覆。✨";
      } else {
        return "⚠️ Telegram 通知可能失敗，但資料已成功寫入，請小姐巡視！";
      }
    }
  } catch (e) { return "⚠️ 處理錯誤：" + e; }
}

/** 3. 處理 Postback 按鈕動作 (核准後物理變色) */
function handlePostback(event, auth, dbSS, maps) {
  var data = event.postback.data, params = {};
  data.split('&').forEach(p => { var s = p.split('='); params[s[0]] = decodeURIComponent(s[1] || ''); });

  // 🚩 [Flex 卡片] 系列介紹、實景圖、模面變化圖（任何已登錄用戶皆可）
  if (params.t === 'intro' || params.t === 'scene' || params.t === 'piece' || params.t === 'catalog') {
    handleFlexImagePostback(params, event, auth, dbSS);
    return;
  }

  // 🔔 到貨通知訂閱（任何已報到用戶皆可，見 3_Notify.js）
  if (params.t === 'sub') {
    handleArrivalSubscribe_(params, event, auth, dbSS);
    return;
  }

  // 🚩 [睡美人] 重新推薦 / 下一次 (v671 簡化：內部統一讀取)
  if (params.t === 'sb') {
    if (typeof handleSleepBeauty === 'function') {
      const sleepFlex = handleSleepBeauty(auth, dbSS);
      if (typeof sleepFlex === 'object') {
        const payload = { replyToken: event.replyToken, messages: [{ type: "flex", altText: "優惠產品精選", contents: sleepFlex }] };
        lineApiFetch('reply', payload);
      }
    }
    return;
  }

  if (!['queen', 'king', 'admin'].includes(auth.level)) {
    sendPush(event.source.userId, "⛔ 權限不足：此動作僅限管理員執行。");
    return;
  }

  if (params.ac === 'approveOrderRow') {
    const res = approveOrderRow_(params.id, params.code, auth.name, dbSS);
    sendPush(event.source.userId, res.success ? ("✅ 已核准單筆品項：" + params.code) : ("❌ " + res.error));
    return;
  }

  if (params.ac === 'approveOrder') {
    const res = approveOrderAll_(params.id, auth.name, dbSS);
    sendPush(event.source.userId, res.success ? ("✅ 已核准整筆保留單：" + res.count + " 筆品項") : ("❌ " + res.error));
    return;
  }

  if (params.ac === 'denyOrder') {
    const res = denyOrderAll_(params.id, auth.name, dbSS);
    sendPush(event.source.userId, res.success ? ("🚫 已拒絕整筆保留單：" + res.count + " 筆品項") : ("❌ " + res.error));
    return;
  }

  if (params.ac === 'approveUser') {
    const fullName = decodeURIComponent(params.bn);
    const uid = params.uid;
    processUserApproval(fullName, uid);
    sendPush(event.source.userId, "👌 已准許新用戶加入。");
  }
}

/**
 * 🚩 查詢商品編號對應的片/坪與片/箱比例，供保留核准時換算為「純片數」寫入保留單
 */
function getPcsPerPingRatio_(code) {
  try {
    const dbSS = getSpreadsheetInstance();
    const priceSheet = dbSS.getSheetByName("編輯價目表") || dbSS.getSheetByName("編號價目表") || dbSS.getSheetByName(SHEET_NAME.PRICE);
    if (!priceSheet) return { ratio: 1, pcsPerBox: 1 };
    const priceData = priceSheet.getDataRange().getValues();
    const priceMap = getHeaderMap(priceData);
    const codeIdx = priceMap['編號'];
    const pingIdx = priceMap['片/坪'];
    const boxIdx = priceMap['片/箱'];
    const targetCode = String(code).trim().toUpperCase();
    
    for (let r = 1; r < priceData.length; r++) {
      if (String(priceData[r][codeIdx]).trim().toUpperCase() === targetCode) {
        const ratio = parseFloat(priceData[r][pingIdx]) || 1;
        const pcsPerBox = parseFloat(priceData[r][boxIdx]) || 1;
        return { ratio, pcsPerBox };
      }
    }
  } catch (e) {
    console.error("查價目表換算比失敗: " + e);
  }
  return { ratio: 1, pcsPerBox: 1 };
}

/**
 * 🚩 共用核准/拒絕邏輯（供 doGet 網頁連結與舊版 LINE postback 共用，避免邏輯重複兩份）
 */

/**
 * 🚩 依申請單號尋找對應的工作表（萬能全試算表、全工作表盲掃演算法）。
 */
function findOrderReqSheetByRequestId_(requestId) {
  const targetReqId = String(requestId || '').trim();
  if (!targetReqId) return null;

  const candidateSsList = [];

  // 1. 嘗試加入 Active 試算表
  try {
    const activeSs = SpreadsheetApp.getActiveSpreadsheet();
    if (activeSs) candidateSsList.push(activeSs);
  } catch (e) {}

  // 2. 嘗試加入 getSpreadsheetInstance()
  try {
    if (typeof getSpreadsheetInstance === 'function') {
      const instSs = getSpreadsheetInstance();
      if (instSs && !candidateSsList.some(s => s.getId() === instSs.getId())) {
        candidateSsList.push(instSs);
      }
    }
  } catch (e) {}

  // 3. 嘗試加入 CONFIG.DATA_SS_ID 與 CONFIG.FORM_SS_ID
  [CONFIG.DATA_SS_ID, CONFIG.FORM_SS_ID].forEach(ssId => {
    if (ssId) {
      try {
        const ss = SpreadsheetApp.openById(ssId);
        if (ss && !candidateSsList.some(s => s.getId() === ss.getId())) {
          candidateSsList.push(ss);
        }
      } catch (e) {}
    }
  });

  // 對每一個候選試算表的所有分頁進行全方位單號對齊
  for (const ss of candidateSsList) {
    try {
      const sheets = ss.getSheets();
      for (const sheet of sheets) {
        try {
          const data = sheet.getDataRange().getValues();
          if (data.length < 2) continue;
          const map = (typeof getHeaderMap === 'function') ? getHeaderMap(data) : {};
          
          let idCol = map['申請單號'];
          if (idCol === undefined) idCol = map['單號'];
          if (idCol === undefined) idCol = map['ID'];

          if (idCol !== undefined) {
            for (let r = 1; r < data.length; r++) {
              if (String(data[r][idCol] || '').trim() === targetReqId) {
                return { sheet: sheet, ss: ss, idCol: idCol, map: map };
              }
            }
          } else {
            // 盲掃前 20 欄
            for (let r = 1; r < data.length; r++) {
              for (let c = 0; c < Math.min(20, data[r].length); c++) {
                if (String(data[r][c] || '').trim() === targetReqId) {
                  return { sheet: sheet, ss: ss, idCol: c, map: map };
                }
              }
            }
          }
        } catch (err) {}
      }
    } catch (err) {}
  }
  return null;
}

/** 核准保留單單一品項 */
function approveOrderRow_(requestId, code, approverName, dbSS) {
  const reqResult = findOrderReqSheetByRequestId_(requestId);
  if (!reqResult) return { success: false, error: '找不到保留相關工作表，操作失敗。' };

  const orderReqSheet = reqResult.sheet;
  const reqData = orderReqSheet.getDataRange().getValues();
  const srcMaps = reqResult.map || getHeaderMap(reqData);
  const idCol = reqResult.idCol;
  const codeCol = srcMaps['編號'] !== undefined ? srcMaps['編號'] : 0;
  const statusCol = srcMaps['狀態'] !== undefined ? srcMaps['狀態'] : (srcMaps['審核狀態'] !== undefined ? srcMaps['審核狀態'] : 11);

  // 目標寫入：保留單 (SHEET_NAME.MAIN) - 優先從同一個試算表獲取，若無再找 CONFIG.FORM_SS_ID
  let mainSheet = reqResult.ss.getSheetByName(SHEET_NAME.MAIN);
  if (!mainSheet && CONFIG.FORM_SS_ID) {
    const formSS = (typeof getFormSpreadsheetInstance === 'function') ? getFormSpreadsheetInstance() : SpreadsheetApp.openById(CONFIG.FORM_SS_ID);
    mainSheet = formSS.getSheetByName(SHEET_NAME.MAIN);
  }
  if (!mainSheet) return { success: false, error: '找不到「保留單」工作表，無法核准。' };
  const mainData = mainSheet.getDataRange().getValues();
  const dstMaps = getHeaderMap(mainData);

  const rowsToProcess = [], rowIndices = [];
  for (let i = 1; i < reqData.length; i++) {
    const rId = String(reqData[i][idCol] || '').trim();
    const rCode = String(reqData[i][codeCol] || '').trim().toUpperCase();
    const rStatus = String(reqData[i][statusCol] || '').trim();

    if (rId === String(requestId).trim() && rCode === String(code).trim().toUpperCase() && rStatus !== "已核准") {
      rowsToProcess.push(reqData[i]); rowIndices.push(i + 1);
    }
  }
  if (rowsToProcess.length === 0) return { success: false, error: '找不到待核准的品項，或該品項已核准過。' };

  // 若目標本身就是保留單，直接更新狀態
  if (orderReqSheet.getName() === SHEET_NAME.MAIN) {
    rowIndices.forEach(idx => {
      orderReqSheet.getRange(idx, statusCol + 1).setValue("Spacer").setValue("已核准").setBackground("#D9EAD3");
    });
    return { success: true, code: code };
  }

  // 保留暫存 → 保留單 欄位對照
  rowsToProcess.forEach(row => {
    var rowData = new Array(mainData[0].length).fill("");
    const fieldMap = {
      '編號':     srcMaps['編號'],
      '客戶':     srcMaps['公司']      !== undefined ? srcMaps['公司']      : srcMaps['客戶名稱'],
      '工地':     srcMaps['地址']      !== undefined ? srcMaps['地址']      : srcMaps['工地地址'],
      '客戶業務':  srcMaps['申請人']   !== undefined ? srcMaps['申請人']   : srcMaps['對應業務'],
      '保留日期':  srcMaps['申請時間'] !== undefined ? srcMaps['申請時間'] : srcMaps['建立時間'],
      '案名':     srcMaps['案名'],
      '備註':     srcMaps['進場日期']
    };
    Object.entries(fieldMap).forEach(([destKey, srcIdx]) => {
      if (dstMaps[destKey] !== undefined && srcIdx !== undefined) {
        rowData[dstMaps[destKey]] = row[srcIdx];
      }
    });

    // 數量換算：坪數 -> 片數 (無條件進位)
    if (dstMaps['數量'] !== undefined && srcMaps['數量'] !== undefined) {
      const itemCode = String(row[srcMaps['編號']] || '').trim();
      const rawQtyStr = String(row[srcMaps['數量']] || '').trim();
      const qtyVal = parseFloat(rawQtyStr.replace(/[^\d\.]/g, '')) || 0;
      const unit = rawQtyStr.replace(/[\d\.\s]/g, '').trim();

      let pcsQty = qtyVal;
      if (unit.includes('坪') || unit.toLowerCase().includes('p')) {
        const ratioObj = getPcsPerPingRatio_(itemCode);
        pcsQty = Math.ceil(qtyVal * ratioObj.ratio);
      } else if (unit.includes('箱') || unit.includes('包') || unit.toLowerCase().includes('box')) {
        const ratioObj = getPcsPerPingRatio_(itemCode);
        pcsQty = Math.ceil(qtyVal * ratioObj.pcsPerBox);
      } else {
        pcsQty = Math.round(qtyVal);
      }
      rowData[dstMaps['數量']] = pcsQty;
    }

    if (dstMaps['審核者'] !== undefined) rowData[dstMaps['審核者']] = approverName;
    mainSheet.appendRow(rowData);
  });

  rowIndices.forEach(idx => {
    orderReqSheet.getRange(idx, statusCol + 1).setValue("已核准").setBackground("#D9EAD3");
  });
  if (typeof clearStockAndReserveCache === 'function') clearStockAndReserveCache();
  return { success: true, code: code };
}

/** 核准整筆保留單所有品項 */
function approveOrderAll_(requestId, approverName, dbSS) {
  const reqResult = findOrderReqSheetByRequestId_(requestId);
  if (!reqResult) return { success: false, error: '找不到保留相關工作表（單號：' + requestId + '）。' };

  const orderReqSheet = reqResult.sheet;
  const reqData = orderReqSheet.getDataRange().getValues();
  const srcMaps = reqResult.map || getHeaderMap(reqData);
  const idCol = reqResult.idCol;
  const statusCol = srcMaps['狀態'] !== undefined ? srcMaps['狀態'] : (srcMaps['審核狀態'] !== undefined ? srcMaps['審核狀態'] : 11);

  // 目標寫入：保留單 (SHEET_NAME.MAIN) - 優先從同一個試算表獲取，若無再找 CONFIG.FORM_SS_ID
  let mainSheet = reqResult.ss.getSheetByName(SHEET_NAME.MAIN);
  if (!mainSheet && CONFIG.FORM_SS_ID) {
    const formSS = (typeof getFormSpreadsheetInstance === 'function') ? getFormSpreadsheetInstance() : SpreadsheetApp.openById(CONFIG.FORM_SS_ID);
    mainSheet = formSS.getSheetByName(SHEET_NAME.MAIN);
  }
  if (!mainSheet) return { success: false, error: '找不到「保留單」工作表，無法核准。' };
  const mainData = mainSheet.getDataRange().getValues();
  const dstMaps = getHeaderMap(mainData);

  const rowsToProcess = [], rowIndices = [];
  for (let i = 1; i < reqData.length; i++) {
    const rId = String(reqData[i][idCol] || '').trim();
    const rStatus = String(reqData[i][statusCol] || '').trim();

    if (rId === String(requestId).trim() && rStatus !== "已核准" && rStatus !== "已過期") {
      rowsToProcess.push(reqData[i]); rowIndices.push(i + 1);
    }
  }
  if (rowsToProcess.length === 0) return { success: false, error: '找不到待核准的單據品項，或該單據已核准過。' };

  // 若目標工作表本身就是「保留單」
  if (orderReqSheet.getName() === SHEET_NAME.MAIN) {
    rowIndices.forEach(idx => {
      orderReqSheet.getRange(idx, statusCol + 1).setValue("已核准").setBackground("#D9EAD3");
    });
    if (typeof clearStockAndReserveCache === 'function') clearStockAndReserveCache();
    return { success: true, count: rowsToProcess.length };
  }

  rowsToProcess.forEach(row => {
    var rowData = new Array(mainData[0].length).fill("");
    const fieldMap = {
      '編號':     srcMaps['編號'],
      '客戶':     srcMaps['公司']      !== undefined ? srcMaps['公司']      : srcMaps['客戶名稱'],
      '工地':     srcMaps['地址']      !== undefined ? srcMaps['地址']      : srcMaps['工地地址'],
      '客戶業務':  srcMaps['申請人']   !== undefined ? srcMaps['申請人']   : srcMaps['對應業務'],
      '保留日期':  srcMaps['申請時間'] !== undefined ? srcMaps['申請時間'] : srcMaps['建立時間'],
      '案名':     srcMaps['案名']      !== undefined ? srcMaps['案名']      : srcMaps['工地案名'],
      '備註':     srcMaps['進場日期']
    };
    Object.entries(fieldMap).forEach(([destKey, srcIdx]) => {
      if (dstMaps[destKey] !== undefined && srcIdx !== undefined) {
        rowData[dstMaps[destKey]] = row[srcIdx];
      }
    });

    // 數量換算：坪數 -> 片數 (無條件進位)
    if (dstMaps['數量'] !== undefined && srcMaps['數量'] !== undefined) {
      const itemCode = String(row[srcMaps['編號']] || '').trim();
      const rawQtyStr = String(row[srcMaps['數量']] || '').trim();
      const qtyVal = parseFloat(rawQtyStr.replace(/[^\d\.]/g, '')) || 0;
      const unit = rawQtyStr.replace(/[\d\.\s]/g, '').trim();

      let pcsQty = qtyVal;
      if (unit.includes('坪') || unit.toLowerCase().includes('p')) {
        const ratioObj = getPcsPerPingRatio_(itemCode);
        pcsQty = Math.ceil(qtyVal * ratioObj.ratio);
      } else if (unit.includes('箱') || unit.includes('包') || unit.toLowerCase().includes('box')) {
        const ratioObj = getPcsPerPingRatio_(itemCode);
        pcsQty = Math.ceil(qtyVal * ratioObj.pcsPerBox);
      } else {
        pcsQty = Math.round(qtyVal);
      }
      rowData[dstMaps['數量']] = pcsQty;
    }

    if (dstMaps['審核者'] !== undefined) rowData[dstMaps['審核者']] = approverName;
    mainSheet.appendRow(rowData);
  });

  rowIndices.forEach(idx => {
    orderReqSheet.getRange(idx, statusCol + 1).setValue("已核准").setBackground("#D9EAD3");
  });

  if (typeof clearStockAndReserveCache === 'function') clearStockAndReserveCache();
  return { success: true, count: rowsToProcess.length };
}

/**
 * 拒絕整筆保留單
 * 🚩 原本 Flex 卡片上的「❌ 全部拒絕」按鈕沒有對應的 handlePostback 分支（點了沒反應），
 * 這次補上實作：把待核准品項狀態標為「已拒絕」並塗淺紅色，不寫入雲端保留。
 */
function denyOrderAll_(requestId, approverName, dbSS) {
  const reqResult = findOrderReqSheetByRequestId_(requestId);
  if (!reqResult) return { success: false, error: '找不到保留暫存工作表，操作失敗。' };

  const orderReqSheet = reqResult.sheet;
  const reqData = orderReqSheet.getDataRange().getValues();
  const srcMaps = reqResult.map || getHeaderMap(reqData);
  const idCol = reqResult.idCol;
  const statusCol = srcMaps['狀態'] !== undefined ? srcMaps['狀態'] : (srcMaps['審核狀態'] !== undefined ? srcMaps['審核狀態'] : 11);

  const rowIndices = [];
  for (let i = 1; i < reqData.length; i++) {
    const rId = String(reqData[i][idCol] || '').trim();
    const rStatus = String(reqData[i][statusCol] || '').trim();
    if (rId === String(requestId).trim() && rStatus !== "已核准" && rStatus !== "已拒絕") {
      rowIndices.push(i + 1);
    }
  }
  if (rowIndices.length === 0) return { success: false, error: '找不到可拒絕的品項，或已處理過。' };

  rowIndices.forEach(idx => {
    orderReqSheet.getRange(idx, statusCol + 1).setValue("已拒絕").setBackground("#F4CCCC"); // 塗淺紅
  });
  if (typeof clearStockAndReserveCache === 'function') clearStockAndReserveCache();
  return { success: true, count: rowIndices.length };
}

/** 在 LINE 外（如 Email 按鈕）執行權限核准 */
function processUserApproval(fullName, uid) {
  const dbSS = getSpreadsheetInstance();
  const parts = fullName.split('-');
  const company = parts[0] || "";
  const name = parts[1] || fullName;

  // 1. 寫入客戶版機器人主庫 (dbSS -> 白名單)
  var wlSheet = dbSS.getSheetByName(SHEET_NAME.WHITELIST);
  var wlData = wlSheet.getDataRange().getValues(), wMaps = getHeaderMap(wlData);
  
  let mainRowIdx = -1;
  for (let i = 1; i < wlData.length; i++) {
    if (String(wlData[i][wMaps['userid']]).trim() === uid) {
      mainRowIdx = i + 1;
      break;
    }
  }

  if (mainRowIdx === -1) {
    var rowData = new Array(wlData[0].length).fill("");
    rowData[wMaps['名字']] = fullName;
    rowData[wMaps['userid']] = uid;
    rowData[wMaps['等級']] = "free";
    if (wMaps['公司'] !== undefined) rowData[wMaps['公司']] = company;
    if (wMaps['狀態'] !== undefined) rowData[wMaps['狀態']] = "approved";
    wlSheet.appendRow(rowData);
  } else {
    if (wMaps['名字'] !== undefined) wlSheet.getRange(mainRowIdx, wMaps['名字'] + 1).setValue(fullName);
    if (wMaps['公司'] !== undefined) wlSheet.getRange(mainRowIdx, wMaps['公司'] + 1).setValue(company);
    if (wMaps['等級'] !== undefined) {
      const curLevel = String(wlData[mainRowIdx - 1][wMaps['等級']] || '').trim();
      if (!curLevel) wlSheet.getRange(mainRowIdx, wMaps['等級'] + 1).setValue("free");
    }
    if (wMaps['狀態'] !== undefined) wlSheet.getRange(mainRowIdx, wMaps['狀態'] + 1).setValue("approved");
  }

  // 2. 同步寫入物流庫
  try {
    const logisSsId = '1M-Ewy58fQs-QmqzO5nERoXDCm7lm6S_mrrAIR1mUOtA';
    const logisSs = SpreadsheetApp.openById(logisSsId);
    const logisSheet = logisSs.getSheetByName("經銷商白名單");
    if (logisSheet) {
      const lData = logisSheet.getDataRange().getValues();
      const lHeaders = lData[0].map(v => String(v || '').replace(/[\s\uFEFF]/g, '').trim());
      const idxUid = findHeaderIndex(lHeaders, ["USERID", "LINEID"]);
      const idxName = findHeaderIndex(lHeaders, ["名字", "姓名"]);
      const idxComp = findHeaderIndex(lHeaders, ["公司"]);

      let logisRowIdx = -1;
      if (idxUid !== -1) {
        for (let i = 1; i < lData.length; i++) {
          if (String(lData[i][idxUid]).trim() === uid) {
            logisRowIdx = i + 1;
            break;
          }
        }
      }

      if (logisRowIdx === -1) {
        const lRow = new Array(lHeaders.length).fill("");
        if (idxUid !== -1) lRow[idxUid] = uid;
        if (idxName !== -1) lRow[idxName] = name;
        if (idxComp !== -1) lRow[idxComp] = company;
        logisSheet.appendRow(lRow);
      } else {
        if (idxName !== -1) logisSheet.getRange(logisRowIdx, idxName + 1).setValue(name);
        if (idxComp !== -1) logisSheet.getRange(logisRowIdx, idxComp + 1).setValue(company);
      }
    }
  } catch(e) {
    console.error("同步至物流庫失敗:", e);
  }

  if (typeof clearWhitelistCache === 'function') clearWhitelistCache();
  sendPush(uid, "🎉 您的 AI 權限已核准開通！😊");
}

/** 4. 處理網頁表單保留申請 (LIFF 端) */
function handleWebFormSubmission(data, dbSS) {
  try {
    const userId     = String(data.userId     || '').trim();
    const company    = String(data.company    || '').trim();
    const sales      = String(data.sales      || '').trim();
    const caseName   = String(data.caseName   || '').trim();
    const address    = String(data.address    || '').trim();
    const entry      = String(data.entry      || '').trim();
    const contact    = String(data.contact    || '').trim();
    const phone      = String(data.phone      || '').trim();
    const reserveDate= String(data.reserveDate|| '').trim();
    const items      = Array.isArray(data.items) ? data.items : [];

    if (!caseName || !address || items.length === 0) {
      return { success: false, error: '資料不完整' };
    }

    // 目標試算表（保留暫存 tab）
    const formSS = SpreadsheetApp.openById(CONFIG.FORM_SS_ID);
    let sheet    = formSS.getSheetByName('(保留暫存)');
    if (!sheet) {
      sheet = formSS.insertSheet('(保留暫存)');
      const headers = ['編號','數量','公司','地址','申請人','申請時間','到期時間','案名','進場日期','申請單號','來源ID','狀態','聯絡人','聯絡電話','到貨日期'];
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#D9E1F2');
    } else {
      // 確認欄位數量足夠（舊表可能只有 12 欄）
      const lastCol = sheet.getLastColumn();
      if (lastCol < 15) {
        const extra = ['聯絡人','聯絡電話','到貨日期'].slice(0, 15 - lastCol);
        sheet.getRange(1, lastCol + 1, 1, extra.length).setValues([extra]);
      }
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(30000);

    const now     = new Date();
    const expire  = new Date(); expire.setDate(now.getDate() + 14);
    const requestId = 'REQ-' + Utilities.formatDate(now, 'GMT+8', 'MMdd-HHmm') + '-' + (Math.floor(Math.random() * 900) + 100);

    // 載入資料庫進行庫存比對
    const wlSheet = dbSS.getSheetByName(SHEET_NAME.WHITELIST);
    const wlData = wlSheet ? wlSheet.getDataRange().getValues() : [];
    const wlMap = (typeof getHeaderMap === 'function') ? getHeaderMap(wlData) : {};
    const auth = (typeof checkAuth === 'function') ? checkAuth(userId, wlData, wlMap) : { allowed: true, blockedSeries: '' };

    const priceSheet = dbSS.getSheetByName("編輯價目表") || dbSS.getSheetByName("編號價目表") || dbSS.getSheetByName(SHEET_NAME.PRICE);
    let priceData = priceSheet ? priceSheet.getDataRange().getValues() : [];
    const priceMap = (typeof getHeaderMap === 'function') ? getHeaderMap(priceData) : {};
    if (typeof filterPriceDataForUser === 'function') {
      priceData = filterPriceDataForUser(priceData, priceMap, auth);
    }
    const db = {
      price: priceData,
      stock: (typeof getStockSheet === 'function') ? getStockSheet() : [],
      main: (typeof getMainSheet === 'function') ? getMainSheet() : []
    };
    const maps = {
      price: priceMap,
      stock: (typeof getHeaderMap === 'function') ? getHeaderMap(db.stock) : {},
      main: (typeof getHeaderMap === 'function') ? getHeaderMap(db.main) : {}
    };

    let overallShortage = false;
    const uiCodes = [], uiQtys = [], stockChecks = [];

    items.forEach(item => {
      const code = String(item.code || '').trim().toUpperCase();
      const qty  = String(item.qty  || '').trim();
      const arr  = String(item.arrivalDate || '').trim();

      sheet.appendRow([
        code, qty, company, address, sales,
        now, expire, caseName, entry,
        requestId, userId, '待核准',
        contact, phone, arr
      ]);
      const lastRow = sheet.getLastRow();
      sheet.getRange(lastRow, 12).setBackground('#FFF2CC');

      uiCodes.push(code);
      uiQtys.push(qty);

      // 比對資料庫確認庫存是否充足
      const resolved = resolveStockFirstOrderMatch_(code, db, maps);
      if (resolved.primary) {
        let matchedCode = String(resolved.primary[resolved.priceMap['編號']]).toUpperCase();
        let ratio = (typeof getPcsPerPingFallback_ === 'function')
          ? getPcsPerPingFallback_(resolved.primary, resolved.priceMap)
          : ((typeof safeN === 'function' ? safeN(resolved.primary[resolved.priceMap['片/坪']]) : 1) || 1);
        const totalStockPcs = db.stock.filter(r => String(r[resolved.stockMap['編號']]).toUpperCase() === matchedCode && !String(r[resolved.stockMap['品名']]).includes("小計")).reduce((acc, r) => acc + (typeof safeN === 'function' ? safeN(r[resolved.stockMap['片數']]) : 0), 0);
        const totalReservedPcs = db.main.filter(r => String(r[maps.main['編號']]).toUpperCase().trim() === matchedCode).reduce((acc, r) => acc + (typeof safeN === 'function' ? safeN(r[maps.main['數量']]) : 0), 0);
        const availPcs = totalStockPcs - totalReservedPcs;
        const reqQtyVal = parseFloat(qty.replace(/[^\d.-]/g, '')) || 0;
        const reqQtyInPcs = (qty.includes('坪') || qty.toLowerCase().includes('p')) ? (reqQtyVal * ratio) : reqQtyVal;
        
        const isThisItemShort = availPcs < reqQtyInPcs * 0.95;
        if (isThisItemShort) overallShortage = true;

        if (isThisItemShort) {
          stockChecks.push(`${code}:僅剩${Math.round(availPcs)}片(不足)`);
        } else {
          stockChecks.push(`${code}:${Math.round(availPcs)}片`);
        }
      } else { 
        stockChecks.push(`${code}:查無(不足)`);
        overallShortage = true;
      }

      if (arr) stockChecks.push(`${code}(到貨:${arr})`);
    });

    lock.releaseLock();
    if (typeof clearStockAndReserveCache === 'function') clearStockAndReserveCache();

    // 推 Telegram 通知
    if (typeof buildOrderApprovalTelegramText_ === 'function') {
      const tgMsg = buildOrderApprovalTelegramText_(
        { name: company + '-' + (contact || '客戶') },
        caseName, address,
        uiCodes.join(','), '', uiQtys.join(','),
        entry, userId,
        overallShortage ? '不足' : '足夠',
        stockChecks.join('|') || '網頁表單送出',
        overallShortage, requestId
      );
      pushTelegram(tgMsg.text, tgMsg.buttons);
    }

    // Email 備份
    if (typeof sendEmailNotification === 'function') {
      sendEmailNotification(
        '📋 新網頁保留申請：' + caseName,
        `公司：${company}\n業務：${sales}\n案名：${caseName}\n地址：${address}\n進場：${entry}\n品項：${uiCodes.join(', ')}\n數量：${uiQtys.join(', ')}\n聯絡人：${contact || '—'} ${phone || ''}\n申請單號：${requestId}`
      );
    }

    return { success: true, requestId };

  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/** 5. 處理「公司-姓名」自動申請 */
function handleNewUserApply(input, userId, sourceId) {
  var info = String(input || "").trim();
  if (info.startsWith('報到')) {
    info = info.substring(2).trim();
  }
  if (!info.includes('-') || info.length < 3) return null;
  
  const parts = info.split('-');
  const company = parts[0] ? parts[0].trim() : '';
  const name = parts[1] ? parts[1].trim() : info;
  
  // 1. 自動寫入內部管理 (1G5q-GixMWSdJJeF8ZiXWMOfrx4FMobER25jNc8m4Zds) 試算表之「白名單」
  try {
    const mainSs = SpreadsheetApp.openById(CONFIG.DATA_SS_ID);
    const wlSheet = mainSs.getSheetByName("白名單");
    if (wlSheet) {
      const data = wlSheet.getDataRange().getValues();
      const h = data[0].map(v => String(v || '').replace(/[\s\uFEFF]/g, '').trim());
      const idx = {
        uid: findHeaderIndex(h, ["USERID", "LINEID"]),
        name: findHeaderIndex(h, ["名字", "姓名"]),
        level: findHeaderIndex(h, ["等級"]),
        company: findHeaderIndex(h, ["公司"]),
        status: findHeaderIndex(h, ["狀態"])
      };
      
      const fullName = company ? (company + "-" + name) : name;

      // 檢查是否已存在
      let existingRow = -1;
      if (idx.uid !== -1) {
        for (let i = 1; i < data.length; i++) {
          if (String(data[i][idx.uid]).trim() === userId) {
            existingRow = i + 1;
            break;
          }
        }
      }

      if (existingRow === -1) {
        // 新增列，狀態設為待審核，等級預設 free
        const rowData = new Array(h.length).fill("");
        if (idx.uid !== -1) rowData[idx.uid] = userId;
        if (idx.name !== -1) rowData[idx.name] = fullName;
        if (idx.company !== -1) rowData[idx.company] = company;
        if (idx.level !== -1) rowData[idx.level] = "free";
        if (idx.status !== -1) rowData[idx.status] = "待審核";
        wlSheet.appendRow(rowData);
      } else {
        // 編輯更新，重設為待審核
        if (idx.name !== -1) wlSheet.getRange(existingRow, idx.name + 1).setValue(fullName);
        if (idx.company !== -1) wlSheet.getRange(existingRow, idx.company + 1).setValue(company);
        if (idx.level !== -1) {
          const curLevel = String(data[existingRow - 1][idx.level] || '').trim();
          if (!curLevel) {
            wlSheet.getRange(existingRow, idx.level + 1).setValue("free");
          }
        }
        if (idx.status !== -1) wlSheet.getRange(existingRow, idx.status + 1).setValue("待審核");
      }
    }
  } catch (e) {
    console.error("寫入內部管理白名單失敗:", e);
  }

  // 2. 準備核准/拒絕網頁連結（doGet ac=approveUser/denyUser，Telegram 與 Email 共用）
  const baseUrl = ScriptApp.getService().getUrl();
  const approveUrl = baseUrl + '?ac=approveUser&bn=' + encodeURIComponent(info) + '&uid=' + encodeURIComponent(userId);
  const denyUrl = baseUrl + '?ac=denyUser&uid=' + encodeURIComponent(userId);

  // 3. 推 Telegram 通知（取代原本的 LINE Flex 審核卡片）
  if (typeof pushTelegram === 'function') {
    pushTelegram(
      `🔑 新使用者權限申請\n👤 申請名稱：${info}\n🆔 LINE ID：${userId}`,
      [[
        { text: '✅ 准許加入', url: approveUrl },
        { text: '❌ 拒絕', url: denyUrl }
      ]]
    );
  }

  // 📧 同步發送郵件通知（含核准/拒絕按鈕，維持不動）
  try {
    const htmlBody = `<div style="font-family: -apple-system,'PingFang TC',sans-serif; max-width: 500px; margin: 0 auto; padding: 30px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;">
      <h2 style="color: #1e293b; text-align: center; margin: 0 0 20px 0;">🔑 新使用者權限申請</h2>
      <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0;">
        <p style="margin: 8px 0; font-size: 16px;"><strong>👤 申請名稱：</strong>${info}</p>
        <p style="margin: 8px 0; font-size: 14px; color: #64748b;"><strong>🆔 LINE ID：</strong>${userId}</p>
      </div>
      <div style="text-align: center; margin-top: 24px;">
        <a href="${approveUrl}" style="display: inline-block; padding: 12px 32px; margin: 0 8px 8px 0; background: #2563eb; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">✅ 准許加入</a>
        <a href="${denyUrl}" style="display: inline-block; padding: 12px 32px; background: #e2e8f0; color: #475569; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">❌ 拒絕</a>
      </div>
      <p style="text-align: center; margin-top: 20px; font-size: 12px; color: #94a3b8;">或至 Telegram 通知群組直接點連結審核。</p>
    </div>`;
    GmailApp.sendEmail(CONFIG.ADMIN_EMAIL, `🔑 新用戶權限申請：${info}`, `👤 ${info}\n🆔 ${userId}\n請至連結審核：${approveUrl}`, { htmlBody: htmlBody });
  } catch(e) {
    console.error("Email 權限審核通知失敗：" + e);
  }

  // 3. 回覆用戶，秀出他的 LINE ID 並提示我們將加入系統好友
  const userReply = `📝 您的權限申請已送出審核！\n\n` +
                    `您的 LINE ID 為：\n` +
                    `\`${userId}\` (長按可複製)\n\n` +
                    `管理員已收到您的申請，將會把此 ID 綁定至查詢系統。開通審核通過後，小高會立刻通知您喔！😊`;
  return userReply;
}

/**
 * 🔄 一鍵同步保留單庫存計算資料
 */
function syncReservationStock() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 💡 輔助函式：批號限制最多前 5 碼，且遇到空格則空格後方全部捨棄
  function cleanBatchName(batch) {
    if (!batch) return "";
    const b = String(batch).trim().split(/\s+/)[0];
    return b.substring(0, 5);
  }
  
  // 1. 自動偵測「庫存表」與「保留單」分頁名稱
  const stockSheet = ss.getSheetByName("高雅瓷庫存表") || ss.getSheetByName("庫存表");
  const reserveSheet = ss.getSheetByName("高雅瓷保留") || ss.getSheetByName("保留單");
  
  if (!stockSheet || !reserveSheet) {
    SpreadsheetApp.getUi().alert("❌ 找不到 '高雅瓷庫存表' 或 '高雅瓷保留' 工作表，請檢查分頁名稱！");
    return;
  }
  
  // 2. 讀取庫存表建立 SKU 對應的庫存陣列 (降序排序)
  const stockData = stockSheet.getDataRange().getValues();
  const stockHeader = stockData[0];
  
  const idxStockSku = stockHeader.indexOf("編號");
  const idxStockQty = stockHeader.indexOf("片數");
  const idxStockBatch = stockHeader.indexOf("批號");
  
  if (idxStockSku === -1 || idxStockQty === -1 || idxStockBatch === -1) {
    SpreadsheetApp.getUi().alert("❌ 庫存表格式錯誤：找不到「編號」、「片數」或「批號」欄位！");
    return;
  }
  
  const stockMap = {}; // { SKU: [{ qty, batch }, ...] }
  for (let i = 1; i < stockData.length; i++) {
    const sku = String(stockData[i][idxStockSku] || '').trim().toUpperCase();
    const qty = parseFloat(stockData[i][idxStockQty]) || 0;
    
    // 💡 讀取並清洗庫存批號
    const rawBatch = String(stockData[i][idxStockBatch] || '').trim();
    const batch = cleanBatchName(rawBatch);
    
    if (!sku || sku.includes("小計")) continue;
    
    if (!stockMap[sku]) stockMap[sku] = [];
    stockMap[sku].push({ qty: qty, batch: batch });
  }
  
  // 對各 SKU 庫存進行由大到小排序
  for (let sku in stockMap) {
    stockMap[sku].sort((a, b) => b.qty - a.qty);
  }
  
  // 3. 讀取保留單結構
  const reserveData = reserveSheet.getDataRange().getValues();
  if (reserveData.length <= 1) {
    SpreadsheetApp.getUi().alert("ℹ️ 保留單沒有資料列可更新。");
    return;
  }
  const reserveHeader = reserveData[0];
  
  // 動態尋找保留單所有欄位索引 (防寫死欄位)
  const idxResSku = reserveHeader.indexOf("編號");
  const idxResQty = reserveHeader.indexOf("數量");
  const idxResBatch = reserveHeader.indexOf("批號"); // K欄 (選擇的批號)
  
  const idxResBatch1 = reserveHeader.indexOf("批1") !== -1 ? reserveHeader.indexOf("批1") : reserveHeader.indexOf("批號1");
  const idxResStock1 = reserveHeader.indexOf("庫存1");
  const idxResAvail1 = reserveHeader.indexOf("可用1");
  
  const idxResBatch2 = reserveHeader.indexOf("批2") !== -1 ? reserveHeader.indexOf("批2") : reserveHeader.indexOf("批號2");
  const idxResStock2 = reserveHeader.indexOf("庫存2");
  const idxResAvail2 = reserveHeader.indexOf("可用2");
  
  const idxResBatch3 = reserveHeader.indexOf("批3") !== -1 ? reserveHeader.indexOf("批3") : reserveHeader.indexOf("批號3");
  const idxResStock3 = reserveHeader.indexOf("庫存3");
  const idxResAvail3 = reserveHeader.indexOf("可用3");
  
  const idxResRatio = reserveHeader.indexOf("總佔比") !== -1 ? reserveHeader.indexOf("總佔比") : reserveHeader.indexOf("被預佔比");
  const idxResStatus = reserveHeader.indexOf("已合約確認");
  
  if (idxResSku === -1 || idxResQty === -1 || idxResBatch === -1 || 
      idxResBatch1 === -1 || idxResStock1 === -1 || idxResAvail1 === -1 ||
      idxResBatch2 === -1 || idxResStock2 === -1 || idxResAvail2 === -1 ||
      idxResBatch3 === -1 || idxResStock3 === -1 || idxResAvail3 === -1 ||
      idxResRatio === -1) {
    SpreadsheetApp.getUi().alert("❌ 保留單欄位不完整！請確認保留單首列包含以下標題：\n編號、數量、批號、批1、庫存1、可用1、批2、庫存2、可用2、批3、庫存3、可用3、總佔比");
    return;
  }
  
  // 4. 統計每個 SKU 在保留單中的總保留數量，以及按特定批號細分的保留量
  const reserveQtyMap = {}; // { SKU: totalReservedQty }
  const reserveBatchQtyMap = {}; // { SKU: { BATCH: batchReservedQty } }
  
  for (let i = 1; i < reserveData.length; i++) {
    const sku = String(reserveData[i][idxResSku] || '').trim().toUpperCase();
    const qty = parseFloat(reserveData[i][idxResQty]) || 0;
    
    // 💡 讀取並清洗保留單的指定批號
    const rawBatch = String(reserveData[i][idxResBatch] || '').trim();
    const batch = cleanBatchName(rawBatch).toUpperCase();
    if (!sku) continue;
    
    // 總保留加總
    reserveQtyMap[sku] = (reserveQtyMap[sku] || 0) + qty;
    
    // 特定批號的保留加總
    if (batch) {
      if (!reserveBatchQtyMap[sku]) reserveBatchQtyMap[sku] = {};
      reserveBatchQtyMap[sku][batch] = (reserveBatchQtyMap[sku][batch] || 0) + qty;
    }
  }
  
  // 5. 批次計算並更新保留單的資料矩陣
  const startRow = 2; // 從第 2 列開始
  const rangeToUpdate = reserveSheet.getRange(startRow, 1, reserveData.length - 1, reserveHeader.length);
  const cellValues = rangeToUpdate.getValues();
  const cellFormulas = rangeToUpdate.getFormulas(); // 💡 載入原始公式防止覆蓋
  
  const ratioColors = []; // 用於記錄總佔比的字體顏色
  
  for (let i = 0; i < cellValues.length; i++) {
    const sku = String(cellValues[i][idxResSku] || '').trim().toUpperCase();
    if (!sku) {
      ratioColors.push([null]);
      continue;
    }
    
    const stockList = stockMap[sku] || [];
    const b1 = stockList[0]?.batch || "";
    const q1 = stockList[0]?.qty || 0;
    
    const b2 = stockList[1]?.batch || "";
    const q2 = stockList[1]?.qty || 0;
    
    const b3 = stockList[2]?.batch || "";
    const q3 = stockList[2]?.qty || 0;
    
    // 取得該 SKU 被各別批號保留的加總量
    const resB1 = b1 ? (reserveBatchQtyMap[sku]?.[b1.toUpperCase()] || 0) : 0;
    const resB2 = b2 ? (reserveBatchQtyMap[sku]?.[b2.toUpperCase()] || 0) : 0;
    const resB3 = b3 ? (reserveBatchQtyMap[sku]?.[b3.toUpperCase()] || 0) : 0;
    
    // 可用 = 庫存 - 該批號總保留
    const avail1 = q1 - resB1;
    const avail2 = q2 - resB2;
    const avail3 = q3 - resB3;
    
    // 總佔比 = 全部保留量 / 前三大庫存加總 (不分批號，分母為前三批總庫存)
    const totalReserved = reserveQtyMap[sku] || 0;
    const totalStock = q1 + q2 + q3;
    const ratio = totalStock > 0 ? totalReserved / totalStock : 0;
    
    // 設定黃色計算儲存格
    cellValues[i][idxResBatch1] = b1;
    cellValues[i][idxResStock1] = q1;
    cellValues[i][idxResAvail1] = avail1;
    
    cellValues[i][idxResBatch2] = b2;
    cellValues[i][idxResStock2] = q2;
    cellValues[i][idxResAvail2] = avail2;
    
    cellValues[i][idxResBatch3] = b3;
    cellValues[i][idxResStock3] = q3;
    cellValues[i][idxResAvail3] = avail3;
    
    cellValues[i][idxResRatio] = ratio;
    
    // 總佔比字體顏色判斷：超過 80% 紫色；超過 50% 紅色；其餘預設
    if (ratio > 0.8) {
      ratioColors.push(["#800080"]); // 紫色
    } else if (ratio > 0.5) {
      ratioColors.push(["#FF0000"]); // 紅色
    } else {
      ratioColors.push([null]);      // 預設 (重設)
    }
    
    // 💡 預防公式被覆蓋：還原非目標修改欄位之公式
    for (let j = 0; j < cellValues[i].length; j++) {
      if (
        j !== idxResBatch1 && j !== idxResStock1 && j !== idxResAvail1 &&
        j !== idxResBatch2 && j !== idxResStock2 && j !== idxResAvail2 &&
        j !== idxResBatch3 && j !== idxResStock3 && j !== idxResAvail3 &&
        j !== idxResRatio
      ) {
        if (cellFormulas[i][j] !== "") {
          cellValues[i][j] = cellFormulas[i][j];
        }
      }
    }
  }
  
  // 6. 寫回數值與公式
  rangeToUpdate.setValues(cellValues);
  
  // 7. 更新總佔比欄位字體顏色
  reserveSheet.getRange(startRow, idxResRatio + 1, ratioColors.length, 1).setFontColors(ratioColors);
  
  // 8. 狀態更新與整列底色覆蓋 (不破壞小姐手動塗的工地分組底色)
  if (idxResStatus !== -1) {
    const rangeBg = reserveSheet.getRange(startRow, 1, cellValues.length, reserveHeader.length);
    const bgColors = rangeBg.getBackgrounds();
    for (let i = 0; i < cellValues.length; i++) {
      const statusVal = String(cellValues[i][idxResStatus] || '').trim();
      if (statusVal.includes("取消")) {
        for (let j = 0; j < bgColors[i].length; j++) {
          bgColors[i][j] = "#F3F3F3"; // 淺灰色
        }
      } else if (statusVal.includes("訂金")) {
        for (let j = 0; j < bgColors[i].length; j++) {
          bgColors[i][j] = "#FFF2CC"; // 淺黃色
        }
      }
      // 其餘情況不做任何變更，保留小姐手動塗的淡淡分組底色
    }
    rangeBg.setBackgrounds(bgColors);
  }
  
  SpreadsheetApp.getUi().alert("🎉 一鍵同步完成！");
}

/**
 * 根據別名清單動態查找欄位列號
 * @param {Object} priceMap - getHeaderMap 返回的對象
 * @param {String|Array} aliases - 單個欄位名或別名陣列
 * @returns {Number|undefined} 列號（0-based）或 undefined
 */
function getColumnByName(priceMap, aliases) {
  const nameList = Array.isArray(aliases) ? aliases : [aliases];
  for (let name of nameList) {
    if (priceMap[name] !== undefined) {
      return priceMap[name];
    }
  }
  return undefined;
}

/**
 * 從 IMAGE 公式中抽取 URL
 * @param {String} formula - IMAGE 公式字串
 * @returns {String|null} 抽取的 URL 或 null
 */
function extractImageUrlFromFormula(formula) {
  const formulaStr = String(formula || '');
  const match = formulaStr.match(/=IMAGE\("([^"]+)"/);
  return match ? match[1] : null;
}

/**
 * 寫入 Flex 圖片推送診斷日誌到 LOG 分頁
 * 🚩 改走 writeEnhancedLog（跟其他 log 寫入點共用同一套正確欄位順序：
 * A=日期 | B=來源類型 | C=使用者ID | D=姓名 | E=等級 | F=查詢內容 | G=回覆狀態 | H=Email | I=商品編號...）。
 * 舊版自己手刻的 7 欄陣列少算了「來源類型」欄，導致 B 以後全部欄位錯位一格；
 * 且用錯白名單欄位名稱（`使用者ID`/`姓名`，真正的欄位是 `userid`/`名字`）查不到人，姓名/等級永遠顯示「未知」。
 * 現在直接複用呼叫端（handleFlexImagePostback）已經透過 checkAuth 正確解析好的 auth，不再自己重查白名單。
 * @param {SpreadsheetApp.Spreadsheet} dbSS
 * @param {Object} auth - 呼叫端已解析好的使用者權限物件（name/level/email）
 * @param {Boolean} isGroup - 是否為群組來源，決定「來源類型」欄寫 GROUP 或 PRIVATE
 * @param {String} userId
 * @param {String} code
 * @param {String} type - intro/scene/piece/catalog
 * @param {String} message - 診斷訊息，寫入「通知狀態」欄
 * @param {Boolean} isSuccess
 */
function logFlexDebug(dbSS, auth, isGroup, userId, code, type, message, isSuccess) {
  try {
    // 🚩 [v684] 只記錄真正的結果（成功、或三層優先級都讀不到的最終失敗），
    // 中間過程的診斷訊息（L1/L2/L3 逐層嘗試）幾乎都沒傳 isSuccess=true，
    // 導致每一則都被貼上「❌ 推送失敗或無圖」，把 LOG 灌爆且誤導。
    // 判定規則：isSuccess===true（真成功）或 message 本身以 ❌ 開頭（真失敗）才寫入，其餘中間過程一律略過。
    const isGenuineOutcome = isSuccess === true || String(message || '').trim().indexOf('❌') === 0;
    if (!isGenuineOutcome) return;

    const typeLabel = type === 'intro' ? '系列介紹' : (type === 'scene' ? '傳送實景圖' : (type === 'catalog' ? '原廠目錄' : '模面變化圖'));
    const queryContent = code + " " + typeLabel;
    const lineReply = isSuccess ? "✅ 圖片已推送" : "❌ 推送失敗或無圖";
    const sidLabel = isGroup ? "GROUP" : "PRIVATE";
    const userName = (auth && auth.name) ? auth.name : "未知";
    const userLevel = (auth && auth.level) ? auth.level : "未知";
    const userEmail = (auth && auth.email) ? auth.email : "";

    if (typeof writeEnhancedLog === 'function') {
      writeEnhancedLog(dbSS, sidLabel, userId, userName, userLevel, queryContent, lineReply, userEmail, {
        productCode: code,
        notificationStatus: message
      });
    }
  } catch (e) {
    // 無聲失敗
  }
}

/**
 * 🚀 Flex 卡片按鈕 Postback 處理
 * 推送系列介紹、實景圖、模面變化圖（支援優先級讀取）
 * 診斷日誌寫入 LOG 分頁
 */
/** 取得品項的雲端硬碟資料夾連結（FLEX圖卡欄），沒有則回傳空字串 */
function getDriveFolderUrlFromRow_(row, priceMap) {
  const idx = getColumnByName(priceMap, ['FLEX圖卡']);
  if (idx === undefined) return '';
  const url = String(row[idx] || '').trim();
  return url.indexOf('http') === 0 ? url : '';
}

/** 「看全部圖片」雲端硬碟連結卡片 */
function buildAllImagesDriveFlex_(code, driveUrl) {
  return {
    type: "flex",
    altText: code + " 看全部圖片",
    contents: {
      type: "bubble",
      size: "kilo",
      body: {
        type: "box", layout: "vertical", spacing: "sm",
        contents: [
          { type: "text", text: code, weight: "bold", size: "md", wrap: true },
          { type: "text", text: "LINE 一次只能顯示部分圖片，完整圖片請到雲端硬碟查看", size: "xs", color: "#555555", wrap: true }
        ]
      },
      footer: {
        type: "box", layout: "vertical",
        contents: [
          { type: "button", style: "primary", color: "#8B6914", height: "sm", action: { type: "uri", label: "看全部圖片", uri: driveUrl } }
        ]
      }
    }
  };
}

function handleFlexImagePostback(params, event, auth, dbSS) {
  const userId = event.source.userId;
  const replyToken = event.replyToken;  // 用於 REPLY API
  const code = String(params.c || '').toUpperCase().trim();
  const type = params.t; // intro, scene, piece
  const isGroupCtx = event.source.type !== 'user';
  let effectiveDbSS = dbSS;

  if (!code) {
    sendPush(userId, "❌ 品號有誤，無法查詢。");
    return;
  }

  try {
    // 🚩 多公司 Postback 品號尋找支援：先在高雅瓷找，找不到自動在喜悅納/安帝嘉價目表中尋找
    let priceSheet = effectiveDbSS.getSheetByName("編輯價目表") || effectiveDbSS.getSheetByName("編號價目表");
    let matchedRow = null;
    let priceMap = null;

    if (priceSheet) {
      const priceData = priceSheet.getDataRange().getValues();
      priceMap = getHeaderMap(priceData);
      const codeIdx = priceMap['編號'];
      if (codeIdx !== undefined) {
        for (let i = 1; i < priceData.length; i++) {
          if (String(priceData[i][codeIdx]).toUpperCase().trim() === code) {
            matchedRow = priceData[i];
            break;
          }
        }
      }
    }

    if (!matchedRow && typeof MULTI_COMPANIES !== 'undefined') {
      for (const k of Object.keys(MULTI_COMPANIES)) {
        const c = MULTI_COMPANIES[k];
        try {
          const mcSs = SpreadsheetApp.openById(c.ssId);
          const mcSheet = mcSs.getSheetByName("編輯價目表") || mcSs.getSheetByName("編號價目表");
          if (mcSheet) {
            const mcData = mcSheet.getDataRange().getValues();
            const mcMap = getHeaderMap(mcData);
            const mcIdx = mcMap['編號'];
            if (mcIdx !== undefined) {
              for (let i = 1; i < mcData.length; i++) {
                if (String(mcData[i][mcIdx]).toUpperCase().trim() === code) {
                  matchedRow = mcData[i];
                  priceMap = mcMap;
                  effectiveDbSS = mcSs;
                  break;
                }
              }
            }
          }
        } catch (e) {}
        if (matchedRow) break;
      }
    }

    if (!matchedRow) {
      sendPush(userId, "❌ 找不到品號「" + code + "」");
      return;
    }

    const messages = [];
    logFlexDebug(effectiveDbSS, auth, isGroupCtx, userId, code, type, "開始處理", false);

    if (type === 'intro') {
      let introUrl = null;

      // 優先級 1：R2_系列介紹（已遷移到 R2 的優先讀取，速度最快）
      const r2IntroIdx = getColumnByName(priceMap, ['R2_系列介紹']);
      if (r2IntroIdx !== undefined) {
        introUrl = String(matchedRow[r2IntroIdx] || '').trim();
        if (introUrl && introUrl.includes("http")) {
          logFlexDebug(effectiveDbSS, auth, isGroupCtx, userId, code, type, "✅ L1 R2_系列介紹 URL", false);
        } else {
          introUrl = null;
          logFlexDebug(effectiveDbSS, auth, isGroupCtx, userId, code, type, "⚠️ L1 R2_系列介紹欄位為空或無效", false);
        }
      } else {
        logFlexDebug(effectiveDbSS, auth, isGroupCtx, userId, code, type, "⚠️ L1 找不到 R2_系列介紹欄位", false);
      }

      // 優先級 2：系列介紹（列 44）— Drive 備援
      if (!introUrl) {
        const introIdx = getColumnByName(priceMap, ['系列介紹']);
        if (introIdx !== undefined) {
          let rawUrl = String(matchedRow[introIdx] || '').trim();
          if (rawUrl && rawUrl.includes("http")) {
            // 🚩 修正：原本把 /file/d/.../view（HTML 檢視頁面）直接包進 wsrv.nl 代理，
            // wsrv.nl 抓到的是 HTML 不是圖片，永遠是破圖。改成跟全專案一致，直接轉成穩定的 /thumbnail 格式。
            if (rawUrl.includes("drive.google.com")) {
              introUrl = normalizeImageUrlForLine(rawUrl);
              logFlexDebug(effectiveDbSS, auth, isGroupCtx, userId, code, type, "✅ L2 系列介紹（Drive→thumbnail）", false);
            } else {
              introUrl = rawUrl;
              logFlexDebug(effectiveDbSS, auth, isGroupCtx, userId, code, type, "✅ L2 系列介紹 URL", false);
            }
          } else {
            logFlexDebug(effectiveDbSS, auth, isGroupCtx, userId, code, type, "⚠️ L2 系列介紹欄位為空或無效", false);
          }
        } else {
          logFlexDebug(effectiveDbSS, auth, isGroupCtx, userId, code, type, "⚠️ L2 找不到系列介紹欄位", false);
        }
      }

      if (introUrl) {
        const finalIntroUrl = normalizeImageUrlForLine(introUrl);
        messages.push({ type: "image", originalContentUrl: finalIntroUrl, previewImageUrl: finalIntroUrl });
      } else {
        logFlexDebug(effectiveDbSS, auth, isGroupCtx, userId, code, type, "❌ 系列介紹欄位都是空的", false);
        sendPush(userId, "ℹ️ 此品號無系列介紹圖");
        return;
      }

    } else if (type === 'scene') {
      const sceneUrls = [];

      // 優先級 1：FLEX 快取 JSON（列 42）—— 最快！
      const flexCacheIdx = getColumnByName(priceMap, ['FLEX快取']);
      if (flexCacheIdx !== undefined) {
        const cacheStr = String(matchedRow[flexCacheIdx] || '').trim();
        if (cacheStr && cacheStr.startsWith('{')) {
          try {
            const cacheObj = JSON.parse(cacheStr);
            if (cacheObj.scene && Array.isArray(cacheObj.scene)) {
              // 強去重：先 trim 再去重，移除重複和空值
              const trimmedUrls = cacheObj.scene.map(u => String(u || '').trim()).filter(u => u && u.includes("http"));
              const uniqueSceneUrls = [...new Set(trimmedUrls)];
              sceneUrls.push(...uniqueSceneUrls);
              logFlexDebug(effectiveDbSS, auth, isGroupCtx, userId, code, type, "✅ L1 FLEX快取 原 " + cacheObj.scene.length + " → trim後 " + trimmedUrls.length + " → 去重後 " + uniqueSceneUrls.length + " 張圖");
            }
          } catch (e) {
            logFlexDebug(effectiveDbSS, auth, isGroupCtx, userId, code, type, "⚠️ FLEX快取 JSON 解析失敗: " + e);
          }
        } else {
          logFlexDebug(effectiveDbSS, auth, isGroupCtx, userId, code, type, "⚠️ L1 FLEX快取欄位為空或非 JSON");
        }
      }

      // 優先級 2：R2 實景 URL（列 54~60）
      if (sceneUrls.length === 0) {
        const r2Urls = [];
        for (let j = 1; j <= 7; j++) {
          const colIdx = getColumnByName(priceMap, ['R2_實景' + j]);
          if (colIdx !== undefined) {
            let url = String(matchedRow[colIdx] || '').trim();
            if (url && url.includes("http")) {
              r2Urls.push(url);
            }
          }
        }
        // 去重後推送
        const uniqueR2Urls = [...new Set(r2Urls)];
        sceneUrls.push(...uniqueR2Urls);
        if (sceneUrls.length > 0) {
          logFlexDebug(effectiveDbSS, auth, isGroupCtx, userId, code, type, "✅ L2 R2_實景 原 " + r2Urls.length + " → 去重後 " + uniqueR2Urls.length + " 張圖");
        } else {
          logFlexDebug(effectiveDbSS, auth, isGroupCtx, userId, code, type, "⚠️ L2 R2_實景 沒有有效 URL");
        }
      }

      // 優先級 3：實景 IMAGE 公式解析（列 46~52）
      if (sceneUrls.length === 0) {
        for (let j = 1; j <= 7; j++) {
          const colIdx = getColumnByName(priceMap, ['實景' + j]);
          if (colIdx !== undefined) {
            const cellValue = matchedRow[colIdx];
            let url = null;

            // 如果是 IMAGE 公式，提取 URL
            if (String(cellValue).includes("=IMAGE")) {
              url = extractImageUrlFromFormula(cellValue);
            } else {
              url = String(cellValue || '').trim();
            }

            if (url && url.includes("http")) {
              sceneUrls.push(url);
              if (sceneUrls.length >= 5) break;
            }
          }
        }
        if (sceneUrls.length > 0) {
          logFlexDebug(effectiveDbSS, auth, isGroupCtx, userId, code, type, "✅ L3 實景公式 取得 " + sceneUrls.length + " 張圖");
        } else {
          logFlexDebug(effectiveDbSS, auth, isGroupCtx, userId, code, type, "⚠️ L3 實景公式 沒有有效 URL");
        }
      }

      if (sceneUrls.length === 0) {
        logFlexDebug(effectiveDbSS, auth, isGroupCtx, userId, code, type, "❌ 三層優先級都讀不到 URL", false);
        sendPush(userId, "ℹ️ 此品號無實景圖");
        return;
      }

      // 最終強去重：提取 URL 核心部分 (移除 query string)、trim、去重
      const normalizedUrls = sceneUrls.map(u => {
        const trimmed = String(u || '').trim();
        // 移除 query string，只保留核心 URL
        return trimmed.split('?')[0];
      }).filter(u => u && u.includes("http"));
      const uniqueFinalUrls = [...new Set(normalizedUrls)];
      // LINE reply 最多 5 則訊息；有雲端硬碟連結時留 1 則給「看全部圖片」卡片
      const scenesForPush = uniqueFinalUrls.slice(0, getDriveFolderUrlFromRow_(matchedRow, priceMap) ? 4 : 5);
      logFlexDebug(effectiveDbSS, auth, isGroupCtx, userId, code, type, "✅ 最終實景圖 原 " + sceneUrls.length + " → 正規化後 " + normalizedUrls.length + " → 去重後 " + uniqueFinalUrls.length + " 張，推送前 " + scenesForPush.length + " 張", false);
      scenesForPush.forEach(url => {
        const finalSceneUrl = normalizeImageUrlForLine(url);
        messages.push({ type: "image", originalContentUrl: finalSceneUrl, previewImageUrl: finalSceneUrl });
      });

    } else if (type === 'piece') {
      const pieceUrls = [];

      // 優先級 1：R2_單片1~9 + R2_單片連結網址（已遷移到 R2 的優先讀取，速度最快）
      // 🚩 修正：原本只讀 R2_單片連結網址（1 張），讀到就不再讀單片1~9，導致永遠只有一張
      const r2PieceCols = [];
      for (let j = 1; j <= 9; j++) r2PieceCols.push('R2_單片' + j);
      r2PieceCols.push('R2_單片連結網址');
      r2PieceCols.forEach(function (colName) {
        const idx = getColumnByName(priceMap, [colName]);
        if (idx !== undefined) {
          const url = String(matchedRow[idx] || '').trim();
          if (url && url.includes("http") && pieceUrls.indexOf(url) === -1) pieceUrls.push(url);
        }
      });
      if (pieceUrls.length > 0) {
        logFlexDebug(effectiveDbSS, auth, isGroupCtx, userId, code, type, "✅ L1 R2_單片 取得 " + pieceUrls.length + " 張圖");
      } else {
        logFlexDebug(effectiveDbSS, auth, isGroupCtx, userId, code, type, "⚠️ L1 R2_單片欄位都沒有有效 URL");
      }

      // 優先級 2：單片 URL（列 61~69）— Drive 備援
      if (pieceUrls.length === 0) {
        for (let j = 1; j <= 9; j++) {
          const colIdx = getColumnByName(priceMap, ['單片' + j]);
          if (colIdx !== undefined) {
            let url = String(matchedRow[colIdx] || '').trim();
            if (url && url.includes("http")) {
              pieceUrls.push(url);
            }
          }
        }
        if (pieceUrls.length > 0) {
          logFlexDebug(effectiveDbSS, auth, isGroupCtx, userId, code, type, "✅ L2 單片 取得 " + pieceUrls.length + " 張圖");
        }
      }

      if (pieceUrls.length === 0) {
        logFlexDebug(effectiveDbSS, auth, isGroupCtx, userId, code, type, "❌ 單片/R2_單片都讀不到 URL", false);
        sendPush(userId, "ℹ️ 此品號無模面變化圖");
        return;
      }

      // 隨機排列
      for (let i = pieceUrls.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = pieceUrls[i];
        pieceUrls[i] = pieceUrls[j];
        pieceUrls[j] = temp;
      }
      // LINE reply 最多 5 則訊息；有雲端硬碟連結時留 1 則給「看全部圖片」卡片
      const piecesForPush = pieceUrls.slice(0, getDriveFolderUrlFromRow_(matchedRow, priceMap) ? 4 : 5);
      logFlexDebug(effectiveDbSS, auth, isGroupCtx, userId, code, type, "✅ 最終取得 " + pieceUrls.length + " 張，推送前 " + piecesForPush.length + " 張", false);
      piecesForPush.forEach(url => {
        const finalUrl = normalizeImageUrlForLine(url);
        messages.push({ type: "image", originalContentUrl: finalUrl, previewImageUrl: finalUrl });
      });
    } else if (type === 'catalog') {
      let catalogUrl = null;
      const flexCacheIdx = getColumnByName(priceMap, ['FLEX快取']);
      if (flexCacheIdx !== undefined) {
        const cacheStr = String(matchedRow[flexCacheIdx] || '').trim();
        if (cacheStr && cacheStr.startsWith('{')) {
          try {
            const cacheObj = JSON.parse(cacheStr);
            catalogUrl = cacheObj.catalog ? String(cacheObj.catalog).trim() : null;
          } catch (e) {}
        }
      }
      if (!catalogUrl) {
        const catalogIdx = getColumnByName(priceMap, ['原廠目錄']);
        if (catalogIdx !== undefined) {
          catalogUrl = String(matchedRow[catalogIdx] || '').trim();
          if (!catalogUrl || !catalogUrl.includes("http")) catalogUrl = null;
        }
      }
      if (catalogUrl) {
        let seriesName = '';
        const seriesIdx = getColumnByName(priceMap, ['中文系列']);
        if (seriesIdx !== undefined) {
          seriesName = String(matchedRow[seriesIdx] || '').trim();
        }
        const catalogText = seriesName ? (seriesName + "電子目錄\n點擊下方連結下載") : "電子目錄\n點擊下方連結下載";
        messages.push({
          type: "text",
          text: catalogText + "\n\n" + catalogUrl
        });
      } else {
        sendPush(userId, "此品號無原廠目錄");
        return;
      }
    }

    // 實景圖 / 模面變化圖：圖片後面附一張「看全部圖片」雲端硬碟卡片
    if ((type === 'scene' || type === 'piece') && messages.length > 0 && messages.length < 5) {
      const driveFolderUrl = getDriveFolderUrlFromRow_(matchedRow, priceMap);
      if (driveFolderUrl) messages.push(buildAllImagesDriveFlex_(code, driveFolderUrl));
    }

    if (messages.length > 0) {
      const payload = { replyToken: replyToken, messages: messages };
      try {
        const result = lineApiFetch('reply', payload);
        logFlexDebug(effectiveDbSS, auth, isGroupCtx, userId, code, type, "✅ 推送成功 | " + result, true);
      } catch (replyErr) {
        logFlexDebug(effectiveDbSS, auth, isGroupCtx, userId, code, type, "❌ 推送異常: " + replyErr, false);
      }
    } else {
      logFlexDebug(effectiveDbSS, auth, isGroupCtx, userId, code, type, "❌ messages 陣列為空", false);
    }

  } catch (err) {
    logFlexDebug(effectiveDbSS, auth, isGroupCtx, userId, code, type, "❌ 異常: " + err, false);
    sendPush(userId, "❌ 查詢失敗：" + err);
  }
}

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

  // 組 LIFF URL，帶入已知的品號和數量
  const params = new URLSearchParams_GAS();
  if (code) params.set('code', code);
  if (qty)  params.set('qty',  qty.replace(/[^0-9.]/g, ''));
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

    const ss = SpreadsheetApp.openById(CONFIG.DATA_SS_ID);
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

  // 🚩 [OCR] 用戶確認/取消手寫單（任何已登錄用戶皆可，不需管理員）
  if (params.ac === 'confirm_ocr' || params.ac === 'cancel_ocr') {
    handleOCRPostback(params, event, auth, dbSS);
    return;
  }

  // 🚩 [Flex 卡片] 系列介紹、實景圖、模面變化圖（任何已登錄用戶皆可）
  if (params.t === 'intro' || params.t === 'scene' || params.t === 'piece' || params.t === 'catalog') {
    handleFlexImagePostback(params, event, auth, dbSS);
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
 * 🚩 共用核准/拒絕邏輯（供 doGet 網頁連結與舊版 LINE postback 共用，避免邏輯重複兩份）
 */

/**
 * 🚩 依申請單號尋找對應的「(保留暫存)」工作表。
 * 保留單有兩個不同入口：文字/口語/OCR 寫入 CONFIG.DATA_SS_ID，
 * LIFF 網頁表單（handleWebFormSubmission）則寫入 CONFIG.FORM_SS_ID，
 * 兩邊都要找過一輪才能保證核准/拒絕連結一定找得到單子。
 */
function findOrderReqSheetByRequestId_(requestId) {
  const candidateSsIds = [CONFIG.DATA_SS_ID];
  if (CONFIG.FORM_SS_ID && CONFIG.FORM_SS_ID !== CONFIG.DATA_SS_ID) {
    candidateSsIds.push(CONFIG.FORM_SS_ID);
  }

  for (let i = 0; i < candidateSsIds.length; i++) {
    try {
      const ss = SpreadsheetApp.openById(candidateSsIds[i]);
      const sheet = ss.getSheetByName("(保留暫存)");
      if (!sheet) continue;
      const data = sheet.getDataRange().getValues();
      if (data.length < 2) continue;
      const map = getHeaderMap(data);
      const idCol = map['申請單號'];
      if (idCol === undefined) continue;
      for (let r = 1; r < data.length; r++) {
        if (String(data[r][idCol]) === String(requestId)) return sheet;
      }
    } catch (e) {
      console.error('搜尋保留暫存工作表失敗 (' + candidateSsIds[i] + '): ' + e);
    }
  }
  return null;
}

/** 核准保留單單一品項 */
function approveOrderRow_(requestId, code, approverName, dbSS) {
  const orderReqSheet = findOrderReqSheetByRequestId_(requestId);
  const cloudSheet = getSpreadsheetInstance().getSheetByName(SHEET_NAME.CLOUD_RESERVE);
  if (!orderReqSheet || !cloudSheet) return { success: false, error: '找不到保留相關工作表，操作失敗。' };

  const cloudData = cloudSheet.getDataRange().getValues(), cMaps = getHeaderMap(cloudData);
  const reqData = orderReqSheet.getDataRange().getValues();
  // 🚩 [欄位對齊修復] 用來源的 header map 讀取，不用固定索引
  const srcMaps = getHeaderMap(reqData);
  const rowsToProcess = [], rowIndices = [];
  for (let i = 1; i < reqData.length; i++) {
    if (String(reqData[i][9]) === String(requestId) &&
        String(reqData[i][0]) === String(code) &&
        reqData[i][11] !== "已核准") {
      rowsToProcess.push(reqData[i]); rowIndices.push(i + 1);
    }
  }
  if (rowsToProcess.length === 0) return { success: false, error: '找不到待核准的品項，或已核准過。' };

  rowsToProcess.forEach(row => {
    var rowData = new Array(cloudData[0].length).fill("");
    // 🚩 用 header name 對應，避免欄位索引差異造成數量/日期串位
    const fieldMap = {
      '編號': srcMaps['編號'],      '數量': srcMaps['數量'],
      '客戶': srcMaps['公司'],      '工地': srcMaps['地址'],
      '客戶業務': srcMaps['申請人'], '保留日期': srcMaps['申請時間'],
      '到期日': srcMaps['到期時間'], '案名': srcMaps['案名'],
      '備註': srcMaps['進場日期']
    };
    Object.entries(fieldMap).forEach(([destKey, srcIdx]) => {
      if (cMaps[destKey] !== undefined && srcIdx !== undefined) {
        rowData[cMaps[destKey]] = row[srcIdx];
      }
    });
    rowData[cMaps['審核者']] = approverName;
    cloudSheet.appendRow(rowData);
  });
  rowIndices.forEach(idx => {
    orderReqSheet.getRange(idx, 12).setValue("已核准").setBackground("#D9EAD3"); // 塗綠
  });
  return { success: true, code: code };
}

/** 核准整筆保留單所有品項 */
function approveOrderAll_(requestId, approverName, dbSS) {
  const orderReqSheet = findOrderReqSheetByRequestId_(requestId);
  const cloudSheet = getSpreadsheetInstance().getSheetByName(SHEET_NAME.CLOUD_RESERVE);
  if (!orderReqSheet || !cloudSheet) return { success: false, error: '找不到保留相關工作表，操作失敗。' };

  const cloudData = cloudSheet.getDataRange().getValues(), cMaps = getHeaderMap(cloudData);
  const reqData = orderReqSheet.getDataRange().getValues();
  // 🚩 [欄位對齊修復] 用來源的 header map 讀取，不用固定索引
  const srcMaps = getHeaderMap(reqData);
  const rowsToProcess = [], rowIndices = [];
  for (let i = 1; i < reqData.length; i++) {
    if (String(reqData[i][9]) === String(requestId) && reqData[i][11] !== "已核准") {
      rowsToProcess.push(reqData[i]); rowIndices.push(i + 1);
    }
  }
  if (rowsToProcess.length === 0) return { success: false, error: '找不到待核准的品項，或已核准過。' };

  rowsToProcess.forEach(row => {
    var rowData = new Array(cloudData[0].length).fill("");
    // 🚩 用 header name 對應，避免欄位索引差異造成數量/日期串位
    const fieldMap = {
      '編號': srcMaps['編號'],      '數量': srcMaps['數量'],
      '客戶': srcMaps['公司'],      '工地': srcMaps['地址'],
      '客戶業務': srcMaps['申請人'], '保留日期': srcMaps['申請時間'],
      '到期日': srcMaps['到期時間'], '案名': srcMaps['案名'],
      '備註': srcMaps['進場日期']
    };
    Object.entries(fieldMap).forEach(([destKey, srcIdx]) => {
      if (cMaps[destKey] !== undefined && srcIdx !== undefined) {
        rowData[cMaps[destKey]] = row[srcIdx];
      }
    });
    rowData[cMaps['審核者']] = approverName;
    cloudSheet.appendRow(rowData);
  });
  rowIndices.forEach(idx => {
    orderReqSheet.getRange(idx, 12).setValue("已核准").setBackground("#D9EAD3");
  });
  return { success: true, count: rowsToProcess.length };
}

/**
 * 拒絕整筆保留單
 * 🚩 原本 Flex 卡片上的「❌ 全部拒絕」按鈕沒有對應的 handlePostback 分支（點了沒反應），
 * 這次補上實作：把待核准品項狀態標為「已拒絕」並塗淺紅色，不寫入雲端保留。
 */
function denyOrderAll_(requestId, approverName, dbSS) {
  const orderReqSheet = findOrderReqSheetByRequestId_(requestId);
  if (!orderReqSheet) return { success: false, error: '找不到保留暫存工作表，操作失敗。' };

  const reqData = orderReqSheet.getDataRange().getValues();
  const rowIndices = [];
  for (let i = 1; i < reqData.length; i++) {
    if (String(reqData[i][9]) === String(requestId) && reqData[i][11] !== "已核准" && reqData[i][11] !== "已拒絕") {
      rowIndices.push(i + 1);
    }
  }
  if (rowIndices.length === 0) return { success: false, error: '找不到可拒絕的品項，或已處理過。' };

  rowIndices.forEach(idx => {
    orderReqSheet.getRange(idx, 12).setValue("已拒絕").setBackground("#F4CCCC"); // 塗淺紅
  });
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
        const totalReservedPcs = db.main.filter(r => String(r[maps.main['編號']]).toUpperCase().includes(matchedCode)).reduce((acc, r) => acc + (typeof safeN === 'function' ? safeN(r[maps.main['數量']]) : 0), 0);
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

/**
 * 🚩 [OCR] 手寫單確認/取消 Postback 處理
 * - ac=confirm_ocr → 從 CacheService 取出 OCR 資料，寫入保留暫存並推 Flex
 * - ac=cancel_ocr  → 清除 cache，回覆取消訊息
 */
function handleOCRPostback(params, event, auth, dbSS) {
  const pushTo = event.source.userId;
  const key    = params.key || '';

  // ── 取消 ──
  if (params.ac === 'cancel_ocr') {
    if (key) CacheService.getScriptCache().remove(key);
    sendPush(pushTo, '已取消這次辨識。如需保留，請重新傳照片或手動填寫。');
    return;
  }

  // ── 確認送出 ──
  if (!key) {
    sendPush(pushTo, '⚠️ 找不到保留單資料，請重新傳照片。');
    return;
  }
  const cached = CacheService.getScriptCache().get(key);
  if (!cached) {
    sendPush(pushTo, '⚠️ 保留單資料已超時（10分鐘），請重新傳照片！');
    return;
  }

  var ocrData;
  try { ocrData = JSON.parse(cached); } catch(e) {
    sendPush(pushTo, '⚠️ 資料讀取異常，請重新傳照片。');
    return;
  }
  CacheService.getScriptCache().remove(key); // 用完即刪

  const caseName  = String(ocrData.project_name || '未填案名').trim();
  const items     = Array.isArray(ocrData.items) ? ocrData.items : [];
  const sourceId  = ocrData.sourceId || event.source.groupId || pushTo;

  if (items.length === 0) {
    sendPush(pushTo, '⚠️ 找不到品項資料，請重新傳照片。');
    return;
  }

  // 取用戶資訊
  const authName  = String(auth.name || '');
  const company   = auth.company || (authName.includes('-') ? authName.split('-')[0] : authName) || '未知公司';
  const userName  = authName.includes('-') ? authName.split('-')[1] : authName;
  const now       = new Date();
  const expire    = new Date(); expire.setDate(now.getDate() + 14);
  const requestId = 'REQ-' + Utilities.formatDate(now, 'GMT+8', 'MMdd-HHmm') + '-' + (Math.floor(Math.random() * 900) + 100);

  // 載入庫存資料進行庫存比對
  const priceSheet = dbSS.getSheetByName('編輯價目表') || dbSS.getSheetByName('編號價目表') || dbSS.getSheetByName(SHEET_NAME.PRICE);
  let priceData = priceSheet ? priceSheet.getDataRange().getValues() : [];
  const priceMap = (typeof getHeaderMap === 'function') ? getHeaderMap(priceData) : {};
  if (typeof filterPriceDataForUser === 'function') {
    priceData = filterPriceDataForUser(priceData, priceMap, auth);
  }
  const db = {
    price: priceData,
    stock: (typeof getStockSheet === 'function') ? getStockSheet() : [],
    main:  (typeof getMainSheet  === 'function') ? getMainSheet()  : []
  };
  const pMaps = {
    price: priceMap,
    stock: (typeof getHeaderMap === 'function') ? getHeaderMap(db.stock) : {},
    main:  (typeof getHeaderMap === 'function') ? getHeaderMap(db.main)  : {}
  };

  // 寫入「(保留暫存)」
  let sheet = dbSS.getSheetByName('(保留暫存)');
  if (!sheet) {
    sheet = dbSS.insertSheet('(保留暫存)');
    const headers = ['編號','數量','公司','地址','申請人','申請時間','到期時間','案名','進場日期','申請單號','來源ID','狀態'];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#D9E1F2');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  const uiCodes = [], uiQtys = [], uiSizes = [], stockChecks = [];
  let overallShortage = false;

  items.forEach(function(item) {
    const code    = String(item.product_code || '').toUpperCase().trim();
    const qty     = String(item.quantity || '') + (item.unit || '坪');
    const qtyVal  = parseFloat(String(item.quantity || 0)) || 0;
    const unit    = String(item.unit || '坪');
    let   sizeStr = '-';

    // 庫存比對
    const resolved = resolveStockFirstOrderMatch_(code, db, pMaps);
    if (resolved && resolved.primary) {
      const matched  = resolved.primary;
      const matchedCode = String(matched[resolved.priceMap['編號']] || code).toUpperCase();
      sizeStr = String(matched[resolved.priceMap['尺寸(cm)']] || '-');
      const ratio = (typeof getPcsPerPingFallback_ === 'function')
        ? getPcsPerPingFallback_(matched, resolved.priceMap)
        : ((typeof safeN === 'function' ? safeN(matched[resolved.priceMap['片/坪']]) : 1) || 1);
      const totalPcs = db.stock.filter(function(r) {
        return String(r[resolved.stockMap['編號']]).toUpperCase() === matchedCode && !String(r[resolved.stockMap['品名']]).includes('小計');
      }).reduce(function(acc, r) { return acc + (typeof safeN === 'function' ? safeN(r[resolved.stockMap['片數']]) : 0); }, 0);
      const resPcs = db.main.filter(function(r) {
        return String(r[pMaps.main['編號']]).toUpperCase().includes(matchedCode);
      }).reduce(function(acc, r) { return acc + (typeof safeN === 'function' ? safeN(r[pMaps.main['數量']]) : 0); }, 0);
      const avail = totalPcs - resPcs;
      const reqPcs = (unit === '坪' || unit.toLowerCase() === 'p') ? qtyVal * ratio : qtyVal;
      const isShort = avail < reqPcs * 0.95;
      if (isShort) overallShortage = true;
      stockChecks.push(code + ':' + Math.round(avail) + '片' + (isShort ? '(不足)' : ''));
    } else {
      stockChecks.push(code + ':查無(不足)');
      overallShortage = true;
    }

    sheet.appendRow([code, qty, company, '', userName, now, expire, caseName, '', requestId, sourceId, '待核准']);
    sheet.getRange(sheet.getLastRow(), 12).setBackground('#FFF2CC');
    uiCodes.push(code); uiQtys.push(qty); uiSizes.push(sizeStr);
  });

  lock.releaseLock();

  // 推 Telegram 通知
  if (typeof buildOrderApprovalTelegramText_ === 'function') {
    const tgMsg = buildOrderApprovalTelegramText_(
      auth, caseName, '',
      uiCodes.join(','), uiSizes.join(','), uiQtys.join(','),
      '', sourceId,
      overallShortage ? '不足' : '充足',
      stockChecks.join('|'),
      overallShortage, requestId
    );
    pushTelegram(tgMsg.text, tgMsg.buttons);
  }

  // Email 備份
  if (typeof sendEmailNotification === 'function') {
    sendEmailNotification(
      '📸 OCR 手寫單保留：' + caseName,
      '公司：' + company + '\n業務：' + userName + '\n案名：' + caseName +
      '\n品號：' + uiCodes.join(', ') + '\n數量：' + uiQtys.join(', ') +
      '\n申請單號：' + requestId
    );
  }

  // 回覆用戶
  sendPush(pushTo, '✅ 保留申請已送出！\n\n案名：' + caseName + '\n品項：' + uiCodes.length + ' 筆\n申請單號：' + requestId + '\n\n等待審核中，小高會通知您結果！😊');
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
 * 標準格式：A=時間 | B=使用者ID | C=姓名 | D=等級 | E=查詢內容 | F=LINE回覆 | G以後=診斷訊息
 */
function logFlexDebug(dbSS, userId, code, type, message, isSuccess) {
  try {
    const logSheet = dbSS.getSheetByName("log");
    if (!logSheet) return;
    const nowStr = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd HH:mm:ss");
    const lastRow = logSheet.getLastRow();

    // 從白名單讀取使用者資料
    let userName = "未知";
    let userLevel = "未知";
    try {
      const wlSheet = dbSS.getSheetByName(SHEET_NAME.WHITELIST);
      if (wlSheet) {
        const wlData = wlSheet.getDataRange().getValues();
        const wlMap = getHeaderMap(wlData);
        const userIdIdx = wlMap['使用者ID'] || wlMap['LINE用戶ID'];
        const nameIdx = wlMap['姓名'] || wlMap['名稱'];
        const levelIdx = wlMap['等級'] || wlMap['權限'];

        for (let i = 1; i < wlData.length; i++) {
          if (String(wlData[i][userIdIdx] || '').trim() === userId) {
            userName = String(wlData[i][nameIdx] || '未知').trim();
            userLevel = String(wlData[i][levelIdx] || '未知').trim();
            break;
          }
        }
      }
    } catch (e) {
      // 白名單讀取失敗，保持「未知」
    }

    // 查詢內容：品號 + 功能
    const typeLabel = type === 'intro' ? '系列介紹' : (type === 'scene' ? '傳送實景圖' : '模面變化圖');
    const queryContent = code + " " + typeLabel;

    // LINE 回覆狀態
    const lineReply = isSuccess ? "✅ 圖片已推送" : "❌ 推送失敗或無圖";

    // 構建日誌行：A~F 按標準格式，G 放診斷訊息
    const row = [
      nowStr,           // A: 時間
      userId,           // B: 使用者 ID
      userName,         // C: 姓名
      userLevel,        // D: 等級
      queryContent,     // E: 查詢內容
      lineReply,        // F: LINE 回覆
      message           // G: 診斷訊息
    ];

    // 填滿至 17 欄以保持格式一致
    for (let i = row.length; i < 17; i++) {
      row.push("");
    }
    logSheet.getRange(lastRow + 1, 1, 1, row.length).setValues([row]);
  } catch (e) {
    // 無聲失敗
  }
}

/**
 * 🚀 Flex 卡片按鈕 Postback 處理
 * 推送系列介紹、實景圖、模面變化圖（支援優先級讀取）
 * 診斷日誌寫入 LOG 分頁
 */
function handleFlexImagePostback(params, event, auth, dbSS) {
  const userId = event.source.userId;
  const replyToken = event.replyToken;  // 用於 REPLY API
  const code = String(params.c || '').toUpperCase().trim();
  const type = params.t; // intro, scene, piece

  if (!code) {
    sendPush(userId, "❌ 品號有誤，無法查詢。");
    return;
  }

  try {
    const priceSheet = dbSS.getSheetByName("編輯價目表") || dbSS.getSheetByName("編號價目表");
    if (!priceSheet) {
      sendPush(userId, "❌ 價目表未找到");
      return;
    }

    const priceData = priceSheet.getDataRange().getValues();
    const priceMap = getHeaderMap(priceData);
    const codeIdx = priceMap['編號'];

    if (codeIdx === undefined) {
      sendPush(userId, "❌ 欄位映射錯誤");
      return;
    }

    let matchedRow = null;
    for (let i = 1; i < priceData.length; i++) {
      if (String(priceData[i][codeIdx]).toUpperCase().trim() === code) {
        matchedRow = priceData[i];
        break;
      }
    }

    if (!matchedRow) {
      sendPush(userId, "❌ 找不到品號「" + code + "」");
      return;
    }

    const messages = [];
    logFlexDebug(dbSS, userId, code, type, "開始處理", false);

    if (type === 'intro') {
      let introUrl = null;

      // 優先級 1：系列介紹（列 44）→ Google Drive URL 用 wsrv.nl 轉換
      const introIdx = getColumnByName(priceMap, ['系列介紹']);
      if (introIdx !== undefined) {
        let rawUrl = String(matchedRow[introIdx] || '').trim();
        if (rawUrl && rawUrl.includes("http")) {
          // Google Drive URL 轉換為 wsrv.nl 代理 URL
          if (rawUrl.includes("drive.google.com")) {
            introUrl = "https://wsrv.nl/?url=" + encodeURIComponent(rawUrl) + "&w=600&q=80";
            logFlexDebug(dbSS, userId, code, type, "✅ L1 系列介紹（Drive→wsrv）", false);
          } else {
            introUrl = rawUrl;
            logFlexDebug(dbSS, userId, code, type, "✅ L1 系列介紹 URL", false);
          }
        } else {
          logFlexDebug(dbSS, userId, code, type, "⚠️ L1 系列介紹欄位為空或無效", false);
        }
      } else {
        logFlexDebug(dbSS, userId, code, type, "⚠️ 找不到系列介紹欄位", false);
      }

      // 優先級 2：R2_系列介紹（列 71）— 備用
      if (!introUrl) {
        const r2IntroIdx = getColumnByName(priceMap, ['R2_系列介紹']);
        if (r2IntroIdx !== undefined) {
          introUrl = String(matchedRow[r2IntroIdx] || '').trim();
          if (introUrl && introUrl.includes("http")) {
            logFlexDebug(dbSS, userId, code, type, "✅ L2 R2_系列介紹 URL", false);
          } else {
            introUrl = null;
            logFlexDebug(dbSS, userId, code, type, "⚠️ L2 R2_系列介紹欄位為空或無效", false);
          }
        } else {
          logFlexDebug(dbSS, userId, code, type, "⚠️ L2 找不到 R2_系列介紹欄位", false);
        }
      }

      if (introUrl) {
        const finalIntroUrl = normalizeImageUrlForLine(introUrl);
        messages.push({ type: "image", originalContentUrl: finalIntroUrl, previewImageUrl: finalIntroUrl });
      } else {
        logFlexDebug(dbSS, userId, code, type, "❌ 系列介紹欄位都是空的", false);
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
              logFlexDebug(dbSS, userId, code, type, "✅ L1 FLEX快取 原 " + cacheObj.scene.length + " → trim後 " + trimmedUrls.length + " → 去重後 " + uniqueSceneUrls.length + " 張圖");
            }
          } catch (e) {
            logFlexDebug(dbSS, userId, code, type, "⚠️ FLEX快取 JSON 解析失敗: " + e);
          }
        } else {
          logFlexDebug(dbSS, userId, code, type, "⚠️ L1 FLEX快取欄位為空或非 JSON");
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
          logFlexDebug(dbSS, userId, code, type, "✅ L2 R2_實景 原 " + r2Urls.length + " → 去重後 " + uniqueR2Urls.length + " 張圖");
        } else {
          logFlexDebug(dbSS, userId, code, type, "⚠️ L2 R2_實景 沒有有效 URL");
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
          logFlexDebug(dbSS, userId, code, type, "✅ L3 實景公式 取得 " + sceneUrls.length + " 張圖");
        } else {
          logFlexDebug(dbSS, userId, code, type, "⚠️ L3 實景公式 沒有有效 URL");
        }
      }

      if (sceneUrls.length === 0) {
        logFlexDebug(dbSS, userId, code, type, "❌ 三層優先級都讀不到 URL", false);
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
      // LINE API 限制：最多 5 張圖片
      const scenesForPush = uniqueFinalUrls.slice(0, 5);
      logFlexDebug(dbSS, userId, code, type, "✅ 最終實景圖 原 " + sceneUrls.length + " → 正規化後 " + normalizedUrls.length + " → 去重後 " + uniqueFinalUrls.length + " 張，推送前 " + scenesForPush.length + " 張", false);
      scenesForPush.forEach(url => {
        const finalSceneUrl = normalizeImageUrlForLine(url);
        messages.push({ type: "image", originalContentUrl: finalSceneUrl, previewImageUrl: finalSceneUrl });
      });

    } else if (type === 'piece') {
      const pieceUrls = [];

      // 優先級 1：單片 URL（列 61~69）
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
        logFlexDebug(dbSS, userId, code, type, "✅ L1 單片 取得 " + pieceUrls.length + " 張圖");
      }

      // 優先級 2：R2 單片連結（列 70）—— 備用
      if (pieceUrls.length === 0) {
        const r2PieceIdx = getColumnByName(priceMap, ['R2_單片連結網址']);
        if (r2PieceIdx !== undefined) {
          let url = String(matchedRow[r2PieceIdx] || '').trim();
          if (url && url.includes("http")) {
            pieceUrls.push(url);
            logFlexDebug(dbSS, userId, code, type, "✅ L2 R2_單片連結 取得 1 張圖");
          }
        } else {
          logFlexDebug(dbSS, userId, code, type, "⚠️ L2 R2_單片連結欄位不存在");
        }
      }

      if (pieceUrls.length === 0) {
        logFlexDebug(dbSS, userId, code, type, "❌ 單片/R2_單片都讀不到 URL", false);
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
      // LINE API 限制：最多 5 張圖片
      const piecesForPush = pieceUrls.slice(0, 5);
      logFlexDebug(dbSS, userId, code, type, "✅ 最終取得 " + pieceUrls.length + " 張，推送前 " + piecesForPush.length + " 張", false);
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

    if (messages.length > 0) {
      const payload = { replyToken: replyToken, messages: messages };
      try {
        const result = lineApiFetch('reply', payload);
        logFlexDebug(dbSS, userId, code, type, "✅ 推送成功 | " + result, true);
      } catch (replyErr) {
        logFlexDebug(dbSS, userId, code, type, "❌ 推送異常: " + replyErr, false);
      }
    } else {
      logFlexDebug(dbSS, userId, code, type, "❌ messages 陣列為空", false);
    }

  } catch (err) {
    logFlexDebug(dbSS, userId, code, type, "❌ 異常: " + err, false);
    sendPush(userId, "❌ 查詢失敗：" + err);
  }
}

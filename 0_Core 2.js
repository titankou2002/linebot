/**
 * 高雅瓷 AI 智能客服 - 2026 核心中樞 (v24.3)
 * 🏷️ Version: v1.3.0 - 2026-05-22 (新增保留單網頁表單 LIFF 端點)
 * 檔案：0_Core.gs
 * 🚩 【最高開發原則】：
 * 1. 邏輯繼承：嚴格保留業績隱私、精品推薦、庫存預檢等原始 v23.31 所有功能。
 * 2. 嚴禁縮寫：全量輸出，不打折扣。 [cite: 2026-01-29]
 */

const props = PropertiesService.getScriptProperties();
const CONFIG = {
  TOKEN: props.getProperty('LINE_CHANNEL_ACCESS_TOKEN'),
  ADMIN_TOKEN: props.getProperty('ADMIN_BOT_TOKEN') || props.getProperty('LINE_CHANNEL_ACCESS_TOKEN'),
  DATA_SS_ID: '1G5q-GixMWSdJJeF8ZiXWMOfrx4FMobER25jNc8m4Zds',
  // 保留單網頁表單寫入目標試算表
  FORM_SS_ID: '1WpBX1Bj-H0_452itfV38B7aIywRsqh-LTUKRfAkxpVs',
  // 保留單 LIFF App ID
  LIFF_ID_RESERVE: '2007666611-fbGOItDt',
  DAILY_LIMIT: 999,
  ADMIN_NOTIFY_ID: 'U8aa4bd4a7878addd35cb93fbf4b40d09',
  ADMIN_EMAIL: props.getProperty('ADMIN_EMAIL') || 'titankou2002@gmail.com',
  BOT_ID: '044dydtk'
};

/** 當試算表打開時，自動建立自訂選單 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu("高雅瓷保留管理")
    .addItem("🔄 一鍵同步保留單庫存", "syncReservationStock")
    .addSeparator()
    .addItem("⚡ 建立 FLEX 快取 (重新抓圖)", "batchBuildFlexCache")
    .addItem("🗑️ 清除所有 FLEX 快取", "clearAllFlexCache")
    .addToUi();
}

function manualSetupAnalysisTriggers() {
  PropertiesService.getScriptProperties().setProperty(
    'ADMIN_BOT_TOKEN', 
    '5aaalt0K05c/k3dH1DSnVX6cyc6FGcEUpawASN4PaklWyNgdKcaTSgYrm+6wBCH6pDcivyFnCCfasikUoFlEWV3+FoCduSoFOgWi10o/IN0FyuOOB5u1/wphbHNsK/7WI/CckF0N9BG2gTcGsCCX7QdB04t89/1O/w1cDnyilFU='
  );
  registerAnalysisTriggers();
  try {
    const ui = SpreadsheetApp.getUi();
    if (ui) {
      ui.alert('✅ 已成功啟用所有統計與分析排程觸發器，並配置後台管理機器人 Token！\n- 缺貨彙整：每 30 分鐘\n- 查詢日報：每天 18:30\n- 分析週報：每週一 08:30\n- 分析月報：每月 1 號 09:00');
    }
  } catch (e) {
    console.log('已成功註冊定時排程與 Token 配置（但當前環境無法顯示對話框彈窗）。');
  }
}

const SHEET_NAME = {
  MAIN: '保留單',
  STOCK: '庫存表',
  PRICE: '編號價目表',
  WHITELIST: '白名單',
  LOG: 'log',
  ORDER_REQUEST: '預留申請',
  CLOUD_RESERVE: '雲端保留'
};

// ==========================================
// 🌐 網頁表單 GET 端點 (doGet) — LIFF 使用
// ==========================================
function doGet(e) {
  const params = e.parameter || {};
  const action = params.action;
  const json   = (data) =>
    ContentService.createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);

  try {
    const wlData = getWhitelistSheet();
    const wlMap  = getHeaderMap(wlData);

    // ── 取得用戶資訊供表單顯示 ──
    if (action === 'getUserInfoForForm') {
      const userId = (params.userId || '').trim();
      if (!userId) return json({ success: false, error: '缺少 userId' });
      const auth = checkAuth(userId, wlData, wlMap);
      if (!auth.allowed) return json({ success: false, error: '查無此用戶，請聯繫業務開通權限。' });

      // 查出負責業務的姓名
      const salesId   = String(auth.salesID || '').trim();
      const salesRow  = salesId ? wlData.find(r => String(r[wlMap['userid']]) === salesId) : null;
      const salesName = salesRow ? String(salesRow[wlMap['名字']] || '').split('-').pop() : '';

      return json({
        success: true,
        company: auth.company || auth.name.split('-')[0] || '',
        sales:   salesName,
        level:   auth.level,
        name:    auth.name
      });
    }

    // ── 取得所有標準編號清單（供表單 autocomplete）──
    if (action === 'getAllProductCodes') {
      const userId = (params.userId || '').trim();
      const auth = checkAuth(userId, wlData, wlMap);
      if (!auth.allowed) return json({ success: false, error: '無權限' });

      let priceData = getPriceSheet();
      const priceMap  = getHeaderMap(priceData);
      if (typeof filterPriceDataForUser === 'function') {
        priceData = filterPriceDataForUser(priceData, priceMap, auth);
      }
      const codes     = priceData.slice(1).map(r => String(r[priceMap['編號']] || '').toUpperCase().trim()).filter(Boolean);
      const uniqueCodes = [...new Set(codes)];
      return json({ success: true, codes: uniqueCodes });
    }

    // ── 即時庫存狀態查詢（50% 缺口門檻）──
    if (action === 'checkStockForForm') {
      const userId = (params.userId || '').trim();
      const code   = (params.code   || '').trim().toUpperCase();
      const qty    = parseInt(params.qty) || 0;
      if (!code || !qty) return json({ status: 'error', error: '缺少參數' });

      const auth = checkAuth(userId, wlData, wlMap);
      if (!auth.allowed) return json({ status: 'error', error: '無權限' });

      const stockData = getStockSheet();
      const mainData  = getMainSheet();
      let priceData = getPriceSheet();
      const stockMap  = getHeaderMap(stockData);
      const mainMap   = getHeaderMap(mainData);
      const priceMap  = getHeaderMap(priceData);
      if (typeof filterPriceDataForUser === 'function') {
        priceData = filterPriceDataForUser(priceData, priceMap, auth);
      }

      // 🕵️ 尋找標準/最匹配的編號 (Canonical Code Resolution)
      let canonicalCode = code;
      let matchedRow = null;
      if (priceData && priceData.length > 0) {
        const matched = priceData.slice(1).filter(r => {
          const dbCode = String(r[priceMap['編號']] || '').toUpperCase().trim();
          if (dbCode === code) return true;
          const dbDigits = dbCode.replace(/\D/g, '');
          const inputDigits = code.replace(/\D/g, '');
          if (inputDigits.length >= 4 && dbDigits.indexOf(inputDigits) > -1) return true;
          if (dbCode.indexOf(code) > -1) return true;
          return false;
        });
        if (matched.length > 0) {
          matched.sort((a, b) => {
            const dbCodeA = String(a[priceMap['編號']] || '').toUpperCase().trim();
            const dbCodeB = String(b[priceMap['編號']] || '').toUpperCase().trim();
            if (dbCodeA === code) return -1;
            if (dbCodeB === code) return 1;
            return dbCodeA.length - dbCodeB.length;
          });
          canonicalCode = String(matched[0][priceMap['編號']] || '').toUpperCase().trim();
          matchedRow = matched[0];
        }
      }

      let imgUrl = '';
      let seriesName = '';
      let colorName = '';
      if (matchedRow) {
        if (priceMap['單片連結網址'] !== undefined) {
          imgUrl = String(matchedRow[priceMap['單片連結網址']] || '').trim();
        }
        if (priceMap['中文系列'] !== undefined) {
          seriesName = String(matchedRow[priceMap['中文系列']] || '').trim();
        }
        if (priceMap['顏色'] !== undefined) {
          colorName = String(matchedRow[priceMap['顏色']] || '').trim();
        }
      }

      const unit = String(params.unit || '片').trim();
      let reqPcs = qty;
      if (matchedRow) {
        const ratio = (typeof getPcsPerPingFallback_ === 'function') ? getPcsPerPingFallback_(matchedRow, priceMap) : 1;
        const pcsPerBox = (typeof safeN === 'function') ? (safeN(matchedRow[priceMap['片/箱']]) || safeN(matchedRow[priceMap['P/C']]) || 1) : 1;
        if (unit === '坪' || unit === 'p') {
          reqPcs = qty * ratio;
        } else if (unit === '箱' || unit === '包') {
          reqPcs = qty * pcsPerBox;
        }
      }

      const total    = stockData.filter(r => String(r[stockMap['編號']]).toUpperCase().trim() === canonicalCode && !String(r[stockMap['品名']]).includes('小計')).reduce((s, r) => s + safeN(r[stockMap['片數']]), 0);
      const reserved = mainData.filter(r => String(r[mainMap['編號']]).toUpperCase().includes(canonicalCode)).reduce((s, r) => s + safeN(r[mainMap['數量']]), 0);
      const avail    = total - reserved;
      const gap      = reqPcs - avail;
      const gapRatio = reqPcs > 0 ? gap / reqPcs : 0;

      const isAgent = ['sales', 'king', 'queen', 'admin'].includes(auth.level);
      const base    = { avail: Math.max(0, avail), reserved, total };

      const resPayload = {
        code: canonicalCode,
        imgUrl,
        series: seriesName,
        color: colorName,
        ...(isAgent ? base : {})
      };

      if (avail >= reqPcs)         return json({ status: 'ok',   ...resPayload });
      if (avail <= 0)              return json({ status: 'none', ...resPayload });
      if (gapRatio <= 0.5)         return json({ status: 'check',...resPayload });
      return json({ status: 'none', ...resPayload });
    }

    // ── Email 權限核准按鈕 ──
    if (params.ac === 'approveUser') {
      const app = HtmlService.createHtmlOutput();
      const fullName = decodeURIComponent(params.bn || '');
      const uid = decodeURIComponent(params.uid || '');
      if (!fullName || !uid) {
        app.append('<p style="font-family:sans-serif;text-align:center;margin-top:40px;color:red;">缺少必要參數</p>');
        return app;
      }
      try {
        if (typeof processUserApproval === 'function') processUserApproval(fullName, uid);
        app.append(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>審核完成</title><style>body{font-family:-apple-system,'PingFang TC',sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f8fafc}.card{background:#fff;padding:40px;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);text-align:center;max-width:400px;margin:20px}.check{width:64px;height:64px;background:#059669;color:#fff;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:32px;margin-bottom:16px}h2{color:#1e293b;margin:0 0 8px}p{color:#64748b;margin:0 0 4px;font-size:14px}.id{font-size:12px;color:#94a3b8;word-break:break-all;margin-top:12px}</style></head><body><div class="card"><div class="check">&#10003;</div><h2>已准許加入</h2><p>${escapeHtml(fullName)}</p><p class="id">${escapeHtml(uid)}</p><p style="margin-top:20px;font-size:12px;color:#94a3b8;">已自動寫入白名單，用戶將收到 LINE 通知。</p></div></body></html>`);
      } catch(err) {
        app.append(`<p style="font-family:sans-serif;text-align:center;margin-top:40px;color:red;">審核失敗：${escapeHtml(String(err))}</p>`);
      }
      return app;
    }

    if (params.ac === 'denyUser') {
      const app = HtmlService.createHtmlOutput();
      const uid = decodeURIComponent(params.uid || '');
      app.append(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>已拒絕</title><style>body{font-family:-apple-system,'PingFang TC',sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f8fafc}.card{background:#fff;padding:40px;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);text-align:center;max-width:400px;margin:20px}.x{width:64px;height:64px;background:#dc2626;color:#fff;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:32px;margin-bottom:16px}h2{color:#1e293b;margin:0 0 8px}p{color:#64748b;margin:0;font-size:14px}</style></head><body><div class="card"><div class="x">&#10007;</div><h2>已拒絕申請</h2>${uid ? `<p>${escapeHtml(uid)}</p>` : ''}<p style="margin-top:20px;font-size:12px;color:#94a3b8;">若要撤銷拒絕，請至 LINE 或金鑰庫操作。</p></div></body></html>`);
      return app;
    }

    // ── Telegram 保留單審核連結（核准單筆 / 核准整筆 / 拒絕整筆）──
    if (params.ac === 'approveOrder' || params.ac === 'denyOrder' || params.ac === 'approveOrderRow') {
      const app = HtmlService.createHtmlOutput();
      const requestId = decodeURIComponent(params.id || '');
      const code = decodeURIComponent(params.code || '');
      const approverName = 'Telegram審核';

      if (!requestId) {
        app.append('<p style="font-family:sans-serif;text-align:center;margin-top:40px;color:red;">缺少必要參數</p>');
        return app;
      }

      let res = { success: false, error: '未知動作' };
      let title = '操作失敗';
      try {
        const dbSS = getSpreadsheetInstance();
        if (params.ac === 'approveOrder') {
          res = approveOrderAll_(requestId, approverName, dbSS);
          title = res.success ? ('已核准整筆保留單（' + res.count + ' 筆品項）') : '核准失敗';
        } else if (params.ac === 'approveOrderRow') {
          res = approveOrderRow_(requestId, code, approverName, dbSS);
          title = res.success ? ('已核准品項：' + code) : '核准失敗';
        } else {
          res = denyOrderAll_(requestId, approverName, dbSS);
          title = res.success ? ('已拒絕整筆保留單（' + res.count + ' 筆品項）') : '拒絕失敗';
        }
      } catch (err) {
        res = { success: false, error: String(err) };
        title = '操作發生例外';
      }

      const icon = res.success ? '&#10003;' : '&#10007;';
      const color = res.success ? '#059669' : '#dc2626';
      app.append(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{font-family:-apple-system,'PingFang TC',sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f8fafc}.card{background:#fff;padding:40px;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);text-align:center;max-width:400px;margin:20px}.icon{width:64px;height:64px;background:${color};color:#fff;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:32px;margin-bottom:16px}h2{color:#1e293b;margin:0 0 8px}p{color:#64748b;margin:0 0 4px;font-size:14px}.id{font-size:12px;color:#94a3b8;word-break:break-all;margin-top:12px}</style></head><body><div class="card"><div class="icon">${icon}</div><h2>${escapeHtml(title)}</h2><p class="id">申請單號：${escapeHtml(requestId)}</p>${(!res.success && res.error) ? `<p style="color:#dc2626;">${escapeHtml(res.error)}</p>` : ''}</div></body></html>`);
      return app;
    }

  } catch (err) {
    return json({ success: false, error: String(err) });
  }

  return HtmlService.createHtmlOutputFromFile('reservation_form')
    .setTitle('高雅瓷 · 線上保留申請')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
}

function escapeHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ==========================================
// 🚀 Webhook 入口 (doPost)
// ==========================================
function doPost(e) {
  const tStart = Date.now();
  const output = ContentService.createTextOutput("OK");
  // 🚩 安全檢查：防止 malformed 請求
  if (!e || !e.postData) return output;

  // 🌸 高雅瓷 LINE 機器人專用 ─ 查貨與進度查詢擴充模組攔截器
  if (typeof handleLineBotWebhook_GaoYaCi === 'function') {
    if (handleLineBotWebhook_GaoYaCi(e)) {
      console.log(`[Perf] Intercepted by GaoYaCi in ${Date.now() - tStart}ms`);
      return output;
    }
  }

  let dbSS;
  try {
    dbSS = getSpreadsheetInstance();
    console.log(`[Perf] Spreadsheet instance fetched in ${Date.now() - tStart}ms`);
    const contents = JSON.parse(e.postData.contents);

    // 🚀 [v24.25 本地向量建庫對接端點]
    if (contents && contents.action === "appendVector") {
      let sheet = dbSS.getSheetByName("AI向量對照表");
      if (!sheet) {
        sheet = dbSS.insertSheet("AI向量對照表");
        const headers = ["編號", "檔案名稱", "類型", "縮圖連結", "AI特徵描述", "向量數據"];
        sheet.appendRow(headers);
        sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#F3F3F3");
      }
      const data = sheet.getDataRange().getValues();
      const exists = data.some(row => row[1] === contents.rowData[1]);
      if (!exists) {
        sheet.appendRow(contents.rowData);
        return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Successfully appended row" }))
          .setMimeType(ContentService.MimeType.JSON);
      } else {
        return ContentService.createTextOutput(JSON.stringify({ status: "skipped", message: "File already exists" }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }

    if (contents && contents.action === "loadVectors") {
      let sheet = dbSS.getSheetByName("AI向量對照表");
      if (!sheet) {
        return ContentService.createTextOutput(JSON.stringify({ status: "success", data: [] }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const data = sheet.getDataRange().getValues();
      if (data.length <= 1) {
        return ContentService.createTextOutput(JSON.stringify({ status: "success", data: [] }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const existingFiles = [];
      for (let i = 1; i < data.length; i++) {
        existingFiles.push(data[i][1]);
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success", data: existingFiles }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (contents && contents.action === "loadPriceList") {
      const sheet = dbSS.getSheetByName("編輯價目表") || dbSS.getSheetByName("編號價目表") || dbSS.getSheetByName(SHEET_NAME.PRICE);
      if (!sheet) {
        return ContentService.createTextOutput(JSON.stringify({ status: "success", data: [] }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const data = sheet.getDataRange().getValues();
      if (data.length <= 1) {
        return ContentService.createTextOutput(JSON.stringify({ status: "success", data: [] }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const headers = data[0];
      const codeIdx = headers.indexOf("編號");
      const seriesIdx = headers.indexOf("中文系列");
      const list = [];
      for (let i = 1; i < data.length; i++) {
        const code = String(data[i][codeIdx] || "").trim();
        const series = String(data[i][seriesIdx] || "").trim();
        if (code || series) {
          list.push({ code, series });
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success", data: list }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ── 保留單網頁表單提交 ──
    if (contents && contents.action === 'submitWebForm') {
      const result = (typeof handleWebFormSubmission === 'function')
        ? handleWebFormSubmission(contents, dbSS)
        : { success: false, error: 'handleWebFormSubmission 未定義' };
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (!contents || !contents.events || !contents.events[0]) return output;

    const event = contents.events[0];
    const replyToken = event.replyToken;
    const userId = (event.source.userId || '').trim();
    const sourceId = event.source.groupId || event.source.roomId || userId;
    const isGroup = event.source.type !== 'user';

    const db = {
      wl: getWhitelistSheet(),
      price: getPriceSheet()
    };
    const maps = {
      wl: getHeaderMap(db.wl),
      price: getHeaderMap(db.price)
    };
    const auth = checkAuth(userId, db.wl, maps.wl);
    if (auth.allowed && typeof filterPriceDataForUser === 'function') {
      db.price = filterPriceDataForUser(db.price, maps.price, auth);
    }

    // 🚩 A0. 處理加好友事件 (follow)
    if (event.type === 'follow') {
      // 1. 用 replyToken 回歡迎訊息（免費，不消耗 push 額度）
      const welcomeMsg = auth.allowed ? `歡迎回來！有什麼需要查詢的嗎？😊` : auth.msg;
      sendReply(replyToken, welcomeMsg, "", auth, false);

      // 2. 陌生人才通知管理員（改走 Telegram）
      if (!auth.allowed) {
        const timeStr = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy/MM/dd HH:mm:ss");
        if (typeof pushTelegram === 'function') {
          pushTelegram(
            `🆕 新用戶加好友\n⏰ ${timeStr}\n🆔 ${userId}\n\n等待對方回傳「公司-姓名」後可審核開通。`
          );
        }

        // Email 備份通知
        if (typeof sendEmailNotification === 'function') {
          sendEmailNotification('🆕 新用戶加好友通知',
            `有新用戶剛加入高雅瓷 AI 機器人好友！\n\n🆔 LINE User ID：${userId}\n⏰ 時間：${timeStr}\n\n請至白名單新增此 ID 並設定等級與名字。`);
        }
        writeLog(dbSS, sourceId, userId, "陌生人", "GUEST", "加好友", "follow-通知已發", "");
      }
      return output;
    }

    // 🚩 A. 處理 Postback 事件 (按鈕審核)
    if (event.type === 'postback') {
      if (typeof handlePostback === 'function') {
        handlePostback(event, auth, dbSS, maps);
      }
      return output;
    }

    // 🚩 A2. 處理圖片訊息 (手寫保留單智慧 OCR 辨識 v2 多品項版)
    if (event.type === 'message' && event.message.type === 'image') {
      const messageId = event.message.id;
      const base64Data = (typeof getLineImageBase64 === 'function') ? getLineImageBase64(messageId) : null;
      if (!base64Data) return output;

      const ocrResult = (typeof aiParseHandwrittenOrder === 'function') ? aiParseHandwrittenOrder(base64Data) : null;
      const liffUrl   = `https://liff.line.me/${CONFIG.LIFF_ID_RESERVE}`;

      // ── Case 1：有辨識到品項 ──
      if (ocrResult && Array.isArray(ocrResult.items) && ocrResult.items.length > 0) {
        const allItemsOk  = ocrResult.items.every(it => it.product_code && it.quantity);
        const isHighConf  = ocrResult.confidence === 'high' && !ocrResult.issues && ocrResult.project_name && allItemsOk;

        if (isHighConf) {
          // ✅ 高信心：顯示確認卡，等用戶按「確認送出」
          const cacheKey = 'ocr_' + userId.slice(0, 6) + '_' + Date.now().toString(36);
          CacheService.getScriptCache().put(cacheKey, JSON.stringify({
            project_name: ocrResult.project_name,
            items:        ocrResult.items,
            sourceId:     sourceId
          }), 600); // 10 分鐘有效

          if (typeof buildOCRConfirmFlex === 'function') {
            const confirmFlex = buildOCRConfirmFlex(ocrResult, cacheKey);
            sendFlexReply(replyToken, confirmFlex, auth, isGroup);
            writeLog(dbSS, sourceId, userId, auth.name, auth.level, "上傳手寫單", "OCR高信心-等確認", auth.email);
          }
        } else {
          // ⚠️ 低信心或有疑慮：回文字，列出辨識結果，請用戶確認或手動填
          let msg = '📸 小高辨識到以下內容，但有些地方不太確定，請確認一下：\n\n';
          if (ocrResult.project_name) msg += '📋 案名：' + ocrResult.project_name + '\n';
          msg += '\n品項：\n';
          ocrResult.items.forEach(function(item, idx) {
            const flag = item.uncertain ? ' ⚠️' : ' ✅';
            msg += (idx + 1) + '. ' + (item.product_code || '?') + '  ' + (item.quantity || '?') + (item.unit || '坪') + flag + '\n';
          });
          if (ocrResult.issues) msg += '\n⚠️ ' + ocrResult.issues + '\n';
          if (!ocrResult.project_name) msg += '\n❓ 案名看不清楚，請補上\n';
          msg += '\n若有誤請直接打字修正，或點連結重新填寫：\n' + liffUrl;
          sendReply(replyToken, msg, '', auth, isGroup);
          writeLog(dbSS, sourceId, userId, auth.name, auth.level, "上傳手寫單", "OCR低信心-引導確認", auth.email);
        }
        return output;
      }

      // ── Case 2：完全辨識失敗 ──
      const failMsg = '📸 小高看了好幾遍，這次沒能辨識出手寫單的品項 😅\n\n' +
        '可能是字跡模糊、角度傾斜或光線不足。\n\n' +
        '請改用文字輸入，格式如下：\n' +
        '●案名：[案名]\n編號：[品號]\n數量：[數量][單位]\n\n' +
        '或點連結開啟線上保留單：\n' + liffUrl;
      sendReply(replyToken, failMsg, '', auth, isGroup);
      writeLog(dbSS, sourceId, userId, auth.name, auth.level, "上傳手寫單", "OCR完全失敗-引導手動", auth.email);
      return output;
    }

    // 🚩 B. 處理文字訊息
    if (event.type === 'message' && event.message.type === 'text') {
      const input = (event.message.text || '').trim();
      const queries = input.split('\n').map(q => q.trim()).filter(q => q);

      // 1. 權限攔截 (未報到者，直接擋下)
      if (!auth.allowed) {
        // 🚩 [v24.2 修正補丁]：相容直接輸入「公司-姓名」或「報到公司-姓名」
        const isInfoInput = input.includes('-');
        if (input.startsWith('報到') || isInfoInput) {
          const applyRes = (typeof handleNewUserApply === 'function') ? handleNewUserApply(input, userId, sourceId) : "報到維護中";
          if (applyRes) {
            writeLog(dbSS, sourceId, userId, "申請人", "GUEST", input, "提交權限申請", "");
            return sendReply(replyToken, applyRes, "", auth, isGroup);
          }
        }
        if (!isGroup) return sendReply(replyToken, auth.msg + "\n請輸入「公司-姓名」申請權限。", "", auth, isGroup);
        return output;
      }

      // 🚩 2. [業績隱私機制]：業績查詢關鍵字攔截 (群組閉嘴 + 等級守門)
      const salesNames = ['謝博皓', '陳勁多', '潘右森'];
      const performanceKeywords = ['今日業績', '業績', '戰報'];
      if (salesNames.includes(input) || performanceKeywords.some(k => input.includes(k))) {
        if (isGroup) {
          return output;
        } else {
          const allowedLevels = ['sales', 'king', 'queen', 'admin'];
          if (!allowedLevels.includes(String(auth.level).toLowerCase())) {
            return sendReply(replyToken, "📊 業績資料為內部權限，如需查詢請聯繫業務人員。", "", auth, isGroup);
          }
          const target = salesNames.includes(input) ? input : null;
          if (typeof getStrategicPerformance === 'function') {
            return sendReply(replyToken, getStrategicPerformance(target), "", auth, isGroup);
          }
        }
      }

      // 🚩 3. [精品推薦路徑]：睡美人 (v671 簡化：內部統一讀取)
      if (input === '睡美人') {
        if (typeof handleSleepBeauty === 'function') {
          const sleepFlex = handleSleepBeauty(auth, dbSS);
          if (typeof sleepFlex === 'object') {
            return sendFlexReply(replyToken, sleepFlex, auth, isGroup);
          } else {
            return sendReply(replyToken, sleepFlex, "", auth, isGroup);
          }
        }
      }

      // 🚩 4. 物理級表單攔截
      const isFormSubmission = (input.includes('案名：') && input.includes('編號：')) || (input.includes('●案名'));
      if (isFormSubmission) {
        const dbFull = { ...db, stock: getStockSheet(), main: getMainSheet() };
        const mapsFull = { ...maps, stock: getHeaderMap(dbFull.stock), main: getHeaderMap(dbFull.main) };
        let orderRes = (typeof handleOrderRequest === 'function') ? handleOrderRequest(input, auth, sourceId, dbFull, mapsFull) : "保留功能維護中";
        if (Array.isArray(orderRes)) sendMultiReply(replyToken, orderRes, auth, isGroup);
        else sendReply(replyToken, orderRes, "", auth, isGroup);
        writeLog(dbSS, sourceId, userId, auth.name, auth.level, "提交保留單", "FormProcessed", auth.email);
        return output;
      }

      // 5. 一般訊息處理 (逐行拆解模式)
      if (queries.length === 1 && ['說明', '幫助', 'help', '指令'].includes(queries[0].toLowerCase())) {
        return sendReply(replyToken, getHelpText(auth), "", auth, isGroup);
      }

      let fullReply = "";
      let flexObject = null;
      let lastDetectedCode = "";
      let lastDetectedQty = "";
      let isInventoryQueryFound = false;

      for (let q of queries) {
        // (1) 索取範本指令 → 改為送出 LIFF 按鈕卡片
        if (['下保留', '填保留單'].some(k => q.includes(k))) {
          const isFilling = q.includes('●案名') || q.includes('案名：');
          if (!isFilling) {
            // 純「下保留」指令 → 送 LIFF Flex 按鈕
            const reserveFlex = (typeof handleTemplateRequest === 'function')
              ? handleTemplateRequest(q, auth, db.price, maps.price)
              : null;
            if (reserveFlex && typeof reserveFlex === 'object') {
              sendFlexReply(replyToken, reserveFlex, auth, isGroup);
              writeLog(dbSS, sourceId, userId, auth.name, auth.level, q, 'LIFF保留單按鈕', auth.email);
              return output;
            }
          }
          // 若已含填寫內容（●案名），走舊的文字解析流程
          const dbFull = { ...db, stock: getStockSheet(), main: getMainSheet() };
          const mapsFull = { ...maps, stock: getHeaderMap(dbFull.stock), main: getHeaderMap(dbFull.main) };
          let res = (typeof handleOrderRequest === 'function') ? handleOrderRequest(q, auth, sourceId, dbFull, mapsFull) : "";
          if (Array.isArray(res)) { sendMultiReply(replyToken, res, auth, isGroup); return output; }
          fullReply += res + "\n";
          continue;
        }

        // (2) 視覺分流
        const visualReg = /圖片|照片|圖檔|看圖|實景|完工照|實蹟圖|實景圖|flex|圖|照|看|3D/i;
        const specKeys = /重量|幾片|公斤|多重|包裝|尺寸|片數|箱裝|多少|重|箱/;
        const qtyKeys = /\d+(?:\.\d+)?\s*(坪|p|片|箱|包)/i;
        if (visualReg.test(q) && !specKeys.test(q)) {
          if (typeof handleFlexTest === 'function') {
            flexObject = handleFlexTest(q, db, maps);
            if (flexObject) {
              // 🚩 [bubble fix] 記下這次查詢的編號，讓圖片下方的泡泡能帶著編號
              const visCodeMatch = q.match(/[a-zA-Z]{2,4}\d{5,}/) || q.match(/\d{5,}(?:-[a-zA-Z0-9]+)?/);
              if (visCodeMatch) lastDetectedCode = visCodeMatch[0].toUpperCase();
              break;
            } else {
              // 🚩 [v24.2] 如果明確要看圖但沒結果，不准落到庫存文字
              fullReply += `📷 抱歉，目前找不到「${q.replace(visualReg, '').trim()}」的相關圖檔。請確認編號或洽詢業務。`;
              break;
            }
          }
        }

        // (3) 核心路由
        let result = routeDispatcher(q, db, maps, auth, isGroup, dbSS);
        if (typeof result === 'object' && result !== null) {
          flexObject = result; break;
        } else if (result) {
          fullReply += result + "\n";
          const codeMatch = q.match(/\d{5,}(?:-[a-zA-Z0-9]+)?/) || q.match(/[a-zA-Z]{2,4}\d{5,}/);
          const qtyMatch = q.match(/(\d+(?:\.\d+)?)\s*(坪|p|片|箱|包)/i);
          if (codeMatch) lastDetectedCode = codeMatch[0].toUpperCase();
          if (qtyMatch) lastDetectedQty = qtyMatch[0];

          const washedQ = (typeof washText === 'function') ? washText(q) : q;
          const numMatch = q.match(/\d{5,}(?:-[a-zA-Z0-9]+)?/) || q.match(/[a-zA-Z]{2,4}\d{5,}/);
          const isInvQ = q.includes('庫存') || qtyMatch || numMatch || (washedQ.length >= 4);
          if (isInvQ && !q.includes('價格') && !q.includes('價錢') && !q.includes('實際尺寸') && !q.includes('尺寸') && !q.includes('保留') && !q.includes('過期') && !q.includes('業績') && !q.includes('戰報') && !q.includes('睡美人')) {
            isInventoryQueryFound = true;
          }
        }
      }

      if (flexObject) {
        sendFlexReply(replyToken, flexObject, auth, isGroup, lastDetectedCode);
        writeLog(dbSS, sourceId, userId, auth.name, auth.level, input, "FLEX", auth.email);
      } else if (fullReply.trim()) {
        const finalCode = lastDetectedQty ? (lastDetectedCode + " " + lastDetectedQty) : lastDetectedCode;
        sendReply(replyToken, fullReply.trim(), finalCode, auth, isGroup);
        if (!isInventoryQueryFound) {
          writeLog(dbSS, sourceId, userId, auth.name, auth.level, input, "回覆", auth.email);
        }

        // 🚩 [v24.2] 業務通知攔截
        if (typeof handleSalesPush === 'function') {
          handleSalesPush(auth, queries, fullReply, userId);
        }
      } else {
        // 🚀 【Gemma AI / Gemini 智慧自然語言分流引擎】
        if (!isGroup && typeof aiParseUserIntent === 'function') {
          const nlp = aiParseUserIntent(input);

          if (nlp && nlp.intent !== "other") {
            const code = nlp.product_code;

            // 🚩 1. 客戶想找圖片 (image_query)
            if (nlp.intent === "image_query" && code) {
              if (typeof handleFlexTest === 'function') {
                const flexObj = handleFlexTest(code + " 圖片", db, maps);
                if (flexObj) {
                  sendFlexReply(replyToken, flexObj, auth, isGroup, code.toUpperCase());
                  writeLog(dbSS, sourceId, userId, auth.name, auth.level, input, "AI-找圖", auth.email);
                  return output;
                }
              }
            }

            // 🚩 2. 問價格 (price_query)
            if (nlp.intent === "price_query" && code) {
              const priceRes = (typeof handlePriceSearch === 'function') ? handlePriceSearch(code, db.price, maps.price, auth.level, isGroup) : "";
              if (priceRes) {
                sendReply(replyToken, priceRes, code, auth, isGroup);
                writeLog(dbSS, sourceId, userId, auth.name, auth.level, input, "AI-問價", auth.email);
                return output;
              }
            }

            // 🚩 3. 問規格/包裝 (spec_query)
            if (nlp.intent === "spec_query" && code) {
              const specQueryText = nlp.spec_keyword || "包裝";
              const specRes = (typeof handleProductSpecSearch === 'function') ? handleProductSpecSearch(code, db.price, maps.price, specQueryText) : "";
              if (specRes) {
                sendReply(replyToken, specRes, code, auth, isGroup);
                writeLog(dbSS, sourceId, userId, auth.name, auth.level, input, "AI-規格", auth.email);
                return output;
              }
            }

            // 🚩 4. 問庫存 (inventory_query)
            if (nlp.intent === "inventory_query" && code) {
              const dbFull = { ...db, stock: getStockSheet(), main: getMainSheet() };
              const mapsFull = { ...maps, stock: getHeaderMap(dbFull.stock), main: getHeaderMap(dbFull.main) };
              const qty = nlp.quantity || null;
              const unit = nlp.unit || null;
              const invRes = (typeof handleInventorySearch === 'function') ? handleInventorySearch(code + (qty ? " " + qty + (unit || "坪") : ""), qty, unit, dbFull, mapsFull, auth, isGroup) : "";
              if (invRes) {
                sendReply(replyToken, invRes, code, auth, isGroup);
                // Enhanced logging is handled inside handleInventorySearch
                return output;
              }
            }

            // 🚩 5. 串接下保留單並寫入後台 (reserve_request)
            if (nlp.intent === "reserve_request" && code) {
              const proj = nlp.project_name || auth.name || "未填案名";
              const qty = nlp.quantity || 1;
              const unit = nlp.unit || "坪";

              const virtualForm = `●案名：${proj}\n編號：${code}\n數量：${qty}${unit}`;

              const dbFull = { ...db, stock: getStockSheet(), main: getMainSheet() };
              const mapsFull = { ...maps, stock: getHeaderMap(dbFull.stock), main: getHeaderMap(dbFull.main) };

              if (typeof handleOrderRequest === 'function') {
                let orderRes = handleOrderRequest(virtualForm, auth, sourceId, dbFull, mapsFull);
                if (Array.isArray(orderRes)) sendMultiReply(replyToken, orderRes, auth, isGroup);
                else sendReply(replyToken, orderRes, code, auth, isGroup);
                writeLog(dbSS, sourceId, userId, auth.name, auth.level, input, "AI-口語保留單", auth.email);
                return output;
              }
            }
          }

          // 🚩 6. 智慧閒聊對話
          if (typeof aiChatFriendly === 'function') {
            const aiChatReply = aiChatFriendly(input, auth);
            const isFallback = !aiChatReply || aiChatReply.includes("恍神");
            if (!isFallback) {
              sendReply(replyToken, aiChatReply, "", auth, isGroup);
              writeLog(dbSS, sourceId, userId, auth.name, auth.level, input, "AI對話", auth.email);
              return output;
            }
          }

          // 🚩 7. 無法識別指令時的「不明指令引導泡泡卡片」
          if (typeof buildUnknownGuideBubble === 'function') {
            const guideFlex = buildUnknownGuideBubble(auth);
            sendFlexReply(replyToken, guideFlex, auth, isGroup);
            writeLog(dbSS, sourceId, userId, auth.name, auth.level, input, "引導泡泡", auth.email);
            return output;
          }
        }
      }
    }
    console.log(`[Perf] Request successfully completed in ${Date.now() - tStart}ms`);
  } catch (err) {
    try {
      const ss = getSpreadsheetInstance();
      writeLog(ss, "CRASH", "ERROR", "SYSTEM", "FAIL", "doPost", String(err), "");
    } catch (e) { }
  }
  return output;
}

// ==========================================
// 🕵️ 意圖分析分流器
// ==========================================
function routeDispatcher(q, db, maps, auth, isGroup, dbSS) {
  // 🚩 顏色智慧分流引導 (圖2)
  if (typeof isColorInput === 'function' && isColorInput(q, db, maps)) {
    if (typeof buildColorGuideFlex === 'function') {
      return buildColorGuideFlex(q, auth);
    }
  }

  // 🚩 系列名稱智慧分流：FREE 顯示系列圖卡引導，SALES 以上顯示全系列庫存總覽
  if (typeof isSeriesInput === 'function') {
    const matchedSeries = isSeriesInput(q, db, maps);
    if (matchedSeries) {
      const isAgent = ['sales', 'king', 'queen', 'admin'].includes(String(auth ? auth.level : 'free').toLowerCase());
      if (isAgent) {
        const dbFull = { ...db, stock: getStockSheet(), main: getMainSheet() };
        const mapsFull = { ...maps, stock: getHeaderMap(dbFull.stock), main: getHeaderMap(dbFull.main) };
        const seriesRes = (typeof handleSeriesInventorySearch === 'function') ? handleSeriesInventorySearch(matchedSeries, dbFull, mapsFull, auth, isGroup) : "";
        if (seriesRes) return seriesRes;
      } else if (typeof buildSeriesGuideFlex === 'function') {
        const guide = buildSeriesGuideFlex(matchedSeries, db, maps, auth);
        if (guide) return guide;
      }
    }
  }

  const washedQ = (typeof washText === 'function') ? washText(q) : q;
  const numMatch = q.match(/\d{5,}(?:-[a-zA-Z0-9]+)?/) || q.match(/[a-zA-Z]{2,4}\d{5,}/);

  // 🚩 [v24.2 群組沈默門檻]：嚴格攔截無意義討論
  if (isGroup) {
    const actionKeys = /有貨|有嗎|剩多少|幾片|幾坪|價格|價錢|看圖|圖片|照片|實景|實景圖|完工照|圖檔|實際尺寸|保留|過期|重量|包裝|幫助|說明/;
    const qtyKeys = /\d+(?:\.\d+)?\s*(坪|p|片|箱|包)/i;
    const isExplicitInstruction = ['下保留', '填保留單'].some(k => q.includes(k));

    // 如果沒有動作關鍵字、沒有數量單位、也不是明確指令，則保持沈默
    if (!actionKeys.test(q) && !qtyKeys.test(q) && !isExplicitInstruction) {
      return "";
    }
  }

  const sizeMatch = q.match(/(\d{2,4})\s*[xX*＊×]\s*(\d{2,4})/);
  if (washedQ.length <= 1 && !numMatch && !sizeMatch) return "";
  const targetCode = numMatch ? numMatch[0] : washedQ;

  if (q.includes('價格') || q.includes('價錢')) {
    if (isGroup) return "🔒 報價隱私保護，請私訊查詢。";
    return (typeof handlePriceSearch === 'function') ? handlePriceSearch(targetCode, db.price, maps.price, auth.level, isGroup) : "";
  }

  if (q.includes('實際尺寸') || q.includes('尺寸')) {
    const dbFull = { ...db, stock: getStockSheet() };
    const mapsFull = { ...maps, stock: getHeaderMap(dbFull.stock) };
    return (typeof handleActualSizeSearch === 'function') ? handleActualSizeSearch(targetCode, dbFull, mapsFull, auth.level, isGroup) : "";
  }

  if (q.includes('保留') || q.includes('過期')) {
    const dbFull = { ...db, main: getMainSheet() };
    const mapsFull = { ...maps, main: getHeaderMap(dbFull.main) };

    // 🚩 [v24.2] 過期保留預警：優先路由
    const isExpireQuery = (q.includes('過期') || (q.includes('保留') && /\d+\s*天/.test(q)));
    if (isExpireQuery) {
      return (typeof handleExpiredReservations === 'function') ? handleExpiredReservations(q, dbFull, mapsFull, auth) : "";
    }

    return (typeof handleReserveSearch === 'function') ? handleReserveSearch(q, targetCode, dbFull, mapsFull, auth) : "";
  }

  // 🚩 [v24.2] 業績與戰報路由 (限 sales/king/queen/admin)
  if (q.includes('業績') || q.includes('戰報')) {
    const allowedLevels = ['sales', 'king', 'queen', 'admin'];
    if (!allowedLevels.includes(String(auth ? auth.level : '').toLowerCase())) {
      return "📊 業績資料為內部權限，如需查詢請聯繫業務人員。";
    }
    if (q.includes('睡美人')) {
      return (typeof handleSleepBeautyPerformance === 'function') ? handleSleepBeautyPerformance() : "💎 睡美人報表未就緒。";
    }
    return (typeof getStrategicPerformance === 'function') ? getStrategicPerformance(null) : "📊 報表引擎未就緒。";
  }

  // 🚩 [v24.2] 睡美人精品路由
  if (q.includes('睡美人')) {
    return (typeof handleSleepBeautySelection === 'function') ? handleSleepBeautySelection(auth) : "✨ 精品引擎未就緒。";
  }

  const specKeys = ['幾片', '重量', '包裝', '公斤', '一箱', '箱裝', '片數', '多重', '重'];
  if (specKeys.some(k => q.includes(k)) || /(尺寸|寸)/.test(q)) {
    return (typeof handleProductSpecSearch === 'function') ? handleProductSpecSearch(targetCode, db.price, maps.price, q) : "";
  }

  const qtyMatch = q.match(/(\d+(?:\.\d+)?)\s*(坪|p|片|箱|包)/i);
  const isInventoryQuery = q.includes('庫存') || qtyMatch || numMatch || (washedQ.length >= 4);
  if (isInventoryQuery) {
    const dbFull = { ...db, stock: getStockSheet(), main: getMainSheet() };
    const mapsFull = { ...maps, stock: getHeaderMap(dbFull.stock), main: getHeaderMap(dbFull.main) };
    const invResult = (typeof handleInventorySearch === 'function')
      ? handleInventorySearch(q, (qtyMatch ? qtyMatch[1] : null), (qtyMatch ? qtyMatch[2] : null), dbFull, mapsFull, auth, isGroup)
      : "";
    // 🚩 [A+C] 品號查無結果時的智慧回應（防止落到「小高服務指南」卡片）
    if (!invResult && numMatch) {
      return buildCodeNotFoundReply(numMatch[0].toUpperCase(), db.price, maps.price);
    }
    return invResult;
  }
  return "";
}

/**
 * 🚩 [A+C] 品號查無結果時的智慧回應
 * Plan C：先嘗試部分模糊比對，若找到相近品號就推薦
 * Plan A：模糊也找不到時，回固定短文引導用戶
 */
function buildCodeNotFoundReply(inputCode, priceData, priceMap) {
  const clean = String(inputCode || '').replace(/[^A-Z0-9]/g, '');
  if (clean.length < 4) return "";

  // 🔍 Plan C：模糊比對（DB 品號含輸入字串，或輸入字串含 DB 品號前綴）
  const fuzzyMatches = [];
  const seen = new Set();
  if (priceData && priceData.length > 1) {
    priceData.slice(1).forEach(function(r) {
      const dbCode = String(r[priceMap['編號']] || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!dbCode || seen.has(dbCode)) return;
      if (dbCode.indexOf(clean) > -1 || clean.indexOf(dbCode) > -1) {
        seen.add(dbCode);
        fuzzyMatches.push(r);
      }
    });
  }

  if (fuzzyMatches.length > 0) {
    let msg = '🔍 找不到完整品號「' + inputCode + '」\n以下是相近品號，請確認：\n──────\n';
    fuzzyMatches.slice(0, 4).forEach(function(r) {
      const code   = String(r[priceMap['編號']]      || '').toUpperCase();
      const series = String(r[priceMap['中文系列']]   || '').trim();
      const size   = String(r[priceMap['尺寸(cm)']]  || '').trim();
      msg += '▫️ ' + code;
      var info = [series, size].filter(Boolean).join(' ');
      if (info) msg += ' (' + info + ')';
      msg += '\n';
    });
    msg += '\n輸入完整品號＋坪數即可查庫存！';
    return msg;
  }

  // 🚩 Plan A：模糊也無結果，固定短文
  return '找不到「' + inputCode + '」😅\n\n可能是：品號有誤 / 此款已下架售完\n\n試試輸入部分品號（例如「' + clean.substring(0, 4) + '」）讓我模糊搜尋！';
}

/** 🚩 權限感知說明手冊 (v24.2) */
function getHelpText(auth) {
  const level = String(auth ? auth.level : 'free').toLowerCase();
  const isAgent = ['sales', 'king', 'queen', 'admin'].includes(level);

  let h = "✨ 高雅瓷 AI 小幫手 ✨\n\n" +
    "🟢 查庫存 (最常用!) \n" +
    "編號 + 坪數or片數\n" +
    "(例: AA61250 50坪)\n\n" +
    "🖼️查圖片 / 實景 \n" +
    "編號 + 圖片\n" +
    "(例: AA61250圖片)\n\n";

  if (isAgent) {
    h += "📊 查業績戰報 \n" +
      "輸入「今日業績」或「戰報」\n\n" +
      "📌 查保留單 (全域) \n" +
      "產品編號 或 客戶名 + 保留\n" +
      "(例: AA61250保留 或 漢樺保留)\n\n";
  } else {
    h += "📌 查自家保留 \n" +
      "「公司名 + 保留」\n" +
      "(例:漢樺保留)\n\n";
  }

  h += "💎 睡美人精品推薦 \n" +
    "輸入「睡美人」";

  if (isAgent) {
    h += "\n\n💡 提示：查詢「保留過期」或「編號+天數」可快速抓出逾期案件！🚀";
  }

  return h;
}

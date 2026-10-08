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

    // ── 取得用戶資訊供表單顯示 (自動拆解「百磚-大t」格式) ──
    if (action === 'getUserInfoForForm') {
      const userId = (params.userId || '').trim();
      if (!userId) return json({ success: false, error: '缺少 userId' });
      const auth = checkAuth(userId, wlData, wlMap);
      if (!auth.allowed) return json({ success: false, error: '查無此用戶，請聯繫業務開通權限。' });

      // 自動拆解「百磚-大t」格式
      const rawName = String(auth.name || '').trim();
      const parts = rawName.split(/[-_]/);
      let companyName = auth.company || (parts.length > 1 ? parts[0] : rawName);
      let salesName = parts.length > 1 ? parts[1] : '';

      if (!salesName && auth.salesID) {
        const salesId = String(auth.salesID || '').trim();
        const salesRow = wlData.find(r => String(r[wlMap['userid']]) === salesId);
        if (salesRow) salesName = String(salesRow[wlMap['名字']] || '').split(/[-_]/).pop();
      }
      if (!salesName) salesName = '客服';

      return json({
        success: true,
        company: companyName,
        sales:   salesName,
        level:   auth.level,
        name:    auth.name
      });
    }

    // ── 查詢客戶歷史保留單據 API ──
    if (action === 'getUserReservations') {
      const userId = (params.userId || '').trim();
      const auth = checkAuth(userId, wlData, wlMap);
      const mainData = getMainSheet();
      const mainMap = getHeaderMap(mainData);

      const userCompany = (params.company || auth.company || auth.name.split(/[-_]/)[0] || '').trim();

      const reservationsMap = {};
      mainData.slice(1).forEach(r => {
        const reqId = String(r[mainMap['申請單號']] || r[mainMap['單號']] || '').trim();
        const comp  = String(r[mainMap['客戶名稱']] || r[mainMap['公司']] || '').trim();
        const uId   = String(r[mainMap['UserID']] || '').trim();

        if (reqId && (uId === userId || (userCompany && comp.includes(userCompany)))) {
          if (!reservationsMap[reqId]) {
            reservationsMap[reqId] = {
              requestId: reqId,
              caseName: String(r[mainMap['案名']] || r[mainMap['工地案名']] || '').trim(),
              address: String(r[mainMap['地址']] || r[mainMap['工地地址']] || '').trim(),
              entryDate: String(r[mainMap['進場日期']] || '').trim(),
              status: String(r[mainMap['審核狀態']] || '待審核').trim(),
              createdAt: String(r[mainMap['建立時間']] || '').trim(),
              items: []
            };
          }
          reservationsMap[reqId].items.push({
            code: String(r[mainMap['編號']] || '').trim(),
            qty: String(r[mainMap['數量']] || '').trim()
          });
        }
      });

      const list = Object.values(reservationsMap).sort((a, b) => (b.requestId > a.requestId ? 1 : -1));
      return json({ success: true, list: list });
    }

    // ── 取得所有標準編號清單（包含今友利短編號，供表單 autocomplete）──
    if (action === 'getAllProductCodes') {
      const userId = (params.userId || '').trim();
      const auth = checkAuth(userId, wlData, wlMap);
      if (!auth.allowed) return json({ success: false, error: '無權限' });

      let priceData = getPriceSheet();
      const priceMap  = getHeaderMap(priceData);
      if (typeof filterPriceDataForUser === 'function') {
        priceData = filterPriceDataForUser(priceData, priceMap, auth);
      }
      const codes = priceData.slice(1).map(r => String(r[priceMap['編號']] || '').toUpperCase().trim()).filter(Boolean);
      
      // 聯查今友利編號
      if (typeof getJinYouLiSheetData_ === 'function') {
        const jylData = getJinYouLiSheetData_();
        if (jylData && jylData.length > 1) {
          const jMap = getHeaderMap(jylData);
          const iCode = jMap['編號'];
          if (iCode !== undefined) {
            jylData.slice(1).forEach(r => {
              const c = String(r[iCode] || '').toUpperCase().trim();
              if (c) codes.push(c);
            });
          }
        }
      }

      const uniqueCodes = [...new Set(codes)];
      return json({ success: true, codes: uniqueCodes });
    }

    // ── 全行為日誌寫入 API (logUserAction) ──
    if (action === 'logUserAction') {
      const userId = (params.userId || '').trim();
      const userAction = (params.userAction || 'UI_INTERACTION').trim();
      const auth = checkAuth(userId, wlData, wlMap);
      const salesName = (auth.salesID ? String(auth.salesID) : '');
      const extraData = {
        productCode: (params.code || '').toUpperCase().trim(),
        reqQty: params.qty ? `${params.qty}${params.unit || ''}` : '',
        availPcs: params.availPcs || 0,
        stockStatus: params.status || '',
        actionType: userAction,
        salesRepName: salesName
      };
      writeEnhancedLog(getSpreadsheetInstance(), "WEB_MINI_APP", userId, auth.name, auth.level, userAction, userAction, auth.email, extraData);
      return json({ success: true });
    }

    // ── 即時庫存狀態與產品明細查詢（含今友利與放寬比對）──
    if (action === 'checkStockForForm') {
      const userId = (params.userId || '').trim();
      const code   = (params.code   || '').trim().toUpperCase();
      const qty    = parseFloat(params.qty) || 0;
      if (!code) return json({ status: 'error', error: '缺少編號參數' });

      const auth = checkAuth(userId, wlData, wlMap);
      
      const stockData = getStockSheet();
      const mainData  = getMainSheet();
      const rawPriceData = getPriceSheet();
      const stockMap  = getHeaderMap(stockData);
      const mainMap   = getHeaderMap(mainData);
      const priceMap  = getHeaderMap(rawPriceData);

      let priceData = rawPriceData;
      if (auth.allowed && typeof filterPriceDataForUser === 'function') {
        priceData = filterPriceDataForUser(rawPriceData, priceMap, auth);
      }

      // 🕵️ 1. 超級放寬品號比對（完全忽略大小寫、空格、連字符，支援純數字如 6150）
      const cleanInputCode = code.replace(/[\s-]/g, '').toUpperCase();
      const inputDigits = code.replace(/\D/g, '');
      const inputSuffixMatch = code.match(/-[A-Z0-9]+$/i);
      const inputSuffix = inputSuffixMatch ? inputSuffixMatch[0].toUpperCase() : "";

      const findInList = (list) => {
        if (!list || list.length < 2) return null;
        return list.slice(1).find(r => {
          const dbCode = String(r[priceMap['編號']] || '').toUpperCase().trim();
          if (!dbCode) return false;
          const cleanDbCode = dbCode.replace(/[\s-]/g, '');
          if (dbCode === code || cleanDbCode === cleanInputCode) return true;
          
          // 數字對齊 + 後綴一致 (支援純數字如 6150 匹配 AA6150)
          const dbDigits = dbCode.replace(/\D/g, '');
          const dbSuffixMatch = dbCode.match(/-[A-Z0-9]+$/i);
          const dbSuffix = dbSuffixMatch ? dbSuffixMatch[0].toUpperCase() : "";

          if (inputDigits && inputDigits.length >= 3 && (dbDigits === inputDigits || dbDigits.indexOf(inputDigits) !== -1)) {
            return inputSuffix ? (inputSuffix === dbSuffix) : true;
          }
          return false;
        });
      };

      let matchedRow = findInList(priceData) || findInList(rawPriceData);
      let canonicalCode = matchedRow ? String(matchedRow[priceMap['編號']]).toUpperCase().trim() : code;

      // 2. 聯查今友利獨立資料庫
      let jinItem = null;
      if (!matchedRow && typeof getJinYouLiSingleItem_ === 'function') {
        const jyl = getJinYouLiSingleItem_(code);
        if (jyl && jyl.replyText) jinItem = jyl;
      }

      const isAgentUser = ['sales', 'king', 'queen', 'admin'].includes(String(auth ? auth.level : 'free').toLowerCase());

      if (jinItem) {
        const jInfo = jinItem.replyText;
        const brandMatch = jInfo.match(/品牌：([^\n]+)/);
        const seriesMatch = jInfo.match(/系列：([^\n]+)/);
        const sizeMatch = jInfo.match(/尺寸：([^\n]+)/);
        const stockMatch = jInfo.match(/庫存：(\d+)片/);
        const availMatch = jInfo.match(/可用：(\d+)片/);
        const availPcs = availMatch ? parseInt(availMatch[1]) : (stockMatch ? parseInt(stockMatch[1]) : 0);

        let imgUrl = "";
        if (typeof getJinYouLiInventoryForCode_ === 'function') {
          const jData = getJinYouLiInventoryForCode_(code);
          if (jData && jData.imageUrl) imgUrl = jData.imageUrl;
        }

        const isOk = availPcs >= qty;
        return json({
          status: isOk ? 'ok' : (availPcs > 0 ? 'check' : 'none'),
          code: code,
          series: seriesMatch ? seriesMatch[1].trim() : '今友利系列',
          size: sizeMatch ? sizeMatch[1].trim() : '標準規格',
          pcsPerBox: 1,
          weight: '約 30 kg/箱',
          imgUrl: imgUrl,
          availPcs: availPcs,
          isAgent: isAgentUser
        });
      }

      // 高雅瓷主資料處理
      let imgUrl = '';
      let seriesName = '';
      let colorName = '';
      let sizeName = '';
      let weightName = '';
      let pcsPerBox = 1;

      if (matchedRow) {
        if (priceMap['單片連結網址'] !== undefined) imgUrl = String(matchedRow[priceMap['單片連結網址']] || '').trim();
        if (priceMap['中文系列'] !== undefined) seriesName = String(matchedRow[priceMap['中文系列']] || '').trim();
        if (priceMap['顏色'] !== undefined) colorName = String(matchedRow[priceMap['顏色']] || '').trim();
        if (priceMap['尺寸(cm)'] !== undefined) sizeName = String(matchedRow[priceMap['尺寸(cm)']] || '').trim();
        if (priceMap['重量'] !== undefined) weightName = String(matchedRow[priceMap['重量']] || '').trim();
        if (!weightName && priceMap['kg/箱'] !== undefined) weightName = String(matchedRow[priceMap['kg/箱']] || '').trim();
        if (!weightName && priceMap['KG'] !== undefined) weightName = String(matchedRow[priceMap['KG']] || '').trim();
        pcsPerBox = (typeof safeN === 'function') ? (safeN(matchedRow[priceMap['片/箱']]) || safeN(matchedRow[priceMap['P/C']]) || 1) : 1;
      }
      if (!weightName) weightName = '約 32 kg/箱';

      const unit = String(params.unit || '片').trim();
      let reqPcs = qty;
      if (matchedRow && qty > 0) {
        const ratio = (typeof getPcsPerPingFallback_ === 'function') ? getPcsPerPingFallback_(matchedRow, priceMap) : 1;
        if (unit === '坪' || unit === 'p') {
          reqPcs = qty * ratio;
        } else if (unit === '箱' || unit === '包') {
          reqPcs = qty * pcsPerBox;
        }
      }

      // 放寬庫存表 (stockData) 與 保留單 (mainData) 的數字對齊比對
      const targetDigits = canonicalCode.replace(/\D/g, '');
      const batchCounts = {};
      const total = stockData.filter(r => {
        const sCode = String(r[stockMap['編號']] || '').toUpperCase().trim();
        if (!sCode || String(r[stockMap['品名']]).includes('小計')) return false;
        const sDigits = sCode.replace(/\D/g, '');
        const sSuffixMatch = sCode.match(/-[A-Z0-9]+$/i);
        const sSuffix = sSuffixMatch ? sSuffixMatch[0].toUpperCase() : "";
        const isMatch = (sDigits === targetDigits) && (inputSuffix ? sSuffix === inputSuffix : true);
        if (isMatch) {
          const bName = String(r[stockMap['批號']] || 'DEFAULT').trim();
          batchCounts[bName] = (batchCounts[bName] || 0) + safeN(r[stockMap['片數']]);
        }
        return isMatch;
      }).reduce((s, r) => s + safeN(r[stockMap['片數']]), 0);

      const reserved = mainData.filter(r => {
        const rCode = String(r[mainMap['編號']] || '').toUpperCase().trim();
        if (!rCode || rCode.includes('-期')) return false;
        const rDigits = rCode.replace(/\D/g, '');
        const rSuffixMatch = rCode.match(/-[A-Z0-9]+$/i);
        const rSuffix = rSuffixMatch ? rSuffixMatch[0].toUpperCase() : "";
        return (rDigits === targetDigits) && (inputSuffix ? rSuffix === inputSuffix : true);
      }).reduce((s, r) => s + safeN(r[mainMap['數量']]), 0);

      const avail    = total - reserved;
      const gap      = reqPcs - avail;
      const gapRatio = reqPcs > 0 ? gap / reqPcs : 0;

      const maxBatchPcs = Object.keys(batchCounts).length > 0 ? Math.max(...Object.values(batchCounts)) : avail;

      // 🧮 算湊滿需求所需的最少批號數 neededBatchCount
      const sortedBatches = Object.entries(batchCounts).map(([name, pcs]) => ({ name, pcs })).sort((a, b) => b.pcs - a.pcs);
      let accumulatedPcs = 0;
      let neededBatchCount = 0;
      for (const b of sortedBatches) {
        if (b.pcs > 0) {
          accumulatedPcs += b.pcs;
          neededBatchCount++;
          if (accumulatedPcs >= reqPcs) break;
        }
      }

      const isTotalEnough = avail >= reqPcs;
      let finalStatus = 'none';
      if (maxBatchPcs >= reqPcs && reqPcs > 0) {
        finalStatus = 'ok';    // 單批即可滿足 ➜ 綠章 [ 庫存OK ]
      } else if (isTotalEnough && reqPcs > 0) {
        finalStatus = 'mix';   // 總量足夠但需混批 ➜ 黃章 [ 庫存需混 X 批 ]
      } else if (gapRatio <= 0.5 && avail > 0) {
        finalStatus = 'check'; // 缺口 ≤ 50% ➜ 黃章 [ 庫存待確認 ]
      } else {
        finalStatus = 'none';  // 總量不足 ➜ 紅章 [ 庫存不足 ]
      }

      const resPayload = {
        code: canonicalCode,
        series: seriesName || '通用系列',
        color: colorName,
        size: sizeName || '標準規格',
        pcsPerBox: pcsPerBox,
        weight: weightName,
        imgUrl: imgUrl,
        availPcs: Math.max(0, avail),
        maxBatchPcs: Math.max(0, maxBatchPcs),
        neededBatchCount: neededBatchCount,
        isSingleBatchEnough: maxBatchPcs >= reqPcs,
        status: finalStatus,
        isAgent: isAgentUser
      };

      // 行為 Log 寫入
      if (typeof writeEnhancedLog === 'function') {
        const salesName = (auth.salesID ? String(auth.salesID) : '');
        writeEnhancedLog(getSpreadsheetInstance(), "WEB_FORM", userId, auth.name, auth.level, "CHECK_STOCK", canonicalCode, auth.email, {
          productCode: canonicalCode,
          reqQty: `${qty}${unit}`,
          availPcs: Math.max(0, avail),
          stockStatus: avail >= reqPcs ? 'OK' : 'SHORTAGE',
          salesRepName: salesName
        });
      }

      if (avail >= reqPcs) return json({ status: 'ok', ...resPayload });
      if (avail <= 0) return json({ status: 'none', ...resPayload });
      if (gapRatio <= 0.5) return json({ status: 'check', ...resPayload });
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

    // ── [一次性] R2 圖片遷移進度畫面（每 15 秒自動整理） ──
    if (params.ac === 'r2Stats') {
      const app = HtmlService.createHtmlOutput();
      if (params.key !== 'gyc_r2_migrate_2026') {
        app.append('<p style="font-family:sans-serif;text-align:center;margin-top:40px;">🔒 無權限</p>');
        return app;
      }
      try {
        const stats = (typeof getR2MigrationDashboardData === 'function') ? getR2MigrationDashboardData() : null;
        app.append(buildR2DashboardHtml_(stats, params.key));
      } catch (err) {
        app.append('<p style="font-family:sans-serif;color:red;">' + escapeHtml(String(err)) + '</p>');
      }
      return app;
    }

    // ── [一次性] 立即排一批 R2 遷移（背景執行，馬上回應不用等 5 分鐘） ──
    if (params.ac === 'runR2MigrationAsync') {
      const app = HtmlService.createHtmlOutput();
      if (params.key !== 'gyc_r2_migrate_2026') {
        app.append('<p style="font-family:sans-serif;text-align:center;margin-top:40px;">🔒 無權限</p>');
        return app;
      }
      try {
        if (typeof scheduleImmediateR2Batch === 'function') scheduleImmediateR2Batch();
      } catch (err) {}
      const dashUrl = ScriptApp.getService().getUrl() + '?ac=r2Stats&key=' + encodeURIComponent(params.key);
      app.append('<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="2;url=' + escapeHtml(dashUrl) + '"></head><body style="font-family:-apple-system,\'PingFang TC\',sans-serif;text-align:center;margin-top:40px;">✅ 已排定立即執行一批，2 秒後自動跳回進度畫面…</body></html>');
      return app;
    }

    // ── [一次性] 重置 R2 遷移進度（從第一列重新掃描）──
    if (params.ac === 'resetR2Migration') {
      const app = HtmlService.createHtmlOutput();
      if (params.key !== 'gyc_r2_migrate_2026') {
        app.append('<p style="font-family:sans-serif;text-align:center;margin-top:40px;">🔒 無權限</p>');
        return app;
      }
      try {
        if (typeof resetR2MigrationProgress === 'function') resetR2MigrationProgress();
        app.append('<p style="font-family:sans-serif;text-align:center;margin-top:40px;">✅ 進度已重置。</p>');
      } catch (err) {
        app.append('<p style="font-family:sans-serif;color:red;">' + escapeHtml(String(err)) + '</p>');
      }
      return app;
    }

    // ── [一次性] 比對「單片連結網址」跟「主圖URL」兩欄的實際資料，看是不是真的重複 ──
    if (params.ac === 'compareImgCols') {
      const app = HtmlService.createHtmlOutput();
      if (params.key !== 'gyc_r2_migrate_2026') {
        app.append('<p style="font-family:sans-serif;text-align:center;margin-top:40px;">🔒 無權限</p>');
        return app;
      }
      try {
        const ss = getSpreadsheetInstance();
        const sheet = ss.getSheetByName('編輯價目表') || ss.getSheetByName('編號價目表');
        const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
        const idxA = header.indexOf('單片連結網址');
        const idxB = header.indexOf('主圖URL');
        const idxCode = header.indexOf('編號');
        const data = sheet.getDataRange().getValues();
        let onlyA = 0, onlyB = 0, bothSame = 0, bothDiff = 0, neither = 0;
        const diffExamples = [];
        for (let i = 1; i < data.length; i++) {
          const a = String(data[i][idxA] || '').trim();
          const b = String(data[i][idxB] || '').trim();
          if (!a && !b) { neither++; continue; }
          if (a && !b) { onlyA++; continue; }
          if (!a && b) { onlyB++; continue; }
          if (a === b) { bothSame++; }
          else {
            bothDiff++;
            if (diffExamples.length < 5) diffExamples.push(data[i][idxCode] + '｜A=' + a + '｜B=' + b);
          }
        }
        app.append(`<pre style="font-family:monospace;padding:20px;white-space:pre-wrap;word-break:break-all;">共 ${data.length - 1} 列
只有「單片連結網址」有值：${onlyA}
只有「主圖URL」有值：${onlyB}
兩者都有值、內容一樣：${bothSame}
兩者都有值、內容不一樣：${bothDiff}
兩者都是空的：${neither}

內容不一樣的範例（最多5個）：
${diffExamples.join('\n')}</pre>`);
      } catch (err) {
        app.append('<p style="font-family:sans-serif;color:red;">' + escapeHtml(String(err)) + '</p>');
      }
      return app;
    }

    // ── [一次性] 診斷某編號在保留單裡到底有幾筆、.find() 實際抓到哪一筆 ──
    if (params.ac === 'debugArrival') {
      const app = HtmlService.createHtmlOutput();
      if (params.key !== 'gyc_r2_migrate_2026') {
        app.append('<p style="font-family:sans-serif;text-align:center;margin-top:40px;">🔒 無權限</p>');
        return app;
      }
      try {
        const out = debugCheckArrivalInfo(params.code || 'ST61293');
        app.append('<pre style="font-family:monospace;padding:20px;white-space:pre-wrap;word-break:break-all;">' + escapeHtml(out) + '</pre>');
      } catch (err) {
        app.append('<p style="font-family:sans-serif;color:red;">' + escapeHtml(String(err)) + '</p>');
      }
      return app;
    }

    // ── [一次性] 啟動 R2 圖片批次遷移（背景每 10 分鐘自動接續直到完成）──
    if (params.ac === 'runR2Migration') {
      const app = HtmlService.createHtmlOutput();
      if (params.key !== 'gyc_r2_migrate_2026') {
        app.append('<p style="font-family:sans-serif;text-align:center;margin-top:40px;">🔒 無權限</p>');
        return app;
      }
      try {
        if (typeof setupR2MigrationTrigger === 'function') setupR2MigrationTrigger();
        if (typeof runFullImageMigrationToR2 === 'function') runFullImageMigrationToR2(); // 立即跑第一批，不用等 10 分鐘
        app.append('<p style="font-family:sans-serif;text-align:center;margin-top:40px;">✅ R2 圖片遷移第一批已執行，後續將於背景每 10 分鐘自動接續直到完成。</p>');
      } catch (err) {
        app.append('<p style="font-family:sans-serif;text-align:center;margin-top:40px;color:red;">啟動失敗：' + escapeHtml(String(err)) + '</p>');
      }
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

    // ── Telegram 保留單續期/取消連結 ──
    if (params.ac === 'renewReserve' || params.ac === 'renewReserveWeb' || params.ac === 'renewReserveSubmit' || params.ac === 'cancelReserve') {
      return handleReserveTelegramAction(params);
    }

    // ── [客戶自助] 我的保留單 LIFF 頁面：取得自己公司名下的保留單列表 ──
    if (params.ac === 'myReservations') {
      const userId = String(params.userId || '').trim();
      if (!userId) return json({ success: false, error: '缺少 userId' });
      const auth = checkAuth(userId, wlData, wlMap);
      if (!auth.allowed) return json({ success: false, error: '查無此用戶，請聯繫業務開通權限。' });
      return json(getMyReservationsData_(auth));
    }

    // ── [客戶自助] 我的保留單 LIFF 頁面：客戶自己修改一筆保留數量 ──
    if (params.ac === 'updateMyReservation') {
      const userId = String(params.userId || '').trim();
      if (!userId) return json({ success: false, error: '缺少 userId' });
      const auth = checkAuth(userId, wlData, wlMap);
      if (!auth.allowed) return json({ success: false, error: '查無此用戶，請聯繫業務開通權限。' });
      const rowNum = parseInt(params.row, 10);
      if (!rowNum) return json({ success: false, error: '缺少列號' });
      return json(updateMyReservationRow_(auth, rowNum, params.cust, params.code, params.newQty));
    }

    // ── 客戶申請「增加保留數量」的 Telegram 核准/拒絕按鈕（來自 updateMyReservationRow_ 發出的通知）──
    if (params.ac === 'approveReserveIncrease' || params.ac === 'denyReserveIncrease') {
      return handleReserveIncreaseApproval_(params);
    }

  } catch (err) {
    return json({ success: false, error: String(err) });
  }

  // 🚩 同一個 LIFF app（LIFF_ID_RESERVE）依 mode 參數分流：帶 mode=myReservations 就顯示
  // 「我的保留單」自助頁面，不用另外去 LINE Developers Console 建立新的 LIFF app。
  if (params.mode === 'myReservations') {
    return HtmlService.createHtmlOutputFromFile('cpanel_tracking')
      .setTitle('我的保留單')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
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
    // 🚩 log 的「來源類型」欄要的是 PRIVATE/GROUP 語意標籤，不是 sourceId（私聊時 sourceId 等於 userId 本身，
    // 誤填會讓 log 的來源類型欄跟使用者ID欄長得一樣，跟 2_Business.js 的寫法對齊）
    const logSid = isGroup ? "GROUP" : "PRIVATE";

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
        writeLog(dbSS, logSid, userId, "陌生人", "GUEST", "加好友", "follow-通知已發", "");
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
            writeLog(dbSS, logSid, userId, auth.name, auth.level, "上傳手寫單", "OCR高信心-等確認", auth.email);
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
          writeLog(dbSS, logSid, userId, auth.name, auth.level, "上傳手寫單", "OCR低信心-引導確認", auth.email);
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
      writeLog(dbSS, logSid, userId, auth.name, auth.level, "上傳手寫單", "OCR完全失敗-引導手動", auth.email);
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
            writeLog(dbSS, logSid, userId, "申請人", "GUEST", input, "提交權限申請", "");
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
        writeLog(dbSS, logSid, userId, auth.name, auth.level, "提交保留單", "FormProcessed", auth.email);
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
        // (0) 我的保留單（客戶自助查詢＋修改）→ 送出 LIFF 按鈕卡片
        if (['我的保留', '保留總覽', '保留單查詢'].some(k => q.includes(k))) {
          const myResFlex = (typeof buildMyReservationsLiffFlex_ === 'function') ? buildMyReservationsLiffFlex_(auth) : null;
          if (myResFlex && typeof myResFlex === 'object') {
            sendFlexReply(replyToken, myResFlex, auth, isGroup);
            writeLog(dbSS, logSid, userId, auth.name, auth.level, q, 'LIFF我的保留單按鈕', auth.email);
            return output;
          }
        }

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
              writeLog(dbSS, logSid, userId, auth.name, auth.level, q, 'LIFF保留單按鈕', auth.email);
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
              // 🚩 [bubble fix] 記下這次查詢的編號，讓圖片下方的泡泡能帶著編號 (支援今友利短編號 D124/J16 等)
              const visCodeMatch = q.match(/[a-zA-Z]{1,4}\d{2,}(?:-[a-zA-Z0-9]+)?/i) || q.match(/\d{5,}(?:-[a-zA-Z0-9]+)?/i);
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
          const codeMatch = q.match(/[a-zA-Z]{1,4}\d{2,}(?:-[a-zA-Z0-9]+)?/i) || q.match(/\d{5,}(?:-[a-zA-Z0-9]+)?/i);
          const qtyMatch = q.match(/(\d+(?:\.\d+)?)\s*(坪|p|片|箱|包)/i);
          if (codeMatch) lastDetectedCode = codeMatch[0].toUpperCase();
          if (qtyMatch) lastDetectedQty = qtyMatch[0];

          const washedQ = (typeof washText === 'function') ? washText(q) : q;
          const numMatch = q.match(/[a-zA-Z]{1,4}\d{2,}(?:-[a-zA-Z0-9]+)?/i) || q.match(/\d{5,}(?:-[a-zA-Z0-9]+)?/i);
          const isInvQ = q.includes('庫存') || qtyMatch || numMatch || (washedQ.length >= 4);
          if (isInvQ && !q.includes('價格') && !q.includes('價錢') && !q.includes('實際尺寸') && !q.includes('尺寸') && !q.includes('保留') && !q.includes('過期') && !q.includes('業績') && !q.includes('戰報') && !q.includes('睡美人')) {
            isInventoryQueryFound = true;
          }
        }
      }

      if (flexObject) {
        sendFlexReply(replyToken, flexObject, auth, isGroup, lastDetectedCode);
        writeLog(dbSS, logSid, userId, auth.name, auth.level, input, "FLEX", auth.email);
      } else if (fullReply.trim()) {
        const finalCode = lastDetectedQty ? (lastDetectedCode + " " + lastDetectedQty) : lastDetectedCode;
        sendReply(replyToken, fullReply.trim(), finalCode, auth, isGroup);
        if (!isInventoryQueryFound) {
          writeLog(dbSS, logSid, userId, auth.name, auth.level, input, "回覆", auth.email);
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
                  writeLog(dbSS, logSid, userId, auth.name, auth.level, input, "AI-找圖", auth.email);
                  return output;
                }
              }
            }

            // 🚩 2. 問價格 (price_query)
            if (nlp.intent === "price_query" && code) {
              const priceRes = (typeof handlePriceSearch === 'function') ? handlePriceSearch(code, db.price, maps.price, auth.level, isGroup) : "";
              if (priceRes) {
                sendReply(replyToken, priceRes, code, auth, isGroup);
                writeLog(dbSS, logSid, userId, auth.name, auth.level, input, "AI-問價", auth.email);
                return output;
              }
            }

            // 🚩 3. 問規格/包裝 (spec_query)
            if (nlp.intent === "spec_query" && code) {
              const specQueryText = nlp.spec_keyword || "包裝";
              const specRes = (typeof handleProductSpecSearch === 'function') ? handleProductSpecSearch(code, db.price, maps.price, specQueryText) : "";
              if (specRes) {
                sendReply(replyToken, specRes, code, auth, isGroup);
                writeLog(dbSS, logSid, userId, auth.name, auth.level, input, "AI-規格", auth.email);
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
                writeLog(dbSS, logSid, userId, auth.name, auth.level, input, "AI-口語保留單", auth.email);
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
              writeLog(dbSS, logSid, userId, auth.name, auth.level, input, "AI對話", auth.email);
              return output;
            }
          }

          // 🚩 7. 無法識別指令時的「不明指令引導泡泡卡片」
          if (typeof buildUnknownGuideBubble === 'function') {
            const guideFlex = buildUnknownGuideBubble(auth);
            sendFlexReply(replyToken, guideFlex, auth, isGroup);
            writeLog(dbSS, logSid, userId, auth.name, auth.level, input, "引導泡泡", auth.email);
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
  const numMatch = q.match(/[a-zA-Z]{1,4}\d{2,}(?:-[a-zA-Z0-9]+)?/i) || q.match(/\d{5,}(?:-[a-zA-Z0-9]+)?/i);

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
    // 🚩 多公司強制優先攔截：完整字母編號且高雅瓷無此精確編號 → 直接查安/喜，絕不讓高雅瓷模糊誤配
    if (typeof handleMultiCompanyQuery_ === 'function' && typeof extractMultiCompanyCode_ === 'function') {
      const mcCode = extractMultiCompanyCode_(q);
      if (mcCode && !isExactCodeInGYC_(mcCode)) {
        const mc = handleMultiCompanyQuery_(q, auth, isGroup);
        if (mc) return mc;
      }
    }

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

/**
 * 高雅瓷 AI 智能客服 - 2026 戰略指揮工具箱 (v2.0)
 * 檔案：6_Tools.gs
 * 🚩 【最高開發原則】：
 * 1. 熱情導引：改用手機優化垂直排版，第一印象熱情化，移除冷冰冰的提示。
 * 2. 偵錯強化：sendFlexPush 檢查回傳值，失敗時 Log 輸出錯誤內容，防止假成功。
 * 3. 分享解鎖：強化 altText 替代文字，解鎖 LINE Flex 訊息長按轉發/分享功能。
 * 4. 嚴禁縮寫：全量輸出所有工具函式，確保跨檔案調用不中斷。
 * 5. 標頭清洗：getHeaderMap 徹底排除 BOM (\uFEFF) 與空格，確保標題字串 100% 匹配。
 */

// ==========================================
// 📦 記憶體快取與資料存取 (Data Cache & Access)
// ==========================================

const _CACHE = {
  monthRows: null,
  reserveRows: null,
  stockRows: null,
  priceRows: null,
  wlRows: null,
  sleepRows: null,
  mainRowsCombined: null,
  systemSettingsRows: null
};

let _ssInstance = null;
function getSpreadsheetInstance() {
  if (!_ssInstance) {
    _ssInstance = SpreadsheetApp.openById(CONFIG.DATA_SS_ID);
  }
  return _ssInstance;
}

let _formSSInstance = null;
function getFormSpreadsheetInstance() {
  if (!_formSSInstance) {
    _formSSInstance = SpreadsheetApp.openById(CONFIG.FORM_SS_ID);
  }
  return _formSSInstance;
}

function _getSheetRowsByName(name, cacheKey) {
  if (_CACHE[cacheKey]) return _CACHE[cacheKey];
  try {
    const ss = getSpreadsheetInstance();
    let actualName = name;
    if (name === SHEET_NAME.PRICE || name === "編號價目表" || name === "編輯價目表") {
      actualName = ss.getSheetByName("編輯價目表") ? "編輯價目表" : "編號價目表";
    }
    const sh = ss.getSheetByName(actualName);
    if (!sh) return [];
    const range = sh.getDataRange();
    const vals = range.getValues();
    // 🚩 [v24.3 🚀 極速批次優化] 全能影像相容：由原本 26~39 次單欄 RPC 縮減為 2 次批次呼叫
    if (actualName === "編輯價目表" || actualName === "編號價目表") {
      const header = vals[0].map(h => String(h).trim());
      const linkColNames = ["單片連結網址", "FLEX圖卡", "原廠目錄", "實景1", "實景2", "實景3", "實景4", "實景5", "實景6", "實景7", "實蹟圖片", "主圖URL", "雲端圖片"];
      const targetColIdxs = linkColNames.map(name => header.indexOf(name)).filter(idx => idx > -1);

      if (targetColIdxs.length > 0 && vals.length > 1) {
        try {
          const richVals = range.getRichTextValues();
          const formulaVals = range.getFormulas();
          const cloudFolderColIdx = header.indexOf("雲端圖片");

          for (let i = 0; i < vals.length; i++) {
            for (let c = 0; c < targetColIdxs.length; c++) {
              const colIdx = targetColIdxs[c];
              const cellStr = String(vals[i][colIdx]).trim();
              const formula = formulaVals[i] ? formulaVals[i][colIdx] : '';

              // A. 處理美化圖示 (RichText Link)
              if (colIdx === cloudFolderColIdx || /^[\uD83D\uDDBC\uFE0F\uD83D\uDD17\uD83D\uDCD5]+$/.test(cellStr) || ["🖼️", "🖼", "🔗", "📕"].includes(cellStr)) {
                if (richVals[i] && richVals[i][colIdx]) {
                  const link = richVals[i][colIdx].getLinkUrl();
                  if (link) vals[i][colIdx] = link;
                }
              }
              // B. 處理 IMAGE 函數 (提取公式內的網址)
              else if (formula && formula.toUpperCase().includes("IMAGE(")) {
                const match = formula.match(/"(https?:\/\/[^"]+)"/i) || formula.match(/'(https?:\/\/[^']+)'/i);
                if (match) {
                  let url = match[1];
                  // 🚩 研析公式內的網址並強轉 Drive 縮圖
                  if (url.includes("drive.google.com")) {
                    const id = url.match(/[\w-]{25,}/);
                    if (id) url = "https://drive.google.com/thumbnail?id=" + id[0] + "&sz=w600";
                  }
                  vals[i][colIdx] = url;
                }
              }
            }
          }
        } catch (colErr) {
          console.error("批次處理價目表欄位富文本/公式出錯: " + colErr);
        }
      }
    }

    _CACHE[cacheKey] = vals;
    return vals;
  } catch (e) {
    console.error("讀取表單 [" + name + "] 失敗: " + e);
    return [];
  }
}

function getMonthSheet() { return _getSheetRowsByName('經銷銷售報表', 'monthRows'); }
function getReserveSheet() { return getMainSheet(); }
function getStockSheet() {
  if (_CACHE.stockRows) return _CACHE.stockRows;
  const cacheKey = "stock_sheet_data_short_v1";
  const cached = (typeof CacheManager !== 'undefined') ? CacheManager.getLarge(cacheKey) : null;
  if (cached) {
    _CACHE.stockRows = cached;
    return cached;
  }
  try {
    const ss = getFormSpreadsheetInstance();
    const sh = ss.getSheetByName('庫存表') || ss.getSheetByName(SHEET_NAME.STOCK);
    if (sh) {
      const vals = sh.getDataRange().getValues();
      _CACHE.stockRows = vals;
      if (typeof CacheManager !== 'undefined' && vals.length > 0) {
        CacheManager.putLarge(cacheKey, vals, 600); // 10 分鐘快取，避免反覆遠端讀表（有新保留時由 clearStockAndReserveCache 立即清除）
      }
      return vals;
    }
  } catch (e) {
    console.error("讀取 FORM_SS_ID 庫存表失敗: " + e);
  }
  return [];
}

function parseSizeDimensions_(sizeValue) {
  const raw = String(sizeValue || '').toLowerCase().replace(/\s+/g, '');
  const match = raw.match(/(\d+(?:\.\d+)?)\s*[xX*＊×]\s*(\d+(?:\.\d+)?)/);
  if (!match) return null;

  const longSide = parseFloat(match[1]);
  const shortSide = parseFloat(match[2]);
  if (!isFinite(longSide) || !isFinite(shortSide) || longSide <= 0 || shortSide <= 0) return null;

  return { longSide, shortSide };
}

function getPcsPerPingFallback_(row, map) {
  const toNumber = (value) => {
    const n = (typeof safeN === 'function') ? safeN(value) : parseFloat(value);
    return (isFinite(n) && n > 0) ? n : 0;
  };

  try {
    if (!row || !map) return 1;

    const ratioKeys = ['片/坪', '每坪片數'];
    for (const key of ratioKeys) {
      const idx = map[key];
      if (idx !== undefined) {
        const direct = toNumber(row[idx]);
        if (direct > 0) return direct;
      }
    }

    const sizeKeys = ['尺寸(cm)', '尺寸', '表定尺寸', '實際尺寸', '規格'];
    for (const key of sizeKeys) {
      const idx = map[key];
      if (idx === undefined) continue;
      const dims = parseSizeDimensions_(row[idx]);
      if (dims) {
        const ratio = 32400 / dims.longSide / dims.shortSide;
        if (isFinite(ratio) && ratio > 0) return ratio;
      }
    }

    const longKeys = ['長', '長(cm)', '長度', '長邊'];
    const shortKeys = ['寬', '寬(cm)', '寬度', '短邊'];
    let longSide = 0;
    let shortSide = 0;

    for (const key of longKeys) {
      const idx = map[key];
      if (idx !== undefined) {
        longSide = toNumber(row[idx]);
        if (longSide > 0) break;
      }
    }
    for (const key of shortKeys) {
      const idx = map[key];
      if (idx !== undefined) {
        shortSide = toNumber(row[idx]);
        if (shortSide > 0) break;
      }
    }

    if (longSide > 0 && shortSide > 0) {
      const ratio = 32400 / longSide / shortSide;
      if (isFinite(ratio) && ratio > 0) return ratio;
    }
  } catch (err) {}

  return 1;
}

/** 讀取待核准預扣保留暫存，並動態映射到保留單的表頭架構上 */
function getPendingBufferRows(ssId, mainHeaderMap) {
  const pendingRows = [];
  try {
    const ss = (ssId === CONFIG.FORM_SS_ID) ? getFormSpreadsheetInstance() : ((ssId === CONFIG.DATA_SS_ID) ? getSpreadsheetInstance() : SpreadsheetApp.openById(ssId));
    const sh = ss.getSheetByName('(保留暫存)');
    if (!sh) return pendingRows;
    const vals = sh.getDataRange().getValues();
    if (vals.length < 2) return pendingRows;
    
    const pMap = getHeaderMap(vals);
    const codeIdx = pMap['編號'];
    const qtyIdx = pMap['數量'];
    const statusIdx = pMap['狀態'];
    
    if (codeIdx === undefined || qtyIdx === undefined || statusIdx === undefined) return pendingRows;
    
    for (let i = 1; i < vals.length; i++) {
      const status = String(vals[i][statusIdx] || '').trim();
      if (status === '待核准') {
        const rowData = new Array(Object.keys(mainHeaderMap).length).fill("");
        const code = String(vals[i][codeIdx] || '').trim().toUpperCase();
        // 保留原始的數量字串（含單位，如 "50坪" 或 "10箱"），以便統一解析器精準處理
        const qty = String(vals[i][qtyIdx] || '').trim();
        
        if (mainHeaderMap['編號'] !== undefined) rowData[mainHeaderMap['編號']] = code;
        if (mainHeaderMap['數量'] !== undefined) rowData[mainHeaderMap['數量']] = qty;
        
        const company = pMap['公司'] !== undefined ? String(vals[i][pMap['公司']]).trim() : '';
        if (mainHeaderMap['客戶'] !== undefined) rowData[mainHeaderMap['客戶']] = company;
        if (mainHeaderMap['公司'] !== undefined) rowData[mainHeaderMap['公司']] = company;
        
        const addr = pMap['地址'] !== undefined ? String(vals[i][pMap['地址']]).trim() : '';
        if (mainHeaderMap['工地'] !== undefined) rowData[mainHeaderMap['工地']] = addr;
        if (mainHeaderMap['地址'] !== undefined) rowData[mainHeaderMap['地址']] = addr;
        
        const applicant = pMap['申請人'] !== undefined ? String(vals[i][pMap['申請人']]).trim() : '';
        if (mainHeaderMap['客戶業務'] !== undefined) rowData[mainHeaderMap['客戶業務']] = applicant;
        if (mainHeaderMap['業務'] !== undefined) rowData[mainHeaderMap['業務']] = applicant;
        
        const appTime = pMap['申請時間'] !== undefined ? vals[i][pMap['申請時間']] : '';
        if (mainHeaderMap['保留日期'] !== undefined) rowData[mainHeaderMap['保留日期']] = appTime;
        if (mainHeaderMap['日期'] !== undefined) rowData[mainHeaderMap['日期']] = appTime;
        
        const expTime = pMap['到期時間'] !== undefined ? vals[i][pMap['到期時間']] : '';
        if (mainHeaderMap['到期日'] !== undefined) rowData[mainHeaderMap['到期日']] = expTime;
        
        const caseName = pMap['案名'] !== undefined ? String(vals[i][pMap['案名']]).trim() : '';
        if (mainHeaderMap['案名'] !== undefined) rowData[mainHeaderMap['案名']] = caseName;
        
        const entryDate = pMap['進場日期'] !== undefined ? String(vals[i][pMap['進場日期']]).trim() : '';
        if (mainHeaderMap['備註'] !== undefined) rowData[mainHeaderMap['備註']] = '待核准預扣｜進場:' + entryDate;
        
        pendingRows.push(rowData);
      }
    }
  } catch (e) {
    console.error("讀取 (保留暫存) 失敗: " + e);
  }
  return pendingRows;
}

/** 🚀 高效解析數量：利用 Map 查表將 O(N * M) 複雜度降為 O(N) */
function parseRowQtyToPcsFast(code, qtyValOrStr, priceInfoMap) {
  if (qtyValOrStr === undefined || qtyValOrStr === null || qtyValOrStr === "") return 0;
  
  // 🚩 [防爆] 如果傳入的是 Date 物件（Google Sheets 日期欄讀進來是 Date），直接回 0
  if (qtyValOrStr instanceof Date) return 0;
  
  if (typeof qtyValOrStr === 'number') {
    // 🚩 [防爆] 數字上限 99999 片，超過必定是欄位對齊錯誤（如讀到日期序號 45000+）
    return (qtyValOrStr > 0 && qtyValOrStr <= 99999) ? qtyValOrStr : 0;
  }
  
  const qtyStr = String(qtyValOrStr).trim();
  const qtyVal = parseFloat(qtyStr.replace(/[^\d.-]/g, '')) || 0;
  const lowerStr = qtyStr.toLowerCase();
  
  // 🚩 [防爆] 字串解析出的數字也做上限保護
  if (qtyVal <= 0 || qtyVal > 99999) return 0;
  
  const cleanCode = String(code).toUpperCase().trim();
  let info = priceInfoMap[cleanCode];
  
  if (!info && cleanCode) {
    // 模糊比對：僅當精準匹配查無時進行（極少數情況），避免效能瓶頸
    const matchKey = Object.keys(priceInfoMap).find(k => k.includes(cleanCode) || cleanCode.includes(k));
    if (matchKey) info = priceInfoMap[matchKey];
  }
  
  if (lowerStr.includes('坪') || lowerStr.includes('p')) {
    const ratio = info ? info.ratio : 1;
    return Math.round(qtyVal * ratio);
  }
  
  if (lowerStr.includes('箱') || lowerStr.includes('box')) {
    const pcsPerBox = info ? info.pcsPerBox : 1;
    return Math.round(qtyVal * pcsPerBox);
  }
  
  return qtyVal; // 預設為片數
}


// 為了相容其他可能的外部調用，保留舊版 signature 但內部走 fast 邏輯
function parseRowQtyToPcs(code, qtyValOrStr, priceData, priceMap) {
  const priceInfoMap = {};
  if (priceData && priceMap) {
    const pCodeIdx = priceMap['編號'];
    const pPcsBoxIdx = priceMap['包裝片數'] || priceMap['片/箱'] || priceMap['每箱片數'];
    if (pCodeIdx !== undefined) {
      for (let i = 1; i < priceData.length; i++) {
        const dbCode = String(priceData[i][pCodeIdx]).toUpperCase().trim();
        if (dbCode) {
          priceInfoMap[dbCode] = {
            ratio: getPcsPerPingFallback_(priceData[i], priceMap),
            pcsPerBox: pPcsBoxIdx !== undefined ? (safeN(priceData[i][pPcsBoxIdx]) || 1) : 1
          };
        }
      }
    }
  }
  return parseRowQtyToPcsFast(code, qtyValOrStr, priceInfoMap);
}

/** 智能關聯保留邏輯：
 *  1. 讀取正式保留單
 *  2. 讀取「雲端保留」工作表（ approved cloud reservations ）並與「保留單」結構對齊合併
 *  3. 預扣兩個保留暫存中的「待核准」暫留庫存，徹底消除超賣競爭漏洞與數據同步斷層
 *  4. 統一將所有數量欄位（含坪、p、箱等單位描述）智慧解析並轉為標準「片數」數值，防範對帳差錯
 */
function getMainSheet() {
  if (_CACHE.mainRowsCombined) return _CACHE.mainRowsCombined;
  const cacheKey = "main_sheet_combined_short_v1";
  const cached = (typeof CacheManager !== 'undefined') ? CacheManager.getLarge(cacheKey) : null;
  if (cached) {
    _CACHE.mainRowsCombined = cached;
    return cached;
  }
  
  let combined = [["編號", "數量", "客戶", "工地", "客戶業務", "保留日期", "到期日", "案名", "備註", "入倉日期1", "數量1", "入倉日期2", "數量2"]];
  const mainHeaderMap = getHeaderMap(combined);
  
  let hasLoadedMain = false;

  // 1. 優先：讀取 FORM_SS_ID (即時寫入的表單庫) 底下的保留單
  if (CONFIG.FORM_SS_ID) {
    try {
      const formSS = getFormSpreadsheetInstance();
      const sh = formSS.getSheetByName('保留單');
      if (sh) {
        const rows = sh.getDataRange().getValues();
        if (rows.length > 1) {
          const hMap = getHeaderMap(rows);
          for (let i = 1; i < rows.length; i++) {
            const rowData = new Array(combined[0].length).fill("");
            Object.keys(mainHeaderMap).forEach(key => {
              const dstIdx = mainHeaderMap[key];
              const srcIdx = hMap[key];
              if (dstIdx !== undefined && srcIdx !== undefined) {
                rowData[dstIdx] = rows[i][srcIdx];
              }
            });
            combined.push(rowData);
          }
          hasLoadedMain = true;
        }
      }
    } catch (e) {
      console.error("讀取 FORM_SS_ID 保留單失敗: " + e);
    }
  }




  
  // ── A. 合併「雲端保留」工作表的已核准資料 (保留相容) ──
  try {
    const cloudRows = _getSheetRowsByName('雲端保留', 'cloudReserveRows');
    if (cloudRows && cloudRows.length > 1) {
      const cloudHeaderMap = getHeaderMap(cloudRows);
      for (let i = 1; i < cloudRows.length; i++) {
        const rowData = new Array(Object.keys(mainHeaderMap).length).fill("");
        Object.keys(mainHeaderMap).forEach(key => {
          const mainIdx = mainHeaderMap[key];
          const cloudIdx = cloudHeaderMap[key];
          if (mainIdx !== undefined && cloudIdx !== undefined) {
            rowData[mainIdx] = cloudRows[i][cloudIdx];
          }
        });
        combined.push(rowData);
      }
    }
  } catch (e) {
    console.error("合併雲端保留單失敗: " + e);
  }
  
  // ── B. 從 DATA_SS_ID 的 (保留暫存) 中抓出待核准的預扣紀錄 ──
  const dataPending = getPendingBufferRows(CONFIG.DATA_SS_ID, mainHeaderMap);
  dataPending.forEach(r => combined.push(r));
  
  // ── C. 從 FORM_SS_ID 的 (保留暫存) 中抓出待核准的預扣紀錄 ──
  if (CONFIG.FORM_SS_ID && CONFIG.FORM_SS_ID !== CONFIG.DATA_SS_ID) {
    const formPending = getPendingBufferRows(CONFIG.FORM_SS_ID, mainHeaderMap);
    formPending.forEach(r => combined.push(r));
  }
  
  // ── D. 統一將所有數量欄位智慧解析清洗為純片數數值 ──
  try {
    const priceData = getPriceSheet();
    const priceMap = priceData && priceData.length > 0 ? getHeaderMap(priceData) : null;
    const codeIdx = mainHeaderMap['編號'];
    const qtyIdx = mainHeaderMap['數量'];
    
    if (codeIdx !== undefined && qtyIdx !== undefined) {
      // 🚀 建立品號 Map 快取，將巢狀迴圈轉為 O(1) 查表
      const priceInfoMap = {};
      if (priceData && priceMap) {
        const pCodeIdx = priceMap['編號'];
        const pPcsBoxIdx = priceMap['包裝片數'] || priceMap['片/箱'] || priceMap['每箱片數'];
        if (pCodeIdx !== undefined) {
          for (let i = 1; i < priceData.length; i++) {
            const dbCode = String(priceData[i][pCodeIdx]).toUpperCase().trim();
            if (dbCode) {
              priceInfoMap[dbCode] = {
                ratio: getPcsPerPingFallback_(priceData[i], priceMap),
                pcsPerBox: pPcsBoxIdx !== undefined ? (safeN(priceData[i][pPcsBoxIdx]) || 1) : 1
              };
            }
          }
        }
      }

      for (let i = 1; i < combined.length; i++) {
        const code = combined[i][codeIdx];
        const rawQty = combined[i][qtyIdx];
        combined[i][qtyIdx] = parseRowQtyToPcsFast(code, rawQty, priceInfoMap);
      }
    }
  } catch (err) {
    console.error("智慧對帳片數轉換失敗: " + err);
  }
  
  if (typeof CacheManager !== 'undefined' && combined.length > 0) {
    CacheManager.putLarge(cacheKey, combined, 600); // 10 分鐘快取（有新保留時由 clearStockAndReserveCache 立即清除）
  }
  _CACHE.mainRowsCombined = combined;
  return combined;
}

/** 🔄 當有新保留、核准或修改時，立即清除庫存與保留單快取，確保數據即時性 */
function clearStockAndReserveCache() {
  _CACHE.stockRows = null;
  _CACHE.mainRowsCombined = null;
  if (typeof CacheManager !== 'undefined') {
    CacheManager.removeLarge("stock_sheet_data_short_v1");
    CacheManager.removeLarge("main_sheet_combined_short_v1");
    CacheManager.removeLarge("form_catalog_snapshot_v1");
  }
}

function getPriceSheet() {
  const cacheKey = "price_sheet_data_large_v2";
  // 1. 嘗試從快取讀取
  const cached = (typeof CacheManager !== 'undefined') ? CacheManager.getLarge(cacheKey) : null;
  if (cached) return cached;

  // 🚩 v657 修正：直接從 Google Sheet 讀取，不碰 Supabase（避免同步問題）
  const sheetData = _getSheetRowsByName('編號價目表', 'priceRows');
  console.log("💾 從 Google Sheet 直接讀取價目表，筆數：" + (sheetData.length - 1));

  // 2. 寫入快取，保存 6 小時 (21600 秒)
  if (sheetData && sheetData.length > 0 && (typeof CacheManager !== 'undefined')) {
    CacheManager.putLarge(cacheKey, sheetData, 21600);
  }

  return sheetData;
}

/**
 * 🚩 讀取完整 編號價目表（直接讀 Google Sheet，含所有欄位）
 * 用於 Flex 圖卡：原廠目錄、系列介紹、R2 系列、單片N 等圖片相關欄位只存在於 Sheet。
 */
function getPriceSheetFull() {
  return _getSheetRowsByName('編號價目表', 'priceRowsFull');
}

function getWhitelistSheet() {
  const cacheKey = "whitelist_data_v1";
  const cached = (typeof CacheManager !== 'undefined') ? CacheManager.getLarge(cacheKey) : null;
  if (cached) return cached;

  const data = _getSheetRowsByName('白名單', 'wlRows');
  if (data && data.length > 0 && typeof CacheManager !== 'undefined') {
    CacheManager.putLarge(cacheKey, data, 1800); // 快取 30 分鐘
  }
  return data;
}

function clearWhitelistCache() {
  if (typeof CacheManager !== 'undefined') {
    CacheManager.removeLarge("whitelist_data_v1");
  }
}

// ==========================================
// 📅 日期與文字處理 (Date & Text)
// ==========================================

function parseRocDate(v) {
  if (!v) return null;
  if (v instanceof Date) {
    let y = v.getFullYear();
    return y < 1911 ? new Date(y + 1911, v.getMonth(), v.getDate()) : v;
  }
  let str = String(v).trim();
  const match = str.match(/^0?(\d{3})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (match) {
    return new Date(1911 + parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10));
  }
  const adMatch = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (adMatch) {
    return new Date(parseInt(adMatch[1], 10), parseInt(adMatch[2], 10) - 1, parseInt(adMatch[3], 10));
  }
  return null;
}

function formatROCDate(d) {
  if (!(d instanceof Date)) return "";
  const y = d.getFullYear() - 1911;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}/${mm}/${dd}`;
}

function formatDateYMD(d) {
  if (!(d instanceof Date)) return "";
  return Utilities.formatDate(d, "GMT+8", "yyyy/MM/dd");
}

function utilWashText(t) {
  return String(t || "").replace(/\s+/g, "").toUpperCase();
}

function normalizeSize(str) {
  if (!str) return "";
  return str.toString().replace(/[＊*×xX]/g, 'x').replace(/\s+/g, '').trim();
}

function safeN(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  let n = parseFloat(String(v || "0").replace(/[^\d.-]/g, ''));
  return (n && isFinite(n)) ? n : 0;
}

function shortenURL(url) {
  if (!url) return "無連結";
  const s = String(url);
  if (s.indexOf('drive.google.com') > -1) return "📁 點擊開啟";
  return s.length > 25 ? s.substring(0, 22) + "..." : s;
}

function mergeCustomer(name) {
  let s = String(name || "").trim();
  if (s.includes('大永')) return '大永';
  if (s.includes('漢樺')) return '漢樺';
  if (s.includes('波爾泰')) return '漢樺'; 
  const suffixes = ['企業','建材','國際','磁磚','工程','股份有限公司','有限公司','公司','實業','精品'];
  for (let suf of suffixes) {
    const idx = s.indexOf(suf);
    if (idx !== -1) { s = s.substring(0, idx); break; }
  }
  return s.slice(0, 2);
}

// ==========================================
// 🛡️ 系統與權限 (System & Auth)
// ==========================================

function getHeaderMap(data) {
  const map = {}; 
  if (!data || data.length === 0) return map;
  data[0].forEach((h, i) => { 
    if (h) {
      const cleanHeader = String(h).replace(/[\s\uFEFF\xA0]/g, '');
      map[cleanHeader] = i; 
    }
  });
  return map;
}

function checkAuth(userId, wlData, map) {
  if (userId === 'mock') {
    return {
      allowed: true,
      level: 'admin',
      name: '測試帳號-小高',
      company: '漢樺建設',
      email: 'titankou2002@gmail.com',
      salesID: '',
      lineID: 'mock',
      userId: 'mock',
      blockedSeries: ''
    };
  }
  const user = wlData.find(r => String(r[map['userid']]) === String(userId));
  if (!user) {
    const welcomeMsg = `嗨！您好！我是小高\n` +
                       `您的專屬 AI 小幫手 ✨\n\n` +
                       `我可以協助您：\n` +
                       `✅ 庫存精準查詢\n` +
                       `✅ 快速查報價\n` +
                       `✅ 產品大圖發送\n` +
                       `✅ 保留查詢系統\n\n` +
                       `為了您的商務安全\n` +
                       `請先讓我認識您喔！\n\n` +
                       `**請直接回傳：公司-姓名**\n` +
                       `( 例如：高雅瓷-小高 )\n\n` +
                       `我會立刻啟動審核\n` +
                       `為您開通權限喔！\n\n` +
                       `PS：加入好友後\n` +
                       `請通知負責業務\n` +
                       `可以加速審核流程喔！`;
    return { allowed: false, msg: welcomeMsg };
  }

  const status = map['狀態'] !== undefined ? String(user[map['狀態']] || '').trim() : '';
  if (status !== 'approved') {
    const pendingMsg = `您的申請已送出，目前狀態為：【待審核】⏳\n\n` +
                       `您的 LINE ID 是：\n` +
                       `\`${userId}\` (點擊複製)\n\n` +
                       `請將您的 LINE ID 提供給負責的業務人員，我們會盡快為您開通權限！`;
    return { allowed: false, msg: pendingMsg };
  }
  
  return {
    allowed: true,
    level: (user[map['等級']] || 'free').toLowerCase(),
    name: user[map['名字']] || '未設定',
    company: user[map['公司']] || '',
    email: user[map['email']] || '',
    salesID: user[map['通知業務ID']],
    lineID: user[map['userid']],
    userId: userId,
    blockedSeries: map['屏蔽系列'] !== undefined ? String(user[map['屏蔽系列']] || '').trim() : ''
  };
}

function filterPriceDataForUser(priceData, priceMap, auth) {
  if (!priceData || priceData.length <= 1) return priceData;
  if (!auth || !auth.blockedSeries) return priceData;
  
  const blockedList = auth.blockedSeries.split(/[,,，]/).map(s => s.trim().toUpperCase()).filter(Boolean);
  if (blockedList.length === 0) return priceData;
  
  const seriesIdx = priceMap['中文系列'];
  if (seriesIdx === undefined) return priceData;
  
  const headers = priceData[0];
  const filteredRows = priceData.slice(1).filter(r => {
    const series = String(r[seriesIdx] || "").trim().toUpperCase();
    return !blockedList.includes(series);
  });
  
  return [headers].concat(filteredRows);
}

function getWhitelistSalesIds() {
  const ss = getSpreadsheetInstance();
  const sh = ss.getSheetByName(SHEET_NAME.WHITELIST);
  const vals = sh ? sh.getDataRange().getValues() : [];
  const map = getHeaderMap(vals);
  const ids = [];
  for (let i = 1; i < vals.length; i++) {
    const level = String(vals[i][map['等級']] || "").toLowerCase();
    const uid = String(vals[i][map['userid']] || "").trim();
    if (uid && ['sales', 'king', 'admin'].includes(level)) {
      ids.push(uid);
    }
  }
  return ids;
}

function getSystemSettingsSheet() { return _getSheetRowsByName('系統設定', 'systemSettingsRows'); }

function getContactForSales(salesIdOrTitle, whitelistData, whitelistMap) {
  let lineId = "";
  let email = "";
  if (!salesIdOrTitle) return { lineId, email };
  const val = String(salesIdOrTitle).trim();

  // 1. Check if the value itself is a valid LINE ID (starts with U and has length between 30 and 40)
  if (val.startsWith('U') && val.length >= 30 && val.length <= 40) {
    lineId = val;
  }

  // 2. Try to lookup in "系統設定" sheet
  const settingsRows = getSystemSettingsSheet();
  if (settingsRows && settingsRows.length > 0) {
    const sMap = getHeaderMap(settingsRows);
    const nameCol = sMap['姓名/稱謂'] !== undefined ? sMap['姓名/稱謂'] : 5;
    const lineCol = sMap['LINEID'] !== undefined ? sMap['LINEID'] : 6;
    const emailCol = sMap['EMAIL'] !== undefined ? sMap['EMAIL'] : 7;

    const matched = settingsRows.slice(1).find(r => {
      const rowName = String(r[nameCol] || "").trim();
      return rowName === val || val.includes(rowName) || rowName.includes(val);
    });

    if (matched) {
      if (!lineId && matched[lineCol]) lineId = String(matched[lineCol]).trim();
      if (!email && matched[emailCol]) email = String(matched[emailCol]).trim();
    }
  }

  // 3. Fallback: Try to lookup in "白名單" sheet
  if ((!lineId || !email) && whitelistData && whitelistMap) {
    const nameCol = whitelistMap['名字'];
    const uidCol = whitelistMap['userid'];
    const emailCol = whitelistMap['email'];

    const matched = whitelistData.slice(1).find(r => {
      const fullName = String(r[nameCol] || "").trim();
      const namePart = fullName.includes('-') ? fullName.split('-')[1] : fullName;
      return namePart === val || fullName === val;
    });

    if (matched) {
      if (!lineId && uidCol !== undefined) lineId = String(matched[uidCol]).trim();
      if (!email && emailCol !== undefined) email = String(matched[emailCol]).trim();
    }
  }
  return { lineId, email };
}

function resolveSalesContactForAuth(auth, wlData, wlMap) {
  let salesIDVal = auth.salesID ? String(auth.salesID).trim() : "";
  let salesEmailVal = "";

  // Try to find if there is an explicit sales email column in the whitelist
  if (wlMap) {
    const emailColName = Object.keys(wlMap).find(k => k.includes('業務EMAIL') || k.includes('業務Email') || k.includes('通知業務EMAIL') || k.includes('負責業務EMAIL'));
    if (emailColName !== undefined && auth.userId) {
      const userRow = wlData.find(r => String(r[wlMap['userid']]) === String(auth.userId));
      if (userRow) {
        salesEmailVal = String(userRow[wlMap[emailColName]] || "").trim();
      }
    }
  }

  let targetLineId = "";
  let targetEmail = "";

  // Check direct LINE ID in salesIDVal
  if (salesIDVal.startsWith('U') && salesIDVal.length >= 30 && salesIDVal.length <= 40) {
    targetLineId = salesIDVal;
  }

  // Check direct email in salesEmailVal
  if (salesEmailVal.includes('@')) {
    targetEmail = salesEmailVal;
  }

  // Resolve using system settings or whitelist fallback
  const resolved = getContactForSales(salesIDVal, wlData, wlMap);
  if (!targetLineId) targetLineId = resolved.lineId;
  if (!targetEmail) targetEmail = resolved.email;

  // Second backup: If we only have salesEmailVal as a name or role, resolve that too
  if (salesEmailVal && !salesEmailVal.includes('@')) {
    const resolvedEmail = getContactForSales(salesEmailVal, wlData, wlMap);
    if (!targetEmail) targetEmail = resolvedEmail.email;
    if (!targetLineId) targetLineId = resolvedEmail.lineId;
  }

  return {
    lineId: targetLineId || CONFIG.ADMIN_NOTIFY_ID,
    email: targetEmail || CONFIG.ADMIN_EMAIL // Fallback to admin email
  };
}

function writeLog(ss, sid, uid, name, level, input, note, email) {
  writeEnhancedLog(ss, sid, uid, name, level, input, note, email, null);
}

function writeEnhancedLog(ss, sid, uid, name, level, input, note, email, extraData) {
  try {
    const logSheet = ss.getSheetByName(SHEET_NAME.LOG);
    if (!logSheet) return;
    const nowStr = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy/MM/dd HH:mm:ss");

    // Default columns A-H
    const row = [nowStr, sid, uid, name, level, input, note, email];

    // Add extra columns I-Q
    if (extraData) {
      row.push(
        extraData.productCode || "",
        extraData.reqQty !== undefined && extraData.reqQty !== null ? extraData.reqQty : "",
        extraData.availPcs !== undefined && extraData.availPcs !== null ? extraData.availPcs : "",
        extraData.stockStatus || "",
        extraData.size || "",
        extraData.color || "",
        extraData.spec || "",
        extraData.notificationStatus || "",
        extraData.salesRepName || ""
      );
    } else {
      // Pad empty values for columns I-Q
      for (let i = 0; i < 9; i++) row.push("");
    }

    // 🚩 [🚀 極速寫入] 改用 appendRow 附加至最後一列（由原本 insertRowBefore(2) 全表平移耗時 1.5s 縮減為 0.05s）
    logSheet.appendRow(row);
  } catch(e) { console.error("Enhanced Log 寫入失敗: " + e); }
}

// ==========================================
// 💬 LINE API 工具 (權限與分流)
// ==========================================

function internalGetQuickReplies(code, auth, isGroup) {
  const level = String(auth ? auth.level : "free").toLowerCase();
  const items = [];
  const cleanCode = code ? String(code).toUpperCase().trim() : "";

  if (['sales', 'king', 'queen', 'admin'].includes(level)) {
    items.push({ "type": "action", "action": { "type": "message", "label": "📌 查保留", "text": cleanCode ? cleanCode + " 保留" : "查保留" } });
  } else {
    const returnText = cleanCode ? "下保留 " + cleanCode : "下保留";
    items.push({ "type": "action", "action": { "type": "message", "label": "📝 下保留", "text": returnText } });
  }

  // 🚩 核心優化：為「查價格」與「看圖片」提取純淨的商品編號 (支援今友利短編號 D124/J16 等)
  const pureCode = cleanCode ? (cleanCode.match(/[a-zA-Z]{1,4}\d{2,}(?:-[a-zA-Z0-9]+)?/i) || cleanCode.match(/\d{5,}(?:-[a-zA-Z0-9]+)?/i) || [cleanCode])[0].toUpperCase() : "";

  if (pureCode && !isGroup) {
    items.push({ "type": "action", "action": { "type": "message", "label": "💰 查價格", "text": pureCode + " 價格" } });
  }

  if (pureCode) {
    items.push({ "type": "action", "action": { "type": "message", "label": "🖼️ 看圖片", "text": pureCode + " 圖片" } });
  }

  return { items: items.slice(0, 13) }; 
}

function sendReply(tk, txt, code, auth, isGroup) {
  const quickReply = internalGetQuickReplies(code, auth, isGroup);
  // 🔔 庫存不足時多一顆「到貨通知我」（私訊才有）
  if (!isGroup && code && String(txt).includes('庫存不足') && typeof buildArrivalSubscribeQuickReply_ === 'function') {
    const subItem = buildArrivalSubscribeQuickReply_(code);
    if (subItem) quickReply.items.unshift(subItem);
  }
  const payload = {
    replyToken: tk,
    messages: [{
      type: 'text',
      text: txt.substring(0, 5000),
      quickReply: quickReply
    }]
  };
  return lineApiFetch('reply', payload);
}

function sendMultiReply(tk, textArray, auth, isGroup) {
  const messages = textArray.map(txt => ({ type: 'text', text: txt.substring(0, 5000) }));
  if (messages.length > 0) {
    messages[messages.length - 1].quickReply = internalGetQuickReplies("", auth, isGroup);
  }
  const payload = { replyToken: tk, messages: messages };
  return lineApiFetch('reply', payload);
}

function sendFlexReply(tk, flexContents, auth, isGroup, code) {
  const payload = { 
    replyToken: tk, 
    messages: [{ 
      type: "flex", 
      altText: "💎 高雅瓷推薦產品：您可以長按分享此訊息", 
      contents: flexContents,
      quickReply: internalGetQuickReplies(code || "", auth, isGroup)
    }] 
  };
  return lineApiFetch('reply', payload);
}

function broadcastToLine(userIds, text) {
  const url = 'https://api.line.me/v2/bot/message/multicast';
  const payload = {
    to: userIds,
    messages: [{ type: 'text', text: text.substring(0, 5000) }]
  };
  return lineApiFetch('multicast', payload);
}

function sendPush(to, txt) {
  const payload = { to: to, messages: [{ type: 'text', text: txt.substring(0, 5000) }] };
  return lineApiFetch('push', payload);
}

function sendAdminPush(to, txt) {
  const payload = { to: to, messages: [{ type: 'text', text: txt.substring(0, 5000) }] };
  return lineApiFetch('push', payload, CONFIG.ADMIN_TOKEN);
}

function sendFlexPush(to, flexContents) {
  const payload = { 
    to: to, 
    messages: [{ 
      type: 'flex', 
      altText: "📦 高雅瓷系統通知：請長按分享本訊息", 
      contents: flexContents 
    }] 
  };
  const response = lineApiFetch('push', payload);
  if (response && response.getResponseCode() !== 200) {
    console.error("sendFlexPush 推播失敗：" + response.getContentText());
  }
  return response;
}

function sendAdminFlexPush(to, flexContents) {
  const payload = { 
    to: to, 
    messages: [{ 
      type: 'flex', 
      altText: "📦 高雅瓷系統通知：請長按分享本訊息", 
      contents: flexContents 
    }] 
  };
  const response = lineApiFetch('push', payload, CONFIG.ADMIN_TOKEN);
  if (response && response.getResponseCode() !== 200) {
    console.error("sendAdminFlexPush 推播失敗：" + response.getContentText());
  }
  return response;
}

// ==========================================
// 📨 Telegram 通知（取代原本推給管理員/業務的 LINE 主動通知）
// ==========================================

/**
 * @param {string} text - 訊息內容
 * @param {Array<Array<{text:string, url:string}>>} [buttons] - 選填，inline keyboard 按鈕列，
 *   每個內層陣列是同一橫排的按鈕，例如 [[{text:'核准', url:'...'}], [{text:'核准A', url:'...'}, {text:'拒絕', url:'...'}]]
 */
function pushTelegram(text, buttons) {
  const chatId = PropertiesService.getScriptProperties().getProperty('TELEGRAM_CHAT_ID');
  return pushTelegramTo(chatId, text, buttons);
}

/**
 * 推送 Telegram 到指定 chat（業務個人 / 群組皆可用）
 * @param {string} chatId - 目標 chat id
 * @param {string} text - 訊息內容
 * @param {Array<Array<{text:string, url:string}>>} [buttons] - 選填，inline keyboard 按鈕列
 */
function pushTelegramTo(chatId, text, buttons) {
  const token = PropertiesService.getScriptProperties().getProperty('TELEGRAM_BOT_TOKEN');
  if (!token || !chatId) {
    console.error('Telegram 未設定 TELEGRAM_BOT_TOKEN 或缺少目標 chatId，通知未送出');
    return null;
  }
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    // 🚩 不用 parse_mode（純文字）：通知內容常含客戶輸入的案名/地址等任意字元，
    // Markdown 遇到未跳脫的 _ * [ ` 等符號會讓整則訊息送出失敗，純文字最穩定；
    // Telegram 對純文字裡的網址仍會自動轉為可點擊連結。
    const body = {
      chat_id: chatId,
      text: text,
      disable_web_page_preview: true
    };
    if (buttons && buttons.length > 0) {
      body.reply_markup = { inline_keyboard: buttons };
    }
    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(body),
      muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) {
      console.error('Telegram 推播失敗：' + response.getContentText());
    }
    return response;
  } catch (e) {
    console.error('Telegram 推播嚴重失敗：' + e);
    return null;
  }
}

/**
 * 依業務名稱查詢其私人 Telegram chat id
 * 來源：系統設定 工作表的「TELEGRAM」欄位（依「姓名/稱謂」比對）。
 * 欄位可填：數字 user id，或「@username」（會自動反查數字 id，查不到回傳 ''）。
 */
function resolveBusinessTelegramChatId(bizName) {
  try {
    const val = String(bizName || '').trim();
    if (!val) return '';
    const settingsRows = getSystemSettingsSheet();
    if (!settingsRows || settingsRows.length < 2) return '';
    const sMap = getHeaderMap(settingsRows);
    const nameCol = sMap['姓名/稱謂'] !== undefined ? sMap['姓名/稱謂'] : 5;
    const tgKey = Object.keys(sMap).find(k => k.toLowerCase().replace(/\s+/g, '') === 'telegram');
    const tgCol = tgKey !== undefined ? sMap[tgKey] : -1;
    if (tgCol < 0) return '';
    const matched = settingsRows.slice(1).find(r => {
      const rowName = String(r[nameCol] || '').trim();
      const a = rowName.toLowerCase(), b = val.toLowerCase();
      return a === b || a.includes(b) || b.includes(a);
    });
    if (!matched) return '';
    return _normalizeTelegramChatId_(String(matched[tgCol] || '').trim());
  } catch (e) {
    console.error('查詢業務 Telegram chat id 失敗：' + e);
    return '';
  }
}

/** 把 TELEGRAM 欄位的值正規化成可用 chat id：
 *  - 純數字 → 直接回傳
 *  - 含 @username → 從 getUpdates（私聊）/ 群組管理員 反查數字 user id
 */
function _normalizeTelegramChatId_(raw) {
  if (!raw) return '';
  const v = String(raw).trim();
  if (/^-?\d+$/.test(v)) return v;

  const m = v.match(/@([A-Za-z0-9_]+)/);
  const username = m ? m[1] : '';
  if (!username) return '';

  const cacheKey = 'TG_USER_' + username.toLowerCase();
  let cache = null;
  try { cache = CacheService.getScriptCache(); } catch (e) {}
  if (cache) {
    const cached = cache.get(cacheKey);
    if (cached) return cached;
  }

  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('TELEGRAM_BOT_TOKEN');
  if (!token) return '';
  const candidates = [];

  // 1. getUpdates 私聊反查
  try {
    const r = UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=100`, { muteHttpExceptions: true });
    const j = JSON.parse(r.getContentText());
    (j.ok && j.result ? j.result : []).forEach(up => {
      const msg = up.message || (up.callback_query && (up.callback_query.message || up.callback_query.from));
      if (!msg || !msg.chat) return;
      const from = msg.from || {};
      if (String(from.username || '').toLowerCase() === username.toLowerCase() && msg.chat.type === 'private') {
        candidates.push(String(msg.chat.id));
      }
    });
  } catch (e) { console.error('getUpdates 反查 username 失敗：' + e); }

  // 2. 公佈欄群組管理員反查（admin user id = 私人 chat id）
  if (candidates.length === 0) {
    try {
      const groupId = props.getProperty('TELEGRAM_CHAT_ID');
      if (groupId) {
        const r = UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/getChatAdministrators?chat_id=${encodeURIComponent(groupId)}`, { muteHttpExceptions: true });
        const j = JSON.parse(r.getContentText());
        (j.ok && j.result ? j.result : []).forEach(a => {
          const u = a.user || {};
          if (String(u.username || '').toLowerCase() === username.toLowerCase()) {
            candidates.push(String(u.id));
          }
        });
      }
    } catch (e) { console.error('群組管理員反查 username 失敗：' + e); }
  }

  if (candidates.length === 0) return '';
  const resolved = candidates[0];
  try { cache.put(cacheKey, resolved, 600); } catch (e) {}
  return resolved;
}

function lineApiFetch(endpoint, payload, token) {
  const url = 'https://api.line.me/v2/bot/message/' + endpoint;
  const apiToken = token || CONFIG.TOKEN;
  // 🔔 回覆客戶時順便附上「待告知」的到貨通知（回覆不吃 LINE 免費則數）
  const arrivalRows = (endpoint === 'reply' && !token && typeof attachPendingArrivalNotices_ === 'function')
    ? attachPendingArrivalNotices_(payload) : null;
  try {
    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      headers: {
        'Authorization': "Bearer " + apiToken,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    if (arrivalRows && response.getResponseCode() === 200) markArrivalNoticesDelivered_(arrivalRows);
    return response;
  } catch (e) {
    console.error("UrlFetchApp 執行嚴重失敗: " + e);
    return null;
  }
}

// ==========================================
// 🛠️ 試算表整理小工具 (Spreadsheet Productivity)
// ==========================================

/** 將全表落落長的網址通通變成乾淨的小圖示連結 🚀 */
function prettifyAllUrls() {
  const ss = SpreadsheetApp.openById(CONFIG.DATA_SS_ID);
  const sheet = ss.getSheetByName(SHEET_NAME.PRICE);
  if (!sheet) return;

  const range = sheet.getDataRange();
  const data = range.getValues();
  const rows = data.length;
  const cols = data[0].length;
  
  const excludedNames = ['FLEX快取', "最後推播", "log", "快取", "快取資料"];
  const header = data[0];
  const excludedCols = excludedNames.map(name => header.indexOf(name)).filter(idx => idx > -1);
  
  let count = 0;
  for (let i = 1; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      if (excludedCols.indexOf(j) > -1) continue;
      const cellValue = String(data[i][j]);
      if (cellValue.indexOf('http') === 0 && cellValue.length > 15) {
        let label = "🔗"; 
        if (cellValue.indexOf('drive.google.com') > -1) label = "🖼️";
        else if (cellValue.toLowerCase().indexOf('.pdf') > -1 || cellValue.indexOf('catalog') > -1) label = "📕";
        
        const richValue = SpreadsheetApp.newRichTextValue().setText(label).setLinkUrl(cellValue).build();
        sheet.getRange(i + 1, j + 1).setRichTextValue(richValue);
        count++;
      }
    }
  }
  SpreadsheetApp.getUi().alert("✨ 全表美化完成！系統欄位已自動跳過，共處理 " + count + " 個連結。");
}

/** ⏪ 還原美化：將小圖示還原為原始網址 */
function revertPrettifyUrls() {
  const ss = SpreadsheetApp.openById(CONFIG.DATA_SS_ID);
  const sheet = ss.getSheetByName(SHEET_NAME.PRICE);
  if (!sheet) return;

  const range = sheet.getDataRange();
  const richValues = range.getRichTextValues();
  let count = 0;

  for (let i = 1; i < richValues.length; i++) {
    for (let j = 0; j < richValues[i].length; j++) {
      const rv = richValues[i][j];
      const link = rv.getLinkUrl();
      if (link) {
        sheet.getRange(i + 1, j + 1).setValue(link);
        count++;
      }
    }
  }
  SpreadsheetApp.getUi().alert("✅ 網址還原完成！共還原 " + count + " 個連結。");
}

/** 在試算表網址旁邊直接產生小圖預覽，方便篩選 📸 */
function generateImagePreviews() {
  const ss = SpreadsheetApp.openById(CONFIG.DATA_SS_ID);
  const sheet = ss.getSheetByName(SHEET_NAME.PRICE);
  const range = sheet.getDataRange();
  const data = range.getValues();
  const richData = range.getRichTextValues();
  const header = data[0];
  
  const targetCols = [];
  for(let j=0; j<header.length; j++){
    if(header[j].indexOf('實景') > -1 && header[j].indexOf('預覽') === -1) targetCols.push(j);
  }

  if (targetCols.length === 0) {
    SpreadsheetApp.getUi().alert("❌ 找不到標題含有「實景」的欄位。");
    return;
  }

  targetCols.forEach(colIdx => {
    for (let i = 1; i < data.length; i++) {
      const rawUrl = richData[i][colIdx].getLinkUrl();
      const url = rawUrl || String(data[i][colIdx]);
      if (url && url.indexOf('http') === 0) {
        let previewUrl = url;
        if(url.indexOf('drive.google.com') > -1){
           const idMatch = url.match(/id=([\w-]+)/) || url.match(/\/d\/([\w-]+)/);
           if(idMatch) previewUrl = "https://drive.google.com/uc?export=view&id=" + idMatch[1];
        }
        sheet.getRange(i + 1, colIdx + 1).setFormula(`=IMAGE("${previewUrl}", 4, 80, 80)`);
      }
    }
  });
  SpreadsheetApp.getUi().alert("✅ 圖片預覽已產生！");
}

/** 📧 觸發器設定工具：保留追蹤通知（週一~五 19:00，門檻在函式內依星期決定） */
function setupDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'sendReservationExpiryAlerts') ScriptApp.deleteTrigger(t);
  });
  const weekdays = [
    ScriptApp.WeekDay.MONDAY,
    ScriptApp.WeekDay.TUESDAY,
    ScriptApp.WeekDay.WEDNESDAY,
    ScriptApp.WeekDay.THURSDAY,
    ScriptApp.WeekDay.FRIDAY
  ];
  weekdays.forEach(day => {
    ScriptApp.newTrigger('sendReservationExpiryAlerts').timeBased().onWeekDay(day).atHour(19).create();
  });
  SpreadsheetApp.getUi().alert('✅ 已設定保留追蹤 Telegram 通知 (每週一~五 19:00)');
}

function manualTriggerSendAlerts() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.alert('確定要立即發送保留追蹤 Telegram 通知嗎？', ui.ButtonSet.YES_NO);
  if (res === ui.Button.YES) {
    sendReservationExpiryAlerts(true);
    ui.alert('✅ 已執行發送程序！');
  }
}

/** 🧹 清除所有產品的 Flex 圖片快取 */
function clearAllFlexCache() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("編輯價目表") || ss.getSheetByName("編號價目表") || ss.getSheetByName(SHEET_NAME.PRICE);
  if (!sheet) {
    SpreadsheetApp.getUi().alert("❌ 找不到「編號價目表」。");
    return;
  }
  const data = sheet.getDataRange().getValues();
  const map = getHeaderMap(data);
  const colIdx = map['FLEX快取'];
  
  if (colIdx === undefined) {
    console.log("❌ 找不到「FLEX快取」欄位。");
    return;
  }

  console.log("⚠️ 開始清除所有產品的圖片快取...");
  sheet.getRange(2, colIdx + 1, data.length - 1).clearContent();
  resetDataCache(); // 同時清除內存快取
  console.log("✅ 圖片快取已全部移除！下次查詢將重新掃描最新圖片。");
}

/** 🚩 [v24.2] 強制清空內存快取 */
function resetDataCache() {
  for (let key in _CACHE) {
    _CACHE[key] = null;
  }
}

/** ⚡ [v24.6] 一鍵預建所有產品的圖卡快取 (超高速批次寫入版) */
function batchBuildFlexCache() {
  const ss = SpreadsheetApp.openById(CONFIG.DATA_SS_ID);
  const sheet = ss.getSheetByName("編輯價目表") || ss.getSheetByName("編號價目表") || ss.getSheetByName(SHEET_NAME.PRICE);
  if (!sheet) {
    SpreadsheetApp.getUi().alert("❌ 找不到價目表。");
    return;
  }

  const data = sheet.getDataRange().getValues();
  const formulas = sheet.getDataRange().getFormulas();
  const map = getHeaderMap(data);
  const colCode = map['編號'];
  const colFlexImg = map['FLEX圖卡']; // 🚩 欄位可能已不存在（改用實景1~7/單片連結網址等），下面 colFlexImg undefined 時已安全處理，不強制要求存在
  const colCache = map['FLEX快取'];

  if (colCode === undefined || colCache === undefined) {
    console.log("❌ 欄位配置錯誤（找不到「編號」或「FLEX快取」欄位）。");
    return;
  }

  console.log("⚡ 開始建立圖卡快取 ⚡\n系統將掃描所有產品的 Google Drive 圖片、文宣、目錄，並將結果寫入「FLEX快取」欄位。");

  const modeConfirm = ui.alert("⚡ 選擇快取重建模式 ⚡\n\n點選『是 (YES)』：【覆寫更新所有產品】的快取（適合剛放了新圖片、想要全部重新掃描時）\n\n點選『否 (NO)』：【只預建尚未快取的商品】（只對空白的商品做快取）", ui.ButtonSet.YES_NO);
  const forceOverwrite = (modeConfirm === ui.Button.YES);

  const startTime = new Date().getTime();
  const toast = (msg) => ss.toast(msg, "⚡ 圖卡預建庫中...", 5);
  
  // 🚩 [v24.6] 使用陣列快取，最後一次性批次寫入
  const cacheColData = []; // [{ rowIdx, value }]
  let count = 0;
  let skipped = 0;

  // 🚩 先取得實景欄位的索引
  const sceneCols = ["實景1","實景2","實景3","實景4","實景5","實景6","實景7"];
  const sceneColIdxs = sceneCols.map(n => map[n]).filter(v => v !== undefined);

  for (let i = 1; i < data.length; i++) {
    // 🚩 執行時間保護
    if (new Date().getTime() - startTime > 250000) {
      // 先把已算好的快取批次寫入後再安全降落
      _batchWriteCache(sheet, cacheColData, colCache);
      resetDataCache();
      console.log(`⚠️ 執行時間到達上限！已快取 ${count} 件商品（跳過 ${skipped} 件）。請重新執行繼續。`);
      return;
    }

    const code = String(data[i][colCode]).toUpperCase().trim();
    if (!code) continue;

    const existingCache = data[i][colCache];
    if (existingCache && !forceOverwrite) {
      skipped++;
      continue;
    }

    if (i % 20 === 0) toast(`正在處理 ${code} (${i}/${data.length - 1})...`);

    let images = [];
    const parentId = String(data[i][colFlexImg] || "").match(/folders\/([\w-]+)/)?.[1];

    // 1. 優先取試算表中的「實景1~7」欄位（包含 IMAGE 公式解析）
    sceneColIdxs.forEach(colIdx => {
      let val = String(data[i][colIdx] || "").trim();
      // 嘗試從 IMAGE 公式提取
      if (!val || !val.includes("http")) {
        const formula = String(formulas[i][colIdx] || "");
        if (formula.toUpperCase().includes("IMAGE(")) {
          // 精準提取 IMAGE("URL") 或 IMAGE('URL') 中的 URL
          const matchDouble = formula.match(/IMAGE\s*\(\s*"(https?:\/\/[^"]+)"/i);
          const matchSingle = formula.match(/IMAGE\s*\(\s*'(https?:\/\/[^']+)'/i);
          if (matchDouble) val = matchDouble[1];
          else if (matchSingle) val = matchSingle[1];
        }
      }
      if (val && val.includes("http")) {
        if (val.includes("drive.google.com") && !val.includes("thumbnail")) {
          const id = val.match(/[\w-]{25,}/);
          if (id) val = "https://drive.google.com/thumbnail?id=" + id[0] + "&sz=w600";
        }
        if (!images.includes(val)) images.push(val);
      }
    });

    // 2. 若無實景，才掃描 Drive 資料夾
    if (images.length === 0 && parentId) {
      try {
        images = fetchSmartImages(parentId, ["實景照", "實蹟圖", "完工照", "02_實景照"], code);
      } catch(e) {}
    }

    // 3. 保底：使用單片連結
    if (images.length === 0) {
      const singleColIdx = map['單片連結網址'];
      if (singleColIdx !== undefined) {
        const singleUrl = String(data[i][singleColIdx] || "").trim();
        if (singleUrl && singleUrl.includes("http")) images.push(singleUrl);
      }
    }

    // 4. 讀取原廠目錄欄位用於快取
    let catalogUrl = "";
    const catalogIdx = map['原廠目錄'];
    if (catalogIdx !== undefined) {
      catalogUrl = String(data[i][catalogIdx] || "").trim();
      if (!catalogUrl || !catalogUrl.includes("http")) {
        const flexUrl = String(data[i][colFlexImg] || "").trim();
        catalogUrl = (flexUrl && flexUrl.includes("http")) ? flexUrl : "";
      }
    }

    // 5. 讀取系列介紹欄位用於快取
    let introUrl = "";
    const introIdx = map['系列介紹'];
    if (introIdx !== undefined) {
      introUrl = String(data[i][introIdx] || "").trim();
      if (!introUrl || !introUrl.includes("http")) {
        const r2IntroIdx = map['R2_系列介紹'];
        if (r2IntroIdx !== undefined) {
          introUrl = String(data[i][r2IntroIdx] || "").trim();
        }
      }
    }

    // 🚩 [v24.6] 不呼叫 updateItemCache，直接記錄到待寫陣列
    const cacheObj = { scene: images.slice(0, 10), catalog: catalogUrl, introUrl: introUrl, updated: new Date().toISOString() };
    cacheColData.push({ rowIdx: i + 1, value: JSON.stringify(cacheObj) });
    count++;

    // 每 50 件先批次寫入一次 (防止資料遺失)
    if (cacheColData.length >= 50) {
      _batchWriteCache(sheet, cacheColData, colCache);
      cacheColData.length = 0; // 清空暫存
    }
  }

  // 寫入剩餘資料
  _batchWriteCache(sheet, cacheColData, colCache);
  resetDataCache();
  console.log(`🎉 圖卡快取預建完成！本次成功掃描並快取了 ${count} 件商品！（跳過已快取商品 ${skipped} 件）`);
}

/** 🚀 批次寫入快取值到試算表 */
function _batchWriteCache(sheet, items, colIdx) {
  if (!items || items.length === 0) return;
  items.forEach(item => {
    try {
      sheet.getRange(item.rowIdx, colIdx + 1).setValue(item.value);
    } catch(e) {
      console.error("批次寫入快取失敗 row " + item.rowIdx + ": " + e);
    }
  });
}

/**
 * 🔄 手動清除價目表快取（小姐更新後可手動執行清除，促使系統重新抓取）
 */
function clearPriceSheetCache() {
  if (typeof CacheManager !== 'undefined') {
    // 🚩 修正版本號對不上的 bug：getPriceSheet() 實際存的 key 是 _v2，這裡原本清的是 _v1，
    // 導致這個「清除快取」工具從快取機制升級到 v2 之後就從未真正清除過任何東西。
    CacheManager.removeLarge("price_sheet_data_large_v2");
  }
  console.log("價目表快取已清除！下次查詢將重新載入。");
}

/**
 * 📦 大量快取處理工具 (解決 90KB 限制，批次原子讀寫)
 */
const CacheManager = {
  putLarge: function(key, data, expirationInSeconds = 600) {
    const cache = CacheService.getScriptCache();
    try {
      const json = JSON.stringify(data);
      const chunkSize = 80000; // 80KB chunks
      const cacheMap = {};
      let partIndex = 0;
      
      for (let i = 0; i < json.length; i += chunkSize) {
        cacheMap[key + "_part_" + partIndex] = json.substring(i, i + chunkSize);
        partIndex++;
      }
      
      cacheMap[key + "_meta"] = JSON.stringify({ count: partIndex, size: json.length, time: new Date().getTime() });
      cache.putAll(cacheMap, expirationInSeconds);
      return true;
    } catch(e) {
      console.error("CacheManager 儲存失敗:", e);
      return false;
    }
  },
  
  getLarge: function(key) {
    const cache = CacheService.getScriptCache();
    try {
      const metaStr = cache.get(key + "_meta");
      if (!metaStr) return null;
      
      const meta = JSON.parse(metaStr);
      const keys = [];
      for (let i = 0; i < meta.count; i++) {
        keys.push(key + "_part_" + i);
      }
      const parts = cache.getAll(keys);
      let fullJson = "";
      for (let i = 0; i < meta.count; i++) {
        const part = parts[key + "_part_" + i];
        if (part === undefined || part === null) return null; // 碎片遺失，視為快取過期
        fullJson += part;
      }
      
      return JSON.parse(fullJson);
    } catch(e) {
      console.error("CacheManager 讀取失敗:", e);
      return null;
    }
  },
  
  removeLarge: function(key) {
    const cache = CacheService.getScriptCache();
    try {
      const metaStr = cache.get(key + "_meta");
      if (metaStr) {
        const meta = JSON.parse(metaStr);
        const keys = [key + "_meta"];
        for (let i = 0; i < meta.count; i++) {
          keys.push(key + "_part_" + i);
        }
        cache.removeAll(keys);
      }
    } catch (e) {
      console.error("CacheManager 清除失敗:", e);
    }
  }
};

// ==========================================
// 📸 圖片連結標準化 (Image URL Normalization)
// ==========================================

/**
 * 將各種格式的圖片連結轉換為 LINE 可直接打開的格式
 *
 * 支援格式：
 * 1. Google Drive /file/d/ 格式 → /uc?export=download 格式
 * 2. Google Drive /uc?export=view 格式 → 保持不變
 * 3. wsrv.nl 代理連結 → 保持不變
 * 4. R2 / CDN 連結 → 保持不變
 * 5. 其他 http/https 連結 → 保持不變
 *
 * @param {string} url - 原始圖片連結
 * @return {string} 轉換後的連結
 */
function normalizeImageUrlForLine(url) {
  if (!url || typeof url !== 'string') return '';

  url = url.trim();

  // 1. 若已經是 Cloudflare R2、wsrv.nl 或外部合法 CDN 圖片，直接採用
  if (url.includes("r2.dev") || url.includes("wsrv.nl") || url.includes(".r2.cloudflarestorage.com")) {
    return url;
  }

  // 2. Google Drive 萬用格式解析：
  // 支援 /file/d/ID、/uc?id=ID、/uc?export=view&id=ID、/thumbnail?id=ID、/open?id=ID 等
  // 🚩 LINE 規範：originalContentUrl / previewImageUrl 必須直出 HTTP 200 與 image/jpeg 或 image/png。
  // drive.google.com/thumbnail 或 /uc 端點常回傳 302/303 重定向與 application/binary，
  // 導致 LINE 圖片爬蟲拒絕載入而出現灰底驚嘆號/破圖圖示。
  // 統一轉換至 lh3.googleusercontent.com/d/FILEID=w1000（Google 官方全球高速 CDN，直出 200 OK image/jpeg）。
  if (url.includes("drive.google.com") || url.includes("googleusercontent.com")) {
    let fileId = null;
    const idMatch = url.match(/[?&]id=([-\w]+)/);
    if (idMatch && idMatch[1]) {
      fileId = idMatch[1];
    } else {
      const dMatch = url.match(/\/d\/([-\w]+)/);
      if (dMatch && dMatch[1]) {
        fileId = dMatch[1];
      } else {
        const generalMatch = url.match(/[-\w]{25,}/);
        if (generalMatch) fileId = generalMatch[0];
      }
    }

    if (fileId) {
      return "https://lh3.googleusercontent.com/d/" + fileId + "=w1000";
    }
  }

  // 3. 其他格式保持不變
  return url;
}

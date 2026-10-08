/**
 * 高雅瓷 AI 智能客服 - 多公司查詢引擎（喜悅納 / 安帝嘉）
 * 檔案：10_MultiCompany.gs
 * 🚩 規則：
 * 1. 高雅瓷優先：routeDispatcher 高雅瓷查無結果才落到本模組。
 * 2. 權限：free 不查安/喜（無反應）；premium 查安/喜必須含坪數；king/sales/admin/queen 全查。
 * 3. 安/喜必須輸入「完整編號」才動作（含字母+數字的完整代碼，純數字只適用高雅瓷）。
 * 4. 有圖回 Flex 圖卡，無圖回文字，皆標示來源公司。
 * 5. 資料讀取依 gid 精準鎖定分頁（防分頁改名失效），附 CacheManager 快取。
 */

const MULTI_COMPANIES = {
  GYC: { name: '高雅瓷', ssId: CONFIG.DATA_SS_ID, priceGid: '1692526565', stockGid: '204203357' },
  XYN: { name: '喜悅納', ssId: '1uFKKWBfulg-GmCbJsSomimT5LW5r0N2w28rubrPveTA', priceGid: '1714485893', stockGid: '424169844', reserveGid: '794405612' },
  ADG: { name: '安帝嘉', ssId: '16QNID9hLs2K1iy_ePo7MxYxhW4kpDrDlfEIZ2p83ixo', priceGid: '980246579', stockGid: '1996261808', reserveGid: '1404882584' }
};

/** 多公司查詢允許的公司清單（不含高雅瓷，高雅瓷走原本流程） */
const MULTI_QUERYABLE_KEYS = ['XYN', 'ADG'];

/** 計算某公司某品號的已保留片數 */
function getMultiCompanyReservedPcs_(companyKey, code) {
  const c = MULTI_COMPANIES[companyKey];
  if (!c || !c.reserveGid) return 0;
  const data = getMultiCompanySheetData_(c.ssId, c.reserveGid, 'mc_reserve_' + companyKey);
  if (!data || data.length < 2) return 0;
  const map = getHeaderMap(data);
  
  let codeIdx = -1;
  let qtyIdx = -1;
  Object.keys(map).forEach(k => {
    if (k.includes('編號') || k.includes('品號')) codeIdx = map[k];
    if (k.includes('數量') || k.includes('片') || k.includes('坪')) qtyIdx = map[k];
  });
  if (codeIdx === -1 || qtyIdx === -1) return 0;

  let reserved = 0;
  for (let i = 1; i < data.length; i++) {
    const sc = String(data[i][codeIdx] || '').toUpperCase().trim();
    if (sc === code) {
      const qVal = (typeof safeN === 'function') ? safeN(data[i][qtyIdx]) : (parseFloat(data[i][qtyIdx]) || 0);
      reserved += qVal;
    }
  }
  return reserved;
}
function getMultiCompanySheetData_(ssId, gid, cacheKey) {
  const cached = (typeof CacheManager !== 'undefined') ? CacheManager.getLarge(cacheKey) : null;
  if (cached) return cached;

  let data = [];
  try {
    const ss = SpreadsheetApp.openById(ssId);
    const sheets = ss.getSheets();
    const target = sheets.find(s => String(s.getSheetId()) === String(gid));
    if (target) data = target.getDataRange().getValues();
  } catch (e) {
    console.error('讀取多公司分頁失敗 ssId=' + ssId + ' gid=' + gid + '：' + e);
    return [];
  }

  if (data && data.length > 0 && typeof CacheManager !== 'undefined') {
    CacheManager.putLarge(cacheKey, data, 3600);
  }
  return data;
}

/** 取得某公司價目表（含表頭 map） */
function getMultiCompanyPriceData_(companyKey) {
  const c = MULTI_COMPANIES[companyKey];
  if (!c) return { data: [], map: {} };
  const data = getMultiCompanySheetData_(c.ssId, c.priceGid, 'mc_price_' + companyKey);
  return { data, map: getHeaderMap(data) };
}

/** 取得某公司庫存表（含表頭 map） */
function getMultiCompanyStockData_(companyKey) {
  const c = MULTI_COMPANIES[companyKey];
  if (!c) return { data: [], map: {} };
  const data = getMultiCompanySheetData_(c.ssId, c.stockGid, 'mc_stock_' + companyKey);
  return { data, map: getHeaderMap(data) };
}

/**
 * 多公司查詢入口：依權限決定是否查安/喜，並執行查詢。
 * @returns {object|string|""} Flex 圖卡 / 文字 / 空（不處理）
 */
function handleMultiCompanyQuery_(q, auth, isGroup) {
  const level = String(auth ? auth.level : '').toLowerCase();
  const isAgent = ['sales', 'king', 'queen', 'admin'].includes(level);
  const isPremium = level === 'premium';
  if (!isAgent && !isPremium) return "";

  // 安/喜必須輸入「完整編號」（含字母+數字的完整代碼，純數字只適用高雅瓷）
  const code = extractMultiCompanyCode_(q);
  if (!code) return "";

  // premium 查安/喜必須含坪數
  if (isPremium) {
    const qtyMatch = q.match(/(\d+(?:\.\d+)?)\s*(坪|p)/i);
    if (!qtyMatch) {
      return `💡 查詢 ${code} 庫存請輸入「${code} + 坪數」\n例如：${code} 20坪`;
    }
  }

  const wantImage = /圖片|照片|圖檔|看圖|實景|完工照|實蹟圖|實景圖|圖|看/i.test(q);

  const results = [];
  MULTI_QUERYABLE_KEYS.forEach(key => {
    const r = searchMultiCompanyByCode_(key, code, q, wantImage, auth);
    if (r) results.push(r);
  });

  if (results.length === 0) return "";

  // 回傳第一筆命中（安/喜同編號極罕見；多筆場景可再擴充 sendMultiReply）
  return results[0];
}

/** 從輸入抽出「完整編號」（含字母開頭＋數字，如 KP61249、PE30624RB、AC120121） */
function extractMultiCompanyCode_(q) {
  const clean = String(q || '').replace(/圖片|照片|圖檔|實景|完工照|實蹟圖|實景圖|圖|看|庫存|價格|多少錢|多少|錢/g, '')
    .replace(/\d+(?:\.\d+)?\s*(坪|p|片|箱|包)/i, '')
    .trim();
  const m = clean.match(/[a-zA-Z]{1,4}\d{4,}[a-zA-Z0-9-]*/i);
  return m ? m[0].toUpperCase() : "";
}

/** 高雅瓷價目表是否「精確」存在此編號（避免模糊搜尋誤配，導致安/喜被吞掉） */
function isExactCodeInGYC_(code) {
  const target = String(code || '').toUpperCase().trim();
  if (!target) return false;
  try {
    const priceData = getPriceSheet();
    if (!priceData || priceData.length < 2) return false;
    const map = getHeaderMap(priceData);
    const idx = map['編號'];
    if (idx === undefined) return false;
    for (let i = 1; i < priceData.length; i++) {
      if (String(priceData[i][idx] || '').toUpperCase().trim() === target) return true;
    }
  } catch (e) { console.error('高雅瓷精確比對失敗：' + e); }
  return false;
}

/** 在某公司內依完整編號精確查詢（價目表）+ 庫存表加總，組文字或 Flex */
function searchMultiCompanyByCode_(companyKey, code, q, wantImage, auth) {
  const { data: priceData, map: pMap } = getMultiCompanyPriceData_(companyKey);
  if (!priceData || priceData.length < 2) return null;

  const idxCode = pMap['編號'];
  if (idxCode === undefined) return null;

  let row = null;
  for (let i = 1; i < priceData.length; i++) {
    if (String(priceData[i][idxCode] || '').toUpperCase().trim() === code) { row = priceData[i]; break; }
  }
  if (!row) return null;

  const c = MULTI_COMPANIES[companyKey];
  const series = String(row[pMap['中文系列']] || '').trim();
  const size = String(row[(pMap['尺寸(cm)'] !== undefined ? pMap['尺寸(cm)'] : pMap['尺寸'])] || '').trim();
  const price = String(row[pMap['同行價']] || '').replace('$', '').trim();

  // 庫存表加總片數
  const { data: stockData, map: sMap } = getMultiCompanyStockData_(companyKey);
  const idxSCode = sMap['編號'];
  const idxSPcs = sMap['片數'];
  let totalPcs = 0;
  if (stockData && stockData.length > 1 && idxSCode !== undefined && idxSPcs !== undefined) {
    for (let i = 1; i < stockData.length; i++) {
      const sc = String(stockData[i][idxSCode] || '').toUpperCase().trim();
      const nm = String(stockData[i][sMap['品名']] || '').trim();
      if (sc === code && !nm.includes('小計')) {
        totalPcs += (typeof safeN === 'function') ? safeN(stockData[i][idxSPcs]) : (parseFloat(stockData[i][idxSPcs]) || 0);
      }
    }
  }

  // 坪數換算：用價目表「片/坪」，缺欄 fallback 1
  const pps = (pMap['片/坪'] !== undefined) ? ((typeof safeN === 'function' ? safeN(row[pMap['片/坪']]) : parseFloat(row[pMap['片/坪']])) || 1) : 1;
  const totalPing = pps > 0 ? Math.floor(totalPcs / pps) : 0;

  // 扣除保留計算可用片數與坪數
  const reservedPcs = getMultiCompanyReservedPcs_(companyKey, code);
  const availablePcs = Math.max(0, totalPcs - reservedPcs);
  const availablePing = pps > 0 ? Math.floor(availablePcs / pps) : 0;

  // 圖片：優先單片連結網址 → 實景1 → 主圖URL
  const imgCandidates = ['單片連結網址', '實景1', '主圖URL', '雲端圖片'];
  let imgUrl = '';
  for (const k of imgCandidates) {
    const idx = pMap[k];
    if (idx !== undefined) {
      const url = String(row[idx] || '').trim();
      if (url && url.includes('http')) { imgUrl = url; break; }
    }
  }
  const displayUrl = (typeof normalizeJinYouLiImageUrl_ === 'function') ? normalizeJinYouLiImageUrl_(imgUrl) : imgUrl;

  // 🚩 額外圖檔與按鈕來源提取（系列介紹、原廠目錄、模面變化、實景數）
  const introUrl = pMap['系列介紹'] !== undefined ? String(row[pMap['系列介紹']] || '').trim() : '';
  const catalogUrl = pMap['原廠目錄'] !== undefined ? String(row[pMap['原廠目錄']] || '').trim() : '';
  
  let singleUrl = '';
  for (let i = 1; i <= 9; i++) {
    const idx = pMap[`單片${i}`];
    if (idx !== undefined) {
      const u = String(row[idx] || '').trim();
      if (u && u.includes('http')) { singleUrl = u; break; }
    }
  }

  let sceneCount = 0;
  for (let i = 1; i <= 7; i++) {
    const idx = pMap[`實景${i}`];
    if (idx !== undefined) {
      const u = String(row[idx] || '').trim();
      if (u && u.includes('http')) sceneCount++;
    }
  }

  const level = String(auth ? auth.level : '').toLowerCase();
  const isPremium = level === 'premium';

  let text = "";
  let statusColor = "#333333"; // 預設顏色
  if (isPremium) {
    // Premium 格式：無 emoji，商務簡潔風格，字大、有貨綠字/無貨紅字
    const userQtyMatch = q.match(/(\d+(?:\.\d+)?)\s*(坪|p)/i);
    const userPingText = userQtyMatch ? userQtyMatch[0] : "";
    const reqPing = userQtyMatch ? parseFloat(userQtyMatch[1]) : 0;
    
    if (reqPing > 0) {
      const isEnough = availablePing >= reqPing;
      statusColor = isEnough ? "#16a34a" : "#dc2626"; // 綠字 or 紅字
      const statusStr = isEnough ? "有貨" : `庫存不足 (僅剩${availablePing}坪)`;
      text = `${series}-${c.name}\n${code} ${size}\n${userPingText} ${statusStr}`;
    } else {
      text = `${series}-${c.name}\n${code} ${size}\n可用庫存：${availablePing}坪`;
    }
  } else {
    // Sales / King 格式：無 emoji，簡易排版顯示庫存
    text = `${series}-${c.name}\n`;
    text += `${code} ${size}\n`;
    text += `庫存：${availablePcs}片 (${availablePing}坪)`;
  }

  // 喜安預設只要有圖就回 Flex 圖卡（帶按鈕）
  if (displayUrl) {
    return buildMultiCompanyBubble_(displayUrl, text, code, introUrl, catalogUrl, singleUrl, sceneCount, statusColor, isPremium);
  }
  return text;
}

/** 把文字結果包成 Flex bubble（hero 放產品圖），並加上與高雅瓷一致的系列介紹、原廠目錄、實景、模面變化按鈕 */
function buildMultiCompanyBubble_(imageUrl, replyText, productCode, introUrl, catalogUrl, singleUrl, sceneCount, statusColor, isPremium) {
  const lines = String(replyText || "").split('\n').filter(l => l.trim() !== '');
  const bodyContents = lines.map((line, idx) => {
    // 如果是 Premium 的最後一行（有貨/不足），字體放大、上顏色
    if (isPremium && idx === lines.length - 1) {
      return {
        type: 'text',
        text: line,
        size: 'lg',
        weight: 'bold',
        wrap: true,
        color: statusColor || '#16a34a'
      };
    }
    return {
      type: 'text',
      text: line,
      size: 'sm',
      wrap: true,
      color: '#333333'
    };
  });

  const foot = [];
  if (productCode && introUrl) {
    foot.push({ "type": "button", "style": "secondary", "color": "#FFF8DC", "height": "sm", "action": { "type": "postback", "label": "系列介紹", "data": "t=intro&c=" + productCode, "displayText": productCode + " 系列介紹" } });
  }
  if (catalogUrl) {
    foot.push({ "type": "button", "style": "secondary", "color": "#FFF8DC", "height": "sm", "action": { "type": "postback", "label": "原廠目錄", "data": "t=catalog&c=" + productCode, "displayText": "查看原廠目錄" } });
  }
  if (productCode && sceneCount && sceneCount > 0) {
    foot.push({ "type": "button", "style": "secondary", "color": "#FFF8DC", "height": "sm", "action": { "type": "postback", "label": "傳送實景圖", "data": "t=scene&c=" + productCode, "displayText": productCode + " 傳送實景圖" } });
  }
  if (productCode && singleUrl) {
    foot.push({ "type": "button", "style": "secondary", "color": "#FFF8DC", "height": "sm", "action": { "type": "postback", "label": "模面變化圖", "data": "t=piece&c=" + productCode, "displayText": productCode + " 模面變化圖" } });
  }

  const bubble = {
    type: 'bubble',
    size: 'mega',
    hero: {
      type: 'image',
      url: imageUrl,
      size: 'full',
      aspectRatio: '16:9',
      aspectMode: 'cover',
      action: { type: 'uri', label: '放大查看', uri: imageUrl }
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'xs',
      paddingAll: '16px',
      contents: bodyContents
    }
  };

  if (foot.length > 0) {
    bubble.footer = {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: foot
    };
  }

  return bubble;
}

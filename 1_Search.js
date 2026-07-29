/**
 * 高雅瓷 AI 智能客服 - 2026 搜尋引擎 (v21.21)
 * 檔案：1_Search.gs
 * 🚩 【最高開發原則】：
 * 1. 嚴格過濾：若指定需求坪數，僅保留【實體總庫存】充足之產品，不符者絕對排除，不准湊數。
 * 2. 選型模式識別：偵測到屬性詞 (白, 木紋, 六角) 時，取消單一主角模式，強制進入清單展示。
 * 3. 尺寸絕對門檻：只要輸入尺寸，不相符者絕對排除，嚴禁搜尋降級。
 * 4. 嚴禁縮寫：全量輸出。
 */

/** 1. 語意洗滌：標準化關鍵字並精準移除噪點 */
function washText(text) {
  if (!text) return "";
  let t = String(text).toLowerCase();
  
  // A. 移除數量資訊 (如 60坪, 20p)
  const qtyPattern = /\d+(?:\.\d+)?\s*(坪|p|片|箱|包)/gi;
  t = t.replace(qtyPattern, ' ');

  // B. 移除尺寸字串 (如 60x120, 60*120)
  const sizePattern = /\d{2,4}\s*[xX*＊×]\s*\d{2,4}/g;
  t = t.replace(sizePattern, ' ');
  
  // C. 標準化顏色與風格並「強制補空」
  t = t.replace(/白色/g, '白 ')
       .replace(/灰色/g, '灰 ')
       .replace(/黑色/g, '黑 ')
       .replace(/米色/g, '米 ')
       .replace(/石紋/g, '石紋 ')
       .replace(/水泥/g, '水泥 ')
       .replace(/木紋/g, '木紋 ');
  
  // D. 移除噪點與功能詞 (將長詞放在單字前面，避免部分匹配殘留單字，如「圖片」匹配「圖」殘留「片」)
  const noisePattern = /(今天|明天|誰|庫存|你有有沒有|你有|請給我|我要找|我要|給我|查一下|看一下|有沒有|單價|價錢|價格|的|嗎|呢|啊|哦|呀|有|貨|有貨|有嗎|保留|過期|重量|規格|公斤|幾片|包裝|箱裝|尺寸|實際尺寸|圖片|照片|圖檔|看圖|相片|實景照|完工照|實蹟圖|實景圖|圖|照|看|flex|實蹟|完工|3D|多少|是多少|要|誰)/g;
  
  let washed = t.replace(noisePattern, ' ').replace(/\s+/g, ' ').trim();

  // E. 安全機制
  const allowedColors = /^[白米灰黑木]$/;
  if (washed.length === 1 && !allowedColors.test(washed) && !/\d/.test(washed)) {
    return "";
  }

  return washed;
}

/** 2. 色彩聯動地圖：用於替代品相似性聯想 */
const COLOR_LINK_MAP = {
  '白': ['白', '米', '米白', '珍珠白', '象牙白'],
  '米': ['米', '白', '米白', '米灰', '米黃'],
  '灰': ['灰', '淺灰', '銀', '水泥', '淺灰白', '中灰', '灰白'],
  '黑': ['黑', '深灰', '墨', '黑曜', '炭灰'],
  '木': ['木', '棕', '褐', '咖啡']
};

/** 3. 核心搜尋：強化硬性門檻 */
function findMatchedRows(kw, priceData, map) {
  const rawKW = String(kw || "").toLowerCase();
  const washedKW = washText(rawKW);
  // ⚡ 關鍵修復：從已洗滌的 washedKW 提取編號數字，防止混入數量與尺寸的數字
  const inputDigits = washedKW.replace(/\D/g, ''); 
  const dataRows = priceData.slice(1);
  
  // A. 提取絕對門檻：尺寸
  const sizeMatch = rawKW.match(/(\d{2,4})\s*[xX*＊×]\s*(\d{2,4})/);
  const sizeConstraint = sizeMatch ? `${sizeMatch[1]}x${sizeMatch[2]}` : null;

  // 🚀 核心過濾器
  const coreFilter = function(queryStr, digits) {
    const washed = washText(queryStr).toLowerCase();
    const atoms = washed.split(/\s+/).filter(a => a.length >= 1);
    
    if (atoms.length === 0 && !sizeConstraint && !digits) return [];

    return dataRows.filter(r => {
      if (!r || r.length === 0) return false;

      // 🚩 尺寸絕對門檻 (禁止降級)
      const dbSize = String(r[map['尺寸(cm)']] || "").toLowerCase().replace(/\s+/g, '').replace(/[＊*×X]/g, 'x');
      if (sizeConstraint && dbSize.indexOf(sizeConstraint) === -1) return false;

      // 內容比對
      const dbCode = String(r[map['編號']] || "").toUpperCase();
      const dbSeries = String(r[map['中文系列']] || "").toLowerCase();
      const dbColor = String(r[map['顏色']] || "").toLowerCase();
      const dbSpec = String(r[map['風格面感']] || "").toLowerCase();
      const dbType = String(r[map['產品大類']] || "").toLowerCase();
      const dbInfoFull = (dbCode + dbSeries + dbColor + dbSpec + dbType).toLowerCase();

      // (a) 編號匹配
      if (dbCode === washed.toUpperCase()) return true;
      const dbCodeDigits = dbCode.replace(/\D/g, '');
      if (digits.length >= 4 && dbCodeDigits.indexOf(digits) > -1) return true;

      // (b) 系列名精準匹配
      if (atoms.length === 1 && dbSeries === atoms[0]) return true;

      // (c) 屬性與標籤交集 (排除一般關鍵字對撞顏色欄位)
      if (atoms.length > 0) {
        const attributeKeys = /白|灰|黑|米|石紋|水泥|木紋|六角|花磚|拋光|霧面/i;
        const dbInfoEssential = (dbCode + dbSeries + dbSpec + dbType).toLowerCase(); // 🚩 核心：排除 dbColor
        
        return atoms.every(atom => {
          // A. 如果是顏色屬性詞 (如：白、灰)，允許搜尋包含顏色欄位的全文
          if (COLOR_LINK_MAP[atom] || attributeKeys.test(atom)) {
            return COLOR_LINK_MAP[atom] ? 
              COLOR_LINK_MAP[atom].some(linkWord => dbInfoFull.includes(linkWord.toLowerCase())) :
              dbInfoFull.includes(atom);
          }
          // B. 如果是一般名稱 (如：哈林)，嚴禁比對顏色欄位，只能對撞 Code, 系列, 面感
          return dbInfoEssential.includes(atom);
        });
      }
      
      return (sizeConstraint !== null);
    });
  };

  // 🏁 執行搜尋 (此處不作坪數過濾，確保主角能被抓出來以便報警)
  return coreFilter(rawKW, inputDigits);
}

/** 4. 智慧分組、選型模式識別與嚴格過濾 */
function getGroupedRows(kw, priceData, map) {
  if (!priceData || !map || !map['編號']) return { primary: null, recommendations: [] };

  const allRows = findMatchedRows(kw, priceData, map);
  if (!allRows || allRows.length === 0) return { primary: null, recommendations: [] };

  const rawKW = String(kw).toLowerCase();
  const pureKW = washText(rawKW);
  const atoms = pureKW.split(/\s+/).filter(a => a.length >= 1);
  
  // ⚡ 關鍵修復：從已洗滌的 pureKW 提取編號數字，徹底避免與數量、尺寸混淆
  const searchDigits = pureKW.replace(/\D/g, '');

  const qtyMatch = rawKW.match(/(\d+(?:\.\d+)?)\s*(坪|p|片|箱|包)/i);
  // 需求坪數偵測
  const reqQty = (qtyMatch && (qtyMatch[2] === '坪' || qtyMatch[2] === 'p')) ? parseFloat(qtyMatch[1]) : 0;

  // 🚩 [選型模式識別]：若包含屬性詞、分類詞或純尺寸查詢，強制進入清單模式
  const selectionKeys = /白|灰|黑|米|石紋|水泥|木紋|六角|花磚|拋光|霧面/i;
  const isSelectionSearch = selectionKeys.test(rawKW) || (!pureKW && !searchDigits);

  // 🚩 [v678] 權重排序：分層優先權，避免「風格面感/產品大類」鬆散標籤命中蓋過真正的系列/編號精準命中
  // 編號/系列精準命中 (100) > 顏色命中 (10) > 風格面感/產品大類鬆散標籤命中 (3)
  allRows.sort((a, b) => {
    const codeA = String(a[map['編號']]).toUpperCase();
    const codeB = String(b[map['編號']]).toUpperCase();
    const getScore = (row) => {
      let s = 0;
      const infoPrimary = (String(row[map['編號']]) + String(row[map['中文系列']])).toLowerCase();
      const infoColor = String(row[map['顏色']] || '').toLowerCase();
      const infoTag = (String(row[map['風格面感']] || '') + String(row[map['產品大類']] || '')).toLowerCase();
      atoms.forEach(atom => {
        if (infoPrimary.includes(atom)) s += 100;
        else if (COLOR_LINK_MAP[atom] && COLOR_LINK_MAP[atom].some(l => infoColor.includes(l.toLowerCase()))) s += 10;
        else if (infoColor.includes(atom)) s += 10;
        else if (infoTag.includes(atom)) s += 3;
      });
      return s;
    };
    const scoreA = getScore(a);
    const scoreB = getScore(b);
    if (scoreA !== scoreB) return scoreB - scoreA;
    return codeA.length - codeB.length;
  });

  // 🚩 主角判定 (Primary)
  let primary = isSelectionSearch ? null : allRows[0];
  
  if (primary && searchDigits.length >= 4) {
    const primaryDigits = String(primary[map['編號']]).replace(/\D/g, '');
    if (primaryDigits.indexOf(searchDigits) === -1) primary = null;
  }

  // 🚩 清單判定 (Recommendations)
  let recommendations = primary ? allRows.slice(1) : allRows;

  if (reqQty > 0) {
    recommendations = recommendations.filter(r => {
      const dbTotalStock = (typeof safeN === 'function') ? safeN(r[map['庫存坪數']]) : 0;
      return dbTotalStock >= reqQty;
    });

    recommendations.sort((a, b) => {
      const sA = (typeof safeN === 'function') ? safeN(a[map['庫存坪數']]) : 0;
      const sB = (typeof safeN === 'function') ? safeN(b[map['庫存坪數']]) : 0;
      return sB - sA;
    });
  }

  return { primary: primary, recommendations: recommendations };
}

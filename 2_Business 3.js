/**
 * 高雅瓷 AI 智能客服 - 2026 業務大腦視覺化版 (v18.23)
 * 檔案：2_Business.gs
 * 🚩 【最高開發原則】：
 * 1. 視覺紅綠燈：庫存充足顯示 🟢 <庫存充足>，不足顯示 ❌ <庫存不足>。
 * 2. 語氣生動：採用「有貨喔!!快點下單 😆🛒」與「你要的數量不夠了。😢🙇♂️」等活潑語氣。
 * 3. 誠信推薦：推薦替代品前必須試算【可用餘額】(總量 - 保留)，絕不開空頭支票。
 * 4. 絕對沉默：群組內對價格關鍵字「完全不回應」（Return ""），確保隱私不留痕跡。
 * 5. 嚴禁縮寫：全量輸出，不得使用任何省略符號。
 */

/** 1. 價格查詢：高級火焰質感排版 (🚩 群組絕對沉默版) */
function handlePriceSearch(kw, priceData, map, level, isGroup) {
  if (isGroup) return ""; 

  const { primary, recommendations } = (typeof getGroupedRows === 'function') ? getGroupedRows(kw, priceData, map) : { primary: null, recommendations: [] };
  
  if (!primary) return ""; 

  const SEP_DASH = "➖➖➖➖➖";
  const seriesName = String(primary[map['中文系列']]);
  // 🚩 僅抓取同系列之相關編號
  const allItems = [primary].concat(recommendations).filter(r => String(r[map['中文系列']]) === seriesName);
  
  let res = "";
  // 限制一次顯示前 8 筆以防訊息過長
  allItems.slice(0, 8).forEach(item => {
    const code = String(item[map['編號']] || "未知").toUpperCase();
    const size = String(item[map['尺寸(cm)']] || "-");
    const rawPrice = String(item[map['同行價']] || "-").replace('$', '').trim();
    
    if (res !== "") res += "\n";
    res += `${SEP_DASH}\n`;
    res += `🔥 ${seriesName} 🔥\n`;
    res += `編號：${code}\n`;
    res += `尺寸：${size}\n`;
    res += `單價：$${rawPrice}元\n`;
    res += `${SEP_DASH}\n`;
  });

  // 管理者權限：檢視成本
  if (!isGroup && ['king', 'admin', 'queen'].includes(level)) {
    res += `\n🧪 [權限檢視：成本]\n`;
    allItems.forEach(r => {
      const code = String(r[map['編號']]).toUpperCase();
      const cost = String(r[map['成本']] || '-').replace('$', '').trim();
      res += `▫️ ${code.padEnd(12, ' ')}：$${cost}\n`;
    });
  }
  
  return res;
}

/** 2. 規格數據簡答：全系列多規格掃描版 */
function handleProductSpecSearch(kw, priceData, map, q) {
  const { primary, recommendations } = (typeof getGroupedRows === 'function') ? getGroupedRows(kw, priceData, map) : { primary: null, recommendations: [] };
  const allMatched = [primary].concat(recommendations).filter(it => it !== null);
  
  if (allMatched.length === 0) return ""; 

  const seriesName = allMatched[0][map['中文系列']] || "未知系列";
  
  // 🚩 按尺寸進行分組，避免重複顯示相同規格
  let sizeGroups = {};
  allMatched.forEach(item => {
    const size = String(item[map['尺寸(cm)']] || "未知規格").toUpperCase();
    if (!sizeGroups[size]) {
      sizeGroups[size] = item;
    }
  });

  let res = `📦 【${seriesName}】全系列規格數據\n──────\n`;
  
  for (let sKey in sizeGroups) {
    const row = sizeGroups[sKey];
    const rawWeight = row[map['KG/箱']] || row[map['箱重(kg)']] || row[map['重量']] || 0;
    const finalWeight = (typeof safeN === 'function') ? safeN(rawWeight) : (parseFloat(rawWeight) || 0);
    const pcs = row[map['片/箱']] || row[map['P/C']] || '-';
    
    res += `📐 尺寸：${sKey}\n`;
    res += `📦 包裝：${pcs} 片/箱\n`;
    res += `⚖️ 箱重：${Math.round(finalWeight)} 公斤\n`;
    res += `──────\n`;
  }

  return res;
}

/** 3. 實際尺寸查詢：修復厚度小數點顯示 */
function handleActualSizeSearch(kw, db, maps, level, isGroup) {
  const { primary } = (typeof getGroupedRows === 'function') ? getGroupedRows(kw, db.price, maps.price) : { primary: null };
  
  if (!primary) return ""; 

  const targetCode = String(primary[maps.price['編號']]).toUpperCase();
  const stockRows = db.stock.filter(r => {
    const dbCode = String(r[maps.stock['編號']] || "").toUpperCase();
    return dbCode.includes(targetCode) && !String(r[maps.stock['品名']]).includes("小計");
  });
  
  if (stockRows.length === 0) return ""; 

  let reply = `📐 ${targetCode} 實際尺寸\n──────\n`;
  stockRows.forEach(r => {
    const lot = String(r[maps.stock['批號']] || "未註記");
    let actual = String(r[maps.stock['實際尺寸']] || "標記為現貨尺寸");
    actual = actual.replace(/(^|[^0-9])(\.[0-9]+)/g, "$10$2");
    reply += `📦 批號：${lot}\n📏 實際：${actual}\n\n`;
  });

  return reply + `──────`;
}

function normalizeInventoryCode_(value) {
  return String(value || "").toUpperCase().replace(/\s+/g, "").trim();
}

function extractInventoryCodeCandidates_(inputKW) {
  const raw = normalizeInventoryCode_(inputKW);
  const candidates = [];

  const codeMatch = raw.match(/[A-Z]{0,4}\d{4,}(?:-[A-Z0-9]+)?/);
  if (codeMatch && codeMatch[0]) candidates.push(codeMatch[0]);
  if (raw) candidates.push(raw);

  return [...new Set(candidates.filter(Boolean))];
}

function findStockFirstMatch_(inputKW, stockRows, stockMap) {
  const candidates = extractInventoryCodeCandidates_(inputKW);
  const rows = Array.isArray(stockRows) ? stockRows : [];
  const codeIdx = stockMap ? stockMap['編號'] : undefined;
  const itemNameIdx = stockMap ? stockMap['品名'] : undefined;

  const matches = [];
  let matchedCode = "";

  rows.forEach(r => {
    if (!r || r.length === 0 || codeIdx === undefined) return;
    if (itemNameIdx !== undefined && String(r[itemNameIdx] || "").includes("小計")) return;

    const rowCode = normalizeInventoryCode_(r[codeIdx]);
    if (!rowCode) return;

    const isMatch = candidates.some(candidate => {
      return rowCode === candidate || rowCode.indexOf(candidate) > -1;
    });

    if (isMatch) {
      matches.push(r);
      if (!matchedCode || rowCode.length < matchedCode.length) matchedCode = rowCode;
    }
  });

  return { code: matchedCode, rows: matches };
}

function buildStockFirstPrimary_(code, stockRows, stockMap, pricePrimary, priceMap) {
  const primary = {};
  const firstStockRow = (Array.isArray(stockRows) && stockRows.length > 0) ? stockRows[0] : [];
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

  if (priceMap && priceMap['編號'] !== undefined) primary[priceMap['編號']] = code;
  if (priceMap && priceMap['中文系列'] !== undefined) {
    primary[priceMap['中文系列']] = pricePrimary ? String(pricePrimary[priceMap['中文系列']] || "").trim() : "";
  }
  if (priceMap && priceMap['顏色'] !== undefined) {
    primary[priceMap['顏色']] = pricePrimary ? String(pricePrimary[priceMap['顏色']] || "").trim() : "";
  }
  if (priceMap && priceMap['風格面感'] !== undefined) {
    primary[priceMap['風格面感']] = pricePrimary ? String(pricePrimary[priceMap['風格面感']] || "").trim() : "";
  }
  if (priceMap && priceMap['片/坪'] !== undefined) {
    const ratioSourceRow = pricePrimary || firstStockRow;
    const ratioSourceMap = pricePrimary ? priceMap : stockMap;
    primary[priceMap['片/坪']] = (typeof getPcsPerPingFallback_ === 'function')
      ? getPcsPerPingFallback_(ratioSourceRow, ratioSourceMap)
      : (pricePrimary ? (safeN(pricePrimary[priceMap['片/坪']]) || 1) : 1);
  }
  if (priceMap && priceMap['尺寸(cm)'] !== undefined) {
    primary[priceMap['尺寸(cm)']] = pick(firstStockRow, stockMap, ['表定尺寸', '尺寸', '實際尺寸', '規格', '備註(批號+尺寸)']);
  }

  return primary;
}

/** 3.5 系列庫存總覽 (限 SALES 以上權限：輸入系列名稱即列出該系列全部編號庫存) */
function handleSeriesInventorySearch(seriesName, db, maps, auth, isGroup) {
  if (isGroup) return "";

  const priceData = db.price, priceMap = maps.price;
  const items = priceData.slice(1).filter(r => String(r[priceMap['中文系列']] || "").trim() === seriesName);
  if (items.length === 0) return "";

  let groups = {};

  items.forEach(row => {
    const code = String(row[priceMap['編號']] || "").toUpperCase();
    if (!code) return;

    const ratio = (typeof getPcsPerPingFallback_ === 'function') ? getPcsPerPingFallback_(row, priceMap) : (safeN(row[priceMap['片/坪']]) || 1);

    const stockRows = db.stock.filter(r => String(r[maps.stock['編號']]).toUpperCase() === code && !String(r[maps.stock['品名']]).includes("小計"));
    const totalStockPcs = stockRows.reduce((acc, r) => acc + safeN(r[maps.stock['片數']]), 0);

    const matchedReservations = db.main.filter(r => String(r[maps.main['編號']]).toUpperCase() === code && !String(r[maps.main['編號']]).includes('-期'));
    const totalReservedPcs = matchedReservations.reduce((acc, r) => acc + safeN(r[maps.main['數量']]), 0);

    const availPcs = totalStockPcs - totalReservedPcs;
    const availPing = (ratio > 0) ? Math.floor(availPcs / ratio) : 0;

    const size = String(row[priceMap['尺寸(cm)']] || "其他規格");
    if (!groups[size]) groups[size] = [];
    groups[size].push({
      code: code,
      color: String(row[priceMap['顏色']] || "").split('-')[0].trim(),
      availPing: availPing,
      reserveCount: matchedReservations.length
    });
  });

  let reply = `📦 【${seriesName}】系列庫存總覽\n──────\n`;
  for (let sizeKey in groups) {
    reply += `📐 規格：${sizeKey}\n`;
    groups[sizeKey].forEach(it => {
      const light = it.availPing > 0 ? '🟢' : '🔴';
      reply += `${light} ${it.code} (${it.color}) | ${it.availPing}坪`;
      if (it.reserveCount > 0) reply += ` (保留${it.reserveCount}筆)`;
      reply += `\n`;
    });
    reply += `──────\n`;
  }

  return reply;
}

/** 4. 核心庫存查詢 (🚩 懶人攔截與權限隔離版) */
function handleInventorySearch(inputKW, reqQtyRaw, reqUnitRaw, db, maps, auth, isGroup) {
  const userLevel = String(auth.level || 'free').toLowerCase();
  const isHighLevel = ['sales', 'king', 'queen', 'admin'].includes(userLevel);
  const isPremium = userLevel === 'premium';
  
  // Premium users can see stock numbers but not reservations
  const showDetail = !isGroup && (isHighLevel || isPremium);
  const showReservations = isHighLevel || isPremium; // Both can see reservation counts
  
  const reqQty = reqQtyRaw ? parseFloat(reqQtyRaw) : null;
  const reqUnit = reqUnitRaw || "片";
  const stockMap = maps.stock || getHeaderMap(db.stock);
  
  const stockFirstMatch = findStockFirstMatch_(inputKW, db.stock, stockMap);
  const stockFirstCode = stockFirstMatch.code;

  let primary = null;
  let recommendations = [];
  let matchedFromStockFirst = false;

  if (stockFirstCode && typeof getGroupedRows === 'function') {
    const priceResult = getGroupedRows(stockFirstCode, db.price, maps.price) || { primary: null, recommendations: [] };
    primary = priceResult.primary || null;
    recommendations = priceResult.recommendations || [];
    matchedFromStockFirst = stockFirstMatch.rows.length > 0;

    if (!primary) {
      primary = buildStockFirstPrimary_(stockFirstCode, stockFirstMatch.rows, stockMap, null, maps.price);
      recommendations = [];
    }
  } else {
    const priceResult = (typeof getGroupedRows === 'function') ? getGroupedRows(inputKW, db.price, maps.price) : { primary: null, recommendations: [] };
    primary = priceResult.primary || null;
    recommendations = priceResult.recommendations || [];
  }
  
  if (!primary && recommendations.length === 0 && !matchedFromStockFirst) {
    const wlData = db.wl || getWhitelistSheet();
    const wlMap = maps.wl || getHeaderMap(wlData);
    const salesContact = resolveSalesContactForAuth(auth, wlData, wlMap);
    const salesLineId = salesContact.lineId;
    const salesName = auth.salesID || "未指派";
    const cleanKW = String(inputKW).toUpperCase().trim();

    const notificationStatus = "查無未通知";

    const extraData = {
      productCode: cleanKW,
      reqQty: reqQty !== null ? `${reqQty}${reqUnit}` : "",
      availPcs: 0,
      stockStatus: "查無",
      size: "",
      color: "",
      spec: "",
      notificationStatus: notificationStatus,
      salesRepName: salesName
    };
    writeEnhancedLog(getSpreadsheetInstance(), isGroup ? "GROUP" : "PRIVATE", auth.userId, auth.name, auth.level, inputKW, "庫存查詢-查無", auth.email, extraData);

    return ""; 
  }
 
  if (!reqQty && !isHighLevel && !isPremium && primary) {
    const code = String(primary[maps.price['編號']]).toUpperCase();
    return `💡 查詢提示：\n確認庫存請輸入「編號 + 數量」\n例如：${code} 50片`;
  }
 
  let reply = "";
 
  if (!primary) {
    // 🚩 [今友利短編號] 若主價目表查無此編號，嘗試從今友利資料庫查詢 (例如 D124, D101, J16 等短編號)
    if (typeof getJinYouLiSingleItem_ === 'function') {
      const jinSingle = getJinYouLiSingleItem_(cleanKW);
      if (jinSingle) {
        if (jinSingle.flexObj) return jinSingle.flexObj;
        return jinSingle.replyText;
      }
    }

    const sizeMatch = inputKW.match(/(\d{2,4})\s*[xX*＊×]\s*(\d{2,4})/);
    reply += `${showDetail ? '' : '📏 '}規格：${sizeMatch ? sizeMatch[1]+'x'+sizeMatch[2] : '全域搜尋'}\n`;
    if (reqQty) reply += `${showDetail ? '' : '🔢 '}需求：${reqQty}${reqUnit}\n`;
    reply += `──────\n${showDetail ? '' : '📋 '}符合現貨推薦：\n`;
 
    let groups = {};
    recommendations.forEach(rec => {
      const rCode = String(rec[maps.price['編號']]).toUpperCase();
      const rRatio = (typeof getPcsPerPingFallback_ === 'function')
        ? getPcsPerPingFallback_(rec, maps.price)
        : ((typeof safeN === 'function') ? safeN(rec[maps.price['片/坪']]) : 1);
 
      const altStockRows = db.stock.filter(sr => String(sr[maps.stock['編號']]).toUpperCase() === rCode && !String(sr[maps.stock['品名']]).includes("小計"));
      const altTotalStock = altStockRows.reduce((acc, sr) => acc + ((typeof safeN === 'function') ? safeN(sr[maps.stock['片數']]) : 0), 0);
      const altMatchedReservations = db.main.filter(mr => String(mr[maps.main['編號']]).toUpperCase().includes(rCode) && !String(mr[maps.main['編號']]).includes('-期'));
      const altTotalReservedPcs = altMatchedReservations.reduce((acc, mr) => acc + ((typeof safeN === 'function') ? safeN(mr[maps.main['數量']]) : 0), 0);
      const altReserveCount = altMatchedReservations.length;
      const altAvailPcs = altTotalStock - altTotalReservedPcs;
      const altAvailPing = (rRatio > 0) ? (altAvailPcs / rRatio) : 0;
 
      const pcsPerBox = (typeof safeN === 'function') ? (safeN(rec[maps.price['片/箱']]) || safeN(rec[maps.price['P/C']]) || 1) : 1;
      let reqQtyInPcs = 0;
      if (reqQty) {
        const u = String(reqUnit || "坪").toLowerCase();
        if (u === '坪' || u === 'p') {
          reqQtyInPcs = reqQty * rRatio;
        } else if (u === '箱' || u === '包') {
          reqQtyInPcs = reqQty * pcsPerBox;
        } else if (u === '片') {
          reqQtyInPcs = reqQty;
        } else {
          reqQtyInPcs = reqQty * rRatio; // 預設為坪
        }
      }
 
      if (reqQty && altAvailPcs < reqQtyInPcs * 0.95) return; 
 
      // Filter recommendations reservations for premium users to only show their own company
      let displayAltReservedPcs = altTotalReservedPcs;
      let displayAltReserveCount = altReserveCount;
      if (isPremium) {
        const myNameRaw = String(auth.name || "");
        const companyFromName = myNameRaw.includes('-') ? myNameRaw.split('-')[0] : '';
        const companyPrefix = companyFromName || String(auth.company || '') || myNameRaw;
        const companyLower = companyPrefix.toLowerCase();
        
        const myAltReservations = altMatchedReservations.filter(mr => {
          const rowStr = mr.join('|').toLowerCase();
          return companyLower && rowStr.indexOf(companyLower) !== -1;
        });
        displayAltReservedPcs = myAltReservations.reduce((acc, mr) => acc + ((typeof safeN === 'function') ? safeN(mr[maps.main['數量']]) : 0), 0);
        displayAltReserveCount = myAltReservations.length;
      }

      const size = String(rec[maps.price['尺寸(cm)']] || "其他");
      if (!groups[size]) groups[size] = [];
      groups[size].push({ data: rec, avail: altAvailPing, reservedPcs: displayAltReservedPcs, reserveCount: displayAltReserveCount, ratio: rRatio });
    });
 
    for (let sizeKey in groups) {
      reply += `${showDetail ? '' : '📐 '}規格：${sizeKey}\n`;
      groups[sizeKey].slice(0, 10).forEach(item => {
        const rec = item.data;
        reply += `${showDetail ? '' : '▫️ '}${String(rec[maps.price['編號']]).toUpperCase()}-${rec[maps.price['中文系列']]}\n`;
        const availText = showDetail ? Math.floor(item.avail) + '坪' : '有現貨';
        reply += `${showDetail ? '' : '▫️ '}${String(rec[maps.price['顏色']]).split('-')[0]} | ${availText}\n`;
        if (showDetail && showReservations && item.reservedPcs > 0) {
          const reservedPingFloor = item.ratio > 0 ? Math.floor(item.reservedPcs / item.ratio) : 0;
          reply += `   (保留: ${item.reservedPcs}片｜${reservedPingFloor}坪｜${item.reserveCount}筆)\n`;
        }
        reply += `\n`;
      });
    }
    return (reply.length > 50) ? reply : "❌ 抱歉，目前找不到符合條件且足貨的產品。";
  }
 
  const code = String(primary[maps.price['編號']]).toUpperCase();
  const ratio = (typeof getPcsPerPingFallback_ === 'function')
    ? getPcsPerPingFallback_(primary, maps.price)
    : ((typeof safeN === 'function') ? safeN(primary[maps.price['片/坪']]) : 1);
  const series = primary[maps.price['中文系列']];
  const size = String(primary[maps.price['尺寸(cm)']]);
 
  const stockRows = db.stock.filter(r => {
    const sCode = String(r[maps.stock['編號']] || "").toUpperCase().trim();
    if (!sCode || String(r[maps.stock['品名']]).includes("小計")) return false;
    return sCode === code;
  });
  let totalStockPcs = stockRows.reduce((acc, r) => acc + (typeof safeN === 'function' ? safeN(r[maps.stock['片數']]) : 0), 0);

  const matchedReservations = db.main.filter(r => {
    const rCode = String(r[maps.main['編號']] || "").toUpperCase().trim();
    if (!rCode || rCode.includes('-期')) return false;
    return rCode === code;
  });
  let totalReservedPcs = matchedReservations.reduce((acc, r) => acc + (typeof safeN === 'function' ? safeN(r[maps.main['數量']]) : 0), 0);
  const reserveCount = matchedReservations.length;

  // 🚩 今友利庫存合併：同編號若在今友利資料源也有庫存/保留，直接加總（回覆不分來源，只顯示合併後總數）
  // jinYouLiInv 提升到函式作用域，最後組完 reply 後若有產品圖會用來轉成圖卡
  let jinYouLiInv = null;
  if (typeof getJinYouLiInventoryForCode_ === 'function') {
    jinYouLiInv = getJinYouLiInventoryForCode_(code);
    if (jinYouLiInv) {
      totalStockPcs += jinYouLiInv.stock;
      totalReservedPcs += jinYouLiInv.reserved;
    }
  }

  const availPcs = totalStockPcs - totalReservedPcs;
  const availPing = (ratio > 0) ? Math.floor(availPcs / ratio) : 0;
  const reqPcsThreshold = reqQty ? ((reqUnit === '坪' || reqUnit === 'p') ? reqQty * ratio * 0.95 : reqQty * 0.95) : 0;
  // 🚀 【新批到港資訊：只認保留單手動輸入的入倉日期，不再抓「倉庫日誌」(國貿) 的 ETA 資料】
  let arrivalInfo = "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let hasMainArrival = false;
  const mainIncoming = [];

  // 1. 優先：讀取保留單手動輸入之 入倉日期1/2
  // 🚩 入倉日期/數量1 這種到貨資訊，實務上常常就是登記在帶「-期」後綴的列（例如 ST61293-期，代表分批到貨的其中一批），
  // 之前排除「-期」是為了不讓這種列被算進「已保留數量」的加總，但同一個排除條件套用在這裡找入倉日期，
  // 反而會直接找不到列，導致到貨資訊永遠是空的。這裡改用 includes 比對、且不再排除「-期」。
  //
  // 🚩 同一個編號常常有十幾筆保留列（每個客戶各佔一列），入倅日期1/數量1 是「整批到貨」的資訊，
  // 理論上每一列都該填一樣的值，但實務上偶爾會有個別列填錯/填成別批的殘留資料。原本用 .find() 只抓
  // 「第一筆」，一旦剛好第一筆是那個填錯的離群列，到貨資訊就整個報錯（曾發生：15 筆列都是 10/19，
  // 只有 1 筆離群列是 11/9，卻因為它排在陣列前面被優先抓到）。改成抓「所有」符合的列，
  // 入倅日期1/2 分別取「多數列一致同意」的那個值，離群的單一筆資料不會蓋過大家都同意的正確值。
  const matchedRows = db.main.filter(row => String(row[maps.main['編號']]).toUpperCase().includes(code));
  const pickMajorityPair_ = (dateIdx, qtyIdx) => {
    if (dateIdx === undefined || dateIdx === -1) return null;
    const counts = new Map(); // key: 正規化後的日期字串｜qty → { dateRaw, qtyRaw, count }
    matchedRows.forEach(row => {
      const dateRaw = row[dateIdx];
      if (!dateRaw || String(dateRaw).trim() === '') return;
      const qtyRaw = (qtyIdx !== undefined && qtyIdx !== -1) ? row[qtyIdx] : null;
      const dateKey = dateRaw instanceof Date ? dateRaw.getTime() : String(dateRaw).trim();
      const key = dateKey + '|' + String(qtyRaw);
      if (!counts.has(key)) counts.set(key, { dateRaw, qtyRaw, count: 0 });
      counts.get(key).count++;
    });
    let best = null;
    counts.forEach(entry => {
      if (!best || entry.count > best.count) best = entry;
    });
    return best;
  };

  if (matchedRows.length > 0) {
    const checkReserveArrival = (dateRaw, qtyRaw) => {
      if (dateRaw && String(dateRaw).trim() !== "") {
        let d = null;
        if (dateRaw instanceof Date) d = dateRaw;
        else {
          const dParsed = new Date(String(dateRaw));
          if (!isNaN(dParsed.getTime())) d = dParsed;
        }
        const qty = qtyRaw ? Math.round(safeN(qtyRaw)) : 0;
        const ping = ratio > 0 ? Math.floor(qty / ratio) : 0;
        if (d) {
          d.setHours(0, 0, 0, 0);
          if (d >= today) {
            mainIncoming.push({ date: d, rawText: null, qtyPieces: qty, qtyPing: ping });
            hasMainArrival = true;
          }
        } else {
          // 🚩 入倉日期填的是文字（例如「安排中」），不是可解析的日期：直接顯示原文字，
          // 不要因為轉換不成日期就整筆丟掉，不然這種還在安排、日期未定的到貨資訊會憑空消失。
          mainIncoming.push({ date: null, rawText: String(dateRaw).trim(), qtyPieces: qty, qtyPing: ping });
          hasMainArrival = true;
        }
      }
    };

    const idxDate1 = maps.main['入倉日期1'];
    const idxQty1 = maps.main['數量1'];
    const majority1 = pickMajorityPair_(idxDate1, idxQty1);
    if (majority1) checkReserveArrival(majority1.dateRaw, majority1.qtyRaw);

    const idxDate2 = maps.main['入倉日期2'];
    const idxQty2 = maps.main['數量2'];
    const majority2 = pickMajorityPair_(idxDate2, idxQty2);
    if (majority2) checkReserveArrival(majority2.dateRaw, majority2.qtyRaw);
  }

  // 2. 只認保留單手動輸入的入倉日期，不再退回讀「倉庫日誌」(國貿資料來源)
  const finalIncoming = [];
  if (hasMainArrival) {
    // 🚩 有確定日期的排前面（照日期先後排），日期未定（文字，例如「安排中」）的排後面，順序不重要
    mainIncoming.sort((a, b) => {
      if (a.date && b.date) return a.date - b.date;
      if (a.date && !b.date) return -1;
      if (!a.date && b.date) return 1;
      return 0;
    });
    finalIncoming.push(...mainIncoming);
  }

  // 3. 排序並生成字串（最多取 2 筆最接近到貨的）
  if (finalIncoming.length > 0) {
    arrivalInfo += `\n-----新批資訊-----\n`;
    finalIncoming.slice(0, 2).forEach((s, idx) => {
      const label = idx === 0 ? '新批' : '二批';
      const shortDate = s.date ? formatArrivalDateShort_(s.date) : s.rawText;
      const countdown = s.date ? getCountdownText(s.date) : '';
      if (idx > 0) arrivalInfo += `\n`;
      if (showDetail) {
        arrivalInfo += `✨ ${label} ${shortDate} 到 ${s.qtyPieces}片/${s.qtyPing}坪\n${countdown}`;
      } else {
        arrivalInfo += `✨ ${label} ${shortDate} 到貨\n${countdown}`;
      }
    });
  }

  const isShortage = (availPcs <= 0 || (reqQty && availPcs < reqPcsThreshold));
  let statusLight = isShortage ? `❌ <庫存不足>\n` : `🟢 <庫存充足>\n`;
  if ((isPremium || isHighLevel) && !isShortage) {
    statusLight = `🟢 <查詢結果>\n`;
  }

  // Resolve sales rep contact
  const wlData = db.wl || getWhitelistSheet();
  const wlMap = maps.wl || getHeaderMap(wlData);
  const salesContact = resolveSalesContactForAuth(auth, wlData, wlMap);
  const salesLineId = salesContact.lineId;
  const salesName = auth.salesID || "未指派";
  
  const isFreeUser = ['free', 'class', 'guest'].includes(userLevel);
  let notificationStatus = "充足未通知";
  if (isShortage) {
    if (!isFreeUser) {
      notificationStatus = "不足未通知";
    } else {
      // 🚩 [v24.3] 統一由 handleSalesPush（3_Notify.js）推送 Telegram，此處不再重複推播
      notificationStatus = "由handleSalesPush通知";
    }
  }
  
  const extraData = {
    productCode: code,
    reqQty: reqQty !== null ? `${reqQty}${reqUnit}` : "",
    availPcs: availPcs,
    stockStatus: isShortage ? "不足" : "充足",
    size: size,
    color: primary ? String(primary[maps.price['顏色']] || "").trim() : "",
    spec: primary ? String(primary[maps.price['尺寸(cm)']] || "").trim() : "",
    notificationStatus: notificationStatus,
    salesRepName: salesName
  };
  
  writeEnhancedLog(getSpreadsheetInstance(), isGroup ? "GROUP" : "PRIVATE", auth.userId, auth.name, auth.level, inputKW, isShortage ? "庫存查詢-不足" : "庫存查詢-充足", auth.email, extraData);
 
  if (showDetail) {
    const totalStockPing = ratio > 0 ? Math.floor(totalStockPcs / ratio) : 0;
    const availPingFloor = ratio > 0 ? Math.floor(availPcs / ratio) : 0;
    
    // Filter display reservations for Premium users to show only their own company
    let displayReservedPcs = totalReservedPcs;
    let displayReserveCount = reserveCount;
    if (isPremium) {
      const myNameRaw = String(auth.name || "");
      const companyFromName = myNameRaw.includes('-') ? myNameRaw.split('-')[0] : '';
      const companyPrefix = companyFromName || String(auth.company || '') || myNameRaw;
      const companyLower = companyPrefix.toLowerCase();
      
      const myMatchedReservations = matchedReservations.filter(r => {
        const rowStr = r.join('|').toLowerCase();
        return companyLower && rowStr.indexOf(companyLower) !== -1;
      });
      displayReservedPcs = myMatchedReservations.reduce((acc, r) => acc + (typeof safeN === 'function' ? safeN(r[maps.main['數量']]) : 0), 0);
      displayReserveCount = myMatchedReservations.length;
    }
    const displayReservedPing = ratio > 0 ? Math.floor(displayReservedPcs / ratio) : 0;

    reply += statusLight +
             `編號：${code}\n` +
             `系列：${series} ${size}\n` +
             `庫存：${totalStockPcs}片 ｜ ${totalStockPing}坪\n`;
             
    if (showReservations && displayReservedPcs > 0) {
      reply += `保留：${displayReservedPcs}片｜${displayReserveCount} 筆\n`;
    }
    reply += `可用：${availPcs}片｜${availPingFloor}坪\n`;

    // 🚩 今友利合併時，批號/庫存/尺寸只會列出高雅瓷自己的批號，跟頂部合併後的總數對不上、容易誤會，直接省略
    if (!jinYouLiInv) {
      const batchDetails = stockRows.map(sr => {
        const lot = sr[maps.stock['批號']] || "未註記";
        const pcs = safeN(sr[maps.stock['片數']]);
        const p = ratio > 0 ? Math.floor(pcs / ratio) : 0;
        let actual = String(sr[maps.stock['實際尺寸']] || "").trim();
        if (actual) actual = actual.replace(/(^|[^0-9])(\.[0-9]+)/g, "$10$2");
        return { lot, pcs, p, actual };
      }).filter(b => b.pcs > 0 && b.p >= 0.5)
        .sort((a, b) => b.pcs - a.pcs);

      if (batchDetails.length > 0) {
        reply += `──────\n批號/庫存/尺寸：\n\n`;
        batchDetails.forEach(b => {
          reply += `${b.lot}：${b.pcs}片｜${b.p}坪\n`;
          if (b.actual) reply += `${b.actual}\n`;
          reply += `\n`;
        });
      }
    }

    if (arrivalInfo) {
      reply += arrivalInfo + "\n";
    }
  } else {
    if (reqQty && availPcs < reqPcsThreshold) {
      const isReservedButStockExists = totalStockPcs >= reqPcsThreshold;
      let statusMsg = "";
      
      if (isReservedButStockExists) {
        // 5種被保留佔用的隨機幽默對話
        const reservedMsgs = [
          "目前庫存有數量，但都已被保留佔用。請給我們一點時間，詢問一下保留的狀況喔！⏳😊",
          "幫您偵測到：這款其實還有庫存，只是暫時被其他夥伴搶先保留了！小高非常想幫您搶到，立刻幫您向保留的業務協調看看有沒有釋出機會，請等小高好消息喔！⏳💪😊",
          "這款被搶先一步保留了 ⏳！不過先別氣餒，小高立刻去幫您向保留的業務打聽打聽有沒有釋出機會，順便站起來伸個懶腰等好消息喔！😊",
          "庫存有，但被搶先保留了 ⏳。小高可不認輸！請給我一點時間去打聽看看是否能調貨，等我回來喔！💪😊",
          "哎呀！剛好被別的業務夥伴搶先保留了 ⏳。先喝口咖啡，小高立刻去探探口風，看能不能幫您分一些庫存出來！☕️😊"
        ];
        statusMsg = reservedMsgs[Math.floor(Math.random() * reservedMsgs.length)];
      } else {
        // 5-6種庫存不足的隨機幽默對話
        const lowStockMsgs = [
          "你要的數量不夠了。😢🙇♂️",
          "哎呀真不巧...這款目前的現貨數量暫時不夠了...💔 撐住！小高已經在下方幫您挑選了相似的絕美替代現貨，您瞧瞧看？👇",
          "你要的數量目前不夠了 😢。坐辦公室已經夠悶了，連庫存都來搗亂...🙇♂️ 別擔心！快看下方為您推薦的相似美磚！👇",
          "庫存告急！你要的數量不夠了 😢🙇♂️。小高已經在下方幫您整理好相似替代款，快點看看！👇",
          "真抱歉！目前現貨不夠您要的數量 😢💔。打起精神，下方有小高精心挑選的相似現貨，或許有更適合的喔！👇",
          "糟糕，庫存暫時不夠用...😭 沒關係，小高先給您拍拍！下方挑選了幾款超搭的相似現貨，來瞧瞧有沒有對上眼的？👇✨"
        ];
        statusMsg = lowStockMsgs[Math.floor(Math.random() * lowStockMsgs.length)];
      }

      reply += `❌ <庫存不足>\n` +
               `🆔 編號：${code}\n` +
               `📚 系列：${series}\n` +
               `📐 尺寸：${size}\n` +
               `🔢 需求：${reqQty}${reqUnit}\n` +
               `📦 狀態：${statusMsg}\n`;

      if (arrivalInfo) {
        reply += arrivalInfo + "\n";
      }

      let alts = db.price.slice(1).filter(r => {
        const rCode = String(r[maps.price['編號']]).toUpperCase();
        const rSize = String(r[maps.price['尺寸(cm)']]);
        if (rSize !== size || rCode === code) return false;
        const altStockRows = db.stock.filter(sr => String(sr[maps.stock['編號']]).toUpperCase() === rCode && !String(sr[maps.stock['品名']]).includes("小計"));
        const altTotalStock = altStockRows.reduce((acc, sr) => acc + safeN(sr[maps.stock['片數']]), 0);
        const altTotalRes = db.main.filter(mr => String(mr[maps.main['編號']]).toUpperCase().includes(rCode) && !String(mr[maps.main['編號']]).includes('-期')).reduce((acc, mr) => acc + safeN(mr[maps.main['數量']]), 0);
        const altRatio = (typeof getPcsPerPingFallback_ === 'function')
          ? getPcsPerPingFallback_(r, maps.price)
          : (safeN(r[maps.price['片/坪']]) || 1);
        return (altTotalStock - altTotalRes) / altRatio >= reqQty;
      });

      if (alts.length > 0) {
        reply += `──────\n✨ 相似規格現貨推薦：\n`;
        alts.sort((a, b) => safeN(b[maps.price['庫存坪數']]) - safeN(a[maps.price['庫存坪數']])).slice(0, 3).forEach(a => {
          reply += `▫️ ${String(a[maps.price['編號']]).toUpperCase()} (${a[maps.price['中文系列']]})\n`;
        });
      }
    } else {
      // ⚠️ 混合批號檢查：多批號組合時，直接以批號提醒作為狀態訊息
      let mixStatus = "";
      if (reqQty) {
        const u = String(reqUnit || "坪").toLowerCase();
        let mixNeedPcs = 0;
        if (u === '坪' || u === 'p') {
          mixNeedPcs = reqQty * ratio;
        } else if (u === '箱' || u === '包') {
          const pcsPerBox = safeN(primary[maps.price['片/箱']]) || safeN(primary[maps.price['P/C']]) || 1;
          mixNeedPcs = reqQty * pcsPerBox;
        } else {
          mixNeedPcs = reqQty;
        }
        mixStatus = buildMixedBatchNotice_(stockRows, matchedReservations, mixNeedPcs, maps);
      }

      // 多批號組合 → 用批號提醒；否則用庫存充足的隨機對話
      let statusMsg = mixStatus;
      if (!statusMsg) {
        const happyMsgs = [
          "有貨喔!!快點下單 😆🛒",
          "庫存超安全！手刀下單立刻為您打包出貨啦 😆🛒✨",
          "貨源滿滿！現貨完全沒問題，請安心下單！期待把美磚送到您手上 🚚🌸",
          "哇！目前數量非常夠喔！建議盡快下單鎖定，小高隨時為您登記 ✍️🥳",
          "安全庫存蓋章！這單穩了，離下班喝杯咖啡的時間又更近一步囉 ☕️✨",
          "貨源充足！您要的數量完全沒問題，請放心衝！給優秀的自己比個讚吧 👍🧱"
        ];
        statusMsg = happyMsgs[Math.floor(Math.random() * happyMsgs.length)];
      }

      reply += `🟢 <庫存充足>\n` +
               `🆔 編號：${code}\n` +
               `📚 系列：${series}\n` +
               `📐 尺寸：${size}\n` +
               (reqQty ? `🔢 需求：${reqQty}${reqUnit}\n` : "") +
               `📦 狀態：${statusMsg}\n`;

      if (arrivalInfo) {
        reply += arrivalInfo;
      }
    }
  }

  // 🚩 今友利編號：單一編號查詢自動帶入今友利專屬對齊圖卡與實景圖按鈕
  if (jinYouLiInv && jinYouLiInv.found && typeof buildJinYouLiInventoryBubble_ === 'function') {
    if (jinYouLiInv.imageUrl) {
      return buildJinYouLiInventoryBubble_(jinYouLiInv);
    }
  }

  return reply;
}

/**
 * ⚠️ 混合批號提醒產生器
 * 當庫存充足，但滿足需求需由 2 個以上批號組合時，回傳俏皮提醒文字（作為狀態訊息）。
 * 回傳空字串代表單一批號即可滿足，不需提醒。
 */
function buildMixedBatchNotice_(stockRows, matchedReservations, needPcs, maps) {
  try {
    if (!stockRows || stockRows.length < 2 || !needPcs || !maps.stock) return "";
    if (typeof maps.main['批號'] === 'undefined') return "";

    // 清洗批號：取最前方最多 5 碼，空格後捨棄（與 syncReservationStock 相同規則）
    const cleanBatch = (b) => {
      if (!b) return "";
      return String(b).trim().split(/\s+/)[0].substring(0, 5).toUpperCase();
    };

    // 1. 每批庫存
    const stockByBatch = {};
    stockRows.forEach(sr => {
      const lot = cleanBatch(sr[maps.stock['批號']]) || "未註記";
      stockByBatch[lot] = (stockByBatch[lot] || 0) + (typeof safeN === 'function' ? safeN(sr[maps.stock['片數']]) : 0);
    });

    // 2. 每批被保留量（保留單若有指定批號才可歸屬）
    const batchIdx = maps.main['批號'];
    const qtyIdx = maps.main['數量'];
    const reservedByBatch = {};
    let totalReserved = 0;
    matchedReservations.forEach(mr => {
      const lot = mr[batchIdx] ? cleanBatch(mr[batchIdx]) : "";
      const qty = (typeof safeN === 'function') ? safeN(mr[qtyIdx]) : 0;
      totalReserved += qty;
      if (lot && stockByBatch[lot] !== undefined) {
        reservedByBatch[lot] = (reservedByBatch[lot] || 0) + qty;
      }
    });

    // 3. 每批可用 = 庫存 - 該批保留
    const availByBatch = {};
    Object.keys(stockByBatch).forEach(lot => {
      const avail = Math.max(0, stockByBatch[lot] - (reservedByBatch[lot] || 0));
      if (avail > 0) availByBatch[lot] = avail;
    });

    // 3b. 未歸屬批號的保留量：由最大的批號優先扣減（保守估計，避免高估單批可用而漏提醒）
    const attributed = Object.values(reservedByBatch).reduce((a, b) => a + b, 0);
    let unAttributed = totalReserved - attributed;
    if (unAttributed > 0) {
      const availLots = Object.keys(availByBatch).sort((a, b) => availByBatch[b] - availByBatch[a]);
      for (const lot of availLots) {
        if (unAttributed <= 0) break;
        const take = Math.min(availByBatch[lot], unAttributed);
        availByBatch[lot] -= take;
        unAttributed -= take;
        if (availByBatch[lot] <= 0) delete availByBatch[lot];
      }
    }

    // 4. 由大到小挑批號，湊足需求片數
    const lots = Object.keys(availByBatch).sort((a, b) => availByBatch[b] - availByBatch[a]);
    let remain = needPcs;
    const used = [];
    for (const lot of lots) {
      if (remain <= 0) break;
      const take = Math.min(availByBatch[lot], remain);
      used.push({ lot, pcs: take });
      remain -= take;
    }
    if (remain > 0) return "";   // 湊不滿（理論上不會，因呼叫端已判充足）
    if (used.length < 2) return ""; // 單一批號即可滿足，不需提醒

    // 5. 回傳俏皮提醒文字（維持小高語氣，隨機抽一則）
    const mixMsgs = [
      "數量是沒問題的！不過這批貨是由多個批號組合成的，為了確保花色一致，還請跟我們通個電話確認一下喔！小高等您 📞😊",
      "貨是夠的！但這批是由好幾個批號湊在一起的，花色想幫您把關好，方便的話請撥通電話給小高，我們聊聊！☎️✨",
      "現貨足夠！只是這些貨是從多個批號組合起來的，為了讓您安心下單，麻煩跟我們通個電話確認細節，小高馬上接聽！📞💪",
      "數量沒問題，但這批貨是多批號組合的，想幫您把花色確認得妥妥的，還請撥個電話給我們確認一下喔～辛苦您了！📞🌸"
    ];
    return mixMsgs[Math.floor(Math.random() * mixMsgs.length)];
  } catch (e) {
    console.error("buildMixedBatchNotice_ 失敗：" + e);
    return "";
  }
}

/** 5. 保留單查詢 (🚩 高階分組與紅黃綠燈預警版) */
function handleReserveSearch(fullInput, cleanKW, db, maps, auth) {
  if (!db.main || db.main.length < 2) return "⚠️ 無法讀取目前保留資料。";
  
  const userLevel = String(auth.level || 'free').toLowerCase();
  const isAgent = ['sales', 'king', 'queen', 'admin'].includes(userLevel);
  const myNameRaw = String(auth.name || "");
  const companyFromName = myNameRaw.includes('-') ? myNameRaw.split('-')[0] : '';
  const companyPrefix = companyFromName || String(auth.company || '') || myNameRaw;
  const now = new Date();
  const SEP = "➖➖➖➖➖";

  let searchStr = String(cleanKW || "").toLowerCase().trim();
  const baseSearchStr = searchStr.replace(/-[a-z0-9]+$/i, '');
  
  if (!isAgent) {
    if (searchStr && companyPrefix && !searchStr.includes(companyPrefix.toLowerCase())) {
      return `🚫 權限提醒：\n您目前僅能查詢「${companyPrefix}」的相關保留紀錄喔！`;
    }
    if (!searchStr) searchStr = companyPrefix.toLowerCase();
  }

  if (searchStr.length < 2) return isAgent ? "🔍 請輸入關鍵字（公司、業務、案名）。" : "";

  const c = key => maps.main[key] !== undefined ? maps.main[key] : -1;
  const cD = c('保留日期');
  const codeColIdx = c('編號') >= 0 ? c('編號') : c('品號');

  // 判斷關鍵字是否為產品編號（含數字的編號）
  const isCodeQuery = /^[a-zA-Z]*\d{3,}(?:-[a-zA-Z0-9]+)?$/i.test(searchStr);

  // 1. 搜尋並整理
  const rawList = db.main.slice(1).map(r => {
    if (!r || r.every(v => !v)) return null;

    const rCodeRaw = codeColIdx >= 0 ? String(r[codeColIdx] || "").trim() : "";
    if (!rCodeRaw) return null; // 🛡️ 防禦過濾：若品號為空直接判定為無效列，避免出現「未知 / ? | 0片」

    if (isCodeQuery && codeColIdx >= 0) {
      // 🎯 若輸入為品號，對「編號」欄位做精準比對 (例如 61274 只對應 RA61274，不包含 RA61274-F)
      const rCode = String(r[codeColIdx] || "").toUpperCase().trim();
      const searchCodeUpper = searchStr.toUpperCase();
      
      const hasSuffix = /-[A-Z0-9]+$/i.test(searchCodeUpper);
      const searchDigits = searchCodeUpper.replace(/\D/g, '');
      const rCodeDigits = rCode.replace(/\D/g, '');
      const isExactCodeMatch = hasSuffix
        ? (rCode === searchCodeUpper)
        : (rCode === searchCodeUpper || rCode.replace(/-[A-Z0-9]+$/i, '') === searchCodeUpper ||
           (searchDigits.length >= 3 && rCodeDigits === searchDigits));
      if (!isExactCodeMatch) return null;
    } else {
      // 🔍 非品號（如公司名、業務名、案名），走整列文字包含比對
      const rowStr = r.join('|').toLowerCase();
      if (rowStr.indexOf(searchStr) === -1) return null;
    }

    if (!isAgent && companyPrefix && r.join('|').toLowerCase().indexOf(companyPrefix.toLowerCase()) === -1) return null;

    const bizIdx = c('客戶業務') >= 0 ? c('客戶業務') : (c('業務') >= 0 ? c('業務') : -1);
    const biz = bizIdx >= 0 ? String(r[bizIdx] || "未指定").trim() : "未指定";
    const caseName = String(r[c('案名')] || "").trim();
    const addrIdx = c('地址') >= 0 ? c('地址') : (c('工地') >= 0 ? c('工地') : -1);
    const address = addrIdx >= 0 ? String(r[addrIdx] || "").trim() : "";
    const displayCase = (caseName && caseName !== "?") ? caseName : (address || "未命名案");

    let days = 0;
    const dRaw = cD >= 0 ? r[cD] : null;
    if (dRaw instanceof Date) days = Math.floor((now - dRaw) / (1000 * 60 * 60 * 24));
    else if (dRaw) {
      const dParsed = new Date(String(dRaw));
      if (!isNaN(dParsed.getTime())) days = Math.floor((now - dParsed) / (1000 * 60 * 60 * 24));
    }
    return { data: r, days: Number(days) || 0, biz, caseName: displayCase };
  }).filter(it => it !== null);

  if (rawList.length === 0) return `💡 查無符合的保留記錄。`;

  // 2. 排序：品號查詢依「留天數(遞減)」，非品號依「業務 → 留天數」
  if (isCodeQuery) {
    rawList.sort((a, b) => b.days - a.days);
  } else {
    rawList.sort((a, b) => {
      if (a.biz === "未指定" && b.biz !== "未指定") return 1;
      if (a.biz !== "未指定" && b.biz === "未指定") return -1;
      if (a.biz !== b.biz) return a.biz.localeCompare(b.biz);
      return b.days - a.days;
    });
  }

  // 3. 計算每位業務的案件數 (包含未指定業務)
  const bizCaseCount = {};
  rawList.forEach(item => {
    const biz = item.biz || "未指定";
    bizCaseCount[biz] = (bizCaseCount[biz] || 0) + 1;
  });

  // 4. 渲染
  const totalCases = rawList.length;
  const searchLabel = searchStr.toUpperCase();
  let res = `⭐ ${searchLabel} 共${totalCases}筆保留 ⭐\n${SEP}\n`;

  let lastBiz = null;
  rawList.slice(0, 30).forEach(item => {
    const r = item.data;
    const v = key => { 
      const idx = maps.main[key]; 
      return (idx !== undefined && idx !== -1) ? r[idx] : ""; 
    };

    const bizName = item.biz || "未指定";

    // 🚩 只有在「非品號查詢」(如查客戶、查業務) 時才顯示業務大標題切換；品號查詢時不拆業務大標題，畫面更乾淨
    if (!isCodeQuery && bizName !== lastBiz) {
      if (lastBiz !== null) res += `\n`;
      const titleBiz = (bizName === "未指定") ? "未指定業務" : bizName;
      res += `⭐ ${searchLabel} | ${titleBiz} ${bizCaseCount[bizName]}筆 ⭐\n${SEP}\n`;
      lastBiz = bizName;
    }

    // 客戶與案名標題
    const cust = String(v('客戶') || v('公司') || "未知").trim();
    const displayTitle = (bizName === "未指定") ? cust : `${cust} | ${bizName}`;
    const caseText = item.caseName ? item.caseName : "";
    if (caseText && caseText !== cust) {
      res += `${displayTitle}\n${caseText}\n`;
    } else {
      res += `${displayTitle}\n`;
    }

    // 品號與數量
    const code = String(v('編號') || "?").toUpperCase();
    const pcs = (typeof safeN === 'function') ? safeN(v('數量')) : 0;
    res += `${code} | ${pcs}片\n`;

    // 狀態與留天數
    let dateStr = "??/??", lamp = "✳️";
    if (item.days > 60) lamp = "🔴";
    else if (item.days >= 30) lamp = "🟡";

    const dVal = cD >= 0 ? r[cD] : null;
    if (dVal instanceof Date) {
      dateStr = Utilities.formatDate(dVal, "Asia/Taipei", "MM/dd");
    } else if (dVal) {
      const dParsed = new Date(String(dVal));
      if (!isNaN(dParsed.getTime())) dateStr = Utilities.formatDate(dParsed, "Asia/Taipei", "MM/dd");
      else dateStr = String(dVal).substring(5, 10).replace('-', '/');
    }

    const depVal = String(v('訂金確認') || v('訂金') || "").trim();
    const isDepositPaid = (depVal && depVal !== "?" && depVal !== "-" && depVal !== "未付" && depVal !== "未收");
    
    let rawNote = v('備註');
    let note = (rawNote instanceof Date) ? Utilities.formatDate(rawNote, "Asia/Taipei", "yyyy/MM/dd") : String(rawNote || "").trim();

    let rawUpdate = v('telegram更新') || v('更新');
    let tgUpdate = String(rawUpdate || "").trim();

    res += `${dateStr} | ${lamp} 留 ${item.days}天\n` +
           (isDepositPaid ? `💰 訂金已收\n` : "") +
           (note && note !== "-" && note !== "?" ? `備註：${note}\n` : "") +
           (tgUpdate && tgUpdate !== "-" ? `更新：${tgUpdate}\n` : "") +
           `${SEP}\n`;
  });

  if (rawList.length > 30) res += `\n⚠️ 僅顯示前 30 筆保留。`;
  return res;
}

/** 6. 過期保留查詢：專供業務快速抓出逾期案件 */
function handleExpiredReservations(fullInput, db, maps, auth) {
  if (!db.main || db.main.length < 2) return "⚠️ 無法讀取保留資料。";

  const userLevel = String(auth.level || 'free').toLowerCase();
  const isKing = ['king', 'queen', 'admin'].includes(userLevel);
  const isSales = isKing || userLevel === 'sales';
  if (!isSales) return "🚫 此功能僅限業務以上帳號使用。";

  const dayMatch = fullInput.match(/(\d+)\s*天/);
  const threshold = dayMatch ? parseInt(dayMatch[1]) : 30;

  const myNameRaw = String(auth.name || "");
  const myBiz = myNameRaw.includes('-') ? myNameRaw.split('-')[1] : myNameRaw;
  const now = new Date();
  const c = key => maps.main[key] !== undefined ? maps.main[key] : -1;
  const cD = c('保留日期');
  const SEP = "➖➖➖➖➖";

  // 1. 篩選與初步整理
  const rawList = db.main.slice(1).map(r => {
    if (!r || r.every(v => !v)) return null;

    const codeColIdx = c('編號') >= 0 ? c('編號') : c('品號');
    const rCodeRaw = codeColIdx >= 0 ? String(r[codeColIdx] || "").trim() : "";
    if (!rCodeRaw) return null; // 🛡️ 防禦過濾：若品號為空直接判定為無效列，避免出現「未知 / ? | 0片」

    const bizIdx = c('客戶業務') >= 0 ? c('客戶業務') : (c('業務') >= 0 ? c('業務') : -1);
    const biz = bizIdx >= 0 ? String(r[bizIdx] || "未指定").trim() : "未指定";
    if (!isKing && myBiz && !biz.toLowerCase().includes(myBiz.toLowerCase())) return null;

    let days = 0;
    const dRaw = cD >= 0 ? r[cD] : null;
    if (dRaw instanceof Date) days = Math.floor((now - dRaw) / (1000 * 60 * 60 * 24));
    else if (dRaw) {
      const dParsed = new Date(String(dRaw));
      if (!isNaN(dParsed.getTime())) days = Math.floor((now - dParsed) / (1000 * 60 * 60 * 24));
    }
    if (days < threshold) return null;

    const customer = String(r[c('客戶')] || r[c('公司')] || "未知客戶").trim();
    const caseName = String(r[c('案名')] || "").trim();
    const addrIdx = c('地址') >= 0 ? c('地址') : (c('工地') >= 0 ? c('工地') : -1);
    const address = addrIdx >= 0 ? String(r[addrIdx] || "").trim() : "";
    const displayCase = (caseName && caseName !== "?") ? caseName : (address || "未命名案");

    return { data: r, days: Number(days), biz, customer, caseName: displayCase };
  }).filter(it => it !== null);

  if (rawList.length === 0) return `✅ 目前無超過 ${threshold} 天的保留記錄！`;

  // 2. 分群 (依 業務+客戶+案名)
  const groups = {}, groupOrder = [];
  rawList.forEach(item => {
    const key = `${item.biz}||${item.customer}||${item.caseName}`;
    if (!groups[key]) {
      groups[key] = { caseName: item.caseName, customer: item.customer, biz: item.biz, items: [], maxDays: 0, mainData: item };
      groupOrder.push(key);
    }
    groups[key].items.push(item);
    if (item.days > groups[key].maxDays) groups[key].maxDays = item.days;
  });

  // 3. 排序：客戶 -> 業務 -> 天數(大到小)
  groupOrder.sort((a, b) => {
    if (groups[a].customer !== groups[b].customer) return groups[a].customer.localeCompare(groups[b].customer);
    if (groups[a].biz !== groups[b].biz) return groups[a].biz.localeCompare(groups[b].biz);
    return groups[b].maxDays - groups[a].maxDays;
  });

  // 4. 渲染 (比照 handleReserveSearch 樣式)
  const scope = isKing ? "全公司" : `${myBiz}`;
  let res = `⚠️ 過期保留 (${scope}，超過 ${threshold} 天)\n${SEP}\n`;
  let lastBiz = "";

  groupOrder.slice(0, 40).forEach(gKey => {
    const g = groups[gKey];
    const sample = g.mainData;
    const v = (row, key) => { const idx = maps.main[key]; return idx !== undefined ? row[idx] : "?"; };

    // 業務大標題 (僅在切換業務且非「未指定」時顯示)
    if (g.biz !== lastBiz) {
       if (lastBiz) res += `\n`;
       if (g.biz !== "未指定") {
         res += `⭐ 業務：${g.biz} ⭐\n${SEP}\n`;
       }
       lastBiz = g.biz;
    }

    // 案名標題 (客戶 | 業務)
    const displayTitle = (g.biz === "未指定") ? g.customer : `${g.customer} | ${g.biz}`;
    res += `${displayTitle}\n${g.caseName}\n`;

    // 產品明細
    g.items.forEach(it => {
      const code = String(v(it.data, '編號') || "?").toUpperCase();
      const pcs = (typeof safeN === 'function') ? safeN(v(it.data, '數量')) : 0;
      res += `${code} | ${pcs}片\n`;
    });

    // 狀態
    let dateStr = "未知", lamp = "🔴";
    if (g.maxDays < 60) lamp = "🟡";
    const dVal = cD >= 0 ? sample.data[cD] : null;
    if (dVal instanceof Date) dateStr = Utilities.formatDate(dVal, "GMT+8", "MM/dd");
    const deposit = (v(sample.data, '訂金確認') || v(sample.data, '訂金')) ? "💰 已付" : "🈚 未付";

    res += `${dateStr} | ${lamp} 已留 ${g.maxDays}天\n` +
           `訂金：${deposit}\n` +
           `${SEP}\n`;
  });

  if (groupOrder.length > 40) res += `\n⚠️ 僅顯示前 40 筆逾期案件。`;
  return res;
}

// ⚡ 輔助函數：格式化到港日期 (MM/dd 格式)
// 🚩 [v683] 新批到港簡短日期格式：不補零，9/7 而非 09/07
function formatArrivalDateShort_(dVal) {
  if (!dVal) return "";
  let d = null;
  if (dVal instanceof Date) {
    d = dVal;
  } else {
    d = new Date(String(dVal));
  }
  if (isNaN(d.getTime())) {
    return String(dVal).trim();
  }
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatArrivalDate(dVal) {
  if (!dVal) return "";
  let d = null;
  if (dVal instanceof Date) {
    d = dVal;
  } else {
    d = new Date(String(dVal));
  }
  if (isNaN(d.getTime())) {
    return String(dVal).trim();
  }
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}`;
}

// ⚡ 輔助函數：計算並格式化到港倒數
function getCountdownText(dateVal) {
  if (!dateVal) return "";
  let d = null;
  if (dateVal instanceof Date) {
    d = dateVal;
  } else {
    d = new Date(String(dateVal));
  }
  if (isNaN(d.getTime())) return "";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const target = new Date(d.getTime());
  target.setHours(0, 0, 0, 0);

  const diffTime = target.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays > 0) {
    return `✨ 再${diffDays}天就到貨啦!`;
  } else if (diffDays === 0) {
    return `✨ 今天到港囉！🎉`;
  } else {
    return `✨ 已經到港囉！📦`;
  }
}

// ==========================================
// 🧱 今友利庫存（獨立品牌資料源，非主要「編號價目表」系統）
// ==========================================

const JINYOULI_SS_ID = '1u_7xHHhMRh15cwSgf1MjjL6jFKasSkNFoEHrPUuj7Cc';
const JINYOULI_GID = '1040346857';

/** 讀取今友利庫存試算表（依 gid 精準鎖定分頁，避免分頁改名失效；附 1 小時快取） */
function getJinYouLiSheetData_() {
  const cacheKey = "jinyouli_sheet_data_v1";
  const cached = (typeof CacheManager !== 'undefined') ? CacheManager.getLarge(cacheKey) : null;
  if (cached) return cached;

  let data = [];
  try {
    const ss = SpreadsheetApp.openById(JINYOULI_SS_ID);
    const sheets = ss.getSheets();
    const target = sheets.find(s => String(s.getSheetId()) === JINYOULI_GID) || sheets[0];
    data = target ? target.getDataRange().getValues() : [];
  } catch (e) {
    console.error("讀取今友利庫存試算表失敗: " + e);
    return [];
  }

  if (data && data.length > 0 && typeof CacheManager !== 'undefined') {
    CacheManager.putLarge(cacheKey, data, 3600); // 快取 1 小時
  }
  return data;
}

/**
 * 今友利庫存查詢：輸入含「今友利」即列出全部庫存，依品牌分組。
 * 「保留」「可用數量」直接讀試算表現成欄位，不跟本機器人保留單系統連動運算。
 */
function handleJinYouLiInventory_() {
  const data = getJinYouLiSheetData_();
  if (!data || data.length < 2) return "⚠️ 今友利庫存資料讀取失敗，請稍後再試。";

  const map = getHeaderMap(data);
  const idxBrand = map['品牌'];
  const idxSeries = map['中文系列'] !== undefined ? map['中文系列'] : map['中文品名系列'];
  const idxCode = map['編號'];
  const idxSize = map['尺寸'];
  const idxStock = map['庫存'];
  const idxAvail = map['可用數量'];

  if (idxCode === undefined) return "⚠️ 今友利庫存欄位格式異常，請聯繫管理員檢查表頭。";

  const groups = {};
  const groupOrder = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const code = String(row[idxCode] || "").trim();
    if (!code) continue;

    const brand = idxBrand !== undefined ? (String(row[idxBrand] || "").trim() || "未分類") : "未分類";
    if (!groups[brand]) { groups[brand] = []; groupOrder.push(brand); }

    groups[brand].push({
      code: code.toUpperCase(),
      series: idxSeries !== undefined ? String(row[idxSeries] || "").trim() : "",
      size: idxSize !== undefined ? String(row[idxSize] || "").trim() : "",
      avail: idxAvail !== undefined ? safeN(row[idxAvail]) : (idxStock !== undefined ? safeN(row[idxStock]) : 0)
    });
  }

  if (groupOrder.length === 0) return "⚠️ 今友利庫存目前沒有可顯示的資料。";

  let reply = "📦 【今友利】庫存總覽\n──────\n";
  groupOrder.forEach(brand => {
    reply += `▪️ ${brand}\n`;
    groups[brand].forEach(it => {
      const light = it.avail > 0 ? '🟢' : '🔴';
      const seriesInfo = it.series ? (it.series + " ") : "";
      reply += `${light} ${it.code} | ${seriesInfo}${it.size} | 可用${it.avail}片\n`;
    });
    reply += `──────\n`;
  });

  return reply;
}

/**
 * 依編號查今友利庫存/保留（找不到回傳 null）。
 * 供單編號庫存查詢（handleInventorySearch）合併加總使用，不透過「今友利」關鍵字觸發。
 */
function getJinYouLiInventoryForCode_(code) {
  const data = getJinYouLiSheetData_();
  if (!data || data.length < 2) return null;

  const map = getHeaderMap(data);
  const idxCode = map['編號'];
  const idxStock = map['庫存'];
  const idxReserve = map['保留'];
  const idxImage = map['單片網址連結'];
  if (idxCode === undefined) return null;

  const target = String(code || '').toUpperCase().trim();
  let stock = 0, reserved = 0, found = false, imageUrl = "";

  for (let i = 1; i < data.length; i++) {
    const rowCode = String(data[i][idxCode] || '').toUpperCase().trim();
    if (rowCode === target) {
      found = true;
      stock += idxStock !== undefined ? safeN(data[i][idxStock]) : 0;
      reserved += idxReserve !== undefined ? safeN(data[i][idxReserve]) : 0;
      if (!imageUrl && idxImage !== undefined) {
        const url = String(data[i][idxImage] || '').trim();
        if (url && url.includes('http')) imageUrl = url;
      }
    }
  }

  return found ? { stock: stock, reserved: reserved, imageUrl: imageUrl } : null;
}

/** 把 Google Drive 分享連結轉成 LINE 可直接顯示的縮圖連結（沿用全專案一致的轉換規則） */
function normalizeJinYouLiImageUrl_(url) {
  if (!url) return "";
  if (url.includes('drive.google.com')) {
    const id = url.match(/[\w-]{25,}/);
    if (id) return "https://drive.google.com/thumbnail?id=" + id[0] + "&sz=w600";
  }
  return url;
}

/** 今友利編號查詢結果轉圖卡：把已經組好的文字結果包成 Flex bubble，hero 放產品圖 */
function buildJinYouLiInventoryBubble_(imageUrl, replyText) {
  const displayUrl = normalizeJinYouLiImageUrl_(imageUrl);
  const lines = String(replyText || "").split('\n').filter(l => l.trim() !== '');

  const bodyContents = lines.map(line => ({
    type: 'text',
    text: line,
    size: 'sm',
    wrap: true,
    color: '#333333'
  }));

  return {
    type: 'bubble',
    size: 'mega',
    hero: {
      type: 'image',
      url: displayUrl,
      size: 'full',
      aspectRatio: '16:9',
      aspectMode: 'cover',
      action: { type: 'uri', label: '放大查看', uri: displayUrl }
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'xs',
      paddingAll: '16px',
      contents: bodyContents
    }
  };
}

/**
 * 依短編號 (如 D124, D101, J16, U23 等) 單獨查詢今友利庫存並生成優美回覆與 Flex 圖卡
 */
function getJinYouLiSingleItem_(code) {
  const data = getJinYouLiSheetData_();
  if (!data || data.length < 2) return null;

  const map = getHeaderMap(data);
  const idxCode = map['編號'];
  const idxBrand = map['品牌'];
  const idxSeries = map['中文系列'] !== undefined ? map['中文系列'] : map['中文品名系列'];
  const idxSize = map['尺寸'];
  const idxStock = map['庫存'];
  const idxReserve = map['保留'];
  const idxAvail = map['可用數量'];
  const idxImage = map['單片網址連結'];

  if (idxCode === undefined) return null;

  const target = String(code || '').toUpperCase().trim();
  let item = null;

  for (let i = 1; i < data.length; i++) {
    const rowCode = String(data[i][idxCode] || '').toUpperCase().trim();
    if (rowCode === target) {
      item = data[i];
      break;
    }
  }

  if (!item) return null;

  const brand = idxBrand !== undefined ? String(item[idxBrand] || "").trim() : "今友利";
  const series = idxSeries !== undefined ? String(item[idxSeries] || "").trim() : "";
  const size = idxSize !== undefined ? String(item[idxSize] || "").trim() : "";
  const stock = idxStock !== undefined ? safeN(item[idxStock]) : 0;
  const reserve = idxReserve !== undefined ? safeN(item[idxReserve]) : 0;
  const avail = idxAvail !== undefined ? safeN(item[idxAvail]) : (stock - reserve);
  const imageUrl = idxImage !== undefined ? String(item[idxImage] || "").trim() : "";

  const light = avail > 0 ? "🟢" : "🔴";
  let reply = `${light} <今友利 查詢結果>\n` +
              `編號：${target}\n` +
              (brand ? `品牌：${brand}\n` : "") +
              (series ? `系列：${series}\n` : "") +
              (size ? `尺寸：${size}\n` : "") +
              `庫存：${stock}片\n` +
              (reserve > 0 ? `保留：${reserve}片\n` : "") +
              `可用：${avail}片\n` +
              `(資料來源：今友利庫存)`;

  let flexObj = null;
  if (imageUrl && imageUrl.includes('http') && typeof buildJinYouLiInventoryBubble_ === 'function') {
    flexObj = buildJinYouLiInventoryBubble_(imageUrl, reply);
  }

  return { replyText: reply, flexObj: flexObj };
}

/**
 * 高雅瓷 AI 智能客服 - 2026 睡美人優惠精選 (v3.2 - 內部統一讀取)
 * 檔案：8_Sleepbeauty.js
 * 🚩 v671 修正：所有數據在 handleSleepBeauty 內部統一讀取（getDataRange().getValues()），
 *    不依賴外部傳入，完全解決 postback 與輸入睡美人的資料不一致問題
 */

function handleSleepBeauty(auth, dbSS) {
  try {
    // 🚩 v671：內部統一讀取所有 Sheet 數據（用 getDataRange()，不用函式轉換）
    const priceSheet = dbSS.getSheetByName("編輯價目表") || dbSS.getSheetByName("編號價目表");
    const stockSheet = dbSS.getSheetByName("庫存表");
    const mainSheet = dbSS.getSheetByName("保留單");

    if (!priceSheet || !stockSheet || !mainSheet) {
      return "✨ 資料表不完整，請稍後再試。";
    }

    const priceData = priceSheet.getDataRange().getValues();
    const stockData = stockSheet.getDataRange().getValues();
    const mainData = mainSheet.getDataRange().getValues();

    const priceMap = getHeaderMap(priceData);
    const stockMap = getHeaderMap(stockData);
    const mainMap = getHeaderMap(mainData);

    const dbFull = { stock: stockData, main: mainData };
    const mapsFull = { stock: stockMap, main: mainMap };

    const selected = selectRandomProducts(priceData, priceMap, 5);

    if (!selected || selected.length === 0) {
      return "✨ 精品系列正在校正中，請稍後再試。";
    }

    const bubbles = selected.map((item, idx) => buildSleepBeautyBubble(item, priceData, priceMap, dbFull, mapsFull));

    return {
      type: "carousel",
      contents: bubbles
    };
  } catch (e) {
    console.error("睡美人出錯: " + e);
    return "✨ 推薦系統出現問題，請稍後再試";
  }
}

function selectRandomProducts(priceData, priceMap, count) {
  const codeIdx = priceMap['編號'];
  const sbIdx = priceMap['睡美人'];
  if (codeIdx === undefined) return null;

  const sleepBeautyProducts = [];
  for (let i = 1; i < priceData.length; i++) {
    const code = String(priceData[i][codeIdx] || '').trim();
    const sbValue = sbIdx !== undefined ? String(priceData[i][sbIdx] || '').trim() : '';
    if (code && code !== '編號' && sbValue) {
      sleepBeautyProducts.push({ row: priceData[i], rowIdx: i });
    }
  }

  if (sleepBeautyProducts.length === 0) return null;

  const shuffled = sleepBeautyProducts.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

function buildSleepBeautyBubble(itemData, priceData, priceMap, dbFull, mapsFull) {
  const item = itemData.row;

  // 🚩 v671：所有索引從 priceMap 映射（統一來源 - getDataRange()）
  const codeIdx = priceMap['編號'];
  const seriesIdx = priceMap['中文系列'];
  const costIdx = priceMap['成本'];
  const ratioIdx = priceMap['片/坪'];
  const sceneIdx = priceMap['實景1'];
  const flexCacheIdx = priceMap['FLEX快取'];
  const sizeIdx = priceMap['尺寸(cm)'];

  const code = String(item[codeIdx] || '').trim().toUpperCase();
  const series = String(item[seriesIdx] || '').trim();

  // 🚩 價格讀取（直接從 priceData）
  let cost = 0;
  if (costIdx !== undefined && item[costIdx] !== undefined) {
    cost = parseFloat(item[costIdx]) || 0;
  }

  const ratio = (ratioIdx !== undefined && item[ratioIdx] !== undefined) ? parseFloat(item[ratioIdx]) || 1 : 1;
  const size = (sizeIdx !== undefined && item[sizeIdx] !== undefined) ? String(item[sizeIdx] || '').trim() : '120X278';

  // 🚩 實景圖：優先 FLEX 快取，次選實景1 欄位
  let sceneImageUrl = null;
  if (flexCacheIdx !== undefined && item[flexCacheIdx] !== undefined) {
    const cacheStr = String(item[flexCacheIdx] || '').trim();
    if (cacheStr && cacheStr.startsWith('{')) {
      try {
        const cacheObj = JSON.parse(cacheStr);
        if (cacheObj.scene && Array.isArray(cacheObj.scene) && cacheObj.scene.length > 0) {
          sceneImageUrl = cacheObj.scene[0];
        }
      } catch (e) {}
    }
  }
  if (!sceneImageUrl && sceneIdx !== undefined && item[sceneIdx] !== undefined) {
    sceneImageUrl = String(item[sceneIdx] || '').trim();
    if (!sceneImageUrl || !sceneImageUrl.includes('http')) {
      sceneImageUrl = null;
    }
  }

  // 🚩 庫存查詢：統一從 dbFull（getDataRange() 來源）讀取
  const stockInfo = getStockInfo(code, ratio, dbFull, mapsFull);

  const pricePerPiece = Math.round(cost);
  const pricePerPing = Math.round(cost * 2 * ratio);

  const buttons = [
    {
      type: "button",
      style: "secondary",
      color: "#FFF8DC",
      height: "sm",
      action: {
        type: "postback",
        label: "雲端資料庫",
        data: "t=drive&c=" + code,
        displayText: code + " 雲端資料庫"
      }
    },
    {
      type: "button",
      style: "secondary",
      color: "#FFF8DC",
      height: "sm",
      action: {
        type: "postback",
        label: "實景照",
        data: "t=scene&c=" + code,
        displayText: code + " 實景照"
      }
    },
    {
      type: "button",
      style: "secondary",
      color: "#FFF8DC",
      height: "sm",
      action: {
        type: "postback",
        label: "系列介紹",
        data: "t=intro&c=" + code,
        displayText: code + " 系列介紹"
      }
    },
    {
      type: "button",
      style: "secondary",
      color: "#FFF8DC",
      height: "sm",
      action: {
        type: "postback",
        label: "模面圖",
        data: "t=piece&c=" + code,
        displayText: code + " 模面圖"
      }
    }
  ];

  return {
    type: "bubble",
    size: "kilo",
    ...(sceneImageUrl ? {
      hero: {
        type: "image",
        size: "full",
        aspectRatio: "20:13",
        aspectMode: "cover",
        url: sceneImageUrl
      }
    } : {}),
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#8A7966",
      paddingAll: "12px",
      contents: [
        {
          type: "text",
          text: "優惠產品精選",
          weight: "bold",
          size: "sm",
          color: "#ffffff"
        }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "16px",
      contents: [
        {
          type: "text",
          text: series,
          weight: "bold",
          size: "lg",
          color: "#1e1e1e"
        },
        {
          type: "text",
          text: "編號：" + code,
          size: "xs",
          color: "#666666",
          margin: "sm"
        },
        {
          type: "text",
          text: "尺寸：" + size,
          size: "xs",
          color: "#666666"
        },
        {
          type: "text",
          text: "庫存：" + (stockInfo.stockPcs || 0) + "片/" + (stockInfo.stockPing || 0) + "坪",
          size: "xs",
          color: "#1e1e1e",
          weight: "bold",
          margin: "sm"
        },
        {
          type: "text",
          text: "$" + pricePerPiece + "/片",
          size: "sm",
          color: "#e1306c",
          weight: "bold"
        },
        {
          type: "text",
          text: "$" + pricePerPing + "/坪",
          size: "sm",
          color: "#e1306c",
          weight: "bold"
        }
      ]
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "xs",
      paddingAll: "12px",
      contents: [
        ...buttons,
        {
          type: "button",
          style: "secondary",
          color: "#9ACD32",
          height: "sm",
          action: {
            type: "postback",
            label: "試試手氣",
            data: "t=sb&a=retry",
            displayText: "重新推薦"
          }
        }
      ]
    }
  };
}

function getStockInfo(code, ratio, dbFull, mapsFull) {
  try {
    if (!dbFull || !dbFull.stock || !dbFull.main || !mapsFull || !mapsFull.stock || !mapsFull.main) {
      return { displayText: "查詢中", stockPcs: 0, stockPing: 0, reservedPcs: 0, reservedPing: 0, availPcs: 0, availPing: 0, reserveCount: 0 };
    }

    const stockCodeIdx = mapsFull.stock['編號'];
    const stockQtyIdx = mapsFull.stock['片數'];
    const stockNameIdx = mapsFull.stock['品名'];

    const mainCodeIdx = mapsFull.main['編號'];
    const mainQtyIdx = mapsFull.main['數量'];

    if (stockCodeIdx === undefined || stockQtyIdx === undefined || mainCodeIdx === undefined || mainQtyIdx === undefined) {
      return { displayText: "查詢中", stockPcs: 0, stockPing: 0, reservedPcs: 0, reservedPing: 0, availPcs: 0, availPing: 0, reserveCount: 0 };
    }

    // 🚩 計算庫存
    const stockRows = dbFull.stock.filter(r => {
      const rowCode = String(r[stockCodeIdx] || '').toUpperCase();
      const rowName = String(r[stockNameIdx] || '');
      return rowCode === code && !rowName.includes("小計");
    });

    const totalStockPcs = stockRows.reduce((acc, r) => {
      const qty = (typeof safeN === 'function') ? safeN(r[stockQtyIdx]) : parseFloat(r[stockQtyIdx]) || 0;
      return acc + qty;
    }, 0);

    // 🚩 計算保留（精確匹配，不含-期結尾）
    const reservedRows = dbFull.main.filter(r => {
      const rowCode = String(r[mainCodeIdx] || '').toUpperCase();
      return rowCode === code && !rowCode.includes('-期');
    });

    const totalReservedPcs = reservedRows.reduce((acc, r) => {
      const qty = (typeof safeN === 'function') ? safeN(r[mainQtyIdx]) : parseFloat(r[mainQtyIdx]) || 0;
      return acc + qty;
    }, 0);

    const totalStockPing = ratio > 0 ? Math.floor(totalStockPcs / ratio) : 0;
    const totalReservedPing = ratio > 0 ? Math.floor(totalReservedPcs / ratio) : 0;
    const availPcs = Math.max(0, totalStockPcs - totalReservedPcs);
    const availPing = ratio > 0 ? Math.floor(availPcs / ratio) : 0;

    const displayText = `庫存：${totalStockPcs}片 ｜ ${totalStockPing}坪\n保留：${totalReservedPcs}片｜${totalReservedPing}坪｜${reservedRows.length} 筆\n可用：${availPcs}片｜${availPing}坪`;

    return {
      displayText: displayText,
      stockPcs: totalStockPcs,
      stockPing: totalStockPing,
      reservedPcs: totalReservedPcs,
      reservedPing: totalReservedPing,
      availPcs: availPcs,
      availPing: availPing,
      reserveCount: reservedRows.length
    };
  } catch (e) {
    console.error("庫存查詢出錯: " + e);
    return { displayText: "查詢中", stockPcs: 0, stockPing: 0, reservedPcs: 0, reservedPing: 0, availPcs: 0, availPing: 0, reserveCount: 0 };
  }
}

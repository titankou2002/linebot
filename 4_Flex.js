/**
 * 高雅瓷 AI 智能客服 - 2026 一般視覺引擎 (v24.1)
 * 檔案：4_Flex.gs
 * 🚩 【最高開發原則】：
 * 1. 職責分離：此檔案僅處理「看圖片」相關視覺輪播，不處理審核流程。
 * 2. 影像必現：全面採用 HTTPS Thumbnail API，確保 100% 顯圖。
 * 3. 轉發友善：強化 altText 描述，確保長按卡片能正常分享。
 * 4. 嚴禁縮寫：全量輸出。
 */

/** 1. 動態快捷泡泡：根據 auth.level 自動切換底部按鈕 */
function getDynamicBubbles(auth) {
  if (!auth) return null;
  const level = String(auth.level || "free").toLowerCase();
  const items = [];

  if (['sales', 'king', 'queen', 'admin'].includes(level)) {
    items.push({ "type": "action", "action": { "type": "message", "label": "🔍 查保留", "text": "查保留" } });
  } else {
    items.push({ "type": "action", "action": { "type": "message", "label": "📝 下保留", "text": "下保留" } });
  }

  items.push({ "type": "action", "action": { "type": "message", "label": "💰 查價格", "text": "查價格" } });
  items.push({ "type": "action", "action": { "type": "message", "label": "🖼️ 看圖片", "text": "看圖片" } });

  return { "items": items };
}

/** 2. 產品實景圖輪播引擎 (v24.2 - 加速快取版) */
function handleFlexTest(q, db, maps) {
  var specKeywords = ["重量", "價格", "多少錢", "規格", "尺寸", "庫存", "多重", "幾片", "片數", "公斤", "箱裝", "包裝", "重", "坪", "p", "P"];
  var visualWhiteList = ["圖片", "照片", "圖檔", "看圖", "實景", "完工照", "實蹟圖", "實景圖"];
  var isExplicitVisual = visualWhiteList.some(function(v) { return q.indexOf(v) > -1; });

  if (!isExplicitVisual) {
    for (var s = 0; s < specKeywords.length; s++) {
      if (q.indexOf(specKeywords[s]) > -1) return null; 
    }
  }
  
  // 🚩 核心優化：清理關鍵字。同時把量詞模式（例如 10坪、50片、100p）一併清除，以便精準比對商品編號
  var targetKW = q.replace(/flex/i, '')
                  .replace(/圖片|照片|圖檔|實景|實景圖|實蹟圖|完工照|照|圖/g, '')
                  .replace(/\d+(?:\.\d+)?\s*(坪|p|片|箱|包|套|個)/i, '')
                  .trim();
  if (!targetKW) return null;

  var searchResult = (typeof getGroupedRows === 'function') ? getGroupedRows(targetKW, db.price, maps.price) : { primary: null, recommendations: [] };
  if (!searchResult) return null;

  var primary = searchResult.primary;
  var recommendations = searchResult.recommendations || [];
  
  // 🚩 [v24.4 強化]：若無主角(廣泛搜尋)，則以推薦清單第一筆作為參考，或直接處理推薦清單
  if (!primary && recommendations.length > 0) {
    primary = recommendations[0];
    recommendations = recommendations.slice(1);
  }
  
  if (!primary) return null;

  var primarySeries = String(primary[maps.price['中文系列']] || "");
  var selectionKeys = /白|灰|黑|米|石紋|水泥|木紋|六角|花磚|拋光|霧面/i;
  var isSelectionSearch = selectionKeys.test(q);

  // 🚩 [v24.4] 策略調整：若是「木紋」等選型搜尋，則不限定於單一系列，改為顯示前 10 筆符合的產品
  var allItems = [primary].concat(recommendations);
  if (!isSelectionSearch) {
    allItems = allItems.filter(function(item) {
      return String(item[maps.price['中文系列']]) === primarySeries;
    });
  }

  var colFlexImg = maps.price['FLEX圖卡'], colCode = maps.price['編號'], colColor = maps.price['顏色'], colCache = maps.price['FLEX快取']; 
  var pool = {}, codeList = [], seriesOrigin = "", seriesIntroUrl = null; 

  // 🚩 [v24.2] 步驟 A：先行嘗試從快取讀取系列屬性
  for (var i = 0; i < allItems.length; i++) {
    var rawCache = allItems[i][colCache];
    if (rawCache) {
      try {
        var cObj = JSON.parse(rawCache);
        if (cObj.origin && !seriesOrigin) seriesOrigin = cObj.origin;
        if (cObj.introUrl && !seriesIntroUrl) seriesIntroUrl = cObj.introUrl;
      } catch(e) {}
    }
    if (seriesOrigin && seriesIntroUrl) break;
  }

  // 🚩 [v24.2] 步驟 B：遍歷產品並處理快取
  for (var i = 0; i < allItems.length; i++) {
    var item = allItems[i], currentCode = String(item[colCode] || "").trim();
    if (!currentCode) continue;
    var currentColor = String(item[colColor] || "").split('-')[0].trim(); 
    var parentUrl = String(item[colFlexImg] || ""), 
        parentId = (parentUrl.indexOf("folders/") > -1) ? parentUrl.match(/folders\/([\w-]+)/)[1] : "";
    
    var cacheParsed = null;
    if (item[maps.price['FLEX快取']]) {
      try { cacheParsed = JSON.parse(item[maps.price['FLEX快取']]); } catch(e) {}
    }

    var sceneImages = getBestImagesForItem(item, maps, db);

    // 沒有 FLEX圖卡 資料夾也沒有任何圖片來源 → 跳過
    if (!parentId && sceneImages.length === 0) continue;

    if (!pool[currentCode]) { pool[currentCode] = []; codeList.push(currentCode); }

    // 🚩 若為雲端抓取且尚無系列屬性，則掃描一次
    if (sceneImages.length > 0 && !seriesOrigin) {
      if (parentId) {
        var attr = scanFolderForAttributes(parentId);
        seriesOrigin = attr.origin;
        seriesIntroUrl = attr.introUrl;
      }
    }

    // 讀「原廠目錄」欄位（用欄位標題，沒有就空）
    var cUrl = "";
    var catalogIdx = getColumnByName(maps.price, ['原廠目錄']);
    if (catalogIdx !== undefined) {
      cUrl = String(item[catalogIdx] || "").trim();
    }
    // 如果沒有原廠目錄連結，fallback 優先級：FLEX快取 > 雲端資料庫（Drive連結）> 空
    if (!cUrl || !cUrl.includes("http")) {
      cUrl = (cacheParsed && cacheParsed.catalog) ? cacheParsed.catalog : (parentUrl && parentUrl.indexOf("http") > -1 ? parentUrl : "");
    }
    // 自動轉換 Google Drive 連接為直接打開格式
    if (cUrl && cUrl.includes('drive.google.com')) {
      let fileId = cUrl.match(/\/d\/([a-zA-Z0-9\-_]+)/)?.[1];
      if (fileId) {
        cUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
      }
    }
    // 🚩 v675：直接讀第 40 列（單片連結網址）和第 44 列（系列介紹）
    var sUrl = String(item[maps.price['單片連結網址']] || "").trim();
    // fallback：從 FLEX快取的 single 或 Drive 資料夾
    if (!sUrl || !sUrl.includes("http")) {
      sUrl = (cacheParsed && cacheParsed.single) ? cacheParsed.single : (parentId ? getSmartDownloadPath(parentId, currentCode, "") : "");
    }

    var introUrl = String(item[maps.price['系列介紹']] || "").trim();
    // fallback：從 FLEX快取的 intro
    if (!introUrl || !introUrl.includes("http")) {
      introUrl = (cacheParsed && cacheParsed.introUrl) ? cacheParsed.introUrl : "";
    }

    var mfgCatalogUrl = cUrl;
    var driveUrl = parentUrl && parentUrl.indexOf("http") > -1 ? parentUrl : "";
    var fullCodeInfo = currentCode + (currentColor ? " " + currentColor : "");

    // 建立卡片 (🚩 [v24.3] 套用新限制：單一3張 / 系列1張)
    const isSingleQuery = (targetKW !== primarySeries);
    const limit = isSingleQuery ? 3 : 1;
    const currentSeriesName = String(item[maps.price['中文系列']] || primarySeries);

    // 取得產品資訊（產地、尺寸、片/箱）
    var productOrigin = String(item[maps.price['產地']] || "");
    var productSize = String(item[maps.price['尺寸(cm)']] || "");
    var productPcsPerBox = String(item[maps.price['片/箱']] || "");

    if (sceneImages.length > 0) {
      for (var j = 0; j < Math.min(sceneImages.length, limit); j++) {
        const titleSuffix = (isSingleQuery && sceneImages.length > 1) ? (" (" + (j+1) + ")") : "";
        pool[currentCode].push(buildSingleBubble(sceneImages[j], currentSeriesName, fullCodeInfo + titleSuffix, currentCode, sUrl, cUrl, seriesIntroUrl, mfgCatalogUrl, driveUrl, seriesOrigin, productOrigin, productSize, productPcsPerBox, sceneImages.length));
      }
    } else if (parentId) {
      pool[currentCode].push(buildSingleBubble(fetchCoverImageFromFolder(parentId), currentSeriesName, fullCodeInfo, currentCode, sUrl, cUrl, seriesIntroUrl, mfgCatalogUrl, driveUrl, seriesOrigin, productOrigin, productSize, productPcsPerBox, 1));
    }
  }

  var finalBubbles = [], hasMore = true, safetyCounter = 0;
  while (finalBubbles.length < 12 && hasMore && safetyCounter < 100) {
    hasMore = false;
    for (var k = 0; k < codeList.length; k++) {
      if (pool[codeList[k]] && pool[codeList[k]].length > 0) { finalBubbles.push(pool[codeList[k]].shift()); hasMore = true; }
      if (finalBubbles.length >= 12) break;
    }
    safetyCounter++;
  }
  if (finalBubbles.length === 0) return null;
  return { "type": "carousel", "contents": finalBubbles };
}

/** 🚀 影像支援函式 (全量輸出) */
function scanFolderForAttributes(parentId) {
  var result = { origin: "", introUrl: null };
  try {
    var folder = DriveApp.getFolderById(parentId), folderName = folder.getName().toUpperCase();
    if (/SPAIN|SPAN|-ES/i.test(folderName)) result.origin = "🇪🇸 西班牙";
    else if (/ITALY|ITAL|-IT| ITALY/i.test(folderName)) result.origin = "🇮🇹 義大利";
    var files = folder.getFiles();
    while (files.hasNext()) {
      var f = files.next(), fileName = f.getName().toUpperCase();
      if (result.origin === "") { if (/SPAIN|SPAN|-ES/i.test(fileName)) result.origin = "🇪🇸 西班牙"; else if (/ITALY|ITAL|-IT| ITALY/i.test(fileName)) result.origin = "🇮🇹 義大利"; }
      if (fileName.indexOf("系列介紹") > -1) result.introUrl = f.getUrl();
    }
  } catch (e) {}
  return result;
}

function fetchSmartImages(parentId, keywords, code) {
  var urls = [];
  try {
    var folder = DriveApp.getFolderById(parentId);
    // 第一步：掃描子資料夾 (實景、完工等)
    for (var i = 0; i < keywords.length; i++) {
      var subs = folder.getFoldersByName(keywords[i]);
      while (subs.hasNext()) {
        var sub = subs.next();
        var fs = sub.getFiles();
        while (fs.hasNext()) {
          var f = fs.next();
          // 🚩 [v24.3] 強制排他邏輯：過濾掉單片關鍵字
          var fName = f.getName().toUpperCase();
          if (f.getMimeType().indexOf("image/") > -1 && fName.indexOf(code) > -1) {
            if (!/單片|單磚|模面|外箱|BOX|TILE/i.test(fName)) {
               urls.push("https://drive.google.com/thumbnail?id=" + f.getId() + "&sz=w600");
            }
          }
        }
      }
    }
    
    // 第二步：掃描根目錄下帶有「實景」關鍵字的檔案
    if (urls.length < 5) {
      var fs = folder.getFiles();
      while (fs.hasNext()) {
        var f = fs.next(), fName = f.getName().toUpperCase();
        if (f.getMimeType().indexOf("image/") > -1 && fName.indexOf(code) > -1) {
          // 優先挑選檔名有關鍵字的，且避開單片
          if (keywords.some(k => fName.indexOf(k) > -1) && !/單片|單磚|模面|外箱|BOX|TILE/i.test(fName)) {
            var thumb = "https://drive.google.com/thumbnail?id=" + f.getId() + "&sz=w600";
            if (!urls.includes(thumb)) urls.push(thumb);
          }
        }
      }
    }

    // 第三步：若還是沒圖，才考慮一般圖檔 (但依然排除單片)
    if (urls.length === 0) {
      var fs = folder.getFiles();
      while (fs.hasNext()) {
        var f = fs.next(), fName = f.getName().toUpperCase();
        if (f.getMimeType().indexOf("image/") > -1 && fName.indexOf(code) > -1) {
          if (!/單片|單磚|模面|外箱|BOX|TILE/i.test(fName)) {
            urls.push("https://drive.google.com/thumbnail?id=" + f.getId() + "&sz=w600");
          }
        }
      }
    }
  } catch (e) {}
  return urls.filter((val, idx, self) => self.indexOf(val) === idx);
}

/** 🚩 [v24.3] 核心影像研析引擎：最終權重優化版 */
function getBestImagesForItem(item, maps, db) {
  let images = [];
  const currentCode = String(item[maps.price['編號']] || "").toUpperCase();
  const parentId = String(item[maps.price['FLEX圖卡']] || "").match(/folders\/([\w-]+)/)?.[1];
  const rawCache = String(item[maps.price['FLEX快取']] || "");

  // 1. 嘗試從快取讀取
  if (rawCache) {
    try {
      const c = JSON.parse(rawCache);
      if (c.scene && Array.isArray(c.scene) && c.scene.length > 0) return c.scene;
    } catch(e) {}
  }

  // 2. 第一優先：試算表中的「實景1~7」
  const sceneCols = ["實景1", "實景2", "實景3", "實景4", "實景5", "實景6", "實景7"];
  sceneCols.forEach(colName => {
    const colIdx = maps.price[colName];
    if (colIdx !== undefined) {
      let val = String(item[colIdx] || "").trim();
      if (val && val.includes("http")) {
        if (val.includes("drive.google.com")) {
          const id = val.match(/[\w-]{25,}/);
          if (id) val = "https://drive.google.com/thumbnail?id=" + id[0] + "&sz=w600";
        }
        if (!images.includes(val)) images.push(val);
      }
    }
  });

  // 3. 第二優先：掃描 Google Drive 資料夾 (過濾掉單片)
  if (images.length === 0 && parentId) {
    images = fetchSmartImages(parentId, ["實景照", "實蹟圖", "完工照", "02_實景照"], currentCode);
  }

  // 4. 第三優先：試算表其餘欄位 (主圖、網址等保底)
  if (images.length === 0) {
    const backupCols = ["實蹟圖片", "主圖URL", "單片連結網址"];
    backupCols.forEach(colName => {
      const colIdx = maps.price[colName];
      if (colIdx !== undefined) {
        let val = String(item[colIdx] || "").trim();
        if (val && val.includes("http")) {
          if (val.includes("drive.google.com")) {
            const id = val.match(/[\w-]{25,}/);
            if (id) val = "https://drive.google.com/thumbnail?id=" + id[0] + "&sz=w600";
          }
          if (!images.includes(val)) images.push(val);
        }
      }
    });
  }

  // 存入快取 (保底機制：即便沒有圖片也快取，防止重複掃描 Drive)
  if (typeof updateItemCache === 'function') {
    updateItemCache(currentCode, { scene: images.slice(0, 10), updated: new Date().toISOString() });
  }

  return images.filter((val, idx, self) => self.indexOf(val) === idx);
}

function fetchCoverImageFromFolder(parentId) {
  // Legacy support, but we prefer getBestImagesForItem now
  try {
    var files = DriveApp.getFolderById(parentId).getFiles();
    while (files.hasNext()) {
      var file = files.next();
      if (file.getMimeType().indexOf("image/") > -1) return "https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w600";
    }
  } catch (e) {}
  return "https://via.placeholder.com/500?text=No+Image";
}

function buildSingleBubble(imageUrl, seriesName, codeInfo, productCode, singleUrl, catalogUrl, introUrl, mfgCatalogUrl, driveUrl, originTag, origin, size, pcsPerBox, sceneCount) {
  var displayUrl = (imageUrl && imageUrl.indexOf("http") > -1) ? imageUrl : "https://via.placeholder.com/600?text=No+Image";

  // 產地轉換成國旗 emoji
  var countryEmoji = getCountryEmoji(origin || "");
  var seriesWithEmoji = seriesName + " " + countryEmoji;

  var hero = { "type": "image", "url": displayUrl, "size": "full", "aspectRatio": "16:9", "aspectMode": "cover", "action": { "type": "uri", "label": "放大查看", "uri": displayUrl } };

  var foot = [];
  // 按鈕只在有對應內容時才顯示（只要欄位不是空就顯示）
  // 1. 系列介紹 — 只要有 introUrl 就顯示
  if (productCode && introUrl) {
    foot.push({ "type": "button", "style": "secondary", "color": "#FFF8DC", "height": "sm", "action": { "type": "postback", "label": "系列介紹", "data": "t=intro&c=" + productCode, "displayText": productCode + " 系列介紹" } });
  }
  // 2. 原廠目錄 — 只要有 catalogUrl 就顯示
  if (catalogUrl) {
    // 用 postback 觸發後端，由後端透過 message 回覆包含 LIFF 打開 URL 的卡片
    foot.push({ "type": "button", "style": "secondary", "color": "#FFF8DC", "height": "sm", "action": { "type": "postback", "label": "原廠目錄", "data": "t=catalog&c=" + productCode, "displayText": "查看原廠目錄" } });
  }
  // 3. 傳送實景圖 — 只在有實景圖時顯示
  if (productCode && sceneCount && sceneCount > 0) {
    foot.push({ "type": "button", "style": "secondary", "color": "#FFF8DC", "height": "sm", "action": { "type": "postback", "label": "傳送實景圖", "data": "t=scene&c=" + productCode, "displayText": productCode + " 傳送實景圖" } });
  }
  // 4. 模面變化圖 — 只要有 singleUrl 就顯示
  if (productCode && singleUrl) {
    foot.push({ "type": "button", "style": "secondary", "color": "#FFF8DC", "height": "sm", "action": { "type": "postback", "label": "模面變化圖", "data": "t=piece&c=" + productCode, "displayText": productCode + " 模面變化圖" } });
  }
  // 5. 雲端資料庫 — 只要有 driveUrl 就顯示
  if (driveUrl) {
    foot.push({ "type": "button", "style": "secondary", "color": "#FFF8DC", "height": "sm", "action": { "type": "uri", "label": "雲端資料庫", "uri": driveUrl } });
  }

  var bodyContents = [
    { "type": "text", "text": seriesWithEmoji, "weight": "bold", "size": "lg", "wrap": true },
    { "type": "text", "text": codeInfo, "size": "sm", "color": "#555555", "margin": "sm", "wrap": true }
  ];

  // 加下方產品資訊
  if (size || pcsPerBox || sceneCount) {
    var infoText = "";
    if (size) infoText += size;
    if (pcsPerBox) infoText += (infoText ? "  " : "") + pcsPerBox;
    if (sceneCount) infoText += (infoText ? "  " : "") + "實景圖 (" + sceneCount + ")";

    if (infoText) {
      bodyContents.push({
        "type": "text",
        "text": infoText,
        "size": "xs",
        "color": "#999999",
        "margin": "md",
        "wrap": true
      });
    }
  }

  return { "type": "bubble", "size": "mega", "hero": hero, "body": { "type": "box", "layout": "vertical", "contents": bodyContents }, "footer": { "type": "box", "layout": "vertical", "spacing": "sm", "contents": foot } };
}

// 產地轉國旗 emoji
function getCountryEmoji(country) {
  var countryMap = {
    "義大利": "🇮🇹",
    "西班牙": "🇪🇸",
    "葡萄牙": "🇵🇹",
    "土耳其": "🇹🇷",
    "台灣": "🇹🇼",
    "中國": "🇨🇳",
    "日本": "🇯🇵",
    "韓國": "🇰🇷",
    "泰國": "🇹🇭",
    "越南": "🇻🇳",
    "印尼": "🇮🇩",
    "馬來西亞": "🇲🇾"
  };
  return countryMap[country] || "🌍";
}

// 🚩 [v681] 找不到就回空字串，不再兜底死網址 gaoyaci.com，讓呼叫端按無值隱藏按鈕
function getSmartDownloadPath(pId, code, fb) { try { var f = DriveApp.getFolderById(pId), subs = f.getFoldersByName(code); if (subs.hasNext()) return subs.next().getUrl(); var cms = ["單片圖", "模面變化", "單磚圖", "01_單片圖"]; for (var i = 0; i < cms.length; i++) { var cs = f.getFoldersByName(cms[i]); if (cs.hasNext()) return cs.next().getUrl(); } } catch (e) {} return (fb && fb.indexOf("http") > -1) ? fb : ""; }
function getSmartFileUrl(pId, kw, ex, fb) { try { var fs = DriveApp.getFolderById(pId).getFiles(); while (fs.hasNext()) { var fl = fs.next(); if (fl.getName().indexOf(kw) > -1 || fl.getName().toLowerCase().indexOf(ex) > -1) return fl.getUrl(); } } catch (e) {} return (fb && fb.indexOf("http") > -1) ? fb : ""; }
function shuffleArray(arr) { for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; } }

/**
 * 💡 3. 不明指令引導泡泡卡片 (會心一笑辦公室版本)
 */
function buildUnknownGuideBubble(auth) {
  const userName = auth ? (auth.name || "夥伴") : "夥伴";
  return {
    "type": "bubble",
    "size": "mega",
    "header": {
      "type": "box",
      "layout": "vertical",
      "backgroundColor": "#1B1B1D",
      "paddingAll": "15px",
      "contents": [
        {
          "type": "text",
          "text": "💡 小高服務指南 🧱✨",
          "color": "#FFFFFF",
          "weight": "bold",
          "size": "md"
        }
      ]
    },
    "body": {
      "type": "box",
      "layout": "vertical",
      "spacing": "md",
      "contents": [
        {
          "type": "text",
          "text": "哎呀，剛才的輸入小高有些摸不著頭緒...💦",
          "weight": "bold",
          "size": "sm",
          "color": "#333333",
          "wrap": true
        },
        {
          "type": "text",
          "text": "親愛的 " + userName + "，坐辦公室辛苦了！別被小恍神壞了心情～☕️✨ 點選下方快捷按鈕，或是參考下方範例輸入，小高立刻為您辦妥！",
          "size": "xs",
          "color": "#666666",
          "wrap": true
        },
        {
          "type": "separator",
          "margin": "md"
        },
        {
          "type": "box",
          "layout": "vertical",
          "spacing": "xs",
          "margin": "md",
          "contents": [
            {
              "type": "text",
              "text": "💡 常用口語查詢範例：",
              "size": "xs",
              "weight": "bold",
              "color": "#1B1B1D"
            },
            {
              "type": "text",
              "text": "• 查詢庫存：輸入「編號 + 數量」\n  👉 (例：AA61250 50片)",
              "size": "xs",
              "color": "#666666",
              "wrap": true
            },
            {
              "type": "text",
              "text": "• 尋找圖片：輸入「編號 + 圖片」\n  👉 (例：AA61250 圖片)",
              "size": "xs",
              "color": "#666666",
              "wrap": true
            }
          ]
        }
      ]
    },
    "footer": {
      "type": "box",
      "layout": "vertical",
      "spacing": "sm",
      "contents": [
        {
          "type": "button",
          "style": "primary",
          "color": "#1B1B1D",
          "height": "sm",
          "action": {
            "type": "message",
            "label": "🚚 今日配送進度查詢",
            "text": "查貨"
          }
        },
        {
          "type": "button",
          "style": "secondary",
          "height": "sm",
          "action": {
            "type": "message",
            "label": "💎 睡美人精品推薦",
            "text": "睡美人"
          }
        },
        {
          "type": "button",
          "style": "link",
          "height": "sm",
          "action": {
            "type": "message",
            "label": "📖 觀看說明手冊",
            "text": "說明"
          }
        }
      ]
    }
  };
}

/**
 * 🎨 智慧顏色查詢判定
 */
function isColorInput(q, db, maps) {
  if (!q) return false;
  var cleanQ = String(q).trim().toLowerCase();
  if (cleanQ.length < 2) return false; // 避開「白」、「灰」等單字，因為單字已由系統預設關鍵字搜尋處理
  if (cleanQ.indexOf("圖片") > -1 || cleanQ.indexOf("庫存") > -1 || cleanQ.indexOf("照片") > -1) return false;

  var priceData = db.price;
  var priceMap = maps.price;
  var colorIdx = priceMap['顏色'];
  if (colorIdx === undefined || !priceData || priceData.length <= 1) return false;

  for (var i = 1; i < priceData.length; i++) {
    var dbColor = String(priceData[i][colorIdx] || "").trim().toLowerCase();
    if (!dbColor) continue;
    var parts = dbColor.split(/[-/]/);
    if (parts.some(function(p) { return p.trim() === cleanQ; }) || dbColor === cleanQ) {
      return true;
    }
  }
  return false;
}

/**
 * 🧱 智慧系列名稱查詢判定
 * 若輸入完整對應某個「中文系列」名稱（如：冰岩），回傳該系列名稱；否則回傳 null
 */
function isSeriesInput(q, db, maps) {
  if (!q) return null;
  var cleanQ = String(q).trim().toLowerCase();
  if (cleanQ.length < 2) return null;
  if (cleanQ.indexOf("圖片") > -1 || cleanQ.indexOf("庫存") > -1 || cleanQ.indexOf("照片") > -1) return null;

  var priceData = db.price;
  var priceMap = maps.price;
  var seriesIdx = priceMap['中文系列'];
  if (seriesIdx === undefined || !priceData || priceData.length <= 1) return null;

  for (var i = 1; i < priceData.length; i++) {
    var dbSeries = String(priceData[i][seriesIdx] || "").trim();
    if (dbSeries && dbSeries.toLowerCase() === cleanQ) return dbSeries;
  }
  return null;
}

/**
 * 🧱 系列查詢引導卡片（FREE 等級）
 * 顯示該系列代表圖片 + 雲端圖庫連結 + 如何查庫存的指引
 */
function buildSeriesGuideFlex(seriesName, db, maps, auth) {
  var priceData = db.price, priceMap = maps.price;
  var primary = null;
  for (var i = 1; i < priceData.length; i++) {
    if (String(priceData[i][priceMap['中文系列']] || "").trim() === seriesName) { primary = priceData[i]; break; }
  }
  if (!primary) return null;

  var code = String(primary[priceMap['編號']] || "").toUpperCase();
  var parentUrl = String(primary[priceMap['FLEX圖卡']] || "");
  var parentId = (parentUrl.indexOf("folders/") > -1) ? parentUrl.match(/folders\/([\w-]+)/)[1] : "";

  var images = (typeof getBestImagesForItem === 'function') ? getBestImagesForItem(primary, maps, db) : [];
  var imageUrl = images.length > 0 ? images[0] : (parentId ? fetchCoverImageFromFolder(parentId) : "https://via.placeholder.com/600?text=No+Image");

  // 🚩 [v680] 雲端圖庫連結：FLEX圖卡沒有就退回讀「雲端圖片」欄位（兩者是不同欄位）
  var cloudUrl = "";
  if (parentUrl.indexOf("http") > -1) {
    cloudUrl = parentUrl;
  } else {
    var driveImgUrl = String(primary[priceMap['雲端圖片']] || "").trim();
    if (driveImgUrl.indexOf("http") > -1) cloudUrl = driveImgUrl;
  }

  var footerButtons = [
    { "type": "button", "style": "primary", "color": "#1B1B1D", "height": "sm", "action": { "type": "message", "label": "🖼️ 看更多圖片", "text": seriesName + " 圖片" } }
  ];
  // 🚩 [v679] 沒有雲端資料夾連結就不顯示按鈕，禁止用假網址兜底
  if (cloudUrl) {
    footerButtons.push({ "type": "button", "style": "secondary", "height": "sm", "action": { "type": "uri", "label": "📁 雲端圖庫", "uri": cloudUrl } });
  }

  return {
    "type": "bubble",
    "size": "mega",
    "hero": { "type": "image", "url": imageUrl, "size": "full", "aspectRatio": "20:13", "aspectMode": "cover", "action": { "type": "uri", "label": "放大查看", "uri": imageUrl } },
    "body": {
      "type": "box",
      "layout": "vertical",
      "spacing": "md",
      "contents": [
        { "type": "text", "text": "🧱 " + seriesName + " 系列", "weight": "bold", "size": "lg", "wrap": true },
        { "type": "separator", "margin": "md" },
        {
          "type": "text",
          "text": "💡 想查詢庫存嗎？\n請輸入「編號 + 數量」，例如：\n" + code + " 50坪",
          "size": "sm",
          "color": "#666666",
          "wrap": true,
          "margin": "md"
        }
      ]
    },
    "footer": {
      "type": "box",
      "layout": "vertical",
      "spacing": "sm",
      "contents": footerButtons
    }
  };
}

/**
 * 🎨 顏色查詢引導 Flex 卡片
 */
function buildColorGuideFlex(color, auth) {
  const userName = auth ? (auth.name || "夥伴") : "夥伴";
  const userLevel = String(auth ? auth.level : 'free').toLowerCase();
  const isHighLevel = ['sales', 'king', 'queen', 'admin'].includes(userLevel);
  const isPremium = userLevel === 'premium';

  const footContents = [];
  if (isHighLevel || isPremium) {
    footContents.push({
      "type": "button",
      "style": "primary",
      "color": "#1DB446",
      "height": "sm",
      "action": {
        "type": "message",
        "label": "📊 查詢 " + color + " 庫存",
        "text": color + " 庫存"
      }
    });
  }

  footContents.push({
    "type": "button",
    "style": "secondary",
    "height": "sm",
    "action": {
      "type": "message",
      "label": "🖼️ 查看 " + color + " 圖片",
      "text": color + " 圖片"
    }
  });

  return {
    "type": "bubble",
    "size": "mega",
    "header": {
      "type": "box",
      "layout": "vertical",
      "backgroundColor": "#1B1B1D",
      "paddingAll": "15px",
      "contents": [
        {
          "type": "text",
          "text": "🎨 顏色搜尋引導 🧱✨",
          "color": "#FFFFFF",
          "weight": "bold",
          "size": "md"
        }
      ]
    },
    "body": {
      "type": "box",
      "layout": "vertical",
      "spacing": "md",
      "contents": [
        {
          "type": "text",
          "text": "您輸入了顏色：" + color,
          "weight": "bold",
          "size": "sm",
          "color": "#333333",
          "wrap": true
        },
        {
          "type": "text",
          "text": "親愛的 " + userName + "，小高已為您鎖定「" + color + "」色系磁磚。請問您接下來想要進行什麼操作呢？",
          "size": "xs",
          "color": "#666666",
          "wrap": true
        }
      ]
    },
    "footer": {
      "type": "box",
      "layout": "vertical",
      "spacing": "sm",
      "contents": footContents
    }
  };
}


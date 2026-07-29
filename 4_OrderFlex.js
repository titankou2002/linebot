/**
 * 高雅瓷 AI 智能客服 - 2026 審核視覺引擎 (v30.1 - 客戶優先 & 精準紅綠版)
 * 檔案：4_OrderFlex.gs
 * 🚩 【最高開發原則】：
 * 1. 客戶優先：將客戶（公司名）置於首位大字顯示，一眼即見。
 * 2. 精準預警：只要存貨字串包含「不足」，該區塊自動轉為淡紅背景、深紅字、灰按鈕。
 * 3. 清楚清單：垂直排版，支援單品 ✅ 核准，完全對應 5_Order 欄位。
 * 4. 嚴禁縮寫：全量輸出。 [cite: 2026-01-29]
 */

function buildOrderApprovalFlex(auth, caseName, address, codes, sizes, qtys, timeNote, sourceId, status, stockMsg, isShortage, requestId) {
  const codeArr = codes.split(',');
  const sizeArr = sizes.split(',');
  const qtyArr = qtys.split(',');
  
  // 提取客戶公司名稱與業務
  const fullAuthName = String(auth.name || "");
  const companyName = fullAuthName.includes('-') ? fullAuthName.split('-')[0] : "未知客戶";
  const userName = fullAuthName.includes('-') ? fullAuthName.split('-')[1] : fullAuthName;

  const stockMap = {};
  stockMsg.split('|').forEach(s => {
    const p = s.split(':');
    if (p.length === 2) stockMap[p[0]] = p[1];
  });

  const itemContents = [];
  codeArr.forEach((code, i) => {
    const itemSize = sizeArr[i] || sizeArr[0];
    const itemQty = qtyArr[i] || qtyArr[0];
    const currentStockStr = stockMap[code] || "查無";
    
    // 🚩 核心修正：偵測 5_Order 傳來的「不足」或「查無」標記，自動判定為缺貨/異常，以紅字醒目提示！
    const isItemShort = currentStockStr.includes('不足') || currentStockStr.includes('查無'); 

    itemContents.push({
      "type": "box",
      "layout": "horizontal",
      "contents": [
        // 左側：資訊
        {
          "type": "box",
          "layout": "vertical",
          "flex": 4,
          "contents": [
            { "type": "text", "text": code, "weight": "bold", "size": "md", "color": isItemShort ? "#e74c3c" : "#111111" },
            { "type": "text", "text": "尺寸：" + itemSize, "size": "xs", "color": isItemShort ? "#c0392b" : "#888888" },
            { 
              "type": "text", 
              "text": (isItemShort ? "❌ 缺貨：" : "✅ 充足：") + currentStockStr, 
              "size": "xs", 
              "weight": "bold",
              "color": isItemShort ? "#e74c3c" : "#27ae60",
              "margin": "xs" 
            }
          ]
        },
        // 右側：數量與按鈕
        {
          "type": "box",
          "layout": "vertical",
          "flex": 3,
          "contents": [
            { "type": "text", "text": itemQty, "weight": "bold", "size": "md", "color": isItemShort ? "#e74c3c" : "#e67e22", "align": "end" },
            {
              "type": "button",
              "action": {
                "type": "postback",
                "label": "✅ 核准",
                "data": "ac=approveOrderRow&id=" + requestId + "&code=" + code,
                "displayText": "核准保留 " + code
              },
              "style": "primary",
              "color": isItemShort ? "#bdc3c7" : "#27ae60", // 缺貨按鈕變灰色
              "height": "sm",
              "margin": "sm"
            }
          ]
        }
      ],
      "margin": "md",
      "paddingAll": "sm",
      "backgroundColor": isItemShort ? "#fff5f5" : "#fcfcfc", // 缺貨整格帶淡紅背景
      "cornerRadius": "md"
    });

    if (i < codeArr.length - 1) itemContents.push({ "type": "separator", "margin": "md" });
  });

  const bubble = {
    "type": "bubble",
    "header": {
      "type": "box", "layout": "vertical", "backgroundColor": isShortage ? "#e74c3c" : "#27ae60",
      "contents": [{ "type": "text", "text": "📦 保留單審核 (" + status + ")", "color": "#ffffff", "weight": "bold", "size": "md" }]
    },
    "body": {
      "type": "box", "layout": "vertical", "spacing": "sm",
      "contents": [
        // 🚩 戰略改版：客戶公司名稱首位大字化
        { "type": "text", "text": "🏢 客戶：" + companyName, "weight": "bold", "size": "lg", "color": "#111111" },
        { "type": "text", "text": "🏗️ 案名：" + caseName, "weight": "bold", "size": "sm", "color": "#555555", "wrap": true },
        { "type": "text", "text": "📍 地址：" + address, "size": "xs", "color": "#888888", "wrap": true },
        { "type": "separator", "margin": "md" },
        { "type": "box", "layout": "vertical", "contents": itemContents, "margin": "md" },
        { "type": "separator", "margin": "lg" },
        {
          "type": "box",
          "layout": "horizontal",
          "contents": [
            { "type": "text", "text": "👤 申請業務：" + userName, "size": "xs", "color": "#aaaaaa", "flex": 1 },
            { "type": "text", "text": "ID: " + requestId, "size": "xxs", "color": "#eeeeee", "align": "end", "flex": 1 }
          ]
        }
      ]
    },
    "footer": {
      "type": "box", "layout": "horizontal", "spacing": "sm",
      "contents": [
        {
          "type": "button", 
          "style": "secondary", 
          "height": "sm", 
          "color": "#bdc3c7",
          "action": { "type": "postback", "label": "❌ 全部拒絕", "data": "ac=denyOrder&id=" + requestId } 
        }
      ]
    }
  };

  if (timeNote && timeNote !== "未填寫" && timeNote !== "") {
    bubble.body.contents.push({ "type": "text", "text": "⏰ 進場：" + timeNote, "size": "xs", "color": "#aaaaaa", "margin": "xs" });
  }

  return bubble;
}

/**
 * 📦 保留單審核通知（Telegram 純文字 + inline button 版，取代 buildOrderApprovalFlex 的 LINE Flex 卡片）
 * 核准/拒絕動作改走 doGet 網頁連結（ac=approveOrder / denyOrder / approveOrderRow），
 * 連結包成按鈕（Telegram inline_keyboard）而非裸連結，點一下即完成，不需要 LINE。
 * 參數與 buildOrderApprovalFlex 完全一致；回傳 { text, buttons } 供 pushTelegram(text, buttons) 使用。
 */
function buildOrderApprovalTelegramText_(auth, caseName, address, codes, sizes, qtys, timeNote, sourceId, status, stockMsg, isShortage, requestId) {
  const codeArr = codes.split(',');
  const sizeArr = sizes.split(',');
  const qtyArr = qtys.split(',');

  const fullAuthName = String(auth.name || "");
  const companyName = fullAuthName.includes('-') ? fullAuthName.split('-')[0] : "未知客戶";
  const userName = fullAuthName.includes('-') ? fullAuthName.split('-')[1] : fullAuthName;

  const stockMap = {};
  stockMsg.split('|').forEach(s => {
    const p = s.split(':');
    if (p.length === 2) stockMap[p[0]] = p[1];
  });

  const baseUrl = ScriptApp.getService().getUrl();
  const buttons = [];

  let itemLines = "";
  codeArr.forEach((code, i) => {
    const itemSize = sizeArr[i] || sizeArr[0];
    const itemQty = qtyArr[i] || qtyArr[0];
    const currentStockStr = stockMap[code] || "查無";
    const isItemShort = currentStockStr.indexOf('不足') > -1 || currentStockStr.indexOf('查無') > -1;
    itemLines += (isItemShort ? "❌ " : "✅ ") + code + " | 尺寸" + itemSize + " | 數量" + itemQty + " | " + currentStockStr + "\n";

    const approveRowUrl = baseUrl + "?ac=approveOrderRow&id=" + encodeURIComponent(requestId) + "&code=" + encodeURIComponent(code);
    buttons.push([{ text: "✅ 核准 " + code, url: approveRowUrl }]);
  });

  let text = "📦 保留單審核 (" + status + ")\n";
  text += "🏢 客戶：" + companyName + "\n";
  text += "🏗️ 案名：" + caseName + "\n";
  if (address) text += "📍 地址：" + address + "\n";
  text += "👤 業務：" + userName + "\n";
  text += "──────\n";
  text += itemLines;
  text += "──────\n";
  if (timeNote && timeNote !== "未填寫" && timeNote !== "") text += "⏰ 進場：" + timeNote + "\n";
  text += "🆔 單號：" + requestId;

  const approveAllUrl = baseUrl + "?ac=approveOrder&id=" + encodeURIComponent(requestId);
  const denyAllUrl = baseUrl + "?ac=denyOrder&id=" + encodeURIComponent(requestId);
  buttons.push([
    { text: "✅ 核准整筆單", url: approveAllUrl },
    { text: "❌ 拒絕整筆單", url: denyAllUrl }
  ]);

  return { text: text, buttons: buttons };
}

/**
 * 📸 OCR 手寫單確認卡 (多品項版)
 * - 高信心品項顯示 ▫️，低信心顯示 ⚠️ 紅字
 * - footer 兩顆按鈕：確認送出 / 取消
 */
function buildOCRConfirmFlex(ocrResult, cacheKey) {
  const projectName  = ocrResult.project_name || '(未填案名)';
  const items        = ocrResult.items || [];
  const hasUncertain = items.some(function(i) { return i.uncertain; });

  // 品項列
  const itemRows = [];
  items.forEach(function(item) {
    const bad  = !!item.uncertain;
    const code = String(item.product_code || '?').toUpperCase();
    const qty  = String(item.quantity || '?') + (item.unit || '坪');
    itemRows.push({
      type: 'box', layout: 'horizontal',
      paddingAll: '7px',
      backgroundColor: bad ? '#1f0808' : '#121212',
      cornerRadius: '6px', margin: 'sm',
      contents: [
        { type: 'text', text: bad ? '⚠️' : '▫️', size: 'sm', flex: 0 },
        { type: 'text', text: code, size: 'sm', weight: 'bold',
          color: bad ? '#e74c3c' : '#ffffff', flex: 4, margin: 'sm' },
        { type: 'text', text: qty, size: 'sm', align: 'end',
          color: bad ? '#ff6b6b' : '#a8a8a8', flex: 2 }
      ]
    });
  });

  // 警示框（有疑慮時才顯示）
  const warnBlock = (hasUncertain || ocrResult.issues) ? [{
    type: 'box', layout: 'vertical',
    backgroundColor: '#1e1200', cornerRadius: '6px',
    paddingAll: '10px', margin: 'md',
    contents: [{
      type: 'text', size: 'xs', color: '#ffaa44', wrap: true,
      text: '⚠️ ' + (ocrResult.issues || '標示 ⚠️ 的品項辨識有疑慮，確認後再送出')
    }]
  }] : [];

  return {
    type: 'bubble', size: 'kilo',
    header: {
      type: 'box', layout: 'vertical',
      backgroundColor: '#000000', paddingAll: '16px',
      contents: [
        { type: 'text', text: '📸 手寫單辨識結果',
          color: '#ffffff', weight: 'bold', size: 'md' },
        { type: 'text', text: '確認無誤後請點「確認送出」',
          color: '#666666', size: 'xs', margin: 'xs' }
      ]
    },
    body: {
      type: 'box', layout: 'vertical',
      backgroundColor: '#0a0a0a', paddingAll: '14px',
      contents: [
        // 案名行
        {
          type: 'box', layout: 'horizontal', margin: 'none',
          contents: [
            { type: 'text', text: '案名', size: 'xs', color: '#666666', flex: 2 },
            { type: 'text', text: projectName, size: 'sm', weight: 'bold',
              color: '#ffffff', flex: 5, wrap: true }
          ]
        },
        { type: 'separator', margin: 'md', color: '#222222' },
        // 欄位標頭
        {
          type: 'box', layout: 'horizontal', margin: 'sm',
          contents: [
            { type: 'text', text: '品號', size: 'xxs', color: '#444444', flex: 4 },
            { type: 'text', text: '數量', size: 'xxs', color: '#444444', flex: 2, align: 'end' }
          ]
        },
        // 品項列
        ...itemRows,
        // 警示框
        ...warnBlock
      ]
    },
    footer: {
      type: 'box', layout: 'vertical',
      backgroundColor: '#000000', paddingAll: '12px', spacing: 'sm',
      contents: [
        // 確認送出（LINE 綠色漸層）
        {
          type: 'box', layout: 'vertical',
          background: { type: 'linearGradient', angle: '90deg',
            startColor: '#06C755', endColor: '#04a042' },
          cornerRadius: '16px', paddingAll: '10px',
          action: { type: 'postback', label: '✅ 確認送出',
            data: 'ac=confirm_ocr&key=' + cacheKey,
            displayText: '確認送出保留單' },
          contents: [{
            type: 'text', text: '✅ 確認送出保留單',
            color: '#ffffff', weight: 'bold', size: 'sm', align: 'center'
          }]
        },
        // 取消
        {
          type: 'button', style: 'secondary', height: 'sm',
          action: { type: 'postback', label: '❌ 取消',
            data: 'ac=cancel_ocr&key=' + cacheKey,
            displayText: '取消這次辨識' }
        }
      ]
    }
  };
}

/** 報到 UI (全量輸出) */
function buildUserApprovalFlex(nameInfo, userId, sourceId) {
  var dataStr = "ac=approveUser&bn=" + encodeURIComponent(nameInfo) + "&uid=" + userId;
  return {
    "type": "bubble",
    "header": {
      "type": "box", "layout": "vertical", "backgroundColor": "#2980b9",
      "contents": [{ "type": "text", "text": "🔑 新使用者權限申請", "color": "#ffffff", "weight": "bold", "size": "md" }]
    },
    "body": {
      "type": "box", "layout": "vertical", "spacing": "sm",
      "contents": [
        { "type": "text", "text": "👤 申請名稱：" + nameInfo, "weight": "bold", "size": "md" },
        { "type": "text", "text": "🆔 LINE ID：" + userId, "size": "xs", "color": "#aaaaaa" }
      ]
    },
    "footer": {
      "type": "box", "layout": "horizontal", "spacing": "sm",
      "contents": [
        { "type": "button", "style": "primary", "color": "#2980b9", "height": "sm", "action": { "type": "postback", "label": "✅ 准許加入", "data": dataStr } },
        { "type": "button", "style": "secondary", "height": "sm", "action": { "type": "postback", "label": "❌ 拒絕", "data": "ac=denyUser" } }
      ]
    }
  };
}

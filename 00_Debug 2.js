/**
 * 高雅瓷 AI 智能客服 - 診斷與測試工具
 * 檔案：00_Debug.gs
 */

/**
 * 🚩 [一次性] 設定 TELEGRAM_CHAT_ID（「高雅瓷公佈欄／全員工公佈欄」群組）
 * 用法：在 GAS 編輯器選擇此函式並按「執行」一次即可，執行後可刪除。
 */
function _setTgChatId() {
  setTelegramChatId('-5042638784');
}

/**
 * 🚩 [測試] 確認 Telegram 通知設定正確
 * 用法：先執行 setTelegramConfig() 和 setTelegramChatId('群組chat_id') 設定完成後，
 * 在 GAS 編輯器選擇此函式並按「執行」，確認 Telegram 群組有收到測試訊息。
 */
function testTelegramPush() {
  const token = PropertiesService.getScriptProperties().getProperty('TELEGRAM_BOT_TOKEN');
  const chatId = PropertiesService.getScriptProperties().getProperty('TELEGRAM_CHAT_ID');
  console.log('TELEGRAM_BOT_TOKEN: ' + (token ? 'FOUND (結尾 ' + token.slice(-5) + ')' : 'NOT FOUND'));
  console.log('TELEGRAM_CHAT_ID: ' + (chatId ? chatId : 'NOT FOUND'));

  if (!token || !chatId) {
    console.warn('⚠️ 請先執行 setTelegramConfig() 與 setTelegramChatId("群組chat_id")');
    return;
  }

  const res = pushTelegram('✅ 測試訊息：高雅瓷 AI 機器人 Telegram 通知設定成功！');
  if (res) {
    console.log('HTTP ' + res.getResponseCode() + '：' + res.getContentText());
  } else {
    console.error('pushTelegram 回傳 null，請檢查 Log。');
  }
}

/**
 * 🚩 [測試] 手動測試每日業績戰報推播（略過 dailyPerformanceAutoPush 內建的
 * 週末/假日跳過檢查，方便隨時測試 Telegram 是否有收到）
 * 用法：在 GAS 編輯器選擇此函式並按「執行」，正式排程仍是 dailyPerformanceAutoPush()。
 */
function testDailyPerformancePush() {
  const report = getStrategicPerformance(null);
  console.log('報表內容：\n' + report);

  if (report.startsWith('⚠️')) {
    console.error('報表生成失敗，未送出 Telegram：' + report);
    return;
  }

  const res = pushTelegram(report);
  if (res) {
    console.log('HTTP ' + res.getResponseCode() + '：已送出至 Telegram。');
  } else {
    console.error('pushTelegram 回傳 null，請檢查 Log。');
  }
}

/**
 * 🚩 [一次性] 觸發 Drive 讀取授權
 * 加入 drive.readonly scope 後，必須從編輯器執行此函式一次，
 * 讓 Google 跳出授權視窗。授權完成後 Postback 按鈕（系列介紹/模面變化圖）才能正常讀取 Drive。
 */
function authorizeDriveAccess() {
  try {
    var rootFolder = DriveApp.getRootFolder();
    console.log('✅ Drive 授權成功！根目錄名稱：' + rootFolder.getName());
  } catch (e) {
    console.error('❌ Drive 授權失敗：' + e);
  }
}

/**
 * 🚩 [一次性] 設定 GEMINI_API_KEY
 * 用法：把下面 'PASTE_YOUR_KEY_HERE' 換成你申請到的 Gemini API Key，
 * 在 GAS 編輯器選擇此函數並按「執行」一次即可。
 * 設定完成後，請務必把這個函數整個刪除（避免金鑰留在程式碼裡）。
 */
function setGeminiApiKeyOnce() {
  const KEY = 'PASTE_YOUR_KEY_HERE';
  if (KEY === 'PASTE_YOUR_KEY_HERE') {
    console.log('⚠️ 請先把 KEY 換成你的 Gemini API Key 再執行！');
    return;
  }
  PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', KEY);
  console.log('✅ 已設定 GEMINI_API_KEY，結尾 5 碼：' + KEY.slice(-5));
}

/**
 * 🚩 [一次性] 清理已移除「點餐功能」遺留的 Script Properties 與觸發器
 * 用法：在 GAS 編輯器選擇此函數並按「執行」一次即可，可重複執行。
 * 會清除：ACTIVE_LUNCH_GROUP、所有 LUNCH_ 開頭的屬性，以及 lunchReminder_10min/20min 觸發器。
 */
function cleanupLunchLeftovers() {
  const scriptProps = PropertiesService.getScriptProperties();
  const all = scriptProps.getProperties();
  let removedProps = 0;

  Object.keys(all).forEach(function(key) {
    if (key === 'ACTIVE_LUNCH_GROUP' || key.indexOf('LUNCH_') === 0) {
      scriptProps.deleteProperty(key);
      removedProps++;
      console.log('已刪除屬性：' + key);
    }
  });

  let removedTriggers = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    const fn = t.getHandlerFunction();
    if (fn === 'lunchReminder_10min' || fn === 'lunchReminder_20min') {
      ScriptApp.deleteTrigger(t);
      removedTriggers++;
      console.log('已刪除觸發器：' + fn);
    }
  });

  console.log('✅ 完成！共刪除 ' + removedProps + ' 個屬性、' + removedTriggers + ' 個觸發器。');
}

/**
 * 🚩 [一次性] 清理舊版「LINE使用者ID_日期」格式的過期計數屬性
 * 用法：在 GAS 編輯器選擇此函數並按「執行」一次即可，可重複執行。
 * 這些屬性格式為 U + 32碼英數字 + _ + 日期數字（例如 U00e3fcb..._202601xx），
 * 是舊版功能留下的每日計數器，目前程式碼已無任何讀寫，可安全清除。
 * 清除後可釋放屬性數量上限，讓「指令碼屬性」頁面恢復可新增狀態。
 */
function cleanupLegacyUserDateProperties() {
  const scriptProps = PropertiesService.getScriptProperties();
  const all = scriptProps.getProperties();
  const pattern = /^(U[a-f0-9]{32}_|limit_U[a-f0-9]{32}|newfriend_U[a-f0-9]{32}|welcome_U[a-f0-9]{32})/i;
  let removed = 0;

  Object.keys(all).forEach(function(key) {
    if (pattern.test(key)) {
      scriptProps.deleteProperty(key);
      removed++;
      console.log('已刪除屬性：' + key);
    }
  });

  console.log('✅ 完成！共刪除 ' + removed + ' 個舊版每日計數屬性。');
}

/**
 * 🚩 [一次性] 設定 TELEGRAM_BOT_TOKEN
 * 用法：在 GAS 編輯器選擇此函數並按「執行」一次即可（Token 已內建，不用改）。
 */
function setTelegramConfig() {
  const TOKEN = '8665549878:AAH3_HiXF6rZAbiGfs3buIkIYW8-i4a5tMM';
  PropertiesService.getScriptProperties().setProperty('TELEGRAM_BOT_TOKEN', TOKEN);
  console.log('✅ 已設定 TELEGRAM_BOT_TOKEN，結尾 5 碼：' + TOKEN.slice(-5));
}

/**
 * 🚩 [一次性] 設定 TELEGRAM_CHAT_ID（通知要推送的 Telegram 群組）
 * 用法：把 @Titankou2002_bot 加入目標群組後，開啟
 * https://api.telegram.org/bot8665549878:AAH3_HiXF6rZAbiGfs3buIkIYW8-i4a5tMM/getUpdates
 * 找到群組的 chat.id（通常是負數），填入下方參數後在 GAS 編輯器執行。
 */
function setTelegramChatId(chatId) {
  if (!chatId) {
    console.log('⚠️ 請帶入群組 chat_id，例如 setTelegramChatId("-1001234567890")');
    return;
  }
  PropertiesService.getScriptProperties().setProperty('TELEGRAM_CHAT_ID', String(chatId));
  console.log('✅ 已設定 TELEGRAM_CHAT_ID：' + chatId);
}

function testBotSetup() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('LINE_CHANNEL_ACCESS_TOKEN');
  const ssId = '1G5q-GixMWSdJJeF8ZiXWMOfrx4FMobER25jNc8m4Zds';
  
  console.log("--- 1. Script Properties ---");
  console.log("LINE_CHANNEL_ACCESS_TOKEN: " + (token ? "FOUND (Ends with " + token.slice(-5) + ")" : "NOT FOUND"));
  
  console.log("--- 2. Spreadsheet Access ---");
  try {
    const ss = SpreadsheetApp.openById(ssId);
    console.log("Spreadsheet Access: SUCCESS (" + ss.getName() + ")");
    const sheets = ss.getSheets().map(s => s.getName());
    console.log("Available Sheets: " + sheets.join(", "));
  } catch (e) {
    console.error("Spreadsheet Access: FAILED - " + e);
  }
  
  console.log("--- 3. LINE API Connectivity ---");
  if (token) {
    try {
      const url = 'https://api.line.me/v2/bot/info';
      const res = UrlFetchApp.fetch(url, {
        headers: { 'Authorization': 'Bearer ' + token },
        muteHttpExceptions: true
      });
      console.log("LINE API Status: " + res.getResponseCode());
      console.log("LINE API Response: " + res.getContentText());
    } catch (e) {
      console.error("LINE API Check: FAILED - " + e);
    }
  } else {
    console.warn("LINE API Check: SKIPPED (No Token)");
  }
}

function testPerformance() {
  try {
    console.log("--- Testing getStrategicPerformance('潘右森') ---");
    const result = getStrategicPerformance('潘右森');
    console.log("Result: " + result);
  } catch(e) {
    console.error("FAILED: " + e + "\nStack: " + e.stack);
  }
}

function benchmarkRequest() {
  const start = Date.now();
  
  const wl = getWhitelistSheet();
  console.log("Whitelist loaded in " + (Date.now() - start) + "ms");
  
  const t1 = Date.now();
  const price = getPriceSheet();
  console.log("Price list loaded in " + (Date.now() - t1) + "ms");
  
  const t2 = Date.now();
  const stock = getStockSheet();
  console.log("Stock loaded in " + (Date.now() - t2) + "ms");
  
  const t3 = Date.now();
  const main = getMainSheet();
  console.log("Main reservations loaded in " + (Date.now() - t3) + "ms");
  
  const t4 = Date.now();
  const intent = aiParseUserIntent("36033 10坪");
  console.log("AI NLP intent query completed in " + (Date.now() - t4) + "ms. Intent: " + JSON.stringify(intent));
  
  console.log("Total benchmark execution time: " + (Date.now() - start) + "ms");
}

function testNewFeatures() {
  console.log("--- 1. Testing Sales Contact Resolution ---");
  const mockAuth1 = {
    userId: "Umock123",
    name: "客戶A",
    salesID: "謝博皓"
  };
  const mockAuth2 = {
    userId: "Umock456",
    name: "客戶B",
    salesID: "倉庫"
  };
  const mockAuth3 = {
    userId: "Umock789",
    name: "客戶C",
    salesID: "U0185f9abbdc83f9abccdeef012345678"
  };

  try {
    const contact1 = resolveSalesContactForAuth(mockAuth1, [], {});
    console.log("Resolved 謝博皓:", JSON.stringify(contact1));

    const contact2 = resolveSalesContactForAuth(mockAuth2, [], {});
    console.log("Resolved 倉庫:", JSON.stringify(contact2));

    const contact3 = resolveSalesContactForAuth(mockAuth3, [], {});
    console.log("Resolved Direct LINE ID:", JSON.stringify(contact3));
  } catch(e) {
    console.error("resolveSalesContactForAuth Test Failed:", e);
  }

  console.log("--- 2. Testing runAnalytics weekly analysis (7 days) ---");
  try {
    const report = runAnalytics(7);
    console.log("Weekly Report:", JSON.stringify(report));
  } catch(e) {
    console.error("runAnalytics Test Failed:", e);
  }
}

/**
 * 🚩 測試 Postback 流程 — 診斷模面變化圖/系列介紹按鈕
 * 用法：編輯下方 productCode 變數，改成實際要測試的產品編號（例如 'RC612110'），
 * 然後在 GAS 編輯器選擇此函數並按「執行」。
 * 檢查 Execution Log 下方的輸出，確認：
 * 1. Sheet 數據能否讀取
 * 2. 編號是否找到
 * 3. 實景圖/模面變化圖/系列介紹 URL 是否被成功提取
 */
function testPostbackDiagnostics() {
  var productCode = "RC612110";  // ← 改成要測試的編號
  console.log("========== POSTBACK DIAGNOSTIC TEST: " + productCode + " ==========");

  // 模擬呼叫 buildImageDataFromSheet_
  console.log("[TEST] 開始診斷流程...");
  var result = buildImageDataFromSheet_(productCode);

  console.log("[TEST] ===== 診斷結果 =====");
  if (!result) {
    console.error("[TEST] ❌ buildImageDataFromSheet_ 返回 null");
    console.log("[TEST] 可能原因：");
    console.log("[TEST]   - Sheet 讀取失敗");
    console.log("[TEST]   - 編號「" + productCode + "」不存在");
    console.log("[TEST]   - 欄位對應錯誤");
    return;
  }

  console.log("[TEST] ✅ 成功讀取到圖片資料");
  console.log("[TEST] 實景圖：" + (result.scene && result.scene.length > 0 ? result.scene.length + " 張" : "無"));
  if (result.scene && result.scene.length > 0) {
    result.scene.forEach(function(url, idx) {
      console.log("[TEST]   [" + (idx+1) + "] " + url.substring(0, 100) + "...");
    });
  }

  console.log("[TEST] 模面變化圖：" + (result.piece && result.piece.length > 0 ? result.piece.length + " 張" : "無"));
  if (result.piece && result.piece.length > 0) {
    result.piece.forEach(function(url, idx) {
      console.log("[TEST]   [" + (idx+1) + "] " + url.substring(0, 100) + "...");
    });
  }

  console.log("[TEST] 系列介紹：" + (result.intro ? "有" : "無"));
  if (result.intro) {
    console.log("[TEST]   " + result.intro.substring(0, 100) + "...");
  }

  console.log("[TEST] ========== 診斷完成 ==========");
}


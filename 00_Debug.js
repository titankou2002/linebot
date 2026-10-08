/**
 * 高雅瓷 AI 智能客服 - 診斷與測試工具
 * 檔案：00_Debug.gs
 */

/**
 * 🚩 [診斷] 檢查某編號在保留單（db.main）裡的入倉日期1/2、數量1/2 實際內容
 * 用法：把下方 testCode 改成要查的編號，在 GAS 編輯器選擇此函式並按「執行」，
 * 確認到貨資訊消失是因為保留單真的沒填，還是程式判斷有問題。
 */
function debugCheckArrivalInfo(testCodeArg) {
  const testCode = testCodeArg || 'ST61293';
  const lines = [];
  const log = (s) => { console.log(s); lines.push(s); };

  const mainData = getMainSheet();
  const mainMap = getHeaderMap(mainData);
  log('保留單（db.main）表頭：' + JSON.stringify(Object.keys(mainMap)));

  const idxCode = mainMap['編號'];
  const matched = [];
  for (let i = 1; i < mainData.length; i++) {
    const rowCode = String(mainData[i][idxCode] || '').toUpperCase().trim();
    // 🚩 用 includes 比對，才能抓到「ST61293-期」這種帶後綴的列（跟正式程式碼的比對邏輯一致）
    if (rowCode.includes(testCode.toUpperCase())) matched.push({ rowIdx: i, row: mainData[i] });
  }

  log('===== ' + testCode + ' 在保留單（db.main）裡符合的列數：' + matched.length + ' =====');
  log('⚠️ 正式程式碼用 .find() 只會抓「第一筆」，也就是下面第 1 筆，其餘都是被忽略的');
  const cols = ['編號', '數量', '入倉日期1', '數量1', '入倉日期2', '數量2', '客戶', '案名', '保留日期'];
  matched.forEach((m, idx) => {
    log('--- 第 ' + (idx + 1) + ' 筆（db.main 索引 ' + m.rowIdx + '）' + (idx === 0 ? ' 👈 這筆才是正式程式碼會用到的' : '') + ' ---');
    cols.forEach(col => {
      const idxCol = mainMap[col];
      if (idxCol === undefined) {
        log(col + '：⚠️ 欄位不存在');
        return;
      }
      const val = m.row[idxCol];
      log(col + '：' + (val instanceof Date ? val.toISOString() : (val === '' || val === null || val === undefined ? '(空白)' : val)));
    });
  });
  return lines.join('\n');
}

/**
 * 🚩 [診斷] 掃描整本編號價目表，統計每個圖片相關欄位的實際填寫率
 * 用法：在 GAS 編輯器選擇此函式並按「執行」，Log 會印出每個欄位有值的列數/總列數/百分比，
 * 用真實數字決定哪些欄位真的沒人在填、可以刪掉。
 */
function debugScanImageColumnFillRate() {
  const priceData = getPriceSheet();
  const priceMap = getHeaderMap(priceData);
  const totalRows = priceData.length - 1;

  const checkCols = [
    '雲端圖片', 'FLEX圖卡', 'FLEX快取',
    '實景1', '實景2', '實景3', '實景4', '實景5', '實景6', '實景7',
    'R2_實景1', 'R2_實景2', 'R2_實景3', 'R2_實景4', 'R2_實景5', 'R2_實景6', 'R2_實景7',
    '單片1', '單片2', '單片3', '單片4', '單片5', '單片6', '單片7', '單片8', '單片9',
    '主圖URL', '單片連結網址', '原廠目錄', '系列介紹',
    'R2_雲端圖片', 'R2_單片連結網址', 'R2_系列介紹'
  ];

  console.log('===== 編號價目表圖片欄位填寫率（共 ' + totalRows + ' 列）=====');
  checkCols.forEach(col => {
    const idx = priceMap[col];
    if (idx === undefined) {
      console.log(col + '：⚠️ 欄位不存在於表頭');
      return;
    }
    let filled = 0;
    for (let i = 1; i < priceData.length; i++) {
      if (String(priceData[i][idx] || '').trim() !== '') filled++;
    }
    const pct = totalRows > 0 ? Math.round((filled / totalRows) * 1000) / 10 : 0;
    console.log(col + '：' + filled + ' / ' + totalRows + '（' + pct + '%）');
  });
}

/**
 * 🚩 [一次性] 設定 TELEGRAM_CHAT_ID（「高雅瓷公佈欄／全員工公佈欄」群組）
 * 用法：在 GAS 編輯器選擇此函式並按「執行」一次即可，執行後可刪除。
 */
function _setTgChatId() {
  setTelegramChatId('-5042638784');
}

/**
 * 🚩 [診斷] 檢查某編號的所有圖片相關欄位實際內容，找出到底缺哪一欄
 * 用法：把下方 testCode 改成要查的編號，在 GAS 編輯器選擇此函式並按「執行」，
 * 看 Log 印出每個欄位是否有值，就能確定 getBestImagesForItem() 抓不到圖的真正原因。
 */
function debugCheckImageColumns() {
  const testCode = 'RO612122';

  const priceData = getPriceSheet();
  const priceMap = getHeaderMap(priceData);
  const idxCode = priceMap['編號'];

  let row = null;
  for (let i = 1; i < priceData.length; i++) {
    if (String(priceData[i][idxCode] || '').toUpperCase().trim() === testCode) {
      row = priceData[i];
      break;
    }
  }

  if (!row) {
    console.log('❌ 在編號價目表找不到編號：' + testCode);
    return;
  }

  const checkCols = [
    '雲端圖片', 'FLEX圖卡', 'FLEX快取',
    '實景1', '實景2', '實景3', '實景4', '實景5', '實景6', '實景7',
    '實蹟圖片', '主圖URL', '單片連結網址',
    '原廠目錄', '系列介紹', 'R2_系列介紹'
  ];

  console.log('===== ' + testCode + ' 圖片相關欄位檢查 =====');
  checkCols.forEach(col => {
    const idx = priceMap[col];
    if (idx === undefined) {
      console.log(col + '：⚠️ 欄位不存在於表頭');
      return;
    }
    const val = String(row[idx] || '').trim();
    console.log(col + '：' + (val ? val : '(空白)'));
  });

  console.log('===== getBestImagesForItem() 實際回傳結果 =====');
  const db = { price: priceData };
  const maps = { price: priceMap };
  const images = getBestImagesForItem(row, maps, db);
  console.log('抓到 ' + images.length + ' 張圖：' + JSON.stringify(images));
}

/**
 * 🚩 [測試] 確認今友利庫存讀取與格式正確
 * 用法：在 GAS 編輯器選擇此函式並按「執行」，看 Log 輸出的內容跟 LINE 收到的格式一致。
 */
function testJinYouLiInventory() {
  const raw = getJinYouLiSheetData_();
  console.log('原始資料筆數（含表頭）：' + raw.length);
  if (raw.length > 0) console.log('表頭：' + JSON.stringify(raw[0]));

  const result = handleJinYouLiInventory_();
  console.log('---- 組出的回覆內容 ----\n' + result);
}

/**
 * 🚩 [測試] 確認單編號查詢會正確合併今友利庫存
 * 用法：把下方 testCode 改成要測試的編號（例如今友利表裡有的 'D101'），
 * 在 GAS 編輯器選擇此函式並按「執行」，比對 Log 印出的合併前後數字。
 */
function testJinYouLiMergeInventory() {
  const testCode = 'D101';

  const jy = getJinYouLiInventoryForCode_(testCode);
  console.log('今友利表查到的 ' + testCode + '：' + (jy ? JSON.stringify(jy) : '找不到'));

  const mockAuth = { allowed: true, level: 'king', name: '測試-高大', userId: 'mock' };
  const dbFull = {
    price: getPriceSheet(),
    wl: getWhitelistSheet(),
    stock: getStockSheet(),
    main: getMainSheet()
  };
  const mapsFull = {
    price: getHeaderMap(dbFull.price),
    wl: getHeaderMap(dbFull.wl),
    stock: getHeaderMap(dbFull.stock),
    main: getHeaderMap(dbFull.main)
  };

  const result = handleInventorySearch(testCode, null, null, dbFull, mapsFull, mockAuth, false);
  if (typeof result === 'object' && result !== null) {
    console.log('---- 回傳為 Flex 圖卡（代表有帶入今友利產品圖）----');
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('---- 回傳為純文字（代表沒有今友利圖片，或非今友利編號）----\n' + result);
  }
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

/**
 * 🔍 清查各業務的私人 Telegram chat id（私人 chat id = 用戶 user id）
 * 1. 列「高雅瓷公佈欄」群組管理員（管理員 user id 可直接當私人 chat id）
 * 2. 撈最近 getUpdates 出現過的對話（含私聊）
 * 結果輸出到執行記錄（Logs），請手動把各業務的 user id 填進 系統設定 的 telegram 欄位。
 * ⚠️ 若某業務沒出現：請他先對機器人傳一句話（例如 /start），再重跑本函式。
 */
function dumpTelegramContacts() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('TELEGRAM_BOT_TOKEN');
  const groupId = props.getProperty('TELEGRAM_CHAT_ID');
  if (!token) { console.log('⚠️ 未設定 TELEGRAM_BOT_TOKEN'); return; }

  const rows = [['來源', 'chat id', 'user id', '名稱', 'username', '時間']];
  const seen = new Set();

  // 1. 群組管理員（user.id = 私人 chat id）
  if (groupId) {
    try {
      const r = UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/getChatAdministrators?chat_id=${encodeURIComponent(groupId)}`, { muteHttpExceptions: true });
      const j = JSON.parse(r.getContentText());
      (j.ok && j.result ? j.result : []).forEach(a => {
        const u = a.user || {};
        const id = String(u.id || '');
        if (!id || seen.has('u' + id)) return;
        seen.add('u' + id);
        rows.push(['群組管理員', '', id, u.first_name || '', u.username || '', '']);
      });
    } catch (e) { console.error('getChatAdministrators 失敗：' + e); }
  }

  // 2. getUpdates 近期對話
  try {
    const r = UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=100`, { muteHttpExceptions: true });
    const j = JSON.parse(r.getContentText());
    (j.ok && j.result ? j.result : []).forEach(up => {
      const msg = up.message || up.channel_post ||
        (up.callback_query && (up.callback_query.message || up.callback_query.from)) || null;
      if (!msg || !msg.chat) return;
      const key = 'c' + String(msg.chat.id);
      if (seen.has(key)) return;
      seen.add(key);
      const u = msg.from || {};
      const timeStr = msg.date
        ? Utilities.formatDate(new Date(msg.date * 1000), 'GMT+8', 'yyyy/MM/dd HH:mm')
        : '';
      rows.push([
        msg.chat.type,
        String(msg.chat.id),
        u.id ? String(u.id) : '',
        u.first_name || '',
        u.username || '',
        timeStr
      ]);
    });
  } catch (e) { console.error('getUpdates 失敗：' + e); }

  // 刪除舊的「TG聯絡人清查」分頁（資料已手動併入系統設定，不再另建分頁）
  try {
    const ss = getSpreadsheetInstance();
    const old = ss.getSheetByName('TG聯絡人清查');
    if (old) ss.deleteSheet(old);
  } catch (e) { console.error('刪除舊 TG聯絡人清查 分頁失敗：' + e); }

  rows.forEach(r => console.log(r.join(' | ')));
  console.log('✅ 清查完成，共 ' + (rows.length - 1) + ' 筆。請把各業務的 user id 填進 系統設定 的 telegram 欄位。');
}

/**
 * ✨ 自動抓 id：掃描 getUpdates 中「私訊過機器人」的對話，
 * 比對訊息文字/暱稱是否包含該業務名字（姓名/稱職），自動填入 系統設定 的 telegram 欄位。
 * 使用方法：請每個業務私訊機器人一句話（例如打自己的名字），然後執行本函式。
 */
function syncTelegramContactsFromUpdates() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('TELEGRAM_BOT_TOKEN');
  if (!token) { console.log('⚠️ 未設定 TELEGRAM_BOT_TOKEN'); return; }

  const chats = {};
  try {
    const r = UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=100`, { muteHttpExceptions: true });
    const j = JSON.parse(r.getContentText());
    (j.ok && j.result ? j.result : []).forEach(up => {
      const msg = up.message || up.channel_post || (up.callback_query && (up.callback_query.message || up.callback_query.from));
      if (!msg || !msg.chat || msg.chat.type !== 'private') return;
      const id = String(msg.chat.id);
      if (!chats[id]) {
        chats[id] = { texts: [], first: (msg.from && msg.from.first_name) || '', username: (msg.from && msg.from.username) || '' };
      }
      if (msg.text) chats[id].texts.push(String(msg.text));
    });
  } catch (e) { console.error('getUpdates 失敗：' + e); return; }

  if (Object.keys(chats).length === 0) {
    console.log('⚠️ 沒有找到任何私訊紀錄。請各業務先私訊機器人再重跑。');
    return;
  }

  const ss = getSpreadsheetInstance();
  const sh = ss.getSheetByName('系統設定');
  if (!sh) { console.log('⚠️ 找不到系統設定分頁'); return; }
  const data = sh.getDataRange().getValues();
  const map = getHeaderMap(data);
  const nameCol = map['姓名/稱謂'] !== undefined ? map['姓名/稱謂'] : 5;
  const tgKey = Object.keys(map).find(k => k.toLowerCase().replace(/\s+/g, '') === 'telegram');
  const tgCol = tgKey !== undefined ? map[tgKey] : -1;
  if (tgCol < 0) { console.log('⚠️ 找不到 telegram 欄位'); return; }

  let filled = 0;
  for (let i = 1; i < data.length; i++) {
    const bizName = String(data[i][nameCol] || '').trim();
    if (!bizName) continue;
    let matchId = '';
    for (const id in chats) {
      const c = chats[id];
      const texts = c.texts.join(' ');
      const f = c.first.toLowerCase(), n = bizName.toLowerCase();
      const nameMatch = f && (f.includes(n) || n.includes(f));
      const textMatch = texts.toLowerCase().includes(n);
      const userMatch = c.username && c.username.toLowerCase() === n;
      if (nameMatch || textMatch || userMatch) { matchId = id; break; }
    }
    if (matchId && !String(data[i][tgCol] || '').trim()) {
      sh.getRange(i + 1, tgCol + 1).setValue(matchId);
      filled++;
      console.log(`✅ ${bizName} → ${matchId}`);
    }
  }
  console.log('✅ 自動填入完成，共 ' + filled + ' 筆。沒填到的請該業務私訊機器人後重跑。');
}

/**
 * 🚩 [調查] 多公司資料源盤點：列出喜悅納/安帝嘉試算表的所有分頁與各分頁表頭
 * 用法：在 GAS 編輯器選擇此函式並按「執行」，看 Log 輸出結構。
 */
function dumpMultiCompanyStructure() {
  const companies = [
    { key: '高雅瓷', ssId: CONFIG.DATA_SS_ID },
    { key: '喜悅納', ssId: '1uFKKWBfulg-GmCbJsSomimT5LW5r0N2w28rubrPveTA' },
    { key: '安帝嘉', ssId: '16QNID9hLs2K1iy_ePo7MxYxhW4kpDrDlfEIZ2p83ixo' }
  ];

  companies.forEach(c => {
    console.log('========== ' + c.key + ' (' + c.ssId + ') ==========');
    try {
      const ss = SpreadsheetApp.openById(c.ssId);
      console.log('試算表名稱：' + ss.getName());
      ss.getSheets().forEach(sh => {
        const vals = sh.getDataRange().getValues();
        console.log('  ── 分頁：' + sh.getName() + '（gid=' + sh.getSheetId() + '，' + vals.length + ' 列）──');
        if (vals.length > 0) {
          console.log('  表頭：' + vals[0].map(v => String(v).trim()).join(' | '));
          if (vals.length > 1) {
            console.log('  範例列：' + vals[1].map(v => String(v).substring(0, 12)).join(' | '));
          }
        }
      });
    } catch (e) {
      console.error('讀取 ' + c.key + ' 失敗：' + e);
    }
  });
  console.log('========== 盤點完成 ==========');
}

/**
 * 🚩 [測試] 多公司查詢：模擬各等級用戶對安/喜編號的查詢結果
 * 用法：改下方 testCases 的 q / level，執行後看 Log。
 */
function testMultiCompanyQuery() {
  const testCases = [
    { level: 'king',    q: 'KP61249' },
    { level: 'king',    q: 'KP61249 20坪' },
    { level: 'king',    q: 'KP61249圖片' },
    { level: 'premium', q: 'KP61249' },       // 應回「需輸入坪數」提示
    { level: 'premium', q: 'KP61249 20坪' },  // 應正常查詢
    { level: 'free',    q: 'KP61249 20坪' },  // 應回 ""（free 不查安/喜）
    { level: 'king',    q: '36033' }          // 純數字 → 應回 ""（只適用高雅瓷）
  ];

  testCases.forEach(tc => {
    const auth = { level: tc.level, userId: 'mock', name: '測試' };
    const code = (typeof extractMultiCompanyCode_ === 'function') ? extractMultiCompanyCode_(tc.q) : '';
    const inGYC = (typeof isExactCodeInGYC_ === 'function') ? isExactCodeInGYC_(code) : false;
    console.log('---- level=' + tc.level + ' q=' + tc.q + ' ----');
    console.log('  [code] ' + (code || '(非字母編號)') + ' | 高雅瓷精確命中=' + inGYC);
    const res = handleMultiCompanyQuery_(tc.q, auth, false);
    if (typeof res === 'object' && res !== null) {
      console.log('  [Flex] hero=' + (res.hero && res.hero.url ? res.hero.url.substring(0, 60) : '無圖'));
      const texts = [];
      (res.body && res.body.contents || []).forEach(c => { if (c.text) texts.push(c.text); });
      console.log(texts.join('\n'));
    } else {
      console.log('  [Text] ' + (res === '' ? '(空字串)' : res));
    }
  });
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


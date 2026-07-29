/**
 * 高雅瓷 AI 智能中樞 (v1.2 - 整合 AI 向量建庫中樞)
 * 🏷️ Version: v1.2.2 - 2026-05-08
 * 檔案：9_AI.js
 * 🚩 【模組化與最高開發原則】：
 * 1. 職責分離：集中管理所有 Gemini API 通道與提示詞工程，保持核心代碼純淨。
 * 2. 0破壞繼承：AI 僅負責「理解語言與辨識」，解析完後交棒給現有函數執行。
 * 3. 跨專案相容：採用萬用底層，方便未來直接複製至「智慧物流系統」複用。
 */

// ==========================================
// 🔗 1. 萬用底層 AI API 通道 (支援文字、圖片多模態)
// ==========================================
function callGeminiUniversal(systemInstruction, userInput, jsonMode = false, imageBase64 = null) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    console.error("❌ 尚未設定 GEMINI_API_KEY，請在專案設定中加入該屬性！");
    return null;
  }
  
  // 採用速度極快、額度划算且支援多模態的 gemini-2.5-flash
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  
  const parts = [];
  parts.push({ text: `System Instruction: ${systemInstruction}` });
  
  // 支援多模態：如果有傳入圖片 Base64，則塞入 Parts 中
  if (imageBase64) {
    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: imageBase64
      }
    });
  }
  
  parts.push({ text: `User Content: ${userInput || ''}` });
  
  const payload = {
    contents: [{ parts: parts }],
    generationConfig: {
      temperature: imageBase64 ? 0.1 : 0.7, // 辨識圖片或 JSON 要求極高精準度，日常對話可稍微活潑
      responseMimeType: jsonMode ? "application/json" : "text/plain"
    }
  };
  
  try {
    const response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() === 200) {
      const resData = JSON.parse(response.getContentText());
      return resData.candidates[0].content.parts[0].text;
    } else {
      console.error("Gemini 呼叫失敗: " + response.getContentText());
      return null;
    }
  } catch (e) {
    console.error("Gemini 連線異常: " + e);
    return null;
  }
}

// ==========================================
// 🎯 2. 口語指令意圖與參數解析器 (NLP)
// ==========================================
function aiParseUserIntent(userInput) {
  const systemPrompt = `
    你是一個高雅瓷磁磚系統的『口語指令解析大腦』。請將使用者的輸入分析並轉換為標準 JSON 格式。
    
    你必須精準識別以下五種意圖 (intent)：
    1. "image_query"：想看圖片、照片、完工照、實景照、3D圖。
    2. "price_query"：詢問價格、價錢、多少錢。
    3. "spec_query"：詢問規格、尺寸、重量、包裝、一箱幾片、幾公斤。
    4. "inventory_query"：查詢庫存、剩多少、有沒有貨。
    5. "reserve_request"：想要保留、預留、下保留單、留貨、幫我留。
    6. "other"：日常問候、謝謝、辛苦了、或其他與上述無關的內容。

    請提取以下參數（若無則填 null）：
    - "product_code": 產品型號/編號（請統一轉為大寫，如 "12345" 或 "XY12345"）。
    - "quantity": 數值（如 50）。
    - "unit": 數量單位（坪、片、箱、包、P）。
    - "project_name": 案名、客戶名稱、業務名稱（如 "大永"、"建國大樓"）。
    - "spec_keyword": 規格關鍵字（如 "重量"、"包裝"、"一箱幾片"）。

    請嚴格回傳以下 JSON 格式，不要包含額外文字或 markdown 標籤：
    {
      "intent": "意圖名稱",
      "product_code": "型號",
      "quantity": 數量,
      "unit": "單位",
      "project_name": "案名",
      "spec_keyword": "規格屬性"
    }
  `;
  
  const result = callGeminiUniversal(systemPrompt, userInput, true);
  try {
    return result ? JSON.parse(result) : null;
  } catch(e) {
    console.error("解析 Intent JSON 出錯: " + e);
    return null;
  }
}

// ==========================================
// 💬 3. 高雅瓷 AI 智慧客服小高 (日常對話)
// ==========================================
function aiChatFriendly(userInput, auth) {
  let displayName = '貴賓';
  if (auth && auth.name && auth.name !== '未設定') {
    // 名字欄位若是「公司-姓名」格式，只取姓名部分來稱呼
    const parts = auth.name.split('-');
    displayName = parts[parts.length - 1];
  }

  const systemPrompt = `
    你是『高雅瓷 AI 秘書小高』，高雅瓷是一家專營頂級、高級、時尚精品磁磚（如睡美人系列等）的進口磁磚品牌。
    你負責在 LINE 上用親切、專業、溫暖的語氣回覆業務人員或設計師，對話對象是台灣的客戶。

    【當前對話者資訊】：
    - 稱呼：${displayName}（若不是『貴賓』，可在開頭加上適合的稱謂，如「先生/小姐」或依名字判斷的「哥/姐」）
    - 等級：${auth ? auth.level : '訪客'}

    【語氣與用詞規則】：
    1. 用台灣人習慣的口吻和用詞，避免大陸用語（例如不要用「您今天」開頭的制式問候、不要用「親」、不要用過於浮誇的詩意詞句如「陽光燦爛」「美好的每一刻」「充滿活力與靈感」）。
    2. 語氣自然、像真人同事在聊天，不要像罐頭客服訊息。
    3. 表情符號適量使用即可（1-2 個就好），不要整段塞滿。

    【排版規則】：
    1. 訊息要分段，段落之間用空白行隔開（換行兩次），方便在手機上閱讀。
    2. 第一段簡短回應對方的問題或打招呼，第二段（若需要）才補充其他資訊或引導。

    【對話指南】：
    1. 如果對方問起如何查庫存、看圖、查價格，可以引導他們使用機器人的指令（例如：輸入『12345 50坪』查庫存，或輸入『12345 圖片』看美圖）。
    2. 回答需專業且體貼，展現高級建材品牌的服務質感。請用繁體中文回覆，字數控制在 100 字內，精簡扼要。
  `;
  return callGeminiUniversal(systemPrompt, userInput, false) || "小高剛剛恍神了，請您再說一次好嗎？😊";
}

// ==========================================
// 📸 4. 手寫保留單智慧 OCR 辨識引擎 (v2 多品項版)
// ==========================================
function aiParseHandwrittenOrder(imageBase64) {
  const systemPrompt = `
    你是高雅瓷磁磚品牌的『手寫保留單智慧辨識大腦』。請仔細看傳入的手寫保留單照片，完整辨識所有品項資訊。

    【辨識目標】：
    1. 案名 (project_name) — 通常寫在頂部或標題位置，可能是工程名稱或客戶公司名
    2. 品項清單 (items) — 每一行代表一個品項，含：
       - product_code：型號/編號（英文字母+數字，請統一轉為大寫，如 "DA61250"）
       - quantity：數量（純數值，如 80）
       - unit：單位（坪/片/箱/包，若看不到單位則預設 "坪"）
       - uncertain：若此品項任何欄位辨識有疑慮（字跡模糊/看不清楚），設為 true，否則 false

    【信心度評估】：
    - confidence 設為 "high"：全部品項清晰可讀，且案名存在，沒有任何疑慮
    - confidence 設為 "low"：有任何欄位模糊、不確定、案名缺失、或無法辨識完整品號

    【issues 填寫規則】：
    若有辨識疑慮，用一句話具體說明（如：「第二行型號最後兩碼模糊，可能是 10 或 70」）。無疑慮則設為 null。

    請嚴格回傳以下 JSON，不含任何額外文字或 markdown：
    {
      "confidence": "high" 或 "low",
      "project_name": "案名字串" 或 null,
      "items": [
        { "product_code": "DA61250", "quantity": 80, "unit": "坪", "uncertain": false },
        { "product_code": "RC61110", "quantity": 50, "unit": "坪", "uncertain": true }
      ],
      "issues": "具體疑慮說明" 或 null
    }
  `;

  const result = callGeminiUniversal(systemPrompt, null, true, imageBase64);
  try {
    return result ? JSON.parse(result) : null;
  } catch(e) {
    console.error("解析手寫單 OCR JSON 出錯: " + e);
    return null;
  }
}

// ==========================================
// 🔮 5. 向量搜尋引擎核心函數 (用於以圖搜圖)
// ==========================================

/** 產生圖片的語意特徵描述 */
function aiDescribeProductImage(imageBase64) {
  const systemPrompt = `
    你是一個磁磚視覺專家。請仔細觀察這張磁磚照片，並用 50 字內簡短描述它的：
    顏色（如灰、白、米、黑）、紋路（如大理石紋、木紋、清水模、素色）、風格（如工業風、現代風、極簡奢華風），
    這些描述將用於搜尋比對，請使用精準的中文關鍵字。
  `;
  return callGeminiUniversal(systemPrompt, null, false, imageBase64) || "";
}

/** 呼叫 Embedding API 將文字特徵轉換為 768 維實數向量 */
function getTextEmbedding(text) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) return null;
  
  // 採用 Google 全新且免費好用的 gemini-embedding-001 穩定嵌入版模型
  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=" + apiKey;
  
  const payload = {
    content: {
      parts: [{ text: text }]
    }
  };
  
  try {
    const response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() === 200) {
      const resData = JSON.parse(response.getContentText());
      return resData.embedding.values; // 回傳 768 維向量數組
    }
  } catch(e) {
    console.error("Embedding 呼叫失敗: " + e);
  }
  return null;
}

/** 計算兩個向量的 Cosine 相似度 */
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  const dot = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  const magA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
  const magB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
  if (magA === 0 || magB === 0) return 0;
  return dot / (magA * magB);
}

// ==========================================
// 🚀 6. 智慧 Drive 掃描建庫與以圖搜圖引擎
// ==========================================

/**
 * 🔮 自動解析檔名：提取磁磚編號、辨識照片類型 (單片/實景照/模面)
 * @param {string} fileName 檔案名稱 (例如: "10245實景照_1.jpg" 或 "10245_模面3.png")
 */
function parseTileFileName(fileName) {
  const cleanName = fileName.substring(0, fileName.lastIndexOf('.')).trim();
  
  // 提取出純編號 (支援 2-4 碼英文 + 5 碼以上數字 + 可選的減號與後綴，例如 rp612111-rib, rt61243-s)
  const codeMatch = cleanName.match(/[a-zA-Z]{2,4}\d{5,}(?:-[a-zA-Z0-9]+)?/) || cleanName.match(/\d{5,}(?:-[a-zA-Z0-9]+)?/);
  const productCode = codeMatch ? codeMatch[0].toUpperCase() : "未知編號";
  
  // 依據您的規則快速判定照片類型
  let imageType = "單片";
  if (cleanName.indexOf("實景照") > -1) {
    imageType = "實景照";
  } else if (cleanName.indexOf("模面") > -1) {
    imageType = "模面";
  }
  
  return {
    productCode: productCode,
    imageType: imageType
  };
}

/**
 * ⚡ 建立/更新 Google Drive 的影像向量索引 (支援遞迴掃描與增量自動續作，具備「即時存檔技術」)
 * 建議在試算表點選自訂選單按鈕執行，程式會邊處理邊寫入，即使 Google 6分鐘超時，已寫入的數據也不會遺失！
 */
function buildImageVectorIndex() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  
  try {
    const FOLDER_ID = '1EKzV8ZAteGtM2l3Y7ri6Go6_xv0zkF85'; // 您的 Drive 資料夾 ID
    const folder = DriveApp.getFolderById(FOLDER_ID);
    
    // 確保「AI向量對照表」分頁與標頭已正確建立
    let sheet = ss.getSheetByName("AI向量對照表");
    if (!sheet) {
      sheet = ss.insertSheet("AI向量對照表");
      Logger.log("ℹ️ 已自動為您建立全新的「AI向量對照表」工作表分頁。");
      const headers = ["編號", "檔案名稱", "類型", "縮圖連結", "AI特徵描述", "向量數據"];
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#F3F3F3");
    }
    
    ss.toast("正在讀取現有相片索引庫...", "🤖 AI 向量建庫中", 5);
    Logger.log("⏳ 正在讀取現有「AI向量對照表」資料庫...");
    const existingFiles = {};
    const indexData = loadVectorIndex();
    indexData.forEach(item => {
      existingFiles[item.fileName] = true;
    });
    const existingCount = Object.keys(existingFiles).length;
    Logger.log(`ℹ\uFE0F 目前資料庫中已存在且已分析完畢的相片數: \${existingCount} 筆`);
    
    ss.toast(`目前已分析完畢: \${existingCount} 筆，開始遞迴子資料夾掃描...`, "🤖 AI 向量建庫中", 5);
    Logger.log("⏳ 正在啟動 Google Drive 圖庫「增量自動續作」建庫程序...");
    let skippedCount = 0;
    let newlyProcessedCount = 0;
    
    function scanFolderRecursive(currentFolder) {
      Logger.log(`📂 正在掃描資料夾: \${currentFolder.getName()}`);
      const files = currentFolder.getFiles();
      
      while (files.hasNext()) {
        const file = files.next();
        const mime = file.getMimeType().toLowerCase();
        if (!mime.startsWith('image/')) continue;
        
        const fileName = file.getName();
        
        // 🚀 【核心智慧：增量自動續作】如果這個檔案已經掃描並保存在試算表中，立刻秒速跳過！
        if (existingFiles[fileName]) {
          skippedCount++;
          continue;
        }
        
        const parse = parseTileFileName(fileName);
        newlyProcessedCount++;
        ss.toast(`正在進行 AI 視覺特徵與向量計算 (新檔案 #\${newlyProcessedCount}): \${fileName}`, "📸 AI 正在看圖中...", 10);
        Logger.log(`📸 發現全新相片，開始 AI 處理: \${fileName} (編號: \${parse.productCode}, 類型: \${parse.imageType})`);
        
        try {
          // 1. 讀取圖片並轉為 Base64
          const blob = file.getBlob();
          const base64 = Utilities.base64Encode(blob.getBytes());
          
          // 2. 讓 Gemini 2.5 Flash 生成特徵描述
          const description = aiDescribeProductImage(base64);
          
          // 3. 將特徵文字轉換為 768 維語意向量
          const vector = getTextEmbedding(description);
          
          if (vector) {
            // 🚀 【即時存檔技術】直接將這筆成果即時寫入試算表！防止超時而遺失
            const rowData = [
              parse.productCode,
              fileName,
              parse.imageType,
              "https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w600", // 產生 1000px 的高清直鏈縮圖
              description,
              JSON.stringify(vector)
            ];
            sheet.appendRow(rowData);
            Logger.log(`✅ 成功建立並即時寫入試算表！`);
          } else {
            Logger.log(`⚠️ 檔案 \${fileName} 向量化失敗，自動跳過。`);
          }
        } catch (err) {
          Logger.log(`❌ 處理 \${fileName} 時發生錯誤: \${err}`);
        }
        
        // 每次呼叫稍作延遲，配合免費額度 RPD/RPM
        Utilities.sleep(600);
      }
      
      // 遞迴掃描所有子資料夾
      const subfolders = currentFolder.getFolders();
      while (subfolders.hasNext()) {
        scanFolderRecursive(subfolders.next());
      }
    }
    
    scanFolderRecursive(folder);
    Logger.log(`⏭\uFE0F 掃描與分析完畢！本次處理自動秒速跳過了 \${skippedCount} 個已存在的檔案。`);
    
    // 最終彈窗
    if (newlyProcessedCount > 0) {
      ui.alert(`🎉 恭喜！影像建庫大功告成！\\n\\n本次成功掃描並新增了 \${newlyProcessedCount} 筆全新特徵！\\n（同時自動跳過了 \${skippedCount} 個原本就已存在於試算表中的檔案）😊✨`);
    } else {
      ui.alert(`✨ 掃描完成！所有相片先前均已建庫過囉！\\n\\n本次自動跳過了 \${skippedCount} 個已存在的檔案，資料庫已是最新狀態！😊🧱`);
    }
    
  } catch (err) {
    ui.alert(`❌ 建庫程序發生異常！\\n\\n錯誤詳細資訊：\\n\${err}`);
  }
}

/**
 * 💾 增量儲存向量索引到獨立的「AI向量對照表」試算表分頁 (備用與相容性保留)
 */
function saveVectorIndex(rows) {
  if (!rows || rows.length === 0) return;
  try {
    const ss = SpreadsheetApp.openById(CONFIG.DATA_SS_ID);
    let sheet = ss.getSheetByName("AI向量對照表");
    if (!sheet) {
      sheet = ss.insertSheet("AI向量對照表");
      const headers = ["編號", "檔案名稱", "類型", "縮圖連結", "AI特徵描述", "向量數據"];
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#F3F3F3");
    }
    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
  } catch (e) {
    Logger.log("❌ 寫入試算表失敗: " + e);
  }
}

/**
 * 📖 從「AI向量對照表」分頁讀取所有向量資料
 */
function loadVectorIndex() {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.DATA_SS_ID);
    const sheet = ss.getSheetByName("AI向量對照表");
    if (!sheet) return [];
    
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return []; // 只有標頭
    
    const indexList = [];
    for (let i = 1; i < data.length; i++) {
      indexList.push({
        productCode: data[i][0],
        fileName: data[i][1],
        imageType: data[i][2],
        thumbnailUrl: data[i][3],
        description: data[i][4],
        vector: data[i][5]
      });
    }
    return indexList;
  } catch(e) {
    console.error("讀取向量索引表失敗: " + e);
    return [];
  }
}

/**
 * 🔍 以圖搜圖：比對出最相似的前 3 款商品
 * @param {string} customerImageBase64 使用者傳來欲比對之圖片 Base64
 */
function aiSearchSimilarByImage(customerImageBase64) {
  const customerDesc = aiDescribeProductImage(customerImageBase64);
  if (!customerDesc) return [];
  
  const queryVector = getTextEmbedding(customerDesc);
  if (!queryVector) return [];
  
  const indexData = loadVectorIndex();
  const similarities = [];
  
  for (let item of indexData) {
    try {
      const dbVector = JSON.parse(item.vector);
      const score = cosineSimilarity(queryVector, dbVector);
      similarities.push({
        productCode: item.productCode,
        fileName: item.fileName,
        imageType: item.imageType,
        thumbnailUrl: item.thumbnailUrl,
        description: item.description,
        score: score
      });
    } catch(err) {}
  }
  
  similarities.sort((a, b) => b.score - a.score);
  return similarities.slice(0, 3);
}

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

let isRunning = false;
let clients = [];
let scanState = {
    total: 0,
    success: 0,
    skipped: 0,
    failed: 0,
    startTime: 0
};

// SSE 廣播功能
function broadcast(type, data) {
    const message = `data: ${JSON.stringify({ type, data })}\n\n`;
    clients.forEach(c => c.res.write(message));
}

function sendLog(msg, level = 'INFO') {
    const time = new Date().toLocaleTimeString('zh-TW', { hour12: true });
    broadcast('log', { time, msg, level });
    console.log(`[${time}] [${level}] ${msg}`);
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function parseTileFileName(fileName) {
    const cleanName = fileName.substring(0, fileName.lastIndexOf('.')).trim();
    const codeMatch = cleanName.match(/[a-zA-Z]{2,4}\d{5,}(?:-[a-zA-Z0-9]+)?/) || cleanName.match(/\d{5,}(?:-[a-zA-Z0-9]+)?/);
    const productCode = codeMatch ? codeMatch[0].toUpperCase() : "未知編號";
    
    // 判斷類型：實景照、模面圖、單片照
    let imageType = "單片照";
    if (cleanName.includes("實景照") || cleanName.includes("實景")) {
        imageType = "實景照";
    } else if (cleanName.includes("模面") || cleanName.includes("模面圖")) {
        imageType = "模面圖";
    }
    
    return { productCode, imageType };
}

function scanDirectory(dir, fileList = []) {
    try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const fullPath = path.join(dir, file);
            if (fs.statSync(fullPath).isDirectory()) {
                scanDirectory(fullPath, fileList);
            } else {
                if (/\.(jpg|jpeg|png|webp)$/i.test(fullPath)) {
                    // 取消原本的完全排除，這裡把所有圖片都加進來
                    fileList.push(fullPath);
                }
            }
        }
    } catch (e) {
        sendLog(`無法讀取目錄: ${dir}`, 'ERROR');
    }
    return fileList;
}

app.get('/api/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    clients.push({ req, res });
    req.on('close', () => { clients = clients.filter(c => c.req !== req); });
});

app.post('/api/start', async (req, res) => {
    if (isRunning) return res.json({ success: false, message: '掃描已在進行中' });
    
    const { folderPath, apiKey, webhookUrl } = req.body;
    if (!fs.existsSync(folderPath)) {
        sendLog('❌ 找不到本機目錄: ' + folderPath, 'ERROR');
        return res.json({ success: false, message: '找不到本機目錄' });
    }

    isRunning = true;
    scanState = { total: 0, success: 0, skipped: 0, failed: 0, startTime: Date.now() };
    res.json({ success: true });

    sendLog('開始初始化 AI 向量掃描引擎...', 'INFO');
    broadcast('state', scanState);

    try {
        let existingFiles = new Set();
        let seenFaces = new Set(); // 記錄哪些編號已經有「模面圖」了

        sendLog('☁️ [Google Sheet] 正在取得雲端已處理清單...', 'INFO');
        try {
            const hookRes = await axios.post(webhookUrl, { action: 'loadVectors' });
            if (hookRes.data && hookRes.data.data) {
                existingFiles = new Set(hookRes.data.data);
                
                // 分析雲端現有的檔案，把已經有「模面圖」的編號記錄下來
                for (const fname of existingFiles) {
                    const { productCode, imageType } = parseTileFileName(fname);
                    if (imageType === "模面圖") seenFaces.add(productCode);
                }
                sendLog(`✅ 雲端目前已有 ${existingFiles.size} 筆紀錄，這些將自動跳過。`, 'SUCCESS');
            }
        } catch (e) {
            sendLog('⚠️ 無法取得雲端清單，將從頭掃描 (若有 404 可能是 Webhook URL 不完整)', 'WARNING');
        }

        sendLog(`📂 正在掃描本機目錄: ${folderPath}`, 'INFO');
        const allImages = scanDirectory(folderPath);
        scanState.total = allImages.length;
        broadcast('state', scanState);
        sendLog(`🔍 共發現 ${allImages.length} 張圖片`, 'INFO');

        for (let i = 0; i < allImages.length; i++) {
            if (!isRunning) break;

            const imgPath = allImages[i];
            const fileName = path.basename(imgPath);
            const { productCode, imageType } = parseTileFileName(fileName);

            broadcast('currentFile', { fileName, productCode, index: i + 1, total: allImages.length });

            // 1. 完全相同的檔案跳過
            if (existingFiles.has(fileName)) {
                scanState.skipped++;
                broadcast('state', scanState);
                continue;
            }

            // 2. 如果是模面圖，檢查這個型號是否已經抓過一張了
            if (imageType === "模面圖") {
                if (seenFaces.has(productCode)) {
                    sendLog(`⏭️ [自動跳過] 型號 ${productCode} 已經有一張模面圖了: ${fileName}`, 'WARNING');
                    scanState.skipped++;
                    broadcast('state', scanState);
                    continue;
                }
                // 標記這個編號已經抓過一張了
                seenFaces.add(productCode);
            }

            sendLog(`🔄 正在處理第 ${i+1}/${allImages.length} 張圖: ${fileName} [${imageType}]`, 'INFO');
            
            try {
                const base64Data = fs.readFileSync(imgPath, { encoding: 'base64' });

                sendLog(`🧠 [Gemini 2.5 Flash] 正在分析圖片視覺特徵...`, 'INFO');
                broadcast('progress', { step: 'gemini' });
                
                const gUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
                const gRes = await axios.post(gUrl, {
                    contents: [{
                        parts: [
                            { text: "System Instruction: 你是一個磁磚視覺專家。請仔細觀察這張磁磚照片，並用 50 字內簡短描述它的：顏色、紋路、風格。這些描述將用於搜尋比對，請使用精準的中文關鍵字。" },
                            { inlineData: { mimeType: "image/jpeg", data: base64Data } }
                        ]
                    }],
                    generationConfig: { temperature: 0.1 }
                });
                
                const description = gRes.data.candidates[0].content.parts[0].text;
                sendLog(`💬 分析特徵: ${description.substring(0, 30)}...`, 'SUCCESS');
                broadcast('progress', { step: 'gemini_done', description });

                sendLog(`🔢 [Text Embedding] 正在將特徵轉換為 768 維語意向量...`, 'INFO');
                const eUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`;
                const eRes = await axios.post(eUrl, {
                    model: "models/gemini-embedding-001",
                    content: { parts: [{ text: description }] }
                });
                
                const vector = eRes.data.embedding.values;
                sendLog(`✅ 向量生成成功！`, 'SUCCESS');
                broadcast('progress', { step: 'embedding_done' });

                sendLog(`☁️ [Google Sheet] 正在即時寫入雲端試算表...`, 'INFO');
                await axios.post(webhookUrl, {
                    action: "appendVector",
                    rowData: [productCode, fileName, imageType, `本地檔案無直鏈`, description, JSON.stringify(vector)]
                });
                
                sendLog(`🎉 雲端寫入成功！試算表已同步。`, 'SUCCESS');
                scanState.success++;
                broadcast('state', scanState);
            } catch (err) {
                sendLog(`❌ 處理失敗: ${fileName} - ${err.message}`, 'ERROR');
                scanState.failed++;
                broadcast('state', scanState);
            }
            
            // 無論成功或失敗，都強制休息 10 秒，避免被 Google 鎖 API
            await sleep(10000);
        }
        
        sendLog(`✨ 掃描任務執行完畢！`, 'SUCCESS');
        isRunning = false;
        broadcast('complete', true);

    } catch (e) {
        sendLog(`嚴重錯誤: ${e.message}`, 'ERROR');
        isRunning = false;
    }
});

app.post('/api/pause', (req, res) => {
    isRunning = false;
    sendLog(`⏸️ 使用者已暫停程序`, 'WARNING');
    res.json({ success: true });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});

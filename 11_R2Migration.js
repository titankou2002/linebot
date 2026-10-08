/**
 * 高雅瓷 AI 智能客服 - 圖片全面遷移至 Cloudflare R2
 * 檔案：11_R2Migration.gs
 * 🚩 目的：Google Drive 的 /thumbnail 代理讀取終究有速度天花板，把全部產品圖片實際搬到
 * Cloudflare R2（CDN），機器人讀取時優先用 R2 網址，大幅加速圖片推送。
 *
 * 上傳核心（uploadBlobToR2/_uploadToR2/簽名相關函式）直接搬自另一個獨立專案「電子目錄」的
 * R2_Migration_Tool.gs，那邊已經驗證可用，這裡原封不動延用，只是遷移的批次邏輯改成
 * 針對試算表「列」做斷點續跑（比原本資料夾遞迴掃描簡單可靠），且不覆蓋原始 Drive 連結，
 * 兩邊並存，機器人讀取邏輯改成「R2 優先，Drive 備援」。
 */

// ==========================================
// 🔑 R2 憑證設定
// ==========================================

/**
 * 🚩 [一次性] 設定 R2 憑證（沿用「電子目錄」專案現有的 Cloudflare 帳號/bucket）
 * 用法：去「電子目錄」GAS 專案的「專案設定 → 指令碼屬性」把 R2_ACCOUNT_ID/R2_ACCESS_KEY/
 * R2_SECRET_KEY/R2_BUCKET_NAME/R2_PUBLIC_DOMAIN 這 5 個值複製過來，填進下方參數後在
 * GAS 編輯器執行一次即可。
 */
function setR2Config(accountId, accessKey, secretKey, bucketName, publicDomain) {
  if (!accountId || !accessKey || !secretKey || !bucketName || !publicDomain) {
    console.log('⚠️ 5 個參數都要帶：setR2Config(accountId, accessKey, secretKey, bucketName, publicDomain)');
    return;
  }
  const props = PropertiesService.getScriptProperties();
  props.setProperty('R2_ACCOUNT_ID', accountId);
  props.setProperty('R2_ACCESS_KEY', accessKey);
  props.setProperty('R2_SECRET_KEY', secretKey);
  props.setProperty('R2_BUCKET_NAME', bucketName);
  props.setProperty('R2_PUBLIC_DOMAIN', publicDomain);
  console.log('✅ R2 憑證已設定完成！');
}

// ==========================================
// 📤 R2 上傳核心（原封不動搬自「電子目錄」R2_Migration_Tool.gs）
// ==========================================

function uploadBlobToR2(blob, fileName) {
  try {
    // trim：避免複製貼上夾帶看不見的空白/換行導致 AWS4 簽名不合
    const props = PropertiesService.getScriptProperties().getProperties();
    const accountId = String(props.R2_ACCOUNT_ID || '').trim();
    const accessKey = String(props.R2_ACCESS_KEY || '').trim();
    const secretKey = String(props.R2_SECRET_KEY || '').trim();
    const bucket    = String(props.R2_BUCKET_NAME || '').trim();
    const domain    = String(props.R2_PUBLIC_DOMAIN || '').trim().replace(/\/$/, '');

    if (!accountId || !accessKey) {
      return { success: false, error: '尚未設定 R2 密鑰（請先執行 setR2Config(...)）' };
    }

    // 🚩 「無法開啟網址」這類是 GAS 網路層的暫時性連線失敗（不是簽名/權限問題），重試通常就過了；
    // R2 回應的真正錯誤（例如 SignatureDoesNotMatch）不會有 "Exception:" 開頭，重試也是一樣結果。
    let resObj = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      resObj = _uploadToR2(blob, fileName, accountId, bucket, accessKey, secretKey);
      if (resObj.success || !/^Exception:/.test(String(resObj.error))) break;
      if (attempt < 2) Utilities.sleep(1000 * (attempt + 1));
    }
    if (resObj.success) resObj.url = domain + '/' + fileName;
    return resObj;
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * 🚩 AWS4 簽名要求 canonical URI 要是 percent-encoded 過的（RFC3986），檔名含中文
 * （例如 m.dst 這種欄位名稱「R2_實景1」的中文部分）時如果直接拿原始字串去簽章，跟
 * UrlFetchApp 實際送出去時網路層自動編碼過的路徑會不一致，一定是 SignatureDoesNotMatch。
 * 這裡先把檔名編碼好，同一份編碼結果同時用在「組出實際請求網址」跟「組出用來簽章的
 * canonical request」，兩邊才會一致。
 */
function _encodeR2PathSegment(name) {
  return encodeURIComponent(name).replace(/[!'()*]/g, function(c) {
    return '%' + c.charCodeAt(0).toString(16).toUpperCase();
  });
}

function _uploadToR2(blob, fileName, accountId, bucket, accessKey, secretKey) {
  try {
    const method  = 'PUT';
    const region  = 'auto';
    const service = 's3';
    const host     = accountId + '.r2.cloudflarestorage.com';
    const canonicalPath = '/' + bucket + '/' + _encodeR2PathSegment(fileName);
    const endpoint = 'https://' + host + canonicalPath;
    const now      = new Date();
    const amzDate  = Utilities.formatDate(now, 'GMT', "yyyyMMdd'T'HHmmss'Z'");
    const dateStamp = amzDate.substr(0, 8);

    const payload     = blob.getBytes();
    const payloadHash = _sha256Hex(payload);

    const canonicalHeaders = 'host:' + host + '\nx-amz-content-sha256:' + payloadHash + '\nx-amz-date:' + amzDate + '\n';
    const signedHeaders    = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = method + '\n' + canonicalPath + '\n\n' + canonicalHeaders + '\n' + signedHeaders + '\n' + payloadHash;

    const credentialScope = dateStamp + '/' + region + '/' + service + '/aws4_request';
    const stringToSign    = 'AWS4-HMAC-SHA256\n' + amzDate + '\n' + credentialScope + '\n' + _sha256Hex(canonicalRequest);

    const signingKey = _getSignatureKey(secretKey, dateStamp, region, service);
    const signature  = _hmacSha256Hex(signingKey, stringToSign);

    const authHeader = 'AWS4-HMAC-SHA256 Credential=' + accessKey + '/' + credentialScope + ', SignedHeaders=' + signedHeaders + ', Signature=' + signature;

    const res = UrlFetchApp.fetch(endpoint, {
      method: method,
      headers: {
        'Authorization':        authHeader,
        'x-amz-date':           amzDate,
        'x-amz-content-sha256': payloadHash,
        'Content-Type':         blob.getContentType()
      },
      payload: payload,
      muteHttpExceptions: true
    });

    const code = res.getResponseCode();
    if (code === 200) return { success: true };
    const raw = res.getContentText();
    const codeMatch = raw.match(/<Code>([^<]*)<\/Code>/);
    const msgMatch = raw.match(/<Message>([^<]*)<\/Message>/);
    const shortErr = (codeMatch ? codeMatch[1] : ('HTTP ' + code)) + (msgMatch ? '：' + msgMatch[1] : '');
    return { success: false, error: shortErr };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function _sha256Hex(data) {
  const bytes = typeof data === 'string' ? Utilities.newBlob(data).getBytes() : data;
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)
    .map(function(b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}
function _hmacSha256(key, data) {
  const keyBytes  = typeof key  === 'string' ? Utilities.newBlob(key).getBytes()  : key;
  const dataBytes = typeof data === 'string' ? Utilities.newBlob(data).getBytes() : data;
  return Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_256, dataBytes, keyBytes);
}
function _hmacSha256Hex(key, data) {
  return _hmacSha256(key, data).map(function(b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}
function _getSignatureKey(key, dateStamp, regionName, serviceName) {
  const kDate    = _hmacSha256('AWS4' + key, dateStamp);
  const kRegion  = _hmacSha256(kDate,    regionName);
  const kService = _hmacSha256(kRegion,  serviceName);
  return           _hmacSha256(kService, 'aws4_request');
}

// ==========================================
// 🚀 批次遷移（依「列」斷點續跑，不覆蓋原始 Drive 連結）
// ==========================================

/**
 * 來源欄位 → 目標 R2 欄位對照表
 * 🚩 「雲端圖片」故意不搬：這欄存的是「資料夾連結」（給客戶點開整個資料夾用的
 * 📁 雲端圖庫 按鈕，見 4_Flex.js buildSeriesGuideFlex），不是單張圖片檔案，
 * 沒辦法當一個 blob 上傳到 R2，也沒有任何讀取邏輯把它當單張圖用，故排除。
 */
// 🚩 key 是英文安全短字串，只用在 R2 檔名/物件 key 上（避免中文檔名編碼問題），跟
// src/dst（真正的中文欄位名稱，維持不動）分開。
const R2_MIGRATION_MAP = [
  { src: '單片連結網址', dst: 'R2_單片連結網址', key: 'single_link' },
  { src: '系列介紹',     dst: 'R2_系列介紹',     key: 'intro' },
  { src: '實景1', dst: 'R2_實景1', key: 'scene1' }, { src: '實景2', dst: 'R2_實景2', key: 'scene2' },
  { src: '實景3', dst: 'R2_實景3', key: 'scene3' }, { src: '實景4', dst: 'R2_實景4', key: 'scene4' },
  { src: '實景5', dst: 'R2_實景5', key: 'scene5' }, { src: '實景6', dst: 'R2_實景6', key: 'scene6' },
  { src: '實景7', dst: 'R2_實景7', key: 'scene7' },
  { src: '主圖URL',   dst: 'R2_主圖URL',   key: 'main' },
  { src: '原廠目錄',   dst: 'R2_原廠目錄',   key: 'catalog' },
  { src: '單片1', dst: 'R2_單片1', key: 'single1' }, { src: '單片2', dst: 'R2_單片2', key: 'single2' },
  { src: '單片3', dst: 'R2_單片3', key: 'single3' }, { src: '單片4', dst: 'R2_單片4', key: 'single4' },
  { src: '單片5', dst: 'R2_單片5', key: 'single5' }, { src: '單片6', dst: 'R2_單片6', key: 'single6' },
  { src: '單片7', dst: 'R2_單片7', key: 'single7' }, { src: '單片8', dst: 'R2_單片8', key: 'single8' },
  { src: '單片9', dst: 'R2_單片9', key: 'single9' }
];

/** 確保所有目標 R2 欄位都存在於表頭，缺的就在最後一欄自動新增 */
function _ensureR2Columns_(sheet, header) {
  R2_MIGRATION_MAP.forEach(m => {
    if (header.indexOf(m.dst) === -1) {
      const pos = header.length;
      sheet.getRange(1, pos + 1).setValue(m.dst).setBackground('#D9EAD3').setFontWeight('bold');
      header.push(m.dst);
    }
  });
}

/**
 * 🚀 主程式：批次把全表圖片搬到 R2（可重複執行、斷點續跑）
 * 用法：在 GAS 編輯器選擇此函式並按「執行」；沒跑完會自動記錄進度，重新執行會接著跑。
 * 也可以用 setupR2MigrationTrigger() 讓它自動每 10 分鐘跑一次直到完成，不用手動一直按。
 */
function runFullImageMigrationToR2() {
  const startTime = new Date().getTime();
  const TIME_LIMIT_MS = 280000; // 4分40秒安全邊界（GAS 執行上限 6 分鐘）

  const ss = getSpreadsheetInstance();
  const sheet = ss.getSheetByName('編輯價目表') || ss.getSheetByName('編號價目表');
  if (!sheet) { console.log('❌ 找不到編號價目表'); return; }

  let header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
  _ensureR2Columns_(sheet, header);

  // 欄位有可能剛新增，重新讀一次完整表頭與資料，確保欄位位置正確
  const data = sheet.getDataRange().getValues();
  header = data[0].map(h => String(h).trim());
  const idxCode = header.indexOf('編號');
  if (idxCode === -1) { console.log('❌ 找不到「編號」欄位'); return; }

  const props = PropertiesService.getScriptProperties();
  const startRow = parseInt(props.getProperty('R2_MIGRATION_LAST_ROW') || '1');
  const r2Domain = String(props.getProperty('R2_PUBLIC_DOMAIN') || '').trim();

  let uploaded = 0, skipped = 0, failed = 0, i = startRow;

  for (; i < data.length; i++) {
    if (new Date().getTime() - startTime > TIME_LIMIT_MS) {
      props.setProperty('R2_MIGRATION_LAST_ROW', String(i));
      console.log(`⚠️ 執行時間到達上限，已處理到第 ${i} 列。本次成功 ${uploaded}，跳過 ${skipped}，失敗 ${failed}。請重新執行繼續（或用 setupR2MigrationTrigger() 自動接著跑）。`);
      return;
    }

    const code = String(data[i][idxCode] || '').trim();
    if (!code) continue;

    R2_MIGRATION_MAP.forEach(m => {
      const srcIdx = header.indexOf(m.src);
      const dstIdx = header.indexOf(m.dst);
      if (srcIdx === -1 || dstIdx === -1) return;

      const srcVal = String(data[i][srcIdx] || '').trim();
      const dstVal = String(data[i][dstIdx] || '').trim();

      // 🚩 Drive 來源有兩種常見格式都要接受：drive.google.com（/file/d/、/thumbnail、/uc）
      // 以及「圖片抓取工具」寫入的 lh3.googleusercontent.com/d/FILEID 格式，只認 drive.google.com
      // 會讓 googleusercontent.com 格式的來源整批被跳過，永遠搬不到 R2。
      const isDriveSource = srcVal && (srcVal.includes('drive.google.com') || srcVal.includes('googleusercontent.com'));
      if (!isDriveSource) return; // 沒有 Drive 來源可搬
      if (srcVal.includes('/folders/')) return; // 保險：來源本身是資料夾連結就跳過，不當檔案上傳
      // 🚩 目標欄位必須「已經是真正的 R2 網址」才算搬過；舊資料裡有不少欄位其實殘留 Drive
      // 資料夾連結（不是真的 R2 網址），只看 http 會誤判成已遷移而永遠跳過、搬不到真正的圖。
      if (dstVal && r2Domain && dstVal.indexOf(r2Domain) === 0) { skipped++; return; } // 已經搬過

      const fileIdMatch = srcVal.match(/[-\w]{25,}/);
      if (!fileIdMatch) { failed++; return; }
      const fileId = fileIdMatch[0];

      try {
        const blob = DriveApp.getFileById(fileId).getBlob();
        const ext = String(blob.getContentType() || '').includes('png') ? 'png' : 'jpg';
        const fileName = code + '_' + m.key + '_' + fileId.substring(0, 8) + '.' + ext;
        const result = uploadBlobToR2(blob, fileName);
        if (result.success) {
          sheet.getRange(i + 1, dstIdx + 1).setValue(result.url);
          data[i][dstIdx] = result.url; // 同步更新記憶體中的資料，避免同一列其他欄位判斷用到舊值
          uploaded++;
        } else {
          console.error(`上傳失敗 ${code} ${m.dst}：${result.error}`);
          failed++;
        }
      } catch (e) {
        console.error(`處理失敗 ${code} ${m.dst}：${e}`);
        failed++;
      }
    });
  }

  props.deleteProperty('R2_MIGRATION_LAST_ROW');
  props.setProperty('R2_MIGRATION_DONE', 'true');
  console.log(`🎉 全部遷移完成！本次成功上傳 ${uploaded} 張，跳過 ${skipped} 張（已有R2或無來源），失敗 ${failed} 張。`);
}

/** 🚩 [輔助] 每 10 分鐘自動跑一次遷移，直到完成才自動移除觸發器，不用手動一直按執行 */
function setupR2MigrationTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'runR2MigrationTriggered') ScriptApp.deleteTrigger(t);
  });
  PropertiesService.getScriptProperties().deleteProperty('R2_MIGRATION_DONE');
  ScriptApp.newTrigger('runR2MigrationTriggered').timeBased().everyMinutes(10).create();
  console.log('✅ 已設定每 10 分鐘自動遷移一次，跑完會自動停止。');
}

function runR2MigrationTriggered() {
  if (PropertiesService.getScriptProperties().getProperty('R2_MIGRATION_DONE') === 'true') {
    ScriptApp.getProjectTriggers().forEach(t => {
      if (t.getHandlerFunction() === 'runR2MigrationTriggered') ScriptApp.deleteTrigger(t);
    });
    console.log('✅ 遷移已完成，自動移除排程觸發器。');
    return;
  }
  runFullImageMigrationToR2();
}

/** 🚩 [輔助] 立即（約1秒後）排一次遷移，不用等排程的 10 分鐘，呼叫本身馬上回應不會卡住 */
function scheduleImmediateR2Batch() {
  ScriptApp.newTrigger('runR2MigrationTriggered').timeBased().after(1000).create();
}

/** 🚩 [輔助] 重置遷移進度，從第一列重新開始掃描（不會重複上傳已經是真正 R2 網址的欄位，只是重新掃一次） */
function resetR2MigrationProgress() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty('R2_MIGRATION_LAST_ROW');
  props.deleteProperty('R2_MIGRATION_DONE');
  console.log('✅ 進度已重置，下次執行會從第一列重新掃描。');
}

/** 🚩 [診斷] 查看目前遷移進度 */
function getR2MigrationStats() {
  const props = PropertiesService.getScriptProperties();
  const lastRow = props.getProperty('R2_MIGRATION_LAST_ROW');
  const done = props.getProperty('R2_MIGRATION_DONE') === 'true';
  console.log('狀態：' + (done ? '✅ 已完成' : (lastRow ? '⏳ 進行中，上次處理到第 ' + lastRow + ' 列' : '尚未開始')));
}

/** 🚩 [畫面用] 彙整目前遷移進度給 buildR2DashboardHtml_ 畫圖用 */
function getR2MigrationDashboardData() {
  const props = PropertiesService.getScriptProperties();
  const lastRow = parseInt(props.getProperty('R2_MIGRATION_LAST_ROW') || '0');
  const done = props.getProperty('R2_MIGRATION_DONE') === 'true';
  const r2Domain = String(props.getProperty('R2_PUBLIC_DOMAIN') || '').trim();

  const ss = getSpreadsheetInstance();
  const sheet = ss.getSheetByName('編輯價目表') || ss.getSheetByName('編號價目表');
  if (!sheet) return { error: '找不到編號價目表' };

  const totalRows = sheet.getLastRow() - 1;
  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim());

  let totalUploaded = 0;
  let sampleUrl = '';
  const perColumn = [];
  R2_MIGRATION_MAP.forEach(function(m) {
    const idx = header.indexOf(m.dst);
    if (idx === -1 || totalRows <= 0) { perColumn.push({ name: m.dst, filled: 0 }); return; }
    const col = sheet.getRange(2, idx + 1, totalRows, 1).getValues();
    const isReal = function(r) { return r2Domain && String(r[0] || '').indexOf(r2Domain) === 0; };
    const filled = col.filter(isReal).length;
    perColumn.push({ name: m.dst, filled: filled });
    totalUploaded += filled;
    if (!sampleUrl) {
      const f = col.find(isReal);
      if (f) sampleUrl = String(f[0]);
    }
  });

  return {
    lastRow: done ? totalRows : lastRow,
    totalRows: totalRows,
    done: done,
    totalUploaded: totalUploaded,
    perColumn: perColumn,
    sampleUrl: sampleUrl,
    updatedAt: new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })
  };
}

/** 🚩 [畫面用] 把上面的進度資料畫成一頁 HTML（每 15 秒自動整理，帶「立即執行下一批」按鈕） */
function buildR2DashboardHtml_(stats, key) {
  if (!stats || stats.error) {
    return '<p style="font-family:sans-serif;color:red;text-align:center;margin-top:40px;">' + escapeHtml((stats && stats.error) || '讀取失敗') + '</p>';
  }
  const pct = stats.totalRows > 0 ? Math.min(100, Math.round((stats.lastRow / stats.totalRows) * 100)) : 0;
  const statusLabel = stats.done ? '✅ 已完成' : (stats.lastRow > 0 ? '⏳ 進行中' : '尚未開始');
  const baseUrl = ScriptApp.getService().getUrl();
  const runUrl = baseUrl + '?ac=runR2MigrationAsync&key=' + encodeURIComponent(key);

  const rows = stats.perColumn.map(function(c) {
    return '<div class="col-row"><span class="col-name">' + escapeHtml(c.name) + '</span><span class="col-count">' + c.filled + ' / ' + stats.totalRows + '</span></div>';
  }).join('');

  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + (stats.done ? '' : '<meta http-equiv="refresh" content="15">')
    + '<title>R2 圖片遷移進度</title><style>'
    + "body{font-family:-apple-system,'PingFang TC',sans-serif;background:#f8fafc;margin:0;padding:24px;color:#1e293b;}"
    + '.card{max-width:560px;margin:0 auto;background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);padding:32px;}'
    + 'h1{font-size:1.1rem;margin:0 0 4px;}'
    + '.status{font-size:.85rem;color:#64748b;margin-bottom:20px;}'
    + '.bar-track{width:100%;height:22px;background:#e8e8e8;border-radius:11px;overflow:hidden;margin-bottom:8px;}'
    + '.bar-fill{height:100%;background:linear-gradient(90deg,#667eea,#764ba2);border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:700;color:#fff;transition:width .4s ease;width:' + pct + '%;}'
    + '.bar-caption{font-size:.8rem;color:#64748b;margin-bottom:24px;}'
    + '.stat-big{font-size:2rem;font-weight:700;margin-bottom:4px;}'
    + '.stat-label{font-size:.8rem;color:#64748b;margin-bottom:24px;}'
    + '.col-list{border-top:1px solid #eee;padding-top:12px;}'
    + '.col-row{display:flex;justify-content:space-between;font-size:.82rem;padding:4px 0;color:#334155;}'
    + '.col-name{color:#64748b;}'
    + '.btn{display:inline-block;margin-top:20px;padding:10px 18px;background:#667eea;color:#fff;border-radius:10px;text-decoration:none;font-size:.85rem;font-weight:600;}'
    + '.updated{font-size:.72rem;color:#94a3b8;margin-top:16px;text-align:right;}'
    + '</style></head><body><div class="card">'
    + '<h1>R2 圖片遷移進度</h1>'
    + '<div class="status">' + statusLabel + (stats.done ? '' : '（每 15 秒自動整理畫面）') + '</div>'
    + '<div class="bar-track"><div class="bar-fill">' + pct + '%</div></div>'
    + '<div class="bar-caption">掃描進度：第 ' + stats.lastRow + ' / ' + stats.totalRows + ' 列</div>'
    + '<div class="stat-big">' + stats.totalUploaded + '</div>'
    + '<div class="stat-label">張圖片已真正搬到 R2</div>'
    + '<div class="col-list">' + rows + '</div>'
    + (stats.done ? '' : '<a class="btn" href="' + escapeHtml(runUrl) + '">立即執行下一批</a>')
    + '<div class="updated">更新時間：' + escapeHtml(stats.updatedAt) + '</div>'
    + '</div></body></html>';
}

/** 1. 業務查詢通知：當客戶貨量不足時，通知負責業務（推私人 TG）+ 彙整至公佈欄 */
function handleSalesPush(auth, queries, fullReply, userId) {
  const isQueryingQty = queries.some(q => q.includes('坪') || q.includes('片') || q.includes('p'));
  const isProblematic = fullReply.includes('❌') || fullReply.includes('🟠') || fullReply.includes('不足');
  
  if ((auth.level === 'free' || auth.level === 'class') && isQueryingQty && isProblematic) {
    // 依「業務分區表」依客戶名稱查負責業務（保留單的 salesID 僅作顯示標籤，不作收件人）
    const bizMap = _getBusinessZoneBizMap_();
    let biz = '';
    // 客戶名稱可能是「客戶-業務」格式（例如 鼎晨-正霖），拆出真正客戶名與提示業務名
    let cust = String(auth.name || '').trim();
    let hintedBiz = '';
    const parts = cust.split(/[-－—–]/);
    if (parts.length > 1) {
      cust = parts[0].trim();
      hintedBiz = parts[parts.length - 1].trim();
    }
    try {
      biz = cust ? (bizMap[cust] || '') : '';
      if (!biz && hintedBiz) biz = hintedBiz;
    } catch (e) { console.error('查客戶業務分區失敗：' + e); }
    const salesLabel = biz || auth.salesID || '未指派';
    const msg = `📥 客戶貨量預警\n` +
                `[${salesLabel}]\n` +
                `──────\n` +
                `👤 業務：${biz || '未指派'}\n` +
                `👥 客戶：${cust}\n` +
                `💬 內容：${queries.join(' ')}\n\n` +
                `📎 系統回覆摘要：\n${fullReply.substring(0, 150)}...`;

    // 只推一則：有負責業務私人 Telegram 就推他；否則改推公佈欄（不再重複彙整）
    const bizChatId = resolveBusinessTelegramChatId(biz);
    if (bizChatId) {
      pushTelegramTo(bizChatId, msg);
    } else {
      pushTelegram(msg + '\n\n⚠️ 業務未設定私人 Telegram，改推公佈欄。');
    }
  }
}

/** 讀取業務分區表 → { 客戶名稱: 負責業務 }（依 gid 鎖定，含名稱 trim 與大小寫相容） */
function _getBusinessZoneBizMap_() {
  const bizMap = {};
  try {
    const zData = getBusinessZoneData_();
    if (zData && zData.length > 1) {
      const zMap = getHeaderMap(zData);
      const zCust = zMap['客戶'];
      const zBiz = zMap['負責業務'] !== undefined ? zMap['負責業務'] : zMap['業務'];
      if (zCust !== undefined && zBiz !== undefined) {
        zData.slice(1).forEach(zr => {
          const c = String(zr[zCust] || '').trim();
          const b = String(zr[zBiz] || '').trim();
          if (c && b) bizMap[c] = b;
        });
      }
    }
  } catch (e) { console.error('讀取業務分區表失敗：' + e); }
  return bizMap;
}

/** 2. 保留追蹤通知（Telegram 30/45/60 天分級，推給負責客戶的業務私人 Telegram）
 * 排程：一=30、二=45、三=60、四=30、五=45；只抓「第一次滿期」，週末/假日自動順延。
 * 保留單來源：FORM_SS（1WpBX1Bj...，真正保留單，DATA_SS 內是同步副本）。
 */
const RESERVE_SS_GID = '8381823';
const BUSINESS_ZONE_GID = '905576007';

/** 取得真正保留單所在試算表（FORM_SS） */
function getReserveSpreadsheet() { return SpreadsheetApp.openById(CONFIG.FORM_SS_ID); }

/** 讀取 DATA_SS「業務分區」表（客戶 → 負責業務），依 gid 鎖定分頁 */
function getBusinessZoneData_() {
  try {
    const ss = getSpreadsheetInstance();
    let sh = null;
    try {
      const target = ss.getSheets().find(s => String(s.getSheetId()) === BUSINESS_ZONE_GID);
      if (target) sh = target;
    } catch (e) { console.error('依 gid 找業務分區分頁失敗：' + e); }
    if (!sh) sh = ss.getSheetByName('業務分區');
    if (!sh) return [];
    return sh.getDataRange().getValues();
  } catch (e) { console.error('讀取業務分區分頁失敗：' + e); return []; }
}

/** 依 gid 精準鎖定「高雅瓷保留」分頁（防分頁改名失效），找不到再依名稱 */
function getReserveSheet_() {
  const ss = getReserveSpreadsheet();
  try {
    const target = ss.getSheets().find(s => String(s.getSheetId()) === RESERVE_SS_GID);
    if (target) return target;
  } catch (e) { console.error('依 gid 找保留單分頁失敗：' + e); }
  return ss.getSheetByName('高雅瓷保留') || ss.getSheetByName(SHEET_NAME.MAIN) || ss.getSheetByName('保留單');
}

function sendReservationExpiryAlerts(force) {
  const THRESHOLDS = { 1: 30, 2: 45, 3: 60, 4: 30, 5: 45 };
  const now = new Date();
  const dow = now.getDay();
  if (!force && (dow === 0 || dow === 6)) return;
  if (!force && isTaiwanHoliday()) return;
  const threshold = force ? 30 : (THRESHOLDS[dow] || 0);
  if (!threshold) return;

  const ss = getReserveSpreadsheet();
  const reserveSheet = getReserveSheet_();
  if (!reserveSheet) return;
  const reserveData = reserveSheet.getDataRange().getValues();
  if (reserveData.length < 2) return;
  const h = getHeaderMap(reserveData);

  const idxCust   = h['客戶'];
  const idxCode   = h['編號'];
  const idxPcs    = h['數量'];
  const idxCase   = h['案名'];
  const idxAddr   = h['工地'] >= 0 ? h['工地'] : h['地址'];
  const idxDate   = h['保留日期'] >= 0 ? h['保留日期'] : h['日期'];
  const idxDep    = h['訂金確認'];
  const idxNote   = h['備註'];
  const idxUpdate = h['telegram更新'] >= 0 ? h['telegram更新'] : h['Telegram更新'];
  const idxStatus = h['已合約確認'];
  if (idxDate < 0 || idxCode < 0) return;

  const today = new Date(); today.setHours(0, 0, 0, 0);

  // 已通知紀錄（避免同一門檻重複發）
  const logSheet = getReserveReminderLogSheet_(ss);
  const logData = logSheet ? logSheet.getDataRange().getValues() : [];
  const notifiedKeys = new Set();
  logData.slice(1).forEach(r => {
    notifiedKeys.add(_reserveLogKey_(r[2], r[3], r[4], r[6], r[1]));
  });

  // 依「客戶名稱」查業務分區表 → 負責業務（保留單的客戶業務欄僅作備援）
  const bizMap = _getBusinessZoneBizMap_();

  // 收集滿期且未通知過者，依「客戶+案名」分組（一案一訊息）
  const cases = {};
  for (let i = 1; i < reserveData.length; i++) {
    const r = reserveData[i];
    const rawDate = r[idxDate];
    if (!rawDate) continue;
    let rDate;
    try { rDate = (rawDate instanceof Date) ? new Date(rawDate) : new Date(String(rawDate)); } catch (e) { continue; }
    if (isNaN(rDate.getTime())) continue;
    rDate.setHours(0, 0, 0, 0);

    const status = idxStatus >= 0 ? String(r[idxStatus] || '').trim() : '';
    if (status.includes('取消')) continue;

    const days = Math.floor((today.getTime() - rDate.getTime()) / 86400000);
    if (days < threshold) continue;

    const cust     = String(r[idxCust] || '未填').trim();
    const biz      = bizMap[cust] || '未指定';
    const caseName = String(r[idxCase] || (idxAddr >= 0 ? r[idxAddr] : '') || '未命名').trim();
    const code     = String(r[idxCode] || '?').trim().toUpperCase();
    const pcs      = r[idxPcs] || '';
    const dateStr  = Utilities.formatDate(rDate, 'GMT+8', 'yyyy/MM/dd');
    const key      = _reserveLogKey_(cust, caseName, code, dateStr, threshold);
    if (notifiedKeys.has(key)) continue;

    const cKey = cust + '|' + caseName;
    if (!cases[cKey]) cases[cKey] = { cust, caseName, biz, rows: [] };
    cases[cKey].rows.push({
      code, pcs, dateStr, key, row: i + 1,
      note: idxNote >= 0 ? r[idxNote] : '',
      dep: idxDep >= 0 ? r[idxDep] : '',
      update: idxUpdate >= 0 ? r[idxUpdate] : ''
    });
  }

  if (Object.keys(cases).length === 0) return;

  const serviceUrl = ScriptApp.getService().getUrl();
  const notified = [];

  Object.keys(cases).sort().forEach(cKey => {
    const c = cases[cKey];
    const payload = {
      c: c.cust, k: c.caseName,
      ids: c.rows.map(x => x.code).join(','),
      rows: c.rows.map(x => x.row).join(','),
      d: c.rows[0].dateStr,
      t: threshold,
      biz: c.biz
    };
    const renewAc = threshold >= 45 ? 'renewReserveWeb' : 'renewReserve';
    const renewUrl  = _buildReserveActionUrl_(serviceUrl, renewAc, payload);
    const cancelUrl = _buildReserveActionUrl_(serviceUrl, 'cancelReserve', payload);
    const text = _buildReserveMessage_(threshold, c);
    const buttons = [
      [{ text: '✅ 繼續保留', url: renewUrl }],
      [{ text: '❌ 取消保留', url: cancelUrl }]
    ];

    const bizChatId = resolveBusinessTelegramChatId(c.biz);
    if (bizChatId) {
      pushTelegramTo(bizChatId, text, buttons);
    } else {
      // 業務未設定個人 Telegram → 退回公佈欄，避免漏通知
      pushTelegram(text + '\n\n⚠️ 業務未設定私人 Telegram，改推公佈欄。', buttons);
    }
    notified.push({ biz: c.biz, cust: c.cust, caseName: c.caseName, count: c.rows.length, fallback: !bizChatId });

    c.rows.forEach(x => {
      _appendReserveReminder_(logSheet, { threshold, cust: c.cust, caseName: c.caseName, ids: x.code, qty: x.pcs, reserveDate: x.dateStr });
    });
  });

  // 彙整回公佈欄群組
  let summary = `📋 保留追蹤通知彙整（滿 ${threshold} 天）\n──────────\n`;
  notified.forEach(n => {
    summary += `👤 ${n.biz}\n  🏠 ${n.cust}｜${n.caseName}（${n.count} 筆）${n.fallback ? '⚠️未設定TG' : ''}\n`;
  });
  summary += `\n— 高雅瓷 AI 客服`;
  pushTelegram(summary);
}

function _buildReserveMessage_(threshold, c) {
  let text;
  if (threshold === 30) text = '您好，下列保留已滿 30 天\n請問還需繼續幫您保留嗎?';
  else if (threshold === 45) text = '您好，下列保留已滿 45 天囉，需要支付訂金來繼續保留囉!';
  else text = '您好，下列保留已滿 60 天囉，需要支付訂金來繼續保留囉!';

  text += '\n──────────\n';
  text += `客戶：${c.cust}\n`;
  text += `業務：${c.biz}\n`;
  text += `案名：${c.caseName}\n`;
  text += `編號：${c.rows.map(x => x.code + (x.pcs ? '×' + x.pcs : '')).join('、')}\n`;
  text += `日期：${c.rows[0].dateStr}\n`;
  const notes = c.rows.map(x => x.note).filter(Boolean);
  if (notes.length) text += `備註：${notes.join('、')}\n`;
  const updates = c.rows.map(x => x.update).filter(Boolean);
  if (updates.length) text += `更新：${updates.join('、')}\n`;
  const deps = c.rows.map(x => x.dep).filter(Boolean);
  if (deps.length) text += `訂金：${deps.join('、')}\n`;
  return text;
}

function _buildReserveActionUrl_(serviceUrl, ac, payload) {
  const p = { ac };
  ['c', 'k', 'ids', 'rows', 'd', 't', 'biz'].forEach(k => {
    if (payload[k]) p[k] = payload[k];
  });
  const qs = Object.keys(p).map(k => `${encodeURIComponent(k)}=${encodeURIComponent(p[k])}`).join('&');
  return serviceUrl + '?' + qs;
}

function _reserveLogKey_(cust, caseName, code, dateStr, threshold) {
  let dStr = '';
  if (dateStr instanceof Date) {
    dStr = Utilities.formatDate(dateStr, 'GMT+8', 'yyyy/MM/dd');
  } else if (dateStr) {
    const dVal = new Date(dateStr);
    if (!isNaN(dVal.getTime())) {
      dStr = Utilities.formatDate(dVal, 'GMT+8', 'yyyy/MM/dd');
    } else {
      dStr = String(dateStr).trim();
    }
  }
  return [String(cust || '').trim(), String(caseName || '').trim(), String(code || '').trim(), dStr, String(threshold)].join('|');
}

/** 取得「保留通知紀錄」工作表（不存在則建立） */
function getReserveReminderLogSheet_(ss) {
  const sh = ss.getSheetByName('保留通知紀錄');
  if (sh) return sh;
  const ns = ss.insertSheet('保留通知紀錄');
  const headers = ['通知日期', '門檻', '客戶', '案名', '編號', '數量', '保留日期', '狀態', '處理時間'];
  ns.appendRow(headers);
  ns.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#D9E1F2');
  return ns;
}

function _appendReserveReminder_(logSheet, o) {
  try {
    logSheet.appendRow([
      Utilities.formatDate(new Date(), 'GMT+8', 'yyyy/MM/dd HH:mm'),
      o.threshold, o.cust, o.caseName, o.ids, o.qty, o.reserveDate, '已通知', ''
    ]);
  } catch (e) { console.error('寫入保留通知紀錄失敗：' + e); }
}

/** 將「保留通知紀錄」中符合 key 的列標記為已處理（續保/取消） */
function _markReserveReminderDone_(ss, key, status) {
  try {
    const logSheet = ss.getSheetByName('保留通知紀錄');
    if (!logSheet) return;
    const data = logSheet.getDataRange().getValues();
    if (data.length < 2) return;
    const h = getHeaderMap(data);
    const iCust = h['客戶'], iCase = h['案名'], iCode = h['編號'], iDate = h['保留日期'],
          iTh = h['門檻'], iStatus = h['狀態'], iTime = h['處理時間'];
    if (iCust === undefined || iCase === undefined || iCode === undefined ||
        iDate === undefined || iTh === undefined || iStatus === undefined || iTime === undefined) return;
    const now = Utilities.formatDate(new Date(), 'GMT+8', 'yyyy/MM/dd HH:mm');
    for (let i = 1; i < data.length; i++) {
      const k = _reserveLogKey_(data[i][iCust], data[i][iCase], data[i][iCode], data[i][iDate], data[i][iTh]);
      if (k === key) {
        logSheet.getRange(i + 1, iStatus + 1).setValue(status);
        logSheet.getRange(i + 1, iTime + 1).setValue(now);
      }
    }
  } catch (e) { console.error('更新保留通知紀錄失敗：' + e); }
}

/** 追加一筆到「業務回報記錄」（依表頭對齊，缺欄則補建表） */
function _appendBusinessReport_(ss, o) {
  let sh = ss.getSheetByName('業務回報記錄');
  if (!sh) {
    sh = ss.insertSheet('業務回報記錄');
    const headers = ['日期時間', '客戶', '案名', '編號', '數量', '門檻(天)', '動作', '原因', '業務'];
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#D9E1F2');
  }
  const data = sh.getDataRange().getValues();
  const map = getHeaderMap(data);
  const width = sh.getLastColumn() > 0 ? sh.getLastColumn() : 9;
  const row = new Array(width).fill('');
  const fields = {
    '日期時間': Utilities.formatDate(new Date(), 'GMT+8', 'yyyy/MM/dd HH:mm'),
    '客戶': o.cust, '案名': o.caseName, '編號': o.code, '數量': o.qty,
    '門檻(天)': o.threshold, '動作': o.action, '原因': o.reason, '業務': o.biz
  };
  Object.keys(fields).forEach(name => {
    const idx = map[name];
    if (idx !== undefined && idx >= 0 && idx < width) row[idx] = fields[name];
  });
  sh.appendRow(row);
}

/** doGet 處理 Telegram 保留追蹤按鈕：續保(30) / 續保填原因(45/60) / 取消保留 */
function handleReserveTelegramAction(params) {
  const ac = String(params.ac || '').trim();
  const c = _safeDecode_(params.c || '');
  const k = _safeDecode_(params.k || '');
  const ids = _safeDecode_(params.ids || '');
  const rows = _safeDecode_(params.rows || '');
  const d = _safeDecode_(params.d || '');
  const t = _safeDecode_(params.t || '');
  const biz = _safeDecode_(params.biz || '');
  const reason = _safeDecode_(params.reason || '');
  const threshold = parseInt(t, 10) || 0;

  const missing = !c || !k || !ids || !rows || !d || !threshold;
  if (missing) {
    return _renderReserveResultPage_('操作失敗', '&#10007;', '#dc2626', ['缺少必要參數']);
  }

  // 45/60 → 先顯示續保原因填寫表單
  if (ac === 'renewReserveWeb') {
    const app = HtmlService.createHtmlOutput();
    const serviceUrl = ScriptApp.getService().getUrl();
    const esc = v => escapeHtml(String(v || ''));
    app.append(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>續保原因</title><style>body{font-family:-apple-system,'PingFang TC',sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f0f4f8}.card{background:#fff;padding:32px;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:400px;margin:20px;width:100%}h2{color:#1e293b;margin:0 0 6px;font-size:20px}.sub{color:#64748b;font-size:14px;margin-bottom:16px}.row{color:#334155;font-size:14px;margin:4px 0}textarea{width:100%;min-height:110px;box-sizing:border-box;padding:12px;border:1px solid #cbd5e1;border-radius:10px;font-size:15px;font-family:inherit;margin-top:16px}button{width:100%;margin-top:16px;padding:14px;background:#1e40af;color:#fff;border:none;border-radius:10px;font-size:16px;cursor:pointer}</style></head><body><div class="card"><h2>✅ 續保原因</h2><p class="sub">保留滿 ${threshold} 天，請填寫續保原因</p><div class="row">客戶：${esc(c)}</div><div class="row">案名：${esc(k)}</div><div class="row">編號：${esc(ids)}</div><form method="get" action="${serviceUrl}" onsubmit="var b=document.getElementById('r');if(!b.value.trim()){alert('請填寫續保原因');return false;}"><input type="hidden" name="ac" value="renewReserveSubmit"><input type="hidden" name="c" value="${esc(c)}"><input type="hidden" name="k" value="${esc(k)}"><input type="hidden" name="ids" value="${esc(ids)}"><input type="hidden" name="rows" value="${esc(rows)}"><input type="hidden" name="d" value="${esc(d)}"><input type="hidden" name="t" value="${esc(t)}"><input type="hidden" name="biz" value="${esc(biz)}"><textarea id="r" name="reason" placeholder="請輸入續保原因…" required></textarea><button type="submit">送出</button></form></div></body></html>`);
    return app;
  }

  if (ac === 'renewReserve' || ac === 'renewReserveSubmit' || ac === 'cancelReserve') {
    const action = ac === 'cancelReserve' ? 'cancel' : 'renew';
    if (ac === 'renewReserveSubmit' && !reason) {
      return _renderReserveResultPage_('操作失敗', '&#10007;', '#dc2626', ['請填寫續保原因']);
    }
    const res = _processReserveAction_({ action, cust: c, caseName: k, ids, rows, dateStr: d, threshold, biz, reason, ss: getReserveSpreadsheet() });
    if (res.success) {
      const label = action === 'cancel' ? '已取消保留' : '已續保';
      return _renderReserveResultPage_(label, '&#10003;', '#059669', [`客戶：${res.cust}`, `案名：${res.caseName}`, `共 ${res.count} 筆`]);
    }
    return _renderReserveResultPage_('操作失敗', '&#10007;', '#dc2626', [res.error || '發生例外']);
  }

  return _renderReserveResultPage_('操作失敗', '&#10007;', '#dc2626', ['未知動作']);
}

function _processReserveAction_(o) {
  const ss = o.ss;
  const reserveSheet = getReserveSheet_();
  if (!reserveSheet) return { success: false, error: '找不到保留單分頁' };

  const data = reserveSheet.getDataRange().getValues();
  if (data.length < 2) return { success: false, error: '保留單沒有資料' };
  const h = getHeaderMap(data);
  const iCust = h['客戶'];
  const iCase = h['案名'];
  const iAddr = h['工地'] >= 0 ? h['工地'] : h['地址'];
  const iCode = h['編號'];
  const iQty = h['數量'];
  const iStatus = h['已合約確認'];
  const iUpdate = h['telegram更新'] >= 0 ? h['telegram更新'] : h['Telegram更新'];
  if (iCust === undefined || iCode === undefined) return { success: false, error: '保留單欄位不完整' };

  const rowNumbers = String(o.rows || '').split(',').map(x => parseInt(x, 10)).filter(n => n > 1);
  const idList = String(o.ids || '').split(',').map(x => String(x).trim().toUpperCase()).filter(Boolean);
  if (rowNumbers.length === 0) return { success: false, error: '缺少目標列' };

  const nowStr = Utilities.formatDate(new Date(), 'GMT+8', 'yyyy/MM/dd HH:mm');
  const matched = [];

  rowNumbers.forEach(rowIdx => {
    const r = data[rowIdx - 1];
    if (!r) return;
    const rCust = String(r[iCust] || '').trim();
    const rCase = String(r[iCase] || (iAddr >= 0 ? r[iAddr] : '') || '').trim();
    if (rCust !== o.cust || rCase !== o.caseName) return; // 列位置已位移 → 不誤改
    const code = String(r[iCode] || '').trim().toUpperCase();
    if (idList.length && !idList.includes(code)) return;
    matched.push({ row: rowIdx, code, qty: iQty !== undefined ? r[iQty] : '' });

    if (o.action === 'cancel') {
      if (iStatus >= 0) reserveSheet.getRange(rowIdx, iStatus + 1).setValue('取消');
    } else {
      const base = o.threshold >= 45 && o.reason ? `續保原因：${o.reason}` : '續保';
      if (iUpdate >= 0) {
        reserveSheet.getRange(rowIdx, iUpdate + 1).setValue(`[${nowStr}] ✅ ${base}`);
      }
    }
  });

  if (matched.length === 0) return { success: false, error: '找不到符合的保留資料，可能已被更新或列位置變動' };

  matched.forEach(m => {
    _appendBusinessReport_(ss, {
      cust: o.cust, caseName: o.caseName, code: m.code, qty: m.qty,
      threshold: o.threshold,
      action: o.action === 'cancel' ? '取消保留' : '續保',
      reason: o.action === 'cancel' ? '' : (o.reason || ''),
      biz: o.biz
    });
  });

  // 更新保留通知紀錄狀態
  idList.forEach(code => {
    _markReserveReminderDone_(ss, _reserveLogKey_(o.cust, o.caseName, code, o.dateStr, o.threshold), o.action === 'cancel' ? '取消' : '續保');
  });

  return { success: true, count: matched.length, cust: o.cust, caseName: o.caseName };
}

/** 取得客戶自己的公司前綴，沿用 handleReserveSearch（2_Business.js）同一套判斷方式 */
function _resolveMyCompanyPrefix_(auth) {
  const myNameRaw = String((auth && auth.name) || '');
  const companyFromName = myNameRaw.includes('-') ? myNameRaw.split('-')[0] : '';
  return (companyFromName || String((auth && auth.company) || '') || myNameRaw).trim();
}

/**
 * 🚩 [客戶自助] 撈出這個客戶公司名下所有保留單列，給「我的保留單」LIFF 頁面用。
 * 直接讀 getReserveSheet_() 這張真正的實體分頁（不是 getMainSheet() 那種混合暫存資料的虛擬視圖），
 * 這樣拿到的列號才是真正可以拿去改的實體列號。
 */
function getMyReservationsData_(auth) {
  const companyPrefix = _resolveMyCompanyPrefix_(auth);
  if (!companyPrefix) return { success: false, error: '無法判斷您的公司名稱' };

  const sheet = getReserveSheet_();
  if (!sheet) return { success: false, error: '找不到保留單分頁' };
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return { success: true, company: companyPrefix, items: [] };
  const h = getHeaderMap(data);
  const idxCust = h['客戶'];
  const idxCode = h['編號'];
  const idxQty = h['數量'];
  const idxCase = h['案名'];
  const idxAddr = h['工地'] >= 0 ? h['工地'] : h['地址'];
  const idxDate = h['保留日期'] >= 0 ? h['保留日期'] : h['日期'];
  const idxStatus = h['已合約確認'];
  if (idxCust === undefined || idxCode === undefined || idxQty === undefined) {
    return { success: false, error: '保留單欄位不完整' };
  }

  const prefixLower = companyPrefix.toLowerCase();
  const items = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r || r.every(v => !v)) continue;
    const cust = String(r[idxCust] || '').trim();
    if (!cust || cust.toLowerCase().indexOf(prefixLower) === -1) continue;
    const status = idxStatus >= 0 ? String(r[idxStatus] || '').trim() : '';
    if (status.indexOf('取消') !== -1) continue; // 已取消的不再顯示

    const code = String(r[idxCode] || '').trim();
    if (!code) continue;
    const qty = safeN(r[idxQty]);
    const caseName = idxCase >= 0 ? String(r[idxCase] || '').trim() : '';
    const addr = idxAddr >= 0 ? String(r[idxAddr] || '').trim() : '';

    let dateStr = '';
    const dVal = idxDate >= 0 ? r[idxDate] : null;
    if (dVal instanceof Date) dateStr = Utilities.formatDate(dVal, 'Asia/Taipei', 'yyyy/MM/dd');
    else if (dVal) {
      const dp = new Date(String(dVal));
      dateStr = !isNaN(dp.getTime()) ? Utilities.formatDate(dp, 'Asia/Taipei', 'yyyy/MM/dd') : String(dVal);
    }

    items.push({ row: i + 1, cust: cust, code: code, qty: qty, caseName: caseName || addr || '', date: dateStr });
  }
  return { success: true, company: companyPrefix, items: items };
}

/**
 * 🚩 [客戶自助] 客戶修改自己一筆保留單的數量。
 * 數量減少/取消（newQty <= 目前數量）：直接套用，Telegram 公佈欄 FYI 通知。
 * 數量增加（newQty > 目前數量）：不直接套用，改發帶核准/拒絕按鈕的 Telegram 到公佈欄，
 * 業務點核准才會真的寫進保留單（沿用 approveReserveIncrease/denyReserveIncrease 這兩個 doGet action）。
 */
function updateMyReservationRow_(auth, rowNum, cust, code, newQtyRaw) {
  const sheet = getReserveSheet_();
  if (!sheet) return { success: false, error: '找不到保留單分頁' };
  const data = sheet.getDataRange().getValues();
  const h = getHeaderMap(data);
  const idxCust = h['客戶'];
  const idxCode = h['編號'];
  const idxQty = h['數量'];
  const idxStatus = h['已合約確認'];
  const idxCase = h['案名'];
  const idxAddr = h['工地'] >= 0 ? h['工地'] : h['地址'];
  if (idxCust === undefined || idxCode === undefined || idxQty === undefined) {
    return { success: false, error: '保留單欄位不完整' };
  }

  const r = data[rowNum - 1];
  if (!r) return { success: false, error: '找不到符合的保留資料，可能已被更新或列位置變動' };
  const rCust = String(r[idxCust] || '').trim();
  const rCode = String(r[idxCode] || '').trim().toUpperCase();
  // 🛡️ 防呆：列位置可能因為排序/新增列而位移，重新比對客戶+編號，不吻合就拒絕，不會靜默改錯列
  if (rCust !== String(cust || '').trim() || rCode !== String(code || '').trim().toUpperCase()) {
    return { success: false, error: '找不到符合的保留資料，可能已被更新或列位置變動' };
  }

  // 🛡️ 權限：這列客戶必須跟呼叫者自己的公司吻合，不能改到別家公司的保留
  const companyPrefix = _resolveMyCompanyPrefix_(auth).toLowerCase();
  if (!companyPrefix || rCust.toLowerCase().indexOf(companyPrefix) === -1) {
    return { success: false, error: '無權限修改此筆保留' };
  }

  // 🛡️ 這裡故意不直接用 safeN（它對任何無法解析的輸入都會安靜回傳 0），避免前端傳壞資料時
  // 被誤判成「改成 0 片」而觸發取消；先嚴格檢查是不是一個合法的非負數字。
  if (!/^\d+(\.\d+)?$/.test(String(newQtyRaw || '').trim())) {
    return { success: false, error: '數量格式不正確' };
  }
  const oldQty = safeN(r[idxQty]);
  const nq = safeN(newQtyRaw);

  const caseName = idxCase >= 0 ? String(r[idxCase] || '').trim() : '';
  const addr = idxAddr >= 0 ? String(r[idxAddr] || '').trim() : '';
  const displayCase = caseName || addr || '';

  if (nq <= oldQty) {
    // 減少或取消：立即套用
    sheet.getRange(rowNum, idxQty + 1).setValue(nq);
    if (nq === 0 && idxStatus >= 0) sheet.getRange(rowNum, idxStatus + 1).setValue('客戶取消');
    const actionLabel = nq === 0 ? '客戶自行取消保留' : '客戶自行調整保留（減少）';
    try {
      pushTelegram(`📋 ${actionLabel}\n客戶：${rCust}\n案名：${displayCase}\n編號：${rCode}\n數量：${oldQty} → ${nq} 片`);
    } catch (e) {}
    try {
      _appendBusinessReport_(getReserveSpreadsheet(), {
        cust: rCust, caseName: displayCase, code: rCode, qty: nq,
        threshold: '', action: nq === 0 ? '客戶取消' : '客戶調整(減少)', reason: '', biz: ''
      });
    } catch (e) {}
    return { success: true, applied: true, oldQty: oldQty, newQty: nq };
  }

  // 增加：不直接套用，發審核通知到公佈欄
  const baseUrl = ScriptApp.getService().getUrl();
  const encode = obj => Object.keys(obj).map(k => k + '=' + encodeURIComponent(obj[k])).join('&');
  const common = { row: rowNum, cust: rCust, code: rCode, newQty: nq };
  const approveUrl = baseUrl + '?' + encode(Object.assign({ ac: 'approveReserveIncrease' }, common));
  const denyUrl = baseUrl + '?' + encode(Object.assign({ ac: 'denyReserveIncrease' }, common));
  try {
    pushTelegram(
      `📋 客戶申請增加保留數量（待核准）\n客戶：${rCust}\n案名：${displayCase}\n編號：${rCode}\n數量：${oldQty} → ${nq} 片`,
      [[{ text: '✅ 核准', url: approveUrl }, { text: '❌ 拒絕', url: denyUrl }]]
    );
  } catch (e) {}
  return { success: true, applied: false, pending: true, oldQty: oldQty, newQty: nq };
}

/** doGet 處理「增加保留數量」的核准/拒絕按鈕（來自 updateMyReservationRow_ 發出的 Telegram 通知） */
function handleReserveIncreaseApproval_(params) {
  const rowNum = parseInt(params.row, 10);
  const cust = _safeDecode_(params.cust || '');
  const code = _safeDecode_(params.code || '');
  const newQty = safeN(params.newQty);
  const isApprove = params.ac === 'approveReserveIncrease';

  if (!rowNum || !cust || !code) {
    return _renderReserveResultPage_('操作失敗', '&#10007;', '#dc2626', ['缺少必要參數']);
  }

  const sheet = getReserveSheet_();
  if (!sheet) return _renderReserveResultPage_('操作失敗', '&#10007;', '#dc2626', ['找不到保留單分頁']);
  const data = sheet.getDataRange().getValues();
  const h = getHeaderMap(data);
  const idxCust = h['客戶'];
  const idxCode = h['編號'];
  const idxQty = h['數量'];
  const idxCase = h['案名'];
  const idxAddr = h['工地'] >= 0 ? h['工地'] : h['地址'];
  if (idxCust === undefined || idxCode === undefined || idxQty === undefined) {
    return _renderReserveResultPage_('操作失敗', '&#10007;', '#dc2626', ['保留單欄位不完整']);
  }

  const r = data[rowNum - 1];
  const rCust = r ? String(r[idxCust] || '').trim() : '';
  const rCode = r ? String(r[idxCode] || '').trim().toUpperCase() : '';
  if (!r || rCust !== cust || rCode !== code.toUpperCase()) {
    return _renderReserveResultPage_('操作失敗', '&#10007;', '#dc2626', ['找不到符合的保留資料，可能已被更新或列位置變動']);
  }

  if (!isApprove) {
    return _renderReserveResultPage_('已拒絕', '&#10007;', '#dc2626', [`客戶：${cust}`, `編號：${code}`, `維持原數量，不會更新`]);
  }

  sheet.getRange(rowNum, idxQty + 1).setValue(newQty);
  const displayCase = (idxCase >= 0 ? String(r[idxCase] || '').trim() : '') || (idxAddr >= 0 ? String(r[idxAddr] || '').trim() : '');
  try {
    _appendBusinessReport_(getReserveSpreadsheet(), {
      cust: rCust, caseName: displayCase, code: rCode, qty: newQty,
      threshold: '', action: '核准增加保留', reason: '', biz: ''
    });
  } catch (e) {}
  return _renderReserveResultPage_('已核准', '&#10003;', '#059669', [`客戶：${cust}`, `編號：${code}`, `數量已更新為 ${newQty} 片`]);
}

function _safeDecode_(v) {
  try { return decodeURIComponent(String(v || '')); } catch (e) { return String(v || ''); }
}

function _renderReserveResultPage_(title, icon, color, lines) {
  const app = HtmlService.createHtmlOutput();
  const linesHtml = (lines || []).map(l => `<p>${escapeHtml(l)}</p>`).join('');
  app.append(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{font-family:-apple-system,'PingFang TC',sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f8fafc}.card{background:#fff;padding:40px;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);text-align:center;max-width:420px;margin:20px}.icon{width:64px;height:64px;background:${color};color:#fff;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:32px;margin-bottom:16px}h2{color:#1e293b;margin:0 0 8px}p{color:#64748b;margin:0 0 4px;font-size:14px}</style></head><body><div class="card"><div class="icon">${icon}</div><h2>${escapeHtml(title)}</h2>${linesHtml}</div></body></html>`);
  return app;
}

/** 3. 通用 Email 發送工具 */
function sendEmailNotification(subject, body, replyTo, toEmail) {
  try {
    const recipient = toEmail || CONFIG.ADMIN_EMAIL;
    if (!recipient) return;
    GmailApp.sendEmail(recipient, subject, body, { name: '高雅瓷戰情室' });
  } catch(e) {
    console.error("Email 發送失敗：" + e);
  }
}

function isTaiwanHoliday() {
  try {
    const calendarId = "zh-tw.taiwan#holiday@group.v.calendar.google.com";
    const calendar = CalendarApp.getCalendarById(calendarId);
    const now = new Date();
    const events = calendar.getEventsForDay(now);
    return events.length > 0;
  } catch (e) { return false; }
}

/** 5. 產品新缺貨提醒：保留超過庫存一半 + 庫存低於月銷量x5個月 */
function sendProductStockAlerts() {
  const priceData = getPriceSheet();
  const stockData = getStockSheet();
  const reserveData = getMainSheet();
  if (!priceData || priceData.length < 2) return;

  const pMap = getHeaderMap(priceData);
  const sMap = getHeaderMap(stockData);
  const rMap = getHeaderMap(reserveData);

  // 價目表：各產品 片/坪 換算係數（缺欄或 0 時視為 1）
  const ppsMap = {};
  const idxCode = pMap['編號'];
  const idxPps = pMap['片/坪'];
  for (let i = 1; i < priceData.length; i++) {
    const code = String(priceData[i][idxCode]).toUpperCase().trim();
    if (!code) continue;
    const pps = idxPps !== undefined ? (parseFloat(priceData[i][idxPps]) || 0) : 0;
    ppsMap[code] = pps > 0 ? pps : 1;
  }

  // 庫存（片）與保留（片）
  const stockPcs = {};
  for (let i = 1; i < stockData.length; i++) {
    const code = String(stockData[i][sMap['編號']]).toUpperCase().trim();
    const qty = parseFloat(stockData[i][sMap['片數']]) || 0;
    if (code && !String(stockData[i][sMap['品名']]).includes('小計')) {
      stockPcs[code] = (stockPcs[code] || 0) + qty;
    }
  }

  const reservedPcs = {};
  for (let i = 1; i < reserveData.length; i++) {
    const code = String(reserveData[i][rMap['編號']]).toUpperCase().trim();
    const qty = parseFloat(reserveData[i][rMap['數量']]) || 0;
    if (code) reservedPcs[code] = (reservedPcs[code] || 0) + qty;
  }

  const now = new Date();
  const today = Utilities.formatDate(now, 'GMT+8', 'yyyy/MM/dd');
  const state = _loadStockAlertState_();
  const alert50 = [];   // 首次超過 50%
  const alert70 = [];   // 首次超過 70%

  const allCodes = new Set([...Object.keys(stockPcs), ...Object.keys(reservedPcs)]);
  allCodes.forEach(code => {
    const stock = stockPcs[code] || 0;
    const reserved = reservedPcs[code] || 0;
    if (stock <= 0) return;
    const pps = ppsMap[code] || 1;
    const ratio = reserved / stock;
    const ratioPct = Math.round(ratio * 100);
    const stockPing = Math.floor(stock / pps);
    const reservedPing = Math.floor(reserved / pps);
    const line = `${code} | 庫${stockPing}坪 | 保${reservedPing}坪 | ${ratioPct}%`;
    const st = state[code];

    // 掉回 50% 以下 → 解除，之後再超過才算新的「首次」
    if (ratio <= 0.5) {
      if (st) delete state[code];
      return;
    }

    if (ratio > 0.7) {
      if (!st) {
        alert50.push(line);
        alert70.push(line);
        state[code] = { tier: '70', d50: today, d70: today };
      } else if (st.tier === '50') {
        alert70.push(line);
        state[code] = { tier: '70', d50: st.d50, d70: today };
      }
      // st.tier === '70' → 已通知過，不重複
    } else {
      // 50% < ratio <= 70%
      if (!st) {
        alert50.push(line);
        state[code] = { tier: '50', d50: today, d70: '' };
      }
      // 已通知過 → 不重複
    }
  });

  _saveStockAlertState_(state);

  if (alert50.length === 0 && alert70.length === 0) return;

  let body = '🚨 保留超佔警示（首發）';
  if (alert50.length > 0) {
    body += '\n\n🟡 首次超過 50%\n' + alert50.map(l => '  ' + l).join('\n');
  }
  if (alert70.length > 0) {
    body += '\n\n🔴 首次超過 70%\n' + alert70.map(l => '  ' + l).join('\n');
  }
  body += '\n\n— 高雅瓷 AI 客服';
  pushTelegram(body);
  console.log('產品庫存警示已推送至 Telegram 群組！');
}

/** 讀取「庫存警示紀錄」狀態表 → { 產品編號: {tier, d50, d70} } */
function _loadStockAlertState_() {
  const ss = getReserveSpreadsheet();
  const sh = ss.getSheetByName('庫存警示紀錄');
  const out = {};
  if (!sh) return out;
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return out;
  const h = getHeaderMap(data);
  const iCode = h['產品編號'], iTier = h['已觸發門檻'], iD50 = h['首次50%日期'], iD70 = h['首次70%日期'];
  if (iCode === undefined || iTier === undefined) return out;
  for (let i = 1; i < data.length; i++) {
    const code = String(data[i][iCode]).trim();
    if (!code) continue;
    out[code] = {
      tier: String(data[i][iTier] || '50'),
      d50: (iD50 !== undefined && data[i][iD50]) ? String(data[i][iD50]) : '',
      d70: (iD70 !== undefined && data[i][iD70]) ? String(data[i][iD70]) : ''
    };
  }
  return out;
}

/** 整表覆寫「庫存警示紀錄」狀態（解除者直接移除該列） */
function _saveStockAlertState_(state) {
  try {
    const ss = getReserveSpreadsheet();
    let sh = ss.getSheetByName('庫存警示紀錄');
    if (!sh) {
      sh = ss.insertSheet('庫存警示紀錄');
      const headers = ['產品編號', '已觸發門檻', '首次50%日期', '首次70%日期', '更新時間'];
      sh.appendRow(headers);
      sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#D9E1F2');
    }
    const rows = [];
    Object.keys(state).forEach(code => {
      const st = state[code];
      rows.push([code, st.tier, st.d50, st.d70, Utilities.formatDate(new Date(), 'GMT+8', 'yyyy/MM/dd HH:mm')]);
    });
    const lastRow = sh.getLastRow();
    if (lastRow > 1) sh.getRange(2, 1, lastRow - 1, 5).clearContent();
    if (rows.length > 0) sh.getRange(2, 1, rows.length, 5).setValues(rows);
  } catch (e) { console.error('寫入庫存警示紀錄失敗：' + e); }
}

/** 8. 註冊排程觸發器 */
function registerAnalysisTriggers() {
  const handlerFuncs = [
    'sendDailyQueryLog',         // 改版：排除業務查詢、字體放大、欄位精簡
    'sendProductStockAlerts',
    'dailyPerformanceAutoPush',
    'sendReservationExpiryAlerts' // 保留追蹤 Telegram（週一~五 19:00，門檻依星期）
  ];
  // 舊版函式名：一併刪除殘留觸發器，避免孤兒觸發器造成重複寄信
  const legacyFuncs = [
    'sendDailyQuerySummary',
    'sendBossDailyReport',
    'sendWeeklyQueryAnalysis',
    'sendMonthlyQueryAnalysis',
    'sendOutofStockEmailSummary'
  ];
  
  ScriptApp.getProjectTriggers().forEach(t => {
    if (handlerFuncs.includes(t.getHandlerFunction()) || legacyFuncs.includes(t.getHandlerFunction())) {
      ScriptApp.deleteTrigger(t);
    }
  });
  
  ScriptApp.newTrigger('sendDailyQueryLog')
    .timeBased()
    .atHour(18)
    .nearMinute(30)
    .everyDays(1)
    .create();
    
  // 每週六早上檢查庫存警示
  ScriptApp.newTrigger('sendProductStockAlerts')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SATURDAY)
    .atHour(8)
    .nearMinute(0)
    .create();

  // 每日 18:00 業績戰報（推 Telegram，平日/假日判斷寫在函式內部）
  ScriptApp.newTrigger('dailyPerformanceAutoPush')
    .timeBased()
    .atHour(18)
    .nearMinute(0)
    .everyDays(1)
    .create();

  // 保留追蹤通知：週一~五 19:00（門檻依星期決定，函式內部判斷假日）
  const reserveWeekdays = [
    ScriptApp.WeekDay.MONDAY,
    ScriptApp.WeekDay.TUESDAY,
    ScriptApp.WeekDay.WEDNESDAY,
    ScriptApp.WeekDay.THURSDAY,
    ScriptApp.WeekDay.FRIDAY
  ];
  reserveWeekdays.forEach(day => {
    ScriptApp.newTrigger('sendReservationExpiryAlerts')
      .timeBased()
      .onWeekDay(day)
      .atHour(19)
      .create();
  });
}


/**
 * 🔹 每日查詢日報 v2（18:25 觸發）
 * 改版：① 只顯示客戶查詢（排除業務自查）
 *       ② 字體放大 20px
 *       ③ 移除「負責業務」欄
 *       ④ 移除「等級」（客戶名稱直接顯示）
 *       ⑤ 移除「品號」與「規格」欄
 *       最終欄位：時間 | 客戶名稱 | 查詢內容 | 狀態
 */
function sendDailyQueryLog() {
  try {
    const today = new Date();
    if (today.getDay() === 0 || today.getDay() === 6) return; // 週末不寄
    const todayStr = Utilities.formatDate(today, 'Asia/Taipei', 'yyyy/MM/dd');
    const dateLabel = Utilities.formatDate(today, 'Asia/Taipei', 'yyyy/MM/dd');

    const ss = getSpreadsheetInstance();
    const logSheet = ss.getSheetByName(SHEET_NAME.LOG);
    if (!logSheet) return;
    const lastRow = logSheet.getLastRow();
    if (lastRow <= 1) return;

    const data = logSheet.getRange(1, 1, lastRow, 17).getValues();

    // 排除業務/管理員帳號
    const SKIP_LEVELS = new Set(['sales', 'king', 'queen', 'admin', 'premium', 'staff']);
    const rows = [];

    for (let i = 1; i < data.length; i++) {
      const rowDate = data[i][0];
      if (!rowDate) continue;
      const rowDateStr = rowDate instanceof Date
        ? Utilities.formatDate(rowDate, 'Asia/Taipei', 'yyyy/MM/dd')
        : String(rowDate).substring(0, 10);
      if (rowDateStr !== todayStr) continue;

      const level = String(data[i][4] || '').trim().toLowerCase();
      if (SKIP_LEVELS.has(level)) continue;

      // 🚩 只列「真正的庫存查詢結果」（充足/不足/查無），排除圖片推送/OCR/AI對話/引導泡泡等診斷用途的 log 列。
      // 庫存狀態欄（L）只有 handleInventorySearch 的查詢會填，其餘寫 log 的地方都會留空，天生就是最準的篩選條件。
      const stockStatus = String(data[i][11] || '').trim();
      if (!stockStatus) continue;

      const timeStr = rowDate instanceof Date
        ? Utilities.formatDate(rowDate, 'Asia/Taipei', 'HH:mm:ss')
        : String(rowDate).substring(11, 19);

      rows.push({
        time:   timeStr,
        name:   String(data[i][3] || '-').trim(),
        input:  String(data[i][5] || '-').trim(),
        status: stockStatus
      });
    }

    rows.sort((a, b) => a.time.localeCompare(b.time));

    const FS = '20px';
    const statusColor = s =>
      (s === '不足' || s === '查無') ? '#dc2626' :
       s === '充足'                   ? '#16a34a' : '#374151';

    // 🚩 客戶名稱多半是「公司-姓名」格式，拆成兩行顯示，手機版才不會被壓縮
    const splitName = (raw) => {
      const parts = String(raw || '').split(/[-－—–]/);
      if (parts.length > 1) {
        return { company: parts[0].trim(), person: parts.slice(1).join('-').trim() };
      }
      return { company: raw, person: '' };
    };

    let html = `<div style="font-family:-apple-system,'PingFang TC',sans-serif;max-width:800px;margin:0 auto;color:#1e293b;">`;
    html += `<h2 style="font-size:24px;color:#1e40af;border-bottom:3px solid #1e40af;padding-bottom:8px;">🔹 今日客戶查詢日報 (${dateLabel})</h2>`;
    html += `<p style="font-size:${FS};color:#475569;">今日共有 <strong>${rows.length}</strong> 筆客戶查詢，明細如下：</p>`;

    if (rows.length === 0) {
      html += `<p style="font-size:${FS};color:#16a34a;">✅ 今日無客戶查詢紀錄</p>`;
    } else {
      // 🚩 改用堆疊卡片（div）而非 table，避免手機版 Email 客戶端把多欄表格壓縮到跑版；不顯示時間欄
      rows.forEach((r, idx) => {
        const bg = idx % 2 === 0 ? '#f8fafc' : '#ffffff';
        const { company, person } = splitName(r.name);
        html += `<div style="background:${bg};border-bottom:1px solid #e2e8f0;padding:14px 16px;">`;
        html += `<div style="font-size:20px;font-weight:bold;color:#1e293b;">${company}</div>`;
        if (person) html += `<div style="font-size:16px;color:#64748b;margin-top:2px;">${person}</div>`;
        html += `<div style="font-size:${FS};color:#1e293b;margin-top:8px;">${r.input}</div>`;
        html += `<div style="font-size:${FS};font-weight:bold;color:${statusColor(r.status)};margin-top:4px;">${r.status}</div>`;
        html += `</div>`;
      });
    }

    html += `<p style="font-size:14px;color:#94a3b8;margin-top:24px;">高雅瓷 AI 系統自動發送</p></div>`;

    const subject = `🔹 今日查詢日報 (${dateLabel}) - 共 ${rows.length} 筆`;
    GmailApp.sendEmail(CONFIG.ADMIN_EMAIL, subject, '', { htmlBody: html, name: '高雅瓷戰情室' });

  } catch (err) {
    console.error('sendDailyQueryLog 失敗：' + err);
  }
}

/**
 * 🧪 測試專用：一鍵測試寄出所有排程信件
 * 可在 GAS 介面直接選取此函數點擊「▶ 執行」
 */
function testSendAllNotifications() {
  console.log("🚀 開始測試發送所有排程 Email 通知...");
  
  try {
    console.log("1/2 發送 [今日客戶查詢日報 (新版)]...");
    sendDailyQueryLog();
  } catch(e) { console.error("sendDailyQueryLog 測試失敗: " + e); }

  try {
    console.log("2/2 發送 [產品庫存與保留警示]...");
    sendProductStockAlerts();
  } catch(e) { console.error("sendProductStockAlerts 測試失敗: " + e); }

  console.log("🎉 所有排程 Email 測試完成！請至您的 Gmail 信箱查看測試結果。");
}


// ==========================================
// 🔔 到貨通知訂閱（不用 LINE 推播，不吃免費則數）
// 客戶在「庫存不足」回覆按「🔔 到貨通知我」→ 記到「到貨通知訂閱」分頁，每小時檢查可用量：
//   A. 可用量夠了 → 標「待告知」，客戶下次傳任何訊息時，在回覆裡順便附上（回覆訊息不算則數）
//   B. 同時發 Telegram 給負責業務，由業務主動聯絡客戶
// 狀態：等待中 → 待告知 → 已告知；超過 60 天沒到貨 → 已過期
// ==========================================
const ARRIVAL_SUB_SHEET = '到貨通知訂閱';
const ARRIVAL_SUB_HEADERS = ['訂閱時間', '使用者ID', '姓名', '負責業務', '編號', '需求', '狀態', '通知時可用片數', '業務通知時間', '客戶告知時間'];
const ARRIVAL_SUB_EXPIRE_DAYS = 60;
let _ARRIVAL_REPLY_CTX = null; // doPost 設定 { userId, isGroup }，回覆時用來附上待告知的到貨通知

function getArrivalSubSheet_(ss) {
  let sh = ss.getSheetByName(ARRIVAL_SUB_SHEET);
  if (!sh) {
    sh = ss.insertSheet(ARRIVAL_SUB_SHEET);
    sh.getRange(1, 1, 1, ARRIVAL_SUB_HEADERS.length).setValues([ARRIVAL_SUB_HEADERS]).setFontWeight('bold').setBackground('#F3F3F3');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** 「庫存不足」回覆的快捷按鈕：🔔 到貨通知我 */
function buildArrivalSubscribeQuickReply_(code) {
  const raw = String(code || '');
  const pure = (raw.match(/[a-zA-Z]{1,4}\d{2,}(?:-[a-zA-Z0-9]+)?/i) || raw.match(/\d{5,}(?:-[a-zA-Z0-9]+)?/i) || [])[0];
  if (!pure) return null;
  const need = (raw.match(/\d+(?:\.\d+)?\s*(坪|p|片|箱|包)/i) || [])[0] || '';
  const c = pure.toUpperCase();
  return { type: 'action', action: { type: 'postback', label: '🔔 到貨通知我', data: 't=sub&c=' + encodeURIComponent(c) + '&q=' + encodeURIComponent(need), displayText: c + ' 到貨通知我' } };
}

/** postback t=sub：寫入訂閱 */
function handleArrivalSubscribe_(params, event, auth, dbSS) {
  const reply = (txt) => lineApiFetch('reply', { replyToken: event.replyToken, messages: [{ type: 'text', text: txt }] });
  const code = String(params.c || '').toUpperCase().trim();
  const need = String(params.q || '').trim();
  if (!code) return reply('❌ 編號有誤，無法設定到貨通知。');
  if (!auth || !auth.allowed) return reply('請先完成報到，才能使用到貨通知喔！');

  const userId = String(event.source.userId || '');
  const sh = getArrivalSubSheet_(dbSS);
  const data = sh.getDataRange().getValues();
  const dup = data.slice(1).some(r => String(r[1]) === userId && String(r[4]).toUpperCase() === code && (r[6] === '等待中' || r[6] === '待告知'));
  if (dup) return reply(`🔔 ${code} 已經在幫您追蹤了，有貨會第一時間告訴您！`);

  sh.appendRow([new Date(), userId, auth.name || '', auth.salesID || '', code, need, '等待中', '', '', '']);
  ensureArrivalSubTrigger_();
  return reply(`🔔 已幫您追蹤 ${code}${need ? '（需求 ' + need + '）' : ''}\n有貨時您的業務會主動聯絡您，下次傳訊息給小高時也會看到通知喔！`);
}

/** 第一次有人訂閱時自動建立每小時排程（之後就不重建） */
function ensureArrivalSubTrigger_() {
  try {
    const exists = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'checkArrivalSubscriptions');
    if (!exists) ScriptApp.newTrigger('checkArrivalSubscriptions').timeBased().everyHours(1).create();
  } catch (e) {
    console.error('建立到貨通知排程失敗：' + e);
  }
}

/** 把「50坪」「100片」「3箱」換成片數；沒填數量就只要有貨（>0）即可 */
function _arrivalNeedPcs_(need, ratio, pcsPerBox) {
  const m = String(need || '').match(/(\d+(?:\.\d+)?)\s*(坪|p|片|箱|包)/i);
  if (!m) return 1;
  const n = parseFloat(m[1]) || 0;
  const unit = m[2].toLowerCase();
  if (unit === '坪' || unit === 'p') return ratio > 0 ? n * ratio : n;
  if ((unit === '箱' || unit === '包') && pcsPerBox > 0) return n * pcsPerBox;
  return n;
}

/** ⏰ 每小時排程：檢查等待中的訂閱，可用量（庫存表 − 保留單）夠了就標記待告知並通知業務 */
function checkArrivalSubscriptions() {
  const ss = SpreadsheetApp.openById(CONFIG.DATA_SS_ID);
  const sh = ss.getSheetByName(ARRIVAL_SUB_SHEET);
  if (!sh || sh.getLastRow() < 2) return;
  const data = sh.getDataRange().getValues();
  const waitingIdx = [];
  for (let i = 1; i < data.length; i++) if (data[i][6] === '等待中') waitingIdx.push(i);
  if (waitingIdx.length === 0) return;

  const priceData = (typeof getPriceSheet === 'function') ? getPriceSheet() : [];
  const stockData = (typeof getStockSheet === 'function') ? getStockSheet() : [];
  const mainData = (typeof getMainSheet === 'function') ? getMainSheet() : [];
  const pMap = getHeaderMap(priceData), sMap = getHeaderMap(stockData), mMap = getHeaderMap(mainData);

  const stockPcs = {}, reservedPcs = {}, priceRow = {};
  for (let i = 1; i < stockData.length; i++) {
    const c = String(stockData[i][sMap['編號']] || '').toUpperCase().trim();
    if (!c || String(stockData[i][sMap['品名']] || '').includes('小計')) continue;
    stockPcs[c] = (stockPcs[c] || 0) + safeN(stockData[i][sMap['片數']]);
  }
  for (let i = 1; i < mainData.length; i++) {
    const c = String(mainData[i][mMap['編號']] || '').toUpperCase().trim();
    if (!c || c.includes('-期')) continue;
    reservedPcs[c] = (reservedPcs[c] || 0) + safeN(mainData[i][mMap['數量']]);
  }
  for (let i = 1; i < priceData.length; i++) {
    const c = String(priceData[i][pMap['編號']] || '').toUpperCase().trim();
    if (c && !priceRow[c]) priceRow[c] = priceData[i];
  }

  const now = new Date();
  const byRep = {};
  waitingIdx.forEach(i => {
    const r = data[i];
    const subDate = r[0] instanceof Date ? r[0] : new Date(r[0]);
    if (!isNaN(subDate.getTime()) && now - subDate > ARRIVAL_SUB_EXPIRE_DAYS * 86400000) {
      sh.getRange(i + 1, 7).setValue('已過期');
      return;
    }
    const code = String(r[4] || '').toUpperCase().trim();
    const row = priceRow[code];
    const ratio = row ? getPcsPerPingFallback_(row, pMap) : 0;
    const pcsPerBox = row && pMap['片/箱'] !== undefined ? safeN(row[pMap['片/箱']]) : 0;
    const avail = (stockPcs[code] || 0) - (reservedPcs[code] || 0);
    const needPcs = _arrivalNeedPcs_(r[5], ratio, pcsPerBox);
    if (avail <= 0 || avail < needPcs * 0.95) return;

    sh.getRange(i + 1, 7, 1, 3).setValues([['待告知', avail, now]]);
    const rep = String(r[3] || '').trim() || '未指派';
    const pingText = ratio > 0 ? '｜' + Math.floor(avail / ratio) + '坪' : '';
    (byRep[rep] = byRep[rep] || []).push(`• ${r[2] || '客戶'}：${code}${r[5] ? '（需求 ' + r[5] + '）' : ''} → 現在可用 ${avail}片${pingText}`);
  });

  Object.keys(byRep).forEach(rep => {
    const text = `🔔 到貨通知：客戶在等的貨有了\n${byRep[rep].join('\n')}\n\n請主動聯絡客戶；客戶下次傳訊息給機器人時也會看到通知。`;
    const chatId = rep !== '未指派' ? resolveBusinessTelegramChatId(rep) : '';
    if (chatId) pushTelegramTo(chatId, text);
    else pushTelegram(`[負責業務：${rep}]\n` + text);
  });
}

/**
 * 回覆前呼叫：該使用者若有「待告知」的到貨通知，插入一則文字在回覆裡（回覆不吃則數）。
 * 回傳要標記為已告知的列號；只在回覆成功（HTTP 200）後才標記，避免通知送丟。
 */
function attachPendingArrivalNotices_(payload) {
  const ctx = _ARRIVAL_REPLY_CTX;
  _ARRIVAL_REPLY_CTX = null; // 一次請求只附一次
  if (!ctx || ctx.isGroup || !ctx.userId || !payload || !Array.isArray(payload.messages)) return null;
  if (payload.messages.length >= 5) return null; // LINE 單次回覆上限 5 則，留到下次
  try {
    const sh = getSpreadsheetInstance().getSheetByName(ARRIVAL_SUB_SHEET);
    if (!sh || sh.getLastRow() < 2) return null;
    const data = sh.getDataRange().getValues();
    const rows = [], lines = [];
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][1]) !== ctx.userId || data[i][6] !== '待告知') continue;
      rows.push(i + 1);
      lines.push(`✅ ${data[i][4]} 有貨了！${data[i][5] ? '（您需要 ' + data[i][5] + '）' : ''}`);
    }
    if (rows.length === 0) return null;
    const text = `🔔 到貨通知\n${lines.join('\n')}\n\n直接回覆「編號 + 數量」可確認最新庫存，或按「下保留」幫您留貨！`;
    payload.messages.splice(payload.messages.length - 1, 0, { type: 'text', text: text });
    return rows;
  } catch (e) {
    console.error('附加到貨通知失敗：' + e);
    return null;
  }
}

function markArrivalNoticesDelivered_(rows) {
  try {
    const sh = getSpreadsheetInstance().getSheetByName(ARRIVAL_SUB_SHEET);
    const now = new Date();
    rows.forEach(rowNum => {
      sh.getRange(rowNum, 7).setValue('已告知');
      sh.getRange(rowNum, 10).setValue(now);
    });
  } catch (e) {
    console.error('標記到貨通知已告知失敗：' + e);
  }
}

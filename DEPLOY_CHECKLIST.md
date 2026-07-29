# 保留單網頁表單 — 部署 Checklist

## 涉及檔案
| 檔案 | 說明 |
|------|------|
| `reservation_form.html` | 正式表單（上傳至網域） |
| `0_Core.js` | 新增 `doGet` + `submitWebForm` 路由 |
| `5_Order.js` | 新增 `handleWebFormSubmission` |

---

## Step 1 — LINE Developers 申請 LIFF App

1. 前往 [LINE Developers Console](https://developers.line.biz/)
2. 選擇 **高雅瓷機器人** 的 Provider → 進入 Channel
3. 左側選「**LIFF**」→ 點「Add」
4. 填寫：
   - **LIFF app name**：高雅瓷保留單
   - **Size**：`Full`（全螢幕，手機最佳體驗）
   - **Endpoint URL**：`https://bigt.cc/line/reservation_form.html`
   - **Scope**：勾選 `profile`（取得 userId 必需）
   - **Bot link feature**：`On (Aggressive)`
5. 建立後，複製 **LIFF ID**（格式：`xxxxxxxx-xxxxxxxx`）

---

## Step 2 — 填入 reservation_form.html 的 CONFIG

打開 `reservation_form.html`，找到頂部的 CONFIG 區塊：

```javascript
const CONFIG = {
  GAS_API : "<<請填入客戶版機器人 GAS 部署 URL>>",
  LIFF_ID : "<<請填入 LIFF ID>>"
};
```

- `GAS_API`：從 GAS 部署頁取得（見 Step 3）
- `LIFF_ID`：貼上 Step 1 複製的 ID

---

## Step 3 — GAS 重新部署（加入 doGet）

```bash
# 進入專案目錄
cd "客戶版機器人"

# 推送更新的 0_Core.js 和 5_Order.js
npx clasp push

# 部署新版本（⚠️ 絕對必須使用 -i 參數指定現有部署 ID，否則 URL 會跑掉！）
# 1. 查詢現有部署 ID：npx clasp deployments
# 2. 原地覆蓋更新：
npx clasp deploy -i <請填入現有部署ID> -d "更新邏輯描述"
```

部署後：
1. 進入 GAS 介面 → 部署 → 管理部署
2. 確認 URL 未變更
3. 確保該網址已貼回 `reservation_form.html` 的 `GAS_API`

> ⚠️ 每次改 doGet/doPost 邏輯都要「**使用 -i 原地更新部署**」，絕對不要使用不帶 -i 的 deploy 指令，以防止 URL 變更。

---

## Step 4 — 上傳表單到網域

```bash
# 透過 cPanel 檔案管理員
# 上傳路徑：public_html/ai_line/reservation_form.html
```

或用 FTP/SSH 直接上傳。

---

## Step 5 — 更新 LINE Bot 的「立即下保留單」按鈕 URL

在 `4_Flex.js` 或 `2_Business.js` 找到庫存查詢回覆的 Quick Reply / 按鈕，
把 URL 格式改為：

```
https://liff.line.me/<<LIFF_ID>>?code=<<品號>>&qty=<<數量>>
```

範例：
```javascript
const reserveUrl = `https://liff.line.me/${CONFIG.LIFF_ID_RESERVE}?code=${code}&qty=${qty}`;
```

建議在 `0_Core.js` 的 CONFIG 加一個 `LIFF_ID_RESERVE` 常數。

---

## Step 6 — 測試

| 測試項目 | 方式 |
|----------|------|
| Mock 模式（不需 LINE）| 瀏覽器開啟 `?test=true&code=DA11010&qty=150` |
| LIFF 登入流程 | 用手機 LINE 開啟 `https://liff.line.me/<<LIFF_ID>>` |
| 庫存查詢 | 填品號+數量後等 0.8 秒，看狀態更新 |
| 表單送出 | 填完三必填欄位，點送出，確認保留暫存分頁有寫入 |
| Flex 通知 | 確認業務群組收到 Flex 審核卡片 |

---

## 保留暫存欄位對照（A–O）

| 欄 | 欄位名稱 | 來源 |
|----|----------|------|
| A | 編號 | 表單品號 |
| B | 數量 | 表單數量 |
| C | 公司 | LIFF userId → 白名單 |
| D | 地址 | 客戶填寫 |
| E | 申請人（業務） | LIFF userId → 白名單 salesID |
| F | 申請時間 | 系統自動 |
| G | 到期時間 | 申請+14天 |
| H | 案名 | 客戶填寫 |
| I | 進場日期 | 客戶填寫 |
| J | 申請單號 | REQ-MMDD-HHmm-XXX |
| K | 來源ID | LINE userId |
| L | 狀態 | 待核准 / 已核准 |
| M | 聯絡人 | 客戶填寫（選填） |
| N | 聯絡電話 | 客戶填寫（選填） |
| O | 到貨日期 | 客戶填寫（庫存不足時） |

# 客戶版機器人 — 專案最高原則

> 本檔案內的規則為**最高原則**，優先於一般習慣與預設行為。任何協助此專案的 AI agent，
> 在動手前都必須先讀過本檔案。

---

## 🔴 最高原則 1：部署安全（GAS / clasp）

詳細規則見 [clasp-safe-deploy.md](clasp-safe-deploy.md) 與 [DEPLOY_CHECKLIST.md](DEPLOY_CHECKLIST.md)，
這裡是濃縮版，**絕對不可違反**：

1. **永遠不要執行裸的 `clasp deploy`**（沒有 `-i`）。這會建立新的 Deployment ID，
   導致 LINE Webhook / LIFF URL 全部失效。
2. 正確流程：
   ```bash
   clasp push
   clasp deployments   # 找出正式環境的 Deployment ID
   clasp deploy -i <既有的 Deployment ID> -d "版本說明"
   ```
3. **正式環境 Deployment ID（LINE Webhook 指向此 ID）**：
   `AKfycbxB2wyCEt-0xeXL43Ak7NvkB2oNGVMfXwJRJvMZcCR0GYhpNlIbTtEwqy_G4pVJ5N-x`
4. **絕對不要刪除任何現有的 deployment**（`clasp deployments` 列出的舊版本一律保留，
   即使看起來是測試殘留）。
5. 每次部署完成後，務必用 `curl` 驗證正式 URL（`.../exec`）仍回應正常，
   確認改動真的生效在 LINE Bot 上。
6. **只允許覆蓋既有正式 deployment，不可新增新的正式部署 ID。**
   如果需要更新版本，只能對既有的正式 deployment 執行 `clasp deploy -i <既有ID>`，
   不可用任何方式建立新的正式 webhook / LIFF 入口。

---

## 🔶 通知盤點原則

> 最後完整盤點日期：**2026-07-03**（含程式碼逐行核對 + `grep` 全專案呼叫點交叉比對 + GAS 專案「觸發條件」頁面實機截圖核對）。

1. 本專案通知分成兩類：`LINE` 與 `Email`，所有新功能上線前都要先確認會落到哪一類。
2. 程式碼盤點結果（邏輯已寫好、實際存在於程式碼中的通知數量）：
   - `LINE`：9 大類、20+ 個實際呼叫點（含各種錯誤提示與操作回饋）。
   - `Email`：11 種主要觸發狀況。

### 3. `LINE` 明細（依收件對象分類）

**A. 推播給「管理員個人」**（`CONFIG.ADMIN_NOTIFY_ID` = `U8aa4bd4a...` 開頭，是**單一個人 LINE**、不是群組；走 `ADMIN_TOKEN` 後台機器人 token，函式為 `sendAdminFlexPush`/`sendFlexPush`）：
   - 新好友加入（陌生人）— `0_Core.js` `follow` 事件
   - 保留單送出（文字/口語指令）— `5_Order.js` `handleOrderRequest`
   - 保留單送出（LIFF 網頁表單）— `5_Order.js` `handleWebFormSubmission`
   - 保留單送出（OCR 手寫單辨識確認後）— `5_Order.js` `handleOCRPostback`
   - 客戶報到申請權限（「公司-姓名」）— `5_Order.js` `handleNewUserApply`

**B. 推播給「負責業務」個人**（動態查表決定 `salesLineId`/`auth.salesID`，函式為 `sendAdminPush`/`sendPush`）：
   - 客戶查詢庫存「查無此品號」— `2_Business.js` `handleInventorySearch`（30分鐘防重複快取）
   - 客戶查詢庫存「不足/沒貨」— `2_Business.js` `handleInventorySearch`（同上）
   - 一般查詢後判定「有問題」需通知（free/class 等級 + 查數量 + 回覆含不足/❌/🟠）— `3_Notify.js` `handleSalesPush`，查無 `salesID` 時 fallback 推給管理員個人

**C. 推播/回覆給「客戶本人」**（用客戶自己的 `userId`，函式為 `sendPush`/`lineApiFetch('reply',...)`）：
   - OCR 手寫單辨識失敗/超時/取消 — `5_Order.js` `handleOCRPostback`
   - OCR 手寫單確認送出成功（「✅ 保留申請已送出」）— `5_Order.js` `handleOCRPostback`
   - 新用戶審核通過（「🎉 您的 AI 權限已核准開通」）— `5_Order.js` `processUserApproval`
   - 點「系列介紹/實景圖/模面變化圖/原廠目錄」按鈕，成功或查無資料 — `5_Order.js` `handleFlexImagePostback`
   - 睡美人卡片「試試手氣」重新推薦 — `5_Order.js` `handlePostback`

**D. 推播給「操作按鈕的管理員自己」**（權限確認/操作結果回饋，函式為 `sendPush`）：
   - 非管理員點審核按鈕「⛔ 權限不足」、找不到工作表、核准單筆品項成功、核准新用戶成功 — 皆在 `5_Order.js` `handlePostback`

**E. 推播到「業績戰情群組」**（`PERFORMANCE_GROUP_ID` = `C5b96fce6...` 開頭，是**真正的群組 ID**）：
   - 每日業績戰報（平日、非假日自動判斷）— `7_Performance.js` `dailyPerformanceAutoPush`
   - ⚠️ 目前 GAS 沒有對應觸發器，應該沒在自動跑

**F. 完全獨立的另一組 LINE Bot**（不同 Channel Token，物流查貨擴充模組）：
   - 訊息含「查貨/進度/送貨/物流/貨到哪了」等關鍵字，在 `doPost` 最前面被攔截，不進主流程 — `GaoYaCi_Bot_Extension.js` `replyGaoYaCiLine_Core`，用獨立的 `GY_CONFIG.CHANNEL_ACCESS_TOKEN`

**G.（補充，非通知）一般查詢的即時文字/Flex 回覆**：`sendReply`/`sendMultiReply`/`sendFlexReply` 是 bot 對每句正常訊息（查庫存、查價格、查保留、AI對話等）的標準回覆管道，底層走 `lineApiFetch('reply',...)`，在 `0_Core.js` 共 25 處呼叫，涵蓋整個 `doPost` 的所有查詢分支。這是「正常對答」不是「主動通知」。

**未使用的死代碼**：`broadcastToLine`（multicast 群發，`6_Tools.js`）已定義但全專案沒有任何地方呼叫。

### 4. `Email` 明細（全部走 `sendEmailNotification` 或直接 `GmailApp.sendEmail`；`sendEmailNotification` 沒指定 `toEmail` 時預設寄到 `CONFIG.ADMIN_EMAIL`）

| # | 觸發時機 | 收件人 | 函式/位置 |
|---|---|---|---|
| 1 | 新好友加好友（陌生人） | `CONFIG.ADMIN_EMAIL` | `0_Core.js` |
| 2 | 客戶報到申請權限，含核准/拒絕按鈕連結 | `CONFIG.ADMIN_EMAIL` | `5_Order.js` `handleNewUserApply`，直接 `GmailApp.sendEmail` |
| 3 | 保留單送出（文字/口語指令） | `CONFIG.ADMIN_EMAIL` | `5_Order.js` `handleOrderRequest` |
| 4 | 保留單送出（LIFF 網頁表單） | `CONFIG.ADMIN_EMAIL` | `5_Order.js` `handleWebFormSubmission` |
| 5 | 保留單送出（OCR 手寫單確認後） | `CONFIG.ADMIN_EMAIL` | `5_Order.js` `handleOCRPostback` |
| 6 | 保留追蹤（新進榜 + 超過60天未更新） | 白名單裡 `king`/`queen`/`admin` 等級全體（逐一寄） | `3_Notify.js` `sendReservationExpiryAlerts`；⚠️ **沒有觸發器** |
| 7 | 缺貨彙整（保留超過庫存一半 + 庫存低於月銷x5個月） | `CONFIG.ADMIN_EMAIL` | `3_Notify.js` `sendProductStockAlerts`；⚠️ 正確函式**沒有觸發器**，只有孤兒的 `sendOutofStockEmailSummary` 在跑且大量失敗 |
| 8 | 每日綜合日報（18:30） | `CONFIG.ADMIN_EMAIL` | `3_Notify.js` `sendDailyQuerySummary`（正常運作中） |
| 9 | 每週綜合報告（週一08:30） | `CONFIG.ADMIN_EMAIL` | `3_Notify.js` `sendWeeklyQueryAnalysis`（觸發器存在，但截圖顯示從未執行過） |
| 10 | 每月綜合報告（每月1號09:00） | `CONFIG.ADMIN_EMAIL` | `3_Notify.js` `sendMonthlyQueryAnalysis`（正常運作中） |
| 11 | 三家老闆每日彙整報表（19:00） | 寫死 `titankou2002@gmail.com`（不吃 `CONFIG.ADMIN_EMAIL`） | `3_Notify.js` `sendBossDailyReport`；⚠️ **沒有觸發器** |

### ⚠️ 實機觸發器現況（2026-07-03 GAS「觸發條件」頁面實際核對，只有 4 個）

| 函式 | 上次執行 | 錯誤率 | 備註 |
|---|---|---|---|
| `sendMonthlyQueryAnalysis` | 2026/7/1 | 0% | 正常 |
| `sendOutofStockEmailSummary` | 2026/7/3 | **76.22%** | ⚠️ **孤兒觸發器**：此函式名稱不存在於任何本機 `.js` 檔案中（缺貨彙整信的實際函式是 `sendProductStockAlerts`），推測是舊函式改名/刪除後留下的殘留觸發器，高錯誤率應與此有關 |
| `sendWeeklyQueryAnalysis` | 從未執行過 | - | 尚待觀察 |
| `sendDailyQuerySummary` | 2026/7/2 | 0% | 正常 |

**下列程式碼中已寫好邏輯、但目前 GAS 專案裡完全沒有對應觸發器的通知（等於沒有在自動執行）：**
- `dailyPerformanceAutoPush`（LINE 每日業績戰報，推到業績戰情群組）
- `sendReservationExpiryAlerts`（Email 保留追蹤通知）
- `sendBossDailyReport`（Email 三家老闆彙整報表，即使 `registerAnalysisTriggers()` 裡有註冊也需要**實際執行過一次 `registerAnalysisTriggers()` 或 `manualSetupAnalysisTriggers()` 才會生效**）
- `sendProductStockAlerts`（Email 缺貨彙整信，正確函式目前疑似沒有觸發器，只有孤兒的 `sendOutofStockEmailSummary` 在跑且大量失敗）

5. 若日後新增通知流程，必須先在這裡補上分類與數量，再改程式；若修改/重新命名任何有排程觸發器的函式名稱，**務必同步到 GAS 編輯器「觸發條件」頁面手動更新或刪除舊觸發器**，避免產生孤兒觸發器。

---

## 🟣 最高原則 2：前端 / LIFF 頁面設計品質（Anti-Slop Taste Skill）

本專案包含多個 HTML/LIFF 頁面：`reservation_form.html`、`cpanel_tracking.html`、
`contract_generator.html`、`qa_guide.html`，未來行銷頁面（如 `marketing/` 下的簡報、
任何 landing page）也適用。

來源：[taste-skill (design-taste-frontend)](https://github.com/Leonxlnx/taste-skill) —
一套「反 AI 套版感」的前端設計準則。完整規則很龐大且偏向行銷型 landing page
（hero、bento grid、marquee 等對表單/儀表板類頁面不適用，見其 Section 13 Out of Scope）。
以下是**對本專案所有 UI 輸出都通用、且必須遵守**的核心子集：

### 2.A 配色與對比（Color & Contrast）— 必查
- **整頁只鎖定一種主題**：全亮或全暗，不要某個 section 突然反色。
- **每個畫面最多 1 個強調色**，飽和度別過高；不要用 AI 慣用的紫色/藍色光暈漸層
  （除非品牌本來就是該色系）。
- **一致的圓角規則**：整頁挑一種圓角尺度（全直角 / 全 12-16px 圓角 / 互動元件全 pill），
  不要按鈕是圓角、卡片是直角混搭。
- **按鈕對比檢查（強制）**：出貨前檢查每個按鈕文字在背景上是否可讀
  （白底白字、透明按鈕無邊框 → 一律禁止），WCAG AA 最低 4.5:1（大字 3:1）。
- **表單對比檢查（強制）**：input、placeholder、focus ring、helper/error 文字
  都要符合 WCAG AA 對比。

### 2.B 排版與間距（Typography & Spacing）
- 標題與內文使用同一字族時，強調用「同字族的斜體/粗體」，不要混用不同字體製造對比。
- 不要把 `Inter` 當預設字體（除非品牌/政府網站需要中性感）。
- 段落寬度限制（網頁版）約 65 字元，避免一行過長難讀。
- 間距要有節奏：選一組 spacing scale（例如 0.5rem 倍數）並全頁一致，
  不要忽大忽小。

### 2.C 互動狀態（Interactive States）— 必查
- 任何表單/按鈕都要有完整狀態：loading（骨架而非通用轉圈）、empty、error、
  以及 `:active` 的輕微位移/縮放回饋（如 `scale-[0.98]`）。
- CTA 按鈕文字桌面版不可換行；同一頁面不要出現語意重複的 CTA
  （例如「聯絡我們」與「立即諮詢」同時存在）。

### 2.D AI 套版感禁忌（AI Tells）— 出貨前自查
- **Em dash（— 或 –）完全禁止**，包含標題、按鈕、說明文字、引言。一律用一般連字號 `-`
  或拆成兩句。
- 不用假名字（"John Doe"）、假頭像、假精度數字（如 99.99%、1234567）。
- 不用「Acme」「SmartFlow」之類的通用品牌名稱範例。
- 不要手繪裝飾性 SVG 圖示；圖示一律用既有 icon 庫（Phosphor / Tabler / Radix 等），
  本專案若已用其他 icon 方案則沿用現有方案，不混用。
- 不要用 div 拼湊的「假截圖」當作產品預覽；要嘛用真實截圖/圖片，要嘛留空並標註
  TODO 說明需要什麼圖。

### 2.E 文案自我審查（Copy Self-Audit）— 出貨前必做
出貨前重新讀過所有可見文字（標題、按鈕、表單標籤、錯誤訊息），抓出：
- 文法不通順或語意不清的句子
- 聽起來像 AI 硬湊的「詩意」用詞
- 數字看起來像 AI 編造的假精確值

### 2.F 適用範圍說明
- 若任務是**行銷型 landing page / pitch deck**（如 `marketing/` 簡報、未來推廣頁），
  可進一步套用 taste-skill 完整規則（hero 排版、layout variance、動效強度等三維 dial、
  bento grid、AI Tells 完整清單），參考原始 SKILL.md：
  `/Users/bigt_mbair/Documents/GitHub/taste-skill/skills/taste-skill/SKILL.md`
- 若任務是**表單 / 儀表板 / LIFF 工具頁面**（reservation_form、cpanel_tracking、
  contract_generator、qa_guide），只套用上面 2.A-2.E 的通用子集即可，
  不要硬套 hero/marquee/bento 等 landing page 專用規則。

---

## 專案背景速覽

- LINE Bot，部署於 Google Apps Script (GAS)，透過 `clasp` 管理。
- 主要程式檔：`0_Core.js`（webhook 入口/路由）、`9_AI.js`（Gemini API 整合）、
  `6_Tools.js`（共用工具函式）、`00_Debug.js`（一次性診斷/清理工具）。
- Gemini 模型固定使用 `gemini-2.5-flash`（`gemini-2.0-flash` 已於 2026 年被
  Google 下架，回傳 404）。
- Script Properties 數量上限約 50 個（超過後 GAS UI 變唯讀），定期清理已不再使用的
  舊版屬性（命名規則：`U<32hex>_...`、`limit_U<32hex>...`、`newfriend_U<32hex>...`、
  `welcome_U<32hex>...`）。

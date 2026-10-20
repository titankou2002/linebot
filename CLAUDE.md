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

> 最後完整盤點日期：**2026-08-18**（GAS 部署 `@742`；含程式碼逐行核對 + `grep` 全專案呼叫點交叉比對 + `registerAnalysisTriggers()` 原始碼核對）。
>
> **架構定案：主動業務通知全面走 Telegram（不再用 LINE 主動推播），LINE 只保留「客戶本人」的直接回覆與極少數操作回饋；Email 精簡到只剩 4 種。** 詳細沿革見 [今友利.md](今友利.md)、[保留通知telegram.md](保留通知telegram.md)。

1. 本專案通知分三類：`LINE`（僅客戶端直接回覆）、`Telegram`（業務端主動通知的主要管道）、`Email`（備份信 + 1 份日報）。所有新功能上線前都要先確認會落到哪一類，並更新這裡。
2. **Telegram 有兩種收件目標**，共用 [6_Tools.js](6_Tools.js) 底層：
   - `pushTelegram(text, buttons)` → 固定推「高雅瓷公佈欄」群組（`TELEGRAM_CHAT_ID` script property，目前是 `-5042638784`）
   - `pushTelegramTo(chatId, text, buttons)` → 推指定 chat_id（業務個人私人 Telegram），`chatId` 透過 `resolveBusinessTelegramChatId(業務名)` 動態查「系統設定」表的 `TELEGRAM` 欄位取得；查無業務私人 chat_id 時一律 fallback 回公佈欄群組並在訊息附註「⚠️ 業務未設定私人 Telegram」
   - `buttons` 是 Telegram inline keyboard 格式（`[[{text, url}], ...]`），連結都指向 `doGet` 的網頁動作端點，點了就直接完成核准/續保/取消，不需要開 LINE

### 3. `LINE` 明細（現在只剩「客戶本人直接回覆」與「舊版 postback 操作回饋」，全部不是主動業務通知）

**A. 回覆給「客戶本人」**（用客戶自己的 `userId`，函式 `sendPush`/`lineApiFetch('reply',...)`）：
   - 新用戶審核通過（「🎉 您的 AI 權限已核准開通」）— `5_Order.js` `processUserApproval`
   - 點「系列介紹/實景圖/模面變化圖/原廠目錄」按鈕，成功或查無資料 — `5_Order.js` `handleFlexImagePostback`
   - （2026-10-06 新增）到貨通知：客戶在「庫存不足」回覆按「🔔 到貨通知我」→ 回覆訂閱確認；有貨後**不推播**，等客戶下次傳任何訊息時，在那次回覆裡夾帶「🔔 到貨通知」一則（回覆訊息不吃免費則數）— `3_Notify.js` `handleArrivalSubscribe_`（訂閱）、`attachPendingArrivalNotices_`（夾帶，掛在 `6_Tools.js` `lineApiFetch` 的 reply 路徑）

**B. 操作按鈕的管理員自己收到的回饋**（`5_Order.js` `handlePostback`，走 legacy LINE postback 路徑，正常情況下已經不會再被觸發，因為對應的 Flex 審核卡片都已經改成 Telegram 通知，只有還握著極舊的 LINE 卡片時才會用到）：
   - 「⛔ 權限不足」、找不到工作表、核准單筆/整筆品項、拒絕整筆保留單、核准新用戶

**C. 完全獨立的另一組 LINE Bot**（不同 Channel Token，物流查貨擴充模組，跟本專案通知系統無關）：
   - 訊息含「查貨/進度/送貨/物流/貨到哪了」等關鍵字，在 `doPost` 最前面被攔截 — `GaoYaCi_Bot_Extension.js` `replyGaoYaCiLine_Core`，用獨立的 `GY_CONFIG.CHANNEL_ACCESS_TOKEN`

**D.（補充，非通知）一般查詢的即時文字/Flex 回覆**：`sendReply`/`sendMultiReply`/`sendFlexReply`，底層走 `lineApiFetch('reply',...)`，涵蓋整個 `doPost` 的所有查詢分支。這是「正常對答」不是「主動通知」。

**E.（2026-09-10 新增）客戶自助功能入口**（客戶主動觸發，非機器人主動推播）：
   - 客戶輸入「我的保留」/「保留總覽」/「保留單查詢」→ 回覆 LIFF 按鈕卡片 → 開啟「我的保留單」自助查詢＋修改頁面（`cpanel_tracking.html`）— `5_Order.js` `buildMyReservationsLiffFlex_`。沿用既有 `CONFIG.LIFF_ID_RESERVE`（跟「填保留單」同一個 LIFF App，用網址帶 `mode=myReservations` 參數分流到不同頁面，不用額外去 LINE Developers Console 建新的 LIFF App）。頁面本身用 LIFF SDK 的 `liff.getProfile()` 驗證身份（不是讀網址參數，避免被冒用查改別人的保留）。

**已停用的舊常數**（不要再用來發通知，只剩極少數內部 fallback 讀取，非主動推播）：`CONFIG.ADMIN_NOTIFY_ID`（只在 `6_Tools.js` `getContactForSales` 內部當最後備援 LINE ID）、`PERFORMANCE_GROUP_ID`（`7_Performance.js` 常數還在但已無人呼叫）。`sendAdminFlexPush`/`sendFlexPush`/`sendAdminPush`（`6_Tools.js`）函式本體都還在，但全專案**沒有任何主動通知呼叫點**在用它們了。`broadcastToLine`（multicast 群發）也是未使用的死代碼。

### 4. `Telegram` 明細（依收件對象分類；除特別標註外都走 `pushTelegram`／`pushTelegramTo`）

**公佈欄群組**：
   - 新好友加入（陌生人）— `0_Core.js` `follow` 事件
   - 保留單送出（文字/口語指令、LIFF 網頁表單、OCR 手寫單，3 個入口共用 `buildOrderApprovalTelegramText_`）— `5_Order.js` `handleOrderRequest`/`handleWebFormSubmission`/`handleOCRPostback`，含「核准單筆/核准整筆/拒絕整筆」按鈕（doGet `ac=approveOrderRow`/`approveOrder`/`denyOrder`）
   - 客戶報到申請權限（「公司-姓名」）— `5_Order.js` `handleNewUserApply`，含「准許加入/拒絕」按鈕（doGet `ac=approveUser`/`denyUser`）
   - 保留超佔警示（保留量超過庫存 50%／70%，各只在**首次**達標時發一次，狀態記錄在「庫存警示紀錄」表避免重複）— `3_Notify.js` `sendProductStockAlerts`
   - 每日業績戰報（平日、非假日自動判斷）— `7_Performance.js` `dailyPerformanceAutoPush`
   - 保留追蹤/貨量預警在查無業務私人 Telegram 時的 fallback（見下）
   - （2026-09-10 新增）客戶在「我的保留單」LIFF 頁面自行調整/取消保留數量的 FYI 通知（減少或取消，立即生效後才通知，不用審核）— `3_Notify.js` `updateMyReservationRow_`
   - （2026-09-10 新增）客戶在「我的保留單」LIFF 頁面申請「增加」保留數量，含「✅核准／❌拒絕」按鈕（增加需業務核准才會真的生效，避免客戶自行灌水搶庫存）— `3_Notify.js` `updateMyReservationRow_` 發出、`handleReserveIncreaseApproval_` 處理核准/拒絕（doGet `ac=approveReserveIncrease`/`denyReserveIncrease`）

**業務個人私人 Telegram**（`resolveBusinessTelegramChatId`，查無則 fallback 公佈欄）：
   - 客戶查詢後判定「有問題」需通知（free/class 等級 + 查數量 + 回覆含不足/❌/🟠）— `3_Notify.js` `handleSalesPush`，依「業務分區表」（客戶名稱 → 負責業務）查出對應業務
   - （2026-10-06 新增）到貨通知：客戶訂閱的編號可用量夠了，同一業務的客戶合併成一則「客戶在等的貨有了」— `3_Notify.js` `checkArrivalSubscriptions`（業務欄位取自訂閱當下的 `auth.salesID`）
   - 保留追蹤通知（30/45/60 天分級：一/四=30天、二/五=45天、三=60天，只問「第一次滿期」，狀態記錄在「保留通知紀錄」表）— `3_Notify.js` `sendReservationExpiryAlerts`，含「✅ 繼續保留／❌ 取消保留」按鈕（doGet `ac=renewReserve`/`renewReserveWeb`/`renewReserveSubmit`/`cancelReserve`，45/60 天續保需網頁填原因，寫入「業務回報記錄」表）

**⚠️ 目前 `2_Business.js` `handleInventorySearch` 的「查無此品號」「庫存不足」通知已經不是走 `2_Business.js` 直接發送**，改成統一交給 `handleSalesPush`（`3_Notify.js`）判斷後發送，避免同一個查詢重複通知兩次。

### 5. `Email` 明細（精簡到只剩 4 種，全部走 `sendEmailNotification` 或直接 `GmailApp.sendEmail`）

| # | 觸發時機 | 收件人 | 函式/位置 |
|---|---|---|---|
| 1 | 新好友加好友（陌生人）備份信 | `CONFIG.ADMIN_EMAIL` | `0_Core.js` |
| 2 | 客戶報到申請權限備份信，含核准/拒絕按鈕連結（跟 Telegram 平行發送，同一組連結） | `CONFIG.ADMIN_EMAIL` | `5_Order.js` `handleNewUserApply`，直接 `GmailApp.sendEmail` |
| 3 | 保留單送出備份信（文字/口語、LIFF 網頁表單、OCR 三入口都有） | `CONFIG.ADMIN_EMAIL` | `5_Order.js` `handleOrderRequest`/`handleWebFormSubmission`/`handleOCRPostback` |
| 4 | 每日客戶查詢日報（18:30，**已排除 sales/king/queen/admin/premium/staff 等級的查詢紀錄**，只列一般客戶查詢） | `CONFIG.ADMIN_EMAIL` | `3_Notify.js` `sendDailyQueryLog`（原名 `sendDailyQuerySummary`，已改版） |

**已從程式碼移除、不要再參考的舊 Email 功能**：`sendWeeklyQueryAnalysis`（每週分析）、`sendMonthlyQueryAnalysis`（每月分析）、`sendBossDailyReport`（三家老闆彙整報表）、`runAnalytics`——這些函式已經整個從 `3_Notify.js` 刪除，不是停用，是真的不存在了。保留追蹤通知、缺貨/超佔警示也都已經從 Email 改成 Telegram（見上面第 4 節）。

### 6. 觸發器現況（`registerAnalysisTriggers()`，[3_Notify.js](3_Notify.js) 目前唯一的排程註冊入口）

| 函式 | 排程 | 管道 |
|---|---|---|
| `sendDailyQueryLog` | 每日 18:30 | Email |
| `sendProductStockAlerts` | 週六 08:00 | Telegram 公佈欄 |
| `dailyPerformanceAutoPush` | 每日 18:00 | Telegram 公佈欄 |
| `sendReservationExpiryAlerts` | 週一~五 19:00（各自帶當天門檻） | Telegram 業務私人（fallback 公佈欄） |

**例外（不在 `registerAnalysisTriggers()` 裡）**：`checkArrivalSubscriptions`（到貨通知，每小時，Telegram 業務私人）由第一位客戶訂閱時，在 webhook 裡用 `ensureArrivalSubTrigger_()` 自動建立在本專案。原因是試算表選單可能跑的是另一份容器腳本，從選單建立排程會建到錯的專案。

`registerAnalysisTriggers()` 每次執行都會**先清掉這 4 個 handler 名稱的舊觸發器，再重建**，同時也會主動清掉 5 個舊函式名稱的殘留觸發器（`sendDailyQuerySummary`、`sendBossDailyReport`、`sendWeeklyQueryAnalysis`、`sendMonthlyQueryAnalysis`、`sendOutofStockEmailSummary`）避免孤兒觸發器——**先前發現的 `sendOutofStockEmailSummary` 孤兒觸發器（76% 錯誤率）已經被這個清理機制解決**。

7. 若日後新增通知流程，必須先在這裡補上分類與收件對象，再改程式；若修改/重新命名任何有排程觸發器的函式名稱，**務必同步更新 `registerAnalysisTriggers()` 的 `handlerFuncs`／`legacyFuncs` 清單並重新執行一次**，讓舊觸發器被自動清掉，不要只手動去 GAS 編輯器「觸發條件」頁面刪。

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
- **圖片改優先讀 Cloudflare R2**（2026-09-10 起）：`11_R2Migration.js` 背景批次把 Drive 圖片
  搬到 R2（每 10 分鐘自動接續，`ac=r2Stats&key=gyc_r2_migrate_2026` 有進度畫面），讀取優先序
  改成「R2 優先、Drive 備援」（`5_Order.js`/`4_Flex.js`）。另一個獨立專案「圖片抓取工具」
  （擁有者非目前維護者，已離職狀態不明，**不要把 R2 密鑰放進客戶版機器人以外還開放給不明身份
  存取的專案**）抓圖時也會同步上傳 R2，兩邊各自用各自的 Script Properties 存放的密鑰，
  互相獨立不共用，也不會重複上傳（都靠「目標欄位是否已經是真的 R2 網址」判斷）。

# 🧱 Google Apps Script Clasp 安全部署指引 (Safe Deploy Skill)

## 🎯 核心原則：保護正式 Web App URL 絕對不變

在修改 Google Apps Script (GAS) 的 `doGet` 或 `doPost` 邏輯時，**絕對禁止盲目執行全新的 `npx clasp deploy`**。
盲目執行該命令會產生一個全新的 **Deployment ID**，這會使外部（如 LINE Webhook、LIFF App）綁定的 Web URL 直接失效，導致機器人與網頁表單完全斷線。

---

## 🛠️ 安全部署標準工作流 (Safe Workflow)

當代碼（特別是 `doGet` / `doPost`）修改完成需要部署時，請務必遵循以下步驟：

### 1. 程式碼推送 (Push)
僅推送代碼，此時代碼已進入 GAS 雲端專案：
```bash
npx clasp push
```

### 2. 獲取現有的正式部署 ID (Get Deployment ID)
列出目前所有的部署，找出正式對外服務的那個部署 ID（通常會有 Description 標記，例如 `v1.3.0 保留單網頁表單` 或 `web_app`）：
```bash
npx clasp deployments
```

### 3. 原地更新部署 (Redeploy to Same ID)
使用 `-i` 參數指定該部署 ID 進行覆蓋更新！**這樣做 100% 能保留原始的 Web App URL 不變**：
```bash
npx clasp deploy -i <部署ID> -d "更新內容說明"
```

---

## 🚫 常見致命錯誤 (Common Mistakes)

1. **❌ 錯誤做法**：`npx clasp deploy` (不帶 `-i` 參數)
   - **後果**：GAS 會自動生成一個全新的網址，原本 LINE Developers 上的 Webhook URL 直接報廢。
2. **❌ 錯誤做法**：隨意刪除舊的部署。
   - **後果**：歷史網址徹底消失，無法復原。

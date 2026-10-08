# 圖片連結格式支援與轉換規則

## 概述

本系統中所有圖片推送（系列介紹、實景圖、單片模面變化圖等）都會經過 `normalizeImageUrlForLine()` 函數的標準化處理，確保在 LINE 中能正確打開。

## 支援的圖片連結格式

> ⚠️ **2026-09 更新**：`/uc?export=download` 已確認不可靠——Google Drive 對這個端點常會插入「病毒掃描警告」中繼頁面（尤其檔案較大時），LINE 抓到的是 HTML 不是圖片本體，會一直轉圈圈載入不出來（實際案例：新系列用「圖片抓取工具」批次匯入的 `/file/d/.../view?usp=drive_link` 連結，模面變化圖全部載入失敗）。已改用全專案其他地方（今友利、多公司查詢、`getBestImagesForItem` 等）都證實穩定可用的 `/thumbnail?id=...&sz=w600` 代理格式，`normalizeImageUrlForLine()` 現在統一轉換到這個格式。

### ✅ 支援的格式

| 格式 | 舉例 | 處理方式 | 備註 |
|------|------|---------|------|
| **Google Drive `/thumbnail`** | `https://drive.google.com/thumbnail?id=1ABC...&sz=w600` | 直接使用 | ✅ 最穩定，全專案標準格式 |
| **Google Drive `/file/d/` 分享連結** | `https://drive.google.com/file/d/1ABC.../view?usp=drive_link` | 自動轉換為 `/thumbnail?id=...&sz=w600` | ✅ 自動轉換 |
| **Google Drive `/uc?export=view` 或 `/uc?export=download`** | `https://drive.google.com/uc?export=view&id=1ABC...` | 自動轉換為 `/thumbnail?id=...&sz=w600` | ✅ 自動轉換（`/uc?export=download` 已知不穩定，一律改走 thumbnail） |
| **wsrv.nl 代理連結** | `https://wsrv.nl/?url=...&w=600&q=80` | 直接使用 | ✅ 代理加速 |
| **R2 / CDN 連結** | `https://r2.gao.com/...` | 直接使用 | ✅ 高速傳輸 |
| **其他 HTTP/HTTPS 連結** | `https://example.com/image.jpg` | 直接使用 | ✅ 標準 Web 連結 |

## 自動轉換規則

### Google Drive `/file/d/`、`/uc?export=view`、`/uc?export=download` → `/thumbnail`

**為什麼要轉換？**
- Google Drive 的分享連結 (`/file/d/ID/view`) 在 LINE 中無法直接打開
- `/uc?export=download` 曾經是轉換目標，但已確認對部分檔案會顯示「病毒掃描警告」頁面而失敗，**不要再手動填這個格式**
- 統一轉換為最穩定的縮圖代理格式 (`/thumbnail?id=ID&sz=w600`)

**轉換邏輯：**
```
原始: https://drive.google.com/file/d/1m2eyf6QJGJxNzC9QjRchAeMcavBOLGOj/view?usp=drive_link
↓ 提取 ID: 1m2eyf6QJGJxNzC9QjRchAeMcavBOLGOj
↓
結果: https://drive.google.com/thumbnail?id=1m2eyf6QJGJxNzC9QjRchAeMcavBOLGOj&sz=w600
```

## 套用位置

圖片連結標準化在以下所有位置都會自動執行：

### 1. **系列介紹圖推送** (`5_Order.js` L1302-1308)
- 讀取欄位：`系列介紹`（L72）或 `R2_系列介紹`（L71）
- 推送時自動轉換

### 2. **實景圖推送** (`5_Order.js` L1391-1395)
- 讀取欄位：`FLEX快取`（L42）→ `R2_實景1~7`（L54-60）→ `實景1~7`（L46-52）
- 三層優先級都會標準化
- 自動去重（移除重複 URL）

### 3. **單片/模面變化圖推送** (`5_Order.js` L1442-1445)
- 讀取欄位：`單片1~9`（L61-69）或 `R2_單片連結網址`（L70）
- 隨機排列後推送最多 5 張
- 推送時自動轉換

## Google Sheets 欄位設定建議

### 推薦做法

在 Google Sheets 的圖片欄位中填入：

1. **優先級 1 - 直接填 Drive 連結（自動轉換）**
   ```
   https://drive.google.com/file/d/1m2eyf6QJGJxNzC9QjRchAeMcavBOLGOj/view
   ```
   → 系統自動轉換，無需手動處理

2. **優先級 2 - 直接使用 `/thumbnail` 格式**
   ```
   https://drive.google.com/thumbnail?id=1m2eyf6QJGJxNzC9QjRchAeMcavBOLGOj&sz=w600
   ```
   → 直接使用，最穩定，不會遇到病毒掃描警告頁面問題

3. **優先級 3 - 使用 R2/CDN 連結**
   ```
   https://r2.gao.com/series/abc.jpg
   ```
   → 直接使用，性能最優

4. **優先級 4 - 使用 wsrv.nl 代理**
   ```
   https://wsrv.nl/?url=https://drive.google.com/uc?export=view&id=1ABC...&w=600&q=80
   ```
   → 代理加速，適合大圖片

> ❌ **不要手動填 `/uc?export=download` 格式**——這個端點對部分檔案會顯示 Google 的「病毒掃描警告」中繼頁面而非圖片本體，即使系統會自動轉換偵測到的舊格式，新填連結還是直接用 `/file/d/.../view` 分享連結或 `/thumbnail` 格式最保險。

## 常見問題

### Q: 為什麼我的 Drive 連結在 LINE 中打不開？
**A:** 確認連結格式：
- `drive.google.com/file/d/ID/view` → 系統會自動轉換成 `/thumbnail` 格式，正常情況下沒問題
- ✅ `drive.google.com/thumbnail?id=ID&sz=w600` → 直接可用，最穩定
- ⚠️ `drive.google.com/uc?export=download&id=ID` → 系統會自動轉換成 `/thumbnail`，但不建議手動新填這個格式（部分檔案曾出現病毒掃描警告頁面問題）

### Q: 為什麼有些圖片推送成功但有些失敗？
**A:** 可能原因：
1. 連結格式不正確（檢查是否是可分享的 Drive 連結）
2. Drive 檔案被刪除或權限限制
3. 圖片檔案過大超過 LINE 限制（建議 < 10 MB）

### Q: 實景圖推送有去重，但為什麼還是有重複？
**A:** 檢查 FLEX 快取 JSON 欄位：
- 如果 FLEX 快取中的 `scene` 陣列有重複 URL，系統會自動去重
- 查看 LOG 表的 DEBUG 訊息確認去重前後的數量

## 程式碼位置

- **轉換函數**：`6_Tools.js` 末尾 `normalizeImageUrlForLine(url)`
- **系列介紹推送**：`5_Order.js` L1302-1308
- **實景圖推送**：`5_Order.js` L1388-1395
- **單片圖推送**：`5_Order.js` L1442-1445

## 更新紀錄

| 版本 | 日期 | 變更 |
|------|------|------|
| v1 | 2026-06-28 | 初版：支援 Google Drive 格式轉換、wsrv.nl 代理、R2 CDN |

# 🔍 Flex 卡片 Postback 無反應 — 根本原因 + 改進方案

**日期：** 2026-06-28  
**問題：** 系列介紹、實景圖、模面變化圖按鈕都沒反應  
**根本原因：** 代碼試圖讀 IMAGE 公式，而公式返回值是空值

---

## 📊 完整欄位對應表

| 功能 | 當前代碼讀取 | 欄位列數 | 實際格式 | 是否可用 |
|------|-----------|--------|--------|---------|
| **系列介紹** | '系列介紹' | 44 | 直接 URL | ✅ 可用 |
| **實景圖** | '實景1'~'7' | 46~52 | IMAGE 公式 | ❌ **無法用** |
| | (降級) | 54~60 | R2 直接 URL | ✅ 有備用 |
| **模面變化圖** | '單片1'~'9' | 61~69 | 直接 URL | ✅ 可用 |
| **快取用** | (無) | 42 | JSON 預計算 | ✅ **最快** |

---

## 🚨 為什麼「實景圖」沒反應？

### **代碼問題（5_Order.js L1188-1200）**
```javascript
for (let j = 1; j <= 7; j++) {
  const colName = '實景' + j;
  const colIdx = priceMap[colName];
  if (colIdx !== undefined) {
    let url = String(matchedRow[colIdx] || '').trim();
    if (url && url.includes("http")) {  // ← 問題在這裡！
      // ...
    }
  }
}
```

### **Sheet 中的實際數據**
```
列 46（實景1）：=IMAGE("https://drive.google.com/uc?export=view&id=1Mgy6...", 4, 80, 80)
```

### **為什麼失敗**
1. `getValues()` 讀取 IMAGE 公式
2. IMAGE 公式的返回值 = **空字串** （IMAGE() 函數無返回值，只顯示圖片）
3. `url` = `""` （空字串）
4. `url.includes("http")` = `false`
5. 圖片被跳過，推送失敗 ❌

---

## ✅ 改進方案

### **優先順序（由快到慢）**

#### **優先級 1：FLEX快取 JSON（列 42）—— 速度最快**
```
FLEX快取 內容：
{
  "scene": [
    "https://pub-98cd476501d5474480c785e41e1eec1d.r2.dev/RP612113_scene1_1779499617796.jpg",
    "https://pub-98cd476501d5474480c785e41e1eec1d.r2.dev/RP612113_scene2_1779499603544.jpg",
    ...
  ],
  "piece": [...]
}
```
✅ 一次讀取，JSON parse 就有 7 張實景圖 URL

#### **優先級 2：R2_實景1~7（列 54~60）—— 備用直接 URL**
```
R2_實景1: https://pub-98cd476501d5474480c785e41e1eec1d.r2.dev/RP612113_scene1_1779499617796.jpg
R2_實景2: https://pub-98cd476501d5474480c785e41e1eec1d.r2.dev/RP612113_scene2_1779499603544.jpg
...
```
✅ 直接 URL，無需轉換

#### **優先級 3：實景1~7 IMAGE 公式解析（列 46~52）—— 備用，需解析**
```
實景1: =IMAGE("https://drive.google.com/uc?export=view&id=1Mgy6...", 4, 80, 80)
```
✅ 用正則提取 URL：`/=IMAGE\("([^"]+)"`

---

## 🔧 代碼改進計畫

### **改動 1：新增欄位別名系統**
```javascript
const FIELD_ALIASES = {
  '系列介紹': ['系列介紹', 'R2_系列介紹'],
  'FLEX快取': ['FLEX快取'],
  '實景': { base: '實景', r2: 'R2_實景', range: [1, 7] },
  '單片': { base: '單片', r2: 'R2_單片', range: [1, 9] }
};

function getColumnByName(priceMap, aliases) {
  if (Array.isArray(aliases)) {
    for (let name of aliases) {
      if (priceMap[name] !== undefined) return priceMap[name];
    }
  }
  return undefined;
}
```

### **改動 2：新增 IMAGE 公式解析**
```javascript
function extractImageUrlFromFormula(formula) {
  const match = String(formula).match(/=IMAGE\("([^"]+)"/);
  return match ? match[1] : null;
}
```

### **改動 3：改寫 handleFlexImagePostback**

#### **系列介紹流程**
```
1. 讀列 44（系列介紹） → 直接 URL → 推送 ✅
2. 沒有就讀列 71（R2_系列介紹） → 直接 URL → 推送 ✅
3. 都沒有 → 回覆「無系列介紹」
```

#### **實景圖流程**
```
1. 讀列 42（FLEX快取）→ JSON parse 取 scene[] → 推送前 5 張 ✅✅ 最快！
2. 沒有就讀列 54-60（R2_實景1~7）→ 直接 URL → 推送前 5 張 ✅
3. 都沒有就讀列 46-52（實景1~7）→ 解析 IMAGE 公式 → 推送 ✅
4. 都沒有 → 回覆「無實景圖」
```

#### **模面變化圖流程**
```
1. 讀列 61-69（單片1~9）→ 直接 URL → 隨機排列推送 ✅✅ 最快！
2. 沒有就讀列 70（R2_單片連結網址）→ 直接 URL（備用，通常只有 1 張）
3. 都沒有 → 回覆「無模面圖」
```

---

## 📋 具體改動清單

### **5_Order.js L1129-1250（handleFlexImagePostback 函數）**

- [ ] 刪除硬寫的 `priceMap['系列介紹']` 和 `priceMap['R2_書類圖片']`
- [ ] 改用 `getColumnByName(priceMap, ['系列介紹', 'R2_系列介紹'])`
- [ ] 新增 FLEX快取 JSON parse 邏輯（優先級 1）
- [ ] 新增 R2_實景1~7 讀取邏輯（優先級 2）
- [ ] 新增 IMAGE 公式解析邏輯（優先級 3）
- [ ] 新增 debug logger 於每個分支（方便診斷）
- [ ] 刪除或註解掉我之前加的 debug log（L1139-1182 的無用代碼）

---

## 🎯 預期結果

| 按鈕 | 當前 | 改進後 |
|------|------|---------|
| 系列介紹 | ❌ 無反應 | ✅ 推送列 44 的 Drive URL |
| 實景圖 | ❌ 無反應 | ✅ 推送 FLEX快取 的 R2 URL（最快） |
| 模面變化圖 | ❌ 無反應 | ✅ 推送列 61-69 的 lh3 URL（隨機） |

**性能提升：**
- 原本：讀 priceData 671×71 + 解析空值 = ~500ms ❌
- 改進：讀 FLEX快取 JSON = ~20ms ✅✅ **快 25 倍！**

---

## ⏳ 確認清單

- [ ] 是否改用動態欄位讀取？
- [ ] 是否依照優先級 1→2→3 排序？
- [ ] 是否移除硬寫的欄位名稱？
- [ ] 是否加入 debug logger？
- [ ] 改完後部署測試一次


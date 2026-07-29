# 🔑 Skill: Whitelist & Key Validation Logic

This document details the authorization validation, database structures, and runtime routing rules for the AIT/高雅瓷 LINE Bot and Inventory Dashboard.

---

## 1. Database & Sheet Schema

The white list for LINE Bot users resides in the Main Database (`SS_ID_MAIN` / `DATA_SS_ID` = `1G5q-GixMWSdJJeF8ZiXWMOfrx4FMobER25jNc8m4Zds`) in the sheet named **白名單**.

### Required Columns (Self-Healing)
The database must maintain these 7 columns:
1. `userid` - The Line user ID (e.g. `U123456...`)
2. `等級` - Permissions role (`king`, `queen`, `sales`, `Premium`, `free`)
3. `名字` - Full name in format `Company-Name`
4. `協定業務 ID` - Line User ID of the sales representative managing the client
5. `EMAIL` - User email (optional)
6. `公司` - Company or project name
7. `狀態` - Verification status (`approved` or `待審核`)

*Note: The system automatically self-heals by running `ensureLineBotWhitelistHeaders_(wlSheet)` on initialization to append missing headers without losing data.*

---

## 2. Authentication & Authorization Levels (`checkAuth`)

When a webhook request arrives, the user's role is loaded via:
`const auth = checkAuth(userId, db.wl, maps.wl);`

### Role Hierarchy & Privileges

| Role Level | Description | Privileges |
| :--- | :--- | :--- |
| **king** / **queen** / **admin** | Highest Administrative Level | Full access to approve users, approve reservations, and perform inventory edits. |
| **sales** | Internal Sales Staff | Can perform inventory searches and request reservations, but cannot approve users or lock stock directly. |
| **Premium** | Premium Dealer / External Distributor | High-priority query access; matches company name to restrict logistics visibility. |
| **free** | Default Customer Level | Standard query access; restricted to public data and must submit registrations/reservations for approval. |

---

## 3. Safe Verification & Approval Rules

### Rule 1: No Role Overwriting on Approval
When approving a user in LINE (`approveUser` postback) or re-registering, do NOT overwrite their level to `free` if they already possess an elevated role.

```javascript
// ✅ Correct Implementation: Protect existing role
if (wMaps['等級'] !== undefined) {
  const curLevel = String(wlData[mainRowIdx - 1][wMaps['等級']] || '').trim();
  if (!curLevel) {
    wlSheet.getRange(mainRowIdx, wMaps['等級'] + 1).setValue("free");
  }
}
```

### Rule 2: Conditional Sheet Loading in Webhooks
Never load sheets or fetch ranges that belong to external modules (such as reservation sheets) at the global namespace of `handlePostback`. Only fetch them inside conditional branches.

```javascript
// ✅ Correct Implementation: Only load reservation data inside reservation actions
if (params.ac === 'approveOrderRow' || params.ac === 'approveOrder') {
  const orderReqSheet = dbSS.getSheetByName("(保留暫存)");
  const cloudSheet = dbSS.getSheetByName(SHEET_NAME.CLOUD_RESERVE);
  ...
}
```
This guarantees that updates to database structures or decoupled sheets will not break unrelated operations (e.g., user approvals).

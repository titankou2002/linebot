function debugListSheets() {
  const ss = SpreadsheetApp.openById('1G5q-GixMWSdJJeF8ZiXWMOfrx4FMobER25jNc8m4Zds');
  const sheets = ss.getSheets();
  const names = sheets.map(s => s.getName());
  console.log("Sheets: " + names.join(", "));
  return names;
}

# Connecting VendorApp to Google Sheets

To use Google Sheets as your dynamic database (including user login) and **completely bypass all browser CORS restrictions**, we use an intelligent GET-based API router.

## Step 1: Add the Apps Script
1. Create a brand new Google Sheet.
2. Go to **Extensions > Apps Script** in the top menu.
3. Delete any boilerplate code and paste the complete script below:

```javascript
// ── Auto Initialization: Creates required sheets and headers dynamically ──
function initSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetsDef = [
    { name: 'Vendors',  headers: ['id', 'name', 'contact', 'email', 'phone', 'address', 'gst'] },
    { name: 'Invoices', headers: ['id', 'date', 'number', 'vendor', 'po', 'category', 'dueDate', 'basic', 'gst', 'discount', 'roundoff', 'total', 'remarks'] },
    { name: 'Payments', headers: ['id', 'date', 'vendor', 'invoiceNumber', 'amount', 'mode', 'against', 'bank', 'voucher', 'remarks'] },
    { name: 'Users',    headers: ['username', 'password', 'role', 'name'] }
  ];
  sheetsDef.forEach(function(def) {
    if (!ss.getSheetByName(def.name)) {
      var sheet = ss.insertSheet(def.name);
      sheet.appendRow(def.headers);
      sheet.getRange(1, 1, 1, def.headers.length).setFontWeight("bold").setBackground("#e0e7ff").setFontColor("#3730a3");
      sheet.setRowHeight(1, 30);
    }
  });

  // Seed default users if the Users sheet is empty (only header row)
  var usersSheet = ss.getSheetByName('Users');
  if (usersSheet && usersSheet.getLastRow() <= 1) {
    usersSheet.appendRow(['admin',  'admin123',  'admin',  'Administrator']);
    usersSheet.appendRow(['viewer', 'viewer123', 'viewer', 'View Only User']);
  }
}

// ── GET Logic (Read & Write via Query Params to bypass CORS) ──
function doGet(e) {
  initSheets();
  var action     = e ? e.parameter.action     : null;
  var payloadStr = e ? e.parameter.payload    : null;

  if (payloadStr) {
    try {
      return executeAction(action, JSON.parse(payloadStr));
    } catch(err) {
      return json({error: "Invalid JSON payload"});
    }
  }

  if (action == 'getData') {
    return json({
      vendors:  getSheetData('Vendors'),
      invoices: getSheetData('Invoices'),
      payments: getSheetData('Payments')
    });
  }

  // ── Login action ──────────────────────────────────────────────
  if (action == 'login') {
    var username = e.parameter.username ? e.parameter.username.toLowerCase().trim() : '';
    var password = e.parameter.password || '';
    var users    = getSheetData('Users');
    for (var i = 0; i < users.length; i++) {
      var u = users[i];
      if (String(u.username).toLowerCase().trim() === username && String(u.password) === password) {
        return json({ success: true, user: { username: u.username, name: u.name, role: u.role } });
      }
    }
    return json({ success: false, error: 'Invalid username or password.' });
  }

  return json({error: "Unknown GET action"});
}

// ── POST Logic (Fallback) ──
function doPost(e) {
  initSheets();
  try {
    var data = JSON.parse(e.postData.contents);
    return executeAction(data.action, data);
  } catch(err) {
    return json({error: err.toString()});
  }
}

// ── Core Database Execution Engine ──
function executeAction(action, data) {
  try {
    if (action == 'addVendor')     { SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Vendors').appendRow([data.id, data.name, data.contact, data.email, data.phone, data.address, data.gst]); }
    else if (action == 'editVendor')   { editRow('Vendors', data.id, [data.id, data.name, data.contact, data.email, data.phone, data.address, data.gst]); }
    else if (action == 'deleteVendor') { deleteRow('Vendors', data.id); }
    else if (action == 'addInvoice')   { SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Invoices').appendRow([data.id, data.date, data.number, data.vendor, data.po, data.category, data.dueDate, data.basic, data.gst, data.discount, data.roundoff, data.total, data.remarks]); }
    else if (action == 'editInvoice')  { editRow('Invoices', data.id, [data.id, data.date, data.number, data.vendor, data.po, data.category, data.dueDate, data.basic, data.gst, data.discount, data.roundoff, data.total, data.remarks]); }
    else if (action == 'deleteInvoice'){ deleteRow('Invoices', data.id); }
    else if (action == 'addPayment')   { SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Payments').appendRow([data.id, data.date, data.vendor, data.invoiceNumber, data.amount, data.mode, data.against, data.bank, data.voucher, data.remarks]); }
    else if (action == 'editPayment')  { editRow('Payments', data.id, [data.id, data.date, data.vendor, data.invoiceNumber, data.amount, data.mode, data.against, data.bank, data.voucher, data.remarks]); }
    else if (action == 'deletePayment'){ deleteRow('Payments', data.id); }
    else { return json({error: "Unknown operation"}); }
    return json({success: true, id: data.id});
  } catch(err) {
    return json({error: err.toString()});
  }
}

// ── Helpers ──
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function getSheetData(sheetName) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  var result = [];
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    for (var j = 0; j < headers.length; j++) { obj[headers[j]] = data[i][j]; }
    result.push(obj);
  }
  return result;
}

function editRow(sheetName, id, newRowData) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  var data  = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] == id) { sheet.getRange(i+1,1,1,newRowData.length).setValues([newRowData]); break; }
  }
}

function deleteRow(sheetName, id) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  var data  = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] == id) { sheet.deleteRow(i+1); break; }
  }
}
```

## Step 2: Deploy the Script
1. Click **Deploy** > **New deployment**
2. Select **Web app**
3. Set *Execute as* → **Me**
4. Set *Who has access* → **Anyone**
5. Click **Deploy** → Copy the **Web App URL**

## Step 3: Inject the URL into app.js
```javascript
window.CONFIG = {
  USE_GOOGLE_SHEETS: true,
  SCRIPT_URL: 'https://script.google.com/macros/s/YOUR_ID_HERE/exec'
};
```

## Step 4: Manage Users in Google Sheets

Open your Google Sheet → go to the **Users** sheet. It has 4 columns:

| username | password | role | name |
|----------|----------|------|------|
| admin | admin123 | admin | Administrator |
| viewer | viewer123 | viewer | View Only User |
| ranga | ranga@123 | admin | Ranga |

- **role** must be exactly `admin` or `viewer`
- Add/edit/remove rows directly in the sheet to manage users
- Changes take effect on next login attempt (no app restart needed)

> [!IMPORTANT]
> After updating the Apps Script, always click **Deploy > Manage Deployments > Edit (pencil icon) > set Version to "New version" > Deploy** to apply your changes.

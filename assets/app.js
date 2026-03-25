// â”€â”€ Toaster Notification â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
window.showToaster = function(message, type = 'success') {
  let toaster = document.getElementById('main-toaster');
  if (!toaster) {
    toaster = document.createElement('div');
    toaster.id = 'main-toaster';
    document.body.appendChild(toaster);
  }
  toaster.textContent = message;
  toaster.className = `fixed left-1/2 bottom-8 z-[9999] px-6 py-3 rounded-xl shadow-lg font-bold text-sm transition-all duration-300 pointer-events-none select-none ` +
    (type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white');
  toaster.style.transform = 'translateX(-50%)';
  toaster.style.opacity = '1';
  setTimeout(() => { toaster.style.opacity = '0'; }, 2000);
};
// ============================================================
//  Vendor Outstanding App — Main JS
// ============================================================

// â”€â”€ Shared data — seeded once at startup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
window.CONFIG = {
  USE_GOOGLE_SHEETS: true, // Google SDK integration is actively ENABLED
  SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxP3-LyhCYGTEtWmXFiC3TcHNq3hCrnQO9KonCNRZmrYVVg28S_qsetYX5sbj5U_I4XBQ/exec' // Paste your Google Apps Script Web App URL here
};

async function initDatabase() {
  if (CONFIG.USE_GOOGLE_SHEETS && CONFIG.SCRIPT_URL) {
    try {
      const res = await fetch(CONFIG.SCRIPT_URL + '?action=getData');
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error("Google Sheets JSON parse failed. It may be rate-limited.", e);
        data = null;
      }
      
      if (data) {
        // Filter out the 'Tech Corp' test data safely so the user's view is immediately clean of seeded rubbish
        window.vendorList = (data.vendors || []).filter(v => !v.name.startsWith("Tech Corp ") && !v.name.startsWith("Demo Vendor"));
        window.invoiceList = (data.invoices || []).filter(i => !i.vendor.startsWith("Tech Corp ") && !i.vendor.startsWith("Demo Vendor"));
        window.paymentList = (data.payments || []).filter(p => !p.vendor.startsWith("Tech Corp ") && !p.vendor.startsWith("Demo Vendor"));
        return;
      }
    } catch (err) {
      console.error('Failed to load Google Sheets DB:', err);
    }
  }
  
  // Empty fallback if it fails completely
  window.vendorList = [];
  window.invoiceList = [];
  window.paymentList = [];
}

window.saveToDatabase = function (action, payload) {
  if (CONFIG.USE_GOOGLE_SHEETS && CONFIG.SCRIPT_URL) {
    // Send standard fire-and-forget payload over a GET request to bypass ALL CORS restrictions entirely natively.
    const url = `${CONFIG.SCRIPT_URL}?action=${encodeURIComponent(action)}&payload=${encodeURIComponent(JSON.stringify({ id: payload.id, ...payload }))}`;
    fetch(url, { method: 'GET' }).catch(err => console.error("Google Sheets Sync Error:", err));
  }
  // Hard refresh the global distribution mathematical engine caching so UI reflects new/edited/deleted data natively right away
  if (typeof window.buildAllocations === 'function') window.buildAllocations();
};

// â”€â”€ GLOBAL PAYMENT ALLOCATION ENGINE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
window.buildAllocations = function() {
  window._invPaidAllocations = {};
  window._invPaymentRefs = {};

  const allPayments = [...(window.paymentList || [])].sort((a, b) => new Date(a.date) - new Date(b.date));
  const allInvoices = (window.invoiceList || []).reduce((acc, inv) => {
    acc[inv.number] = { total: Number(inv.total)||0, allocated: 0, date: new Date(inv.date), refs: [] };
    return acc;
  }, {});

  allPayments.forEach(p => {
    let unallocatedAmount = Number(p.amount) || 0;
    const attachedInvs = String(p.invoiceNumber || '').split(',').map(x => x.trim()).filter(Boolean);
    if (!attachedInvs.length) return;

    // Sort target invoices oldest first to fill debts chronologically
    const targetInvs = attachedInvs
      .map(invNo => ({ no: invNo, info: allInvoices[invNo] }))
      .filter(x => x.info)
      .sort((a,b) => a.info.date - b.info.date);

    if (!targetInvs.length) return;

    let totalAllocatedToInvoices = 0;

    if (targetInvs.length === 1) {
       const invBalance = targetInvs[0].info.total - targetInvs[0].info.allocated;
       const toApply = Math.min(Math.max(0, invBalance), unallocatedAmount);
       if (toApply > 0) {
         targetInvs[0].info.allocated += toApply;
         unallocatedAmount -= toApply;
         totalAllocatedToInvoices += toApply;
         targetInvs[0].info.refs.push({ ...p, allocated: toApply });
       }
    } else {
       targetInvs.forEach(target => {
          const invBalance = target.info.total - target.info.allocated;
          if (invBalance > 0 && unallocatedAmount > 0) {
             const toApply = Math.min(invBalance, unallocatedAmount);
             target.info.allocated += toApply;
             unallocatedAmount -= toApply;
             totalAllocatedToInvoices += toApply;
             target.info.refs.push({ ...p, allocated: toApply });
          }
       });
    }

    if (unallocatedAmount > 0) {
       if (!window._excessPayments) window._excessPayments = {};
       window._excessPayments[p.id] = unallocatedAmount;
    }
  });

  Object.keys(allInvoices).forEach(invNo => {
    window._invPaidAllocations[invNo] = allInvoices[invNo].allocated;
    window._invPaymentRefs[invNo] = allInvoices[invNo].refs;
  });
};

window.getPaidAmountForInvoice = function(invoiceNumber) {
  if (!window._invPaidAllocations) window.buildAllocations();
  return window._invPaidAllocations[invoiceNumber] || 0;
};
window.getPaymentRefsForInvoice = function(invoiceNumber) {
  if (!window._invPaymentRefs) window.buildAllocations();
  return window._invPaymentRefs[invoiceNumber] || [];
};

// â”€â”€ Utility: populate a <select> from an array â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function populateDropdown(selectId, options, valueKey, labelKey) {
  const select = document.getElementById(selectId);
  if (!select) return;
  select.innerHTML = '<option value="">-- Select --</option>' +
    options.map(opt => `<option value="${opt[valueKey]}">${opt[labelKey]}</option>`).join('');
}

window.formatDate = function(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.valueOf())) return dateStr;
  const days = d.getDate().toString().padStart(2, '0');
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days} ${months[d.getMonth()]} ${d.getFullYear()}`;
};

window.toIsoDate = function(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.valueOf())) return '';
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

window.exportToExcel = async function(filename, sheetName, columns, dataRows, metadata = []) {
  if (typeof ExcelJS === 'undefined') {
    alert("Excel processing library is still loading. Please try again in a few seconds!");
    return;
  }
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);

  let startRow = 1;

  if (metadata && metadata.length > 0) {
    metadata.forEach(m => {
      const row = sheet.addRow([m.label, m.value]);
      row.height = 22;
      const lblCell = row.getCell(1);
      const valCell = row.getCell(2);
      
      lblCell.font = { name: 'Inter', size: 10, bold: true, color: { argb: 'FF4F46E5' } };
      lblCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } }; // indigo-100
      lblCell.alignment = { vertical: 'middle', horizontal: 'right' };
      lblCell.border = { top: {style:'thin', color:{argb:'FFC7D2FE'}}, bottom: {style:'thin', color:{argb:'FFC7D2FE'}}, left: {style:'thin', color:{argb:'FFC7D2FE'}}, right: {style:'thin', color:{argb:'FFC7D2FE'}} };
      
      valCell.font = { name: 'Inter', size: 10, bold: true, color: { argb: 'FF111827' } };
      valCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      
      if (columns.length > 2) sheet.mergeCells(startRow, 2, startRow, columns.length);
      startRow++;
    });
    sheet.addRow([]); // internal spacer
    startRow++;
  }

  sheet.views = [{ state: 'frozen', ySplit: startRow }];

  // Write headers
  const headerRow = sheet.addRow(columns.map(c => c.header));
  headerRow.height = 25;
  
  // Set column widths natively after writing header so ExcelJS maps them perfectly
  columns.forEach((c, i) => {
    sheet.getColumn(i + 1).width = c.width || 15;
  });

  headerRow.eachCell((cell, colNumber) => {
    cell.font = { name: 'Inter', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  dataRows.forEach(rowData => sheet.addRow(rowData));

  // Style the data rows specifically skipping metadata and headers
  let dataRowIx = 1;
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= startRow) return;
    row.height = 22;
    
    if (dataRowIx % 2 === 0) {
      row.eachCell({ includeEmpty: true }, cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
      });
    }
    
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const col = columns[colNumber - 1];
      if (!col) return;
      cell.font = { name: 'Inter', size: 10, color: { argb: col.fontColor || 'FF1F2937' }, bold: col.bold || false };
      cell.alignment = { vertical: 'middle', horizontal: col.align || 'left', wrapText: true };
      if (col.format === 'currency' && typeof cell.value === 'number') {
        cell.numFmt = '₹ #,##0.00';
      }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
      };
    });
    dataRowIx++;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: "application/octet-stream" }), `${filename}.xlsx`);
};

// ── SPA Page Loader ──────────────────────────────────────────
window.highlightNav = function(hash) {
  const navIds = ['dashboard', 'vendors', 'invoices', 'payments', 'report', 'analytics', 'add-invoice', 'add-payment'];
  // Map sub-pages to their parent nav IDs
  const navMap = {
    'dashboard': 'dashboard', 'vendors': 'vendors',
    'invoices': 'invoices', 'add-invoice': 'invoices',
    'payments': 'payments', 'add-payment': 'payments',
    'report': 'report', 'analytics': 'analytics'
  };
  const page = hash.split('-').length > 1 && (hash === 'add-invoice' || hash === 'add-payment' || hash === 'vendor-report') ? hash : hash.split('-')[0];
  const activeId = navMap[hash] || navMap[page] || 'dashboard';
  ['dashboard','vendors','invoices','payments','report','analytics'].forEach(id => {
    const nav = document.getElementById('nav-' + id);
    const drw = document.getElementById('drawer-' + id);
    if (nav) {
      if (id === activeId) nav.classList.add('active', 'bg-blue-600', 'text-white');
      else nav.classList.remove('active', 'bg-blue-600', 'text-white');
    }
    if (drw) {
      if (id === activeId) drw.classList.add('active', 'bg-blue-600', 'text-white');
      else drw.classList.remove('active', 'bg-blue-600', 'text-white');
    }
  });
};


window.loadPage = function (page) {
  console.log('[SPA] Loading page:', page);
  let pageFile = '';
  let pageInit = null;

  switch (page) {
    case 'vendors':        pageFile = 'pages/vendors.html';       pageInit = null; break;
    case 'invoices':       pageFile = 'pages/invoices.html';      pageInit = null; break;
    case 'payments':       pageFile = 'pages/payments.html';      pageInit = null; break;
    case 'add-invoice':    pageFile = 'pages/add-invoice.html';   pageInit = null; break;
    case 'add-payment':    pageFile = 'pages/add-payment.html';   pageInit = null; break;
    case 'report':         pageFile = 'pages/report.html';        pageInit = null; break;
    case 'vendor-report':  pageFile = 'pages/vendor-report.html'; pageInit = vendorReportPageInit; break;
    case 'analytics':      pageFile = 'pages/analytics.html';     pageInit = window.analyticsPageInit; break;
    case 'users':          pageFile = 'pages/users.html';         pageInit = null; break;
    case 'dashboard':
    default:               pageFile = 'pages/dashboard.html';      pageInit = dashboardInit; break;
  }

  window.highlightNav(page);

  // â”€â”€ Inject shimmer skeleton matching the page shape â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const mc = document.getElementById('main-content');
  const SKEL = {
    _card: (h='h-24') => `<div class="bg-white rounded-2xl shadow-sm border border-gray-100 ${h} skeleton"></div>`,
    _row:  (cols=4)   => `<div class="grid grid-cols-${cols} gap-4">${Array(cols).fill('<div class="h-9 rounded-xl skeleton"></div>').join('')}</div>`,
    _tableRows: (n=6) => Array(n).fill(`<div class="h-10 rounded-xl skeleton w-full"></div>`).join(''),
    _kpi:  (n=4)      => `<div class="grid grid-cols-2 md:grid-cols-${n} gap-4">${Array(n).fill('<div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 skeleton h-24"></div>').join('')}</div>`,
    _header: ()       => `<div class="flex justify-between items-center"><div class="space-y-2"><div class="h-7 w-48 rounded-xl skeleton"></div><div class="h-4 w-36 rounded-lg skeleton"></div></div><div class="flex gap-2">${Array(3).fill('<div class="h-9 w-24 rounded-xl skeleton"></div>').join('')}</div></div>`,
  };
  const skeletons = {
    dashboard:     `<div class="p-5 space-y-5 animate-pulse">${SKEL._header()}<div class="grid grid-cols-2 md:grid-cols-4 gap-4">${Array(4).fill('<div class="bg-white rounded-2xl p-5 h-28 skeleton border border-gray-100"></div>').join('')}</div>${SKEL._card('h-64')}<div class="grid grid-cols-1 md:grid-cols-2 gap-4">${SKEL._card('h-48')}${SKEL._card('h-48')}</div></div>`,
    vendors:       `<div class="p-5 space-y-5 animate-pulse">${SKEL._header()}${SKEL._kpi(4)}<div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">${SKEL._row(6)}${SKEL._tableRows(8)}</div></div>`,
    invoices:      `<div class="p-5 space-y-5 animate-pulse">${SKEL._header()}${SKEL._kpi(4)}<div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">${SKEL._row(7)}${SKEL._tableRows(10)}</div></div>`,
    payments:      `<div class="p-5 space-y-5 animate-pulse">${SKEL._header()}${SKEL._kpi(4)}<div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">${SKEL._row(8)}${SKEL._tableRows(10)}</div></div>`,
    report:        `<div class="p-5 space-y-5 animate-pulse">${SKEL._header()}${SKEL._kpi(4)}<div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">${SKEL._row(5)}${SKEL._tableRows(12)}</div></div>`,
    analytics:     `<div class="p-5 space-y-5 animate-pulse">${SKEL._header()}${SKEL._kpi(4)}<div class="grid grid-cols-1 md:grid-cols-2 gap-5">${SKEL._card('h-72')}${SKEL._card('h-72')}</div>${SKEL._card('h-48')}</div>`,
    'add-invoice': `<div class="p-5 max-w-5xl mx-auto space-y-5 animate-pulse"><div class="h-16 rounded-2xl skeleton"></div><div class="grid grid-cols-1 xl:grid-cols-3 gap-5"><div class="xl:col-span-2 space-y-5">${SKEL._card('h-52')}${SKEL._card('h-72')}${SKEL._card('h-36')}${SKEL._card('h-16')}</div><div class="space-y-5">${SKEL._card('h-72')}${SKEL._card('h-52')}</div></div></div>`,
    'add-payment': `<div class="p-5 max-w-5xl mx-auto space-y-5 animate-pulse"><div class="h-16 rounded-2xl skeleton"></div><div class="grid grid-cols-1 xl:grid-cols-3 gap-5"><div class="xl:col-span-2 space-y-5">${SKEL._card('h-48')}${SKEL._card('h-56')}${SKEL._card('h-64')}${SKEL._card('h-16')}</div><div class="space-y-5">${SKEL._card('h-64')}${SKEL._card('h-48')}</div></div></div>`,
    'vendor-report':`<div class="p-5 space-y-5 animate-pulse"><div class="h-10 w-28 rounded-xl skeleton"></div><div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"><div class="h-40 skeleton m-4 rounded-xl"></div><div class="h-12 skeleton mx-4 mb-4 rounded-xl"></div></div>${SKEL._kpi(3)}<div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">${SKEL._row(6)}${SKEL._tableRows(8)}</div></div>`,
    users:         `<div class="p-5 space-y-5 animate-pulse">${SKEL._header()}${SKEL._kpi(3)}<div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">${SKEL._row(5)}${SKEL._tableRows(6)}</div></div>`,
  };

  if (mc) mc.innerHTML = skeletons[page] || skeletons['dashboard'];

  loadHTML('main-content', pageFile, function () {
    if (pageInit) pageInit();
  });
};



// â”€â”€ Auth helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
window.getSession = function() {
  try { return JSON.parse(localStorage.getItem('_vapp_user')); } catch { return null; }
};

window.isAdmin = function() {
  const s = window.getSession(); return s && s.role === 'admin';
};

window.isViewer = function() {
  const s = window.getSession(); return s && s.role === 'viewer';
};

window.logoutUser = function() {
  if (!confirm('Are you sure you want to log out?')) return;
  localStorage.removeItem('_vapp_user');
  window.location.reload();
};

// Apply viewer restrictions — hides all write-action buttons for role=viewer
window.applyRoleRestrictions = function() {
  if (!window.isViewer()) {
    // If Admin, show Users link if it exists
    ['nav-users', 'drawer-users'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'flex';
    });
    return; 
  }

  // Hide the USERS nav link if present
  ['nav-users', 'drawer-users'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  // Generic: hide all buttons that add/edit/delete
  const sels = [
    'button[onclick*="openVendorModal"]', 'button[onclick*="openInvoiceModal"]', 'button[onclick*="openPaymentModal"]',
    'button[onclick*="addVendorInvoice"]', 'button[onclick*="addVendorPayment"]', 'button[onclick*="editVendor"]',
    'button[onclick*="deleteVendor"]', 'button[onclick*="editInvoice"]', 'button[onclick*="deleteInvoice"]',
    'button[onclick*="editPayment"]', 'button[onclick*="deletePayment"]', 'button[onclick*="bulkDeleteVendors"]',
    'button[onclick*="_delete"]', 'button[onclick*="_quickPay"]', 'button[onclick*="_add"]',
    'button[onclick*="add-invoice"]', 'button[onclick*="add-payment"]', 'button[onclick*="save"]',
    'a[href="#add-invoice"]', 'a[href="#add-payment"]', '.btn-primary', '.btn-error'
  ];
  
  sels.forEach(sel => {
    document.querySelectorAll(sel).forEach(el => {
      if (!el.innerText.toLowerCase().includes('export') && !el.classList.contains('tab-btn')) {
        el.style.display = 'none';
      }
    });
  });

  // Disable inputs if on add form
  if (window.location.hash.includes('add-')) {
    document.querySelectorAll('input, select, textarea').forEach(el => el.disabled = true);
    document.querySelectorAll('button').forEach(b => {
      const txt = b.innerText.toLowerCase();
      if (txt.includes('save') || txt.includes('add')) b.style.display = 'none';
    });
  }

  // Show a viewer banner if not already present
  if (!document.getElementById('viewer-banner')) {
    const banner = document.createElement('div');
    banner.id = 'viewer-banner';
    banner.innerHTML = `<span class="material-icons text-[15px]">visibility</span> You are in <b>View-Only</b> mode. Contact an Admin to make changes.`;
    Object.assign(banner.style, {
      position: 'fixed', bottom: '16px', left: '50%', transform: 'translateX(-50%)',
      background: '#7c3aed', color: '#fff', padding: '8px 20px', borderRadius: '999px',
      fontSize: '12px', fontWeight: '600', zIndex: '9998', display: 'flex',
      alignItems: 'center', gap: '8px', boxShadow: '0 4px 20px rgba(124,58,237,0.4)',
      letterSpacing: '0.01em', whiteSpace: 'nowrap'
    });
    document.body.appendChild(banner);
  }
};

function _populateLayoutUser() {
  const user = window.getSession();
  if (!user) return;
  const avatar  = document.getElementById('layout-avatar');
  const uname   = document.getElementById('layout-username');
  const rbadge  = document.getElementById('layout-role-badge');
  if (avatar)  avatar.textContent  = user.name.charAt(0).toUpperCase();
  if (uname)   uname.textContent   = user.name;
  if (rbadge) {
    rbadge.textContent  = user.role.toUpperCase();
    rbadge.style.background = user.role === 'admin' ? '#3f51b5' : '#7c3aed';
  }
}


function _bootMainApp() {
  console.log('[APP] Booting main application...');
  initDatabase().then(() => {
    loadHTML('layout-root', 'components/layout.html', function () {
      _populateLayoutUser();

      // Register invoice + payment page-navigation functions immediately (no modal HTML needed)
      invoiceModalInit();
      paymentModalInit();

      // Load vendor modal (only one still needed)
      try {
        const mContainer = document.getElementById('modals');
        if (mContainer) {
          fetch('components/vendor-modal.html').then(r => r.text()).then(html => {
            mContainer.innerHTML = html;
            vendorModalInit();
          }).catch(e => console.error("[APP] Modal fetch error:", e));
        }
      } catch(e) { console.error("[APP] Modal dom error:", e); }

      // Sidebar / drawer
      const mobileDrawer  = document.getElementById('mobile-drawer');
      const sidebarToggle = document.getElementById('sidebar-toggle');
      const drawerClose   = document.getElementById('drawer-close');

      const openDrawer  = () => mobileDrawer && mobileDrawer.classList.remove('hidden');
      const closeDrawer = () => mobileDrawer && mobileDrawer.classList.add('hidden');

      if (sidebarToggle) sidebarToggle.onclick = openDrawer;
      if (drawerClose)   drawerClose.onclick   = closeDrawer;
      if (mobileDrawer)  mobileDrawer.onclick  = (e) => { if (e.target === mobileDrawer) closeDrawer(); };

      // Security Pass mapping for any asynchronous mutations
      const observer = new MutationObserver(() => {
        if (window.applyRoleRestrictions) window.applyRoleRestrictions();
      });
      observer.observe(document.getElementById('layout-root') || document.body, {childList: true, subtree: true});

      // Page navigation wrapping for role restrictions (once)
      if (!window._isWrappingLoadPage) {
        window._isWrappingLoadPage = true;
        const origLP = window.loadPage.bind(window);
        window.loadPage = function(page) {
          origLP(page);
          setTimeout(() => window.applyRoleRestrictions(), 300);
        };
      }

      let hash = window.location.hash.replace('#', '') || 'dashboard';
      window.loadPage(hash);

      window.addEventListener('hashchange', function () {
        let h = window.location.hash.replace('#', '') || 'dashboard';
        window.loadPage(h);
        closeDrawer();
      });
    });
  });
}

// â”€â”€ Bootstrap â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
document.addEventListener('DOMContentLoaded', function () {
  console.log('[APP] Initializing...');
  const session = window.getSession();

  if (session) {
    console.log('[APP] Active session found. User:', session.username);
    window._appUser = session;
    _bootMainApp();
  } else {
    console.log('[APP] No active session. Showing login page...');
    window._bootApp = _bootMainApp;
    loadHTML('layout-root', 'pages/login.html', function () {});
  }
});


// ============================================================
//  VENDOR REPORT EXCEL EXPORT
// ============================================================
window.exportVendorReport = function() {
  if (!currentVendor) return alert("No vendor selected.");
  const invoices = (window.invoiceList || []).filter(inv => inv.vendor === currentVendor.name);
  const payments = (window.paymentList || []).filter(p => p.vendor === currentVendor.name);
  
  if (invoices.length === 0 && payments.length === 0) return alert("No transactions available to export.");

  let combined = [];
  invoices.forEach(inv => combined.push({ 
    dateObj: new Date(inv.date), dateStr: window.formatDate(inv.date), type: 'Invoice',
    invoiceNumber: inv.number,
    basic: inv.basic || 0, gst: inv.gst || 0,
    total: inv.total, credit: 0,
    payDate: '', payAmount: 0, payMode: '', payAgainst: ''
  }));
  payments.forEach(p => combined.push({ 
    dateObj: new Date(p.date), dateStr: window.formatDate(p.date), type: 'Payment',
    invoiceNumber: '', basic: 0, gst: 0, total: 0, credit: p.amount,
    payDate: window.formatDate(p.date), payAmount: p.amount,
    payMode: p.mode || '', payAgainst: p.invoiceNumber || ''
  }));
  combined.sort((a, b) => a.dateObj - b.dateObj);

  if (typeof ExcelJS === 'undefined') { alert("ExcelJS still loading. Try again."); return; }

  const today = new Date();
  const WB = new ExcelJS.Workbook();
  const WS = WB.addWorksheet('Vendor Statement');

  const C_HEADER_BG = 'FFFFA07A', C_HEADER_FONT = 'FF8B0000', C_TITLE_BG = 'FFFFDEAD';
  const C_YELLOW = 'FFFFE066', C_BLUE = 'FFB8D4EA', C_ORANGE = 'FFFFC87C';
  const C_WHITE = 'FFFFFFFF', C_BORDER = 'FF000000';

  const boldBorder = { top:{style:'medium',color:{argb:C_BORDER}}, left:{style:'medium',color:{argb:C_BORDER}}, bottom:{style:'medium',color:{argb:C_BORDER}}, right:{style:'medium',color:{argb:C_BORDER}} };
  const thinBorder = { top:{style:'thin',color:{argb:C_BORDER}}, left:{style:'thin',color:{argb:C_BORDER}}, bottom:{style:'thin',color:{argb:C_BORDER}}, right:{style:'thin',color:{argb:C_BORDER}} };

  const setCell = (row, col, value, opts = {}) => {
    const cell = WS.getCell(row, col);
    cell.value = value;
    cell.font = { name: 'Calibri', size: opts.size || 10, bold: opts.bold || false, color: { argb: opts.fontColor || 'FF000000' } };
    if (opts.bg) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.bg } };
    cell.alignment = { vertical: 'middle', horizontal: opts.align || 'center', wrapText: true };
    cell.border = opts.boldBorder ? boldBorder : thinBorder;
    if (opts.numFmt) cell.numFmt = opts.numFmt;
  };

  [5, 12, 8, 16, 12, 12, 16, 14, 14, 22, 18, 14].forEach((w, i) => { WS.getColumn(i + 1).width = w; });

  let totalPurchase = 0, totalPayment = 0;
  combined.forEach(r => { totalPurchase += r.total; totalPayment += r.credit; });
  const finalBalance = totalPurchase - totalPayment;

  // ROW 1: Title
  WS.getRow(1).height = 30;
  WS.mergeCells('A1:G1');
  setCell(1, 1, currentVendor.name.toUpperCase(), { bold: true, size: 16, bg: C_HEADER_BG, fontColor: C_HEADER_FONT, boldBorder: true });
  WS.mergeCells('H1:I1');
  setCell(1, 8, `GST: ${currentVendor.gst || '-'}`, { bold: true, size: 9, bg: C_WHITE });
  WS.mergeCells('J1:K1');
  setCell(1, 10, 'BALANCE', { bold: true, size: 12, bg: C_ORANGE });
  setCell(1, 12, finalBalance, { bold: true, size: 12, bg: C_ORANGE, numFmt: '#,##0' });

  // ROW 2: Vendor details
  WS.getRow(2).height = 16;
  WS.mergeCells('A2:C2');
  setCell(2, 1, `Contact: ${currentVendor.contact || '-'}`, { size: 9, bg: C_TITLE_BG });
  WS.mergeCells('D2:G2');
  setCell(2, 4, `Phone: ${currentVendor.phone || '-'}  |  Email: ${currentVendor.email || '-'}`, { size: 9, bg: C_TITLE_BG });
  WS.mergeCells('H2:I2');
  setCell(2, 8, `Address: ${currentVendor.address || '-'}`, { size: 9, bg: C_WHITE });
  WS.mergeCells('J2:K2');
  setCell(2, 10, `Generated: ${window.formatDate(today)}`, { size: 9, bg: C_WHITE });
  setCell(2, 12, '', { bg: C_WHITE });

  // ROW 3: Column Headers
  WS.getRow(3).height = 32;
  ['S.NO','INVOICE\nDATE','AGEING','INVOICE\nNUMBER','BASIC\nVALUE','GST VALUE','TOTAL INVOICE\nVALUE','PAYMENT\nRELEASE DATE','PAYMENT\nAMOUNT','MODE OF PAYMENT','AGAINST\nINVOICE NO','BALANCE']
    .forEach((h, i) => setCell(3, i + 1, h, { bold: true, size: 9, bg: C_TITLE_BG, boldBorder: true }));

  // DATA ROWS
  let runBalance = 0, sno = 0, rowIndex = 4;
  combined.forEach(item => {
    WS.getRow(rowIndex).height = 18;
    runBalance += item.total - item.credit;
    const isInv = item.type === 'Invoice';
    const rowBg = isInv ? C_YELLOW : C_WHITE;
    sno++;
    setCell(rowIndex, 1,  sno,                                                 { bg: rowBg, align: 'right' });
    setCell(rowIndex, 2,  isInv ? item.dateStr : '',                           { bg: rowBg });
    setCell(rowIndex, 3,  isInv ? Math.floor((today - item.dateObj)/86400000) : '', { bg: rowBg, align: 'right' });
    setCell(rowIndex, 4,  isInv ? item.invoiceNumber : '',                     { bg: rowBg, bold: isInv });
    setCell(rowIndex, 5,  isInv && item.basic ? item.basic : '',               { bg: rowBg, align: 'right', numFmt: '#,##0' });
    setCell(rowIndex, 6,  isInv && item.gst   ? item.gst   : '',               { bg: rowBg, align: 'right', numFmt: '#,##0' });
    setCell(rowIndex, 7,  isInv ? item.total : '',                             { bg: rowBg, align: 'right', numFmt: '#,##0', bold: isInv });
    setCell(rowIndex, 8,  !isInv ? item.payDate    : '',                       { bg: rowBg });
    setCell(rowIndex, 9,  !isInv ? item.payAmount  : '',                       { bg: rowBg, align: 'right', numFmt: '#,##0', bold: !isInv });
    setCell(rowIndex, 10, !isInv ? item.payMode    : '',                       { bg: rowBg });
    setCell(rowIndex, 11, !isInv ? item.payAgainst : '',                       { bg: rowBg });
    setCell(rowIndex, 12, runBalance,                                          { bg: rowBg, align: 'right', numFmt: '#,##0', bold: true });
    rowIndex++;
  });

  // FOOTER TOTALS
  WS.getRow(rowIndex).height = 22;
  WS.mergeCells(rowIndex, 1, rowIndex, 4);
  setCell(rowIndex, 1,  'TOTAL PURCHASE', { bold: true, size: 10, bg: C_YELLOW, boldBorder: true });
  setCell(rowIndex, 5,  '', { bg: C_YELLOW }); setCell(rowIndex, 6, '', { bg: C_YELLOW });
  setCell(rowIndex, 7,  totalPurchase,    { bold: true, bg: C_YELLOW, align: 'right', numFmt: '#,##0', boldBorder: true });
  setCell(rowIndex, 8,  'TOTAL PAYMENT',  { bold: true, size: 10, bg: C_BLUE, boldBorder: true });
  setCell(rowIndex, 9,  totalPayment,     { bold: true, bg: C_BLUE, align: 'right', numFmt: '#,##0', boldBorder: true });
  setCell(rowIndex, 10, '', { bg: C_BLUE });
  setCell(rowIndex, 11, 'BALANCE',    { bold: true, bg: C_ORANGE, boldBorder: true });
  setCell(rowIndex, 12, finalBalance, { bold: true, bg: C_ORANGE, align: 'right', numFmt: '#,##0', boldBorder: true });

  WB.xlsx.writeBuffer().then(buf => {
    const dateStr  = window.formatDate(new Date()).replace(/ /g, '_');
    const safeName = currentVendor.name.replace(/[^a-z0-9]/gi, '_');
    saveAs(new Blob([buf], { type: "application/octet-stream" }), `${safeName}_Statement_${dateStr}.xlsx`);
  });
};

// ============================================================
//  DASHBOARD
// ============================================================
function dashboardInit() {
  const invoices = window.invoiceList || [];
  const payments = window.paymentList || [];
  const vendors  = window.vendorList  || [];
  let totalOutstanding = 0, totalPaid = 0, overdue = 0;
  const today = new Date();
  const elDate = document.getElementById('header-date');
  if (elDate) {
    elDate.textContent = window.formatDate(today);
  }
  invoices.forEach(function (inv) {
    // CORRECT: split-includes to handle multi-invoice payments
    const paid = payments
      .filter(p => p.vendor === inv.vendor &&
        String(p.invoiceNumber || '').split(',').map(x => x.trim()).includes(String(inv.number)))
      .reduce((s, p) => s + p.amount, 0);
    const balance = inv.total - paid;
    totalOutstanding += balance;
    if (paid > 0) totalPaid += paid;
    const ageing = Math.floor((today - new Date(inv.date)) / 86400000);
    if (balance > 0 && ageing > 30) overdue += balance;
  });

  const elInv = document.getElementById('stat-invoices');
  const elOut = document.getElementById('stat-outstanding');
  const elPaid = document.getElementById('stat-paid');
  const elOvr = document.getElementById('stat-overdue');

  if (elInv) elInv.textContent = invoices.length;
  if (elOut) elOut.textContent = '₹' + totalOutstanding.toLocaleString();
  if (elPaid) elPaid.textContent = '₹' + totalPaid.toLocaleString();
  if (elOvr) elOvr.textContent = '₹' + overdue.toLocaleString();

  // Recent Activity
  const activity = [];
  invoices.slice(-5).forEach(inv => activity.push({
    type: 'Invoice',
    date: window.formatDate(inv.date),
    desc: `Invoice <b>${inv.number}</b> for <b>${inv.vendor}</b> — ₹${inv.total.toLocaleString()}`
  }));
  payments.slice(-5).forEach(p => activity.push({
    type: 'Payment',
    date: window.formatDate(p.date),
    desc: `Payment of ₹${p.amount.toLocaleString()} to <b>${p.vendor}</b> for <b>${p.invoiceNumber}</b>`
  }));
  activity.sort((a, b) => new Date(b.date) - new Date(a.date));
  const activityList = document.getElementById('dashboard-activity');
  if (activityList) {
    activityList.innerHTML = activity.slice(0, 5).map(a => {
      const isInv = a.type === 'Invoice';
      return `<li class="py-3 flex items-start gap-3">
        <div class="mt-1 p-1.5 rounded-lg ${isInv ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'}">
          <span class="material-icons text-sm">${isInv ? 'receipt' : 'payments'}</span>
        </div>
        <div>
          <p class="text-sm font-medium text-gray-800">${a.desc}</p>
          <p class="text-[11px] font-bold text-gray-400 mt-0.5">${a.date}</p>
        </div>
      </li>`;
    }).join('') || '<li class="py-4 text-center text-gray-400 font-medium">No recent activity</li>';
  }

  // Top Vendors by outstanding
  const vendorOutstanding = vendors.map(v => {
    const totalInv = invoices.filter(inv => inv.vendor === v.name).reduce((s, inv) => s + inv.total, 0);
    const totalPay = payments.filter(p => p.vendor === v.name).reduce((s, p) => s + p.amount, 0);
    return { name: v.name, balance: totalInv - totalPay };
  }).sort((a, b) => b.balance - a.balance);

  const topVendors = vendorOutstanding.filter(v => v.balance > 0).slice(0, 5);
  const vendorListEl = document.getElementById('dashboard-top-vendors');
  if (vendorListEl) {
    vendorListEl.innerHTML = topVendors.length
      ? topVendors.map((v, i) =>
        `<div class="flex justify-between items-end border-b border-gray-100 pb-3">
            <div>
              <p class="text-xs font-bold text-gray-800 mb-0.5">${v.name}</p>
              <p class="text-[10px] text-gray-500">Outstanding</p>
            </div>
            <div class="text-right">
              <p class="text-xs font-bold text-gray-800 mb-0.5">Rs ${v.balance.toLocaleString()}</p>
              <p class="text-[10px] text-gray-500">Rank #${i + 1}</p>
            </div>
          </div>`
      ).join('')
      : '<li class="py-4 text-center text-gray-400 font-medium">No outstanding vendors</li>';
  }

  const topVEl = document.getElementById('header-top-vendor');
  if (topVEl) topVEl.textContent = topVendors.length ? topVendors[0].name : '—';
  
  const hInv = document.getElementById('header-invoices-val');
  if (hInv) hInv.textContent = invoices.length;

  // Overdue Hotlist (>30 days)
  const hotlistBody = document.getElementById('dashboard-hotlist-body');
  if (hotlistBody) {
    const hotlist = invoices.map(inv => {
      const paid = payments
        .filter(p => p.vendor === inv.vendor &&
          String(p.invoiceNumber || '').split(',').map(x => x.trim()).includes(String(inv.number)))
        .reduce((s, p) => s + p.amount, 0);
      const balance = inv.total - paid;
      const ageing = Math.floor((today - new Date(inv.date)) / 86400000);
      return { ...inv, balance, ageing };
    }).filter(inv => inv.balance > 0 && inv.ageing > 30).sort((a,b) => b.ageing - a.ageing);
    
    const countBadge = document.getElementById('hotlist-count');
    if (countBadge) countBadge.textContent = hotlist.length;

    if (hotlist.length === 0) {
      hotlistBody.innerHTML = '<tr><td colspan="5" class="py-8 text-center text-gray-400 font-medium">No overdue invoices found.</td></tr>';
      if (document.getElementById('hotlist-card-grid')) document.getElementById('hotlist-card-grid').innerHTML = '<div class="py-10 text-center text-gray-400 text-sm font-bold">No overdue invoices.</div>';
    } else {
      const displayList = hotlist.slice(0, 8);
      hotlistBody.innerHTML = displayList.map(inv => {
        const ageCls = inv.ageing > 60 ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-orange-600';
        const band   = inv.ageing > 60 ? '60+ Days' : '31–60 Days';
        return `
          <tr class="hover:bg-orange-50/20 transition-colors">
            <td class="py-2.5 px-4"><span class="px-2 py-0.5 rounded text-[9px] font-bold ${ageCls}">${band}</span></td>
            <td class="py-2.5 px-4 font-black text-blue-600">${inv.number}</td>
            <td class="py-2.5 px-4 text-gray-700 font-semibold">${inv.vendor}</td>
            <td class="py-2.5 px-4 font-black text-red-600 text-right">₹${inv.balance.toLocaleString()}</td>
            <td class="py-2.5 px-4 text-center">
              <button class="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-1 rounded hover:bg-emerald-100 transition"
                onclick="window._editPaymentId=null;window._contextPaymentVendor='${inv.vendor.replace(/'/g,"\\'")}';window._lockPaymentVendor=true;window._paymentReturnPage='dashboard';window.location.hash='add-payment'">Pay</button>
            </td>
          </tr>
        `;
      }).join('');
      
      const cardGrid = document.getElementById('hotlist-card-grid');
      if (cardGrid) {
        cardGrid.innerHTML = displayList.map(inv => {
          const c1 = inv.ageing > 60 ? '#ef4444' : '#f97316';
          const ageCls = inv.ageing > 60 ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-orange-600';
          const band   = inv.ageing > 60 ? '60+ Days' : '31–60 Days';
          return `
          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 relative">
            <div class="absolute top-0 left-0 bottom-0 w-[5px] rounded-l-2xl" style="background:${c1}"></div>
            <div class="flex items-center gap-3 mb-4 ml-1">
              <div class="w-12 h-12 rounded-full flex items-center justify-center font-black text-white text-xl flex-shrink-0 shadow-sm" style="background:${c1}">!</div>
              <div class="flex-1 min-w-0">
                <p class="font-black text-gray-800 text-[15px] truncate leading-tight">${inv.vendor}</p>
                <p class="text-[11px] text-gray-400 uppercase font-bold tracking-wider mt-0.5 truncate">${inv.number} â€¢ ${window.formatDate(inv.date)}</p>
              </div>
              <span class="text-[10px] font-black px-2.5 py-1 ${ageCls} rounded-lg shadow-sm border border-transparent whitespace-nowrap">${band}</span>
            </div>
            <div class="grid grid-cols-2 gap-2 mb-4 ml-1">
              <div class="bg-red-50/50 rounded-xl p-2.5 flex flex-col items-center justify-center border border-red-50">
                <p class="text-[9px] text-red-500 font-black uppercase tracking-widest mb-0.5">DUE</p>
                <p class="text-[13px] font-black text-red-600">₹${inv.balance>=1000?(inv.balance/1000).toFixed(1)+'k':inv.balance}</p>
              </div>
              <div class="bg-orange-50/50 rounded-xl p-2.5 flex flex-col items-center justify-center border border-orange-50">
                <p class="text-[9px] text-orange-600 font-black uppercase tracking-widest mb-0.5">AGEING</p>
                <p class="text-[13px] font-black text-orange-700">${inv.ageing}d</p>
              </div>
            </div>
            <div class="flex gap-2 w-full ml-1 pr-1">
              <button onclick="window._editPaymentId=null;window._contextPaymentVendor='${inv.vendor.replace(/'/g,"\\'")}';window._lockPaymentVendor=true;window._paymentReturnPage='dashboard';window.location.hash='add-payment'" class="flex-1 py-2.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-100 font-bold text-[12px] flex items-center justify-center shadow-sm transition-colors active:scale-95">Record Payment</button>
            </div>
          </div>`;
        }).join('');
      }
    }
  }

  // Chart Rendering
  const total = totalOutstanding + totalPaid;
  const paymentRatioText = document.getElementById('payment-ratio-text');
  if (paymentRatioText) {
    if (total === 0) paymentRatioText.textContent = "No data available";
    else paymentRatioText.textContent = `${Math.round((totalPaid / total) * 100)}% of total invoiced amount has been paid.`;
  }

  const ctxDonut = document.getElementById('donutChart');
  if (ctxDonut && typeof Chart !== 'undefined') {
    if (window.donutChartInst) window.donutChartInst.destroy();
    window.donutChartInst = new Chart(ctxDonut, {
      type: 'doughnut',
      data: {
        labels: ['Outstanding', 'Paid'],
        datasets: [{
          data: [totalOutstanding, totalPaid],
          backgroundColor: ['#f43f5e', '#10b981'],
          borderWidth: 0,
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '75%',
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, padding: 20 } }
        }
      }
    });
  } else if (ctxDonut) {
    document.getElementById('payment-ratio-text').innerHTML = "<span class='text-red-500'>Charting library failed to load. Please check your internet connection.</span>";
  }

  const ctxMonthly = document.getElementById('monthlyChart');
  if (ctxMonthly && typeof Chart !== 'undefined') {
    // Generate simple last 6 months data aggregation based on real data
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthlyInv = [0, 0, 0, 0, 0, 0];
    const monthlyPay = [0, 0, 0, 0, 0, 0];
    const labels = [];

    // Setup last 6 months labels
    for (let i = 5; i >= 0; i--) {
      let d = new Date(today);
      d.setMonth(d.getMonth() - i);
      labels.push(monthNames[d.getMonth()]);
    }

    invoices.forEach(inv => {
      let d = new Date(inv.date);
      let m = d.getMonth();
      let currentMonth = today.getMonth();
      let diff = currentMonth - m;
      // Adjust for year wrap-around
      if (d.getFullYear() < today.getFullYear()) {
        diff += 12 * (today.getFullYear() - d.getFullYear());
      }
      if (diff >= 0 && diff < 6) monthlyInv[5 - diff] += inv.total;
    });

    payments.forEach(p => {
      let d = new Date(p.date);
      let m = d.getMonth();
      let currentMonth = today.getMonth();
      let diff = currentMonth - m;
      // Adjust for year wrap-around
      if (d.getFullYear() < today.getFullYear()) {
        diff += 12 * (today.getFullYear() - d.getFullYear());
      }
      if (diff >= 0 && diff < 6) monthlyPay[5 - diff] += p.amount;
    });

    if (window.monthlyChartInst) window.monthlyChartInst.destroy();
    window.monthlyChartInst = new Chart(ctxMonthly, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Invoiced',
            data: monthlyInv,
            backgroundColor: '#6366f1',
            borderRadius: 6
          },
          {
            label: 'Paid',
            data: monthlyPay,
            backgroundColor: '#10b981',
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', align: 'end', labels: { usePointStyle: true } }
        },
        scales: {
          y: { beginAtZero: true, grid: { color: '#f3f4f6' }, border: { dash: [4, 4] } },
          x: { grid: { display: false } }
        }
      }
    });
  }
}

// ============================================================
//  VENDORS (Export logic only)
// ============================================================

window.exportVendorList = function() {
  const vendors = window.vendorList || [];
  if(vendors.length === 0) return alert('No vendors available to export.');
  
  const columns = [
    { header: 'ID', key: 'id', width: 15 },
    { header: 'Company Name', key: 'name', width: 30, bold: true, fontColor: 'FF2563EB' },
    { header: 'Contact Person', key: 'contact', width: 25 },
    { header: 'Email', key: 'email', width: 30 },
    { header: 'Phone', key: 'phone', width: 20 },
    { header: 'GST No', key: 'gst', width: 25, bold: true },
    { header: 'Billing Address', key: 'address', width: 50 }
  ];
  
  const rows = vendors.map(v => [
    v.id, v.name, v.contact || '-', v.email || '-', v.phone || '-', v.gst || '-', v.address || '-'
  ]);
  
  const dateStr = window.formatDate(new Date()).replace(/ /g, '_');
  window.exportToExcel(`Vendor_Directory_${dateStr}`, 'Vendors', columns, rows);
};

window.toggleAllVendors = function(source) {
  const checkboxes = document.querySelectorAll('.vendor-checkbox');
  checkboxes.forEach(cb => cb.checked = source.checked);
};

window.bulkDeleteVendors = function() {
  const checkboxes = document.querySelectorAll('.vendor-checkbox:checked');
  if(checkboxes.length === 0) return alert('Select at least one vendor to perform a bulk deletion.');
  if(!confirm(`Are you absolutely sure you want to permanently delete ${checkboxes.length} vendor(s)?`)) return;
  
  let deleted = 0;
  checkboxes.forEach(cb => {
    const id = Number(cb.value);
    window.vendorList = window.vendorList.filter(v => v.id !== id);
    window.saveToDatabase('deleteVendor', { id });
    deleted++;
  });
  // Uncheck header and reload table
  const selectAll = document.getElementById('vendor-select-all');
  if(selectAll) selectAll.checked = false;
  renderVendors();
  if (deleted > 0) window.showToaster(`${deleted} vendor${deleted > 1 ? 's' : ''} deleted successfully`);
};

function vendorModalInit() {
  window.openVendorModal = function () {
    document.getElementById('vendor-modal-title').textContent = 'Add Vendor';
    document.getElementById('vendor-form').reset();
    document.getElementById('vendor-id').value = '';
    window.editingVendorId = null;
    document.getElementById('modal-vendor').showModal();
  };

  window.editVendor = function (id) {
    const v = window.vendorList.find(v => v.id === id);
    if (!v) return;
    document.getElementById('vendor-modal-title').textContent = 'Edit Vendor';
    document.getElementById('vendor-id').value = v.id;
    document.getElementById('vendor-name').value = v.name;
    document.getElementById('vendor-contact').value = v.contact || '';
    document.getElementById('vendor-email').value = v.email || '';
    document.getElementById('vendor-phone').value = v.phone || '';
    document.getElementById('vendor-address').value = v.address || '';
    document.getElementById('vendor-gst').value = v.gst || '';
    window.editingVendorId = v.id;
    document.getElementById('modal-vendor').showModal();
  };

  window.deleteVendor = function (id) {
    if (confirm('Delete this vendor?')) {
      window.vendorList = window.vendorList.filter(v => v.id !== id);
      window.saveToDatabase('deleteVendor', { id });
      if (window._renderVendorsPage) window._renderVendorsPage();
      else window.loadPage('vendors');
      window.showToaster('Vendor deleted successfully');
    }
  };

  window.goToVendorReportPage = function (id) {
    window._vendorReportId = id;
    window.location.hash = 'vendor-report';
  };

  const form = document.getElementById('vendor-form');
  if (form) {
    form.onsubmit = function (e) {
      e.preventDefault();
      const id = document.getElementById('vendor-id').value;
      const name = document.getElementById('vendor-name').value.trim();
      const contact = document.getElementById('vendor-contact').value.trim();
      const email = document.getElementById('vendor-email').value.trim();
      const phone = document.getElementById('vendor-phone').value.trim();
      const address = document.getElementById('vendor-address').value.trim();
      const gst = document.getElementById('vendor-gst').value.trim();
      if (!name) return;
      if (id) {
        const idx = window.vendorList.findIndex(v => v.id == id);
        if (idx > -1) window.vendorList[idx] = { id: Number(id), name, contact, email, phone, address, gst };
        window.saveToDatabase('editVendor', { id: Number(id), name, contact, email, phone, address, gst });
        window.showToaster('Vendor updated successfully');
      } else {
        const newId = new Date().getTime(); // use robust ID for DB
        window.vendorList.push({ id: newId, name, contact, email, phone, address, gst });
        window.saveToDatabase('addVendor', { id: newId, name, contact, email, phone, address, gst });
        window.showToaster('Vendor added successfully');
      }
      document.getElementById('modal-vendor').close();
      window.loadPage(window.location.hash.replace('#', '') || 'dashboard');
    };
  }
}

// ============================================================
//  INVOICES
// ============================================================


function invoiceModalInit() {
  // â”€â”€ REPLACED BY PAGE-BASED NAVIGATION â”€â”€
  // OpenInvoiceModal now navigates to add-invoice page
  window.openInvoiceModal = function (returnPage) {
    window._editInvoiceId     = null;
    window._contextVendorName = null;
    window._lockInvoiceVendor = false;
    window._invoiceReturnPage = returnPage || window.location.hash.replace('#','') || 'invoices';
    window.location.hash = 'add-invoice';
  };

  window.editInvoice = function (id) {
    window._editInvoiceId     = id;
    window._lockInvoiceVendor = false;
    window._invoiceReturnPage = window.location.hash.replace('#','') || 'invoices';
    window.location.hash = 'add-invoice';
  };

  window.deleteInvoice = function (id) {
    if (confirm('Delete this invoice?')) {
      window.invoiceList = window.invoiceList.filter(inv => inv.id !== id);
      window.saveToDatabase('deleteInvoice', { id });
      if (window.location.hash.includes('vendor-report')) window.loadPage('vendor-report');
      else window.loadPage(window.location.hash.replace('#', '') || 'invoices');
      window.showToaster('Invoice deleted successfully');
    }
  };
}


// ============================================================
//  PAYMENTS
// ============================================================


function paymentModalInit() {
  // â”€â”€ REPLACED BY PAGE-BASED NAVIGATION â”€â”€
  // openPaymentModal now navigates to add-payment page
  window.openPaymentModal = function (returnPage) {
    window._editPaymentId        = null;
    window._contextPaymentVendor = null;
    window._lockPaymentVendor    = false;
    window._paymentReturnPage    = returnPage || window.location.hash.replace('#','') || 'payments';
    window.location.hash = 'add-payment';
  };

  window.editPayment = function (id) {
    window._editPaymentId     = id;
    window._lockPaymentVendor = false;
    window._paymentReturnPage = window.location.hash.replace('#','') || 'payments';
    window.location.hash = 'add-payment';
  };

  window.deletePayment = function (id) {
    if (confirm('Delete this payment?')) {
      window.paymentList = window.paymentList.filter(p => p.id !== id);
      window.saveToDatabase('deletePayment', { id });
      if (window.location.hash.includes('vendor-report')) window.loadPage('vendor-report');
      else window.loadPage(window.location.hash.replace('#', '') || 'payments');
      window.showToaster('Payment deleted successfully');
    }
  };
}


// ============================================================
//  OUTSTANDING REPORT
// ============================================================
function reportPageInit() {
  const rpSearch = document.getElementById('report-search');
  if(rpSearch) {
    rpSearch.oninput = function() {
      const filter = this.value.toLowerCase();
      const rows = document.querySelectorAll('#outstanding-report-body tr');
      rows.forEach(row => {
        if(row.innerText.toLowerCase().includes(filter)) {
          row.style.display = '';
        } else {
          row.style.display = 'none';
        }
      });
    };
  }
  renderOutstandingReport();
}

window.exportOutstandingReport = function () {
  const invoices = window.invoiceList || [];
  const payments = window.paymentList || [];
  if (invoices.length === 0) return alert('No outstanding master records available to export.');

  const today = new Date();

  // Build per-invoice paid amount using CORRECT split-includes matching
  const columns = [
    { header: 'Date', key: 'date', width: 18 },
    { header: 'Vendor', key: 'vendor', width: 30, fontColor: 'FF2563EB', bold: true },
    { header: 'Invoice No', key: 'number', width: 20, bold: true },
    { header: 'Basic', key: 'basic', width: 15, format: 'currency' },
    { header: 'GST', key: 'gst', width: 15, format: 'currency' },
    { header: 'Discount', key: 'discount', width: 15, format: 'currency' },
    { header: 'Round Off', key: 'roundoff', width: 15, format: 'currency' },
    { header: 'Total', key: 'total', width: 20, format: 'currency', bold: true },
    { header: 'Paid', key: 'paid', width: 20, format: 'currency', fontColor: 'FF059669', bold: true },
    { header: 'Balance', key: 'balance', width: 20, format: 'currency', fontColor: 'FFDC2626', bold: true },
    { header: 'Ageing (Days)', key: 'ageing', width: 15, align: 'center' },
    { header: 'Remarks', key: 'remarks', width: 40 }
  ];

  const rows = invoices.map(inv => {
    // CORRECT: split-includes matching (handles multi-invoice payments)
    const paid = payments
      .filter(p => p.vendor === inv.vendor &&
        String(p.invoiceNumber || '').split(',').map(x => x.trim()).includes(String(inv.number)))
      .reduce((s, p) => s + p.amount, 0);
    const balance = inv.total - paid;
    const ageing = Math.floor((today - new Date(inv.date)) / 86400000);
    return [
      window.formatDate(inv.date), inv.vendor, inv.number,
      inv.basic || 0, inv.gst || 0, inv.discount || 0, inv.roundoff || 0,
      inv.total, paid, balance, balance <= 0 ? '-' : ageing, inv.remarks || '-'
    ];
  });

  const dateStr = window.formatDate(today).replace(/ /g, '_');
  window.exportToExcel(`Outstanding_Report_${dateStr}`, 'Outstanding Ledger', columns, rows);
};

function renderOutstandingReport() {
  const tbody = document.getElementById('outstanding-report-body');
  if (!tbody) return;
  const invoices = window.invoiceList || [];
  const payments = window.paymentList || [];
  const today = new Date();

  let globTotal = 0;
  let globOut = 0;
  let globOver = 0;

  tbody.innerHTML = (window.invoiceList || []).map((inv, i) => {
    const paid = (window.paymentList || [])
      .filter(p => p.vendor === inv.vendor && String(p.invoiceNumber || '').split(',').map(x=>x.trim()).includes(String(inv.number)))
      .reduce((s, p) => s + p.amount, 0);
    const balance = inv.total - paid;
    const ageing = Math.floor((today - new Date(inv.date)) / 86400000);

    globTotal += inv.total;
    globOut += balance;
    if (balance > 0 && ageing > 30) globOver += balance;

    return `
      <tr class="hover:bg-gray-50 transition-colors group cursor-pointer" onclick="goToVendorReportPage((window.vendorList||[]).find(v=>v.name==='${inv.vendor}').id)">
        <td class="py-3 px-5 text-center text-gray-400 font-medium">${i + 1}</td>
        <td class="py-3 px-5 font-bold text-gray-800 whitespace-nowrap">${window.formatDate(inv.date)}</td>
        <td class="py-3 px-5 font-bold text-purple-600">${inv.vendor}</td>
        <td class="py-3 px-5 font-bold text-gray-800">${inv.number}</td>
        <td class="py-3 px-5 text-right font-medium text-gray-700 hidden xl:table-cell">₹ ${(inv.basic || 0).toLocaleString()}</td>
        <td class="py-3 px-5 text-right font-medium text-gray-700 hidden xl:table-cell">₹ ${(inv.gst || 0).toLocaleString()}</td>
        <td class="py-3 px-5 text-right font-medium text-gray-700 hidden xl:table-cell">₹ ${(inv.discount || 0).toLocaleString()}</td>
        <td class="py-3 px-5 text-right font-medium text-gray-700 hidden xl:table-cell">₹ ${(inv.roundoff || 0).toLocaleString()}</td>
        <td class="py-3 px-5 text-right font-black text-gray-800 bg-blue-50/10">₹ ${inv.total.toLocaleString()}</td>
        <td class="py-3 px-5 text-right font-bold text-emerald-600 bg-emerald-50/10">₹ ${paid.toLocaleString()}</td>
        <td class="py-3 px-5 text-right font-black ${balance > 0 ? 'text-red-600 bg-red-50/10' : 'text-gray-400'}">₹ ${balance.toLocaleString()}</td>
        <td class="py-3 px-5 text-center">
          ${balance <= 0 ? '<span class="text-gray-400 font-bold">—</span>' : `<span class="px-2 py-1 rounded text-[10px] font-bold ${ageing <= 30 ? 'bg-emerald-50 text-emerald-600' : ageing <= 60 ? 'bg-orange-50 text-orange-600' : 'bg-red-50 text-red-600'}">${ageing} days</span>`}
        </td>
        <td class="py-3 px-5 text-center" onclick="event.stopPropagation()">
          <div class="flex gap-1 justify-center">
            <button class="border border-gray-300 rounded text-[9px] font-bold px-1.5 py-0.5 text-gray-500 hover:text-blue-600 hover:bg-white" onclick="editInvoice(${inv.id})">Edit</button>
            <button class="border border-red-100 bg-red-50/50 rounded text-[9px] font-bold px-1.5 py-0.5 text-red-500 hover:bg-red-50" onclick="deleteInvoice(${inv.id})">Del</button>
          </div>
        </td>
      </tr>`;

  }).join('') || '<tr><td colspan="8" class="text-center text-gray-400 font-medium py-8">No invoices mapped.</td></tr>';

  if (document.getElementById('global-total')) document.getElementById('global-total').innerText = '₹ ' + globTotal.toLocaleString();
  if (document.getElementById('global-outstanding')) document.getElementById('global-outstanding').innerText = '₹ ' + globOut.toLocaleString();
  if (document.getElementById('global-overdue')) document.getElementById('global-overdue').innerText = '₹ ' + globOver.toLocaleString();
}

// ============================================================
//  VENDOR REPORT (full page)
// ============================================================
let currentVendor = null;

window.showVendorTab = function(tab) {
  window._vrLastTab = tab;
  const tabs = ['ledger', 'invoices', 'payments'];
  tabs.forEach(t => {
    const btn = document.getElementById('tab-' + t);
    const sec = document.getElementById('vendor-' + t + '-section');
    if (!btn || !sec) return;
    if (t === tab) {
      btn.className = 'tab-btn active';
      sec.classList.remove('hidden');
    } else {
      btn.className = 'tab-btn';
      sec.classList.add('hidden');
    }
  });
};

window.addVendorInvoice = function() {
  if (currentVendor) {
    window._editInvoiceId     = null;
    window._contextVendorName = currentVendor.name;
    window._lockInvoiceVendor = true;
    window._invoiceReturnPage = 'vendor-report';
    window.location.hash = 'add-invoice';
  }
};

window.addVendorPayment = function() {
  if (currentVendor) {
    window._editPaymentId        = null;
    window._contextPaymentVendor = currentVendor.name;
    window._lockPaymentVendor    = true;
    window._paymentReturnPage    = 'vendor-report';
    window.location.hash = 'add-payment';
  }
};


function vendorReportPageInit() {
  const vendorId = window._vendorReportId;
  if(!vendorId) {
    window.location.hash = 'vendors';
    return;
  }
  
  currentVendor = (window.vendorList || []).find(v => v.id == vendorId);
  if(!currentVendor) return;

  // Fill hero card UI
  const av = document.getElementById('vr-avatar');
  if (av) av.innerText = currentVendor.name.charAt(0);
  ['vr-name','vr-name2'].forEach(id => { const el=document.getElementById(id); if(el) el.innerText=currentVendor.name; });
  const setTxt = (id,v) => { const el=document.getElementById(id); if(el) el.innerText=v; };
  setTxt('vr-contact', currentVendor.contact || '–');
  setTxt('vr-phone',   currentVendor.phone   || '–');
  setTxt('vr-email',   currentVendor.email   || '–');
  setTxt('vr-gst',     currentVendor.gst     || '–');
  if (currentVendor.address) {
    setTxt('vr-address', currentVendor.address);
    const ar = document.getElementById('vr-address-row');
    if (ar) ar.classList.remove('hidden');
  }

  const invoices = (window.invoiceList || []).filter(inv => inv.vendor === currentVendor.name);
  const payments = window.paymentList || [];
  const today = new Date();

  // Build Invoices table — also accumulate correctly for vTotalPay
  let vTotalInv = invoices.reduce((s, inv) => s + inv.total, 0);

  window.vrInvPage = window.vrInvPage || 1;
  window.vrInvLimit = window.vrInvLimit || 10;
  const totalInvPages = window.vrInvLimit === -1 ? 1 : Math.ceil(invoices.length / window.vrInvLimit);
  if(window.vrInvPage > totalInvPages) window.vrInvPage = Math.max(1, totalInvPages);
  if(window.renderPaginationControls) window.renderPaginationControls(window.vrInvPage, totalInvPages, 'vr-invoice-pagination', 'goToVrInv');
  window.goToVrInv = function(p) { window.vrInvPage = p; window.vendorReportPageInit(); };
  
  if(document.getElementById('vr-inv-footer')) document.getElementById('vr-inv-footer').textContent = `${invoices.length} records`;

  const startInv = window.vrInvLimit === -1 ? 0 : (window.vrInvPage - 1) * window.vrInvLimit;
  const paginatedInvs = window.vrInvLimit === -1 ? invoices : invoices.slice(startInv, startInv + window.vrInvLimit);

  let invRows = paginatedInvs.map((inv, index) => {
    let i = startInv + index;
    const rawPaid = window.getPaidAmountForInvoice(inv.number);
    const paidForInv = Math.min(inv.total, rawPaid);
    const balance = Math.max(0, inv.total - rawPaid);
    const ageing  = Math.floor((today - new Date(inv.date)) / 86400000);
    const st      = balance <= 0 ? ['bg-emerald-50 text-emerald-700 border border-emerald-200','Paid'] :
                    paidForInv > 0 ? ['bg-amber-50 text-amber-700 border border-amber-200','Partial'] :
                    ['bg-red-50 text-red-700 border border-red-200','Pending'];

    return `
      <tr class="hover:bg-blue-50/20 transition-colors group">
        <td class="py-2.5 px-4 text-center text-gray-400 font-medium text-[11px]">${i + 1}</td>
        <td class="py-2.5 px-4 text-gray-800 font-medium whitespace-nowrap text-[11px]">${window.formatDate(inv.date)}</td>
        <td class="py-2.5 px-4 font-black text-blue-600 text-[12px]">${inv.number}</td>
        <td class="py-2.5 px-4 text-[10px] text-gray-400 hidden xl:table-cell">${inv.category||'—'}</td>
        <td class="py-2.5 px-4 text-right text-[11px] text-gray-500 hidden xl:table-cell">₹ ${(inv.basic || 0).toLocaleString()}</td>
        <td class="py-2.5 px-4 text-right text-[11px] text-gray-500 hidden xl:table-cell">₹ ${(inv.gst || 0).toLocaleString()}</td>
        <td class="py-2.5 px-4 text-right text-[11px] text-gray-500 hidden xl:table-cell">₹ ${(inv.discount || 0).toLocaleString()}</td>
        <td class="py-2.5 px-4 text-right font-black text-gray-800">₹ ${inv.total.toLocaleString()}</td>
        <td class="py-2.5 px-4 text-center">
          ${balance <= 0 ? '<span class="text-gray-400 font-bold">—</span>' : `<span class="px-2 py-1 rounded text-[10px] font-bold ${ageing <= 30 ? 'bg-emerald-50 text-emerald-600' : ageing <= 60 ? 'bg-orange-50 text-orange-600' : 'bg-red-50 text-red-600'}">${ageing}d</span>`}
        </td>
        <td class="py-2.5 px-4 text-right font-bold text-emerald-600">₹ ${paidForInv.toLocaleString()}</td>
        <td class="py-2.5 px-4 text-right font-black ${balance > 0 ? 'text-red-600' : 'text-gray-400'}">₹ ${balance.toLocaleString()}</td>
        <td class="py-2.5 px-4 text-center">
          <span class="text-[10px] font-black px-2 py-0.5 rounded border ${st[0]}">${st[1]}</span>
        </td>
        <td class="py-2.5 px-4 text-gray-400 text-[11px] truncate hidden md:table-cell max-w-[120px]">${inv.remarks || '–'}</td>
        <td class="py-2.5 px-4 text-center">
          <div class="flex gap-1 justify-center">
            <button class="w-6 h-6 rounded bg-white border border-gray-200 flex items-center justify-center text-blue-600 hover:bg-blue-50 transition" onclick="editInvoice(${inv.id})" title="Edit"><span class="material-icons text-[12px]">edit</span></button>
            <button class="w-6 h-6 rounded bg-red-50 border border-red-100 flex items-center justify-center text-red-600 hover:bg-red-100 transition" onclick="deleteInvoice(${inv.id})" title="Delete"><span class="material-icons text-[12px]">delete</span></button>
          </div>
        </td>
      </tr>
    `;
  }).join('');


  if(!paginatedInvs.length) {
    invRows = `<tr><td colspan="14" class="py-8 text-center text-gray-400 font-medium">No invoices registered yet.</td></tr>`;
    if(document.getElementById('vr-invoices-card-grid')) document.getElementById('vr-invoices-card-grid').innerHTML = '<div class="py-10 text-center text-gray-400 text-sm font-bold">No invoices found.</div>';
  } else {
    // Render Card Grid
    if(document.getElementById('vr-invoices-card-grid')) {
      document.getElementById('vr-invoices-card-grid').innerHTML = paginatedInvs.map(inv => {
        const rawPaid = window.getPaidAmountForInvoice(inv.number);
        const paidForInv = Math.min(inv.total, rawPaid);
        const balance = Math.max(0, inv.total - rawPaid);
        const st = balance <= 0 ? ['bg-emerald-50 text-emerald-700','Paid'] : paidForInv > 0 ? ['bg-amber-50 text-amber-700','Partial'] : ['bg-red-50 text-red-600','Pending'];
        return `
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 relative">
          <div class="absolute top-0 left-0 bottom-0 w-[5px] rounded-l-2xl" style="background:linear-gradient(180deg,#3b82f6,#60a5fa)"></div>
          <div class="flex items-center gap-3 mb-4 ml-1">
            <div class="w-12 h-12 rounded-full flex items-center justify-center font-black text-white text-xl flex-shrink-0 shadow-sm" style="background:#3b82f6">I</div>
            <div class="flex-1 min-w-0">
              <p class="font-black text-gray-800 text-[15px] truncate leading-tight">${inv.number}</p>
              <p class="text-[11px] text-gray-400 uppercase font-bold tracking-wider mt-0.5 truncate">${window.formatDate(inv.date)} â€¢ ${inv.category||'General'}</p>
            </div>
            <span class="text-[10px] font-black px-2.5 py-1 rounded-lg ${st[0]} shadow-sm">${st[1]}</span>
          </div>
          <div class="grid grid-cols-3 gap-2 mb-4 ml-1">
            <div class="bg-gray-50 rounded-xl p-2.5 flex flex-col items-center justify-center border border-gray-100/50">
              <p class="text-[9px] text-gray-500 font-black uppercase tracking-widest mb-0.5">TOTAL</p>
              <p class="text-[13px] font-black text-gray-800">₹${inv.total>=1000?(inv.total/1000).toFixed(1)+'k':inv.total}</p>
            </div>
            <div class="bg-emerald-50/50 rounded-xl p-2.5 flex flex-col items-center justify-center border border-emerald-50">
              <p class="text-[9px] text-emerald-600 font-black uppercase tracking-widest mb-0.5">PAID</p>
              <p class="text-[13px] font-black text-emerald-700">₹${paidForInv>=1000?(paidForInv/1000).toFixed(1)+'k':paidForInv}</p>
            </div>
            <div class="bg-red-50/50 rounded-xl p-2.5 flex flex-col items-center justify-center border border-red-50">
              <p class="text-[9px] text-red-500 font-black uppercase tracking-widest mb-0.5">DUE</p>
              <p class="text-[13px] font-black text-red-600">₹${balance>=1000?(balance/1000).toFixed(1)+'k':balance}</p>
            </div>
          </div>
          <div class="flex gap-2 w-full ml-1 pr-1">
            <button onclick="editInvoice(${inv.id})" class="flex-1 py-2.5 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-100 font-bold text-[12px] flex items-center justify-center shadow-sm">Edit</button>
            <button onclick="deleteInvoice(${inv.id})" class="flex-1 py-2.5 rounded-xl bg-gray-50 text-gray-600 border border-gray-100 font-bold text-[12px] flex items-center justify-center shadow-sm">Delete</button>
          </div>
        </div>`;
      }).join('');
    }
  }
  document.getElementById('vr-invoice-table-body').innerHTML = invRows;

  // Filter payments array for this vendor
  const vPayments = payments.filter(p => p.vendor === currentVendor.name);

  window.vrPayPage = window.vrPayPage || 1;
  window.vrPayLimit = window.vrPayLimit || 10;
  const totalPayPages = window.vrPayLimit === -1 ? 1 : Math.ceil(vPayments.length / window.vrPayLimit);
  if(window.vrPayPage > totalPayPages) window.vrPayPage = Math.max(1, totalPayPages);
  if(window.renderPaginationControls) window.renderPaginationControls(window.vrPayPage, totalPayPages, 'vr-payment-pagination', 'goToVrPay');
  window.goToVrPay = function(p) { window.vrPayPage = p; window.vendorReportPageInit(); };
  if(document.getElementById('vr-pay-footer')) document.getElementById('vr-pay-footer').textContent = `${vPayments.length} records`;

  const startPay = window.vrPayLimit === -1 ? 0 : (window.vrPayPage - 1) * window.vrPayLimit;
  const paginatedPays = window.vrPayLimit === -1 ? vPayments : vPayments.slice(startPay, startPay + window.vrPayLimit);

  let payRows = paginatedPays.map((p, index) => {
    let i = startPay + index;
    return `
      <tr class="hover:bg-gray-50 transition-colors group">
        <td class="py-3 px-5 text-center text-gray-400 font-medium">${i + 1}</td>
        <td class="py-3 px-5 text-gray-800 font-medium whitespace-nowrap">${window.formatDate(p.date)}</td>
        <td class="py-3 px-5 font-bold text-indigo-600">${p.invoiceNumber}</td>
        <td class="py-3 px-5 text-right">
          <div class="font-black text-gray-800">₹ ${p.amount.toLocaleString()}</div>
          ${window._excessPayments && window._excessPayments[p.id] ? `<div class="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded ml-auto mt-1 w-max shadow-sm border border-amber-100">Credit: ₹${window._excessPayments[p.id].toLocaleString()}</div>` : ''}
        </td>
        <td class="py-3 px-5 text-gray-600 text-[12px] font-bold">${p.mode || '-'}</td>
        <td class="py-3 px-5 text-gray-500 text-[11px] hidden md:table-cell font-medium">${p.against || '-'}</td>
        <td class="py-3 px-5 text-gray-500 text-[11px] hidden md:table-cell font-medium">${p.bank || '-'}</td>
        <td class="py-3 px-5 text-gray-500 text-[11px] hidden md:table-cell font-medium">${p.voucher || '-'}</td>
        <td class="py-3 px-5 text-gray-500 text-[11px] truncate hidden lg:table-cell max-w-[120px]">${p.remarks || '-'}</td>
        <td class="py-3 px-5 text-center flex gap-1 justify-center">
           <button class="border border-gray-200 rounded text-[9px] font-bold px-1.5 py-0.5 text-gray-500 hover:text-blue-600 hover:bg-white" onclick="editPayment(${p.id})">Edit</button>
           <button class="border border-red-100 bg-red-50/50 rounded text-[9px] font-bold px-1.5 py-0.5 text-red-500 hover:bg-red-50" onclick="deletePayment(${p.id})">Del</button>
        </td>
      </tr>
    `;
  }).join('');

  if(!paginatedPays.length) {
    payRows = `<tr><td colspan="10" class="py-8 text-center text-gray-400 font-medium">No payments recorded yet.</td></tr>`;
    if(document.getElementById('vr-payments-card-grid')) document.getElementById('vr-payments-card-grid').innerHTML = '<div class="py-10 text-center text-gray-400 text-sm font-bold">No payments found.</div>';
  } else {
    if(document.getElementById('vr-payments-card-grid')) {
      document.getElementById('vr-payments-card-grid').innerHTML = paginatedPays.map(p => {
        return `
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 relative">
          <div class="absolute top-0 left-0 bottom-0 w-[5px] rounded-l-2xl" style="background:linear-gradient(180deg,#10b981,#34d399)"></div>
          <div class="flex items-center gap-3 mb-4 ml-1">
            <div class="w-12 h-12 rounded-full flex items-center justify-center font-black text-white text-xl flex-shrink-0 shadow-sm" style="background:#10b981">P</div>
            <div class="flex-1 min-w-0">
              <p class="font-black text-gray-800 text-[15px] truncate leading-tight">${p.invoiceNumber}</p>
              <p class="text-[11px] text-gray-400 uppercase font-bold tracking-wider mt-0.5 truncate">${window.formatDate(p.date)}</p>
            </div>
            <span class="text-[10px] font-black px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 shadow-sm">${p.mode||'Paid'}</span>
          </div>
          <div class="grid grid-cols-3 gap-2 mb-4 ml-1">
            <div class="bg-emerald-50/50 rounded-xl p-2.5 flex flex-col items-center justify-center border border-emerald-50 relative">
              <p class="text-[9px] text-emerald-600 font-black uppercase tracking-widest mb-0.5">AMOUNT</p>
              <p class="text-[13px] font-black text-emerald-700">₹${p.amount>=1000?(p.amount/1000).toFixed(1)+'k':p.amount}</p>
              ${window._excessPayments && window._excessPayments[p.id] ? `<p class="text-[8px] font-black text-amber-600 absolute bottom-1 right-2">CR: ₹${window._excessPayments[p.id]}</p>` : ''}
            </div>
            <div class="bg-blue-50/50 rounded-xl p-2.5 flex flex-col items-center justify-center border border-blue-50">
              <p class="text-[9px] text-blue-500 font-black uppercase tracking-widest mb-0.5">REF/UTR</p>
              <p class="text-[11px] font-bold text-blue-700 truncate w-full text-center">${p.against||'—'}</p>
            </div>
            <div class="bg-gray-50 rounded-xl p-2.5 flex flex-col items-center justify-center border border-gray-100/50">
              <p class="text-[9px] text-gray-500 font-black uppercase tracking-widest mb-0.5">BANK</p>
              <p class="text-[11px] font-bold text-gray-800 truncate w-full text-center">${p.bank||'—'}</p>
            </div>
          </div>
          <div class="flex gap-2 w-full ml-1 pr-1">
            <button onclick="editPayment(${p.id})" class="flex-1 py-2.5 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-100 font-bold text-[12px] flex items-center justify-center shadow-sm">Edit</button>
            <button onclick="deletePayment(${p.id})" class="flex-1 py-2.5 rounded-xl bg-gray-50 text-gray-600 border border-gray-100 font-bold text-[12px] flex items-center justify-center shadow-sm">Delete</button>
          </div>
        </div>`;
      }).join('');
    }
  }
  document.getElementById('vr-payment-table-body').innerHTML = payRows;

  // CORRECT total paid = sum of ALL payments for this vendor (no double-count)
  const vTotalPay = vPayments.reduce((s, p) => s + p.amount, 0);
  let totalBalance = Math.max(0, vTotalInv - vTotalPay);

  // Fill hero card financial summary
  const setV = (id, v) => { const el=document.getElementById(id); if(el) el.innerText=v; };
  setV('vr-total-inv',  '₹ ' + vTotalInv.toLocaleString());
  setV('vr-total-paid', '₹ ' + vTotalPay.toLocaleString());
  const pct = vTotalInv > 0 ? Math.round((vTotalPay / vTotalInv) * 100) : 0;
  setV('vr-balance', '₹ ' + totalBalance.toLocaleString());
  setV('vr-pct', pct + '%');
  const prog = document.getElementById('vr-progress');
  if (prog) prog.style.width = pct + '%';
  const balEl = document.getElementById('vr-balance');
  if (balEl) balEl.style.color = totalBalance <= 0 ? '#059669' : '#dc2626';

  // Build Ledger
  let combined = [];
  invoices.forEach(inv => combined.push({ 
    dateObj: new Date(inv.date), dateStr: window.formatDate(inv.date), type: 'Invoice', particular: `Invoice #${inv.number}`, 
    basic: inv.basic || 0, gst: inv.gst || 0, discount: inv.discount || 0, roundoff: inv.roundoff || 0, remarks: inv.remarks, 
    debit: inv.total, credit: 0 
  }));
  vPayments.forEach(p => combined.push({ 
    dateObj: new Date(p.date), dateStr: window.formatDate(p.date), type: 'Payment', particular: `Payment vs #${p.invoiceNumber} ${p.mode ? '['+p.mode+']' : ''}`, 
    basic: 0, gst: 0, discount: 0, roundoff: 0, remarks: p.remarks, 
    debit: 0, credit: p.amount 
  }));
  
  combined.sort((a, b) => a.dateObj - b.dateObj);
  
  let overallBal = 0;
  combined.forEach(item => { overallBal = overallBal + item.debit - item.credit; item.runBal = overallBal; });

  window.vrLedgPage = window.vrLedgPage || 1;
  window.vrLedgLimit = window.vrLedgLimit || 10;
  const totalLedgPages = window.vrLedgLimit === -1 ? 1 : Math.ceil(combined.length / window.vrLedgLimit);
  if(window.vrLedgPage > totalLedgPages) window.vrLedgPage = Math.max(1, totalLedgPages);
  if(window.renderPaginationControls) window.renderPaginationControls(window.vrLedgPage, totalLedgPages, 'vr-ledger-pagination', 'goToVrLedg');
  window.goToVrLedg = function(p) { window.vrLedgPage = p; window.vendorReportPageInit(); };
  if(document.getElementById('vr-ledger-footer')) document.getElementById('vr-ledger-footer').textContent = `${combined.length} records`;

  const startLedg = window.vrLedgLimit === -1 ? 0 : (window.vrLedgPage - 1) * window.vrLedgLimit;
  const paginatedCombined = window.vrLedgLimit === -1 ? combined : combined.slice(startLedg, startLedg + window.vrLedgLimit);

  let lRows = paginatedCombined.map((item, index) => {
    let i = startLedg + index;
    return `
      <tr class="hover:bg-gray-50 transition-colors group">
        <td class="py-3 px-5 text-center text-gray-400 font-medium">${i + 1}</td>
        <td class="py-3 px-5 text-gray-800 font-medium whitespace-nowrap">${item.dateStr}</td>
        <td class="py-3 px-5 font-bold ${item.type === 'Invoice' ? 'text-blue-600' : 'text-emerald-600'}">${item.particular}</td>
        <td class="py-3 px-5 text-right font-medium text-gray-400 hidden xl:table-cell">${item.basic > 0 ? '₹ ' + item.basic.toLocaleString() : '-'}</td>
        <td class="py-3 px-5 text-right font-medium text-gray-400 hidden xl:table-cell">${item.gst > 0 ? '₹ ' + item.gst.toLocaleString() : '-'}</td>
        <td class="py-3 px-5 text-right font-medium text-gray-400 hidden xl:table-cell">${item.discount > 0 ? '₹ ' + item.discount.toLocaleString() : '-'}</td>
        <td class="py-3 px-5 text-right font-medium text-gray-400 hidden xl:table-cell">${item.roundoff !== 0 ? '₹ ' + item.roundoff.toLocaleString() : '-'}</td>
        <td class="py-3 px-5 text-right font-medium text-gray-700 border-l border-gray-100">${item.debit > 0 ? '₹ ' + item.debit.toLocaleString() : '-'}</td>
        <td class="py-3 px-5 text-right font-medium text-emerald-600">${item.credit > 0 ? '₹ ' + item.credit.toLocaleString() : '-'}</td>
        <td class="py-3 px-5 text-right font-black ${item.runBal > 0 ? 'text-red-600' : 'text-gray-800'} bg-blue-50/10">₹ ${item.runBal.toLocaleString()}</td>
        <td class="py-3 px-5 text-gray-500 text-[11px] truncate hidden md:table-cell max-w-[120px]">${item.remarks || '-'}</td>
      </tr>
    `;
  }).join('');
  
  if(!paginatedCombined.length) {
    lRows = `<tr><td colspan="11" class="py-8 text-center text-gray-400 font-medium">No ledger transactions found.</td></tr>`;
    if(document.getElementById('vr-ledger-card-grid')) document.getElementById('vr-ledger-card-grid').innerHTML = '<div class="py-10 text-center text-gray-400 text-sm font-bold">No ledger transactions found.</div>';
  } else {
    if(document.getElementById('vr-ledger-card-grid')) {
      document.getElementById('vr-ledger-card-grid').innerHTML = paginatedCombined.map(item => {
        const c1 = item.type === 'Invoice' ? '#3b82f6' : '#10b981';
        return `
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 relative">
          <div class="absolute top-0 left-0 bottom-0 w-[5px] rounded-l-2xl" style="background:${c1}"></div>
          <div class="flex items-center gap-3 mb-4 ml-1">
            <div class="w-12 h-12 rounded-full flex items-center justify-center font-black text-white text-xl flex-shrink-0 shadow-sm" style="background:${c1}">${item.type[0]}</div>
            <div class="flex-1 min-w-0">
              <p class="font-black text-gray-800 text-[13px] truncate leading-snug break-all whitespace-normal">${item.particular}</p>
              <p class="text-[11px] text-gray-400 uppercase font-bold tracking-wider mt-1 truncate">${item.dateStr}</p>
            </div>
          </div>
          <div class="grid grid-cols-3 gap-2 mb-1 ml-1">
            <div class="bg-red-50/50 rounded-xl p-2.5 flex flex-col items-center justify-center border border-red-50">
              <p class="text-[9px] text-red-500 font-black uppercase tracking-widest mb-0.5">DB (+)</p>
              <p class="text-[13px] font-black text-red-600">₹${item.debit>=100?item.debit.toLocaleString():item.debit}</p>
            </div>
            <div class="bg-emerald-50/50 rounded-xl p-2.5 flex flex-col items-center justify-center border border-emerald-50">
              <p class="text-[9px] text-emerald-600 font-black uppercase tracking-widest mb-0.5">CR (-)</p>
              <p class="text-[13px] font-black text-emerald-700">₹${item.credit>=100?item.credit.toLocaleString():item.credit}</p>
            </div>
            <div class="bg-blue-50/50 rounded-xl p-2.5 flex flex-col items-center justify-center border border-blue-50">
              <p class="text-[9px] text-blue-600 font-black uppercase tracking-widest mb-0.5">BAL.</p>
              <p class="text-[13px] font-black text-blue-700">₹${item.runBal>=100?item.runBal.toLocaleString():item.runBal}</p>
            </div>
          </div>
        </div>`;
      }).join('');
    }
  }
  document.getElementById('vr-ledger-table-body').innerHTML = lRows;

  // Show ledger tab by default initially
  if(window._vrLastTab) {
    showVendorTab(window._vrLastTab);
  } else {
    showVendorTab('ledger');
    window._vrLastTab = 'ledger';
  }
}


window.exportVendorReport = function() {
  if (!currentVendor) return alert("No vendor selected.");
  const invoices = (window.invoiceList || []).filter(inv => inv.vendor === currentVendor.name);
  const payments = (window.paymentList || []).filter(p => p.vendor === currentVendor.name);
  
  if (invoices.length === 0 && payments.length === 0) return alert("No transactions available to export.");

  let combined = [];
  invoices.forEach(inv => combined.push({ 
    dateObj: new Date(inv.date), dateStr: window.formatDate(inv.date), type: 'Invoice', particular: `Invoice #${inv.number}`, 
    basic: inv.basic || 0, gst: inv.gst || 0, discount: inv.discount || 0, roundoff: inv.roundoff || 0, remarks: inv.remarks || '-', 
    debit: inv.total, credit: 0 
  }));
  payments.forEach(p => combined.push({ 
    dateObj: new Date(p.date), dateStr: window.formatDate(p.date), type: 'Payment', particular: `Payment vs #${p.invoiceNumber} ${p.mode ? '['+p.mode+']' : ''}`, 
    basic: 0, gst: 0, discount: 0, roundoff: 0, remarks: p.remarks || '-', 
    debit: 0, credit: p.amount 
  }));
  
  combined.sort((a, b) => a.dateObj - b.dateObj);
  
  const columns = [
    { header: 'Date', key: 'date', width: 18 },
    { header: 'Type', key: 'type', width: 15 },
    { header: 'Particulars', key: 'particular', width: 35, bold: true },
    { header: 'Basic', key: 'basic', width: 15, format: 'currency' },
    { header: 'GST', key: 'gst', width: 15, format: 'currency' },
    { header: 'Discount', key: 'discount', width: 15, format: 'currency' },
    { header: 'Round Off', key: 'roundoff', width: 15, format: 'currency' },
    { header: 'Debit / Inv (+)', key: 'debit', width: 20, format: 'currency', fontColor: 'FF1F2937', bold: true },
    { header: 'Credit / Pay (-)', key: 'credit', width: 20, format: 'currency', fontColor: 'FF059669', bold: true },
    { header: 'Running Balance', key: 'balance', width: 20, format: 'currency', fontColor: 'FFDC2626', bold: true },
    { header: 'Remarks', key: 'remarks', width: 40 }
  ];
  
  let rBalance = 0;
  const rows = combined.map(item => {
    rBalance = rBalance + item.debit - item.credit;
    return [
      item.dateStr, item.type, item.particular,
      item.basic || 0, item.gst || 0, item.discount || 0, item.roundoff || 0,
      item.debit || 0, item.credit || 0, rBalance, item.remarks
    ];
  });
  const dateStr = window.formatDate(new Date()).replace(/ /g, '_');
  const safeName = currentVendor.name.replace(/[^a-z0-9]/gi, '_');
  
  const metadata = [
    { label: 'Vendor Entity Name', value: currentVendor.name },
    { label: 'Primary Contact Person', value: currentVendor.contact || '-' },
    { label: 'Telephone Number', value: currentVendor.phone || '-' },
    { label: 'Electronic Mail (Email)', value: currentVendor.email || '-' },
    { label: 'Government GST No', value: currentVendor.gst || '-' },
    { label: 'Registered Address', value: currentVendor.address || '-' },
    { label: 'Report Generated On', value: window.formatDate(new Date()) }
  ];
  
  window.exportToExcel(`${safeName}_Ledger_${dateStr}`, 'Vendor Ledger', columns, rows, metadata);
};


// ============================================================
//  ANALYTICS PAGE
// ============================================================
window.analyticsPageInit = function() {
  const invoices = window.invoiceList || [];
  const payments = window.paymentList || [];
  const vendors  = window.vendorList  || [];
  const today    = new Date();
  const tab      = window._anlytActiveTab || 'overview';
  const period   = parseInt(document.getElementById('analytics-period')?.value || '6');

  if (typeof window.buildAllocations === 'function') window.buildAllocations();

  // ── Shared computations (fast, always run) ──────────────────
  const fmt = n => '₹' + (n||0).toLocaleString();
  const set = (id, v) => { const e = document.getElementById(id); if(e) e.innerText = v; };

  let tInv=0, tPaid=0, tOut=0, tOvr=0;
  let age30=0,age60=0,age90=0, a30c=0,a60c=0,a90c=0;
  let settled=0, partial=0, pending=0;

  invoices.forEach(inv => {
    const rp  = window.getPaidAmountForInvoice ? window.getPaidAmountForInvoice(inv.number) : 0;
    const paid= Math.min(inv.total, rp);
    const bal = Math.max(0, inv.total - rp);
    tInv += inv.total; tPaid += paid; tOut += bal;
    if (bal <= 0) settled++;
    else if (paid > 0) { partial++; }
    else pending++;
    if (bal > 0) {
      const age = Math.floor((today - new Date(inv.date)) / 86400000);
      if (age <= 30) { age30 += bal; a30c++; }
      else if (age <= 60) { age60 += bal; a60c++; }
      else { age90 += bal; a90c++; tOvr += bal; }
    }
  });

  const excess     = Object.values(window._excessPayments||{}).reduce((s,v)=>s+v,0);
  const openCount  = partial + pending;
  const ratio      = tInv > 0 ? Math.round((tPaid/tInv)*100) : 0;
  let dSum=0, vPays=0;
  payments.forEach(p => {
    const fn = String(p.invoiceNumber||'').split(',')[0].trim();
    const inv = invoices.find(i => String(i.number).trim()===fn && i.vendor===p.vendor);
    if(inv) { const d=Math.floor((new Date(p.date)-new Date(inv.date))/86400000); if(d>=0){dSum+=d;vPays++;} }
  });
  const avgDays = vPays>0 ? Math.round(dSum/vPays) : 0;
  const activeV = vendors.filter(v=>{
    const tI=invoices.filter(i=>i.vendor===v.name).reduce((s,i)=>s+i.total,0);
    const tP=payments.filter(p=>p.vendor===v.name).reduce((s,p)=>s+p.amount,0);
    return(tI-tP)>0;
  }).length;

  // ── Monthly arrays (shared) ──────────────────────────────
  const mNames=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const mLabels=[],mInv=[],mPay=[];
  for(let i=period-1;i>=0;i--){
    let d=new Date(today); d.setDate(1); d.setMonth(d.getMonth()-i);
    mLabels.push(mNames[d.getMonth()]+"'"+(d.getFullYear()%100));
    mInv.push(0); mPay.push(0);
  }
  invoices.forEach(inv=>{
    const d=new Date(inv.date); d.setDate(1);
    for(let i=0;i<period;i++){
      const r=new Date(today); r.setDate(1); r.setMonth(r.getMonth()-(period-1-i));
      if(d.getMonth()===r.getMonth()&&d.getFullYear()===r.getFullYear()) mInv[i]+=inv.total;
    }
  });
  payments.forEach(p=>{
    const d=new Date(p.date); d.setDate(1);
    for(let i=0;i<period;i++){
      const r=new Date(today); r.setDate(1); r.setMonth(r.getMonth()-(period-1-i));
      if(d.getMonth()===r.getMonth()&&d.getFullYear()===r.getFullYear()) mPay[i]+=p.amount;
    }
  });

  // Helper: safe chart destroy + create
  const mkChart = (key, canvas, cfg) => {
    if (!canvas || typeof Chart === 'undefined') return;
    if (window[key]) { try{window[key].destroy();}catch{} }
    window[key] = new Chart(canvas, cfg);
  };

  // ─────────────────────────────────────────────────────────────
  // ① OVERVIEW TAB
  // ─────────────────────────────────────────────────────────────
  if (tab === 'overview') {
    set('ov-global-inv', fmt(tInv)); set('ov-inv-count', invoices.length+' invoices');
    set('ov-global-paid', fmt(tPaid)); set('ov-pay-count', payments.length+' payments');
    set('ov-global-out', fmt(tOut)); set('ov-out-count', openCount+' open');
    set('ov-global-ovr', fmt(tOvr));
    set('ov-ratio', ratio+'%'); set('ov-avgdays', avgDays+'d');
    set('ov-active-v', activeV); set('ov-settled', settled);
    set('ov-excess', fmt(excess));
    set('ov-age30', fmt(age30)); set('ov-age30cnt', a30c+' invoices');
    set('ov-age60', fmt(age60)); set('ov-age60cnt', a60c+' invoices');
    set('ov-age90', fmt(age90)); set('ov-age90cnt', a90c+' invoices');
    const ageT = age30+age60+age90;
    ['30','60','90'].forEach(n=>{
      const bar=document.getElementById('ov-age'+n+'bar');
      if(bar&&ageT>0){ const v=n==='30'?age30:n==='60'?age60:age90; setTimeout(()=>bar.style.width=Math.round((v/ageT)*100)+'%',80); }
    });

    // Ageing doughnut
    mkChart('_ovAgeChart', document.getElementById('ov-ageing-chart'), {
      type:'doughnut',
      data:{ labels:['0–30d','31–60d','60+d'], datasets:[{data:[age30,age60,age90],backgroundColor:['#10b981','#f97316','#ef4444'],borderWidth:2,borderColor:'#fff'}] },
      options:{ responsive:true,maintainAspectRatio:false,cutout:'60%', plugins:{legend:{position:'bottom',labels:{usePointStyle:true,font:{size:10}}}} }
    });
    // Invoice status
    mkChart('_ovStatusChart', document.getElementById('ov-status-chart'), {
      type:'doughnut',
      data:{ labels:['Paid','Partial','Pending'], datasets:[{data:[settled,partial,pending],backgroundColor:['#10b981','#f59e0b','#ef4444'],borderWidth:2,borderColor:'#fff'}] },
      options:{ responsive:true,maintainAspectRatio:false,cutout:'60%', plugins:{legend:{position:'bottom',labels:{usePointStyle:true,font:{size:10}}}} }
    });
    // Payment modes horizontal bar
    const modes={};
    payments.forEach(p=>{ const m=p.mode||'Unknown'; modes[m]=(modes[m]||0)+p.amount; });
    mkChart('_ovModeChart', document.getElementById('ov-mode-chart'), {
      type:'bar',
      data:{ labels:Object.keys(modes), datasets:[{data:Object.values(modes),backgroundColor:['#6366f1','#eab308','#ec4899','#14b8a6','#8b5cf6','#f97316'],borderRadius:6,borderSkipped:false}] },
      options:{ indexAxis:'y',responsive:true,maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{ticks:{callback:v=>'₹'+(v>=1000?(v/1000).toFixed(0)+'k':v)},grid:{color:'#f1f5f9'}}} }
    });

    // Recent activity
    const actEl=document.getElementById('ov-activity');
    if(actEl){
      const acts=[
        ...invoices.map(i=>({date:new Date(i.date),type:'inv',label:`Invoice ${i.number}`,sub:i.vendor,amt:i.total,col:'#6366f1'})),
        ...payments.map(p=>({date:new Date(p.date),type:'pay',label:`Paid — ${p.mode||'NEFT'}`,sub:p.vendor,amt:p.amount,col:'#10b981'}))
      ].sort((a,b)=>b.date-a.date).slice(0,10);
      actEl.innerHTML=acts.length?acts.map(a=>`
        <div class="flex items-center gap-2.5 py-1.5 border-b border-gray-50 last:border-0">
          <div class="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style="background:${a.col}22">
            <span class="material-icons text-[13px]" style="color:${a.col}">${a.type==='inv'?'receipt_long':'payments'}</span>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-[11px] font-bold text-gray-700 truncate">${a.label}</p>
            <p class="text-[9px] text-gray-400">${a.sub} · ${window.formatDate?window.formatDate(a.date):''}</p>
          </div>
          <span class="text-[11px] font-black flex-shrink-0" style="color:${a.col}">${a.type==='inv'?'-':'+'} ₹${a.amt.toLocaleString()}</span>
        </div>`).join(''):'<p class="text-center text-gray-400 text-xs py-4">No activity yet.</p>';
    }
    // Top vendors
    const tvEl=document.getElementById('ov-top-vendors');
    if(tvEl){
      const cols=['#6366f1','#10b981','#f97316','#ec4899','#8b5cf6'];
      const tv=vendors.map(v=>{
        const ti=invoices.filter(i=>i.vendor===v.name).reduce((s,i)=>s+i.total,0);
        const tp=invoices.filter(i=>i.vendor===v.name).reduce((s,i)=>s+Math.min(i.total,(window.getPaidAmountForInvoice?window.getPaidAmountForInvoice(i.number):0)),0);
        return{name:v.name,total:ti,paid:tp,balance:Math.max(0,ti-tp)};
      }).filter(v=>v.total>0).sort((a,b)=>b.total-a.total).slice(0,5);
      tvEl.innerHTML=tv.length?tv.map((v,i)=>{const pct=Math.round((v.paid/v.total)*100);return`
        <div class="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
          <div class="w-6 h-6 rounded-full text-white font-black text-[10px] flex items-center justify-center flex-shrink-0" style="background:${cols[i]}">${i+1}</div>
          <div class="flex-1 min-w-0">
            <div class="flex justify-between"><span class="text-[11px] font-bold text-gray-700 truncate">${v.name}</span><span class="text-[10px] font-black text-gray-700">₹${v.total.toLocaleString()}</span></div>
            <div class="h-1 bg-gray-100 rounded-full mt-1 overflow-hidden"><div class="h-full rounded-full" style="width:${pct}%;background:${cols[i]}"></div></div>
            <div class="flex justify-between mt-0.5"><span class="text-[9px] text-emerald-500">${pct}% settled</span><span class="text-[9px] text-red-400">₹${v.balance.toLocaleString()} due</span></div>
          </div>
        </div>`;}).join(''):'<p class="text-center text-gray-400 text-xs py-4">No vendor data.</p>';
    }

    // Update timestamp
    set('anlyt-last-updated', 'Updated '+mNames[today.getMonth()]+' '+today.getDate());
  }

  // ─────────────────────────────────────────────────────────────
  // ② CASHFLOW TAB
  // ─────────────────────────────────────────────────────────────
  if (tab === 'cashflow') {
    const mAvgInv = period>0 ? Math.round(mInv.reduce((s,v)=>s+v,0)/period) : 0;
    const mAvgPay = period>0 ? Math.round(mPay.reduce((s,v)=>s+v,0)/period) : 0;
    const deficit = Math.max(0, tInv - tPaid);
    const maxPay  = payments.reduce((mx,p) => p.amount>mx.amount?p:mx, {amount:0,vendor:''});
    set('cf-avg-inv', fmt(mAvgInv)); set('cf-avg-pay', fmt(mAvgPay));
    set('cf-deficit', fmt(deficit));
    set('cf-max-pay', fmt(maxPay.amount)); set('cf-max-pay-v', maxPay.vendor||'—');

    const mBal = mInv.map((v,i)=>Math.max(0,v-mPay[i]));
    // Bar chart: invoiced vs paid vs balance
    mkChart('_cfBarChart', document.getElementById('cf-bar-chart'), {
      type:'bar',
      data:{ labels:mLabels, datasets:[
        {label:'Invoiced',data:mInv,backgroundColor:'rgba(99,102,241,.7)',borderRadius:6,borderSkipped:false},
        {label:'Paid',data:mPay,backgroundColor:'rgba(16,185,129,.7)',borderRadius:6,borderSkipped:false},
        {label:'Net Balance',data:mBal,backgroundColor:'rgba(251,146,60,.7)',borderRadius:6,borderSkipped:false}
      ]},
      options:{ responsive:true,maintainAspectRatio:false, plugins:{legend:{position:'bottom',labels:{usePointStyle:true,font:{size:10}}}}, scales:{y:{ticks:{callback:v=>'₹'+(v>=1000?(v/1000).toFixed(0)+'k':v)},grid:{color:'#f1f5f9'}}} }
    });
    // Cumulative line
    let rb=0; const cumInv=mInv.map(v=>{rb+=v;return rb;}); rb=0;
    const cumPay=mPay.map(v=>{rb+=v;return rb;});
    const cumOut=cumInv.map((v,i)=>Math.max(0,v-cumPay[i]));
    mkChart('_cfLineChart', document.getElementById('cf-line-chart'), {
      type:'line',
      data:{ labels:mLabels, datasets:[
        {label:'Cumulative Billed',data:cumInv,borderColor:'#ef4444',backgroundColor:'rgba(239,68,68,.07)',fill:true,tension:.4,pointRadius:4,pointBackgroundColor:'#ef4444'},
        {label:'Cumulative Paid',data:cumPay,borderColor:'#10b981',backgroundColor:'rgba(16,185,129,.07)',fill:true,tension:.4,pointRadius:4,pointBackgroundColor:'#10b981'},
        {label:'Outstanding',data:cumOut,borderColor:'#f97316',backgroundColor:'rgba(249,115,22,.07)',fill:true,tension:.4,pointRadius:4,pointBackgroundColor:'#f97316',borderDash:[5,3]}
      ]},
      options:{ responsive:true,maintainAspectRatio:false, plugins:{legend:{position:'bottom',labels:{usePointStyle:true,font:{size:10}}}}, scales:{y:{ticks:{callback:v=>'₹'+(v>=1000?(v/1000).toFixed(0)+'k':v)},grid:{color:'#f1f5f9'}}} }
    });
    // Heatmap (months × payment count)
    const hm=document.getElementById('cf-heatmap');
    if(hm){
      const monthCounts={};
      payments.forEach(p=>{const d=new Date(p.date);const key=d.getFullYear()+'-'+(d.getMonth()+1);monthCounts[key]=(monthCounts[key]||0)+1;});
      const maxCnt=Math.max(1,...Object.values(monthCounts));
      const cells=[];
      for(let i=period-1;i>=0;i--){
        const d=new Date(today); d.setDate(1); d.setMonth(d.getMonth()-i);
        const key=d.getFullYear()+'-'+(d.getMonth()+1);
        const cnt=monthCounts[key]||0;
        const pct=cnt/maxCnt;
        const bg=pct===0?'#f1f5f9':pct<.25?'#c7d2fe':pct<.5?'#818cf8':pct<.75?'#6366f1':'#3730a3';
        cells.push(`<div class="flex flex-col items-center gap-0.5" title="${mNames[d.getMonth()]} ${d.getFullYear()}: ${cnt} payments"><div class="w-10 h-10 rounded-lg shadow-sm" style="background:${bg}"></div><p class="text-[8px] text-gray-500 font-bold">${mNames[d.getMonth()].slice(0,3)}</p>${cnt?`<p class="text-[8px] font-black text-indigo-600">${cnt}</p>`:'<p class="text-[8px] text-gray-300">—</p>'}</div>`);
      }
      hm.innerHTML=cells.join('');
    }
  }

  // ─────────────────────────────────────────────────────────────
  // ③ VENDORS TAB
  // ─────────────────────────────────────────────────────────────
  if (tab === 'vendors') {
    window._anlytFilterVendors();
    const vRisk=vendors.map(v=>{
      const ti=invoices.filter(i=>i.vendor===v.name).reduce((s,i)=>s+i.total,0);
      const tp=payments.filter(p=>p.vendor===v.name).reduce((s,p)=>s+p.amount,0);
      return{name:v.name,invoiced:ti,paid:tp,balance:Math.max(0,ti-tp)};
    }).filter(v=>v.balance>0).sort((a,b)=>b.balance-a.balance).slice(0,8);

    mkChart('_vdConChart', document.getElementById('vd-concentration-chart'), {
      type:'bar',
      data:{ labels:vRisk.map(v=>v.name.length>15?v.name.slice(0,15)+'…':v.name), datasets:[
        {label:'Invoiced',data:vRisk.map(v=>v.invoiced),backgroundColor:'rgba(99,102,241,.6)',borderRadius:4,borderSkipped:false},
        {label:'Balance Due',data:vRisk.map(v=>v.balance),backgroundColor:'rgba(239,68,68,.7)',borderRadius:4,borderSkipped:false}
      ]},
      options:{ responsive:true,maintainAspectRatio:false, plugins:{legend:{position:'bottom',labels:{usePointStyle:true,font:{size:10}}}}, scales:{y:{ticks:{callback:v=>'₹'+(v>=1000?(v/1000).toFixed(0)+'k':v)},grid:{color:'#f1f5f9'}}}}
    });
  }

  // ─────────────────────────────────────────────────────────────
  // ④ INVOICES TAB
  // ─────────────────────────────────────────────────────────────
  if (tab === 'invoices') {
    const tot=invoices.length;
    set('inv-total-count',tot);
    set('inv-paid-count',settled); set('inv-paid-pct',tot>0?Math.round(settled/tot*100)+'%':'0%');
    set('inv-partial-count',partial); set('inv-partial-pct',tot>0?Math.round(partial/tot*100)+'%':'0%');
    set('inv-pending-count',pending); set('inv-pending-pct',tot>0?Math.round(pending/tot*100)+'%':'0%');

    // Category list
    const catEl=document.getElementById('inv-category-list');
    const cats={};
    invoices.forEach(inv=>{
      const cat=inv.category||'Uncategorized';
      if(!cats[cat]) cats[cat]={total:0,balance:0,count:0};
      const bal=Math.max(0,inv.total-(window.getPaidAmountForInvoice?window.getPaidAmountForInvoice(inv.number):0));
      cats[cat].total+=inv.total; cats[cat].balance+=bal; cats[cat].count++;
    });
    const catColors=['#6366f1','#10b981','#f97316','#ec4899','#8b5cf6','#eab308','#14b8a6','#ef4444'];
    const sorted=Object.entries(cats).sort((a,b)=>b[1].balance-a[1].balance);
    const maxCatBal=sorted[0]?.[1].balance||1;
    if(catEl) catEl.innerHTML=sorted.map(([cat,d],idx)=>`
      <div class="flex items-center gap-3">
        <div class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${catColors[idx%catColors.length]}"></div>
        <div class="flex-1 min-w-0">
          <div class="flex justify-between mb-1"><span class="text-[11px] font-bold text-gray-700 truncate">${cat}</span><span class="text-[10px] font-black text-gray-600">₹${d.balance.toLocaleString()}</span></div>
          <div class="h-1.5 bg-gray-100 rounded-full overflow-hidden"><div class="h-full rounded-full cat-bar-fill" style="width:${Math.round((d.balance/maxCatBal)*100)}%;background:${catColors[idx%catColors.length]}"></div></div>
          <div class="flex justify-between mt-0.5"><span class="text-[9px] text-gray-400">${d.count} inv</span><span class="text-[9px] text-gray-400">₹${d.total.toLocaleString()} total</span></div>
        </div>
      </div>`).join('')||'<p class="text-gray-400 text-xs py-2">No category data.</p>';

    // Category doughnut
    mkChart('_invCatChart', document.getElementById('inv-cat-chart'), {
      type:'doughnut',
      data:{ labels:sorted.map(([c])=>c), datasets:[{data:sorted.map(([,d])=>d.balance),backgroundColor:catColors,borderWidth:2,borderColor:'#fff'}] },
      options:{ responsive:true,maintainAspectRatio:false,cutout:'50%', plugins:{legend:{position:'bottom',labels:{usePointStyle:true,font:{size:9}}}} }
    });

    // Critical invoices table
    const critEl=document.getElementById('inv-critical-body');
    if(critEl){
      const crits=invoices.map(inv=>{
        const rp=window.getPaidAmountForInvoice?window.getPaidAmountForInvoice(inv.number):0;
        const bal=Math.max(0,inv.total-rp);
        const age=Math.floor((today-new Date(inv.date))/86400000);
        return{...inv,balance:bal,ageing:age};
      }).filter(inv=>inv.balance>0).sort((a,b)=>b.balance-a.balance).slice(0,12);
      critEl.innerHTML=crits.length?crits.map(inv=>`
        <tr class="hover:bg-red-50/20 transition-colors">
          <td class="py-2 px-4 font-bold text-blue-600">${inv.number}</td>
          <td class="py-2 px-4 text-gray-700 font-semibold">${inv.vendor}</td>
          <td class="py-2 px-4"><span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">${inv.category||'—'}</span></td>
          <td class="py-2 px-4 text-right font-medium text-gray-600">₹${inv.total.toLocaleString()}</td>
          <td class="py-2 px-4 text-center"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${inv.ageing>60?'bg-red-100 text-red-600':inv.ageing>30?'bg-orange-100 text-orange-600':'bg-emerald-100 text-emerald-600'}">${inv.ageing}d</span></td>
          <td class="py-2 px-4 text-right font-black text-red-600">₹${inv.balance.toLocaleString()}</td>
          <td class="py-2 px-4 text-center"><button class="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-1 rounded hover:bg-emerald-100 transition" onclick="window._editPaymentId=null;window._contextPaymentVendor='${inv.vendor}';window._lockPaymentVendor=true;window._paymentReturnPage='analytics';window.location.hash='add-payment'">Pay</button></td>
        </tr>`).join(''):'<tr><td colspan="7" class="text-center py-6 text-gray-400">No outstanding invoices.</td></tr>';
    }
  }

  // ─────────────────────────────────────────────────────────────
  // ⑤ RISK TAB
  // ─────────────────────────────────────────────────────────────
  if (tab === 'risk') {
    const vRisk=vendors.map(v=>{
      const ti=invoices.filter(i=>i.vendor===v.name).reduce((s,i)=>s+i.total,0);
      const tp=payments.filter(p=>p.vendor===v.name).reduce((s,p)=>s+p.amount,0);
      const cnt=invoices.filter(i=>i.vendor===v.name).length;
      const odInvs=invoices.filter(i=>i.vendor===v.name&&Math.floor((today-new Date(i.date))/86400000)>30);
      const odBal=odInvs.reduce((s,i)=>s+Math.max(0,i.total-(window.getPaidAmountForInvoice?window.getPaidAmountForInvoice(i.number):0)),0);
      return{name:v.name,invoiced:ti,paid:tp,balance:Math.max(0,ti-tp),count:cnt,odBal,pct:ti>0?Math.round((Math.max(0,ti-tp)/ti)*100):0};
    }).filter(v=>v.balance>0).sort((a,b)=>b.balance-a.balance);

    const atRisk=vRisk.filter(v=>v.odBal>0).length;
    const topPct=vRisk[0]?.pct||0;
    const odCnt=invoices.filter(inv=>Math.floor((today-new Date(inv.date))/86400000)>30&&Math.max(0,inv.total-(window.getPaidAmountForInvoice?window.getPaidAmountForInvoice(inv.number):0))>0).length;
    set('rk-critical-val',fmt(tOvr)); set('rk-at-risk',atRisk);
    set('rk-top-pct',topPct+'%'); set('rk-overdue-cnt',odCnt);

    const top5=vRisk.slice(0,5);
    // Radar chart
    mkChart('_rkRadar', document.getElementById('rk-radar-chart'), {
      type:'radar',
      data:{labels:['Balance Due','Invoiced Amt','Invoice Count','Overdue Bal','Risk %'],
        datasets:top5.map((v,i)=>{const cols=['#6366f1','#ef4444','#f97316','#10b981','#8b5cf6'];return{label:v.name.length>12?v.name.slice(0,12)+'…':v.name,data:[v.balance/1000,v.invoiced/1000,v.count*10,v.odBal/1000,v.pct],borderColor:cols[i],backgroundColor:cols[i]+'22',pointBackgroundColor:cols[i],borderWidth:2};})},
      options:{responsive:true,maintainAspectRatio:false, plugins:{legend:{position:'bottom',labels:{usePointStyle:true,font:{size:9}}}}, scales:{r:{ticks:{display:false},grid:{color:'#f1f5f9'},pointLabels:{font:{size:9,weight:700}}}}}
    });
    // Bar chart: balance by vendor
    mkChart('_rkBar', document.getElementById('rk-bar-chart'), {
      type:'bar',
      data:{labels:top5.map(v=>v.name.length>14?v.name.slice(0,14)+'…':v.name),
        datasets:[{label:'Balance Due',data:top5.map(v=>v.balance),backgroundColor:top5.map((_,i)=>['#ef4444','#f97316','#f59e0b','#8b5cf6','#6366f1'][i]),borderRadius:6,borderSkipped:false}]},
      options:{responsive:true,maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{y:{ticks:{callback:v=>'₹'+(v>=1000?(v/1000).toFixed(0)+'k':v)},grid:{color:'#f1f5f9'}}}}
    });

    // Risk table
    const rkTb=document.getElementById('rk-table-body');
    if(rkTb) rkTb.innerHTML=vRisk.length?vRisk.map((v,i)=>{
      const level=v.pct>70?'CRITICAL':v.pct>40?'HIGH':v.pct>20?'MEDIUM':'LOW';
      const levelCls=v.pct>70?'bg-red-100 text-red-700':v.pct>40?'bg-orange-100 text-orange-700':v.pct>20?'bg-amber-100 text-amber-700':'bg-emerald-100 text-emerald-700';
      return`<tr class="hover:bg-gray-50 transition-colors">
        <td class="py-3 px-4 text-center"><span class="w-6 h-6 rounded-full ${i===0?'bg-red-100 text-red-700':i===1?'bg-orange-100 text-orange-700':'bg-gray-100 text-gray-600'} flex items-center justify-center text-[10px] font-black mx-auto">${i+1}</span></td>
        <td class="py-3 px-4 font-bold text-gray-800">${v.name}</td>
        <td class="py-3 px-4 text-right font-medium text-gray-500">₹${v.invoiced.toLocaleString()}</td>
        <td class="py-3 px-4 text-right font-medium text-emerald-600">₹${v.paid.toLocaleString()}</td>
        <td class="py-3 px-4 text-center"><span class="bg-blue-50 text-blue-700 text-[10px] font-black px-2 py-0.5 rounded-full">${v.count}</span></td>
        <td class="py-3 px-4 text-center"><span class="text-[10px] font-black px-2 py-0.5 rounded-full ${levelCls}">${level}</span></td>
        <td class="py-3 px-4"><div class="flex items-center gap-2"><div class="flex-1 bg-gray-100 h-2 rounded-full overflow-hidden"><div class="h-full rounded-full ${v.pct>70?'bg-red-500':v.pct>40?'bg-orange-400':'bg-emerald-500'}" style="width:${v.pct}%"></div></div><span class="text-[10px] font-bold text-gray-400 w-10 text-right">${v.pct}%</span></div></td>
        <td class="py-3 px-4 text-right font-black text-red-600">₹${v.balance.toLocaleString()}</td>
      </tr>`;
    }).join(''):'<tr><td colspan="8" class="text-center py-6 text-gray-400">No active risk liabilities.</td></tr>';

    // Mobile cards
    const rkGrid=document.getElementById('rk-card-grid');
    if(rkGrid) rkGrid.innerHTML=top5.map((v,i)=>{
      const level=v.pct>70?'CRITICAL':v.pct>40?'HIGH':v.pct>20?'MEDIUM':'LOW';
      const lCol=v.pct>70?'#ef4444':v.pct>40?'#f97316':'#6366f1';
      return`<div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 relative">
        <div class="absolute top-0 left-0 bottom-0 w-1.5 rounded-l-2xl" style="background:${lCol}"></div>
        <div class="flex items-center gap-3 mb-3 ml-2">
          <div class="w-10 h-10 rounded-full flex items-center justify-center font-black text-[11px] flex-shrink-0 shadow-sm" style="background:${lCol}22;color:${lCol};border:1.5px solid ${lCol}44">#${i+1}</div>
          <div class="flex-1 min-w-0"><p class="font-black text-gray-800 text-[14px] truncate">${v.name}</p><span class="text-[9px] font-black px-1.5 py-0.5 rounded" style="background:${lCol}22;color:${lCol}">${level}</span></div>
        </div>
        <div class="grid grid-cols-2 gap-2 ml-2">
          <div class="bg-gray-50 rounded-xl p-2 text-center"><p class="text-[8px] text-gray-500 font-black uppercase">INVOICED</p><p class="text-[12px] font-black text-gray-800">₹${v.invoiced>=1000?(v.invoiced/1000).toFixed(1)+'k':v.invoiced}</p></div>
          <div class="rounded-xl p-2 text-center" style="background:${lCol}11"><p class="text-[8px] font-black uppercase" style="color:${lCol}">EXPOSURE</p><p class="text-[12px] font-black" style="color:${lCol}">₹${v.balance>=1000?(v.balance/1000).toFixed(1)+'k':v.balance}</p></div>
        </div>
        <div class="flex items-center gap-2 mt-3 ml-2"><div class="flex-1 bg-gray-100 h-1.5 rounded-full overflow-hidden"><div class="h-full rounded-full" style="width:${v.pct}%;background:${lCol}"></div></div><span class="text-[10px] font-black" style="color:${lCol}">${v.pct}%</span></div>
      </div>`;
    }).join('');
  }
};


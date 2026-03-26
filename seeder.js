const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxP3-LyhCYGTEtWmXFiC3TcHNq3hCrnQO9KonCNRZmrYVVg28S_qsetYX5sbj5U_I4XBQ/exec";

async function saveToDB(action, payload) {
  const url = `${SCRIPT_URL}?action=${encodeURIComponent(action)}&payload=${encodeURIComponent(JSON.stringify({ id: payload.id, ...payload }))}`;
  try {
    const res = await fetch(url);
    await res.text();
    return true;
  } catch(e) {
    console.error("Error", e);
    return false;
  }
}

async function run() {
  console.log("Seeding DB...");
  const delay = ms => new Promise(r => setTimeout(r, ms));
  let vid = Date.now();
  
  for (let i = 1; i <= 10; i++) {
    const vendorName = "Tech Corp " + String.fromCharCode(64 + i);
    await saveToDB('addVendor', { id: vid++, name: vendorName, phone: '90000000'+i.toString().padStart(2,'0'), email: 'demo'+i+'@gmail.com', gst: '27AAAAA0000A1Z'+i, address: 'Test Location '+i });
    console.log("Added Vendor: " + vendorName);
    await delay(300);
    
    for (let j = 1; j <= 20; j++) {
      const invNo = "INV/24-25/" + String(i).padStart(2, '0') + '-' + String(j).padStart(3, '0');
      const d = (j % 28) + 1;
      const totalAmt = 1500 + (j*150);
      const mth = (j % 11) + 1;

      await saveToDB('addInvoice', { id: vid++, vendor: vendorName, number: invNo, po: 'PO-'+i, category: 'Equipment', date: '2024-'+String(mth).padStart(2,'0')+'-'+String(d).padStart(2,'0'), basic: totalAmt, gst: totalAmt*0.18, discount: 0, roundoff: 0, total: totalAmt*1.18, remarks: 'Demo seeded invoice' });
      await delay(300);
      
      // 10 payments
      if (j <= 10) {
        const pd = d < 28 ? d + 1 : 28;
        const pmth = mth === 12 ? 1 : mth + 1;
        await saveToDB('addPayment', { id: vid++, vendor: vendorName, invoiceNumber: invNo, date: '2024-'+String(pmth).padStart(2,'0')+'-'+String(pd).padStart(2,'0'), mode: j%2===0?'NEFT':'Cash', amount: totalAmt*1.18, reference: 'REF'+i+'-'+j, remarks: 'Clearance' });
        await delay(300);
      }
    }
  }
  console.log("COMPLETED SEEDING ALL 10 VENDORS 200 INVOICES AND 100 PAYMENTS TO THE LIVE GOOGLE SHEETS DB!");
}
run();

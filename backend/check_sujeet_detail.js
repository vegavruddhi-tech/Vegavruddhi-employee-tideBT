const mongoose = require('mongoose');
require('dotenv').config({ path: 'c:\\VegaProject\\Vegavruddhi-employee-tideBT\\backend\\.env' });

async function run() {
  await mongoose.connect(process.env.MONGO_URI, { dbName: 'CompanyDB' });
  const db = mongoose.connection.db;

  const email = 'sujeetsaroj2025@gmail.com';

  // Show May 2026 payment details
  const payments = await db.collection('TideBT_Payments').find({ transferTo: /sujeet/i }).toArray();
  const mayPay = payments.filter(p => {
    const d = new Date(p.createdAt);
    return d.getFullYear()===2026 && d.getMonth()===4;
  });
  console.log('--- May 2026 Payments ---');
  mayPay.forEach(p => console.log(JSON.stringify({ amount: p.amount, createdAt: p.createdAt, transferTo: p.transferTo, reason: p.reason || p.type || p.note })));

  // Show BT_TL_CONNECT MAY docs for sujeet
  const btDocs = await db.collection('BT_TL_CONNECT MAY').find({ 
    $or: [{ employeeName: /sujeet/i }, { lead: /sujeet/i }]
  }).toArray();
  console.log('\n--- BT_TL_CONNECT MAY (sujeet) ---');
  btDocs.forEach(b => console.log(JSON.stringify(b)));

  await mongoose.connection.close();
}
run().catch(console.error);

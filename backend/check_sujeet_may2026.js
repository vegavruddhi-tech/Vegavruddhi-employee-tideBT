const mongoose = require('mongoose');
require('dotenv').config({ path: 'c:\\VegaProject\\Vegavruddhi-employee-tideBT\\backend\\.env' });

async function run() {
  await mongoose.connect(process.env.MONGO_URI, { dbName: 'CompanyDB' });
  const db = mongoose.connection.db;
  
  const email = 'sujeetsaroj2025@gmail.com';
  const name = 'Sujeet Saroj';

  // 1. Payments - all time
  const payments = await db.collection('TideBT_Payments').find({ transferTo: /sujeet/i }).toArray();
  const totalPay = payments.reduce((s,p)=>s+(p.amount||0),0);
  console.log('Total payments (all time):', totalPay, '| count:', payments.length);
  // May 2026 payments
  const mayPay = payments.filter(p => {
    const d = new Date(p.createdAt);
    return d.getFullYear()===2026 && d.getMonth()===4;
  });
  console.log('May 2026 payments:', mayPay.reduce((s,p)=>s+(p.amount||0),0));

  // 2. TideBT_Merchants
  const merchants = await db.collection('TideBT_Merchants').countDocuments({ 
    $or: [{ employeeEmail: email }, { employeeName: /sujeet/i }]
  });
  console.log('\nTideBT_Merchants count:', merchants);

  // 3. BT_TL_CONNECT MAY
  const btDocs = await db.collection('BT_TL_CONNECT MAY').find({ 
    $or: [{ employeeName: /sujeet/i }, { lead: /sujeet/i }]
  }).limit(3).toArray();
  console.log('BT_TL_CONNECT MAY (sujeet):', btDocs.length);
  
  // Get merchant numbers for Sujeet
  const mDocs = await db.collection('TideBT_Merchants').find({
    $or: [{ employeeEmail: email }, { employeeName: /sujeet/i }]
  }).project({ merchantNumber: 1 }).toArray();
  const nums = mDocs.map(m=>m.merchantNumber).filter(Boolean);
  console.log('Merchant numbers:', nums);
  
  if (nums.length > 0) {
    const btMatch = await db.collection('BT_TL_CONNECT MAY').find({ merchantNumber: { $in: nums } }).limit(5).toArray();
    console.log('BT_TL_CONNECT MAY matches:', btMatch.length);
    btMatch.forEach(b => console.log(' ', JSON.stringify({ merchantNumber: b.merchantNumber, stage3: b.stage3, passLive: b.passLive })));
  }

  // 4. TideBT Form Responses
  const forms = await db.collection('TideBT Form Responses').find({
    $or: [{ employeeEmail: email }, { employeeName: /sujeet/i }]
  }).toArray();
  const mayForms = forms.filter(f => {
    const d = new Date(f.createdAt);
    return d.getFullYear()===2026 && d.getMonth()===4;
  });
  console.log('\nForm responses total:', forms.length, '| May 2026:', mayForms.length);

  // 5. TideBT_RewardPass
  const rp = await db.collection('TideBT_RewardPass').find({
    $or: [{ employeeEmail: email }, { employeeName: /sujeet/i }]
  }).toArray();
  const mayRP = rp.filter(r => {
    const d = new Date(r.dateOfWorking || r.createdAt);
    return d.getFullYear()===2026 && d.getMonth()===4;
  });
  console.log('\nRewardPass total:', rp.length, '| May 2026:', mayRP.length);
  const mayBT = mayRP.reduce((s,r)=>s+(r.totalBTAmount||0),0);
  const mayRP2 = mayRP.reduce((s,r)=>s+(r.totalRPCount||0),0);
  console.log('May BT:', mayBT, '| May RP:', mayRP2);

  await mongoose.connection.close();
}
run().catch(console.error);

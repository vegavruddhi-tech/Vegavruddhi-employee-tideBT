const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const empName = 'Amit Shukla';
  const escape  = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const nameParts   = empName.split(' ');
  const firstName   = nameParts[0];
  const lastInitial = nameParts[1] ? nameParts[1][0] : '';
  const leadPatterns = [
    new RegExp(`^\\s*${escape(empName)}\\s*$`, 'i'),
    new RegExp(`^\\s*${escape(firstName)}\\s*${lastInitial ? escape(lastInitial) : ''}`, 'i'),
    new RegExp(`^\\s*${escape(firstName)}\\s*$`, 'i')
  ];

  const masterDocs = await db.collection('bt_master').find({
    fseName: { $regex: new RegExp(`^\\s*${escape(empName)}\\s*\\d*\\s*$`, 'i') }
  }).project({ merchantNumber: 1 }).toArray();
  const merchantNumbers = [...new Set(masterDocs.map(m => m.merchantNumber).filter(Boolean))];
  console.log('bt_master merchants:', merchantNumbers.length);

  for (const col of ['BT_TL_CONNECT JAN 26', 'BT_TL_CONNECT FEB 26', 'BT_TL_CONNECT MARCH', 'BT_TL_CONNECT APRIL', 'BT_TL_CONNECT MAY']) {
    const [byMerchant, byLead] = await Promise.all([
      merchantNumbers.length > 0
        ? db.collection(col).find({ merchantNumber: { $in: merchantNumbers } }).toArray()
        : Promise.resolve([]),
      db.collection(col).find({ $or: leadPatterns.map(p => ({ lead: p })) }).toArray()
    ]);

    const seen = new Set();
    const docs = [];
    [...byMerchant, ...byLead].forEach(r => {
      const key = r.merchantNumber || String(r._id);
      if (!seen.has(key)) { seen.add(key); docs.push(r); }
    });

    let bt = 0, rp = 0;
    docs.forEach(r => {
      bt += parseFloat(String(r.stage3 || '0').replace(/,/g,'')) || 0;
      if ((r.rewardPassPro || r.priorityPassPro || '').toLowerCase() === 'active') rp++;
    });
    const fee = Math.round((bt > 10000 ? bt * 0.015 : 0) * 100) / 100;
    console.log(`${col}: docs=${docs.length}(merchant:${byMerchant.length}+lead:${byLead.length}), BT=₹${bt.toLocaleString()}, RP=${rp}, Fee=₹${fee}`);
  }

  await mongoose.connection.close();
}
run().catch(console.error);

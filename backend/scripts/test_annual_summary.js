const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const MONTH_NAMES = ['January','February','March','April','May','June'];
  const yearStr = '2026';
  const shortYear = '26';
  const MONTH_ABBR = {
    'JANUARY': 'JAN', 'FEBRUARY': 'FEB', 'MARCH': 'MAR', 'APRIL': 'APR',
    'MAY': 'MAY', 'JUNE': 'JUN'
  };

  const allCols = (await db.listCollections().toArray()).map(c => c.name);
  const btCols  = allCols.filter(c => c.toUpperCase().startsWith('BT_TL_CONNECT'));

  // Find FSE whose dashboard shows this data (Gurgaon, Dheeraj Anand manager)
  const fseRecord = await db.collection('TideBT_Access').findOne({
    tlName: { $regex: /dheeraj/i }
  });
  console.log('Sample TideBT_Access record:', fseRecord);

  const masterSample = await db.collection('bt_master').findOne({});
  console.log('bt_master sample fseName:', masterSample?.fseName, 'tl:', masterSample?.tl);

  // Try to find merchants for the user in the screenshot (Gurgaon location, Dheeraj Anand TL)
  const allAccess = await db.collection('TideBT_Access').find({
    tlName: { $regex: /dheeraj/i }
  }).toArray();
  console.log('FSEs under Dheeraj:', allAccess.map(a => a.fseName));

  if (allAccess.length > 0) {
    const fseName = allAccess[0].fseName;
    console.log('\nTesting for FSE:', fseName);

    const masterDocs = await db.collection('bt_master').find({
      fseName: { $regex: new RegExp(`^\\s*${fseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\d*\\s*$`, 'i') }
    }).project({ merchantNumber: 1 }).toArray();
    const merchantNumbers = [...new Set(masterDocs.map(m => m.merchantNumber).filter(Boolean))];
    console.log('Merchant count:', merchantNumbers.length);

    for (const monthName of MONTH_NAMES) {
      const mu = monthName.toUpperCase();
      const abbr = MONTH_ABBR[mu] || mu;
      const matchesMonth = (cu) => cu.includes(mu) || cu.includes(abbr);
      let colName = btCols.find(c => { const cu = c.toUpperCase(); return matchesMonth(cu) && (cu.includes(yearStr) || cu.includes(shortYear)); });
      if (!colName) colName = btCols.find(c => matchesMonth(c.toUpperCase()));
      if (!colName) { console.log(`${monthName}: NO COLLECTION`); continue; }

      const docs = await db.collection(colName).find({ merchantNumber: { $in: merchantNumbers } })
        .project({ stage3: 1, rewardPassPro: 1, priorityPassPro: 1 }).toArray();

      let btAmount = 0, rpCount = 0;
      docs.forEach(r => {
        btAmount += parseFloat(String(r.stage3 || '0').replace(/,/g,'')) || 0;
        if ((r.rewardPassPro || r.priorityPassPro || '').toLowerCase() === 'active') rpCount++;
      });
      const fee = Math.round((btAmount > 10000 ? btAmount * 0.015 : 0) * 100) / 100;
      const rpCost = rpCount * 2500;
      console.log(`${monthName}: BT=₹${btAmount.toLocaleString()}, RP=${rpCount}(₹${rpCost}), Fee=₹${fee}, TotalUsed=₹${(rpCost+fee).toLocaleString()}`);
    }
  }

  await mongoose.connection.close();
}
run().catch(console.error);

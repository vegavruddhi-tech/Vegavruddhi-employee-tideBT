const mongoose = require('mongoose');
require('dotenv').config({ path: 'c:\\VegaProject\\Vegavruddhi-employee-tideBT\\backend\\.env' });

async function run() {
  await mongoose.connect(process.env.MONGO_URI, { dbName: 'CompanyDB' });
  const db = mongoose.connection.db;

  // List all BT_TL_CONNECT collections
  const allCols = (await db.listCollections().toArray()).map(c => c.name);
  const btCols = allCols.filter(c => c.toUpperCase().startsWith('BT_TL_CONNECT'));
  console.log('BT_TL_CONNECT collections:', btCols);

  // Check June collection
  if (btCols.includes('BT_TL_CONNECT JUNE') || btCols.some(c => c.toUpperCase().includes('JUNE'))) {
    const juneName = btCols.find(c => c.toUpperCase().includes('JUNE'));
    const count = await db.collection(juneName).countDocuments();
    console.log(`\n${juneName}: ${count} docs`);
    
    const sample = await db.collection(juneName).findOne({});
    const fields = Object.keys(sample || {});
    console.log('Fields:', fields);
    console.log('Sample:', JSON.stringify({
      merchantNumber: sample?.merchantNumber,
      lead: sample?.lead,
      stage3: sample?.stage3,
      stage3Gap: sample?.stage3Gap,
      todaysStage3: sample?.todaysStage3,
      yesterdaysStage3: sample?.yesterdaysStage3,
      passLive: sample?.passLive,
      rewardPassPro: sample?.rewardPassPro,
      tlName: sample?.tlName
    }));

    // Check for a known FSE - Sujeet Saroj's merchants
    const sujeetMerchants = await db.collection('TideBT_Merchants')
      .find({ employeeEmail: 'sujeetsaroj2025@gmail.com' })
      .project({ merchantNumber: 1 }).toArray();
    const nums = sujeetMerchants.map(m => m.merchantNumber).filter(Boolean);
    console.log('\nSujeet merchant numbers:', nums);
    
    if (nums.length > 0) {
      const btMatch = await db.collection(juneName).find({ merchantNumber: { $in: nums } }).limit(3).toArray();
      console.log(`June matches for Sujeet: ${btMatch.length}`);
      btMatch.forEach(b => console.log(JSON.stringify({ merchantNumber: b.merchantNumber, stage3: b.stage3, todaysStage3: b.todaysStage3 })));
    }

    // Distinct tlNames
    const tlNames = await db.collection(juneName).distinct('tlName');
    console.log('\nDistinct tlNames in June:', tlNames.slice(0,10));
  }

  await mongoose.connection.close();
}
run().catch(console.error);

const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const db = mongoose.connection.db;
  
  // Check bt_master
  const master = await db.collection('bt_master').find({
    fseName: { $regex: /sujeet/i }
  }).toArray();
  console.log('\n=== bt_master records:', master.length, '===');
  master.forEach(m => console.log(' -', m.merchantName, '|', m.merchantNumber, '| fse:', m.fseName));

  // Check BT_TL_CONNECT MAY — by merchantNumber from master
  const masterNums = master.map(m => m.merchantNumber).filter(Boolean);
  console.log('\nMerchant numbers from bt_master:', masterNums);

  const may = await db.collection('BT_TL_CONNECT MAY').find({
    merchantNumber: { $in: masterNums }
  }).toArray();
  console.log('\n=== BT_TL_CONNECT MAY (by merchant number):', may.length, '===');
  may.forEach(m => {
    const s3 = m.stage3 || m.Stage_3 || m['Stage-3'] || 0;
    console.log(' -', m.lead || m.Lead || '?', '|', m.merchantNumber, '| stage3:', s3);
  });

  // Check BT_TL_CONNECT JUNE — by merchantNumber
  const june = await db.collection('BT_TL_CONNECT JUNE').find({
    merchantNumber: { $in: masterNums }
  }).toArray();
  console.log('\n=== BT_TL_CONNECT JUNE (by merchant number):', june.length, '===');
  june.forEach(m => {
    const s3 = m.stage3 || m.Stage_3 || m['Stage-3'] || 0;
    console.log(' -', m.lead || m.Lead || '?', '|', m.merchantNumber, '| stage3:', s3);
  });

  // Also check by name in JUNE
  const juneByName = await db.collection('BT_TL_CONNECT JUNE').find({
    $or: [
      { lead: { $regex: /sujeet/i } },
      { Lead: { $regex: /sujeet/i } },
      { teamLeadName: { $regex: /sujeet/i } }
    ]
  }).limit(5).toArray();
  console.log('\n=== BT_TL_CONNECT JUNE (by name):', juneByName.length, '===');
  juneByName.forEach(m => console.log(' -', JSON.stringify(m).slice(0, 120)));

  // Check TideBT Form Responses
  const formCount = await db.collection('TideBT Form Responses').countDocuments({
    employeeName: { $regex: /sujeet/i }
  });
  console.log('\nTideBT Form Responses count:', formCount);

  // Check TideBT_Access
  const access = await db.collection('TideBT_Access').find({
    fseName: { $regex: /sujeet/i }
  }).toArray();
  console.log('\n=== TideBT_Access ===');
  access.forEach(a => console.log(' - fseName:', a.fseName, '| tlName:', a.tlName, '| hasAccess:', a.hasTideBTAccess));

  mongoose.disconnect();
}).catch(e => console.error('Error:', e.message));

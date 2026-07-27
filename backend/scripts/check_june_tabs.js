const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const total = await db.collection('BT_TL_CONNECT JUNE').countDocuments();
  console.log('Total BT_TL_CONNECT JUNE docs:', total);

  const tabs = await db.collection('BT_TL_CONNECT JUNE').distinct('_tab');
  console.log('Distinct _tab values:', tabs);

  const nums = ['9918304056','8127820480','9648773837','8009804031','7860544085'];
  const docs = await db.collection('BT_TL_CONNECT JUNE').find({ merchantNumber: { $in: nums } }).toArray();
  console.log('\nSujeet merchant docs in JUNE:');
  docs.forEach(d => console.log(JSON.stringify({
    merchantNumber: d.merchantNumber,
    stage3: d.stage3,
    tlName: d.tlName,
    _tab: d._tab,
    _syncedAt: d._syncedAt
  })));

  // Check the _syncedAt date to understand which sync this came from
  const latestSync = await db.collection('BT_TL_CONNECT JUNE').find({})
    .sort({ _syncedAt: -1 }).limit(1).toArray();
  console.log('\nLatest sync date:', latestSync[0]?._syncedAt, 'tab:', latestSync[0]?._tab);

  const oldestSync = await db.collection('BT_TL_CONNECT JUNE').find({})
    .sort({ _syncedAt: 1 }).limit(1).toArray();
  console.log('Oldest sync date:', oldestSync[0]?._syncedAt, 'tab:', oldestSync[0]?._tab);

  await mongoose.connection.close();
}
run().catch(console.error);

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const col = 'BT_TL_CONNECT JAN 26';
  const sample = await db.collection(col).findOne({});
  console.log('createdAt:', sample?.createdAt);
  console.log('_syncedAt:', sample?._syncedAt);
  console.log('_synced_at:', sample?._synced_at);

  // Check what the year filter does
  const dateRaw = sample?.createdAt || sample?._syncedAt || sample?._synced_at;
  console.log('dateRaw used for year filter:', dateRaw);
  if (dateRaw) {
    const d = new Date(dateRaw);
    console.log('Parsed year:', d.getFullYear());
    console.log('Passes 2026 filter:', d.getFullYear() === 2026);
  }

  // Check total docs vs filtered
  const total = await db.collection(col).countDocuments();
  const nums = await db.collection('bt_master').find({ fseName: { $regex: /sujeet/i } }).project({ merchantNumber: 1 }).toArray();
  const merchantNums = nums.map(m => m.merchantNumber).filter(Boolean);
  
  const raw = await db.collection(col).find({ merchantNumber: { $in: merchantNums } }).toArray();
  console.log('\nRaw docs before year filter:', raw.length);
  
  const filtered = raw.filter(r => {
    const dr = r.createdAt || r._syncedAt || r._synced_at;
    if (!dr) return true;
    const d = new Date(dr);
    return !isNaN(d.getTime()) && d.getFullYear() === 2026;
  });
  console.log('After year filter (2026):', filtered.length);

  await mongoose.connection.close();
}
run().catch(console.error);

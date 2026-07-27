const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const masterDocs = await db.collection('bt_master').find({
    fseName: { $regex: /Amit Shukla/i }
  }).project({ merchantNumber: 1 }).toArray();
  const nums = masterDocs.map(m => m.merchantNumber).filter(Boolean);
  console.log('Amit Shukla merchants:', nums.length, nums.slice(0,5));

  for (const col of ['BT_TL_CONNECT JAN 26', 'BT_TL_CONNECT FEB 26', 'BT_TL_CONNECT MARCH']) {
    const total = await db.collection(col).countDocuments();
    const match = await db.collection(col).find({ merchantNumber: { $in: nums } }).limit(3).toArray();
    const sampleNums = await db.collection(col).distinct('merchantNumber');
    console.log(`\n${col}: total=${total}, matched=${match.length}`);
    console.log('Sample nums in collection:', sampleNums.slice(0,5));
    console.log('Sample nums we searched:', nums.slice(0,5));
    if (match.length > 0) console.log('Match sample:', match[0].merchantNumber, match[0].stage3);
  }

  await mongoose.connection.close();
}
run().catch(console.error);

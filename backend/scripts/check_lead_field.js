const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  for (const col of ['BT_TL_CONNECT JAN 26', 'BT_TL_CONNECT FEB 26', 'BT_TL_CONNECT MARCH']) {
    const sample = await db.collection(col).findOne({});
    console.log(`\n${col} sample:`, {
      lead: sample?.lead,
      tlName: sample?.tlName,
      partnerName: sample?.partnerName,
      merchantNumber: sample?.merchantNumber,
      stage3: sample?.stage3
    });

    // Check distinct lead names
    const leads = await db.collection(col).distinct('lead');
    console.log(`Distinct leads (first 10):`, leads.slice(0, 10));

    // Check if any FSE names match
    const fseMatch = await db.collection(col).find({
      lead: { $regex: /amit|faisal|narendra|niteesh|ravinder|rohit/i }
    }).limit(3).toArray();
    console.log(`FSE name matches:`, fseMatch.length, fseMatch.map(d => d.lead));
  }

  await mongoose.connection.close();
}
run().catch(console.error);

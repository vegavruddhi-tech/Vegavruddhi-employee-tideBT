const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function run() {
  await mongoose.connect(process.env.MONGO_URI, { dbName: 'CompanyDB' });
  const db = mongoose.connection.db;

  const total = await db.collection('TideBT Form Responses').countDocuments();
  console.log('Total in TideBT Form Responses:', total);

  const names = await db.collection('TideBT Form Responses').distinct('employeeName');
  console.log('Distinct employeeNames:', names.slice(0, 20));

  // Niteesh check
  const niteesh = await db.collection('TideBT Form Responses')
    .countDocuments({ employeeName: /niteesh/i });
  console.log('\nNiteesh records:', niteesh);

  // Sample record
  const sample = await db.collection('TideBT Form Responses').findOne({});
  if (sample) {
    console.log('\nSample record fields:', Object.keys(sample));
    console.log('Sample:', JSON.stringify({
      employeeName: sample.employeeName,
      merchantName: sample.merchantName,
      merchantNumber: sample.merchantNumber,
      formType: sample.formType,
      createdAt: sample.createdAt
    }));
  }

  await mongoose.connection.close();
}
run().catch(e => { console.error(e); process.exit(1); });

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function run() {
  await mongoose.connect(process.env.MONGO_URI, { dbName: 'CompanyDB' });
  const db = mongoose.connection.db;

  // List all collections
  const collections = await db.listCollections().toArray();
  console.log('=== All Collections ===');
  collections.forEach(c => console.log(' -', c.name));

  // Check TideBT Form Responses
  const formCount = await db.collection('TideBT Form Responses').countDocuments();
  console.log(`\nTideBT Form Responses total: ${formCount}`);

  // Sample forms — what formTypes exist?
  const types = await db.collection('TideBT Form Responses').distinct('formType');
  console.log('formType values:', types);

  // Sample daily-visit form
  const sample = await db.collection('TideBT Form Responses').findOne({ formType: 'daily-visit' });
  console.log('\nSample daily-visit record (all fields):');
  console.log(JSON.stringify(sample, null, 2));

  // Check for "Sujeet Saroj" forms specifically (FSE shown in screenshot)
  const sujeetForms = await db.collection('TideBT Form Responses')
    .find({ employeeName: /sujeet/i, formType: 'daily-visit' })
    .limit(3).toArray();
  console.log(`\nSujeet Saroj daily-visit forms: ${sujeetForms.length}`);
  sujeetForms.forEach(f => console.log(JSON.stringify({
    employeeName: f.employeeName, merchantName: f.merchantName,
    merchantNumber: f.merchantNumber, merchantOpinion: f.merchantOpinion,
    onboardingStatus: f.onboardingStatus, merchantCategory: f.merchantCategory,
    submittedBy: f.submittedBy, employeeEmail: f.employeeEmail, createdAt: f.createdAt
  })));

  // Check if there's a separate Merchants collection
  const merchantCollections = collections.filter(c =>
    c.name.toLowerCase().includes('merchant') || c.name.toLowerCase().includes('tide')
  );
  console.log('\nMerchant/Tide related collections:', merchantCollections.map(c => c.name));

  // Check if TideBT_Merchants exists
  for (const col of merchantCollections) {
    const count = await db.collection(col.name).countDocuments();
    console.log(`  ${col.name}: ${count} documents`);
    if (count > 0) {
      const s = await db.collection(col.name).findOne();
      console.log('  Sample:', JSON.stringify(s, null, 2));
    }
  }

  await mongoose.connection.close();
}
run().catch(e => { console.error(e); process.exit(1); });

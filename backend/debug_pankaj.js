const mongoose = require('mongoose');
require('dotenv').config({ path: 'c:\\VegaProject\\Vegavruddhi-employee-tideBT\\backend\\.env' });

async function run() {
  await mongoose.connect(process.env.MONGO_URI, { dbName: 'CompanyDB' });
  const db = mongoose.connection.db;
  
  // Find ALL users with "pankaj" in name
  const pankajUsers = await db.collection('Users').find({ newJoinerName: /pankaj/i }).toArray();
  console.log('All pankaj users:');
  pankajUsers.forEach(u => console.log(JSON.stringify({ _id: u._id, newJoinerName: u.newJoinerName, email: u.email, approvalStatus: u.approvalStatus })));
  
  // TideBT Form Responses for pankajmhi90@gmail.com
  const formsByEmail = await db.collection('TideBT Form Responses').countDocuments({ employeeEmail: 'pankajmhi90@gmail.com' });
  console.log('\nForms with pankajmhi90@gmail.com:', formsByEmail);
  
  // Now check tidebt-my-forms query exactly as it runs:
  // find({ $or: [ {submittedBy: _id}, {employeeEmail: regex} ] })
  // Find the user whose email is pankajmhi90
  const pankajByEmail = await db.collection('Users').findOne({ email: /pankajmhi90/i });
  console.log('\nUser with pankajmhi90 email:', JSON.stringify({ _id: pankajByEmail?._id, newJoinerName: pankajByEmail?.newJoinerName, email: pankajByEmail?.email }));
  
  // Test the exact regex used in tidebt-my-forms
  if (pankajByEmail) {
    const email = pankajByEmail.email.trim();
    const regex = new RegExp(`^${email}$`, 'i');
    const matchCount = await db.collection('TideBT Form Responses').countDocuments({ employeeEmail: { $regex: regex } });
    console.log(`Forms matching regex ^${email}$ :`, matchCount);
  }
  
  // Check TideBT Form Responses — what is TideBTFormResponse model's collection name?
  // The Mongoose model uses collection 'TideBT Form Responses' — but is the query hitting right collection?
  // Also check tidebt_form_responses (lowercase)
  const appForms = await db.collection('tidebt_form_responses').find({ employeeName: /pankaj/i }).toArray();
  console.log('\ntidebt_form_responses for pankaj:', appForms.length);
  
  await mongoose.connection.close();
}
run().catch(console.error);

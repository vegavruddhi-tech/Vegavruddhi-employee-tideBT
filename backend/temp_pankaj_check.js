const mongoose = require('mongoose');
require('dotenv').config({ path: 'c:\\VegaProject\\Vegavruddhi-employee-tideBT\\backend\\.env' });

async function run() {
  await mongoose.connect(process.env.MONGO_URI, { dbName: 'CompanyDB' });
  const db = mongoose.connection.db;
  
  // Check Users collection for Pankaj Kumar
  const user = await db.collection('Users').findOne({ newJoinerName: /^pankaj kumar/i });
  console.log('User account:', JSON.stringify({ _id: user?._id, newJoinerName: user?.newJoinerName, email: user?.email, newJoinerPhone: user?.newJoinerPhone }));
  
  // Check what exact names exist for Pankaj in TideBT Form Responses
  const pankajForms = await db.collection('TideBT Form Responses')
    .find({ employeeName: /pankaj/i }).limit(3).toArray();
  console.log('\nPankaj in TideBT Form Responses:');
  pankajForms.forEach(f => console.log(JSON.stringify({ employeeName: f.employeeName, employeeEmail: f.employeeEmail, merchantName: f.merchantName, merchantNumber: f.merchantNumber, formType: f.formType })));
  
  // Check if Pankaj Kumar email matches employeeEmail in forms
  if (user?.email) {
    const byEmail = await db.collection('TideBT Form Responses')
      .countDocuments({ employeeEmail: { $regex: new RegExp(`^${user.email}$`, 'i') } });
    console.log('\nForms by email:', byEmail);
  }
  
  // Check TideBT_Access for Pankaj
  const access = await db.collection('TideBT_Access').findOne({ fseName: /^pankaj kumar/i });
  console.log('\nTideBT_Access fseName:', access ? access.fseName : 'NOT FOUND');
  
  await mongoose.connection.close();
}
run().catch(console.error);

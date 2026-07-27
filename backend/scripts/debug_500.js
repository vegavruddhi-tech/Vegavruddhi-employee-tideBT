const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const empName  = 'Sujeet Saroj';
  const empEmail = 'sujeetsaroj2025@gmail.com';
  const escape   = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const selectedMonth = 'June';
  const selectedYear  = '2026';

  console.log('=== Step 1: bt_master lookup ===');
  const masterDocs = await db.collection('bt_master').find({
    $or: [
      { fseEmail: { $regex: new RegExp(`^${escape(empEmail)}$`, 'i') } },
      { fseName:  { $regex: new RegExp(`^\\s*${escape(empName)}\\s*\\d*\\s*$`, 'i') } }
    ]
  }).toArray();
  console.log('bt_master docs found:', masterDocs.length);

  if (masterDocs.length === 0) {
    console.log('No merchants in bt_master for this FSE.');
    await mongoose.connection.close(); return;
  }

  const merchantNumbers = masterDocs.map(m => (m.merchantNumber || '').trim()).filter(Boolean);
  console.log('Merchant numbers sample:', merchantNumbers.slice(0, 5));

  console.log('\n=== Step 2: findConnectCollection ===');
  const allCollections = (await db.listCollections().toArray()).map(c => c.name);
  const btCols = allCollections.filter(c => c.toUpperCase().startsWith('BT_TL_CONNECT'));
  const tlCols = allCollections.filter(c => c.toUpperCase().includes('TL_CONNECT') && !c.toUpperCase().startsWith('BT_TL_CONNECT'));
  const candidates = [...btCols, ...tlCols];
  const mu = selectedMonth.toUpperCase();
  const yr = selectedYear; const sy = yr.slice(-2);
  let colName = candidates.find(c => { const cu = c.toUpperCase(); return cu.includes(mu) && (cu.includes(yr) || cu.includes(sy)); });
  if (!colName) colName = candidates.find(c => c.toUpperCase().includes(mu));
  console.log('BT collection resolved to:', colName);

  if (colName) {
    const btDocs = await db.collection(colName).find({ merchantNumber: { $in: merchantNumbers } }).toArray();
    console.log('BT docs matched:', btDocs.length);
    if (btDocs.length > 0) console.log('Sample BT doc keys:', Object.keys(btDocs[0]));
  }

  console.log('\n=== Step 3: Form Response queries (Promise.all) ===');
  try {
    const [sheetForms, appForms, mobikwikForms] = await Promise.all([
      db.collection('TideBT Form Responses').find({
        $or: [
          { employeeEmail: { $regex: new RegExp(`^${escape(empEmail)}$`, 'i') } },
          { employeeName:  { $regex: new RegExp(`^\\s*${escape(empName)}\\s*\\d*\\s*$`, 'i') } }
        ],
        merchantNumber: { $in: merchantNumbers }
      }).sort({ createdAt: -1 }).toArray(),

      db.collection('tidebt_form_responses').find({
        $or: [
          { employeeEmail: { $regex: new RegExp(`^${escape(empEmail)}$`, 'i') } }
        ],
        formType: 'daily-visit',
        merchantNumber: { $in: merchantNumbers }
      }).sort({ createdAt: -1 }).toArray(),

      db.collection('TideBT_Mobikwik').find({
        $or: [
          { employeeEmail: { $regex: new RegExp(`^${escape(empEmail)}$`, 'i') } },
          { employeeName:  { $regex: new RegExp(`^\\s*${escape(empName)}\\s*\\d*\\s*$`, 'i') } }
        ],
        merchantNumber: { $in: merchantNumbers }
      }).sort({ createdAt: -1 }).toArray()
    ]);
    console.log('sheetForms:', sheetForms.length, '| appForms:', appForms.length, '| mobikwikForms:', mobikwikForms.length);
  } catch (e) {
    console.error('PROMISE.ALL CRASH:', e.message);
    console.error(e.stack);
  }

  await mongoose.connection.close();
  console.log('\nDone.');
}

run().catch(e => console.error('TOP LEVEL CRASH:', e.message, '\n', e.stack));

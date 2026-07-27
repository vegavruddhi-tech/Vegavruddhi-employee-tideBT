const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const selectedMonth = 'January';
  const selectedYear = '2026';

  const allCollections = (await db.listCollections().toArray()).map(c => c.name);
  const monthUpper = selectedMonth.toUpperCase();
  const yearStr = selectedYear;
  const shortYear = yearStr.slice(-2);

  const MONTH_ABBR = {
    'JANUARY': 'JAN', 'FEBRUARY': 'FEB', 'MARCH': 'MAR', 'APRIL': 'APR',
    'MAY': 'MAY', 'JUNE': 'JUN', 'JULY': 'JUL', 'AUGUST': 'AUG',
    'SEPTEMBER': 'SEP', 'OCTOBER': 'OCT', 'NOVEMBER': 'NOV', 'DECEMBER': 'DEC'
  };
  const monthAbbr = MONTH_ABBR[monthUpper] || monthUpper;
  console.log('Looking for month:', monthUpper, 'or abbr:', monthAbbr);

  const btCollections = allCollections.filter(c => c.toUpperCase().startsWith('BT_TL_CONNECT'));
  console.log('BT_TL_CONNECT collections:', btCollections);

  const matchesMonth = (cu) => cu.includes(monthUpper) || cu.includes(monthAbbr);

  const match = btCollections.find(c => {
    const cu = c.toUpperCase();
    return matchesMonth(cu) && (cu.includes(yearStr) || cu.includes(shortYear));
  }) || btCollections.find(c => matchesMonth(c.toUpperCase()));

  console.log('Matched collection:', match);

  if (match) {
    const count = await db.collection(match).countDocuments();
    console.log('Docs in collection:', count);
    
    // Check Sujeet's merchants
    const masterDocs = await db.collection('bt_master').find({
      fseName: { $regex: /sujeet/i }
    }).project({ merchantNumber: 1 }).toArray();
    const nums = masterDocs.map(m => m.merchantNumber).filter(Boolean);
    console.log('Sujeet merchant numbers:', nums);
    
    const btDocs = await db.collection(match).find({ merchantNumber: { $in: nums } }).toArray();
    console.log('BT docs for Sujeet in Jan:', btDocs.length);
    if (btDocs[0]) console.log('Sample:', { merchantNumber: btDocs[0].merchantNumber, stage3: btDocs[0].stage3 });
  }

  await mongoose.connection.close();
}
run().catch(console.error);

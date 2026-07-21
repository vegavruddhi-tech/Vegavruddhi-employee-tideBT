const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { OAuth2Client } = require('google-auth-library');
const Employee = require('../models/Employee');
const TideBTFormResponse = require('../models/TideBTFormResponse');
const verifyToken = require('../middleware/auth');
const { cacheGet, cacheSet, cacheKey, cacheInvalidatePattern } = require('../utils/cache');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Helper to find the connect collection dynamically based on selectedMonth and selectedYear
const findConnectCollection = async (db, selectedMonth, selectedYear) => {
  if (!selectedMonth) return null;

  const allCollections = (await db.listCollections().toArray()).map(c => c.name);
  const mu = selectedMonth.toUpperCase();
  const MONTH_ABBR = {
    'JANUARY': 'JAN', 'FEBRUARY': 'FEB', 'MARCH': 'MAR', 'APRIL': 'APR',
    'MAY': 'MAY', 'JUNE': 'JUN', 'JULY': 'JUL', 'AUGUST': 'AUG',
    'SEPTEMBER': 'SEP', 'OCTOBER': 'OCT', 'NOVEMBER': 'NOV', 'DECEMBER': 'DEC'
  };
  const abbr = MONTH_ABBR[mu] || mu;

  // Try canonical hardcoded format first: "BT_TL_CONNECT JULY"
  const canonical = `BT_TL_CONNECT ${mu}`;
  if (allCollections.includes(canonical)) return canonical;

  // Try abbreviation: "BT_TL_CONNECT JUL"
  const canonicalAbbr = `BT_TL_CONNECT ${abbr}`;
  if (allCollections.includes(canonicalAbbr)) return canonicalAbbr;

  // Fallback: any BT_TL_CONNECT collection that matches the month
  const btCols = allCollections.filter(c => c.toUpperCase().startsWith('BT_TL_CONNECT'));
  return btCols.find(c => { const cu = c.toUpperCase(); return cu.includes(mu) || cu.includes(abbr); }) || null;
};

// Helper to normalize the dynamic document format
const normalizeConnectDoc = (r) => {
  if (!r) return null;

  const getVal = (keys) => {
    for (const k of keys) {
      if (r[k] !== undefined && r[k] !== null) return r[k];
    }
    return undefined;
  };

  const parseNum = (val) => {
    if (val === undefined || val === null || val === '–' || val === '-') return 0;
    if (typeof val === 'number') return val;
    const clean = String(val).replace(/,/g, '').trim();
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  };

  const getStr = (keys, fallback = '–') => {
    const val = getVal(keys);
    if (val === undefined || val === null) return fallback;
    return String(val).trim() || fallback;
  };

  const stage3    = parseNum(getVal(['stage3', 'stage_3', 'Stage-3', 'Stage_3']));
  const stage3Gap = parseNum(getVal(['stage3Gap', 'stage_3_gap', 'Stage-3_GAP', 'Stage_3_GAP', 'stage3_gap']));
  const todaysStage3 = parseNum(getVal(['todaysStage3', 'today_s_stage_3', "Today's_Stage-3", "Today's_Stage_3", 'todaysStage_3', 'today_s_stage3']));
  const yesterdaysStage3 = parseNum(getVal(['yesterdaysStage3', 'yesterday_s_stage_3', "Yesterday's_Stage-3", "Yesterday's_Stage_3", 'yesterdaysStage_3', 'yesterday_s_stage3']));
  
  const upiActive = getStr(['upiActive', 'upi_active', 'UPI_Active']);
  const upiGap    = getStr(['upiGap', 'upi_gap', 'UPI_Gap']);
  const upiTxnCount = parseNum(getVal(['upiTxnCount', 'upi_txn_count', 'Upi_Txn_Count', 'upi_txns', 'upiTxns']));
  
  const passLive = getStr(['passLive', 'pass_live', 'Pass_Live']);
  const rewardPassPro = getStr(['rewardPassPro', 'reward_pass_pro', 'Reward_Pass_Pro', 'priorityPassPro', 'priority_pass_pro', 'priorityPass', 'priority_pass']);
  const rewardsPassProActiveDate = getStr(['rewardsPassProActiveDate', 'rewards_pass_pro_active_date', 'Rewards_Pass_Pro_Active_Date', 'priority_pass_active_date', 'priority_pass_pro_active_date']);
  
  const withdrawAmount = parseNum(getVal(['withdrawAmount', 'withdraw_amount', 'UPI_Amount', 'upi_amount', 'upiAmount']));

  return {
    merchantNumber: r.merchantNumber || r.Number || r.mobile_no_ || r.phone || r.Mobile_No_ || '',
    lead: r.lead || r.Lead || '–',
    stage3,
    stage3Gap,
    todaysStage3,
    yesterdaysStage3,
    upiActive,
    upiGap,
    upiTxnCount,
    passLive,
    rewardPassPro,
    rewardsPassProActiveDate,
    withdrawAmount,
    priorityPassStatus: getStr(['priorityPassStatus', 'Priority_Pass_Status', 'priority_pass_status']),
    msmegstStatus: getStr(['msmegstStatus', 'MSME/GST_Status', 'msmegst_status', 'MSME_GST_Status']),
    insuranceStatus: getStr(['insuranceStatus', 'Insurance_Status', 'insurance_status']),
    createdAt: r.createdAt || r._synced_at || r._syncedAt || null
  };
};

// POST /api/auth/google-login
router.post('/google-login', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ message: 'Google credential required' });

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const googleEmail = payload.email.toLowerCase();

    const employee = await Employee.findOne({
      $or: [
        { email: { $regex: new RegExp(`^${googleEmail}$`, 'i') } },
        { newJoinerEmailId: { $regex: new RegExp(`^${googleEmail}$`, 'i') } }
      ]
    });

    if (!employee) {
      return res.status(404).json({
        message: 'No registered employee found with this Google account.'
      });
    }

    if (employee.approvalStatus !== 'approved') {
      return res.status(403).json({ message: 'Your account is not approved yet.' });
    }

    const token = jwt.sign(
      { id: employee._id, email: employee.email },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    // ── Mark Attendance for TideBT Employee ───────────────────────────────
    try {
      const db = mongoose.connection.db;
      const now = new Date();
      const istTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      const today = istTime.toISOString().split('T')[0];

      const existing = await db.collection('Attendance').findOne({ userId: employee._id, date: today });

      // Look up fseName from TideBT_Access — use this for userName in attendance
      // so attendance page can match by TideBT_Access.fseName correctly
      const accessRecord = await db.collection('TideBT_Access').findOne({
        $or: [
          { fseName: { $regex: new RegExp(`^\\s*${employee.newJoinerName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i') } },
          { fseEmail: { $regex: new RegExp(`^${(employee.email||'').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } }
        ]
      });
      // Use fseName from TideBT_Access if available (handles name mismatches like FASHAL ALI → Faisal Khan)
      const attendanceName = accessRecord?.fseName?.trim() || employee.newJoinerName.trim();

      if (!existing) {
        await db.collection('Attendance').insertOne({
          userId: employee._id,
          userEmail: employee.email,
          userName: attendanceName,
          userType: 'employee',
          date: today,
          firstLoginTime: now,
          lastActivityTime: now,
          attendanceMarked: true,
          reloginCount: 0,
          status: 'present',
          source: 'tidebt-employee',
          createdAt: now,
        });
        console.log(`✅ Attendance marked (TideBT FSE): ${employee.email} as "${attendanceName}"`);
      } else {
        await db.collection('Attendance').updateOne(
          { userId: employee._id, date: today },
          { $set: { lastActivityTime: now, lastLogoutTime: null, duration: null, userName: attendanceName }, $inc: { reloginCount: 1 } }
        );
        console.log(`✅ Re-login (TideBT FSE): ${employee.email}`);
      }
    } catch (attErr) {
      console.error('Attendance marking error (FSE):', attErr.message);
    }
    // ──────────────────────────────────────────────────────────────────────

    res.json({ token, user: employee });
  } catch (err) {
    console.error('Google login error:', err.message);
    res.status(401).json({ message: 'Google sign-in failed.', error: err.message });
  }
});

// GET /api/auth/profile
router.get('/profile', verifyToken, async (req, res) => {
  try {
    const employee = await Employee.findById(req.user.id).select('-password');
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    res.json(employee);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/auth/check-tidebt-access
router.get('/check-tidebt-access', verifyToken, async (req, res) => {
  try {
    const employee = await Employee.findById(req.user.id).select('newJoinerName email newJoinerEmailId');
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const db = mongoose.connection.db;
    const TideBTAccess = db.collection('TideBT_Access');
    const employeeName = employee.newJoinerName.trim();
    const employeeEmail = (employee.email || employee.newJoinerEmailId || '').trim().toLowerCase();
    const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Match by name OR by email stored in TideBT_Access
    const accessRecord = await TideBTAccess.findOne({
      hasTideBTAccess: true,
      $or: [
        { fseName: { $regex: new RegExp(`^\\s*${escape(employeeName)}\\s*$`, 'i') } },
        { fseEmail: { $regex: new RegExp(`^\\s*${escape(employeeEmail)}\\s*$`, 'i') } }
      ]
    });

    if (accessRecord) {
      return res.json({ hasTideBTAccess: true, record: accessRecord });
    }

    res.json({ hasTideBTAccess: false });
  } catch (err) {
    console.error('Check TideBT access error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/tidebt-daily-visit
router.post('/tidebt-daily-visit', verifyToken, async (req, res) => {
  try {
    const employee = await Employee.findById(req.user.id).select('newJoinerName email');
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const {
      merchantName,
      merchantNumber,
      merchantOpinion,
      merchantCategory,
      onboardingStatus,
      merchantEmailId
    } = req.body;

    if (!/^\d{10}$/.test(merchantNumber)) {
      return res.status(400).json({ message: 'Merchant Mobile Number must be exactly 10 digits.' });
    }

    const formResponse = await TideBTFormResponse.create({
      submittedBy: employee._id,
      employeeName: employee.newJoinerName,
      employeeEmail: employee.email,
      formType: 'daily-visit',
      merchantName,
      merchantNumber,
      merchantOpinion,
      merchantCategory,
      onboardingStatus,
      merchantEmailId
    });

    // ── Bust this employee's merchant cache (new visit = data changed) ────
    const { cacheInvalidatePattern, cacheKey } = require('../utils/cache');
    await cacheInvalidatePattern(`EMP_MERCHANTS:${employee.newJoinerName.trim().replace(/\s+/g,'_').toUpperCase()}:*`);

    // ── Auto-add to bt_master if merchant not already there ───────────────
    try {
      const db = mongoose.connection.db;
      const existing = await db.collection('bt_master').findOne({ merchantNumber });
      if (!existing && merchantNumber) {
        // Get TL name from TideBT_Access for this FSE
        const accessRecord = await db.collection('TideBT_Access').findOne({
          fseName: { $regex: new RegExp(`^\\s*${employee.newJoinerName.trim()}\\s*$`, 'i') }
        });
        await db.collection('bt_master').insertOne({
          merchantNumber,
          merchantName:  merchantName  || '',
          merchantEmail: merchantEmailId || '',
          fseName:       employee.newJoinerName,
          fseEmail:      employee.email,
          tl:            accessRecord?.tlName || '',
          _syncedAt:     new Date(),
          _source:       'tidebt-form-auto'
        });
        console.log(`✅ Auto-added to bt_master: ${merchantNumber} for FSE ${employee.newJoinerName}`);
      }
    } catch (btErr) {
      console.error('bt_master auto-insert error (non-fatal):', btErr.message);
    }
    // ─────────────────────────────────────────────────────────────────────

    res.status(201).json({ message: 'Daily visit form submitted', form: formResponse });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/auth/tidebt-my-forms
router.get('/tidebt-my-forms', verifyToken, async (req, res) => {
  try {
    const employee = await Employee.findById(req.user.id).select('email newJoinerName');
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const ck = cacheKey('EMP_MY_FORMS', employee._id.toString());
    const cached = await cacheGet(ck);
    if (cached) return res.json(cached);

    const db = mongoose.connection.db;
    const empName  = employee.newJoinerName.trim();
    const empEmail = employee.email.trim();
    const escape   = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Build all name/email variations for this FSE:
    //   1. User's own email from Users collection
    //   2. fseName from TideBT_Access (exact name used when form data was synced from sheet)
    //   3. Name with optional trailing digits (e.g. "Pankaj Kumar" → "Pankaj Kumar1")
    const emailSet = new Set([empEmail]);
    const nameSet  = new Set([empName]);

    // Get fseName from TideBT_Access
    const accessRecord = await db.collection('TideBT_Access').findOne({
      fseName: { $regex: new RegExp(`^\\s*${escape(empName)}\\s*$`, 'i') }
    });
    if (accessRecord?.fseName) nameSet.add(accessRecord.fseName.trim());

    const nameArray  = [...nameSet];
    const emailArray = [...emailSet];

    const onboardForms = await TideBTFormResponse.find({
      $or: [
        { submittedBy: employee._id },
        ...emailArray.map(e => ({ employeeEmail: { $regex: new RegExp(`^${escape(e)}$`, 'i') } })),
        // Name match with optional trailing digits/spaces (handles "Pankaj Kumar1", "Rohit Kr", etc.)
        ...nameArray.map(n => ({ employeeName: { $regex: new RegExp(`^\\s*${escape(n)}\\s*\\d*\\s*$`, 'i') } }))
      ]
    }).lean();

    const mobikwikForms = await db.collection('TideBT_Mobikwik').find({
      $or: [
        { submittedBy: employee._id },
        ...emailArray.map(e => ({ employeeEmail: { $regex: new RegExp(`^${escape(e)}$`, 'i') } })),
        ...nameArray.map(n => ({ employeeName: { $regex: new RegExp(`^\\s*${escape(n)}\\s*\\d*\\s*$`, 'i') } }))
      ]
    }).toArray();

    const allForms = [...onboardForms, ...mobikwikForms].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const result = allForms;
    await cacheSet(ck, result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/auth/tidebt-received-payments
router.get('/tidebt-received-payments', verifyToken, async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  try {
    const employee = await Employee.findById(req.user.id).select('newJoinerName email newJoinerEmailId');
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const ck = cacheKey('EMP_PAYMENTS', employee._id.toString());
    const cached = await cacheGet(ck);
    if (cached) return res.json(cached);

    const db = mongoose.connection.db;
    const TideBTPayments = db.collection('TideBT_Payments');
    const empName = employee.newJoinerName.trim();
    const empEmail = (employee.email || employee.newJoinerEmailId || '').trim();

    const nameSet = new Set([empName]);

    // Look up TideBT_Access by email first (handles name mismatches like FASHAL ALI → Faisal Khan)
    if (empEmail) {
      const accessByEmail = await db.collection('TideBT_Access').find({
        fseEmail: { $regex: new RegExp(`^${empEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      }).toArray();
      accessByEmail.forEach(r => { if (r.fseName) nameSet.add(r.fseName.trim()); });
    }

    // Also try first word name match in TideBT_Access — ONLY if email lookup found nothing
    // Use exact word-boundary match to avoid "Vikki" matching "Vikki Kumar"
    if (nameSet.size <= 1) {
      const escape2 = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const accessRecords = await db.collection('TideBT_Access').find({
        fseName: { $regex: new RegExp(`^\\s*${escape2(empName)}\\s*$`, 'i') }
      }).toArray();
      accessRecords.forEach(r => { if (r.fseName) nameSet.add(r.fseName.trim()); });
    }

    if (empEmail) {
      const adminEmp = await db.collection('Employees').findOne({
        $or: [
          { email: { $regex: new RegExp(`^${empEmail}$`, 'i') } },
          { newJoinerEmailId: { $regex: new RegExp(`^${empEmail}$`, 'i') } }
        ]
      });
      if (adminEmp?.newJoinerName) nameSet.add(adminEmp.newJoinerName.trim());
    }

    const nameArray = [...nameSet];
    const escapeN = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const payments = await TideBTPayments.find({
      $and: [
        {
          // Exact boundary match — "Vikki" should not match "Vikki Kumar"
          $or: nameArray.map(n => ({
            transferTo: { $regex: new RegExp(`^\\s*${escapeN(n)}\\s*$`, 'i') }
          }))
        },
        // Only count FSE Ground Team type payments — same as admin panel
        { transferToWhom: "FSE Ground Team" }
      ]
    }).sort({ createdAt: -1 }).toArray();

    console.log(`[FSE Payments] FSE: "${empName}", names searched: ${JSON.stringify(nameArray)}, found: ${payments.length}`);

    const normalizedPayments = payments.map(p => ({
      ...p,
      createdAt: p.createdAt || null
    }));

    const result = normalizedPayments;
    await cacheSet(ck, result);
    res.json(result);
  } catch (err) {
    console.error('Received payments error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/tidebt-mobikwik-withdraw
router.post('/tidebt-mobikwik-withdraw', verifyToken, async (req, res) => {
  try {
    const employee = await Employee.findById(req.user.id).select('newJoinerName email');
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const {
      merchantName,
      merchantNumber,
      transactionDate,
      withdrawAmount,
      withdrawFees,
      reasonOfWithdraw
    } = req.body;

    if (!/^\d{10}$/.test(merchantNumber)) {
      return res.status(400).json({ message: 'Merchant Mobile Number must be exactly 10 digits.' });
    }

    const db = mongoose.connection.db;
    const doc = {
      submittedBy: employee._id,
      employeeName: employee.newJoinerName,
      employeeEmail: employee.email,
      formType: 'mobikwik-withdraw',
      merchantName,
      merchantNumber,
      transactionDate: transactionDate ? new Date(transactionDate) : null,
      withdrawAmount: parseFloat(withdrawAmount) || 0,
      withdrawFees: parseFloat(withdrawFees) || 0,
      reasonOfWithdraw,
      createdAt: new Date()
    };

    await db.collection('TideBT_Mobikwik').insertOne(doc);

    res.status(201).json({ message: 'Mobikwik withdraw form submitted', form: doc });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/auto-logout
router.post('/auto-logout', verifyToken, async (req, res) => {
  res.json({ success: true, message: 'Auto logged out successfully' });
});

// POST /api/auth/tidebt-reward-pass
router.post('/tidebt-reward-pass', verifyToken, async (req, res) => {
  try {
    const employee = await Employee.findById(req.user.id).select('newJoinerName email');
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const { dateOfWorking, workingUpdate, totalBTAmount, totalRPCount } = req.body;
    if (!dateOfWorking || !workingUpdate || !totalBTAmount || !totalRPCount) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const db = mongoose.connection.db;
    await db.collection('TideBT_RewardPass').insertOne({
      employeeName: employee.newJoinerName,
      employeeEmail: employee.email,
      employeeId: employee._id,
      role: 'FSE',
      dateOfWorking,
      workingUpdate,
      totalBTAmount: parseFloat(totalBTAmount),
      totalRPCount: parseInt(totalRPCount),
      createdAt: new Date()
    });

    res.json({ success: true, message: 'Reward Pass form submitted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/auth/tidebt-my-target
// NOTE: No MongoDB cache here — targets are set by admin/TL on a DIFFERENT backend,
// so cache can never be invalidated from this backend. Always hit DB directly.
router.get('/tidebt-my-target', verifyToken, async (req, res) => {
  // Disable HTTP cache so browser always fetches fresh
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  try {
    const employee = await Employee.findById(req.user.id).select('newJoinerName');
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const { month, year } = req.query;
    const db = mongoose.connection.db;
    const empName = employee.newJoinerName.trim();
    const escape  = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Use word-boundary match so "Sujeet Saroj" doesn't accidentally match "Sujeet Saroj Kumar"
    const query = {
      targetFor: { $regex: new RegExp(`^\\s*${escape(empName)}\\s*$`, 'i') }
    };
    if (month) query.month = month;
    if (year)  query.year  = parseInt(year);

    const targets = await db.collection('TideBT_Targets').find(query).toArray();
    console.log(`[Target] FSE: "${empName}", month: ${month}, year: ${year}, found: ${targets.length}`);

    if (targets.length === 0) {
      return res.json({ success: true, target: null });
    }

    const target = {
      btTarget: targets.reduce((sum, t) => sum + (t.btTarget || 0), 0),
      rpTarget: targets.reduce((sum, t) => sum + (t.rpTarget || 0), 0),
      // Use the most recent target's baseline (for consecutive target periods)
      btBaseline: targets.reduce((sum, t) => sum + (t.btBaseline || 0), 0),
      month:    month || targets[0].month,
      year:     year  || targets[0].year,
      endDate:  targets[0].endDate || null,
      startDate: targets[0].startDate || null,
    };

    res.json({ success: true, target });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/auth/tidebt-team-performance - Get team performance details for FSE
router.get('/tidebt-team-performance', verifyToken, async (req, res) => {
  try {
    const employee = await Employee.findById(req.user.id).select('newJoinerName');
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const { selectedMonth, selectedYear } = req.query;
    const ck = cacheKey('EMP_TEAM_PERF', employee._id.toString(), selectedMonth, selectedYear);
    const cached = await cacheGet(ck);
    if (cached) return res.json(cached);

    const db = mongoose.connection.db;
    const empName = employee.newJoinerName.trim();
    const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // 1. Find the TL of this FSE from TideBT_Access
    const myAccess = await db.collection('TideBT_Access').findOne({
      fseName: { $regex: new RegExp(`^\\s*${escape(empName)}\\s*$`, 'i') }
    });

    if (!myAccess || !myAccess.tlName) {
      const result = { success: true, teamTarget: 0, btCompleted: 0, fseData: [] };
      await cacheSet(ck, result);
      return res.json(result);
    }

    const tlName = myAccess.tlName.trim();

    // 2. Find all FSEs under the same TL
    let accessRecords = await db.collection('TideBT_Access').find({
      tlName: { $regex: new RegExp(`^\\s*${escape(tlName)}\\s*$`, 'i') },
      hasTideBTAccess: true
    }).toArray();
    
    const fseNames = [...new Set(accessRecords.map(r => r.fseName).filter(Boolean))];

    // 3. Fetch TL target (Team Target)
    const tlTargetQuery = {
      targetFor: { $regex: new RegExp(`^\\s*${escape(tlName)}\\s*$`, 'i') }
    };
    if (selectedMonth) tlTargetQuery.month = selectedMonth;
    if (selectedYear) tlTargetQuery.year = parseInt(selectedYear);

    const tlTargets = await db.collection('TideBT_Targets').find(tlTargetQuery).toArray();
    const teamTarget = tlTargets.reduce((sum, t) => sum + (t.btTarget || 0), 0);

    // 4. Fetch FSE targets
    const fseTargetQuery = {
      targetFor: { $in: fseNames.map(name => new RegExp(`^\\s*${escape(name.trim())}\\s*$`, 'i')) }
    };
    if (selectedMonth) fseTargetQuery.month = selectedMonth;
    if (selectedYear) fseTargetQuery.year = parseInt(selectedYear);

    const fseTargetsList = await db.collection('TideBT_Targets').find(fseTargetQuery).toArray();

    // 5. Fetch BT Completed for all FSEs from BT_TL_CONNECT collection for selected month
    const btCollectionName = await findConnectCollection(db, selectedMonth, selectedYear);

    // Get all merchants from bt_master for all FSEs
    const allMasterDocs = fseNames.length > 0 ? await db.collection('bt_master').find({
      $or: fseNames.map(n => ({
        fseName: { $regex: new RegExp(`^\\s*${escape(n)}\\s*\\d*\\s*$`, 'i') }
      }))
    }).toArray() : [];

    // Group merchant numbers by FSE
    const fseMerchantNums = {};
    fseNames.forEach(n => { fseMerchantNums[n] = []; });
    allMasterDocs.forEach(m => {
      const num = (m.merchantNumber || '').trim();
      if (!num) return;
      const matchedFSE = fseNames.find(n =>
        new RegExp(`^\\s*${escape(n)}\\s*\\d*\\s*$`, 'i').test(m.fseName || '')
      );
      if (matchedFSE) fseMerchantNums[matchedFSE].push(num);
    });

    const btLookup = {};
    if (btCollectionName) {
      const allNums = [...new Set(Object.values(fseMerchantNums).flat())];
      if (allNums.length > 0) {
        const btDocs = await db.collection(btCollectionName).find({
          merchantNumber: { $in: allNums }
        }).toArray();
        btDocs.forEach(r => {
          const norm = normalizeConnectDoc(r);
          if (norm) btLookup[norm.merchantNumber.trim()] = norm;
        });
      }
    }

    // Aggregate BT Completed per FSE
    let teamBtCompleted = 0;
    const fseData = fseNames.map(name => {
      const merchantNums = fseMerchantNums[name] || [];
      let usedBT = 0;
      merchantNums.forEach(num => {
        const norm = btLookup[num];
        if (norm) usedBT += norm.stage3 || 0;
      });
      teamBtCompleted += usedBT;

      // target
      const matchTargets = fseTargetsList.filter(t => new RegExp(`^\\s*${escape(name.trim())}\\s*$`, 'i').test(t.targetFor || ''));
      const targetVal = matchTargets.reduce((sum, t) => sum + (t.btTarget || 0), 0);

      return {
        fseName: name,
        btCompleted: usedBT,
        btTarget: targetVal
      };
    });

    const result = {
      success: true,
      teamTarget,
      btCompleted: teamBtCompleted,
      fseData
    };
    await cacheSet(ck, result);
    res.json(result);
  } catch (err) {
    console.error('TideBT team performance error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/auth/tidebt-my-reward-pass

router.get('/tidebt-my-reward-pass', verifyToken, async (req, res) => {
  try {
    const employee = await Employee.findById(req.user.id);
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const ck = cacheKey('EMP_REWARD_PASS', employee._id.toString());
    const cached = await cacheGet(ck);
    if (cached) return res.json(cached);

    const db = mongoose.connection.db;
    const data = await db.collection('TideBT_RewardPass')
      .find({
        $or: [
          { employeeId: employee._id },
          { employeeEmail: { $regex: new RegExp(`^${employee.email.trim()}$`, 'i') } }
        ],
        role: { $ne: 'TL' }
      })
      .sort({ createdAt: -1 })
      .toArray();

    const result = { success: true, data };
    await cacheSet(ck, result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/tidebt-add-expense
router.post('/tidebt-add-expense', verifyToken, async (req, res) => {
  try {
    const employee = await Employee.findById(req.user.id).select('newJoinerName');
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const { amount, purpose, date } = req.body;
    if (!amount || !purpose) return res.status(400).json({ message: 'Amount and purpose are required' });

    const db = mongoose.connection.db;
    await db.collection('TideBT_Expenses').insertOne({
      employeeName: employee.newJoinerName,
      employeeId: employee._id,
      role: 'FSE',
      amount: parseFloat(amount),
      purpose,
      date: date || new Date().toISOString(),
      createdAt: new Date()
    });

    res.json({ success: true, message: 'Expense recorded' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/auth/tidebt-my-expenses
router.get('/tidebt-my-expenses', verifyToken, async (req, res) => {
  try {
    const employee = await Employee.findById(req.user.id).select('newJoinerName');
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const ck = cacheKey('EMP_EXPENSES', employee._id.toString());
    const cached = await cacheGet(ck);
    if (cached) return res.json(cached);

    const db = mongoose.connection.db;
    const expenses = await db.collection('TideBT_Expenses')
      .find({ employeeId: employee._id })
      .sort({ createdAt: -1 })
      .toArray();

    const result = { success: true, expenses };
    await cacheSet(ck, result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/auth/tidebt-my-merchants
// PRIMARY: bt_master (all merchants assigned to this FSE)
// VERIFICATION: BT_TL_CONNECT JUNE/MAY (BT activity, pass status)
// ENRICHMENT: TideBT Form Responses (visit details, onboarding opinion)
router.get('/tidebt-my-merchants', verifyToken, async (req, res) => {
  try {
    const employee = await Employee.findById(req.user.id).select('newJoinerName email');
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const db      = mongoose.connection.db;
    const empName  = employee.newJoinerName.trim();
    const empEmail = employee.email.trim();
    const escape   = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const { selectedMonth, selectedYear } = req.query;

    // ── Cache check ───────────────────────────────────────────────────────
    const { cacheGet, cacheSet, cacheKey } = require('../utils/cache');
    const ck = cacheKey('EMP_MERCHANTS', empName, selectedMonth, selectedYear);
    const cached = await cacheGet(ck);
    if (cached) return res.json(cached);
    // ─────────────────────────────────────────────────────────────────────

    // ── Step 1: Get ALL merchants for this FSE from bt_master ────────────────
    // Match by fseEmail (most reliable) OR fseName (with digit-suffix tolerance)
    const masterDocs = await db.collection('bt_master').find({
      $or: [
        { fseEmail: { $regex: new RegExp(`^${escape(empEmail)}$`, 'i') } },
        { fseName:  { $regex: new RegExp(`^\\s*${escape(empName)}\\s*\\d*\\s*$`, 'i') } }
      ]
    }).toArray();

    if (masterDocs.length === 0) {
      return res.json({ success: true, merchants: [], total: 0, btCollection: null });
    }

    // Build merchant map from bt_master — one entry per merchantNumber
    const merchantMap = {};
    masterDocs.forEach(m => {
      const key = (m.merchantNumber || '').trim();
      if (!key) return;
      merchantMap[key] = {
        merchantNumber:   key,
        merchantName:     (m.merchantName  || '').trim() || '–',
        merchantEmail:    (m.merchantEmail || '').trim(),
        fseName:          (m.fseName       || empName).trim(),
        tl:               (m.tl            || '').trim(),
        // defaults — will be enriched below
        onboardingStatus: 'Pending',
        submissionDate:   null,
        lastActivity:     null,
        visitCount:       0,
        latestOpinion:    '–',
        merchantCategory: '–',
        btVerified:       false,
        stage3:           0,
        stage3Gap:        0,
        passLive:         '–',
        rewardPassPro:    '–',
        upiActive:        '–',
        upiTxnCount:      0,
        upiAmount:        0,
        priorityPassStatus: '–',
        msmegstStatus:    '–',
        insuranceStatus:  '–',
        rewardsPassProActiveDate: '–'
      };
    });

    const merchantNumbers = Object.keys(merchantMap);

    // ── Step 2: Enrich from TideBT Form Responses (visit/onboarding details) ─
    // Sheet-synced + app-submitted + Mobikwik — gives us visit dates, opinions, category
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
          { submittedBy:   employee._id },
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

    [...sheetForms, ...appForms, ...mobikwikForms].forEach(f => {
      const key = (f.merchantNumber || '').trim();
      const m   = merchantMap[key];
      if (!m) return;

      const d = f.createdAt ? new Date(f.createdAt) : null;
      if (d && !isNaN(d)) {
        if (!m.submissionDate || d < new Date(m.submissionDate)) m.submissionDate = f.createdAt;
        if (!m.lastActivity  || d > new Date(m.lastActivity))  {
          m.lastActivity     = f.createdAt;
          m.onboardingStatus = (f.onboardingStatus || f.merchantOpinion || m.onboardingStatus).trim();
          m.merchantCategory = (f.merchantCategory || m.merchantCategory).trim();
          m.latestOpinion    = (f.merchantOpinion  || m.latestOpinion).trim();
        }
      }
      m.visitCount++;
    });

    // ── Step 3: Verify & enrich from BT_TL_CONNECT JUNE/MAY ─────────────────
    const btCollectionName = await findConnectCollection(db, selectedMonth, selectedYear);
    if (btCollectionName) {
      const btDocs = await db.collection(btCollectionName).find({
        merchantNumber: { $in: merchantNumbers }
      }).toArray();

      btDocs.forEach(r => {
        const norm = normalizeConnectDoc(r);
        if (!norm) return;
        const key = norm.merchantNumber.trim();
        const m   = merchantMap[key];
        if (!m) return;

        m.stage3                  = norm.stage3;
        m.stage3Gap               = norm.stage3Gap;
        m.passLive                = norm.passLive;
        m.rewardPassPro           = norm.rewardPassPro;
        m.upiActive               = norm.upiActive;
        m.upiTxnCount             = norm.upiTxnCount;
        m.upiAmount               = norm.withdrawAmount || 0;
        m.priorityPassStatus      = norm.priorityPassStatus;
        m.msmegstStatus           = norm.msmegstStatus;
        m.insuranceStatus         = norm.insuranceStatus;
        m.rewardsPassProActiveDate = norm.rewardsPassProActiveDate;

        const isLive   = norm.passLive.toLowerCase()      === 'live';
        const isActive = norm.rewardPassPro.toLowerCase() === 'active';
        m.btVerified = isLive || isActive || norm.stage3 > 0;

        if (isLive || isActive) m.onboardingStatus = 'Onboarded';
        else if (norm.stage3 > 0) m.onboardingStatus = 'BT Active';
      });
    }

    // Sort: merchants with activity first, then by name
    const merchants = Object.values(merchantMap).sort((a, b) => {
      if (a.lastActivity && b.lastActivity) return new Date(b.lastActivity) - new Date(a.lastActivity);
      if (a.lastActivity) return -1;
      if (b.lastActivity) return 1;
      return (a.merchantName || '').localeCompare(b.merchantName || '');
    });

    const result = { success: true, merchants, total: merchants.length, btCollection: btCollectionName };
    await cacheSet(ck, result); // permanent — cleared when new form submitted or data synced
    res.json(result);
  } catch (err) {
    console.error('My merchants error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/auth/tidebt-bt-performance
router.get('/tidebt-bt-performance', verifyToken, async (req, res) => {
  try {
    const employee = await Employee.findById(req.user.id).select('newJoinerName email');
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const { selectedMonth, selectedYear } = req.query;
    const ck = cacheKey('EMP_BT_PERF', employee._id.toString(), selectedMonth, selectedYear);
    const cached = await cacheGet(ck);
    if (cached) return res.json(cached);

    const db       = mongoose.connection.db;
    const empEmail = employee.email.trim();
    const empName  = employee.newJoinerName.trim();
    const escape   = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const collectionName = await findConnectCollection(db, selectedMonth, selectedYear);

    if (!collectionName) {
      const result = {
        success: true, btAmount: 0, btGap: 0, todaysBT: 0, yesterdaysBT: 0,
        upiAmount: 0, upiGap: 0, upiTxnCount: 0,
        rewardPassCount: 0, passLiveCount: 0, totalMerchants: 0,
        merchants: [], collectionUsed: null
      };
      await cacheSet(ck, result);
      return res.json(result);
    }

    // Get merchant numbers from bt_master + TideBT Form Responses
    // Same sources as TL portal — bt_master with first-word fallback + form responses
    const firstWord = empName.split(' ')[0];
    const masterDocs = await db.collection('bt_master').find({
      $or: [
        { fseEmail: { $regex: new RegExp(`^${escape(empEmail)}$`, 'i') } },
        { fseName:  { $regex: new RegExp(`^\\s*${escape(empName)}\\s*\\d*\\s*$`, 'i') } },
        ...(firstWord !== empName ? [{ fseName: { $regex: new RegExp(`^\\s*${escape(firstWord)}\\s*\\d*\\s*$`, 'i') } }] : [])
      ]
    }).project({ merchantNumber: 1 }).toArray();

    // Also include TideBT Form Responses merchants (same as TL portal)
    const formDocs = await db.collection('TideBT Form Responses').find({
      $or: [
        { employeeEmail: { $regex: new RegExp(`^${escape(empEmail)}$`, 'i') } },
        { employeeName:  { $regex: new RegExp(`^\\s*${escape(empName)}\\s*\\d*\\s*$`, 'i') } },
        ...(firstWord !== empName ? [{ employeeName: { $regex: new RegExp(`^\\s*${escape(firstWord)}\\s*\\d*\\s*$`, 'i') } }] : [])
      ],
      merchantNumber: { $exists: true, $ne: '' }
    }).project({ merchantNumber: 1 }).toArray();

    const merchantDocs      = [];
    const sheetFormDocs     = [];
    const appFormDocs       = [];
    const mobikwikFormDocs  = [];

    const merchantNumbers = [...new Set([
      ...masterDocs.map(m => (m.merchantNumber || '').trim()),
      ...formDocs.map(m => (m.merchantNumber || '').trim())
    ].filter(Boolean))];

    if (merchantNumbers.length === 0) {
      const result = {
        success: true, btAmount: 0, btGap: 0, todaysBT: 0, yesterdaysBT: 0,
        upiAmount: 0, upiGap: 0, upiTxnCount: 0,
        rewardPassCount: 0, passLiveCount: 0, totalMerchants: 0,
        merchants: [], collectionUsed: collectionName
      };
      await cacheSet(ck, result);
      return res.json(result);
    }

    let btDocs = await db.collection(collectionName).find({
      merchantNumber: { $in: merchantNumbers }
    }).toArray();

    // Enforce strict year filtering on document date if selectedYear is passed
    if (selectedYear) {
      const targetYr = parseInt(selectedYear);
      btDocs = btDocs.filter(r => {
        const dateRaw = r.createdAt || r._syncedAt || r._synced_at;
        if (!dateRaw) {
          const collectionHasOtherYear = ['2024','2025','2026','24','25','26'].some(y => {
            if (y === selectedYear || y === selectedYear.slice(-2)) return false;
            return collectionName.includes(y);
          });
          return !collectionHasOtherYear;
        }
        const d = new Date(dateRaw);
        return !isNaN(d.getTime()) && d.getFullYear() === targetYr;
      });
    }

    let btAmount = 0, btGap = 0, todaysBT = 0, yesterdaysBT = 0;
    let upiAmount = 0, upiGap = 0, upiTxnCount = 0;
    let rewardPassCount = 0, passLiveCount = 0;

    const merchants = btDocs.map(r => {
      const norm = normalizeConnectDoc(r);
      
      btAmount     += norm.stage3;
      if (norm.stage3 > 0) btGap += norm.stage3Gap;
      todaysBT     += norm.todaysStage3;
      yesterdaysBT += norm.yesterdaysStage3;
      upiAmount    += norm.withdrawAmount;
      upiGap       += norm.upiGap !== '–' ? parseFloat(norm.upiGap.replace(/,/g, '')) || 0 : 0;
      upiTxnCount  += norm.upiTxnCount;
      if (norm.rewardPassPro.toLowerCase() === 'active') rewardPassCount++;
      if (norm.passLive.toLowerCase() === 'live') passLiveCount++;

      return norm;
    });

    const result = {
      success: true, collectionUsed: collectionName,
      // Extract the month from collection name (e.g. "BT_TL_CONNECT MAY" → "May")
      collectionMonth: collectionName ? (() => {
        const parts = collectionName.split(' ');
        const m = parts[parts.length - 1];
        return m ? m.charAt(0) + m.slice(1).toLowerCase() : null;
      })() : null,
      btAmount, btGap, todaysBT, yesterdaysBT,
      upiAmount, upiGap, upiTxnCount,
      rewardPassCount, passLiveCount,
      totalMerchants: merchants.length, merchants
    };
    await cacheSet(ck, result);
    res.json(result);
  } catch (err) {
    console.error('BT performance error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/auth/tidebt-annual-bt-summary
// Returns BT amount + RP count for each month of the year — used for cumulative carry-forward
router.get('/tidebt-annual-bt-summary', verifyToken, async (req, res) => {
  try {
    const employee = await Employee.findById(req.user.id).select('newJoinerName email');
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const { year } = req.query;
    const yearStr  = year || String(new Date().getFullYear());
    const ck = cacheKey('EMP_ANNUAL_BT', employee._id.toString(), yearStr);
    const cached = await cacheGet(ck);
    if (cached) return res.json(cached);

    const db      = mongoose.connection.db;
    const empName  = employee.newJoinerName.trim();
    const empEmail = employee.email.trim();
    const escape   = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Get current merchant numbers from bt_master (active merchants)
    const masterDocs = await db.collection('bt_master').find({
      $or: [
        { fseEmail: { $regex: new RegExp(`^${escape(empEmail)}$`, 'i') } },
        { fseName:  { $regex: new RegExp(`^\\s*${escape(empName)}\\s*\\d*\\s*$`, 'i') } }
      ]
    }).project({ merchantNumber: 1 }).toArray();

    const merchantNumbers = [...new Set(
      masterDocs.map(m => (m.merchantNumber || '').trim()).filter(Boolean)
    )];

    // Build lead name patterns — FSE name shortened forms used in BT_TL_CONNECT collections
    // e.g. "Amit Shukla" → matches "Amit S", "Amit Shukla", "Amit"
    const nameParts = empName.split(' ').filter(Boolean);
    const firstName = nameParts[0] || empName;
    const lastInitial = nameParts[1] ? nameParts[1][0] : '';
    // Match: full name, first name only, "First L" pattern
    const leadPatterns = [
      new RegExp(`^\\s*${escape(empName)}\\s*$`, 'i'),
      new RegExp(`^\\s*${escape(firstName)}\\s*${lastInitial ? escape(lastInitial) : ''}`, 'i'),
      new RegExp(`^\\s*${escape(firstName)}\\s*$`, 'i')
    ];

    const allCollections = (await db.listCollections().toArray()).map(c => c.name);
    const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const shortYear = yearStr.slice(-2);

    const MONTH_ABBR = {
      'JANUARY': 'JAN', 'FEBRUARY': 'FEB', 'MARCH': 'MAR', 'APRIL': 'APR',
      'MAY': 'MAY', 'JUNE': 'JUN', 'JULY': 'JUL', 'AUGUST': 'AUG',
      'SEPTEMBER': 'SEP', 'OCTOBER': 'OCT', 'NOVEMBER': 'NOV', 'DECEMBER': 'DEC'
    };

    const monthResults = await Promise.all(MONTH_NAMES.map(async (monthName) => {
      const monthUpper = monthName.toUpperCase();
      const monthAbbr  = MONTH_ABBR[monthUpper] || monthUpper;
      // Only use BT_TL_CONNECT* collections — never tl_connect_*
      const btCols = allCollections.filter(c => c.toUpperCase().startsWith('BT_TL_CONNECT'));
      const matchesMonth = (cu) => cu.includes(monthUpper) || cu.includes(monthAbbr);

      let colName = btCols.find(c => {
        const cu = c.toUpperCase();
        return matchesMonth(cu) && (cu.includes(yearStr) || cu.includes(shortYear));
      });
      if (!colName) colName = btCols.find(c => matchesMonth(c.toUpperCase()));
      if (!colName) return { month: monthName, btAmount: 0, rewardPassCount: 0, passLiveCount: 0, collectionFound: false };

      // Query 1: match by current merchant numbers (bt_master)
      // Query 2: match by lead name (handles churned/historical merchants)
      const [byMerchant, byLead] = await Promise.all([
        merchantNumbers.length > 0
          ? db.collection(colName).find({ merchantNumber: { $in: merchantNumbers } })
              .project({ stage3: 1, rewardPassPro: 1, priorityPassPro: 1, passLive: 1, merchantNumber: 1 }).toArray()
          : Promise.resolve([]),
        db.collection(colName).find({
          $or: leadPatterns.map(p => ({ lead: p }))
        }).project({ stage3: 1, rewardPassPro: 1, priorityPassPro: 1, passLive: 1, merchantNumber: 1 }).toArray()
      ]);

      // Merge — deduplicate by merchantNumber
      const seen = new Set();
      const btDocs = [];
      [...byMerchant, ...byLead].forEach(r => {
        const key = r.merchantNumber || String(r._id);
        if (!seen.has(key)) { seen.add(key); btDocs.push(r); }
      });

      let btAmount = 0, rewardPassCount = 0, passLiveCount = 0;
      btDocs.forEach(r => {
        const parseNum = v => { const n = parseFloat(String(v || '0').replace(/,/g, '')); return isNaN(n) ? 0 : n; };
        btAmount += parseNum(r.stage3 || r.Stage_3 || r['Stage-3']);
        const rp = (r.rewardPassPro || r.priorityPassPro || '').toLowerCase();
        if (rp === 'active') rewardPassCount++;
        if ((r.passLive || '').toLowerCase() === 'live') passLiveCount++;
      });

      return { month: monthName, btAmount, rewardPassCount, passLiveCount, collectionFound: true, totalDocs: btDocs.length };
    }));

    const result = { success: true, year: yearStr, months: monthResults };
    await cacheSet(ck, result);
    res.json(result);
  } catch (err) {
    console.error('Annual BT summary error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/auth/tidebt-carry-forward?month=July&year=2026
// Returns carry-forward from TideBT_OpeningBalances (pre-synced monthly).
// Only shows data for July 2026 (carry from June). All other months return 0.
router.get('/tidebt-carry-forward', verifyToken, async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  try {
    const employee = await Employee.findById(req.user.id).select('newJoinerName email');
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const { month, year } = req.query;

    // Opening balances are only synced for July 2026 — other months return 0
    const OPENING_BALANCE_MONTH = 'July';
    const OPENING_BALANCE_YEAR  = 2026;
    if (month !== OPENING_BALANCE_MONTH || parseInt(year) !== OPENING_BALANCE_YEAR) {
      return res.json({ success: true, carryForward: 0 });
    }

    const db = mongoose.connection.db;
    const empName = employee.newJoinerName.trim();
    const escape  = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Try direct name match
    let openingRecord = await db.collection('TideBT_OpeningBalances').findOne({
      name: { $regex: new RegExp(`^\\s*${escape(empName)}\\s*$`, 'i') }
    });

    // If not found, try via TideBT_Access fseName (handles name mismatches)
    if (!openingRecord) {
      const accessRecord = await db.collection('TideBT_Access').findOne({
        $or: [
          { fseName: { $regex: new RegExp(`^\\s*${escape(empName)}\\s*$`, 'i') } },
          { fseEmail: { $regex: new RegExp(`^${(employee.email||'').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } }
        ]
      });
      if (accessRecord?.fseName) {
        openingRecord = await db.collection('TideBT_OpeningBalances').findOne({
          name: { $regex: new RegExp(`^\\s*${escape(accessRecord.fseName.trim())}\\s*$`, 'i') }
        });
      }
    }

    const carryForward = openingRecord ? Math.round(openingRecord.openingBalance || 0) : 0;
    console.log(`[Carry Forward FSE] "${empName}": ₹${carryForward}`);
    res.json({ success: true, carryForward });
  } catch (err) {
    console.error('Carry forward error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

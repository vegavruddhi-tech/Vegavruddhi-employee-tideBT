import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import ImpersonationBanner from '../components/ImpersonationBanner';

const PROFILE_API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:4001';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function Dashboard() {
  const navigate = useNavigate();
  const [isImpersonating, setIsImpersonating] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('token') && params.get('viewAs')) {
      localStorage.setItem('token', params.get('token'));
      localStorage.setItem('viewAsEmail', params.get('viewAs'));
      localStorage.setItem('isImpersonating', 'true');
      return true;
    }
    return localStorage.getItem('isImpersonating') === 'true';
  });
  const [viewAsEmail, setViewAsEmail] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('viewAs') || localStorage.getItem('viewAsEmail') || '';
  });

  const handleExitImpersonation = () => {
    localStorage.removeItem('isImpersonating');
    localStorage.removeItem('viewAsEmail');
    localStorage.removeItem('token');
    if (window.opener && !window.opener.closed) {
      window.close();
    } else {
      const adminAppUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:3002'
        : 'https://vegavruddhi-admin-panel.vercel.app';
      window.location.href = adminAppUrl;
    }
  };

  const token = localStorage.getItem('token');
  const [emp, setEmp] = useState(null);
  const [myForms, setMyForms] = useState([]);
  const [expandedForm, setExpandedForm] = useState(null);
  const [amountRange, setAmountRange] = useState('');
  const [formTab, setFormTab] = useState('onboard');
  const [receivedPayments, setReceivedPayments] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [rewardPassData, setRewardPassData] = useState([]);
  const [myTarget, setMyTarget] = useState(null);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expensePurpose, setExpensePurpose] = useState('');
  const [expenseLoading, setExpenseLoading] = useState(false);
  const [btPerf, setBtPerf] = useState(null); // BT performance from BT_TL_CONNECT MAY
  const [prevBtPerf, setPrevBtPerf] = useState(null); // Prev month BT performance
  const [annualBtSummary, setAnnualBtSummary] = useState(null); // All months BT data
  const [pendingTab, setPendingTab] = useState('bt');
  const [teamPerformance, setTeamPerformance] = useState(null);

  // Selected KPI for bottom sheet details
  const [activeKpi, setActiveKpi] = useState(null);
  const [serverCarryForward, setServerCarryForward] = useState(null); // server-computed carry forward

  // Date filter state — default to all data, user can filter by month
  const [dateFilter, setDateFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState(new Date().toLocaleString('en-US', { month: 'long' }));
  const filterByDate = useCallback((items, dateField = 'createdAt') => {
    if (!Array.isArray(items)) return [];
    const now = new Date();
    const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    return items.filter(item => {
      const raw = item[dateField];
      if (!raw) return true;
      const d = new Date(raw);
      if (isNaN(d)) return true;

      if (dateFilter === 'today') {
        const todayStr = now.toISOString().split('T')[0];
        return d.toISOString().split('T')[0] === todayStr;

      } else if (dateFilter === 'month') {
        const yr = selectedYear ? parseInt(selectedYear) : now.getFullYear();
        const monthIdx = selectedMonth ? MONTH_NAMES.indexOf(selectedMonth) : now.getMonth();
        const targetMonth = monthIdx >= 0 ? monthIdx : now.getMonth();
        const ms = new Date(yr, targetMonth, 1);
        const me = new Date(yr, targetMonth + 1, 0, 23, 59, 59, 999);
        return d >= ms && d <= me;

      } else if (dateFilter === 'custom') {
        if (fromDate) { const f = new Date(fromDate); if (!isNaN(f) && d < f) return false; }
        if (toDate)   { const t = new Date(toDate + 'T23:59:59'); if (!isNaN(t) && d > t) return false; }
        return true;

      } else {
        // 'all' — apply year and/or month dropdowns
        if (selectedYear && d.getFullYear() !== parseInt(selectedYear)) return false;
        if (selectedMonth && MONTH_NAMES[d.getMonth()] !== selectedMonth) return false;
        return true;
      }
    });
  }, [dateFilter, fromDate, toDate, selectedYear, selectedMonth]);

  const filteredForms       = useMemo(() => filterByDate(myForms),         [myForms,         filterByDate]);
  const filteredPayments    = useMemo(() => filterByDate(receivedPayments),  [receivedPayments, filterByDate]);
  const filteredExpenses    = useMemo(() => filterByDate(expenses),          [expenses,         filterByDate]);
  const filteredRewardPass  = useMemo(() => filterByDate(rewardPassData, 'dateOfWorking'), [rewardPassData, filterByDate]);

  // ── KPI calculations ──────────────────────────────────────────────────────
  // All calculations use filtered data — month-wise consistent
  const totalFund    = useMemo(() => filteredPayments.reduce((s, p) => s + (p.amount || 0), 0), [filteredPayments]);
  // Use btPerf (BT_TL_CONNECT MAY) when available, fallback to TideBT_RewardPass
  const fundUsedBT   = useMemo(() => btPerf ? (btPerf.btAmount || 0) : filteredRewardPass.reduce((s, r) => s + (r.totalBTAmount || 0), 0), [filteredRewardPass, btPerf]);
  const totalRPCount = useMemo(() => btPerf ? (btPerf.rewardPassCount || 0) : filteredRewardPass.reduce((s, r) => s + (r.totalRPCount || 0), 0), [filteredRewardPass, btPerf]);
  const fundUsedRP   = totalRPCount * 2500;
  const fee          = Math.round((fundUsedBT > 10000 ? fundUsedBT * 0.015 : 0) * 100) / 100; // 1.5% only if BT > ₹10,000

  const withdrawAmount = useMemo(() => filteredForms.filter(f => f.formType === 'mobikwik-withdraw').reduce((s, f) => s + (f.withdrawAmount || 0), 0), [filteredForms]);
  const withdrawFees   = Math.round(withdrawAmount * 0.03 * 100) / 100; // 3% withdraw fee

  const totalUsed = fundUsedRP + fee + withdrawFees;
  const fundLeft  = totalFund - totalUsed;

  // ── Previous month carry-forward — uses prevBtPerf API for accurate BT/RP ──
  const prevMonthData = useMemo(() => {
    const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const curMonthIdx  = selectedMonth ? MONTH_NAMES.indexOf(selectedMonth) : new Date().getMonth();
    const curYear      = selectedYear  ? parseInt(selectedYear)             : new Date().getFullYear();
    const prevMonthIdx = curMonthIdx === 0 ? 11 : curMonthIdx - 1;
    const prevYear     = curMonthIdx === 0 ? curYear - 1 : curYear;
    const prevMonthName = MONTH_NAMES[prevMonthIdx];

    const isInPrevMonth = (dateRaw) => {
      if (!dateRaw) return false;
      const d = new Date(dateRaw);
      if (isNaN(d)) return false;
      return d.getFullYear() === prevYear && d.getMonth() === prevMonthIdx;
    };

    // Fund received in prev month
    const prevReceived = (Array.isArray(receivedPayments) ? receivedPayments : [])
      .filter(p => isInPrevMonth(p.createdAt))
      .reduce((s, p) => s + (p.amount || 0), 0);

    // BT & RP from prevBtPerf API — accurate, same source as current month
    const prevBT      = prevBtPerf ? (prevBtPerf.btAmount       || 0) : 0;
    const prevRPCount = prevBtPerf ? (prevBtPerf.rewardPassCount || 0) : 0;
    const prevRP      = prevRPCount * 2500;
    const prevFee     = Math.round((prevBT > 10000 ? prevBT * 0.015 : 0) * 100) / 100;

    // Mobikwik withdraw from local forms
    const prevWithdraw = myForms
      .filter(f => f.formType === 'mobikwik-withdraw' && isInPrevMonth(f.createdAt))
      .reduce((s, f) => s + (f.withdrawAmount || 0), 0);
    const prevWithdrawFees = Math.round(prevWithdraw * 0.03 * 100) / 100;

    const prevTotalUsed = prevRP + prevFee + prevWithdrawFees;
    const prevFundLeft  = prevReceived - prevTotalUsed;

    return { prevMonthName, prevYear, prevReceived, prevBT, prevRPCount, prevRP, prevFee, prevWithdraw, prevTotalUsed, prevFundLeft };
  }, [receivedPayments, prevBtPerf, myForms, selectedMonth, selectedYear]);

  // ── Combined KPIs including carry-forward ─────────────────────────────────
  // Use prevMonthData.prevFundLeft as the carry — it uses prevBtPerf which is accurate.
  // annualBtSummary is used only when it's available (for months before prev month).
  const carryForward = useMemo(() => {
    const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const curMonthIdx = selectedMonth ? MONTH_NAMES.indexOf(selectedMonth) : new Date().getMonth();
    const curYear     = selectedYear  ? parseInt(selectedYear)             : new Date().getFullYear();

    const pastMonths = MONTH_NAMES.slice(0, curMonthIdx);
    if (pastMonths.length === 0) return 0;

    const prevMonthIdx  = curMonthIdx - 1;
    const prevMonthName = MONTH_NAMES[prevMonthIdx];

    // Use running balance — negative months (returns) reduce balance, positive months add
    let runningBalance = 0;

    pastMonths.forEach(monthName => {
      // Net received this month (positive = received fund, negative = returned fund to admin)
      const monthReceived = (Array.isArray(receivedPayments) ? receivedPayments : [])
        .filter(p => {
          if (!p.createdAt) return false;
          const d = new Date(p.createdAt);
          return d.getFullYear() === curYear && MONTH_NAMES[d.getMonth()] === monthName;
        })
        .reduce((s, p) => s + (p.amount || 0), 0);

      // Get BT/RP costs for this month
      let monthBT = 0, monthRP = 0;
      if (monthName === prevMonthName && prevBtPerf) {
        monthBT = prevBtPerf.btAmount       || 0;
        monthRP = prevBtPerf.rewardPassCount || 0;
      } else if (annualBtSummary?.months) {
        const monthData = annualBtSummary.months.find(m => m.month === monthName);
        monthBT = monthData ? (monthData.btAmount       || 0) : 0;
        monthRP = monthData ? (monthData.rewardPassCount || 0) : 0;
      }

      const monthRPCost = monthRP * 2500;
      const monthFee    = Math.round((monthBT > 10000 ? monthBT * 0.015 : 0) * 100) / 100;

      const monthWithdraw = (Array.isArray(myForms) ? myForms : [])
        .filter(f => {
          if (f.formType !== 'mobikwik-withdraw' || !f.createdAt) return false;
          const d = new Date(f.createdAt);
          return d.getFullYear() === curYear && MONTH_NAMES[d.getMonth()] === monthName;
        })
        .reduce((s, f) => s + (f.withdrawAmount || 0), 0);
      const monthWithdrawFees = Math.round(monthWithdraw * 0.03 * 100) / 100;

      const monthUsed = monthRPCost + monthFee + monthWithdrawFees;

      // Net = received (can be negative if returned) minus used costs
      // Running balance accumulates — clamp to 0 (can't carry negative)
      runningBalance = Math.max(0, runningBalance + monthReceived - monthUsed);
    });

    return runningBalance;
  }, [receivedPayments, prevBtPerf, annualBtSummary, myForms, selectedMonth, selectedYear]);

  const totalAvailable    = totalFund + (serverCarryForward !== null ? serverCarryForward : carryForward);
  const fundLeftWithCarry = totalAvailable - totalUsed;

  // Helper to format a Date to YYYY-MM-DD local string
  const toLocalDateStr = (d) =>
    `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  // Today's BT — uses the "to" date of custom filter, or actual today
  const todayBT = useMemo(() => {
    const ref = (dateFilter === 'custom' && toDate) ? new Date(toDate) : new Date();
    const refStr = toLocalDateStr(ref);
    return (Array.isArray(rewardPassData) ? rewardPassData : [])
      .filter(r => {
        const d = new Date(r.dateOfWorking || r.createdAt || '');
        return !isNaN(d) && toLocalDateStr(d) === refStr;
      })
      .reduce((s, r) => s + (r.totalBTAmount || 0), 0);
  }, [rewardPassData, dateFilter, toDate]);

  // Yesterday's BT — one day before the "to" date of custom filter, or actual yesterday
  const yesterdayBT = useMemo(() => {
    const base = (dateFilter === 'custom' && toDate) ? new Date(toDate) : new Date();
    const ref = new Date(base); ref.setDate(ref.getDate() - 1);
    const refStr = toLocalDateStr(ref);
    return (Array.isArray(rewardPassData) ? rewardPassData : [])
      .filter(r => {
        const d = new Date(r.dateOfWorking || r.createdAt || '');
        return !isNaN(d) && toLocalDateStr(d) === refStr;
      })
      .reduce((s, r) => s + (r.totalBTAmount || 0), 0);
  }, [rewardPassData, dateFilter, toDate]);

  // ── Stale-while-revalidate fetch helper ───────────────────────────────────
  // Shows cached data from localStorage instantly, then refreshes in background
  const cachedFetch = useCallback((url, setter, transform, cacheKeyStr) => {
    const stored = localStorage.getItem(cacheKeyStr);
    if (stored) {
      try { setter(transform(JSON.parse(stored))); } catch {}
    }
    fetch(url, { headers: { Authorization: 'Bearer ' + token } })
      .then(r => r.json())
      .then(data => {
        localStorage.setItem(cacheKeyStr, JSON.stringify(data));
        setter(transform(data));
      })
      .catch(() => {});
  }, [token]);

  // ── Background prefetch all months so switching is instant ───────────────
  useEffect(() => {
    if (!token) return;
    const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const curYear = new Date().getFullYear().toString();
    const timer = setTimeout(() => {
      MONTH_NAMES.forEach(month => {
        const ckBt = `ebt_btperf_${month}_${curYear}`;
        if (!localStorage.getItem(ckBt)) {
          const p = new URLSearchParams({ selectedMonth: month, selectedYear: curYear });
          fetch(`${PROFILE_API_BASE}/api/auth/tidebt-bt-performance?${p}`, { headers: { Authorization: 'Bearer ' + token } })
            .then(r => r.json()).then(d => localStorage.setItem(ckBt, JSON.stringify(d))).catch(() => {});
        }
      });
    }, 3000);
    return () => clearTimeout(timer);
  }, [token]);

  // ── Data fetching ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) { navigate('/'); return; }
    fetch(`${PROFILE_API_BASE}/api/auth/profile`, { headers: { Authorization: 'Bearer ' + token } })
      .then(r => { if (r.status === 401) { localStorage.clear(); navigate('/'); } return r.json(); })
      .then(setEmp)
      .catch(console.error);
  }, [token, navigate]);

  useEffect(() => {
    if (!token) return;
    cachedFetch(`${PROFILE_API_BASE}/api/auth/tidebt-my-forms`, setMyForms, d => Array.isArray(d) ? d : [], 'ebt_forms');
  }, [token, cachedFetch]);

  useEffect(() => {
    if (!token) return;
    cachedFetch(`${PROFILE_API_BASE}/api/auth/tidebt-received-payments`, setReceivedPayments, d => d.payments || d || [], 'ebt_payments');
  }, [token, cachedFetch]);

  useEffect(() => {
    if (!token) return;
    cachedFetch(`${PROFILE_API_BASE}/api/auth/tidebt-my-expenses`, setExpenses, d => d.expenses || [], 'ebt_expenses');
  }, [token, cachedFetch]);

  useEffect(() => {
    if (!token) return;
    cachedFetch(`${PROFILE_API_BASE}/api/auth/tidebt-my-reward-pass`, setRewardPassData, d => d.data || [], 'ebt_rewardpass');
  }, [token, cachedFetch]);

  // Fetch BT performance from BT_TL_CONNECT {MONTH} — refetch when month or year changes
  useEffect(() => {
    if (!token) return;
    const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const curMonthIdx  = selectedMonth ? MONTH_NAMES.indexOf(selectedMonth) : new Date().getMonth();
    const curYear      = selectedYear  ? parseInt(selectedYear)             : new Date().getFullYear();
    const prevMonthIdx = curMonthIdx === 0 ? 11 : curMonthIdx - 1;
    const prevYear     = curMonthIdx === 0 ? curYear - 1 : curYear;
    const prevMonthName = MONTH_NAMES[prevMonthIdx];

    // Current month
    const params = new URLSearchParams();
    if (selectedMonth) params.set('selectedMonth', selectedMonth);
    if (selectedYear) params.set('selectedYear', selectedYear);
    cachedFetch(
      `${PROFILE_API_BASE}/api/auth/tidebt-bt-performance?${params.toString()}`,
      d => { if (d.success) setBtPerf(d); else setBtPerf(null); },
      d => d,
      `ebt_btperf_${selectedMonth}_${selectedYear}`
    );

    // Previous month
    const prevParams = new URLSearchParams();
    prevParams.set('selectedMonth', prevMonthName);
    prevParams.set('selectedYear', String(prevYear));
    cachedFetch(
      `${PROFILE_API_BASE}/api/auth/tidebt-bt-performance?${prevParams.toString()}`,
      d => { if (d.success) setPrevBtPerf(d); else setPrevBtPerf(null); },
      d => d,
      `ebt_btperf_${prevMonthName}_${prevYear}`
    );

    // Annual summary
    const yearStr = String(curYear);
    cachedFetch(
      `${PROFILE_API_BASE}/api/auth/tidebt-annual-bt-summary?year=${yearStr}`,
      d => { if (d.success) setAnnualBtSummary(d); else setAnnualBtSummary(null); },
      d => d,
      `ebt_annual_${yearStr}`
    );
  }, [token, selectedMonth, selectedYear, cachedFetch]);

  useEffect(() => {
    if (!token) return;
    const targetMonth = selectedMonth || '';
    const targetYear  = selectedYear || '';
    // No localStorage cache for targets — admin sets them on a different backend,
    // stale cache would hide the target. Always fetch fresh.
    fetch(
      `${PROFILE_API_BASE}/api/auth/tidebt-my-target?month=${targetMonth}&year=${targetYear}`,
      { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' }
    )
      .then(r => r.json())
      .then(d => setMyTarget(d.target || null))
      .catch(() => {});
  }, [token, selectedMonth, selectedYear]);

  // Fetch server-computed carry forward (accounts for sent-to-FSEs when acting as TL)
  useEffect(() => {
    if (!token || !selectedMonth || !selectedYear) { setServerCarryForward(null); return; }
    fetch(
      `${PROFILE_API_BASE}/api/auth/tidebt-carry-forward?month=${selectedMonth}&year=${selectedYear}`,
      { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' }
    )
      .then(r => r.json())
      .then(d => setServerCarryForward(d.success ? (d.carryForward || 0) : null))
      .catch(() => setServerCarryForward(null));
  }, [token, selectedMonth, selectedYear]);

  useEffect(() => {
    if (!token) return;
    const params = new URLSearchParams();
    if (selectedMonth) params.set('selectedMonth', selectedMonth);
    if (selectedYear) params.set('selectedYear', selectedYear);
    cachedFetch(
      `${PROFILE_API_BASE}/api/auth/tidebt-team-performance?${params.toString()}`,
      d => { if (d.success) setTeamPerformance(d); else setTeamPerformance(null); },
      d => d,
      `ebt_teamperf_${selectedMonth}_${selectedYear}`
    );
  }, [token, selectedMonth, selectedYear, cachedFetch]);

  const handleAddExpense = async () => {
    if (!expenseAmount || !expensePurpose) return;
    setExpenseLoading(true);
    try {
      const res = await fetch(`${PROFILE_API_BASE}/api/auth/tidebt-add-expense`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ amount: expenseAmount, purpose: expensePurpose })
      });
      if (res.ok) {
        setExpenseAmount(''); setExpensePurpose('');
        const expRes = await fetch(`${PROFILE_API_BASE}/api/auth/tidebt-my-expenses`, { headers: { Authorization: 'Bearer ' + token } });
        const expData = await expRes.json();
        setExpenses(expData.expenses || []);
      }
    } catch (err) { console.error(err); }
    finally { setExpenseLoading(false); }
  };

  const handleResetFilter = () => {
    setDateFilter('all');
    setFromDate('');
    setToDate('');
    setSelectedMonth(new Date().toLocaleString('en-US', { month: 'long' }));
    setSelectedYear(new Date().getFullYear().toString());
  };

  const currentMonth = new Date().toLocaleString('en-US', { month: 'long' });
  const currentYear  = new Date().getFullYear().toString();

  const isFilterActive = dateFilter !== 'all' || fromDate || toDate || selectedMonth !== currentMonth || selectedYear !== currentYear;

  const getKpiDetails = (kpiLabel) => {
    const btBaseline0    = myTarget?.btBaseline || 0;
    const btActual       = btPerf?.btAmount || fundUsedBT;
    const btIncremental  = Math.max(0, btActual - btBaseline0);
    const remainingBTVal = myTarget?.btTarget ? Math.max(0, myTarget.btTarget - btIncremental) : 0;
    const remainingRPVal = myTarget?.rpTarget ? Math.max(0, myTarget.rpTarget - totalRPCount) : 0;

    // Helper: merchant list from btPerf
    const btMerchants = btPerf?.merchants || [];

    switch (kpiLabel) {
      case 'Reward Pass Count':
        return {
          title: 'Reward Pass Count',
          totalValue: btPerf ? `${btPerf.rewardPassCount} Merchants` : `${totalRPCount} Passes`,
          desc: btPerf ? 'Merchants with Reward Pass Pro Active.' : 'Total count of reward passes submitted by you.',
          type: 'individual',
          items: btPerf
            ? btMerchants.filter(m => (m.rewardPassPro || '').toLowerCase() === 'active').map(m => ({
                name: m.lead || '–',
                value: m.rewardPassPro,
                detail: `Pass Live: ${m.passLive} · Active Date: ${(() => { const v = m.rewardsPassProActiveDate; if (!v || v === '–') return '–'; const num = parseFloat(v); if (!isNaN(num) && num > 40000 && num < 55000) { const d = new Date((num - 25569) * 86400 * 1000); return isNaN(d) ? v : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); } const d = new Date(v); return isNaN(d) ? v : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); })()} · 📞 ${m.merchantNumber}`
              }))
            : filteredRewardPass.map(r => ({
                name: r.workingUpdate || 'Reward Pass Submission',
                value: `${r.totalRPCount || 0} RP`,
                detail: `BT Amount: ₹${(r.totalBTAmount || 0).toLocaleString()} · Date: ${r.dateOfWorking ? new Date(r.dateOfWorking).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '–'}`
              }))
        };

      case 'BT Amount': {
        const btCompletedRaw = btPerf ? (btPerf.btAmount || 0) : fundUsedBT;
        const btBaseline = myTarget ? (myTarget.btBaseline || 0) : 0;
        // Incremental BT = total BT - baseline at time target was set
        const btCompleted = Math.max(0, btCompletedRaw - btBaseline);
        const assignedBtTarget = myTarget ? (myTarget.btTarget || 0) : 0;
        const remainingTarget = assignedBtTarget > 0 ? Math.max(0, assignedBtTarget - btCompleted) : 0;
        const achievementPct = assignedBtTarget > 0 ? Math.round((btCompleted / assignedBtTarget) * 100) : 0;
        return {
          title: 'BT Amount Details',
          totalValue: `₹${btCompleted.toLocaleString()}`,
          desc: assignedBtTarget > 0
            ? `Target: ₹${assignedBtTarget.toLocaleString()} · Achieved: ${achievementPct}% · Remaining: ₹${remainingTarget.toLocaleString()}`
            : 'No target assigned for this month. Showing BT completed.',
          type: 'bt-amount-performance',
          btTarget: assignedBtTarget,
          btCompleted,
          remaining: remainingTarget,
          achievement: achievementPct,
          items: btPerf
            ? (btPerf.merchants || [])
                .filter(m => (m.stage3 || 0) > 0)
                .sort((a, b) => (b.stage3 || 0) - (a.stage3 || 0))
                .map(m => ({
                  name: m.lead || '–',
                  value: `₹${(m.stage3 || 0).toLocaleString()}`,
                  detail: `UPI: ${m.upiActive} · Txn: ${m.upiTxnCount} · 📞 ${m.merchantNumber}`
                }))
            : filteredRewardPass.map(r => ({
                name: r.workingUpdate || 'Reward Pass Submission',
                value: `₹${(r.totalBTAmount || 0).toLocaleString()}`,
                detail: `Date: ${r.dateOfWorking ? new Date(r.dateOfWorking).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '–'}`
              }))
        };
      }

      case 'UPI Amount':
        return {
          title: 'UPI Amount',
          totalValue: `₹${(btPerf?.upiAmount || 0).toLocaleString()}`,
          desc: `UPI transactions for BT · Total: ${btPerf?.upiTxnCount || 0} · Gap: ₹${(btPerf?.upiGap || 0).toLocaleString()}`,
          type: 'individual',
          items: btMerchants.filter(m => m.upiTxnCount > 0).map(m => ({
            name: m.lead || '–',
            value: `${m.upiTxnCount} Txn`,
            detail: `UPI: ${m.upiActive} · Gap: ${m.upiGap} · 📞 ${m.merchantNumber}`
          }))
        };

      case 'Team BT': {
        const teamTarget = teamPerformance?.teamTarget || 0;
        const btCompleted = teamPerformance?.btCompleted || 0;
        const remainingTarget = Math.max(0, teamTarget - btCompleted);
        const achievementPct = teamTarget > 0 ? Math.round((btCompleted / teamTarget) * 100) : 0;

        return {
          title: 'Team BT',
          totalValue: `₹${btCompleted.toLocaleString()}`,
          desc: `Team target: ₹${teamTarget.toLocaleString()} · Achieved: ${achievementPct}% · Remaining: ₹${remainingTarget.toLocaleString()}`,
          type: 'team-performance',
          color: 'bg-primary',
          items: (teamPerformance?.fseData || []).map(fse => {
            const fseTarget = fse.btTarget || 0;
            const fseCompleted = fse.btCompleted || 0;
            const fseRemaining = Math.max(0, fseTarget - fseCompleted);
            const fsePct = fseTarget > 0 ? Math.round((fseCompleted / fseTarget) * 100) : 0;
            const contrib = btCompleted > 0 ? Math.round((fseCompleted / btCompleted) * 100) : 0;

            return {
              name: fse.fseName,
              completed: fseCompleted,
              remaining: fseRemaining,
              target: fseTarget,
              achievement: fsePct,
              contribution: contrib
            };
          }).sort((a, b) => b.completed - a.completed)
        };
      }

      case 'RP Target':
        return {
          title: 'RP Target',
          totalValue: `${myTarget?.rpTarget || 0} RP`,
          desc: 'Your monthly target for Reward Pass count.',
          type: 'remaining',
          color: 'bg-purple',
          items: [{
            name: emp?.newJoinerName || 'My Target',
            targetValue: `${myTarget?.rpTarget || 0} RP`,
            actualValue: `${totalRPCount} RP`,
            value: myTarget?.rpTarget ? (Math.max(0, myTarget.rpTarget - totalRPCount) > 0 ? `${Math.max(0, myTarget.rpTarget - totalRPCount)} RP remaining` : 'Achieved! 🎉') : '–',
            percentage: myTarget?.rpTarget ? Math.min(100, Math.round((totalRPCount / myTarget.rpTarget) * 100)) : 0
          }]
        };

      case 'BT Target': {
        const btBaselineKpi = myTarget?.btBaseline || 0;
        const btIncrementalKpi = Math.max(0, fundUsedBT - btBaselineKpi);
        return {
          title: 'BT Target',
          totalValue: `₹${(myTarget?.btTarget || 0).toLocaleString()}`,
          desc: 'Your target for Bank Transfer amount (incremental since target was set).',
          type: 'remaining',
          color: 'bg-primary',
          items: [{
            name: emp?.newJoinerName || 'My Target',
            targetValue: `₹${(myTarget?.btTarget || 0).toLocaleString()}`,
            actualValue: `₹${btIncrementalKpi.toLocaleString()}`,
            value: myTarget?.btTarget ? (Math.max(0, myTarget.btTarget - btIncrementalKpi) > 0 ? `₹${Math.max(0, myTarget.btTarget - btIncrementalKpi).toLocaleString()} remaining` : 'Achieved! 🎉') : '–',
            percentage: myTarget?.btTarget ? Math.min(100, Math.round((btIncrementalKpi / myTarget.btTarget) * 100)) : 0
          }]
        };
      }

      case "Today's BT": {
        const ref = (dateFilter === 'custom' && toDate) ? new Date(toDate) : new Date();
        const refStr = toLocalDateStr(ref);
        const collMonthToday = btPerf?.collectionMonth;
        const isMatchingMonthToday = !selectedMonth || (collMonthToday && collMonthToday.toLowerCase() === selectedMonth.toLowerCase());
        const todayForms = (btPerf && isMatchingMonthToday)
          ? btMerchants.filter(m => (m.todaysStage3 || 0) > 0)
          : filteredRewardPass.filter(r => {
              const d = new Date(r.dateOfWorking || r.createdAt || '');
              return !isNaN(d) && toLocalDateStr(d) === refStr;
            });
        const todayTotal = (btPerf && isMatchingMonthToday) ? (btPerf.todaysBT || 0) : todayBT;
        return {
          title: "Today's BT",
          totalValue: `₹${todayTotal.toLocaleString()}`,
          desc: "Your bank transfer amount for today.",
          type: 'individual',
          items: (btPerf && isMatchingMonthToday)
            ? todayForms.map(m => ({
                name: m.lead || '–',
                value: `₹${(m.todaysStage3 || 0).toLocaleString()}`,
                detail: `📞 ${m.merchantNumber}`
              }))
            : todayForms.map(r => ({
                name: r.workingUpdate || 'Reward Pass Submission',
                value: `₹${(r.totalBTAmount || 0).toLocaleString()}`,
                detail: `Date: ${r.dateOfWorking ? new Date(r.dateOfWorking).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '–'}`
              }))
        };
      }

      case "Yesterday's BT": {
        const base = (dateFilter === 'custom' && toDate) ? new Date(toDate) : new Date();
        const yRef = new Date(base); yRef.setDate(yRef.getDate() - 1);
        const yStr = toLocalDateStr(yRef);
        const collMonth = btPerf?.collectionMonth;
        const isMatchingMonth = !selectedMonth || (collMonth && collMonth.toLowerCase() === selectedMonth.toLowerCase());
        const yesterdayForms = (btPerf && isMatchingMonth)
          ? btMerchants.filter(m => (m.yesterdaysStage3 || 0) > 0)
          : filteredRewardPass.filter(r => {
              const d = new Date(r.dateOfWorking || r.createdAt || '');
              return !isNaN(d) && toLocalDateStr(d) === yStr;
            });
        const yTotal = (btPerf && isMatchingMonth) ? (btPerf.yesterdaysBT || 0) : yesterdayBT;
        return {
          title: "Yesterday's BT",
          totalValue: `₹${yTotal.toLocaleString()}`,
          desc: "Your bank transfer amount for yesterday.",
          type: 'individual',
          items: (btPerf && isMatchingMonth)
            ? yesterdayForms.map(m => ({
                name: m.lead || '–',
                value: `₹${(m.yesterdaysStage3 || 0).toLocaleString()}`,
                detail: `📞 ${m.merchantNumber}`
              }))
            : yesterdayForms.map(r => ({
                name: r.workingUpdate || 'Reward Pass Submission',
                value: `₹${(r.totalBTAmount || 0).toLocaleString()}`,
                detail: `RP Count: ${r.totalRPCount || 0} · Date: ${r.dateOfWorking ? new Date(r.dateOfWorking).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '–'}`
              }))
        };
      }

      case 'Remaining BT Target': {
        const btBaselineR = myTarget?.btBaseline || 0;
        const btIncrementalR = Math.max(0, fundUsedBT - btBaselineR);
        return {
          title: 'Remaining BT Target',
          totalValue: `₹${remainingBTVal.toLocaleString()}`,
          desc: 'Remaining BT amount needed to hit target this month.',
          type: 'remaining',
          color: 'bg-orange',
          items: [{
            name: emp?.newJoinerName || 'My Target',
            targetValue: `₹${(myTarget?.btTarget || 0).toLocaleString()}`,
            actualValue: `₹${btIncrementalR.toLocaleString()}`,
            value: myTarget?.btTarget ? (remainingBTVal > 0 ? `₹${remainingBTVal.toLocaleString()} remaining` : 'Achieved! 🎉') : '–',
            percentage: myTarget?.btTarget ? Math.min(100, Math.round((btIncrementalR / myTarget.btTarget) * 100)) : 0
          }]
        };
      }

      case 'Remaining RP Target':
        return {
          title: 'Remaining RP Target',
          totalValue: `${remainingRPVal} RP`,
          desc: 'Remaining RP count needed to hit target this month.',
          type: 'remaining',
          color: 'bg-purple',
          items: [{
            name: emp?.newJoinerName || 'My Target',
            targetValue: `${myTarget?.rpTarget || 0} RP`,
            actualValue: `${totalRPCount} RP`,
            value: myTarget?.rpTarget ? (remainingRPVal > 0 ? `${remainingRPVal} RP remaining` : 'Achieved! 🎉') : '–',
            percentage: myTarget?.rpTarget ? Math.min(100, Math.round((totalRPCount / myTarget.rpTarget) * 100)) : 0
          }]
        };

      default:
        return null;
    }
  };

  return (
    <>
      <Navbar emp={emp} token={token} />
      <div className="main-content">
        <ImpersonationBanner
          isImpersonating={isImpersonating}
          targetName={emp?.newJoinerName || emp?.name || viewAsEmail}
          targetEmail={viewAsEmail}
          onExit={handleExitImpersonation}
        />

        {/* Welcome card */}
        <div className="welcome-card" style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div className="welcome-avatar" style={{ width: 60, height: 60, fontSize: 24 }}>
            {emp?.image
              ? <img src={emp.image} alt="Profile" />
              : (emp?.newJoinerName?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?')}
          </div>
          <div className="welcome-text" style={{ flex: 1, minWidth: 150 }}>
            <h2 style={{ fontSize: 20, marginBottom: 4 }}>Welcome, {emp?.newJoinerName?.split(' ')[0] || ''}!</h2>
            <p style={{ fontSize: 13, margin: 0 }}>{emp?.position} · {emp?.location}</p>
            {emp?.employeeId && (
              <div style={{ marginTop: 4, display: 'inline-block', background: 'rgba(255,255,255,0.2)', borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 700, letterSpacing: '0.5px', border: '1px solid rgba(255,255,255,0.3)' }}>
                🪪 {emp.employeeId}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '8px 16px', color: '#fff', textAlign: 'center', border: '1px solid rgba(255,255,255,0.25)' }}>
              <div style={{ fontSize: 9, fontWeight: 600, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Tide BT · {selectedMonth ? `${selectedMonth} ${selectedYear}` : selectedYear ? `All ${selectedYear}` : 'All Time'}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>Forms: {filteredForms.filter(f => f.formType !== 'mobikwik-withdraw').length}</div>
            </div>
            <Link to="/profile" className="profile-btn" style={{ fontSize: 13, padding: '8px 16px' }}>View My Profile ›</Link>
          </div>
        </div>

        {/* Action Buttons */}
        <Link to="/daily-visit" style={{ textDecoration: 'none', display: 'block', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px', background: 'linear-gradient(135deg, #1a4731 0%, #2d7a4f 100%)', borderRadius: 14, color: '#fff', cursor: 'pointer', boxShadow: '0 4px 16px rgba(26,71,49,0.25)' }}>
            <span style={{ fontSize: 28 }}>📋</span>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Tide BT Onboarding</div>
              <div style={{ fontSize: 11, opacity: 0.8 }}>Fill Tide BT daily onboarding data</div>
            </div>
          </div>
        </Link>
        <Link to="/mobikwik-withdraw" style={{ textDecoration: 'none', display: 'block', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px', background: 'linear-gradient(135deg, #4338ca 0%, #6366f1 100%)', borderRadius: 14, color: '#fff', cursor: 'pointer', boxShadow: '0 4px 16px rgba(67,56,202,0.25)' }}>
            <span style={{ fontSize: 28 }}>💸</span>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Mobikwik/Payzapp Withdraw</div>
              <div style={{ fontSize: 11, opacity: 0.8 }}>Submit withdraw request with reason</div>
            </div>
          </div>
        </Link>
        <Link to="/my-merchants" style={{ textDecoration: 'none', display: 'block', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px', background: 'linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)', borderRadius: 14, color: '#fff', cursor: 'pointer', boxShadow: '0 4px 16px rgba(15,118,110,0.25)' }}>
            <span style={{ fontSize: 28 }}>🏪</span>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>My Merchants</div>
              <div style={{ fontSize: 11, opacity: 0.8 }}>View all merchants you have visited</div>
            </div>
          </div>
        </Link>

        {/* ── Date Filter ─────────────────────────────────────────────────── */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1.5px solid #e8f3ed', padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Filter Data</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {['all', 'today', 'month'].map(f => (
              <button key={f} onClick={() => { setDateFilter(f); setFromDate(''); setToDate(''); if (f === 'month' || f === 'today') { setSelectedMonth(new Date().toLocaleString('en-US', { month: 'long' })); setSelectedYear(new Date().getFullYear().toString()); } }}
                style={{ padding: '6px 14px', border: dateFilter === f ? 'none' : '1px solid #dde8dd', borderRadius: 8, background: dateFilter === f ? '#1a4731' : '#fff', color: dateFilter === f ? '#fff' : '#1a4731', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                {f === 'all' ? 'All' : f === 'today' ? 'Today' : 'This Month'}
              </button>
            ))}
            <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}
              style={{ padding: '5px 8px', border: '1px solid #dde8dd', borderRadius: 8, fontSize: 12 }}>
              <option value="">All Years</option>
              {[2026, 2025, 2024].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select value={selectedMonth} onChange={e => { setSelectedMonth(e.target.value); if (e.target.value) setDateFilter('all'); }}
              style={{ padding: '5px 8px', border: '1px solid #dde8dd', borderRadius: 8, fontSize: 12 }}>
              <option value="">All Months</option>
              {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <span style={{ fontSize: 10, color: '#888' }}>Custom:</span>
            <input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setDateFilter('custom'); setSelectedMonth(''); setSelectedYear(''); }}
              style={{ padding: '5px 8px', border: '1px solid #dde8dd', borderRadius: 8, fontSize: 12 }} />
            <span style={{ fontSize: 11, color: '#888' }}>–</span>
            <input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setDateFilter('custom'); setSelectedMonth(''); setSelectedYear(''); }}
              style={{ padding: '5px 8px', border: '1px solid #dde8dd', borderRadius: 8, fontSize: 12 }} />
            {isFilterActive && (
              <button onClick={handleResetFilter}
                style={{ padding: '5px 10px', border: '1px solid #c62828', borderRadius: 8, background: '#fff', color: '#c62828', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                ✕ Reset
              </button>
            )}
          </div>
          {/* Active filter label */}
          <div style={{ marginTop: 6, fontSize: 10, color: '#1a4731', fontWeight: 600 }}>
            Showing: {dateFilter === 'today' ? 'Today' : dateFilter === 'month' ? 'This Month' : dateFilter === 'custom' ? `${fromDate || '…'} – ${toDate || '…'}` : `${selectedMonth || 'All Months'}, ${selectedYear || 'All Years'}`}
          </div>
        </div>

        {/* ── Quick Overview ──────────────────────────────────────────────── */}
        <div className="section-title" style={{ marginTop: 8, marginBottom: 10 }}>Quick Overview</div>
        <div className="info-grid" style={{ gap: 10 }}>
          {[
            { icon: '💼', label: 'Position',         value: emp?.position },
            { icon: '📍', label: 'Location',          value: emp?.location },
            { icon: '👤', label: 'Reporting Manager', value: emp?.reportingManager },
            { icon: '●',  label: 'Status',            value: emp?.status },
          ].map(c => (
            <div className="info-card dash-card" key={c.label} style={{ padding: '12px 14px' }}>
              <div className="dash-icon" style={{ fontSize: 18, marginBottom: 6 }}>{c.icon}</div>
              <div className="label" style={{ fontSize: 10, marginBottom: 4 }}>{c.label}</div>
              <div className="value" style={{ fontSize: 14 }}>{c.value || '–'}</div>
            </div>
          ))}
        </div>

        {/* ── FSE KPI Cards ────────────────────────────────────────────────── */}
        <div className="section-title" style={{ marginTop: 20, marginBottom: 10 }}>My Performance</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
          {[
            { label: 'Reward Pass Count',
              value: btPerf ? btPerf.rewardPassCount : (filteredRewardPass.reduce((s, r) => s + (r.totalRPCount || 0), 0)),
              icon: '🏅', color: '#0369a1', bg: '#e0f2fe',
              sublabel: btPerf ? `${btPerf.passLiveCount} Pass Live` : null
            },
            { label: 'BT Amount',
              value: btPerf ? `₹${(btPerf.btAmount || 0).toLocaleString()}` : (fundUsedBT ? `₹${fundUsedBT.toLocaleString()}` : '₹0'),
              icon: '💰', color: '#2e7d32', bg: '#e6f4ea',
              sublabel: btPerf
                ? (() => {
                    const gap = (btPerf.merchants || []).filter(m => (m.stage3||0) > 0).reduce((s,m) => s+(m.stage3Gap||0), 0);
                    return `Gap: ₹${gap.toLocaleString()}`;
                  })()
                : null
            },
            { label: 'UPI Amount',
              value: btPerf ? `₹${(btPerf.upiAmount || 0).toLocaleString()}` : '–',
              icon: '📱', color: '#0284c7', bg: '#e0f2fe',
              sublabel: btPerf ? `Txn: ${btPerf.upiTxnCount} · Gap: ₹${(btPerf.upiGap || 0).toLocaleString()}` : null
            },
            { label: 'UPI % of BT',
              value: (() => {
                const bt  = btPerf?.btAmount  || 0;
                const upi = btPerf?.upiAmount || 0;
                if (!bt || !upi) return '–';
                return `${Math.round((upi / bt) * 100)}%`;
              })(),
              icon: '📊', color: '#0369a1', bg: '#dbeafe',
              sublabel: btPerf
                ? `UPI ₹${(btPerf.upiAmount || 0).toLocaleString()} of BT ₹${(btPerf.btAmount || 0).toLocaleString()}`
                : null
            },
            { label: 'RP Target',             value: myTarget?.rpTarget || '–',                                                icon: '🎁', color: '#4338ca', bg: '#ede9fe' },
            { label: 'BT Target',             value: myTarget?.btTarget ? `₹${myTarget.btTarget.toLocaleString()}` : '–',      icon: '🎯', color: '#b45309', bg: '#fef3c7' },
            { label: "Yesterday's BT",
              value: (() => {
                const collMonth = btPerf?.collectionMonth;
                const isMatchingMonth = !selectedMonth || (collMonth && collMonth.toLowerCase() === selectedMonth.toLowerCase());
                if (btPerf && isMatchingMonth) return `₹${(btPerf.yesterdaysBT || 0).toLocaleString()}`;
                return '₹0';
              })(),
              icon: '📉', color: '#6b21a8', bg: '#f3e8ff',
              sublabel: (() => { const y = new Date(); y.setDate(y.getDate()-1); return y.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); })()
            },
            {
              label: 'Remaining BT Target',
              value: myTarget?.btTarget
                ? `₹${Math.max(0, myTarget.btTarget - (btPerf?.btAmount || fundUsedBT)).toLocaleString()}`
                : '–',
              icon: '⏳', color: '#c2410c', bg: '#ffedd5'
            },
            {
              label: 'Remaining RP Target',
              value: myTarget?.rpTarget
                ? Math.max(0, myTarget.rpTarget - filteredRewardPass.reduce((s, r) => s + (r.totalRPCount || 0), 0))
                : '–',
              icon: '⌛', color: '#6b21a8', bg: '#f3e8ff'
            },
          ].map(stat => (
            <div 
              key={stat.label} 
              className="dashboard-kpi-card" 
              onClick={() => setActiveKpi(stat.label)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: stat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{stat.icon}</div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{stat.label}</div>
                  {stat.sublabel && <div style={{ fontSize: 9, color: '#aaa', marginTop: 1 }}>{stat.sublabel}</div>}
                </div>
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: stat.color }}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* ── Fund Summary ─────────────────────────────────────────────────── */}
        <div className="section-title" style={{ marginTop: 24, marginBottom: 12 }}>💰 Fund Summary</div>

        {/* Previous month carry-forward banner */}
        {(prevMonthData.prevReceived !== 0 || carryForward > 0) && (
          <div style={{ background: 'linear-gradient(135deg, #e8f5e9 0%, #f1f8e9 100%)', borderRadius: 12, padding: '12px 14px', marginBottom: 12, border: '1.5px solid #a5d6a7', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#2e7d32', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                📅 {prevMonthData.prevMonthName} {prevMonthData.prevYear} — Carry Forward
              </div>
              <div style={{ fontSize: 11, color: '#555', marginTop: 3 }}>
                Received ₹{prevMonthData.prevReceived.toLocaleString()} · BT ₹{prevMonthData.prevBT.toLocaleString()} · RP {prevMonthData.prevRPCount}×₹2,500 · Used ₹{prevMonthData.prevTotalUsed.toLocaleString()}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: '#888', fontWeight: 600 }}>Carry Into {selectedMonth || 'This Month'}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: (serverCarryForward !== null ? serverCarryForward : carryForward) >= 0 ? '#1565c0' : '#c62828' }}>
                ₹{(serverCarryForward !== null ? serverCarryForward : carryForward).toLocaleString()}
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
          {[
            {
              label: 'This Month',
              value: `₹${totalFund.toLocaleString()}`,
              bg: totalFund < 0 ? '#fdecea' : '#e6f4ea',
              color: totalFund < 0 ? '#c62828' : '#2e7d32',
              border: totalFund < 0 ? '#c6282830' : '#2e7d3230',
              sub: totalFund < 0 ? 'Returned to Admin' : 'Net Received'
            },
            { label: 'Carry Forward', value: `₹${(serverCarryForward !== null ? serverCarryForward : carryForward).toLocaleString()}`, bg: '#e8f5e9', color: '#388e3c', border: '#43a04730', sub: `From ${prevMonthData.prevMonthName}` },
            { label: 'Total Available', value: `₹${totalAvailable.toLocaleString()}`,   bg: '#f1f8e9', color: '#1b5e20', border: '#2e7d3240', sub: 'This Month + Carry' },
            { label: 'BT',             value: `₹${fundUsedBT.toLocaleString()}`,         bg: '#fff3e0', color: '#e65100', border: '#e6510030', sub: 'Used' },
            { label: `RP ${totalRPCount}×₹2,500`, value: `₹${fundUsedRP.toLocaleString()}`, bg: '#ede9fe', color: '#7c3aed', border: '#7c3aed30', sub: 'Used' },
            { label: 'BT Fee (1.5%)', value: `₹${fee.toLocaleString()}`,                 bg: '#fce4ec', color: '#c62828', border: '#c6282830', sub: 'Deducted' },
            { label: 'Total Used',    value: `₹${totalUsed.toLocaleString()}`,            bg: '#fff3e0', color: '#ff6f00', border: '#ff980030', sub: 'RP + Fee + Withdraw' },
            { label: 'Fund Left',     value: `₹${fundLeftWithCarry.toLocaleString()}`,    bg: fundLeftWithCarry >= 0 ? '#e3f2fd' : '#fdecea', color: fundLeftWithCarry >= 0 ? '#1565c0' : '#c62828', border: '#1565c030', sub: 'Available − Used' },
          ].map(card => (
            <div key={card.label} style={{ background: card.bg, borderRadius: 12, padding: '12px 10px', textAlign: 'center', border: `1.5px solid ${card.border}` }}>
              <div style={{ fontSize: 8, fontWeight: 600, color: '#888', textTransform: 'uppercase', marginBottom: 2 }}>{card.label}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: card.color }}>{card.value}</div>
              {card.sub && <div style={{ fontSize: 8, color: '#aaa', marginTop: 2 }}>{card.sub}</div>}
            </div>
          ))}
        </div>

        {/* ── Mobikwik Summary ─────────────────────────────────────────────── */}
        {(() => {
          // Use filteredForms — month/date filter applies to withdraw data
          const wForms = filteredForms.filter(f => f.formType === 'mobikwik-withdraw');
          const wTotal = wForms.reduce((s, f) => s + (f.withdrawAmount || 0), 0);
          const wFees  = Math.round(wTotal * 0.03 * 100) / 100;
          return (
            <div style={{ marginBottom: 16 }}>
              <div className="section-title" style={{ marginBottom: 10 }}>💸 Mobikwik Summary</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                <div style={{ background: '#ede9fe', borderRadius: 12, padding: '12px 10px', textAlign: 'center', border: '1.5px solid #7c3aed30' }}>
                  <div style={{ fontSize: 8, fontWeight: 600, color: '#888', textTransform: 'uppercase' }}>Withdraw Amount</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#4338ca' }}>₹{wTotal.toLocaleString()}</div>
                </div>
                <div style={{ background: '#fce4ec', borderRadius: 12, padding: '12px 10px', textAlign: 'center', border: '1.5px solid #c6282830' }}>
                  <div style={{ fontSize: 8, fontWeight: 600, color: '#888', textTransform: 'uppercase' }}>Withdraw Fees (3%)</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#c62828' }}>₹{wFees.toLocaleString()}</div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Received Payments ────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1a4731' }}>Fund Transactions</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ background: '#e3f2fd', color: '#1565c0', padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>{filteredPayments.length}</div>
            <button onClick={() => { const el = document.getElementById('fse-payments-list'); if (el) el.style.display = el.style.display === 'none' ? 'flex' : 'none'; }}
              style={{ padding: '3px 10px', border: '1px solid #dde8dd', borderRadius: 8, background: '#fff', fontSize: 11, fontWeight: 600, color: '#1a4731', cursor: 'pointer' }}>
              Hide/Show
            </button>
          </div>
        </div>
        <div id="fse-payments-list" style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {filteredPayments.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 14, border: '1.5px solid #e8f3ed', padding: '20px', textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: '#888', margin: 0 }}>No transactions for this period.</p>
            </div>
          ) : (
            filteredPayments.map((p, i) => {
              const isReturn = (p.amount || 0) < 0;
              const date = p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '–';
              return (
                <div key={i} style={{
                  background: isReturn ? '#fff5f5' : '#fff',
                  borderRadius: 10,
                  border: `1px solid ${isReturn ? '#ffcdd2' : '#e8f3ed'}`,
                  padding: '10px 14px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: isReturn ? '#c62828' : '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>
                      {isReturn ? `↩ Returned to ${p.senderName || 'Admin'}` : '⬇ Received Fund'}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: isReturn ? '#c62828' : '#2e7d32' }}>
                      ₹{Math.abs(p.amount || 0).toLocaleString()}
                    </div>
                    <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>
                      {isReturn ? `${p.transferTo} → ${p.senderName}` : `${p.senderName} → You`} · {p.paymentDoneOn} · 📅 {date}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 9, padding: '3px 8px', borderRadius: 8, fontWeight: 700,
                    background: isReturn ? '#fdecea' : '#e6f4ea',
                    color: isReturn ? '#c62828' : '#2e7d32'
                  }}>
                    {isReturn ? 'Return' : 'Credit'}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* ── Expense History ───────────────────────────────────────────────── */}
        {filteredExpenses.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#e65100' }}>Expenses</div>
              <div style={{ background: '#fff3e0', color: '#e65100', padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>{filteredExpenses.length}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              {filteredExpenses.map((e, i) => (
                <div key={i} style={{ background: '#fff', borderRadius: 10, border: '1px solid #e8f3ed', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#e65100' }}>-₹{e.amount?.toLocaleString()}</div>
                    <div style={{ fontSize: 10, color: '#888' }}>{e.purpose} · {e.createdAt ? new Date(e.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '–'}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── My Forms (Tabbed) ────────────────────────────────────────────── */}
        {(() => {
          // Amount range helper
          const AMOUNT_RANGES = [
            { label: 'All Amounts', value: '' },
            { label: '₹0 – ₹10,000',         value: '0-10000',       min: 0,      max: 10000 },
            { label: '₹10,001 – ₹50,000',     value: '10001-50000',   min: 10001,  max: 50000 },
            { label: '₹50,001 – ₹1,00,000',   value: '50001-100000',  min: 50001,  max: 100000 },
            { label: '₹1,00,001 – ₹1,50,000', value: '100001-150000', min: 100001, max: 150000 },
            { label: '₹1,50,001 – ₹2,00,000', value: '150001-200000', min: 150001, max: 200000 },
          ];
          const selectedRange = AMOUNT_RANGES.find(r => r.value === amountRange);

          // Build BT amount lookup from btPerf merchants (stage3 per merchantNumber)
          const btAmountLookup = {};
          (btPerf?.merchants || []).forEach(m => {
            btAmountLookup[(m.merchantNumber || '').trim()] = m.stage3 || 0;
          });

          const getFormBTAmount = (form) => {
            const num = (form.merchantNumber || '').trim();
            if (btAmountLookup[num] !== undefined) return btAmountLookup[num];
            // fallback: withdrawAmount if present
            return form.withdrawAmount || 0;
          };

          const applyAmountFilter = (forms) => {
            // 'All Amounts' — no range selected, return everything
            if (!amountRange || !selectedRange) return forms;
            return forms.filter(f => {
              const amt = getFormBTAmount(f);
              return amt >= selectedRange.min && amt <= selectedRange.max;
            });
          };

          // Excel serial date converter (BT_TL_CONNECT stores dates as Excel serial numbers)
          const fmtExcelDate = (val) => {
            if (!val || val === '–' || val === '-' || val === '0' || val === 0) return '–';
            const num = parseFloat(val);
            if (!isNaN(num) && num > 40000 && num < 55000) {
              const d = new Date(Math.round((num - 25569) * 86400 * 1000));
              return isNaN(d.getTime()) ? val : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
            }
            const d = new Date(val);
            return isNaN(d.getTime()) ? val : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
          };

          // Per-merchant BT/RP/Live data from btPerf
          const btMerchantMap = {};      // keyed by merchantNumber
          const btMerchantByName = {};   // keyed by lead name (fallback)
          (btPerf?.merchants || []).forEach(m => {
            const num  = (m.merchantNumber || '').trim();
            const name = (m.lead || '').trim().toLowerCase();
            if (num)  btMerchantMap[num]     = m;
            if (name) btMerchantByName[name] = m;
          });

          const getActualStage = (form) => {
            const num  = (form.merchantNumber || '').trim();
            const name = (form.merchantName  || '').trim().toLowerCase();
            // Primary: number lookup; Fallback: name lookup
            const m = btMerchantMap[num] || btMerchantByName[name] || null;
            if (!m) return { label: form.merchantOpinion || 'Ready For Onboarding', color: '#888', bg: '#f0f0f0', icon: '📋', btAmt: 0, rpCount: 0, passLive: '–', btGap: 0, upiTxn: 0 };

            const stage3  = parseFloat(m.stage3)      || 0;
            const stage3Gap = parseFloat(m.stage3Gap) || 0;
            const upiTxn  = parseFloat(m.upiTxnCount) || 0;
            const passLive = (m.passLive || '').toLowerCase() === 'live';
            const rpActive = (m.rewardPassPro || '').toLowerCase() === 'active';
            const btDone   = stage3 > 0;
            let label, color, bg, icon;
            if (passLive)       { label = 'RP Live 🎉'; color = '#2e7d32'; bg = '#e6f4ea'; icon = '🟢'; }
            else if (rpActive)  { label = 'RP Active';  color = '#0369a1'; bg = '#e0f2fe'; icon = '🔵'; }
            else if (btDone)    { label = 'BT Done';    color = '#e65100'; bg = '#fff3e0'; icon = '🟠'; }
            else                { label = 'Ready';      color = '#6b21a8'; bg = '#f3e8ff'; icon = '🟣'; }

            return {
              label, color, bg, icon,
              btAmt:   stage3,
              rpCount: rpActive ? 1 : 0,
              passLive: m.passLive || '–',
              btGap:   stage3Gap,
              upiTxn,
              upiActive:    m.upiActive || '–',
              priorityPass: m.priorityPassStatus || '–',
              msmegst:      m.msmegstStatus || '–',
              insurance:    m.insuranceStatus || '–',
              rpActiveDate: fmtExcelDate(m.rewardsPassProActiveDate),
              partnerName:  m.partnerName || form.merchantName || '–',
            };
          };

          const allOnboarding = filteredForms.filter(f => f.formType === 'daily-visit' || !f.formType);
          const onboardingForms = applyAmountFilter(allOnboarding);
          const withdrawForms   = filteredForms.filter(f => f.formType === 'mobikwik-withdraw');

          const btPendingList = allOnboarding.filter(f => getActualStage(f).label === 'Ready');
          const rpPendingList = allOnboarding.filter(f => getActualStage(f).label === 'BT Done');
          const completedList = allOnboarding.filter(f => {
            const label = getActualStage(f).label;
            return label === 'RP Active' || label === 'RP Live 🎉';
          });

          const btPendingCount = btPendingList.length;
          const rpPendingCount = rpPendingList.length;
          const completedCount = completedList.length;

          const pendingList = pendingTab === 'bt' 
            ? btPendingList 
            : pendingTab === 'rp' 
              ? rpPendingList 
              : completedList;

          // AmountFilterBar component — matches TL Panel exactly
          const AmountFilterBar = () => (
            <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: '#888', fontWeight: 600 }}>BT Amount:</span>
              <select value={amountRange} onChange={e => setAmountRange(e.target.value)}
                style={{ fontSize: 12, padding: '4px 10px', borderRadius: 8, border: '1px solid #dde8dd', background: '#fff', color: '#1a4731', fontWeight: 600 }}>
                {AMOUNT_RANGES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              {amountRange && (
                <>
                  <button onClick={() => setAmountRange('')}
                    style={{ fontSize: 11, padding: '4px 10px', border: '1px solid #c62828', borderRadius: 8, background: '#fff', color: '#c62828', cursor: 'pointer', fontWeight: 700 }}>
                    ✕
                  </button>
                  <span style={{ fontSize: 11, color: '#888' }}>{onboardingForms.length} of {allOnboarding.length}</span>
                </>
              )}
            </div>
          );

          return (
            <>
              <div className="section-title" style={{ marginTop: 24, marginBottom: 12 }}>My Forms</div>

              <div style={{ display: 'flex', gap: 0, marginBottom: 12, borderBottom: '2px solid #e8f3ed' }}>
                {[
                  { key: 'onboard',    label: 'Tide BT Onboard',    count: onboardingForms.length },
                  { key: 'mobikwik',   label: 'Mobikwik/Payzapp',   count: withdrawForms.length },
                ].map(tab => (
                  <button key={tab.key} onClick={() => setFormTab(tab.key)}
                    style={{ padding: '8px 16px', border: 'none', background: formTab === tab.key ? '#1a4731' : 'transparent', color: formTab === tab.key ? '#fff' : '#1a4731', fontWeight: 700, fontSize: 11, cursor: 'pointer', borderRadius: '8px 8px 0 0' }}>
                    {tab.label} ({tab.count})
                  </button>
                ))}
              </div>

              {formTab === 'onboard' && (
                <>
                  {onboardingForms.length === 0
                    ? <div style={{ background: '#fff', borderRadius: 12, border: '1.5px solid #e8f3ed', padding: '20px', textAlign: 'center' }}><p style={{ fontSize: 13, color: '#888', margin: 0 }}>No onboarding forms for this period.</p></div>
                    : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {onboardingForms.map((form, i) => {
                          const date = new Date(form.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                          const isExpanded = expandedForm === (form._id || i);
                          // Simple status from form data only — no BT_TL_CONNECT
                          const status = form.onboardingStatus || form.merchantOpinion || 'Submitted';
                          const statusColors = {
                            'Ready For Onboarding': { bg: '#ede9fe', color: '#6b21a8' },
                            'Completed':            { bg: '#d8f3dc', color: '#1a4731' },
                            'Not Interested':       { bg: '#fee2e2', color: '#b91c1c' },
                            'Need to visit again':  { bg: '#fff3c7', color: '#92400e' },
                          };
                          const sc = statusColors[status] || { bg: '#e8f3ed', color: '#1a4731' };
                          return (
                            <div key={form._id || i}
                              style={{ background: '#fff', borderRadius: 10, border: '1.5px solid #e8f3ed', padding: '12px 14px', cursor: 'pointer' }}
                              onClick={() => setExpandedForm(isExpanded ? null : (form._id || i))}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#e8f3ed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>🏪</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1a4731', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{form.merchantName}</div>
                                  <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>
                                    📞 {form.merchantNumber}
                                    {form.merchantCategory ? ` · ${form.merchantCategory}` : ''}
                                    {' · 📅 '}{date}
                                  </div>
                                </div>
                                <span style={{ padding: '3px 8px', borderRadius: 10, fontSize: 9, fontWeight: 700, background: sc.bg, color: sc.color, whiteSpace: 'nowrap', flexShrink: 0 }}>
                                  {status}
                                </span>
                              </div>
                              {isExpanded && (
                                <div style={{ marginTop: 10, padding: '10px 12px', background: '#f8faf9', borderRadius: 8, fontSize: 11, color: '#333', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                                  <div><b>Merchant:</b> {form.merchantName}</div>
                                  <div><b>Phone:</b> {form.merchantNumber}</div>
                                  <div><b>Category:</b> {form.merchantCategory || '–'}</div>
                                  <div><b>Opinion:</b> {form.merchantOpinion || '–'}</div>
                                  <div><b>Status:</b> <span style={{ color: sc.color, fontWeight: 700 }}>{status}</span></div>
                                  <div><b>Email:</b> {form.merchantEmailId || '–'}</div>
                                  <div><b>Submitted:</b> {date}</div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )
                  }
                </>
              )}

              {formTab === 'mobikwik' && (withdrawForms.length === 0
                ? <div style={{ background: '#fff', borderRadius: 12, border: '1.5px solid #e8f3ed', padding: '20px', textAlign: 'center' }}><p style={{ fontSize: 13, color: '#888', margin: 0 }}>No withdraw forms for this period.</p></div>
                : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {withdrawForms.map((form, i) => {
                      const date = new Date(form.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                      const isExpanded = expandedForm === (form._id || `w-${i}`);
                      return (
                        <div key={form._id || i} style={{ background: '#fff', borderRadius: 10, border: '1px solid #e8f3ed', padding: '12px 14px', cursor: 'pointer' }}
                          onClick={() => setExpandedForm(isExpanded ? null : (form._id || `w-${i}`))}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>💸</div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: '#4338ca' }}>₹{form.withdrawAmount?.toLocaleString() || '–'}</div>
                              <div style={{ fontSize: 10, color: '#888' }}>{form.reasonOfWithdraw || '–'} · 📅 {date}</div>
                            </div>
                            <span style={{ padding: '3px 8px', borderRadius: 10, fontSize: 9, fontWeight: 700, background: '#ede9fe', color: '#4338ca' }}>Fees: ₹{form.withdrawFees || 0}</span>
                          </div>
                          {isExpanded && (
                            <div style={{ marginTop: 10, padding: '10px 12px', background: '#f8faf9', borderRadius: 8, fontSize: 11, color: '#333', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                              <div><b>Merchant:</b> {form.merchantName}</div>
                              <div><b>Phone:</b> {form.merchantNumber}</div>
                              <div><b>Amount:</b> ₹{form.withdrawAmount?.toLocaleString() || '–'}</div>
                              <div><b>Fees:</b> ₹{form.withdrawFees || 0}</div>
                              <div><b>Reason:</b> {form.reasonOfWithdraw || '–'}</div>
                              <div><b>Txn Date:</b> {form.transactionDate ? new Date(form.transactionDate).toLocaleDateString('en-IN') : '–'}</div>
                              <div><b>Date:</b> {date}</div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )
              )}

            </>
          );
        })()}

      </div>

      {/* ── KPI DETAILS BOTTOM SHEET ── */}
      {activeKpi && (() => {
        const details = getKpiDetails(activeKpi);
        if (!details) return null;
        return (
          <div className="bottom-sheet-overlay" onClick={() => setActiveKpi(null)}>
            <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
              <div className="bottom-sheet-handle"></div>
              
              <div className="bottom-sheet-header">
                <span className="bottom-sheet-title">{details.title} Details</span>
                <button className="bottom-sheet-close" onClick={() => setActiveKpi(null)}>✕</button>
              </div>
              
              <div className="bottom-sheet-content">
                {/* Highlighted KPI Summary */}
                <div className="kpi-summary-highlight">
                  <div className="kpi-summary-label">{details.title}</div>
                  <div className="kpi-summary-value">{details.totalValue}</div>
                  <div className="kpi-summary-desc">{details.desc}</div>
                </div>

                {details.type === 'bt-amount-performance' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '20px', marginTop: '10px' }}>
                    <div style={{ background: '#f5faf7', border: '1px solid #e8f3ed', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '10px', color: '#666', fontWeight: '600', textTransform: 'uppercase' }}>BT Target</div>
                      <div style={{ fontSize: '16px', fontWeight: '800', color: '#1a4731', marginTop: '4px' }}>
                        {details.btTarget > 0 ? `₹${details.btTarget.toLocaleString()}` : '–'}
                      </div>
                    </div>
                    <div style={{ background: '#e6f4ea', border: '1px solid #d8f3dc', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '10px', color: '#2e7d32', fontWeight: '600', textTransform: 'uppercase' }}>BT Completed</div>
                      <div style={{ fontSize: '16px', fontWeight: '800', color: '#2e7d32', marginTop: '4px' }}>
                        ₹{details.btCompleted.toLocaleString()}
                      </div>
                    </div>
                    <div style={{ background: '#fff7ed', border: '1px solid #ffedd5', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '10px', color: '#c2410c', fontWeight: '600', textTransform: 'uppercase' }}>Remaining Target</div>
                      <div style={{ fontSize: '16px', fontWeight: '800', color: '#c2410c', marginTop: '4px' }}>
                        {details.btTarget > 0 ? `₹${details.remaining.toLocaleString()}` : '–'}
                      </div>
                    </div>
                    <div style={{ background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '10px', color: '#1d4ed8', fontWeight: '600', textTransform: 'uppercase' }}>Achievement %</div>
                      <div style={{ fontSize: '16px', fontWeight: '800', color: '#1d4ed8', marginTop: '4px' }}>
                        {details.btTarget > 0 ? `${details.achievement}%` : '–'}
                      </div>
                    </div>
                  </div>
                )}

                {details.type === 'team-performance' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '20px', marginTop: '10px' }}>
                    <div style={{ background: '#f5faf7', border: '1px solid #e8f3ed', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '10px', color: '#666', fontWeight: '600', textTransform: 'uppercase' }}>Team Target</div>
                      <div style={{ fontSize: '16px', fontWeight: '800', color: '#1a4731', marginTop: '4px' }}>
                        ₹{(teamPerformance?.teamTarget || 0).toLocaleString()}
                      </div>
                    </div>
                    <div style={{ background: '#e6f4ea', border: '1px solid #d8f3dc', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '10px', color: '#2e7d32', fontWeight: '600', textTransform: 'uppercase' }}>BT Completed</div>
                      <div style={{ fontSize: '16px', fontWeight: '800', color: '#2e7d32', marginTop: '4px' }}>
                        ₹{(teamPerformance?.btCompleted || 0).toLocaleString()}
                      </div>
                    </div>
                    <div style={{ background: '#fff7ed', border: '1px solid #ffedd5', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '10px', color: '#c2410c', fontWeight: '600', textTransform: 'uppercase' }}>Remaining Target</div>
                      <div style={{ fontSize: '16px', fontWeight: '800', color: '#c2410c', marginTop: '4px' }}>
                        ₹{Math.max(0, (teamPerformance?.teamTarget || 0) - (teamPerformance?.btCompleted || 0)).toLocaleString()}
                      </div>
                    </div>
                    <div style={{ background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '10px', color: '#1d4ed8', fontWeight: '600', textTransform: 'uppercase' }}>Achievement %</div>
                      <div style={{ fontSize: '16px', fontWeight: '800', color: '#1d4ed8', marginTop: '4px' }}>
                        {teamPerformance?.teamTarget > 0 ? Math.round(((teamPerformance?.btCompleted || 0) / teamPerformance.teamTarget) * 100) : 0}%
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Items list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 20 }}>
                  {details.items.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-light)', fontSize: 13 }}>
                      No data found for the selected period.
                    </div>
                  ) : details.type === 'individual' || details.type === 'bt-amount-performance' ? (
                    // Individual daily operations list
                    details.items.map((item, idx) => (
                      <div key={idx} className="sheet-list-item">
                        <div className="sheet-list-left">
                          <div className="sheet-list-title">{item.name}</div>
                          <div className="sheet-list-subtitle">{item.detail}</div>
                        </div>
                        <div className="sheet-list-right">{item.value}</div>
                      </div>
                    ))
                  ) : details.type === 'team-performance' ? (
                    // Team BT Target details per FSE
                    details.items.map((item, idx) => {
                      const avatarInitials = item.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
                      const isAchieved = item.achievement >= 100;
                      return (
                        <div key={idx} className="employee-card">
                          <div className="employee-info-row">
                            <div className="employee-profile">
                              <div className="employee-avatar">{avatarInitials}</div>
                              <div>
                                <div className="employee-name">{item.name}</div>
                                <div className="employee-role">Target: ₹{item.target.toLocaleString()} · Remaining: ₹{item.remaining.toLocaleString()}</div>
                              </div>
                            </div>
                            <div className="employee-stats">
                              <div className="employee-value" style={{ color: isAchieved ? '#2e7d32' : 'var(--green-dark)' }}>₹{item.completed.toLocaleString()}</div>
                              <div className="employee-contrib">{item.achievement}% hit · {item.contribution}% team share</div>
                            </div>
                          </div>
                          <div className="progress-bar-container">
                            <div 
                              className={`progress-bar-fill ${isAchieved ? 'bg-primary' : details.color}`}
                              style={{ width: `${Math.min(100, item.achievement)}%` }}
                            ></div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    // Target progress card
                    details.items.map((item, idx) => {
                      const avatarInitials = (emp?.newJoinerName || 'Me').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
                      const isAchieved = item.percentage >= 100;
                      return (
                        <div key={idx} className="employee-card">
                          <div className="employee-info-row">
                            <div className="employee-profile">
                              <div className="employee-avatar">{avatarInitials}</div>
                              <div>
                                <div className="employee-name">{item.name}</div>
                                <div className="employee-role">Target: {item.targetValue} · Actual: {item.actualValue}</div>
                              </div>
                            </div>
                            <div className="employee-stats">
                              <div className="employee-value" style={{ color: isAchieved ? '#2e7d32' : 'var(--green-dark)' }}>{item.value}</div>
                              <div className="employee-contrib">{item.percentage}% target hit</div>
                            </div>
                          </div>
                          <div className="progress-bar-container">
                            <div 
                              className={`progress-bar-fill ${isAchieved ? 'bg-primary' : details.color}`}
                              style={{ width: `${item.percentage}%` }}
                            ></div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      <Footer />
    </>
  );
}

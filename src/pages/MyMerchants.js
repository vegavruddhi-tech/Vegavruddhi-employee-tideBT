import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:4001';

const STATUS_STYLES = {
  'Onboarded':    { bg: '#d8f3dc', color: '#1a4731' },
  'BT Active':    { bg: '#e0f2fe', color: '#0369a1' },
  'Completed':    { bg: '#d8f3dc', color: '#1a4731' },
  'Pending':      { bg: '#fef3c7', color: '#92400e' },
  'Ready For Onboarding': { bg: '#ede9fe', color: '#6b21a8' },
  'Not Interested': { bg: '#fee2e2', color: '#b91c1c' },
};
const getStatusStyle = s => STATUS_STYLES[s] || { bg: '#f1f5f9', color: '#475569' };

const fmt = d => {
  if (!d) return '–';
  const dt = new Date(d);
  return isNaN(dt) ? '–' : dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

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

const PAGE_SIZE = 20;

export default function MyMerchants() {
  const navigate = useNavigate();
  const token    = localStorage.getItem('token');

  const [emp,       setEmp]       = useState(null);
  const [merchants, setMerchants] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');

  const [search,         setSearch]         = useState('');
  const [statusFilter,   setStatusFilter]   = useState('');
  const [verifiedFilter, setVerifiedFilter] = useState('');
  const [btAmountRange,  setBtAmountRange]  = useState(''); // BT amount range filter
  const [btOnlyFilter,   setBtOnlyFilter]   = useState(false); // show only merchants with BT this month
  const [pendingFilter,  setPendingFilter]  = useState(''); // 'bt-left' | 'rp-left' | ''

  const BT_AMOUNT_RANGES = [
    { label: 'All Amounts',       value: '' },
    { label: '₹0 – ₹10,000',     value: '0-10000' },
    { label: '₹10,001 – ₹50,000',value: '10001-50000' },
    { label: '₹50,001 – ₹1,00,000', value: '50001-100000' },
    { label: '₹1,00,001 – ₹1,50,000', value: '100001-150000' },
    { label: '₹1,50,001 – ₹2,00,000', value: '150001-200000' },
  ];

  const matchesBtRange = useCallback((stage3Raw) => {
    if (!btAmountRange) return true;
    const stage3 = typeof stage3Raw === 'string'
      ? parseFloat(stage3Raw.replace(/,/g, '')) || 0
      : (stage3Raw || 0);
    const [min, max] = btAmountRange.split('-').map(Number);
    return stage3 >= min && stage3 <= max;
  }, [btAmountRange]);
  const [selectedMonth,  setSelectedMonth]  = useState(new Date().toLocaleString('en-US', { month: 'long' }));
  const [selectedYear,   setSelectedYear]   = useState(new Date().getFullYear().toString());
  const [page,           setPage]           = useState(1);
  const [selected,       setSelected]       = useState(null);
  const [btMonth,        setBtMonth]        = useState(''); // BT data source month label

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  // ── Load profile ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) { navigate('/'); return; }
    fetch(`${API_BASE}/api/auth/profile`, { headers: { Authorization: 'Bearer ' + token } })
      .then(r => { if (r.status === 401) { localStorage.clear(); navigate('/'); } return r.json(); })
      .then(setEmp).catch(() => {});
  }, [token, navigate]);

  // ── Load merchants ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (selectedMonth) params.set('selectedMonth', selectedMonth);
    if (selectedYear) params.set('selectedYear', selectedYear);
    fetch(`${API_BASE}/api/auth/tidebt-my-merchants?${params.toString()}`, { headers: { Authorization: 'Bearer ' + token } })
      .then(r => r.json())
      .then(d => {
        setMerchants(d.merchants || []);
        // Extract month from collection name e.g. "BT_TL_CONNECT MAY" → "May"
        if (d.btCollection) {
          const parts = d.btCollection.split(' ');
          const month = parts[parts.length - 1];
          if (month) setBtMonth(month.charAt(0) + month.slice(1).toLowerCase());
        } else {
          // fallback: use selectedMonth as label
          setBtMonth(selectedMonth || '');
        }
        setLoading(false);
      })
      .catch(() => { setError('Failed to load merchants.'); setLoading(false); });
  }, [token, selectedMonth, selectedYear]);

  // ── Summary counts ────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const counts = { total: merchants.length, onboarded: 0, btActive: 0, pending: 0, verified: 0 };
    merchants.forEach(m => {
      const s = (m.onboardingStatus || '').toLowerCase();
      if (s === 'onboarded' || s === 'completed') counts.onboarded++;
      else if (s === 'bt active') counts.btActive++;
      else counts.pending++;
      if (m.btVerified) counts.verified++;
    });
    return counts;
  }, [merchants]);

  // ── Unique statuses ───────────────────────────────────────────────────────
  const allStatuses = useMemo(() =>
    [...new Set(merchants.map(m => m.onboardingStatus).filter(Boolean))].sort(),
    [merchants]);

  // ── Filtered ──────────────────────────────────────────────────────────────
  // Month/Year dropdown only switches BT data (API re-fetch) — does NOT filter merchant list
  // Merchant list is always complete from bt_master
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return merchants.filter(m => {
      if (q && !(
        (m.merchantName || '').toLowerCase().includes(q) ||
        (m.merchantNumber || '').includes(q) ||
        (m.merchantCategory || '').toLowerCase().includes(q)
      )) return false;
      if (statusFilter && m.onboardingStatus !== statusFilter) return false;
      if (verifiedFilter === 'verified'   && !m.btVerified)  return false;
      if (verifiedFilter === 'unverified' &&  m.btVerified)  return false;
      // BT amount range filter
      if (btAmountRange && !matchesBtRange(m.stage3 || 0)) return false;
      // Show only merchants who have BT in selected month
      if (btOnlyFilter && !(m.stage3 > 0)) return false;
      // Pending filter — BT Left or RP Left
      if (pendingFilter === 'bt-left' && !(m.stage3Gap > 0)) return false;
      // RP Left = merchant has BT done (stage3 > 0) but RP not yet active AND pass not live
      // These are prime candidates for RP activation
      if (pendingFilter === 'rp-left') {
        const rpActive  = (m.rewardPassPro || '').toLowerCase() === 'active';
        const passLive  = (m.passLive || '').toLowerCase() === 'live';
        // If RP is already active OR pass is already live → not "RP Left"
        if (rpActive || passLive) return false;
      }
      return true;
    });
  }, [merchants, search, statusFilter, verifiedFilter, btOnlyFilter, btAmountRange, matchesBtRange, pendingFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged      = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => setPage(1), [search, statusFilter, verifiedFilter, btOnlyFilter, btAmountRange, pendingFilter]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <Navbar emp={emp} token={token} />
      <main style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: 80 }}>

        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #1a4731 0%, #2d6a4f 100%)', padding: '28px 20px 24px', color: '#fff' }}>
          <button onClick={() => navigate('/dashboard')}
            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, marginBottom: 16 }}>
            ← Dashboard
          </button>
          <div style={{ fontSize: 22, fontWeight: 800 }}>🏪 My Merchants</div>
          <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>
            {emp?.newJoinerName || ''} — BT data: {btMonth || selectedMonth || 'All Months'} {selectedYear}
          </div>
        </div>

        <div style={{ padding: '20px 16px', maxWidth: 900, margin: '0 auto' }}>

          {/* Summary chips */}
          {!loading && merchants.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
              {[
                { label: 'Total',     value: summary.total,     bg: '#1a4731', color: '#fff' },
                { label: 'Onboarded', value: summary.onboarded, bg: '#d8f3dc', color: '#1a4731' },
                { label: 'BT Active', value: summary.btActive,  bg: '#e0f2fe', color: '#0369a1' },
                { label: 'Pending',   value: summary.pending,   bg: '#fef3c7', color: '#92400e' },
                { label: 'BT Verified', value: summary.verified, bg: '#ede9fe', color: '#6b21a8' },
              ].map(c => (
                <div key={c.label} style={{ background: c.bg, color: c.color, borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 700, display: 'flex', gap: 5 }}>
                  <span>{c.value}</span><span style={{ fontWeight: 400 }}>{c.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Filters */}
          <div style={{ background: '#fff', borderRadius: 14, padding: 16, boxShadow: 'var(--shadow-sm)', marginBottom: 20 }}>

            {/* BT Month selector — controls which month's BT data is shown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>BT Data Month:</span>
              <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
                style={{ height: 34, borderRadius: 8, border: '2px solid #1a4731', fontSize: 13, padding: '0 10px', background: '#f0fdf4', color: '#1a4731', fontWeight: 700, outline: 'none' }}>
                <option value="">All Months</option>
                {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}
                style={{ height: 34, borderRadius: 8, border: '2px solid #1a4731', fontSize: 13, padding: '0 10px', background: '#f0fdf4', color: '#1a4731', fontWeight: 700, outline: 'none' }}>
                {[2026, 2025, 2024].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              {btMonth && (
                <span style={{ fontSize: 12, color: '#1a4731', background: '#d8f3dc', borderRadius: 20, padding: '3px 10px', fontWeight: 700 }}>
                  📊 Showing BT data: {btMonth}
                </span>
              )}
            </div>

            {/* Search + status filters */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <div style={{ flex: '1 1 200px', position: 'relative' }}>
                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }}>🔍</span>
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search name, number, category..."
                  style={{ width: '100%', paddingLeft: 32, paddingRight: 12, height: 38, borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none', fontFamily: 'var(--font)' }} />
              </div>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                style={{ flex: '0 1 150px', height: 38, borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, padding: '0 10px', background: '#fff', outline: 'none' }}>
                <option value="">All Statuses</option>
                {allStatuses.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={verifiedFilter} onChange={e => setVerifiedFilter(e.target.value)}
                style={{ flex: '0 1 150px', height: 38, borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, padding: '0 10px', background: '#fff', outline: 'none' }}>
                <option value="">All Merchants</option>
                <option value="verified">BT Verified ✅</option>
                <option value="unverified">Not Verified ⏳</option>
              </select>
              {/* BT Amount Range filter */}
              <select value={btAmountRange} onChange={e => setBtAmountRange(e.target.value)}
                style={{ flex: '0 1 190px', height: 38, borderRadius: 8, border: `1.5px solid ${btAmountRange ? '#1a4731' : '#e2e8f0'}`, fontSize: 13, padding: '0 10px', background: btAmountRange ? '#f0fdf4' : '#fff', color: btAmountRange ? '#1a4731' : '#374151', fontWeight: btAmountRange ? 700 : 400, outline: 'none' }}>
                {BT_AMOUNT_RANGES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              {/* BT only toggle */}
              <button onClick={() => setBtOnlyFilter(v => !v)}
                style={{ height: 38, borderRadius: 8, border: `1.5px solid ${btOnlyFilter ? '#e65100' : '#e2e8f0'}`, background: btOnlyFilter ? '#fff3e0' : '#fff', color: btOnlyFilter ? '#e65100' : '#64748b', fontSize: 12, padding: '0 12px', cursor: 'pointer', fontWeight: btOnlyFilter ? 700 : 400 }}>
                {btOnlyFilter ? '🔥 BT Done Only' : 'BT Done Only'}
              </button>
              {/* BT Left / RP Left pending filters */}
              <button onClick={() => setPendingFilter(v => v === 'bt-left' ? '' : 'bt-left')}
                style={{ height: 38, borderRadius: 8, border: `1.5px solid ${pendingFilter === 'bt-left' ? '#c2410c' : '#e2e8f0'}`, background: pendingFilter === 'bt-left' ? '#ffedd5' : '#fff', color: pendingFilter === 'bt-left' ? '#c2410c' : '#64748b', fontSize: 12, padding: '0 12px', cursor: 'pointer', fontWeight: pendingFilter === 'bt-left' ? 700 : 400 }}>
                ⏳ BT Left
              </button>
              <button onClick={() => setPendingFilter(v => v === 'rp-left' ? '' : 'rp-left')}
                style={{ height: 38, borderRadius: 8, border: `1.5px solid ${pendingFilter === 'rp-left' ? '#6b21a8' : '#e2e8f0'}`, background: pendingFilter === 'rp-left' ? '#f3e8ff' : '#fff', color: pendingFilter === 'rp-left' ? '#6b21a8' : '#64748b', fontSize: 12, padding: '0 12px', cursor: 'pointer', fontWeight: pendingFilter === 'rp-left' ? 700 : 400 }}>
                🎁 RP Left
              </button>
              {(search || statusFilter || verifiedFilter || btAmountRange || btOnlyFilter || pendingFilter) && (
                <button onClick={() => { setSearch(''); setStatusFilter(''); setVerifiedFilter(''); setBtAmountRange(''); setBtOnlyFilter(false); setPendingFilter(''); }}
                  style={{ height: 38, borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', fontSize: 13, padding: '0 14px', cursor: 'pointer', color: '#b91c1c' }}>
                  ✕ Clear Filters
                </button>
              )}
            </div>
            {filtered.length !== merchants.length && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-light)' }}>
                Showing {filtered.length} of {merchants.length} merchants
              </div>
            )}
          </div>

          {/* Loading */}
          {loading && [1,2,3,4,5].map(i => <div key={i} className="skeleton" style={{ height: 76, borderRadius: 12, marginBottom: 10 }} />)}

          {/* Error */}
          {error && !loading && (
            <div style={{ background: '#fee2e2', borderRadius: 12, padding: '16px 20px', color: '#b91c1c', fontSize: 14, textAlign: 'center' }}>{error}</div>
          )}

          {/* Empty */}
          {!loading && !error && merchants.length === 0 && (
            <div style={{ background: '#fff', borderRadius: 16, padding: '48px 24px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🏪</div>
              <div style={{ fontSize: 17, fontWeight: 700 }}>No merchants yet</div>
              <div style={{ fontSize: 13, color: 'var(--text-light)', marginBottom: 20 }}>Submit daily visit forms to see your merchants here.</div>
            </div>
          )}

          {/* No results */}
          {!loading && !error && merchants.length > 0 && filtered.length === 0 && (
            <div style={{ background: '#fff', borderRadius: 16, padding: '32px 24px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>🔍</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>No merchants match your filters</div>
              <button onClick={() => { setSearch(''); setStatusFilter(''); setVerifiedFilter(''); }}
                style={{ marginTop: 12, background: 'transparent', border: '1.5px solid var(--green-dark)', color: 'var(--green-dark)', borderRadius: 8, padding: '8px 18px', fontSize: 13, cursor: 'pointer' }}>
                Clear Filters
              </button>
            </div>
          )}

          {/* Cards */}
          {!loading && !error && paged.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {paged.map((m, i) => {
                const st = getStatusStyle(m.onboardingStatus);
                return (
                  <div key={m.merchantNumber + i} onClick={() => setSelected(m)}
                    style={{ background: '#fff', borderRadius: 14, padding: '14px 16px', boxShadow: 'var(--shadow-sm)', cursor: 'pointer', border: '1.5px solid transparent', transition: 'all 0.2s', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--green-pale)'; e.currentTarget.style.boxShadow = 'var(--shadow)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}>
                    <div style={{ display: 'flex', gap: 12, flex: 1, minWidth: 0 }}>
                      <div style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, background: 'var(--green-pale)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🏪</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-dark)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {m.merchantName}
                          {m.btVerified && <span style={{ marginLeft: 6, fontSize: 11, color: '#1a4731' }}>✅</span>}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 2 }}>
                          📞 {m.merchantNumber}{m.merchantCategory && m.merchantCategory !== '–' ? ` · ${m.merchantCategory}` : ''}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 2 }}>
                          🗓 Onboarded: {fmt(m.submissionDate)}{m.visitCount > 1 ? ` · ${m.visitCount} visits` : ''}
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                          {/* Current Stage */}
                          {(() => {
                            const stage3  = parseFloat(m.stage3) || 0;
                            const passLive = (m.passLive || '').toLowerCase() === 'live';
                            const rpActive = (m.rewardPassPro || '').toLowerCase() === 'active';
                            const btDone   = stage3 > 0;
                            let stageName = 'Ready';
                            let stageColor = '#6b21a8';
                            let stageBg = '#f3e8ff';
                            if (passLive) {
                              stageName = 'RP Live';
                              stageColor = '#1a4731';
                              stageBg = '#d8f3dc';
                            } else if (rpActive) {
                              stageName = 'RP Active';
                              stageColor = '#0369a1';
                              stageBg = '#e0f2fe';
                            } else if (btDone) {
                              stageName = 'BT Done';
                              stageColor = '#e65100';
                              stageBg = '#fff3e0';
                            }
                            return (
                              <span style={{ fontSize: 9, background: stageBg, color: stageColor, padding: '2px 8px', borderRadius: 6, fontWeight: 700, border: `1px solid ${stageColor}20` }}>
                                Stage: {stageName}
                              </span>
                            );
                          })()}

                          {/* BT Completed */}
                          <span style={{ fontSize: 9, background: m.stage3 > 0 ? '#fff3e0' : '#f1f5f9', color: m.stage3 > 0 ? '#e65100' : '#64748b', padding: '2px 8px', borderRadius: 6, fontWeight: 700, border: m.stage3 > 0 ? '1px solid #e6510020' : '1px solid #e2e8f0' }}>
                            BT Completed: ₹{(m.stage3 || 0).toLocaleString()}
                          </span>

                          {/* BT Gap */}
                          <span style={{ fontSize: 9, background: m.stage3Gap > 0 ? '#fee2e2' : '#f1f5f9', color: m.stage3Gap > 0 ? '#b91c1c' : '#64748b', padding: '2px 8px', borderRadius: 6, fontWeight: 700, border: m.stage3Gap > 0 ? '1px solid #b91c1c20' : '1px solid #e2e8f0' }}>
                            Gap: ₹{(m.stage3Gap || 0).toLocaleString()}
                          </span>

                          {/* RP Status */}
                          <span style={{ fontSize: 9, background: (m.rewardPassPro || '').toLowerCase() === 'active' ? '#ede9fe' : '#f1f5f9', color: (m.rewardPassPro || '').toLowerCase() === 'active' ? '#7c3aed' : '#64748b', padding: '2px 8px', borderRadius: 6, fontWeight: 700, border: (m.rewardPassPro || '').toLowerCase() === 'active' ? '1px solid #7c3aed20' : '1px solid #e2e8f0' }}>
                            RP: {(m.rewardPassPro || '').toLowerCase() === 'active' ? 'Active ✓' : 'Not Active'}
                          </span>

                          {/* Pass Live Status */}
                          <span style={{ fontSize: 9, background: (m.passLive || '').toLowerCase() === 'live' ? '#d8f3dc' : '#f1f5f9', color: (m.passLive || '').toLowerCase() === 'live' ? '#1a4731' : '#64748b', padding: '2px 8px', borderRadius: 6, fontWeight: 700, border: (m.passLive || '').toLowerCase() === 'live' ? '1px solid #1a473120' : '1px solid #e2e8f0' }}>
                            Pass: {(m.passLive || '').toLowerCase() === 'live' ? 'Live ✓' : 'Not Live'}
                          </span>

                          {/* UPI Transaction Count */}
                          <span style={{ fontSize: 9, background: m.upiTxnCount > 0 ? '#e0f2fe' : '#f1f5f9', color: m.upiTxnCount > 0 ? '#0369a1' : '#64748b', padding: '2px 8px', borderRadius: 6, fontWeight: 700, border: m.upiTxnCount > 0 ? '1px solid #0369a120' : '1px solid #e2e8f0' }}>
                            UPI Txns: {m.upiTxnCount || 0}
                          </span>

                          {/* Total UPI Amount */}
                          <span style={{ fontSize: 9, background: m.upiAmount > 0 ? '#e0f2fe' : '#f1f5f9', color: m.upiAmount > 0 ? '#0369a1' : '#64748b', padding: '2px 8px', borderRadius: 6, fontWeight: 700, border: m.upiAmount > 0 ? '1px solid #0369a120' : '1px solid #e2e8f0' }}>
                            UPI Amt: ₹{(m.upiAmount || 0).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                      <span style={{ ...st, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{m.onboardingStatus || 'Pending'}</span>
                      <span style={{ fontSize: 16, color: 'var(--text-light)' }}>›</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && !loading && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 24 }}>
              <PagBtn onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹</PagBtn>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let p = totalPages <= 5 ? i+1 : page <= 3 ? i+1 : page >= totalPages-2 ? totalPages-4+i : page-2+i;
                return <PagBtn key={p} onClick={() => setPage(p)} active={page === p}>{p}</PagBtn>;
              })}
              <PagBtn onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>›</PagBtn>
              <span style={{ fontSize: 12, color: 'var(--text-light)' }}>Page {page} of {totalPages}</span>
            </div>
          )}
        </div>
      </main>

      {/* Detail bottom sheet */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 999, display: 'flex', alignItems: 'flex-end' }}
          onClick={() => setSelected(null)}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxHeight: '80vh', overflowY: 'auto', padding: '20px 20px 40px' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ width: 40, height: 4, background: '#e2e8f0', borderRadius: 2, margin: '0 auto 20px' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800 }}>{selected.merchantName}</div>
                <div style={{ fontSize: 13, color: 'var(--text-light)', marginTop: 2 }}>📞 {selected.merchantNumber}</div>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontSize: 16 }}>×</button>
            </div>

            {/* Status badges */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
              <span style={{ ...getStatusStyle(selected.onboardingStatus), padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                {selected.onboardingStatus || 'Pending'}
              </span>
              {selected.btVerified && (
                <span style={{ background: '#d8f3dc', color: '#1a4731', padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                  ✅ BT Verified
                </span>
              )}
              {!selected.btVerified && (
                <span style={{ background: '#fef3c7', color: '#92400e', padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                  ⏳ BT Pending
                </span>
              )}
            </div>

            {/* Details */}
            {/* Progress Metrics Section */}
            <div style={{ margin: '16px 0 8px', fontSize: 11, fontWeight: 800, color: '#1a4731', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              📊 Progress Metrics ({btMonth})
            </div>
            <div style={{ background: '#f8faf9', borderRadius: 10, padding: '4px 12px', marginBottom: 16, border: '1px solid #e8f3ed' }}>
              {[
                ['Current Stage', (() => {
                  const stage3  = parseFloat(selected.stage3) || 0;
                  const passLive = (selected.passLive || '').toLowerCase() === 'live';
                  const rpActive = (selected.rewardPassPro || '').toLowerCase() === 'active';
                  const btDone   = stage3 > 0;
                  if (passLive) return 'RP Live 🎉';
                  if (rpActive) return 'RP Active';
                  if (btDone) return 'BT Done';
                  return 'Ready';
                })()],
                ['Onboarding Status', selected.onboardingStatus || 'Pending'],
                ['BT Completed', `₹${(selected.stage3 || 0).toLocaleString()}`],
                ['BT Gap/Remaining Amount', `₹${(selected.stage3Gap || 0).toLocaleString()}`],
                ['RP Status', (selected.rewardPassPro || '').toLowerCase() === 'active' ? 'Active ✓' : 'Not Active'],
                ['Pass Live Status', (selected.passLive || '').toLowerCase() === 'live' ? 'Live ✓' : 'Not Live'],
                ['UPI Transaction Count', `${selected.upiTxnCount || 0} txn`],
                ['Total UPI Amount', `₹${(selected.upiAmount || 0).toLocaleString()}`],
                ['Last Activity Date', fmt(selected.lastActivity)],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #e8f3ed' }}>
                  <span style={{ fontSize: 13, color: '#555' }}>{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 750, color: '#1a4731' }}>{value}</span>
                </div>
              ))}
            </div>

            <div style={{ margin: '16px 0 8px', fontSize: 11, fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              📋 Additional Details
            </div>
            {[
              ['Category',          selected.merchantCategory],
              ['Email',             selected.merchantEmailId],
              ['TL',                selected.tl],
              ['Form Submitted',    fmt(selected.submissionDate)],
              ['Visit Count',       selected.visitCount > 1 ? `${selected.visitCount} visits` : null],
              ['Latest Opinion',    selected.latestOpinion],
              ['UPI Status',        selected.upiActive !== '–' ? selected.upiActive : null],
              ['RP Active Date',    fmtExcelDate(selected.rewardsPassProActiveDate)],
              ['Priority Pass',     selected.priorityPassStatus !== '–' ? selected.priorityPassStatus : null],
              ['MSME/GST',          selected.msmegstStatus !== '–' ? selected.msmegstStatus : null],
              ['Insurance',         selected.insuranceStatus !== '–' ? selected.insuranceStatus : null],
            ].filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== '–').map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: 13, color: 'var(--text-light)' }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dark)', textAlign: 'right', maxWidth: '60%' }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Footer />
    </>
  );
}

function PagBtn({ onClick, disabled, active, children }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ width: 34, height: 34, borderRadius: 8, border: '1.5px solid', borderColor: active ? 'var(--green-dark)' : '#e2e8f0', background: active ? 'var(--green-dark)' : '#fff', color: active ? '#fff' : disabled ? '#ccc' : 'var(--text-dark)', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 14, fontFamily: 'var(--font)', fontWeight: active ? 700 : 400 }}>
      {children}
    </button>
  );
}

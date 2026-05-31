import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

// Use existing backend (port 4000) for profile data
const PROFILE_API_BASE = 'http://localhost:4000';

export default function Dashboard() {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const [emp, setEmp] = useState(null);
  const [myForms, setMyForms] = useState([]);
  const [expandedForm, setExpandedForm] = useState(null);
  const [receivedPayments, setReceivedPayments] = useState([]);

  // Load profile from existing backend
  useEffect(() => {
    if (!token) {
      navigate('/');
      return;
    }
    
    fetch(`${PROFILE_API_BASE}/api/auth/profile`, { 
      headers: { Authorization: 'Bearer ' + token } 
    })
      .then(r => { 
        if (r.status === 401) { 
          localStorage.clear(); 
          navigate('/'); 
        } 
        return r.json(); 
      })
      .then(setEmp)
      .catch(console.error);
  }, [token, navigate]);

  // Fetch my Tide BT forms
  useEffect(() => {
    if (!token) return;
    fetch(`${PROFILE_API_BASE}/api/auth/tidebt-my-forms`, {
      headers: { Authorization: 'Bearer ' + token }
    })
      .then(r => r.json())
      .then(data => setMyForms(Array.isArray(data) ? data : []))
      .catch(() => setMyForms([]));
  }, [token]);

  // Fetch received payments
  useEffect(() => {
    if (!token) return;
    fetch(`${PROFILE_API_BASE}/api/auth/tidebt-received-payments`, {
      headers: { Authorization: 'Bearer ' + token }
    })
      .then(r => r.json())
      .then(data => setReceivedPayments(data.payments || []))
      .catch(() => setReceivedPayments([]));
  }, [token]);

  return (
    <>
      <Navbar emp={emp} token={token} />
      <div className="main-content">
        
        {/* Welcome card - with Tide BT label */}
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
              <div style={{ fontSize: 9, fontWeight: 600, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tide BT</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>Total Forms: {myForms.length}</div>
            </div>
            <Link to="/profile" className="profile-btn" style={{ fontSize: 13, padding: '8px 16px' }}>View My Profile ›</Link>
          </div>
        </div>

        {/* Daily Visit Form button */}
        <Link to="/daily-visit" style={{ textDecoration: 'none', display: 'block', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px', background: 'linear-gradient(135deg, #1a4731 0%, #2d7a4f 100%)', borderRadius: 14, color: '#fff', cursor: 'pointer', boxShadow: '0 4px 16px rgba(26,71,49,0.25)', transition: 'all 0.3s' }}>
            <span style={{ fontSize: 28 }}>📋</span>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Tide BT Onboarding</div>
              <div style={{ fontSize: 11, opacity: 0.8 }}>Fill Tide BT daily onboarding data</div>
            </div>
          </div>
        </Link>

        {/* Mobikwik/Payzapp Withdraw button */}
        <Link to="/mobikwik-withdraw" style={{ textDecoration: 'none', display: 'block', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px', background: 'linear-gradient(135deg, #4338ca 0%, #6366f1 100%)', borderRadius: 14, color: '#fff', cursor: 'pointer', boxShadow: '0 4px 16px rgba(67,56,202,0.25)', transition: 'all 0.3s' }}>
            <span style={{ fontSize: 28 }}>💸</span>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Mobikwik/Payzapp Withdraw</div>
              <div style={{ fontSize: 11, opacity: 0.8 }}>Submit withdraw request with reason</div>
            </div>
          </div>
        </Link>

        {/* Quick overview */}
        <div className="section-title" style={{ marginTop: 20, marginBottom: 10 }}>Quick Overview</div>
        <div className="info-grid" style={{ gap: 10 }}>
          {[
            { icon: '💼', label: 'Position',          value: emp?.position },
            { icon: '📍', label: 'Location',           value: emp?.location },
            { icon: '👤', label: 'Reporting Manager',  value: emp?.reportingManager },
            { icon: '●',  label: 'Status',             value: emp?.status },
          ].map(c => (
            <div className="info-card dash-card" key={c.label} style={{ padding: '12px 14px' }}>
              <div className="dash-icon" style={{ fontSize: 18, marginBottom: 6 }}>{c.icon}</div>
              <div className="label" style={{ fontSize: 10, marginBottom: 4 }}>{c.label}</div>
              <div className="value" style={{ fontSize: 14 }}>{c.value || '–'}</div>
            </div>
          ))}
        </div>

        {/* FSE Dashboard Stats */}
        <div className="section-title" style={{ marginTop: 20, marginBottom: 10 }}>FSE Dashboard</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
          {[
            { label: 'Count Tide BT', value: '–', icon: '📊', color: '#1a4731', bg: '#e6f4ea' },
            { label: 'Reward Pass', value: '–', icon: '🏅', color: '#0369a1', bg: '#e0f2fe' },
            { label: 'Target Reward Pass', value: '–', icon: '🎁', color: '#4338ca', bg: '#ede9fe' },
            { label: 'Target Tide BT', value: '–', icon: '🎯', color: '#b45309', bg: '#fef3c7' },
            { label: 'Todays Tide BT', value: '–', icon: '📈', color: '#0f766e', bg: '#ccfbf1' },
            { label: 'Yesterdays Tide BT', value: '–', icon: '📉', color: '#6b21a8', bg: '#f3e8ff' },
            { label: 'Achievement %', value: '–', icon: '🏆', color: '#15803d', bg: '#dcfce7' },
            { label: 'Remaining Target', value: '–', icon: '⏳', color: '#c2410c', bg: '#ffedd5' },
          ].map(stat => (
            <div key={stat.label} style={{
              background: '#fff', borderRadius: 12, padding: '16px 14px',
              border: '1.5px solid #e8f3ed', boxShadow: '0 2px 8px rgba(26,71,49,0.06)',
              display: 'flex', flexDirection: 'column', gap: 8
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: stat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{stat.icon}</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{stat.label}</div>
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: stat.color }}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Received Funds */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 12 }}>
          <div className="section-title" style={{ margin: 0 }}>💰 Received Funds</div>
          <div style={{ background: '#e3f2fd', color: '#1565c0', padding: '4px 12px', borderRadius: 16, fontSize: 12, fontWeight: 700 }}>
            {receivedPayments.length} Payments
          </div>
        </div>

        {receivedPayments.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 14, border: '1.5px solid #e8f3ed', padding: '24px 20px', textAlign: 'center', marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: '#888', margin: 0 }}>No payments received yet.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {receivedPayments.map((p, i) => (
              <div key={i} style={{ background: '#fff', borderRadius: 12, border: '1.5px solid #e8f3ed', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1a4731' }}>₹{p.amount?.toLocaleString()}</div>
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                    From: <strong>{p.senderName}</strong> · {p.paymentDoneOn} · {p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '–'}
                  </div>
                </div>
                <div style={{ padding: '4px 10px', borderRadius: 8, fontSize: 10, fontWeight: 700, background: '#e6f4ea', color: '#2e7d32' }}>
                  Received
                </div>
              </div>
            ))}
          </div>
        )}

        {/* My Merchant Forms */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 12 }}>
          <div className="section-title" style={{ margin: 0 }}>My Merchant Forms</div>
          <div style={{ background: '#e6f4ea', color: '#1a4731', padding: '4px 12px', borderRadius: 16, fontSize: 12, fontWeight: 700 }}>
            {myForms.length} Forms
          </div>
        </div>

        {myForms.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 14, border: '1.5px solid #e8f3ed', overflow: 'hidden' }}>
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
              <p style={{ fontSize: 14, color: '#666', margin: 0 }}>No forms submitted yet. Fill your first Daily Visit form above.</p>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {myForms.map((form, i) => {
              const date = new Date(form.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
              const isOnboarding = form.merchantOpinion === 'Ready For Onboarding';
              const isExpanded = expandedForm === (form._id || i);
              return (
                <div key={form._id || i} style={{ background: '#fff', borderRadius: 12, border: `1.5px solid ${isExpanded ? '#2d7a4f' : '#e8f3ed'}`, overflow: 'hidden', cursor: 'pointer', transition: 'all 0.2s' }}
                  onClick={() => setExpandedForm(isExpanded ? null : (form._id || i))}>
                  <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: isOnboarding ? '#e6f4ea' : '#fdecea', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: isOnboarding ? '#2e7d32' : '#c62828', flexShrink: 0 }}>
                      {form.merchantName?.charAt(0).toUpperCase() || '?'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#1a4731' }}>{form.merchantName}</div>
                      <div style={{ fontSize: 11, color: '#888', display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                        <span>📞 {form.merchantNumber}</span>
                        {form.merchantCategory && <span>🏷️ {form.merchantCategory}</span>}
                        <span>📅 {date}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 10, fontWeight: 700, background: isOnboarding ? '#e6f4ea' : '#fdecea', color: isOnboarding ? '#2e7d32' : '#c62828' }}>
                        {form.merchantOpinion || form.formType}
                      </span>
                    </div>
                  </div>
                  {isExpanded && (
                    <div style={{ padding: '0 16px 14px', borderTop: '1px solid #e8f3ed', marginTop: 0, paddingTop: 12 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <div><span style={{ fontSize: 10, color: '#888', fontWeight: 600 }}>Merchant Opinion</span><div style={{ fontSize: 13, fontWeight: 600, color: '#1a4731' }}>{form.merchantOpinion || '–'}</div></div>
                        <div><span style={{ fontSize: 10, color: '#888', fontWeight: 600 }}>Category</span><div style={{ fontSize: 13, fontWeight: 600, color: '#1a4731' }}>{form.merchantCategory || '–'}</div></div>
                        {form.onboardingStatus && <div><span style={{ fontSize: 10, color: '#888', fontWeight: 600 }}>Onboarding Status</span><div style={{ fontSize: 13, fontWeight: 600, color: '#1a4731' }}>{form.onboardingStatus}</div></div>}
                        {form.merchantEmailId && <div><span style={{ fontSize: 10, color: '#888', fontWeight: 600 }}>Merchant Email</span><div style={{ fontSize: 13, fontWeight: 600, color: '#1a4731' }}>{form.merchantEmailId}</div></div>}
                        {form.formType === 'mobikwik-withdraw' && <>
                          <div><span style={{ fontSize: 10, color: '#888', fontWeight: 600 }}>Withdraw Amount</span><div style={{ fontSize: 13, fontWeight: 600, color: '#1a4731' }}>₹{form.withdrawAmount || '–'}</div></div>
                          <div><span style={{ fontSize: 10, color: '#888', fontWeight: 600 }}>Withdraw Fees</span><div style={{ fontSize: 13, fontWeight: 600, color: '#1a4731' }}>₹{form.withdrawFees || '–'}</div></div>
                          <div><span style={{ fontSize: 10, color: '#888', fontWeight: 600 }}>Reason</span><div style={{ fontSize: 13, fontWeight: 600, color: '#1a4731' }}>{form.reasonOfWithdraw || '–'}</div></div>
                          <div><span style={{ fontSize: 10, color: '#888', fontWeight: 600 }}>Transaction Date</span><div style={{ fontSize: 13, fontWeight: 600, color: '#1a4731' }}>{form.transactionDate ? new Date(form.transactionDate).toLocaleDateString('en-IN') : '–'}</div></div>
                        </>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

      </div>
      <Footer />
    </>
  );
}

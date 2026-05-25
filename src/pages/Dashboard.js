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
              <div style={{ fontSize: 18, fontWeight: 700 }}>Total Forms: 0</div>
            </div>
            <Link to="/profile" className="profile-btn" style={{ fontSize: 13, padding: '8px 16px' }}>View My Profile ›</Link>
          </div>
        </div>

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

        {/* Coming Soon Message */}
        <div style={{ marginTop: 40, textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🚀</div>
          <h2 style={{ fontSize: 24, color: '#1a4731', marginBottom: 12 }}>Tide BT Dashboard Coming Soon!</h2>
          <p style={{ fontSize: 14, color: '#666', maxWidth: 500, margin: '0 auto' }}>
            We're building amazing features for Tide BT. Stay tuned for form submission, merchant tracking, and more!
          </p>
        </div>

      </div>
      <Footer />
    </>
  );
}

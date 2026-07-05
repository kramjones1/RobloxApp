import React, { useEffect, useState } from 'react';

interface NavbarProps {
  page: string;
  setPage: (p: string) => void;
  user: any;
  onLogout: () => void;
}

const activeColor = '#6c63ff';

const styles = {
  topNav: {
    position: 'fixed' as const,
    top: 0, left: 0, right: 0,
    zIndex: 100,
    background: 'rgba(10,10,10,0.85)',
    backdropFilter: 'blur(12px)',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    padding: '0 24px',
    height: 60,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontFamily: 'system-ui, sans-serif',
  },
  logo: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: '-0.5px',
    background: 'linear-gradient(135deg, #6c63ff, #2a6eff)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    flexShrink: 0,
  },
  link: {
    color: '#999',
    fontSize: 13,
    cursor: 'pointer',
    transition: 'color 0.2s',
    background: 'none',
    border: 'none',
    fontFamily: 'inherit',
    padding: 0,
    whiteSpace: 'nowrap' as const,
  },
  linkActive: {
    color: '#fff',
    fontSize: 13,
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    fontFamily: 'inherit',
    padding: 0,
    whiteSpace: 'nowrap' as const,
  },
  topLinks: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  userSection: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  email: {
    color: '#888',
    fontSize: 12,
    display: 'none',
  },
  logoutBtn: {
    background: 'none',
    border: '1px solid #444',
    color: '#aaa',
    borderRadius: 6,
    padding: '3px 10px',
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap' as const,
  },
};

export default function Navbar({ page, setPage, user, onLogout }: NavbarProps) {
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    function check() { setMobile(window.innerWidth < 700); }
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  if (mobile) {
    return (
      <nav style={{
        position: 'fixed', bottom: 20, right: 16, zIndex: 100,
        display: 'flex', flexDirection: 'column', gap: 2,
        background: 'rgba(15,15,15,0.92)', backdropFilter: 'blur(16px)',
        borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)',
        padding: 4, boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        fontFamily: 'system-ui, sans-serif',
      }}>
        {[
          { id: 'home', icon: '⌂' },
          ...(user ? [{ id: 'messages' as const, icon: '✉' }] : []),
          ...(user ? [{ id: 'profile' as const, icon: '👤' }] : []),
        ].map(t => (
          <button key={t.id} onClick={() => setPage(t.id)} style={{
            width: 44, height: 44, borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: page === t.id ? 'rgba(108,99,255,0.2)' : 'transparent',
            border: 'none', cursor: 'pointer', fontSize: 20, lineHeight: 1,
            fontFamily: 'inherit', transition: 'all 0.15s',
          }}>
            {t.icon}
          </button>
        ))}
        {user && (
          <button onClick={onLogout} style={{
            width: 44, height: 44, borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontSize: 18, lineHeight: 1, fontFamily: 'inherit',
          }}>
            🚪
          </button>
        )}
      </nav>
    );
  }

  return (
    <nav style={styles.topNav}>
      <span style={styles.logo} onClick={() => setPage('home')}>LiveMe</span>
      <div style={styles.topLinks}>
        <button style={page === 'home' ? styles.linkActive : styles.link} onClick={() => setPage('home')}>Home</button>
        {user && <button style={page === 'messages' ? styles.linkActive : styles.link} onClick={() => setPage('messages')}>Messages</button>}
        {user && <button style={page === 'profile' ? styles.linkActive : styles.link} onClick={() => setPage('profile')}>Profile</button>}
        <button style={page === 'privacy' ? styles.linkActive : styles.link} onClick={() => setPage('privacy')}>Privacy</button>
        <button style={page === 'terms' ? styles.linkActive : styles.link} onClick={() => setPage('terms')}>Terms</button>
      </div>
      {user && (
        <div style={styles.userSection}>
          <span style={styles.email}>{user.email}</span>
          <button style={styles.logoutBtn} onClick={onLogout}>Logout</button>
        </div>
      )}
    </nav>
  );
}

import React, { useEffect, useRef, useState } from 'react';

interface NavbarProps {
  page: string;
  setPage: (p: string) => void;
  user: any;
  onLogout: () => void;
}

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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function check() { setMobile(window.innerWidth < 700); }
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    if (menuOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  function nav(pageId: string) {
    setPage(pageId);
    setMenuOpen(false);
  }

  if (mobile) {
    return (
      <div ref={menuRef} style={{ fontFamily: 'system-ui, sans-serif' }}>
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
          height: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 14px',
          background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          <span style={{
            fontSize: 18, fontWeight: 700, cursor: 'pointer',
            background: 'linear-gradient(135deg, #6c63ff, #2a6eff)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }} onClick={() => nav('home')}>LiveMe</span>
          <button onClick={() => setMenuOpen(o => !o)} style={{
            background: 'none', border: 'none', color: '#fff', fontSize: 24,
            cursor: 'pointer', padding: '4px 8px', fontFamily: 'inherit', lineHeight: 1,
          }}>{menuOpen ? '✕' : '☰'}</button>
        </div>
        {menuOpen && (
          <div style={{
            position: 'fixed', top: 48, left: 0, right: 0, zIndex: 99,
            background: 'rgba(15,15,15,0.97)', backdropFilter: 'blur(16px)',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            padding: '8px 0', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}>
            {[
              { id: 'home', label: 'Home' },
              ...(user ? [{ id: 'messages' as const, label: 'Messages' }] : []),
              ...(user ? [{ id: 'profile' as const, label: 'Profile' }] : []),
              { id: 'privacy', label: 'Privacy' },
              { id: 'terms', label: 'Terms' },
            ].map(t => (
              <button key={t.id} onClick={() => nav(t.id)} style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '10px 20px',
                background: page === t.id ? 'rgba(108,99,255,0.12)' : 'transparent',
                border: 'none', color: page === t.id ? '#fff' : '#bbb', fontSize: 15,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>{t.label}</button>
            ))}
            {user && (
              <button onClick={() => { onLogout(); setMenuOpen(false); }} style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '10px 20px',
                background: 'transparent', border: 'none', color: '#f44336', fontSize: 15,
                cursor: 'pointer', fontFamily: 'inherit', borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 4,
              }}>Logout</button>
            )}
          </div>
        )}
      </div>
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

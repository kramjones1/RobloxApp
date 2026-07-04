import React from 'react';

interface NavbarProps {
  page: string;
  setPage: (p: string) => void;
  user: any;
  onLogout: () => void;
}

const styles = {
  nav: {
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
  links: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
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
  emailDesktop: {
    color: '#888',
    fontSize: 12,
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
  return (
    <nav style={styles.nav}>
        <span style={styles.logo} onClick={() => setPage('home')}>LiveMe</span>
      <div style={styles.links}>
        <button style={page === 'home' ? styles.linkActive : styles.link} onClick={() => setPage('home')}><span className="nav-label">Home</span><span className="nav-icon">⌂</span></button>
        {user && <button style={page === 'profile' ? styles.linkActive : styles.link} onClick={() => setPage('profile')}><span className="nav-label">Profile</span><span className="nav-icon">👤</span></button>}
        <button style={page === 'privacy' ? styles.linkActive : styles.link} onClick={() => setPage('privacy')}><span className="nav-label">Privacy</span><span className="nav-icon">🔒</span></button>
        <button style={page === 'terms' ? styles.linkActive : styles.link} onClick={() => setPage('terms')}><span className="nav-label">Terms</span><span className="nav-icon">📄</span></button>
      </div>
      {user && (
        <div style={styles.userSection}>
          <span className="nav-email" style={styles.email}>{user.email}</span>
          <button style={styles.logoutBtn} onClick={onLogout}>Logout</button>
        </div>
      )}
    </nav>
  );
}

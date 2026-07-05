import React from 'react';

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
  bottomNav: {
    position: 'fixed' as const,
    bottom: 0, left: 0, right: 0,
    zIndex: 100,
    background: 'rgba(10,10,10,0.95)',
    backdropFilter: 'blur(12px)',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    height: 56,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-around',
    fontFamily: 'system-ui, sans-serif',
  },
  tab: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    background: 'none',
    border: 'none',
    fontFamily: 'inherit',
    cursor: 'pointer',
    padding: '4px 12px',
    flex: 1,
    height: '100%',
  },
  tabIcon: (active: boolean) => ({
    fontSize: 22,
    lineHeight: 1,
    color: active ? activeColor : '#888',
    transition: 'color 0.2s',
  }),
  tabLabel: (active: boolean) => ({
    fontSize: 10,
    color: active ? activeColor : '#888',
    transition: 'color 0.2s',
    fontWeight: active ? 600 : 400,
  }),
};

const styleTag = document.createElement('style');
styleTag.textContent = `
  .nav-desktop { display: flex !important; }
  .nav-mobile { display: none !important; }
  .page-content { padding-top: 60px !important; }
  .nav-mobile { height: calc(56px + env(safe-area-inset-bottom, 0px)); padding-bottom: env(safe-area-inset-bottom, 0px); }
  @media (max-width: 699px) {
    .nav-desktop { display: none !important; }
    .nav-mobile { display: flex !important; }
    body { padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px)); }
    .page-content { padding-top: 0 !important; }
  }
`;
if (!document.getElementById('nav-styles')) {
  styleTag.id = 'nav-styles';
  document.head.appendChild(styleTag);
}

export default function Navbar({ page, setPage, user, onLogout }: NavbarProps) {
  const tabs = [
    { id: 'home', label: 'Home', icon: '⌂' },
    ...(user ? [{ id: 'messages' as const, label: 'Messages' as const, icon: '✉' }] : []),
    ...(user ? [{ id: 'profile' as const, label: 'Profile' as const, icon: '👤' }] : []),
    { id: 'privacy', label: 'Privacy', icon: '🔒' },
    { id: 'terms', label: 'Terms', icon: '📄' },
  ];

  return (
    <>
      {/* Desktop top nav */}
      <nav className="nav-desktop" style={styles.topNav}>
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

      {/* Mobile bottom nav */}
      <nav className="nav-mobile" style={styles.bottomNav}>
        {tabs.map(t => (
          <button key={t.id} style={styles.tab} onClick={() => setPage(t.id)}>
            <span style={styles.tabIcon(page === t.id)}>{t.icon}</span>
            <span style={styles.tabLabel(page === t.id)}>{t.label}</span>
          </button>
        ))}
        {user && (
          <button style={styles.tab} onClick={onLogout}>
            <span style={styles.tabIcon(false)}>🚪</span>
            <span style={styles.tabLabel(false)}>Logout</span>
          </button>
        )}
      </nav>
    </>
  );
}
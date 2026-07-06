import React, { useEffect, useState } from 'react';
import { getAdminStats, adminSearchUsers, adminGetUserMessages, adminFlagUser, adminUnflagUser, adminBanUser, adminUnbanUser, adminGetBannedUsers, adminGetReportedMessages, adminDismissReport, adminGetLogs, getAllMessagesForDownload } from '../supabaseClient';

const s = {
  page: { background: '#161616', flex: 1, minHeight: 0, fontFamily: 'system-ui, sans-serif', padding: 24, overflowY: 'auto' as const },
  card: { background: '#1f1f1f', borderRadius: 12, padding: 20, marginBottom: 16 },
  title: { color: '#fff', fontSize: 22, fontWeight: 700, marginBottom: 4 },
  sub: { color: '#999', fontSize: 13, marginBottom: 16 },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#ccc', fontSize: 13, gap: 8 },
  btn: { background: '#6c63ff', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' as const },
  btnSm: { background: '#6c63ff', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' as const },
  btnDanger: { background: '#f44336', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' as const },
  btnWarn: { background: '#ff9800', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' as const },
  input: { background: '#2a2a2a', color: '#fff', border: '1px solid rgba(255,255,255,0.08)', padding: '8px 12px', borderRadius: 6, fontSize: 13, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const },
  statBox: { background: '#1f1f1f', borderRadius: 10, padding: '16px 20px', textAlign: 'center' as const, flex: 1 },
  statNum: { color: '#fff', fontSize: 28, fontWeight: 700 },
  statLabel: { color: '#888', fontSize: 11, marginTop: 2 },
  tab: { background: 'none', border: 'none', color: '#888', fontSize: 13, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit', borderBottom: '2px solid transparent' },
  tabActive: { background: 'none', border: 'none', color: '#fff', fontSize: 13, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit', borderBottom: '2px solid #6c63ff', fontWeight: 600 },
  chip: { background: 'rgba(108,99,255,0.15)', color: '#6c63ff', borderRadius: 6, padding: '2px 8px', fontSize: 11, whiteSpace: 'nowrap' as const },
  badge: { background: '#f44336', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 700, marginLeft: 6 },
};

type Tab = 'dashboard' | 'users' | 'reports' | 'bans' | 'logs';

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [stats, setStats] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [userMessages, setUserMessages] = useState<any[] | null>(null);
  const [flagReason, setFlagReason] = useState('');
  const [banReason, setBanReason] = useState('');
  const [bannedUsers, setBannedUsers] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (tab === 'dashboard') loadStats(); if (tab === 'bans') loadBans(); if (tab === 'reports') loadReports(); if (tab === 'logs') loadLogs(); }, [tab]);

  async function loadStats() { setLoading(true); const r = await getAdminStats(); if (r.stats) setStats(r.stats); setLoading(false); }
  async function loadBans() { setLoading(true); const r = await adminGetBannedUsers(); if (r.users) setBannedUsers(r.users); setLoading(false); }
  async function loadReports() { setLoading(true); const r = await adminGetReportedMessages(); if (r.reports) setReports(r.reports); setLoading(false); }
  async function loadLogs() { setLoading(true); const r = await adminGetLogs(); if (r.logs) setLogs(r.logs); setLoading(false); }

  async function doSearch() {
    if (!search.trim()) return;
    setLoading(true);
    const r = await adminSearchUsers(search.trim());
    setSearchResults(r.users || []);
    setSelectedUser(null);
    setUserMessages(null);
    setLoading(false);
  }

  async function viewUser(u: any) {
    setSelectedUser(u);
    setUserMessages(null);
    const r = await adminGetUserMessages(u.user_id);
    setUserMessages(r.messages || []);
  }

  function renderTabs() {
    const tabs: { id: Tab; label: string }[] = [
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'users', label: 'Users' },
      { id: 'reports', label: `Reports${reports.filter(r => !r.dismissed).length > 0 ? ` (${reports.filter(r => !r.dismissed).length})` : ''}` },
      { id: 'bans', label: 'Bans' },
      { id: 'logs', label: 'Logs' },
    ];
    return <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.06)', overflowX: 'auto' as const }}>
      {tabs.map(t => (
        <button key={t.id} style={tab === t.id ? s.tabActive : s.tab} onClick={() => setTab(t.id)}>{t.label}</button>
      ))}
    </div>;
  }

  return (
    <div style={s.page}>
      <div style={{ maxWidth: 1000, margin: '0 auto', minHeight: '100%' }}>
        <h1 style={s.title}>Command Center</h1>
        <p style={s.sub}>Platform administration and moderation</p>
        {renderTabs()}

        {/* DASHBOARD */}
        {tab === 'dashboard' && (
          <>
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              <div style={s.statBox}><div style={s.statNum}>{stats?.total_users ?? '-'}</div><div style={s.statLabel}>Users</div></div>
              <div style={s.statBox}><div style={s.statNum}>{stats?.total_messages ?? '-'}</div><div style={s.statLabel}>Total Messages</div></div>
              <div style={s.statBox}><div style={s.statNum}>{stats?.messages_today ?? '-'}</div><div style={s.statLabel}>Messages Today</div></div>
              <div style={s.statBox}><div style={s.statNum}>{stats?.flagged_users ?? '-'}</div><div style={s.statLabel}>Flagged</div></div>
              <div style={s.statBox}><div style={{ ...s.statNum, color: stats?.pending_reports > 0 ? '#f44336' : '#fff' }}>{stats?.pending_reports ?? '-'}</div><div style={s.statLabel}>Pending Reports</div></div>
              <div style={s.statBox}><div style={s.statNum}>{stats?.banned_users ?? '-'}</div><div style={s.statLabel}>Banned</div></div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={s.btn} onClick={loadStats} disabled={loading}>Refresh</button>
              <button style={s.btn} onClick={async () => {
                const { data, error } = await getAllMessagesForDownload();
                if (error || !data) return;
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = 'all_messages.json'; a.click();
                URL.revokeObjectURL(url);
              }}>Download All Messages</button>
            </div>
          </>
        )}

        {/* USERS */}
        {tab === 'users' && (
          <div style={{ display: 'flex', gap: 16, flexDirection: window.innerWidth < 700 ? 'column' : 'row' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input style={s.input} placeholder="Search by name or user ID..." value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && doSearch()} />
                <button style={s.btn} onClick={doSearch} disabled={loading}>Search</button>
              </div>
              <div style={{ ...s.card, marginBottom: 0 }}>
                {!searchResults ? <p style={{ color: '#666', fontSize: 13 }}>Search for a user above</p> :
                searchResults.length === 0 ? <p style={{ color: '#666', fontSize: 13 }}>No results</p> :
                searchResults.map(u => (
                  <div key={u.user_id} style={{ ...s.row, cursor: 'pointer', background: selectedUser?.user_id === u.user_id ? 'rgba(108,99,255,0.08)' : 'transparent' }} onClick={() => viewUser(u)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>{u.display_name || 'Anonymous'}</span>
                      {u.flagged && <span style={{ ...s.chip, background: 'rgba(255,152,0,0.15)', color: '#ff9800' }}>FLAGGED</span>}
                    </div>
                    <span style={s.chip}>{u.user_id.slice(0, 8)}</span>
                  </div>
                ))}
              </div>
            </div>

            {selectedUser && (
              <div style={{ flex: 1.5 }}>
                <div style={s.card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <h3 style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>{selectedUser.display_name || 'Anonymous'}</h3>
                    <span style={s.chip}>{selectedUser.user_id}</span>
                  </div>
                  {selectedUser.flagged && <p style={{ color: '#ff9800', fontSize: 12, marginBottom: 8 }}>⚠ Flagged: {selectedUser.flag_reason}</p>}
                  <p style={{ color: '#888', fontSize: 12, marginBottom: 12 }}>{selectedUser.bio || 'No bio'}</p>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                    {!selectedUser.flagged ? (
                      <>
                        <input style={{ ...s.input, width: 200 }} placeholder="Flag reason..." value={flagReason} onChange={e => setFlagReason(e.target.value)} />
                        <button style={s.btnWarn} onClick={async () => { if (!flagReason.trim()) return; await adminFlagUser(selectedUser.user_id, flagReason.trim()); selectedUser.flagged = true; selectedUser.flag_reason = flagReason.trim(); setFlagReason(''); }}>Flag</button>
                      </>
                    ) : <button style={s.btn} onClick={async () => { await adminUnflagUser(selectedUser.user_id); selectedUser.flagged = false; selectedUser.flag_reason = ''; setSelectedUser({ ...selectedUser }); }}>Unflag</button>}
                    <button style={s.btnDanger} onClick={async () => { const r = prompt('Ban reason:'); if (r) { await adminBanUser(selectedUser.user_id, r); } }}>Ban</button>
                  </div>
                  <p style={{ color: '#999', fontSize: 12, marginBottom: 6 }}>Messages ({userMessages ? userMessages.length : '...'})</p>
                  <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                    {!userMessages ? <p style={{ color: '#666', fontSize: 12 }}>Loading...</p> :
                     userMessages.length === 0 ? <p style={{ color: '#666', fontSize: 12 }}>No messages</p> :
                     userMessages.map(m => (
                      <div key={m.id} style={{ padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: 12, color: '#aaa' }}>
                        <span style={{ color: m.sender_id === selectedUser.user_id ? '#6c63ff' : '#4caf50', fontWeight: 600 }}>{m.sender_name || m.sender_id.slice(0, 8)}</span>
                        <span style={{ color: '#555' }}> → </span>
                        <span style={{ color: m.receiver_id === selectedUser.user_id ? '#6c63ff' : '#4caf50', fontWeight: 600 }}>{m.receiver_name || m.receiver_id.slice(0, 8)}</span>
                        <span style={{ color: '#666', marginLeft: 6 }}>{m.content}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* REPORTS */}
        {tab === 'reports' && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button style={s.btn} onClick={loadReports} disabled={loading}>Refresh</button>
            </div>
            {reports.length === 0 ? <p style={{ color: '#666', fontSize: 13 }}>No pending reports</p> :
            reports.map(r => (
              <div key={r.id} style={s.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>Reported User: {r.reported_user_id?.slice(0, 8)}</span>
                  <span style={{ color: '#666', fontSize: 11 }}>{new Date(r.created_at).toLocaleString()}</span>
                </div>
                <p style={{ color: '#ccc', fontSize: 13, marginBottom: 8 }}>"{r.message_text}"</p>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button style={s.btnSm} onClick={async () => { await adminDismissReport(r.id); loadReports(); }}>Dismiss</button>
                  <button style={s.btnWarn} onClick={async () => { const reason = prompt('Flag reason:'); if (reason) { await adminFlagUser(r.reported_user_id, reason); await adminDismissReport(r.id); loadReports(); } }}>Flag & Dismiss</button>
                  <button style={s.btnDanger} onClick={async () => { const reason = prompt('Ban reason:'); if (reason) { await adminBanUser(r.reported_user_id, reason); await adminDismissReport(r.id); loadReports(); } }}>Ban & Dismiss</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* BANS */}
        {tab === 'bans' && (
          <div>
            <button style={{ ...s.btn, marginBottom: 12 }} onClick={loadBans} disabled={loading}>Refresh</button>
            {bannedUsers.length === 0 ? <p style={{ color: '#666', fontSize: 13 }}>No banned users</p> :
            bannedUsers.map(b => (
              <div key={b.user_id} style={s.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{b.user_id?.slice(0, 8)}</span>
                    <p style={{ color: '#f44336', fontSize: 12, marginTop: 2 }}>Reason: {b.reason}</p>
                    <p style={{ color: '#666', fontSize: 11 }}>{new Date(b.created_at).toLocaleString()}</p>
                  </div>
                  <button style={s.btn} onClick={async () => { await adminUnbanUser(b.user_id); loadBans(); }}>Unban</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* LOGS */}
        {tab === 'logs' && (
          <div>
            <button style={{ ...s.btn, marginBottom: 12 }} onClick={loadLogs} disabled={loading}>Refresh</button>
            {logs.length === 0 ? <p style={{ color: '#666', fontSize: 13 }}>No logs</p> :
            <div style={s.card}>
              {logs.map((l, i) => (
                <div key={l.id || i} style={s.row}>
                  <div>
                    <span style={{ color: '#6c63ff', fontSize: 12, fontWeight: 600 }}>{l.action}</span>
                    {l.target_id && <span style={{ color: '#888', fontSize: 11, marginLeft: 6 }}>{l.target_id.slice(0, 8)}</span>}
                    {l.details && <p style={{ color: '#777', fontSize: 11, marginTop: 1 }}>{l.details}</p>}
                  </div>
                  <span style={{ color: '#555', fontSize: 11 }}>{new Date(l.created_at).toLocaleString()}</span>
                </div>
              ))}
            </div>}
          </div>
        )}
      </div>
    </div>
  );
}
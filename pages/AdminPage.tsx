import React, { useEffect, useRef, useState } from 'react';
import AdminSupportInbox from './AdminSupportInbox';
import { watchOperatorSessionCount } from '../chatPresence';
import { getAdminStats, adminListUsers, adminGetUserMessages, adminFlagUser, adminUnflagUser, adminBanUser, adminUnbanUser, adminGetBannedUsers, adminGetReportedMessages, adminDismissReport, adminGetLogs, getAllMessagesForDownload, adminGetCoinWallet, adminAddLivmeCoins, adminDeductLivmeCoins } from '../supabaseClient';

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

type Tab = 'dashboard' | 'users' | 'reports' | 'bans' | 'logs' | 'support';

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [stats, setStats] = useState<any>(null);
  const [statsUpdatedAt, setStatsUpdatedAt] = useState<Date | null>(null);
  const [realtimeSessions, setRealtimeSessions] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [userTotal, setUserTotal] = useState(0);
  const [userPage, setUserPage] = useState(0);
  const userPageSize = 50;
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [userMessages, setUserMessages] = useState<any[] | null>(null);
  const [coinWallet, setCoinWallet] = useState<any>(null);
  const [coinAmount, setCoinAmount] = useState('');
  const [coinReason, setCoinReason] = useState('');
  const pendingCoinGrantRef = useRef<{ userId: string; amount: number; reason: string; requestId: string } | null>(null);
  const pendingCoinDeductRef = useRef<{ userId: string; amount: number; reason: string; requestId: string } | null>(null);
  const [flagReason, setFlagReason] = useState('');
  const [banReason, setBanReason] = useState('');
  const [bannedUsers, setBannedUsers] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [reportSearch, setReportSearch] = useState('');
  const [logs, setLogs] = useState<any[]>([]);
  const [logSearch, setLogSearch] = useState('');
  const [logActionFilter, setLogActionFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');

  const [error, setError] = useState('');

  useEffect(() => {
    if (tab === 'dashboard') {
      loadStats();
      const refreshTimer = window.setInterval(() => loadStats(), 30000);
      const stopRealtimeMonitor = watchOperatorSessionCount(setRealtimeSessions);
      return () => { window.clearInterval(refreshTimer); stopRealtimeMonitor(); };
    }
    if (tab === 'users') loadUsers(userPage);
    if (tab === 'bans') loadBans();
    if (tab === 'reports') loadReports();
    if (tab === 'logs') loadLogs();
  }, [tab, userPage]);

  async function loadStats() {
    setLoading(true); setError('');
    try {
      const r = await getAdminStats();
      if (r.error) setError(r.error);
      else if (r.stats) { setStats(r.stats); setStatsUpdatedAt(new Date()); }
    } catch (e: any) { setError(e?.message || 'Unable to load dashboard statistics.'); }
    finally { setLoading(false); }
  }
  async function loadBans() {
    setLoading(true); setError('');
    try {
      const r = await adminGetBannedUsers();
      if (r.error) setError(r.error);
      else setBannedUsers(r.users || []);
    } catch (e: any) { setError(e?.message || 'Unable to load banned users.'); }
    finally { setLoading(false); }
  }
  async function loadReports() {
    setLoading(true); setError('');
    try {
      const r = await adminGetReportedMessages();
      if (r.error) setError(r.error);
      else setReports(r.reports || []);
    } catch (e: any) { setError(e?.message || 'Unable to load reports.'); }
    finally { setLoading(false); }
  }
  async function loadLogs() {
    setLoading(true); setError('');
    try {
      const r = await adminGetLogs();
      if (r.error) setError(r.error);
      else setLogs(r.logs || []);
    } catch (e: any) { setError(e?.message || 'Unable to load admin logs.'); }
    finally { setLoading(false); }
  }

  async function loadUsers(page = 0) {
    setLoading(true);
    setError('');
    try {
      const r = await adminListUsers(search.trim() || null, page, userPageSize);
      if (r.error) {
        setError(r.error);
        setSearchResults([]);
        setUserTotal(0);
      } else {
        setSearchResults(r.users || []);
        setUserTotal(r.total || 0);
      }
    } catch (e: any) {
      setError(e?.message || 'Unable to load the user directory.');
      setSearchResults([]);
      setUserTotal(0);
    } finally {
      setLoading(false);
    }
  }

  async function doSearch() {
    setSelectedUser(null);
    setUserMessages(null);
    if (userPage === 0) await loadUsers(0);
    else setUserPage(0);
  }

  async function clearUserSearch() {
    setSearch('');
    setSelectedUser(null);
    setUserMessages(null);
    if (userPage === 0) {
      setLoading(true);
      setError('');
      try {
        const r = await adminListUsers(null, 0, userPageSize);
        if (r.error) {
          setError(r.error);
          setSearchResults([]);
          setUserTotal(0);
        } else {
          setSearchResults(r.users || []);
          setUserTotal(r.total || 0);
        }
      } catch (e: any) {
        setError(e?.message || 'Unable to load the user directory.');
        setSearchResults([]);
        setUserTotal(0);
      } finally {
        setLoading(false);
      }
    } else {
      setUserPage(0);
    }
  }

  async function viewUser(u: any) {
    setSelectedUser(u);
    setUserMessages(null);
    setCoinWallet(null);
    setError('');
    setLoading(true);
    try {
      const r = await adminGetUserMessages(u.user_id);
      if (r.error) setError(r.error);
      setUserMessages(r.messages || []);
      const walletResult = await adminGetCoinWallet(u.user_id);
      if (walletResult.error) setError(walletResult.error);
      else setCoinWallet(walletResult.wallet || null);
    } catch (e: any) {
      setError(e?.message || 'Unable to load this user\'s messages.');
      setUserMessages([]);
    } finally {
      setLoading(false);
    }
  }

  async function refreshCoinWallet(userId = selectedUser?.user_id) {
    if (!userId) return;
    const result = await adminGetCoinWallet(userId);
    if (result.error) setError(result.error);
    else setCoinWallet(result.wallet || null);
  }

  async function submitManualCoinAdd() {
    const amount = Number(coinAmount);
    if (!Number.isInteger(amount) || amount < 1 || amount > 100000) {
      setError('Enter a whole-number amount from 1 to 100,000 LC.');
      return;
    }
    if (coinReason.trim().length < 3) {
      setError('Enter a reason of at least 3 characters.');
      return;
    }
    const reason = coinReason.trim();
    const userId = selectedUser.user_id;
    const pending = pendingCoinGrantRef.current;
    const requestId = pending && pending.userId === userId && pending.amount === amount && pending.reason === reason
      ? pending.requestId
      : (typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `manual-${Date.now()}-${userId}`);
    // Keep the same request ID after network/timeout errors so retrying cannot
    // credit the same operator action twice.
    pendingCoinGrantRef.current = { userId, amount, reason, requestId };
    await runAction(
      () => adminAddLivmeCoins(userId, amount, reason, requestId),
      async () => {
        pendingCoinGrantRef.current = null;
        setCoinAmount('');
        setCoinReason('');
        await refreshCoinWallet(userId);
      }
    );
  }

  async function submitManualCoinDeduct() {
    const amount = Number(coinAmount);
    if (!Number.isInteger(amount) || amount < 1 || amount > 100000) {
      setError('Enter a whole-number amount from 1 to 100,000 LC.');
      return;
    }
    if (coinReason.trim().length < 3) {
      setError('Enter a reason of at least 3 characters.');
      return;
    }
    const reason = coinReason.trim();
    const userId = selectedUser.user_id;
    const pending = pendingCoinDeductRef.current;
    const requestId = pending && pending.userId === userId && pending.amount === amount && pending.reason === reason
      ? pending.requestId
      : (typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `manual-deduct-${Date.now()}-${userId}`);
    // Reuse the same request ID on retries so an uncertain response cannot deduct twice.
    pendingCoinDeductRef.current = { userId, amount, reason, requestId };
    await runAction(
      () => adminDeductLivmeCoins(userId, amount, reason, requestId),
      async () => {
        pendingCoinDeductRef.current = null;
        setCoinAmount('');
        setCoinReason('');
        await refreshCoinWallet(userId);
      }
    );
  }

  async function runAction(action: () => Promise<{ error?: string }>, after?: () => void | Promise<void>) {
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const result = await action();
      if (result?.error) {
        setError(result.error);
        return;
      }
      setNotice('Action completed successfully.');
      if (after) await after();
    } catch (e: any) {
      setError(e?.message || 'The action could not be completed.');
    } finally {
      setLoading(false);
    }
  }

  function renderTabs() {
    const tabs: { id: Tab; label: string }[] = [
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'users', label: 'Users' },
      { id: 'reports', label: `Reports${reports.filter(r => !r.dismissed).length > 0 ? ` (${reports.filter(r => !r.dismissed).length})` : ''}` },
      { id: 'bans', label: 'Bans' },
      { id: 'logs', label: 'Logs' },
      { id: 'support', label: 'Support' },
    ];
    return <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.06)', overflowX: 'auto' as const }}>
      {tabs.map(t => (
        <button key={t.id} style={tab === t.id ? s.tabActive : s.tab} onClick={() => setTab(t.id)}>{t.label}</button>
      ))}
    </div>;
  }

  return (
    <div className="admin-page-root" style={s.page}>
      <div style={{ maxWidth: 1000, margin: '0 auto', minHeight: '100%' }}>
        <h1 style={s.title}>Operator Console</h1>
        <p style={s.sub}>Platform operations, analytics, and moderation</p>
        {renderTabs()}
        {error && <div role="alert" style={{ background: 'rgba(244,67,54,0.14)', border: '1px solid rgba(244,67,54,0.4)', color: '#ff8a80', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{error}</div>}
        {notice && <div role="status" style={{ background: 'rgba(76,175,80,0.12)', border: '1px solid rgba(76,175,80,0.3)', color: '#81c784', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{notice}</div>}

        {/* DASHBOARD */}
        {tab === 'dashboard' && (
          <>
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              <div style={s.statBox}><div style={s.statNum}>{stats?.total_users ?? '-'}</div><div style={s.statLabel}>Auth Accounts</div></div>
              <div style={s.statBox}><div style={s.statNum}>{stats?.profiles_missing ?? '-'}</div><div style={s.statLabel}>Missing Profiles</div></div>
              <div style={s.statBox}><div style={s.statNum}>{stats?.total_messages ?? '-'}</div><div style={s.statLabel}>Total Messages</div></div>
              <div style={s.statBox}><div style={s.statNum}>{stats?.messages_today ?? '-'}</div><div style={s.statLabel}>Messages · 24h</div></div>
              <div style={s.statBox}><div style={s.statNum}>{stats?.flagged_users ?? '-'}</div><div style={s.statLabel}>Flagged</div></div>
              <div style={s.statBox}><div style={{ ...s.statNum, color: stats?.pending_reports > 0 ? '#f44336' : '#fff' }}>{stats?.pending_reports ?? '-'}</div><div style={s.statLabel}>Pending Reports</div></div>
              <div style={s.statBox}><div style={s.statNum}>{stats?.banned_users ?? '-'}</div><div style={s.statLabel}>Banned</div></div>
            </div>
            {stats && (
              <div style={{ ...s.card, marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
                  <div>
                    <h2 style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>Platform overview</h2>
                    <p style={{ color: '#888', fontSize: 12, marginTop: 4 }}>Current totals from the production database · refresh to update</p>
                  </div>
                  <span style={s.chip}>Live snapshot</span>
                </div>
                {(() => {
                  const metrics = [
                    { label: 'Auth accounts', value: Number(stats.total_users) || 0, color: '#6c63ff' },
                    { label: 'Profiles created', value: Number(stats.chat_profiles ?? (Number(stats.total_users || 0) - Number(stats.profiles_missing || 0))) || 0, color: '#26a69a' },
                    { label: 'Messages · all time', value: Number(stats.total_messages) || 0, color: '#42a5f5' },
                    { label: 'Messages · last 24h', value: Number(stats.messages_today) || 0, color: '#ab7df6' },
                    { label: 'Flagged users', value: Number(stats.flagged_users) || 0, color: '#ffb74d' },
                    { label: 'Banned users', value: Number(stats.banned_users) || 0, color: '#ef5350' },
                    { label: 'Pending reports', value: Number(stats.pending_reports) || 0, color: '#ec6c9b' },
                  ];
                  const max = Math.max(1, ...metrics.map(m => m.value));
                  return <div role="img" aria-label="Horizontal bar chart of current platform totals">
                    {metrics.map(m => (
                      <div key={m.label} style={{ display: 'grid', gridTemplateColumns: 'minmax(112px, 180px) minmax(60px, 1fr) 48px', alignItems: 'center', gap: 10, marginBottom: 13 }}>
                        <span style={{ color: '#bbb', fontSize: 12 }}>{m.label}</span>
                        <div style={{ height: 12, background: '#303039', borderRadius: 8, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${(m.value / max) * 100}%`, minWidth: m.value > 0 ? 3 : 0, background: m.color, borderRadius: 8, transition: 'width 0.3s ease' }} />
                        </div>
                        <strong style={{ color: '#eee', fontSize: 12, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{m.value.toLocaleString()}</strong>
                      </div>
                    ))}
                  </div>;
                })()}
              </div>
            )}
            {stats && (
              <>
                <div style={{ ...s.card, marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                    <div>
                      <h2 style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>Storage monitoring</h2>
                      <p style={{ color: '#888', fontSize: 12, marginTop: 4 }}>Automatic refresh every 30 seconds · current object metadata and database size</p>
                    </div>
                    <span style={s.chip}>Production · Free plan</span>
                  </div>
                  {(() => {
                    const storageBytes = Number(stats.storage_bytes) || 0;
                    const databaseBytes = Number(stats.database_bytes) || 0;
                    const storageLimit = 1024 ** 3;
                    const databaseLimit = 500 * 1024 ** 2;
                    const storagePct = Math.min(100, storageBytes / storageLimit * 100);
                    const databasePct = Math.min(100, databaseBytes / databaseLimit * 100);
                    const bytes = (value: number) => value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(2)} GB` : value >= 1024 ** 2 ? `${(value / 1024 ** 2).toFixed(2)} MB` : value >= 1024 ? `${(value / 1024).toFixed(1)} KB` : `${value} B`;
                    const usageBar = (label: string, value: number, limit: number, pct: number) => (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 7, color: '#ccc', fontSize: 12 }}>
                          <strong>{label}</strong><span>{bytes(value)} / {bytes(limit)} · {pct.toFixed(2)}%</span>
                        </div>
                        <div style={{ height: 10, borderRadius: 8, background: '#303039', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: pct >= 85 ? '#f44336' : pct >= 70 ? '#ffb74d' : '#26a69a', borderRadius: 8, transition: 'width .25s ease' }} />
                        </div>
                      </div>
                    );
                    return (
                      <>
                        {usageBar('Supabase Storage', storageBytes, storageLimit, storagePct)}
                        {usageBar('Postgres database', databaseBytes, databaseLimit, databasePct)}
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                          <div style={{ ...s.statBox, minWidth: 120 }}><div style={s.statNum}>{Number(stats.storage_objects || 0).toLocaleString()}</div><div style={s.statLabel}>Stored objects</div></div>
                          <div style={{ ...s.statBox, minWidth: 120 }}><div style={s.statNum}>{Array.isArray(stats.storage_by_bucket) ? stats.storage_by_bucket.length : 0}</div><div style={s.statLabel}>Buckets in use</div></div>
                        </div>
                        {Array.isArray(stats.storage_by_bucket) && stats.storage_by_bucket.length > 0 && (
                          <div style={{ marginTop: 16 }}>
                            <div style={{ color: '#aaa', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Bucket breakdown</div>
                            {stats.storage_by_bucket.map((bucket: any) => (
                              <div key={bucket.bucket} style={s.row}>
                                <span>{bucket.bucket}</span><span>{Number(bucket.objects || 0).toLocaleString()} files · {bytes(Number(bucket.bytes) || 0)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <p style={{ color: '#777', fontSize: 11, marginTop: 12 }}>Storage is summed from object metadata. Database size is the current Postgres database size; Supabase usage reports may refresh on a different schedule.</p>
                      </>
                    );
                  })()}
                </div>

                <div style={{ ...s.card, marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                    <div>
                      <h2 style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>Load overview</h2>
                      <p style={{ color: '#888', fontSize: 12, marginTop: 4 }}>Live database-session snapshot and application activity over the last 15 minutes</p>
                    </div>
                    <span style={s.chip}>30-second refresh</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(125px, 1fr))', gap: 10 }}>
                    <div style={s.statBox}><div style={{ ...s.statNum, color: realtimeSessions === null ? '#888' : realtimeSessions >= 180 ? '#f44336' : realtimeSessions >= 150 ? '#ffb74d' : '#26a69a' }}>{realtimeSessions === null ? '—' : realtimeSessions.toLocaleString()}</div><div style={s.statLabel}>Live app sessions</div></div>
                    <div style={s.statBox}><div style={s.statNum}>200</div><div style={s.statLabel}>Free Realtime connection allowance</div></div>
                    <div style={s.statBox}><div style={s.statNum}>{Number(stats.db_active_sessions || 0)}</div><div style={s.statLabel}>Active DB sessions</div></div>
                    <div style={s.statBox}><div style={s.statNum}>{Number(stats.db_sessions || 0)}</div><div style={s.statLabel}>Total DB sessions</div></div>
                    <div style={s.statBox}><div style={s.statNum}>{Number(stats.active_chat_users_last_15m || 0)}</div><div style={s.statLabel}>Chat participants · 15m</div></div>
                    <div style={s.statBox}><div style={s.statNum}>{Number(stats.messages_last_15m || 0)}</div><div style={s.statLabel}>Messages · 15m</div></div>
                    <div style={s.statBox}><div style={s.statNum}>{Number(stats.posts_last_15m || 0)}</div><div style={s.statLabel}>Posts · 15m</div></div>
                  </div>
                  <p style={{ color: '#777', fontSize: 11, marginTop: 12 }}>Live app sessions are anonymous browser/app presence keys on a shared Realtime channel, not a billing-grade peak-connection counter. The 200 figure is the current Free-plan project limit; official peak usage remains in Supabase Usage.</p>
                </div>
              </>
            )}
            {stats && (
              <div style={{ ...s.card, marginBottom: 16 }}>
                <div style={{ marginBottom: 12 }}>
                  <h2 style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>Operational checks</h2>
                  <p style={{ color: '#888', fontSize: 12, marginTop: 4 }}>Rule-based indicators from the latest snapshot — not a live uptime or incident monitor</p>
                </div>
                {(() => {
                  const storagePct = (Number(stats.storage_bytes || 0) / (1024 ** 3)) * 100;
                  const databasePct = (Number(stats.database_bytes || 0) / (500 * 1024 ** 2)) * 100;
                  const checks = [
                    { label: 'Storage capacity', detail: `${storagePct.toFixed(2)}% of the 1 GB Free-plan allowance`, level: storagePct >= 85 ? 'critical' : storagePct >= 70 ? 'warning' : 'ok' },
                    { label: 'Database capacity', detail: `${databasePct.toFixed(2)}% of the 500 MB Free-plan allowance`, level: databasePct >= 85 ? 'critical' : databasePct >= 70 ? 'warning' : 'ok' },
                    { label: 'Realtime app sessions', detail: realtimeSessions === null ? 'Presence count not available yet' : `${realtimeSessions} observed app sessions against a 200-connection project limit`, level: realtimeSessions === null ? 'unknown' : realtimeSessions >= 180 ? 'critical' : realtimeSessions >= 150 ? 'warning' : 'ok' },
                    { label: 'Pending moderation reports', detail: `${Number(stats.pending_reports || 0)} awaiting operator review`, level: Number(stats.pending_reports || 0) > 0 ? 'warning' : 'ok' },
                    { label: 'Profile completeness', detail: `${Number(stats.profiles_missing || 0)} registered accounts without a profile`, level: Number(stats.profiles_missing || 0) > 0 ? 'warning' : 'ok' },
                  ];
                  const palette: Record<string, { color: string; label: string }> = {
                    ok: { color: '#81c784', label: 'OK' },
                    warning: { color: '#ffb74d', label: 'Review' },
                    critical: { color: '#ff8a80', label: 'High' },
                    unknown: { color: '#aaa', label: 'Unknown' },
                  };
                  return checks.map(check => (
                    <div key={check.label} style={{ ...s.row, alignItems: 'flex-start' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: '#ddd', fontWeight: 600 }}>{check.label}</div>
                        <div style={{ color: '#777', fontSize: 11, marginTop: 3 }}>{check.detail}</div>
                      </div>
                      <span style={{ color: palette[check.level].color, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{palette[check.level].label}</span>
                    </div>
                  ));
                })()}
              </div>
            )}
            <div style={{ color: '#777', fontSize: 11, marginBottom: 10 }}>
              {statsUpdatedAt ? `Last updated: ${statsUpdatedAt.toLocaleTimeString()}` : 'Waiting for first metrics snapshot…'}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={s.btn} onClick={loadStats} disabled={loading}>Refresh</button>
              <button style={s.btn} disabled={loading} onClick={async () => {
                setError('');
                setNotice('');
                try {
                  const result = await getAllMessagesForDownload();
                  if (result.error || !result.data) {
                    setError(result.error || 'No message data was returned.');
                    return;
                  }
                  const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'liveme_messages_export.json';
                  a.click();
                  URL.revokeObjectURL(url);
                  setNotice(`Export prepared: ${result.data.length} messages.`);
                } catch (e: any) {
                  setError(e?.message || 'Message export failed.');
                }
              }}>Export Messages</button>
            </div>
          </>
        )}

        {/* USERS */}
        {tab === 'users' && (
          <div>
            <div style={{ ...s.card, marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                <div>
                  <h2 style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>Registered accounts</h2>
                  <p style={{ color: '#888', fontSize: 12, marginTop: 3 }}>
                    {userTotal} Supabase Auth account{userTotal === 1 ? '' : 's'} · all accounts, including those without a LiveMe profile
                  </p>
                </div>
                <button style={s.btn} onClick={() => loadUsers(userPage)} disabled={loading}>Refresh</button>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input
                  style={s.input}
                  placeholder="Search email, display name, or user ID..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && doSearch()}
                />
                <button style={s.btn} onClick={doSearch} disabled={loading}>Search</button>
                {search.trim() !== '' && <button style={s.btn} onClick={clearUserSearch} disabled={loading}>Clear</button>}
              </div>
              <div style={{ overflowX: 'auto', width: '100%' }}>
                <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', textAlign: 'left', fontSize: 12 }}>
                  <thead>
                    <tr style={{ color: '#888', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
                      {['Account', 'LiveMe profile', 'Email status', 'Moderation', 'Registered'].map(label => (
                        <th key={label} style={{ padding: '10px 9px', fontWeight: 600 }}>{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading && searchResults === null ? (
                      <tr><td colSpan={5} style={{ color: '#888', padding: 18, textAlign: 'center' }}>Loading registered accounts…</td></tr>
                    ) : searchResults && searchResults.length > 0 ? searchResults.map(u => (
                      <tr
                        key={u.user_id}
                        onClick={() => viewUser(u)}
                        style={{ cursor: 'pointer', background: selectedUser?.user_id === u.user_id ? 'rgba(108,99,255,0.13)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                      >
                        <td style={{ padding: '11px 9px', color: '#eee' }}>
                          <div style={{ fontWeight: 600 }}>{u.email || 'No email address'}</div>
                          <div style={{ color: '#777', fontSize: 10, marginTop: 3 }}>{u.display_name || 'No display name'} · {u.user_id?.slice(0, 12)}…</div>
                        </td>
                        <td style={{ padding: '11px 9px' }}>
                          <span style={{ ...s.chip, background: u.profile_exists ? 'rgba(76,175,80,0.14)' : 'rgba(255,152,0,0.14)', color: u.profile_exists ? '#81c784' : '#ffb74d' }}>
                            {u.profile_exists ? 'Created' : 'Missing'}
                          </span>
                        </td>
                        <td style={{ padding: '11px 9px', color: u.email_confirmed_at ? '#81c784' : '#ffb74d' }}>
                          {u.email_confirmed_at ? 'Confirmed' : 'Unconfirmed'}
                        </td>
                        <td style={{ padding: '11px 9px', color: '#ccc' }}>
                          {u.banned && <span style={{ ...s.chip, background: 'rgba(244,67,54,0.15)', color: '#ff8a80', marginRight: 5 }}>BANNED</span>}
                          {u.flagged && <span style={{ ...s.chip, background: 'rgba(255,152,0,0.15)', color: '#ffb74d' }}>FLAGGED</span>}
                          {!u.banned && !u.flagged && <span style={{ color: '#777' }}>Normal</span>}
                        </td>
                        <td style={{ padding: '11px 9px', color: '#aaa', whiteSpace: 'nowrap' }}>{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={5} style={{ color: '#888', padding: 18, textAlign: 'center' }}>{loading ? 'Loading…' : 'No registered accounts found.'}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 12, color: '#888', fontSize: 12 }}>
                <span>
                  {userTotal === 0 ? 'No accounts' : `Showing ${userPage * userPageSize + 1}–${Math.min((userPage + 1) * userPageSize, userTotal)} of ${userTotal}`}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={s.btn} disabled={loading || userPage === 0} onClick={() => setUserPage(p => Math.max(0, p - 1))}>Previous</button>
                  <button style={s.btn} disabled={loading || (userPage + 1) * userPageSize >= userTotal} onClick={() => setUserPage(p => p + 1)}>Next</button>
                </div>
              </div>
            </div>

            {selectedUser && (
              <div style={s.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                  <div>
                    <h3 style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>{selectedUser.display_name || 'Account details'}</h3>
                    <p style={{ color: '#aaa', fontSize: 12, marginTop: 3 }}>{selectedUser.email || 'No email address'}</p>
                    <p style={{ color: '#666', fontSize: 10, marginTop: 3, wordBreak: 'break-all' }}>{selectedUser.user_id}</p>
                  </div>
                  <span style={{ ...s.chip, background: selectedUser.profile_exists ? 'rgba(76,175,80,0.14)' : 'rgba(255,152,0,0.14)', color: selectedUser.profile_exists ? '#81c784' : '#ffb74d' }}>
                    {selectedUser.profile_exists ? 'LiveMe profile exists' : 'No LiveMe profile'}
                  </span>
                </div>
                {selectedUser.flagged && <p style={{ color: '#ffb74d', fontSize: 12, marginBottom: 8 }}>Flagged: {selectedUser.flag_reason || 'No reason supplied'}</p>}
                {selectedUser.banned && <p style={{ color: '#ff8a80', fontSize: 12, marginBottom: 8 }}>Banned: {selectedUser.ban_reason || 'No reason supplied'}</p>}
                <div style={{ ...s.card, background: '#191919', border: '1px solid rgba(108,99,255,0.25)', marginTop: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div>
                      <h4 style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>LivMe Coins wallet</h4>
                      <p style={{ color: '#aaa', fontSize: 12, marginTop: 4 }}>
                        {coinWallet ? `Total ${coinWallet.total_balance ?? 0} LC · Promotional ${coinWallet.promotional_balance ?? 0} · Purchased ${coinWallet.purchased_balance ?? 0}` : 'Loading wallet…'}
                      </p>
                    </div>
                    <button style={s.btnSm} disabled={loading} onClick={() => refreshCoinWallet(selectedUser.user_id)}>Refresh wallet</button>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                    <input style={{ ...s.input, width: 130 }} type="number" min="1" max="100000" step="1" inputMode="numeric" placeholder="Amount (LC)" value={coinAmount} onChange={e => setCoinAmount(e.target.value)} />
                    <input style={{ ...s.input, flex: 1, minWidth: 180 }} placeholder="Reason for adjustment (required)" value={coinReason} maxLength={240} onChange={e => setCoinReason(e.target.value)} />
                    <button style={s.btn} disabled={loading || !coinWallet || !coinAmount || coinReason.trim().length < 3} onClick={submitManualCoinAdd}>Add LC</button>
                    <button style={s.btnDanger} disabled={loading || !coinWallet || !coinAmount || coinReason.trim().length < 3 || Number(coinAmount) > Number(coinWallet.total_balance ?? 0)} onClick={() => {
                      if (window.confirm(`Deduct ${coinAmount} LC from this user's wallet? This cannot be undone.`)) submitManualCoinDeduct();
                    }}>Deduct LC</button>
                  </div>
                  <p style={{ color: '#777', fontSize: 11, marginTop: 7 }}>Manual additions and deductions require an operator reason and are permanently recorded in the ledger. Deductions use promotional LC first, then purchased LC, and cannot exceed the wallet balance.</p>
                  {Array.isArray(coinWallet?.transactions) && coinWallet.transactions.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <p style={{ color: '#aaa', fontSize: 11, marginBottom: 4 }}>Recent wallet activity</p>
                      {coinWallet.transactions.slice(0, 5).map((tx: any) => (
                        <div key={tx.id} style={{ ...s.row, fontSize: 11 }}>
                          <span>{tx.transaction_type?.replace(/_/g, ' ')} · {tx.metadata?.reason || tx.metadata?.adjustment_type || tx.coin_source}</span>
                          <span style={{ color: tx.transaction_type === 'message_spend' || tx.metadata?.adjustment_type === 'operator_manual_deduct' ? '#ff8a80' : '#81c784', whiteSpace: 'nowrap' }}>{tx.transaction_type === 'message_spend' || tx.metadata?.adjustment_type === 'operator_manual_deduct' ? '−' : '+'}{tx.amount} LC</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                  {selectedUser.profile_exists && (!selectedUser.flagged ? (
                    <>
                      <input style={{ ...s.input, width: 200 }} placeholder="Flag reason..." value={flagReason} onChange={e => setFlagReason(e.target.value)} />
                      <button style={s.btnWarn} disabled={loading} onClick={() => { if (!flagReason.trim()) { setError('Enter a reason before flagging this user.'); return; } const reason = flagReason.trim(); runAction(() => adminFlagUser(selectedUser.user_id, reason), () => { setSelectedUser({ ...selectedUser, flagged: true, flag_reason: reason }); setFlagReason(''); loadUsers(userPage); }); }}>Flag</button>
                    </>
                  ) : <button style={s.btn} disabled={loading} onClick={() => runAction(() => adminUnflagUser(selectedUser.user_id), () => { setSelectedUser({ ...selectedUser, flagged: false, flag_reason: null }); loadUsers(userPage); })}>Unflag</button>)}
                  {!selectedUser.banned
                    ? <button style={s.btnDanger} disabled={loading} onClick={() => { const reason = prompt('Ban reason:'); if (reason?.trim()) runAction(() => adminBanUser(selectedUser.user_id, reason.trim()), () => { setSelectedUser({ ...selectedUser, banned: true, ban_reason: reason.trim() }); loadUsers(userPage); loadBans(); }); }}>Ban</button>
                    : <button style={s.btn} disabled={loading} onClick={() => runAction(() => adminUnbanUser(selectedUser.user_id), () => { setSelectedUser({ ...selectedUser, banned: false, ban_reason: null }); loadUsers(userPage); loadBans(); })}>Unban</button>}
                </div>
                <p style={{ color: '#999', fontSize: 12, marginBottom: 6 }}>Messages ({userMessages ? userMessages.length : '…'})</p>
                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                  {!userMessages ? <p style={{ color: '#666', fontSize: 12 }}>Loading…</p> :
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
            )}
          </div>
        )}
        {tab === 'support' && <AdminSupportInbox />}

        {/* REPORTS */}
        {tab === 'reports' && (
          <div>
            <div style={{ ...s.card, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                <div>
                  <h2 style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>Report queue</h2>
                  <p style={{ color: '#888', fontSize: 12, marginTop: 3 }}>{reports.length} report{reports.length === 1 ? '' : 's'} loaded · search by message or reported user ID</p>
                </div>
                <button style={s.btn} onClick={loadReports} disabled={loading}>Refresh</button>
              </div>
              <input style={s.input} placeholder="Filter report text or user ID…" value={reportSearch} onChange={e => setReportSearch(e.target.value)} />
            </div>
            {reports.length === 0 ? <p style={{ color: '#666', fontSize: 13 }}>No pending reports</p> :
            reports.filter(r => !reportSearch.trim() || [r.message_text, r.reported_user_id, r.reporter_id, r.reason].some(v => String(v || '').toLowerCase().includes(reportSearch.trim().toLowerCase()))).length === 0
              ? <p style={{ color: '#666', fontSize: 13 }}>No reports match this filter.</p>
              : reports.filter(r => !reportSearch.trim() || [r.message_text, r.reported_user_id, r.reporter_id, r.reason].some(v => String(v || '').toLowerCase().includes(reportSearch.trim().toLowerCase()))).map(r => (
              <div key={r.id} style={s.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>Reported User: {r.reported_user_id?.slice(0, 8)}</span>
                  <span style={{ color: '#666', fontSize: 11 }}>{new Date(r.created_at).toLocaleString()}</span>
                </div>
                <p style={{ color: '#ccc', fontSize: 13, marginBottom: 8 }}>"{r.message_text}"</p>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button style={s.btnSm} disabled={loading} onClick={() => runAction(() => adminDismissReport(r.id), loadReports)}>Dismiss</button>
                  <button style={s.btnWarn} disabled={loading} onClick={() => { const reason = prompt('Flag reason:'); if (reason?.trim()) runAction(async () => { const flagged = await adminFlagUser(r.reported_user_id, reason.trim()); if (flagged.error) return flagged; return adminDismissReport(r.id); }, loadReports); }}>Flag & Dismiss</button>
                  <button style={s.btnDanger} disabled={loading} onClick={() => { const reason = prompt('Ban reason:'); if (reason?.trim()) runAction(async () => { const banned = await adminBanUser(r.reported_user_id, reason.trim()); if (banned.error) return banned; return adminDismissReport(r.id); }, loadReports); }}>Ban & Dismiss</button>
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
                  <button style={s.btn} disabled={loading} onClick={() => runAction(() => adminUnbanUser(b.user_id), loadBans)}>Unban</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* LOGS */}
        {tab === 'logs' && (
          <div>
            <div style={{ ...s.card, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                <div>
                  <h2 style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>Operator audit trail</h2>
                  <p style={{ color: '#888', fontSize: 12, marginTop: 3 }}>Latest {logs.length} recorded actions · search locally within loaded entries</p>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button style={s.btn} onClick={loadLogs} disabled={loading}>Refresh</button>
                  <button style={s.btn} disabled={!logs.length} onClick={() => {
                    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'liveme_operator_audit_logs.json';
                    a.click();
                    URL.revokeObjectURL(url);
                    setNotice(`Exported ${logs.length} loaded audit entries.`);
                  }}>Export loaded logs</button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(140px, 1fr)', gap: 8 }}>
                <input style={s.input} placeholder="Search action, target ID, or details…" value={logSearch} onChange={e => setLogSearch(e.target.value)} />
                <select style={s.input} value={logActionFilter} onChange={e => setLogActionFilter(e.target.value)}>
                  <option value="all">All actions</option>
                  {Array.from(new Set(logs.map(l => String(l.action || '')).filter(Boolean))).sort().map(action => <option key={action} value={action}>{action}</option>)}
                </select>
              </div>
            </div>
            {logs.length === 0 ? <p style={{ color: '#666', fontSize: 13 }}>No logs</p> :
            logs.filter(l => (logActionFilter === 'all' || l.action === logActionFilter) && (!logSearch.trim() || [l.action, l.target_id, l.details].some(v => String(v || '').toLowerCase().includes(logSearch.trim().toLowerCase())))).length === 0
              ? <p style={{ color: '#666', fontSize: 13 }}>No audit entries match these filters.</p>
              : <div style={s.card}>
              {logs.filter(l => (logActionFilter === 'all' || l.action === logActionFilter) && (!logSearch.trim() || [l.action, l.target_id, l.details].some(v => String(v || '').toLowerCase().includes(logSearch.trim().toLowerCase())))).map((l, i) => (
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
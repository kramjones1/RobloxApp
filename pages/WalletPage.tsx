import React, { useCallback, useEffect, useState } from 'react';
import { CoinTransaction, getCoinTransactions, getCoinWallet } from '../supabaseClient';

const styles = {
  page: { minHeight: '100%', background: '#0a0a0a', color: '#fff', padding: '28px 16px 48px', fontFamily: 'system-ui, sans-serif' },
  inner: { maxWidth: 860, margin: '0 auto' },
  panel: { background: '#17171c', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 20 },
};

export default function WalletPage() {
  const [wallet, setWallet] = useState<{ total_balance: number; purchased_balance: number; promotional_balance: number } | null>(null);
  const [transactions, setTransactions] = useState<CoinTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [lightMode, setLightMode] = useState(() => typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light');

  useEffect(() => {
    const syncTheme = () => setLightMode(document.documentElement.dataset.theme === 'light');
    window.addEventListener('liveme-theme-change', syncTheme);
    syncTheme();
    return () => window.removeEventListener('liveme-theme-change', syncTheme);
  }, []);

  const loadWallet = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    else setLoading(true);
    setError('');
    const [walletResult, historyResult] = await Promise.all([getCoinWallet(), getCoinTransactions(50)]);
    if (walletResult.wallet) setWallet(walletResult.wallet);
    else setError(walletResult.error || 'Could not load your wallet.');
    if (historyResult.transactions) setTransactions(historyResult.transactions);
    else if (!walletResult.error) setError(historyResult.error || 'Could not load transaction history.');
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { void loadWallet(); }, [loadWallet]);

  const palette = lightMode
    ? { page: '#f4f6fb', surface: '#fff', raised: '#f8f9fc', text: '#20232a', muted: '#687080', border: '#e2e5ec', purple: '#5548b8' }
    : { page: '#0a0a0a', surface: '#17171c', raised: '#20202a', text: '#fff', muted: '#999', border: 'rgba(255,255,255,0.08)', purple: '#c4bcff' };

  function transactionTitle(tx: CoinTransaction) {
    if (tx.transaction_type === 'launch_bonus') return 'Signup bonus';
    if (tx.transaction_type === 'message_spend') return 'Outgoing message';
    if (tx.transaction_type === 'adjustment' && tx.metadata?.adjustment_type === 'operator_manual_deduct') return 'Operator deduction';
    if (tx.transaction_type === 'adjustment') return tx.metadata?.reason ? 'Operator credit' : 'Wallet adjustment';
    return tx.transaction_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function transactionDelta(tx: CoinTransaction) {
    const isDebit = tx.transaction_type === 'message_spend' ||
      (tx.transaction_type === 'adjustment' && tx.metadata?.adjustment_type === 'operator_manual_deduct');
    return isDebit ? -Math.abs(Number(tx.amount)) : Math.abs(Number(tx.amount));
  }

  const cardStyle = { ...styles.panel, background: palette.surface, borderColor: palette.border };
  return (
    <main style={{ ...styles.page, background: palette.page, color: palette.text }}>
      <div style={styles.inner}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>LivMe Coins Wallet</h1>
            <p style={{ color: palette.muted, fontSize: 13, margin: '6px 0 0' }}>Your balance and complete recent activity</p>
          </div>
          <button onClick={() => void loadWallet(true)} disabled={refreshing || loading} style={{ border: '1px solid ' + palette.border, borderRadius: 9, padding: '9px 12px', background: palette.surface, color: palette.text, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {refreshing ? 'Refreshing…' : '↻ Refresh'}
          </button>
        </div>

        <section style={{ ...cardStyle, background: 'linear-gradient(135deg, #39348a, #252b62)', border: 'none', marginBottom: 14 }}>
          <p style={{ color: 'rgba(255,255,255,.75)', fontSize: 13, margin: 0 }}>Available balance</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
            <span style={{ color: '#fff', fontSize: 38, fontWeight: 800, letterSpacing: '-1px' }}>{loading && wallet === null ? '—' : Number(wallet?.total_balance || 0).toLocaleString()}</span>
            <span style={{ color: '#e2deff', fontSize: 16, fontWeight: 700 }}>LC</span>
          </div>
          <p style={{ color: 'rgba(255,255,255,.72)', fontSize: 12, margin: '8px 0 0' }}>1 LC is used for each outgoing message</p>
        </section>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
          <div style={cardStyle}>
            <p style={{ color: palette.muted, fontSize: 12, margin: 0 }}>Promotional LC</p>
            <p style={{ fontSize: 24, fontWeight: 800, margin: '8px 0 0' }}>{loading && wallet === null ? '—' : Number(wallet?.promotional_balance || 0).toLocaleString()}</p>
            <p style={{ color: palette.muted, fontSize: 11, margin: '4px 0 0' }}>Signup and promotional credits</p>
          </div>
          <div style={cardStyle}>
            <p style={{ color: palette.muted, fontSize: 12, margin: 0 }}>Purchased LC</p>
            <p style={{ fontSize: 24, fontWeight: 800, margin: '8px 0 0' }}>{loading && wallet === null ? '—' : Number(wallet?.purchased_balance || 0).toLocaleString()}</p>
            <p style={{ color: palette.muted, fontSize: 11, margin: '4px 0 0' }}>Purchased coin balance</p>
          </div>
        </div>

        <section style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <h2 style={{ fontSize: 18, fontWeight: 750, margin: 0 }}>Transaction history</h2>
            <span style={{ color: palette.muted, fontSize: 11 }}>Latest 50 entries</span>
          </div>
          {error && <div role="alert" style={{ background: 'rgba(244,67,54,.1)', color: '#e57373', borderRadius: 9, padding: 12, fontSize: 13, marginBottom: 12 }}>{error}</div>}
          {loading ? <p style={{ color: palette.muted, fontSize: 13, padding: 18, textAlign: 'center' }}>Loading your wallet…</p>
            : transactions.length === 0 ? <div style={{ padding: '28px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>◈</div>
              <p style={{ fontWeight: 650, margin: 0 }}>No transactions yet</p>
              <p style={{ color: palette.muted, fontSize: 12, margin: '6px 0 0' }}>Your coin activity will appear here.</p>
            </div>
            : <div>
              {transactions.map(tx => {
                const delta = transactionDelta(tx);
                const reason = typeof tx.metadata?.reason === 'string' ? tx.metadata.reason : '';
                return <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '13px 0', borderTop: '1px solid ' + palette.border }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 650, margin: 0 }}>{transactionTitle(tx)}</p>
                    <p style={{ color: palette.muted, fontSize: 11, margin: '4px 0 0' }}>{new Date(tx.created_at).toLocaleString()} · {tx.coin_source} balance</p>
                    {reason && <p style={{ color: palette.muted, fontSize: 11, margin: '4px 0 0', overflowWrap: 'anywhere' }}>Reason: {reason}</p>}
                    <p style={{ color: palette.muted, fontSize: 11, margin: '4px 0 0' }}>Balance after: {Number(tx.balance_after).toLocaleString()} LC</p>
                  </div>
                  <strong style={{ color: delta < 0 ? '#ef6b6b' : '#20b978', fontSize: 15, whiteSpace: 'nowrap' }}>{delta < 0 ? '−' : '+'}{Math.abs(delta).toLocaleString()} LC</strong>
                </div>;
              })}
            </div>}
        </section>
        <p style={{ color: palette.muted, fontSize: 11, lineHeight: 1.5, margin: '14px 2px 0' }}>Coins do not expire. You can view only your own wallet and transaction history.</p>
      </div>
    </main>
  );
}

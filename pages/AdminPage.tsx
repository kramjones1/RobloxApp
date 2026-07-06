import React, { useEffect, useState } from 'react';
import { getAllProfiles, getAllMessagesForDownload } from '../supabaseClient';

const s = {
  page: { background: '#161616', flex: 1, minHeight: 0, fontFamily: 'system-ui, sans-serif', padding: 24, overflowY: 'auto' as const },
  card: { background: '#1f1f1f', borderRadius: 12, padding: 20, marginBottom: 16 },
  title: { color: '#fff', fontSize: 20, fontWeight: 700, marginBottom: 16 },
  subtitle: { color: '#999', fontSize: 13, marginBottom: 12 },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#ccc', fontSize: 13 },
  btn: { background: '#6c63ff', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  chip: { background: 'rgba(108,99,255,0.15)', color: '#6c63ff', borderRadius: 6, padding: '2px 8px', fontSize: 11 },
};

export default function AdminPage() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAllProfiles().then(({ profiles: p }) => {
      if (p) setProfiles(p);
      setLoading(false);
    });
  }, []);

  return (
    <div style={s.page}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <h1 style={s.title}>Admin Panel</h1>

        <div style={s.card}>
          <h2 style={s.subtitle}>Users ({profiles.length})</h2>
          {loading ? <p style={{ color: '#666', fontSize: 13 }}>Loading...</p> : profiles.map(p => (
            <div key={p.user_id} style={s.row}>
              <span>{p.display_name || 'Anonymous'}</span>
              <span style={s.chip}>{p.user_id.slice(0, 8)}</span>
            </div>
          ))}
        </div>

        <div style={s.card}>
          <h2 style={s.subtitle}>Data</h2>
          <button style={s.btn} onClick={async () => {
            const { data, error } = await getAllMessagesForDownload();
            if (error || !data) return;
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = 'all_messages.json'; a.click();
            URL.revokeObjectURL(url);
          }}>Download All Messages</button>
        </div>
      </div>
    </div>
  );
}

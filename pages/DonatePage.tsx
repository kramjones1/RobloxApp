import React, { useState } from 'react';
import SupportChatWidget from './SupportChatWidget';

interface Props {
  user: any;
  admin?: boolean;
}

export default function DonatePage({ user, admin = false }: Props) {
  const [copied, setCopied] = useState(false);
  const gcashNumber = '09289460389';

  async function copyGcashNumber() {
    try {
      await navigator.clipboard.writeText(gcashNumber);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main style={{ minHeight: 'calc(100vh - 120px)', padding: '44px 18px 80px', background: 'radial-gradient(ellipse at top, rgba(108,99,255,.16), transparent 55%), #0a0a0a', color: '#fff', fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 680, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 30 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 58, height: 58, borderRadius: 18, background: 'linear-gradient(135deg,#6c63ff,#2a6eff)', boxShadow: '0 10px 34px rgba(108,99,255,.28)', fontSize: 28, marginBottom: 16 }}>💜</div>
          <p style={{ color: '#aaa5ff', fontSize: 11, fontWeight: 800, letterSpacing: 2, margin: '0 0 8px' }}>SUPPORT THE COMMUNITY</p>
          <h1 style={{ fontSize: 'clamp(30px,6vw,42px)', lineHeight: 1.12, margin: '0 0 12px', fontWeight: 850 }}>Support LivMe</h1>
          <p style={{ color: '#aaa', fontSize: 15, lineHeight: 1.65, margin: '0 auto', maxWidth: 520 }}>Your voluntary contribution helps us maintain and improve LivMe. Thank you for supporting the community.</p>
        </div>

        <section style={{ padding: 22, borderRadius: 18, background: 'linear-gradient(145deg,rgba(35,32,65,.96),rgba(20,20,29,.98))', border: '1px solid rgba(143,132,255,.28)', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'rgba(0,190,120,.14)', color: '#52d6a0', fontSize: 21, fontWeight: 800 }}>₱</div>
            <div>
              <h2 style={{ fontSize: 18, margin: 0 }}>Donate with GCash</h2>
              <p style={{ color: '#aaa', fontSize: 12, margin: '4px 0 0' }}>Send your contribution using this number.</p>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 15px', borderRadius: 12, background: 'rgba(0,0,0,.24)', border: '1px solid rgba(255,255,255,.08)' }}>
            <strong style={{ fontSize: 21, letterSpacing: 1.2, fontVariantNumeric: 'tabular-nums' }}>{gcashNumber}</strong>
            <button type="button" onClick={() => void copyGcashNumber()} style={{ border: 0, borderRadius: 9, padding: '9px 13px', background: '#168b65', color: '#fff', fontWeight: 750, cursor: 'pointer', fontSize: 12 }}>{copied ? 'Copied!' : 'Copy number'}</button>
          </div>
          <p style={{ color: '#999', fontSize: 11, lineHeight: 1.5, margin: '11px 0 0' }}>Please verify the recipient name in GCash before confirming your transfer.</p>
        </section>

        <section style={{ padding: 22, borderRadius: 18, background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.09)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'rgba(45,125,220,.16)', color: '#80baff', fontSize: 20, fontWeight: 800 }}>P</div>
            <div>
              <h2 style={{ fontSize: 18, margin: 0 }}>Donate with PayPal</h2>
              <p style={{ color: '#aaa', fontSize: 12, margin: '4px 0 0' }}>Request PayPal donation instructions from our support team.</p>
            </div>
          </div>
          <p style={{ color: '#bbb', fontSize: 13, lineHeight: 1.6, margin: '0 0 14px' }}>Open the Support chat and send us a message that you would like to donate through PayPal. Our team will provide the instructions.</p>
          <div style={{ borderRadius: 10, border: '1px solid rgba(108,99,255,.24)', background: 'rgba(108,99,255,.09)', padding: '11px 13px', color: '#c9c4ff', fontSize: 12, lineHeight: 1.5 }}>
            Use the <strong>Support</strong> button at the bottom-right of this page to contact us.
          </div>
        </section>

        <p style={{ color: '#777', fontSize: 11, textAlign: 'center', lineHeight: 1.6, margin: '22px 8px 0' }}>Donations are voluntary. Please only send an amount you are comfortable contributing.</p>
      </div>
      {/* The support widget must remain available to the site owner on this public contact/donation page. */}
      <SupportChatWidget user={user} />
    </main>
  );
}

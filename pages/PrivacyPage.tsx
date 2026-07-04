import React from 'react';

const s = {
  page: {
    minHeight: '100vh',
    fontFamily: 'system-ui, sans-serif',
    background: '#0a0a0a',
    padding: '40px 20px 60px',
    maxWidth: 800,
    margin: '0 auto',
  },
  title: {
    color: '#fff',
    fontSize: 36,
    fontWeight: 700,
    margin: '0 0 32px',
  },
  lastUpdated: {
    color: '#666',
    fontSize: 13,
    marginBottom: 32,
  },
  h2: {
    color: '#ddd',
    fontSize: 22,
    fontWeight: 600,
    margin: '32px 0 12px',
  },
  p: {
    color: '#999',
    fontSize: 15,
    lineHeight: 1.8,
    margin: '0 0 16px',
  },
};

export default function PrivacyPage() {
  return (
    <div style={s.page}>
      <h1 style={s.title}>Privacy Policy</h1>
      <p style={s.lastUpdated}>Last updated: July 4, 2026</p>

      <h2 style={s.h2}>1. Information We Collect</h2>
      <p style={s.p}>
        We collect minimal information necessary to provide our service. When you create an account,
        we collect your email address. During video chats, video and audio streams are transmitted
        peer-to-peer and are not stored on our servers. We do not record or store chat sessions.
      </p>

      <h2 style={s.h2}>2. How We Use Your Information</h2>
      <p style={s.p}>
        Your email is used solely for authentication purposes. We do not share, sell, or rent your
        personal information to third parties. Connection logs (timestamps, anonymous IDs) are used
        only for service operation and abuse prevention.
      </p>

      <h2 style={s.h2}>3. Data Storage</h2>
      <p style={s.p}>
        Your email and authentication credentials are stored securely using Supabase Auth.
        Video chat data is transmitted directly between users via WebRTC and is not stored
        on our infrastructure. We do not retain chat logs, video recordings, or transcripts.
      </p>

      <h2 style={s.h2}>4. Third-Party Services</h2>
      <p style={s.p}>
        We use Supabase for authentication and Belmo.io for WebSocket signaling.
        These services have their own privacy policies governing data handling.
        We recommend reviewing their policies for complete information.
      </p>

      <h2 style={s.h2}>5. Your Rights</h2>
      <p style={s.p}>
        You may request deletion of your account and associated data at any time by contacting us.
        You have the right to know what personal data we hold and to request its correction or deletion.
      </p>

      <h2 style={s.h2}>6. Contact</h2>
      <p style={s.p}>
        For privacy-related inquiries, please contact the service administrator
        through the GitHub repository associated with this project.
      </p>
    </div>
  );
}

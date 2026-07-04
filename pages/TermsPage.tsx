import React from 'react';

const s = {
  page: {
    minHeight: '100vh',
    fontFamily: 'system-ui, sans-serif',
    background: '#0a0a0a',
    padding: '100px 20px 60px',
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

export default function TermsPage() {
  return (
    <div style={s.page}>
      <h1 style={s.title}>Terms of Service</h1>
      <p style={s.lastUpdated}>Last updated: July 4, 2026</p>

      <h2 style={s.h2}>1. Acceptance of Terms</h2>
      <p style={s.p}>
        By using LiveMe, you agree to these Terms of Service. If you do not agree, do not use the service.
        We reserve the right to update these terms at any time with notice to users.
      </p>

      <h2 style={s.h2}>2. User Conduct</h2>
      <p style={s.p}>
        You agree to use the service responsibly. Prohibited behavior includes: harassment, hate speech,
        nudity or sexual content, violence, spamming, impersonation, and any illegal activity.
        Violations may result in permanent ban without notice.
      </p>

      <h2 style={s.h2}>3. Reporting</h2>
      <p style={s.p}>
        Users can report inappropriate behavior during a chat. Reports are reviewed by moderators.
        False or abusive reporting may result in action against the reporting user.
      </p>

      <h2 style={s.h2}>4. Disclaimer</h2>
      <p style={s.p}>
        The service is provided "as is" without warranties of any kind. We are not responsible for
        user behavior or content shared during video chats. Use at your own risk.
      </p>

      <h2 style={s.h2}>5. Limitation of Liability</h2>
      <p style={s.p}>
        LiveMe and its operators shall not be liable for any damages arising from the use or inability
        to use the service, including but not limited to direct, indirect, incidental, or consequential damages.
      </p>

      <h2 style={s.h2}>6. Termination</h2>
      <p style={s.p}>
        We reserve the right to terminate or suspend access to the service at our sole discretion,
        without prior notice, for conduct that violates these terms or is harmful to other users.
      </p>
    </div>
  );
}

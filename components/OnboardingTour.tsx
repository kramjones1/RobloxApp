import React, { useEffect, useMemo, useState } from 'react';

export type OnboardingStep = 'profile_photo' | 'discover' | 'random_call' | 'conversation' | 'coins' | 'safety' | 'complete';

type Props = {
  initialStep?: OnboardingStep;
  completedSteps?: string[];
  onStepChange: (step: OnboardingStep, completedSteps: string[]) => Promise<void> | void;
  onNavigate: (destination: 'profile' | 'home' | 'messages' | 'wallet' | 'settings') => void;
  onClose?: () => void;
  onStartCallDemo: () => void;
  onStartConversation: () => void;
  onFinish: () => void;
};

const steps: { id: OnboardingStep; title: string; body: string; action: string; destination?: Props['onNavigate'] extends (d: infer D) => void ? D : never }[] = [
  { id: 'profile_photo', title: 'Add your profile photo', body: 'A profile photo helps other members recognize you. Open your profile and add a clear photo before continuing.', action: 'Open my profile', destination: 'profile' },
  { id: 'discover', title: 'Discover people', body: 'Browse member profiles and open a profile to learn more before deciding whether to connect.', action: 'Explore LivMe', destination: 'home' },
  { id: 'random_call', title: 'Try Random Call', body: 'Random Call connects you with another available member. If nobody is available, you can try a clearly labeled demo instead.', action: 'Try call demo' },
  { id: 'conversation', title: 'Start a conversation', body: 'Open Messages to learn how conversations work. Regular outgoing messages use 1 LC; onboarding must not bypass the normal server-side charge.', action: 'Open Messages', destination: 'messages' },
  { id: 'coins', title: 'Understand LivMe Coins', body: 'Your wallet shows your current LC balance and transaction history. You do not need to purchase coins to finish this tour.', action: 'Open wallet', destination: 'wallet' },
  { id: 'safety', title: 'Stay safe on LivMe', body: 'Use the available block and report controls when needed. Never share passwords, verification codes, or sensitive personal information.', action: 'Open settings', destination: 'settings' },
  { id: 'complete', title: 'You are ready!', body: 'You have reached the end of the LivMe introduction. You can replay this guide later from Settings.', action: 'Finish onboarding' },
];

export default function OnboardingTour({ initialStep = 'profile_photo', completedSteps = [], onStepChange, onNavigate, onStartCallDemo, onStartConversation, onFinish }: Props) {
  const [step, setStep] = useState<OnboardingStep>(initialStep);
  const [done, setDone] = useState<string[]>(completedSteps);
  const [busy, setBusy] = useState(false);
  const current = useMemo(() => steps.find(item => item.id === step) || steps[0], [step]);
  const index = steps.findIndex(item => item.id === step);

  useEffect(() => { setStep(initialStep); }, [initialStep]);
  useEffect(() => { setDone(completedSteps); }, [completedSteps]);

  async function advance() {
    if (busy) return;
    if (step === 'profile_photo') { onNavigate('profile'); return; }
    if (step === 'discover') { onNavigate('home'); return; }
    if (step === 'random_call') { onStartCallDemo(); return; }
    if (step === 'conversation') { onStartConversation(); return; }
    if (step === 'coins') { onNavigate('wallet'); return; }
    if (step === 'safety') { onNavigate('settings'); return; }
    if (step === 'complete') { onFinish(); return; }
    const next = steps[Math.min(index + 1, steps.length - 1)].id;
    const nextDone = done.includes(step) ? done : [...done, step];
    setBusy(true);
    try { await onStepChange(next, nextDone); setDone(nextDone); setStep(next); }
    finally { setBusy(false); }
  }

  async function continueFrom(destination: 'profile' | 'home' | 'messages' | 'wallet' | 'settings') {
    if (busy) return;
    const next = steps[Math.min(index + 1, steps.length - 1)].id;
    const nextDone = done.includes(step) ? done : [...done, step];
    setBusy(true);
    try { await onStepChange(next, nextDone); setDone(nextDone); setStep(next); onNavigate(destination); }
    finally { setBusy(false); }
  }

  return <div role="region" aria-label="LivMe getting started guide" style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 10000, pointerEvents: 'none', padding: 0, maxWidth: 'calc(100vw - 32px)', fontFamily: 'system-ui,sans-serif' }}>
    <div style={{ pointerEvents: 'auto', width: 'min(440px, calc(100vw - 32px))', maxHeight: 'min(70vh, 560px)', overflowY: 'auto', borderRadius: 20, padding: 24, background: '#171722', border: '1px solid rgba(255,255,255,.12)', color: '#fff', boxShadow: '0 12px 42px rgba(0,0,0,.45)', animation: 'fadeIn .24s ease-out' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <span style={{ color: '#aaa5ff', fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>LIVME · GETTING STARTED</span>
        <span style={{ color: '#aaa', fontSize: 12 }}>{Math.max(1, index + 1)} / {steps.length}</span>
      </div>
      <div style={{ height: 5, background: '#303044', borderRadius: 8, overflow: 'hidden', margin: '14px 0 24px' }}>
        <div style={{ width: ((index + 1) / steps.length * 100) + '%', height: '100%', background: 'linear-gradient(90deg,#6c63ff,#00c8e8)', transition: 'width .3s ease' }} />
      </div>
      <h2 id="livme-onboarding-title" style={{ fontSize: 25, margin: '0 0 12px', lineHeight: 1.2 }}>{current.title}</h2>
      <p style={{ color: '#c2c2ce', fontSize: 15, lineHeight: 1.65, margin: '0 0 24px' }}>{current.body}</p>
      <button type="button" disabled={busy} onClick={() => {
        if (step === 'profile_photo') void continueFrom('profile');
        else if (step === 'discover') void continueFrom('home');
        else if (step === 'random_call') onStartCallDemo();
        else if (step === 'conversation') onStartConversation();
        else if (step === 'coins') void continueFrom('wallet');
        else if (step === 'safety') void continueFrom('settings');
        else void advance();
      }} style={{ width: '100%', border: 0, borderRadius: 11, padding: '14px 16px', background: 'linear-gradient(110deg,#6258e8,#2676ed)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', opacity: busy ? .6 : 1 }}>{busy ? 'Saving…' : current.action}</button>
      <p style={{ color: '#777789', fontSize: 11, lineHeight: 1.5, margin: '14px 0 0' }}>Your progress is saved to your account. This guide never pretends a demo call is a real person.</p>
    </div>
  </div>;
}

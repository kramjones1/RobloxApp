import React, { useCallback, useEffect, useMemo, useState } from 'react';

export type OnboardingStep = 'profile_photo' | 'discover' | 'random_call' | 'conversation' | 'coins' | 'safety' | 'complete';
type Destination = 'profile' | 'home' | 'messages' | 'wallet' | 'settings';
type Props = {
  initialStep?: OnboardingStep;
  completedSteps?: string[];
  onStepChange: (step: OnboardingStep, completedSteps: string[]) => Promise<void> | void;
  onNavigate: (destination: Destination) => void;
  onStartCallDemo: () => void;
  onStartConversation: () => void;
  onFinish: () => void;
};
type Step = { id: OnboardingStep; title: string; body: string; target: string[]; destination?: Destination };

const steps: Step[] = [
  { id: 'profile_photo', title: 'Make your profile yours', body: 'Add a clear profile photo so people can recognize you. Tap the highlighted photo area to choose an image.', target: ['.profile-avatar[aria-label="Change profile picture"]', '.profile-avatar'], destination: 'profile' },
  { id: 'discover', title: 'Discover people', body: 'Explore LivMe and discover members. Open a profile to learn more and decide who you would like to connect with.', target: ['[data-onboarding-target="discover"]'], destination: 'home' },
  { id: 'random_call', title: 'Try Random Call', body: 'Random Call helps you meet someone live. The demo is only a preview: it will not connect to a real person or enter the matching queue.', target: ['[data-onboarding-target="random-call"]'], destination: 'home' },
  { id: 'conversation', title: 'Your conversations', body: 'Your messages are here. Regular outgoing messages keep their normal 1 LC charge. This tour never changes message billing.', target: ['[data-onboarding-target="messages"]', 'button:has-text("Messages")', 'text:messages', 'text:inbox'], destination: 'messages' },
  { id: 'coins', title: 'Your LivMe Coins', body: 'Your wallet shows your LC balance and transaction history. You do not need to buy coins to complete this introduction.', target: ['[data-onboarding-target="wallet"]', 'text:wallet', 'text:coins'], destination: 'wallet' },
  { id: 'safety', title: 'Keep your experience safe', body: 'Use block and report controls when needed. Never share passwords, verification codes, or sensitive personal information.', target: ['[data-onboarding-target="settings"]', 'text:settings'], destination: 'settings' },
  { id: 'complete', title: 'You are ready!', body: 'That is the LivMe tour. You can replay this guide any time from Settings.', target: [] },
];

function findTarget(selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    try {
      const found = selector.startsWith('text:')
        ? Array.from(document.querySelectorAll('button,a,[role="button"]')).find(node => (node.textContent || '').trim().toLowerCase().includes(selector.slice(5))) as HTMLElement | undefined
        : selector.includes(':has-text(') ? null : document.querySelector(selector) as HTMLElement | null;
      if (found && found.getClientRects().length && found.getAttribute('aria-hidden') !== 'true') return found;
    } catch {}
  }
  return null;
}

export default function OnboardingTour({ initialStep = 'profile_photo', completedSteps = [], onStepChange, onNavigate, onStartCallDemo, onStartConversation, onFinish }: Props) {
  const [step, setStep] = useState<OnboardingStep>(initialStep);
  const [done, setDone] = useState<string[]>(completedSteps);
  const [busy, setBusy] = useState(false);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const current = useMemo(() => steps.find(item => item.id === step) || steps[0], [step]);
  const index = steps.findIndex(item => item.id === step);

  useEffect(() => { setStep(initialStep); }, [initialStep]);
  useEffect(() => { setDone(completedSteps); }, [completedSteps]);

  // Move to the correct screen as soon as a step becomes active. This avoids
  // requiring users to press Next twice when a target is on another page.
  useEffect(() => { if (current.destination) onNavigate(current.destination); }, [current.id]);

  const measureTarget = useCallback(() => {
    const target = findTarget(current.target);
    if (!target) { setTargetRect(null); return; }
    const rect = target.getBoundingClientRect();
    const pad = 9;
    const left = Math.max(8, Math.min(rect.left - pad, window.innerWidth - 32));
    const top = Math.max(8, Math.min(rect.top - pad, window.innerHeight - 32));
    const width = Math.max(24, Math.min(rect.width + pad * 2, window.innerWidth - left - 8));
    const height = Math.max(24, Math.min(rect.height + pad * 2, window.innerHeight - top - 8));
    setTargetRect(new DOMRect(left, top, width, height));
  }, [current]);

  useEffect(() => {
    let frame = 0;
    const refresh = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measureTarget); };
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    window.addEventListener('resize', refresh);
    window.addEventListener('scroll', refresh, true);
    const target = findTarget(current.target);
    target?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', refresh);
      window.removeEventListener('scroll', refresh, true);
    };
  }, [current, measureTarget]);

  async function saveAndMove(next: OnboardingStep) {
    if (busy) return;
    const nextDone = done.includes(step) ? done : [...done, step];
    setBusy(true);
    try {
      await onStepChange(next, nextDone);
      setDone(nextDone);
      setStep(next);
    } finally { setBusy(false); }
  }

  async function handleNext() {
    if (busy) return;
    if (step === 'complete') { onFinish(); return; }
    if (step === 'random_call') {
      onStartCallDemo();
      await saveAndMove('conversation');
      return;
    }
    if (step === 'conversation') {
      onStartConversation();
      await saveAndMove('coins');
      return;
    }
    await saveAndMove(steps[Math.min(index + 1, steps.length - 1)].id);
  }

  async function handleBack() {
    if (busy || index <= 0) return;
    const previous = steps[index - 1];
    const nextDone = done.filter(item => item !== step);
    setBusy(true);
    try {
      await onStepChange(previous.id, nextDone);
      setDone(nextDone);
      setStep(previous.id);
    } finally { setBusy(false); }
  }

  async function handleSkip() {
    if (busy) return;
    const allDone = [...new Set([...done, ...steps.slice(index).map(item => item.id)])];
    setBusy(true);
    try {
      await onStepChange('complete', allDone);
      setDone(allDone);
      setStep('complete');
    } finally { setBusy(false); }
  }

  const rect = targetRect;
  const topHeight = rect ? Math.max(0, rect.top) : 0;
  const leftWidth = rect ? Math.max(0, rect.left) : 0;
  const rightLeft = rect ? rect.right : 0;
  const bottomTop = rect ? rect.bottom : 0;

  return (
    <div role="region" aria-label="LivMe guided tour" aria-live="polite" style={{ position: 'fixed', inset: 0, zIndex: 10000, fontFamily: 'system-ui,sans-serif', pointerEvents: 'none' }}>
      <style>{`
        @keyframes livmeTourFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes livmeTourPop { from { opacity: 0; transform: translateY(12px) scale(.985) } to { opacity: 1; transform: translateY(0) scale(1) } }
        @keyframes livmeTourPulse { 0%,100% { box-shadow: 0 0 0 3px rgba(116,105,255,.28), 0 0 0 0 rgba(116,105,255,.55) } 50% { box-shadow: 0 0 0 3px rgba(116,105,255,.28), 0 0 0 9px rgba(116,105,255,0) } }
        .livme-tour-shade { position: fixed; background: rgba(4,5,13,.76); pointer-events: auto; animation: livmeTourFade .22s ease both; }
        .livme-tour-card { pointer-events: auto; position: fixed; left: 50%; bottom: max(12px, env(safe-area-inset-bottom)); transform: translateX(-50%); width: min(440px, calc(100vw - 24px)); max-height: min(56dvh, 470px); overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; border: 1px solid rgba(255,255,255,.16); border-radius: 20px; padding: 18px; color: white; background: #171722; box-shadow: 0 18px 60px rgba(0,0,0,.52); animation: livmeTourPop .28s cubic-bezier(.2,.8,.2,1) both; }
        .livme-tour-focus { position: fixed; border: 2px solid #8c83ff; border-radius: 15px; pointer-events: none; z-index: 10001; animation: livmeTourPulse 1.8s ease-in-out infinite; transition: top .24s ease, left .24s ease, width .24s ease, height .24s ease; }
        .livme-tour-btn { border: 0; border-radius: 11px; padding: 11px 14px; min-height: 42px; font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap; }
        .livme-tour-actions { position: sticky; bottom: -18px; padding: 12px 0 0; background: #171722; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        @media (max-width: 520px) {
          .livme-tour-card { width: calc(100vw - 20px); padding: 15px; bottom: max(8px, env(safe-area-inset-bottom)); max-height: min(58dvh, 470px); }
          .livme-tour-card h2 { font-size: 19px !important; }
          .livme-tour-card p { overflow-wrap: anywhere; }
          .livme-tour-btn { padding: 10px 12px; min-height: 40px; }
        }
        @media (max-height: 620px) { .livme-tour-card { max-height: 68dvh; padding: 13px; } }
      `}</style>
      {rect ? <>
        <div className="livme-tour-shade" style={{ left: 0, top: 0, width: '100%', height: topHeight }} />
        <div className="livme-tour-shade" style={{ left: 0, top: rect.top, width: leftWidth, height: rect.height }} />
        <div className="livme-tour-shade" style={{ left: rightLeft, top: rect.top, right: 0, height: rect.height }} />
        <div className="livme-tour-shade" style={{ left: 0, top: bottomTop, width: '100%', bottom: 0 }} />
        <div className="livme-tour-focus" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} />
      </> : <div className="livme-tour-shade" style={{ inset: 0 }} />}
      <section className="livme-tour-card" aria-labelledby="livme-tour-title">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ color: '#aaa5ff', fontSize: 11, fontWeight: 800, letterSpacing: 1 }}>LIVME · GUIDED TOUR</span>
          <span style={{ color: '#aaa', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{index + 1} / {steps.length}</span>
        </div>
        <div style={{ height: 5, background: '#303044', borderRadius: 8, overflow: 'hidden', margin: '12px 0 15px' }}>
          <div style={{ width: ((index + 1) / steps.length * 100) + '%', height: '100%', background: 'linear-gradient(90deg,#6c63ff,#00c8e8)', transition: 'width .3s ease' }} />
        </div>
        <h2 id="livme-tour-title" style={{ fontSize: 21, margin: '0 0 8px', lineHeight: 1.2 }}>{current.title}</h2>
        <p style={{ color: '#d0d0dc', fontSize: 14, lineHeight: 1.55, margin: '0 0 14px' }}>{current.body}</p>
        {!rect && step !== 'complete' && <p style={{ color: '#aaa5ff', fontSize: 12, margin: '0 0 12px' }}>Preparing this screen… The guide will highlight the control when it appears.</p>}
        <div className="livme-tour-actions">
          <div style={{ display: 'flex', gap: 7 }}>
            <button type="button" className="livme-tour-btn" disabled={busy || index <= 0} onClick={handleBack} style={{ color: '#ddd', background: '#303044', opacity: index <= 0 ? .4 : 1 }}>Back</button>
            <button type="button" className="livme-tour-btn" disabled={busy} onClick={handleSkip} style={{ color: '#aaa', background: 'transparent' }}>Skip</button>
          </div>
          <button type="button" className="livme-tour-btn" disabled={busy} onClick={handleNext} style={{ color: '#fff', background: 'linear-gradient(110deg,#6258e8,#2676ed)', minWidth: 118, opacity: busy ? .65 : 1 }}>
            {busy ? 'Saving…' : step === 'complete' ? 'Finish tour' : step === 'profile_photo' ? 'Continue' : step === 'random_call' ? 'Try demo' : 'Next'}
          </button>
        </div>
        <p style={{ color: '#89899a', fontSize: 11, lineHeight: 1.45, margin: '11px 0 0' }}>Progress is saved to your account. If you sign out, the tour pauses and resumes here after you sign back in.</p>
      </section>
    </div>
  );
}

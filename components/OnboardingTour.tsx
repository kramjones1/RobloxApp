import React, { useCallback, useEffect, useMemo, useState } from 'react';

export type OnboardingStep = 'profile_photo' | 'discover' | 'random_call' | 'conversation' | 'coins' | 'safety' | 'complete';

type Destination = 'profile' | 'home' | 'messages' | 'wallet' | 'settings';
type Props = {
  initialStep?: OnboardingStep;
  completedSteps?: string[];
  onStepChange: (step: OnboardingStep, completedSteps: string[]) => Promise<void> | void;
  onNavigate: (destination: Destination) => void;
  onClose?: () => void;
  onStartCallDemo: () => void;
  onStartConversation: () => void;
  onFinish: () => void;
};

type Step = {
  id: OnboardingStep;
  title: string;
  body: string;
  target: string[];
  destination?: Destination;
};

const steps: Step[] = [
  { id: 'profile_photo', title: 'Make your profile yours', body: 'Add a clear profile photo so people can recognize you. Tap the highlighted photo area to choose an image.', target: ['.profile-avatar', '[aria-label="Change profile picture"]'], destination: 'profile' },
  { id: 'discover', title: 'Discover people', body: 'This is where you explore LivMe and discover members. Open a profile to learn more and decide who you would like to connect with.', target: ['[data-onboarding-target="discover"]', 'main', '.home-page-root'], destination: 'home' },
  { id: 'random_call', title: 'Try Random Call', body: 'Random Call is how you meet someone live. The tutorial preview below is not a real call and will not enter the matching queue.', target: ['[data-onboarding-target="random-call"]', 'text:random call', 'text:go live'], destination: 'home' },
  { id: 'conversation', title: 'Your conversations', body: 'Messages live here. Regular outgoing messages keep using the normal 1 LC charge. This tour never bypasses message billing.', target: ['[data-onboarding-target="messages"]', 'text:messages', 'text:inbox'], destination: 'messages' },
  { id: 'coins', title: 'Your LivMe Coins', body: 'Your wallet shows your LC balance and transaction history. You do not need to buy coins to complete this introduction.', target: ['[data-onboarding-target="wallet"]', 'text:wallet', 'text:coins'], destination: 'wallet' },
  { id: 'safety', title: 'Keep your experience safe', body: 'Use block and report controls when needed. Never share passwords, verification codes, or sensitive personal information.', target: ['[data-onboarding-target="safety"]', 'text:settings', 'main'], destination: 'settings' },
  { id: 'complete', title: 'You are ready!', body: 'That is the LivMe tour. You can replay this guide any time from Settings.', target: [] },
];

function findTarget(selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    try {
      const found = selector.startsWith('text:')\n        ? Array.from(document.querySelectorAll('button,a,[role="button"]')).find(node => (node.textContent || '').trim().toLowerCase().includes(selector.slice(5))) as HTMLElement | undefined\n        : document.querySelector(selector) as HTMLElement | null;
      if (found && found.getClientRects().length && found.getAttribute('aria-hidden') !== 'true') return found;
    } catch {}
  }
  return null;
}

export default function OnboardingTour({
  initialStep = 'profile_photo',
  completedSteps = [],
  onStepChange,
  onNavigate,
  onClose,
  onStartCallDemo,
  onStartConversation,
  onFinish,
}: Props) {
  const [step, setStep] = useState<OnboardingStep>(initialStep);
  const [done, setDone] = useState<string[]>(completedSteps);
  const [busy, setBusy] = useState(false);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const current = useMemo(() => steps.find(item => item.id === step) || steps[0], [step]);
  const index = steps.findIndex(item => item.id === step);

  const measureTarget = useCallback(() => {
    const target = findTarget(current.target);
    if (!target) {
      setTargetRect(null);
      return;
    }
    const rect = target.getBoundingClientRect();
    const pad = 9;
    setTargetRect(new DOMRect(
      Math.max(8, rect.left - pad),
      Math.max(8, rect.top - pad),
      Math.min(window.innerWidth - 16, rect.width + pad * 2),
      Math.min(window.innerHeight - 16, rect.height + pad * 2),
    ));
  }, [current]);

  useEffect(() => { setStep(initialStep); }, [initialStep]);
  useEffect(() => { setDone(completedSteps); }, [completedSteps]);

  useEffect(() => {
    let frame = 0;
    const refresh = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measureTarget);
    };
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
    } finally {
      setBusy(false);
    }
  }

  async function handleNext() {
    if (busy) return;
    if (step === 'complete') { onFinish(); return; }
    if (current.destination && !findTarget(current.target)) { onNavigate(current.destination); return; }
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
    const next = steps[Math.min(index + 1, steps.length - 1)].id;
    await saveAndMove(next);
    const nextStep = steps.find(item => item.id === next);
    if (nextStep?.destination) onNavigate(nextStep.destination);
  }

  async function handleBack() {
    if (busy || index <= 0) return;
    const previous = steps[index - 1];
    await saveAndMove(previous.id);
    if (previous.destination) onNavigate(previous.destination);
  }

  async function handleSkip() {
    if (busy) return;
    const allDone = [...new Set([...done, ...steps.slice(index).map(item => item.id)])];
    setBusy(true);
    try {
      await onStepChange('complete', allDone);
      setDone(allDone);
      setStep('complete');
    } finally {
      setBusy(false);
    }
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
        @keyframes livmeTourPop { from { opacity: 0; transform: translateY(12px) scale(.98) } to { opacity: 1; transform: translateY(0) scale(1) } }
        @keyframes livmeTourPulse { 0%,100% { box-shadow: 0 0 0 3px rgba(116,105,255,.28), 0 0 0 0 rgba(116,105,255,.55) } 50% { box-shadow: 0 0 0 3px rgba(116,105,255,.28), 0 0 0 9px rgba(116,105,255,0) } }
        .livme-tour-shade { position: fixed; background: rgba(4,5,13,.76); pointer-events: auto; animation: livmeTourFade .22s ease both; }
        .livme-tour-card { pointer-events: auto; position: fixed; left: 50%; bottom: max(16px, env(safe-area-inset-bottom)); transform: translateX(-50%); width: min(440px, calc(100vw - 28px)); max-height: min(46vh, 390px); overflow-y: auto; border: 1px solid rgba(255,255,255,.14); border-radius: 20px; padding: 19px; color: white; background: #171722; box-shadow: 0 18px 60px rgba(0,0,0,.48); animation: livmeTourPop .28s cubic-bezier(.2,.8,.2,1) both; }
        .livme-tour-focus { position: fixed; border: 2px solid #8c83ff; border-radius: 15px; pointer-events: none; z-index: 10001; animation: livmeTourPulse 1.8s ease-in-out infinite; transition: top .24s ease, left .24s ease, width .24s ease, height .24s ease; }
        .livme-tour-btn { border: 0; border-radius: 11px; padding: 11px 15px; font-size: 13px; font-weight: 700; cursor: pointer; }
        @media (max-width: 520px) { .livme-tour-card { padding: 16px; bottom: max(10px, env(safe-area-inset-bottom)); } }
      `}</style>
      {rect ? (
        <>
          <div className="livme-tour-shade" style={{ left: 0, top: 0, width: '100%', height: topHeight }} />
          <div className="livme-tour-shade" style={{ left: 0, top: rect.top, width: leftWidth, height: rect.height }} />
          <div className="livme-tour-shade" style={{ left: rightLeft, top: rect.top, right: 0, height: rect.height }} />
          <div className="livme-tour-shade" style={{ left: 0, top: bottomTop, width: '100%', bottom: 0 }} />
          <div className="livme-tour-focus" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} />
        </>
      ) : (
        <div className="livme-tour-shade" style={{ inset: 0 }} />
      )}
      <section className="livme-tour-card" aria-labelledby="livme-tour-title">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ color: '#aaa5ff', fontSize: 11, fontWeight: 800, letterSpacing: 1 }}>LIVME · GUIDED TOUR</span>
          <span style={{ color: '#aaa', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{index + 1} / {steps.length}</span>
        </div>
        <div style={{ height: 5, background: '#303044', borderRadius: 8, overflow: 'hidden', margin: '12px 0 17px' }}>
          <div style={{ width: ((index + 1) / steps.length * 100) + '%', height: '100%', background: 'linear-gradient(90deg,#6c63ff,#00c8e8)', transition: 'width .3s ease' }} />
        </div>
        <h2 id="livme-tour-title" style={{ fontSize: 21, margin: '0 0 8px', lineHeight: 1.2 }}>{current.title}</h2>
        <p style={{ color: '#c2c2ce', fontSize: 13, lineHeight: 1.55, margin: '0 0 16px' }}>{current.body}</p>
        {!rect && step !== 'complete' && <p style={{ color: '#aaa5ff', fontSize: 11, margin: '-5px 0 12px' }}>The highlighted area will appear when this screen is ready.</p>}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', gap: 7 }}>
            <button type="button" className="livme-tour-btn" disabled={busy || index <= 0} onClick={handleBack} style={{ color: '#ddd', background: '#303044', opacity: index <= 0 ? .4 : 1 }}>Back</button>
            <button type="button" className="livme-tour-btn" disabled={busy} onClick={handleSkip} style={{ color: '#aaa', background: 'transparent' }}>Skip</button>
          </div>
          <button type="button" className="livme-tour-btn" disabled={busy} onClick={handleNext} style={{ color: '#fff', background: 'linear-gradient(110deg,#6258e8,#2676ed)', minWidth: 118, opacity: busy ? .65 : 1 }}>
            {busy ? 'Saving…' : step === 'complete' ? 'Finish tour' : step === 'profile_photo' ? 'Continue' : step === 'random_call' ? 'Try demo' : 'Next'}
          </button>
        </div>
        <p style={{ color: '#777789', fontSize: 10, lineHeight: 1.45, margin: '12px 0 0' }}>Your progress is saved to your account. Normal messaging, calling, and wallet rules stay unchanged.</p>
      </section>
    </div>
  );
}

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type OnboardingStep = 'profile_photo' | 'discover' | 'random_call' | 'conversation' | 'coins' | 'safety' | 'complete';
type Destination = 'profile' | 'home' | 'messages' | 'wallet' | 'settings';
type Props = {
  initialStep?: OnboardingStep;
  completedSteps?: string[];
  onStepChange: (step: OnboardingStep, completedSteps: string[]) => Promise<void> | void;
  onNavigate: (destination: Destination) => void;
  onStartCallDemo: () => void;
  onStartConversation: () => void;
  onFinish: () => Promise<void> | void;
};
type Step = { id: OnboardingStep; title: string; body: string; target: string[]; destination?: Destination };

const steps: Step[] = [
  { id: 'profile_photo', title: 'Make your profile yours', body: 'Add a clear profile photo so people can recognize you. Tap the profile photo area to choose an image.', target: ['.profile-avatar[aria-label="Change profile picture"]', '.profile-avatar'], destination: 'profile' },
  { id: 'discover', title: 'Discover people', body: 'Explore LivMe and discover members. Open a profile to learn more and decide who you would like to connect with.', target: ['[data-onboarding-target="discover"]'], destination: 'home' },
  { id: 'random_call', title: 'Try Random Call', body: 'Random Call helps you meet someone live. The demo is only a preview: it will not connect to a real person or enter the matching queue.', target: ['[data-onboarding-target="random-call"]'], destination: 'home' },
  { id: 'conversation', title: 'Your conversations', body: 'Your messages are here. Regular outgoing messages keep their normal 1 LC charge. This tour never changes message billing.', target: ['[data-onboarding-target="messages"]', 'button:has-text("Messages")', 'text:messages', 'text:inbox'], destination: 'messages' },
  { id: 'coins', title: 'Understand LivMe Coins', body: 'Your wallet shows your current LC balance and transaction history. You do not need to purchase coins to finish this tour.', target: ['[data-onboarding-target="wallet"]', 'text:wallet', 'text:coins'], destination: 'wallet' },
  { id: 'safety', title: 'Keep your experience safe', body: 'Use block and report controls when needed. Never share passwords, verification codes, or sensitive personal information.', target: ['[data-onboarding-target="settings"]', 'text:settings'], destination: 'settings' },
  { id: 'complete', title: 'You are ready!', body: 'That is the LivMe tour. You can replay this guide any time from Settings.', target: [] },
];

function findTarget(selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    try {
      const candidates = selector.startsWith('text:')
        ? Array.from(document.querySelectorAll('button,a,[role="button"],h1,h2,h3'))
            .filter(node => (node.textContent || '').trim().toLowerCase().includes(selector.slice(5)))
        : Array.from(document.querySelectorAll(selector));
      const visible = candidates.find(node => {
        const element = node as HTMLElement;
        return element.getClientRects().length > 0
          && element.getAttribute('aria-hidden') !== 'true'
          && getComputedStyle(element).visibility !== 'hidden'
          && getComputedStyle(element).display !== 'none';
      }) as HTMLElement | undefined;
      if (visible) return visible;
    } catch {}
  }
  return null;
}

export default function OnboardingTour({ initialStep = 'profile_photo', completedSteps = [], onStepChange, onNavigate, onStartCallDemo, onStartConversation, onFinish }: Props) {
  const [step, setStep] = useState<OnboardingStep>(initialStep);
  const [done, setDone] = useState<string[]>(completedSteps);
  const [busy, setBusy] = useState(false);
  const [transitionError, setTransitionError] = useState('');
  const actionLockRef = useRef(false);
  const [profileReady, setProfileReady] = useState(false);
  const [promptVisible, setPromptVisible] = useState(true);
  const localTransitionRef = useRef<OnboardingStep | null>(null);
  const [profileIntroComplete, setProfileIntroComplete] = useState(initialStep !== 'profile_photo');
  const current = useMemo(() => steps.find(item => item.id === step) || steps[0], [step]);
  const index = steps.findIndex(item => item.id === step);
  const photoOnlyMode = step === 'profile_photo' && profileIntroComplete && !done.includes('profile_photo');

  // Keep the entire app locked while the guided tour is active. Only the
  // tour prompt is interactive, except during the photo step when the avatar
  // and its file input are the sole permitted controls. This also locks menus
  // and navigation while the prompt is temporarily hidden between transitions.
  useEffect(() => {
    const isAllowed = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return false;
      if (target.closest('.livme-tour-card')) return true;
      return photoOnlyMode && Boolean(target.closest('[data-onboarding-allow-profile-photo="true"]'));
    };

    const blockOutsideTour = (event: Event) => {
      if (isAllowed(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      if ('stopImmediatePropagation' in event) event.stopImmediatePropagation();
    };

    const trapKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        const avatar = photoOnlyMode
          ? document.querySelector<HTMLElement>('[data-onboarding-allow-profile-photo="true"][role="button"]')
          : null;
        if (avatar) {
          event.preventDefault();
          avatar.focus({ preventScroll: true });
          return;
        }

        const card = document.querySelector<HTMLElement>('.livme-tour-card');
        const focusable = card
          ? Array.from(card.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'))
              .filter(element => element.getClientRects().length > 0)
          : [];
        if (!focusable.length) {
          event.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (!card?.contains(active)) {
          event.preventDefault();
          first.focus();
        } else if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }

      if (isAllowed(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    document.addEventListener('pointerdown', blockOutsideTour, true);
    document.addEventListener('click', blockOutsideTour, true);
    document.addEventListener('contextmenu', blockOutsideTour, true);
    document.addEventListener('submit', blockOutsideTour, true);
    document.addEventListener('keydown', trapKeyboard, true);
    return () => {
      document.removeEventListener('pointerdown', blockOutsideTour, true);
      document.removeEventListener('click', blockOutsideTour, true);
      document.removeEventListener('contextmenu', blockOutsideTour, true);
      document.removeEventListener('submit', blockOutsideTour, true);
      document.removeEventListener('keydown', trapKeyboard, true);
    };
  }, [photoOnlyMode]);

  // Clearly identify the required upload target only after the intro prompt
  // has been dismissed. The avatar gets a restrained pulsing outline and a
  // small floating label; the rest of the page is not dimmed or obscured.
  useEffect(() => {
    if (!photoOnlyMode) return;
    const target = findTarget(['.profile-avatar[aria-label="Change profile picture"]', '.profile-avatar']);
    if (!target) return;
    target.setAttribute('aria-describedby', 'livme-tour-photo-hint');
    target.classList.add('livme-tour-photo-target');
    return () => {
      target.removeAttribute('aria-describedby');
      target.classList.remove('livme-tour-photo-target');
    };
  }, [photoOnlyMode, profileReady]);

  useEffect(() => {
    setStep(initialStep);
    if (localTransitionRef.current === initialStep) {
      localTransitionRef.current = null;
      return;
    }
    // A server-driven step change (notably after the photo upload completes)
    // first lets the destination page render, then reveals the next instruction.
    // This prevents the Discover prompt flashing over the profile page.
    setPromptVisible(false);
    setProfileIntroComplete(initialStep !== 'profile_photo');
    if (initialStep === 'profile_photo') setProfileReady(false);
    let firstFrame = 0;
    let secondFrame = 0;
    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => setPromptVisible(true));
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [initialStep]);
  useEffect(() => { setDone(completedSteps); }, [completedSteps]);

  // Move to the correct screen as soon as a step becomes active. This avoids
  // requiring users to press Next twice when a target is on another page.
  useEffect(() => { if (current.destination) onNavigate(current.destination); }, [current.id]);

  const measureTarget = useCallback(() => {
    if (current.id !== 'profile_photo') return;
    const target = findTarget(current.target);
    setProfileReady(Boolean(target));
  }, [current]);

  useEffect(() => {
    let frame = 0;
    const refresh = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measureTarget); };
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    window.addEventListener('resize', refresh);
    window.addEventListener('scroll', refresh, true);
    const target = current.id === 'profile_photo' ? findTarget(current.target) : null;
    target?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', refresh);
      window.removeEventListener('scroll', refresh, true);
    };
  }, [current, measureTarget]);

  async function saveAndMove(next: OnboardingStep, beforeSave?: () => void) {
    if (actionLockRef.current) return;
    actionLockRef.current = true;
    const nextDone = done.includes(step) ? done : [...done, step];
    setTransitionError('');
    setPromptVisible(false);
    setBusy(true);
    localTransitionRef.current = next;
    try {
      // The old prompt is already hidden before any demo or route side effect.
      beforeSave?.();
      await onStepChange(next, nextDone);
      setDone(nextDone);
      setStep(next);
      // Reveal only after React commits the new step and its destination.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setPromptVisible(true);
        actionLockRef.current = false;
      }));
    } catch (error: any) {
      localTransitionRef.current = null;
      setTransitionError(error?.message || 'Could not save your progress. Please try again.');
      setPromptVisible(true);
      actionLockRef.current = false;
    } finally {
      setBusy(false);
    }
  }

  async function handleNext() {
    if (busy || actionLockRef.current) return;
    if (step === 'profile_photo' && !profileIntroComplete) {
      if (!profileReady) return;
      setProfileIntroComplete(true);
      // Let the user see and use the real profile page without a tour layer.
      setPromptVisible(false);
      return;
    }
    if (step === 'profile_photo' && !done.includes('profile_photo')) return;
    if (step === 'complete') {
      if (actionLockRef.current) return;
      actionLockRef.current = true;
      setPromptVisible(false);
      setBusy(true);
      setTransitionError('');
      try {
        await onFinish();
      } catch (error: any) {
        setTransitionError(error?.message || 'Could not finish onboarding. Please try again.');
        setPromptVisible(true);
      } finally {
        actionLockRef.current = false;
        setBusy(false);
      }
      return;
    }
    if (step === 'random_call') {
      await saveAndMove('conversation', onStartCallDemo);
      return;
    }
    if (step === 'conversation') {
      await saveAndMove('coins', onStartConversation);
      return;
    }
    await saveAndMove(steps[Math.min(index + 1, steps.length - 1)].id);
  }

  return (
    <div role="region" aria-label="LivMe guided tour" aria-live="polite" style={{ position: 'fixed', inset: 0, zIndex: 10000, width: '100%', height: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: step === 'profile_photo' && !profileIntroComplete ? 0 : 'max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left))', fontFamily: 'system-ui,sans-serif', pointerEvents: 'none' }}>
      <style>{`
        @keyframes livmeTourPop { from { opacity: 0; } to { opacity: 1; } }
        @keyframes livmePhotoTargetPulse {
          0%,100% { outline: 3px solid rgba(255,213,79,.9); outline-offset: 5px; box-shadow: 0 0 0 9px rgba(255,213,79,.13), 0 0 24px 8px rgba(255,213,79,.35); }
          50% { outline: 4px solid rgba(0,212,255,1); outline-offset: 8px; box-shadow: 0 0 0 13px rgba(0,212,255,.15), 0 0 34px 12px rgba(108,99,255,.48); }
        }
        .livme-tour-photo-target { position: relative; z-index: 10002 !important; animation: livmePhotoTargetPulse 1.5s ease-in-out infinite; }
        .livme-tour-photo-hint { position: fixed; z-index: 10003; left: 50%; bottom: max(18px, env(safe-area-inset-bottom)); transform: translateX(-50%); width: min(440px, calc(100vw - 28px)); box-sizing: border-box; padding: 12px 16px; border: 1px solid rgba(150,140,255,.55); border-radius: 14px; color: #fff; background: rgba(23,23,34,.97); box-shadow: 0 10px 34px rgba(0,0,0,.45); text-align: center; font-size: 13px; line-height: 1.45; pointer-events: none; }
        .livme-tour-card.livme-tour-card--intro { width: 100%; max-width: none; height: 100dvh; max-height: 100dvh; margin: 0; border-radius: 0; display: flex; flex-direction: column; justify-content: center; padding: clamp(24px, 6vw, 48px); }
        .livme-tour-card { pointer-events: auto; position: relative; box-sizing: border-box; width: min(440px, 100%); max-height: calc(100dvh - max(24px, env(safe-area-inset-top)) - max(24px, env(safe-area-inset-bottom))); margin: auto; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; border: 1px solid rgba(255,255,255,.16); border-radius: 20px; padding: 18px; color: white; background: #171722; box-shadow: 0 18px 60px rgba(0,0,0,.52); animation: livmeTourPop .28s ease both; }
        .livme-tour-btn { border: 0; border-radius: 11px; padding: 11px 14px; min-height: 42px; font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap; }
        .livme-tour-actions { position: sticky; bottom: -18px; padding: 12px 0 0; background: #171722; display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
        .livme-tour-resume { position: fixed; left: 50%; bottom: max(18px, env(safe-area-inset-bottom)); transform: translateX(-50%); pointer-events: auto; border: 1px solid rgba(255,255,255,.2); border-radius: 999px; padding: 12px 20px; color: #fff; background: linear-gradient(110deg,#6258e8,#2676ed); font-weight: 750; box-shadow: 0 8px 30px rgba(0,0,0,.4); }
        @media (prefers-reduced-motion: reduce) {
          .livme-tour-photo-target { animation: none; outline: 3px solid #ffd54f; outline-offset: 6px; box-shadow: 0 0 0 10px rgba(255,213,79,.2); }
        }
        @media (max-width: 520px) {
          .livme-tour-card { width: 100%; max-width: 440px; padding: 15px; max-height: calc(100dvh - max(24px, env(safe-area-inset-top)) - max(24px, env(safe-area-inset-bottom))); }
          .livme-tour-card h2 { font-size: 19px !important; }
          .livme-tour-card p { overflow-wrap: anywhere; }
          .livme-tour-btn { padding: 10px 12px; min-height: 40px; }
        }
        @media (max-height: 620px) { .livme-tour-card { max-height: calc(100dvh - 20px); padding: 13px; } }
      `}</style>
      {photoOnlyMode && !promptVisible && <div id="livme-tour-photo-hint" className="livme-tour-photo-hint">Add your profile picture to continue. Other page controls stay locked until it is saved.</div>}
      {promptVisible ? <section className={`livme-tour-card${step === 'profile_photo' && !profileIntroComplete ? ' livme-tour-card--intro' : ''}`} aria-labelledby="livme-tour-title">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ color: '#aaa5ff', fontSize: 11, fontWeight: 800, letterSpacing: 1 }}>LIVME · GUIDED TOUR</span>
            <span style={{ color: '#aaa', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{index + 1} / {steps.length}</span>
          </div>
          <div style={{ height: 5, background: '#303044', borderRadius: 8, overflow: 'hidden', margin: '12px 0 15px' }}>
            <div style={{ width: ((index + 1) / steps.length * 100) + '%', height: '100%', background: 'linear-gradient(90deg,#6c63ff,#00c8e8)', transition: 'width .3s ease' }} />
          </div>
          <h2 id="livme-tour-title" style={{ fontSize: 21, margin: '0 0 8px', lineHeight: 1.2 }}>{step === 'profile_photo' && !profileIntroComplete ? 'Add your profile picture' : current.title}</h2>
          <p style={{ color: '#d0d0dc', fontSize: 14, lineHeight: 1.6, margin: '0 0 14px', overflowWrap: 'anywhere' }}>{step === 'profile_photo' && !profileIntroComplete ? 'Before exploring LivMe, add a profile picture. Tap Next to reveal your profile, then select the profile photo area. You must save a profile picture to unlock the rest of the tour.' : current.body}</p>
          {transitionError && <p role="alert" style={{ color: '#ff9b9b', fontSize: 12, margin: '0 0 12px' }}>{transitionError}</p>}
          {step === 'profile_photo' && !profileReady && <p style={{ color: '#aaa5ff', fontSize: 12, margin: '0 0 12px' }}>Loading your profile controls… Next will activate when the profile is ready.</p>}
          {step === 'profile_photo' && profileIntroComplete && !done.includes('profile_photo') && <p style={{ color: '#aaa5ff', fontSize: 12, margin: '0 0 12px' }}>Your profile picture is required to continue. Tap the profile photo area above. Other page controls stay locked until your photo has uploaded and saved successfully.</p>}
          <div className="livme-tour-actions">
            <button type="button" className="livme-tour-btn" disabled={busy || (step === 'profile_photo' && (!profileReady || (profileIntroComplete && !done.includes('profile_photo'))))} onClick={handleNext} style={{ color: '#fff', background: 'linear-gradient(110deg,#6258e8,#2676ed)', minWidth: 132, opacity: busy || (step === 'profile_photo' && (!profileReady || (profileIntroComplete && !done.includes('profile_photo')))) ? .55 : 1, cursor: busy || (step === 'profile_photo' && (!profileReady || (profileIntroComplete && !done.includes('profile_photo')))) ? 'not-allowed' : 'pointer' }}>
              {busy ? 'Saving…' : step === 'complete' ? 'Finish' : step === 'profile_photo' && !profileIntroComplete ? (profileReady ? 'Next' : 'Preparing…') : step === 'profile_photo' ? 'Add photo to continue' : 'Next'}
            </button>
          </div>
          <p style={{ color: '#89899a', fontSize: 11, lineHeight: 1.45, margin: '11px 0 0' }}>{step === 'profile_photo' ? 'Your profile photo is required. The guide will continue automatically after the upload is saved.' : 'Tap Next to continue the guided tour. Your progress is saved to your account.'}</p>
        </section> : step !== 'profile_photo' ? (
        <button type="button" className="livme-tour-resume" onClick={() => setPromptVisible(true)}>
          Continue guided tour
        </button>
      ) : null}
    </div>
  );
}

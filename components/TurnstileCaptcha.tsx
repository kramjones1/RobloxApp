import React, { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
    };
  }
}

const SITE_KEY = '0x4AAAAAAF_LUXAxG7meWKvs';

export default function TurnstileCaptcha({ onVerify, resetKey = 0 }: { onVerify: (token: string) => void; resetKey?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onVerifyRef = useRef(onVerify);
  const [isActiveLayout, setIsActiveLayout] = useState(false);
  const [loadError, setLoadError] = useState('');

  // Keep the latest callback without forcing Turnstile to be torn down and
  // recreated whenever a parent renders.
  useEffect(() => {
    onVerifyRef.current = onVerify;
  }, [onVerify]);

  // App.web.tsx keeps mobile and desktop auth trees mounted together and hides
  // one with CSS. Only render Turnstile in the currently visible tree.
  useEffect(() => {
    const media = window.matchMedia('(max-width: 699px)');
    const update = () => {
      const container = containerRef.current;
      const mobileHost = container?.closest('.mobile-auth');
      const desktopHost = container?.closest('.desktop-layout');
      if (mobileHost) setIsActiveLayout(media.matches);
      else if (desktopHost) setIsActiveLayout(!media.matches);
      else setIsActiveLayout(true);
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!isActiveLayout) return;

    let cancelled = false;
    let retryTimer: number | undefined;
    let timeoutTimer: number | undefined;
    let script: HTMLScriptElement | null = null;

    const cleanupWidget = () => {
      if (widgetIdRef.current && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current); } catch {}
      }
      widgetIdRef.current = null;
    };

    const render = () => {
      if (cancelled || !containerRef.current || !window.turnstile || widgetIdRef.current) return;
      try {
        setLoadError('');
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          theme: 'dark',
          callback: (token: string) => {
            setLoadError('');
            onVerifyRef.current(token);
          },
          'expired-callback': () => {
            onVerifyRef.current('');
          },
          'error-callback': (errorCode: string) => {
            console.error('[LiveMe Turnstile] Challenge error:', errorCode || 'unknown');
            onVerifyRef.current('');
            setLoadError('Security verification failed to load. Please refresh the page and try again.');
          },
        });
      } catch (error) {
        console.error('[LiveMe Turnstile] Widget render failed:', error);
        onVerifyRef.current('');
        setLoadError('Security verification could not start. Please refresh the page and try again.');
      }
    };

    const handleScriptError = () => {
      if (cancelled) return;
      setLoadError('Security verification could not connect. Check your connection and refresh the page.');
    };

    if (window.turnstile) {
      render();
    } else {
      script = document.querySelector<HTMLScriptElement>('script[data-livme-turnstile]');
      if (!script) {
        script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.dataset.livmeTurnstile = 'true';
        document.head.appendChild(script);
      }

      script.addEventListener('load', render);
      script.addEventListener('error', handleScriptError);
      retryTimer = window.setInterval(() => {
        if (window.turnstile) {
          if (retryTimer !== undefined) window.clearInterval(retryTimer);
          render();
        }
      }, 100);
      timeoutTimer = window.setTimeout(() => {
        if (!window.turnstile && !cancelled) {
          setLoadError('Security verification is taking too long to load. Please refresh the page and try again.');
        }
      }, 15000);
    }

    return () => {
      cancelled = true;
      if (retryTimer !== undefined) window.clearInterval(retryTimer);
      if (timeoutTimer !== undefined) window.clearTimeout(timeoutTimer);
      script?.removeEventListener('load', render);
      script?.removeEventListener('error', handleScriptError);
      cleanupWidget();
    };
  }, [isActiveLayout, resetKey]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: 65, margin: '4px 0' }}>
      <div ref={containerRef} style={{ display: 'flex', justifyContent: 'center', minHeight: 65 }} />
      {loadError && <p role="alert" style={{ color: '#ff9b9b', fontSize: 12, lineHeight: 1.4, textAlign: 'center', maxWidth: 320, margin: '4px 0' }}>{loadError}</p>}
    </div>
  );
}

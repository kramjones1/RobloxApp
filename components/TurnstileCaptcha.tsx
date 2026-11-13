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
  const [isActiveLayout, setIsActiveLayout] = useState(false);

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
    const render = () => {
      if (cancelled || !containerRef.current || !window.turnstile || widgetIdRef.current) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: SITE_KEY,
        theme: 'dark',
        callback: (token: string) => onVerify(token),
        'expired-callback': () => onVerify(''),
        'error-callback': () => onVerify(''),
      });
    };

    if (window.turnstile) render();
    else {
      let script = document.querySelector<HTMLScriptElement>('script[data-livme-turnstile]');
      if (!script) {
        script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.dataset.livmeTurnstile = 'true';
        document.head.appendChild(script);
      }
      script.addEventListener('load', render);
      const retry = window.setInterval(() => { if (window.turnstile) { window.clearInterval(retry); render(); } }, 250);
      return () => {
        cancelled = true;
        script?.removeEventListener('load', render);
        window.clearInterval(retry);
        if (widgetIdRef.current && window.turnstile) { window.turnstile.remove(widgetIdRef.current); widgetIdRef.current = null; }
      };
    }

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) { window.turnstile.remove(widgetIdRef.current); widgetIdRef.current = null; }
    };
  }, [isActiveLayout, onVerify, resetKey]);

  return <div ref={containerRef} style={{ display: 'flex', justifyContent: 'center', minHeight: 65, margin: '4px 0' }} />;
}
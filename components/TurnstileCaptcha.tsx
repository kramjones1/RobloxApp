import React, { useEffect, useRef } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, any>) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

interface Props { onToken: (token: string) => void; resetKey: number; }
const SITE_KEY = '0x4AAAAAAF_LUXAxG7meWKvs';
const SCRIPT_ID = 'cloudflare-turnstile-api';

export default function TurnstileCaptcha({ onToken, resetKey }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const callbackRef = useRef(onToken);
  const previousResetRef = useRef(resetKey);
  useEffect(() => { callbackRef.current = onToken; }, [onToken]);

  useEffect(() => {
    let cancelled = false;
    let retryId: number | undefined;
    const render = () => {
      if (cancelled || !containerRef.current || !window.turnstile || widgetIdRef.current) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: SITE_KEY,
        theme: 'dark',
        callback: (token: string) => callbackRef.current(token),
        'expired-callback': () => callbackRef.current(''),
        'error-callback': () => { callbackRef.current(''); return true; },
      });
    };
    if (window.turnstile) render();
    else {
      let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement('script');
        script.id = SCRIPT_ID;
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
      script.addEventListener('load', render);
      retryId = window.setInterval(() => { if (window.turnstile) { if (retryId) window.clearInterval(retryId); render(); } }, 150);
    }
    return () => { cancelled = true; if (retryId) window.clearInterval(retryId); };
  }, []);

  useEffect(() => {
    if (previousResetRef.current !== resetKey && widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
    previousResetRef.current = resetKey;
  }, [resetKey]);

  return <div ref={containerRef} style={{ minHeight: 65, display: 'flex', justifyContent: 'center', alignItems: 'center' }} />;
}

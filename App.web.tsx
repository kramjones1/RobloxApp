import React, { useEffect, useRef, useState } from 'react';
import { signUp, verifySignupOtp, resendSignupOtp, signIn, signOut, resetPassword, updatePassword, verifyRecoveryToken, exchangeRecoveryCode, setSessionToken, getSession, onAuthChange, getChatProfile, upsertChatProfile, signInWithGoogle, signInWithGitHub, getUserProfile, getConversations, saveRecentLive, isAdmin, checkIsBanned, getBanReason, getValidAccessToken, refreshAccessToken } from './supabaseClient';
import MessagesPage from './pages/MessagesPage';
import { startUserPresence, startOperatorSessionPresence } from './chatPresence';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import LandingPage from './pages/LandingPage';
import PrivacyPage from './pages/PrivacyPage';
import TermsPage from './pages/TermsPage';
import ProfilePage from './pages/ProfilePage';
import AdminPage from './pages/AdminPage';
import SettingsPage from './pages/SettingsPage';
import WalletPage from './pages/WalletPage';
import TurnstileCaptcha from './components/TurnstileCaptcha';
import OnboardingTour, { OnboardingStep } from './components/OnboardingTour';
import { saveOnboardingProgress } from './onboardingClient';

// Keep preview/local testing isolated on the staging Worker. Production Pages
// must use the migrated production Worker so it receives the production fixes.
const IS_STAGING = typeof window !== 'undefined' &&
  (window.location.hostname.includes('deploy-preview-') || window.location.hostname.endsWith('.livme-onboarding-preview.pages.dev') || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const WS_URL = IS_STAGING
  ? 'wss://omegle-signaling-server.kafka9607.workers.dev'
  : 'wss://omegle-signaling-cloudflare.kafka9607.workers.dev';
const API_URL = IS_STAGING
  ? 'https://omegle-signaling-server.kafka9607.workers.dev'
  : 'https://omegle-signaling-cloudflare.kafka9607.workers.dev';
const SIGNALING_ENV = IS_STAGING ? 'staging' : 'production';

const meta = document.createElement('meta');
meta.name = 'theme-color';
meta.content = '#1a1a1a';
document.head.appendChild(meta);

const style = document.createElement('style');
style.textContent = '*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;overflow:hidden;background:#0a0a0a}@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}@keyframes spin{to{transform:rotate(360deg)}}.page-content{padding-top:60px}.mobile-nav{display:none!important}.desktop-nav{display:none!important}@media(max-width:699px){.desktop-layout{display:none!important}.page-content{padding-top:calc(48px + env(safe-area-inset-top, 0px))}.mobile-nav{display:block!important}}@media(min-width:700px){.mobile-auth{display:none!important}.desktop-nav{display:flex!important}}';
document.head.appendChild(style);

try {
  const savedTheme = localStorage.getItem('liveme-theme') === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = savedTheme;
  document.documentElement.style.colorScheme = savedTheme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', savedTheme === 'light' ? '#f4f6fb' : '#1a1a1a');
} catch {}
const themeStyle = document.createElement('style');
themeStyle.textContent = `
  html[data-theme="light"] { color-scheme: light; }
  html[data-theme="light"] body,
  html[data-theme="light"] .page-content { background: #f4f6fb !important; color: #20232a !important; }
  html[data-theme="light"] .page-content > div { background-color: transparent !important; }
  html[data-theme="light"] .page-content p,
  html[data-theme="light"] .page-content h1,
  html[data-theme="light"] .page-content h2,
  html[data-theme="light"] .page-content h3,
  html[data-theme="light"] .page-content h4,
  html[data-theme="light"] .page-content label,
  html[data-theme="light"] .page-content small,
  html[data-theme="light"] .page-content strong,
  html[data-theme="light"] .page-content li { color: #20232a !important; }
  html[data-theme="light"] .page-content input:not([type="checkbox"]),
  html[data-theme="light"] .page-content textarea,
  html[data-theme="light"] .page-content select { background: #fff !important; color: #20232a !important; border-color: #d7dce5 !important; }
  html[data-theme="light"] .page-content button:not([style*="linear-gradient"]):not([style*="#39348a"]) { border-color: rgba(25,35,55,.16); }
  html[data-theme="light"] .profile-page-root { background: #f4f6fb !important; color: #20232a !important; }
  html[data-theme="light"] .profile-page-root .profile-section { background: transparent !important; border-color: #dfe3eb !important; }
  html[data-theme="light"] .profile-page-root .profile-tabs { background: #f4f6fb !important; border-color: #dfe3eb !important; }
  html[data-theme="light"] .profile-page-root .profile-section p,
  html[data-theme="light"] .profile-page-root .profile-section h1,
  html[data-theme="light"] .profile-page-root .profile-section h2,
  html[data-theme="light"] .profile-page-root .profile-section h3,
  html[data-theme="light"] .profile-page-root .profile-section label,
  html[data-theme="light"] .profile-page-root .profile-section strong { color: #303744 !important; }
  html[data-theme="light"] .profile-page-root .profile-section input,
  html[data-theme="light"] .profile-page-root .profile-section textarea,
  html[data-theme="light"] .profile-page-root .profile-section select { background: #fff !important; color: #20232a !important; border-color: #d7dce5 !important; }
  html[data-theme="light"] .profile-page-root .profile-section button:not([style*="#39348a"]):not([style*="linear-gradient"]) { color: #424b5a !important; }
  html[data-theme="light"] .profile-image-editor-overlay { background: rgba(25,35,55,.48) !important; }
  html[data-theme="light"] .profile-image-editor-dialog { background: #fff !important; border-color: #dfe3eb !important; color: #20232a !important; box-shadow: 0 18px 60px rgba(25,35,55,.2) !important; }
  html[data-theme="light"] .profile-image-editor-dialog h2,
  html[data-theme="light"] .profile-image-editor-dialog strong { color: #20232a !important; }
  html[data-theme="light"] .profile-image-editor-dialog p { color: #626875 !important; }
  html[data-theme="light"] .profile-image-editor-dialog button[aria-label="Close"] { color: #626875 !important; }
  html[data-theme="light"] .profile-image-editor-dialog [style*="borderTop"] { border-color: #e2e5ec !important; }
  html[data-theme="light"] .profile-crop-overlay { background: rgba(25,35,55,.52) !important; }
  html[data-theme="light"] .profile-crop-dialog { background: #fff !important; color: #20232a !important; border: 1px solid #dfe3eb !important; box-shadow: 0 18px 60px rgba(25,35,55,.22) !important; }
  html[data-theme="light"] .profile-crop-dialog h2 { color: #20232a !important; }
  html[data-theme="light"] .profile-crop-dialog p,
  html[data-theme="light"] .profile-crop-dialog label { color: #424b5a !important; }
  html[data-theme="light"] .profile-crop-dialog label span { color: #687080 !important; }
  html[data-theme="light"] .profile-crop-dialog button[aria-label="Close crop editor"] { color: #626875 !important; }
  html[data-theme="light"] .profile-crop-dialog input[type="range"] { accent-color: #6258e8 !important; }
  html[data-theme="light"] .profile-crop-dialog button { border-color: #d7dce5 !important; }
  html[data-theme="light"] .profile-crop-dialog button:not([style*="#39348a"]) { color: #424b5a !important; }
  html[data-theme="light"] .admin-page-root { background: #f4f6fb !important; color: #20232a !important; }
  html[data-theme="light"] .admin-page-root [style*="#1f1f1f"],
  html[data-theme="light"] .admin-page-root [style*="#151515"],
  html[data-theme="light"] .admin-page-root [style*="#2a2a2a"] { background: #fff !important; }
  html[data-theme="light"] .admin-page-root h1,
  html[data-theme="light"] .admin-page-root h2,
  html[data-theme="light"] .admin-page-root h3,
  html[data-theme="light"] .admin-page-root p,
  html[data-theme="light"] .admin-page-root div:not([role="alert"]):not([role="status"]),
  html[data-theme="light"] .admin-page-root td,
  html[data-theme="light"] .admin-page-root th,
  html[data-theme="light"] .admin-page-root label { color: #303744 !important; }
  html[data-theme="light"] .admin-page-root [role="alert"] { color: #b42318 !important; }
  html[data-theme="light"] .admin-page-root [role="status"] { color: #167044 !important; }
  html[data-theme="light"] .admin-page-root input,
  html[data-theme="light"] .admin-page-root textarea,
  html[data-theme="light"] .admin-page-root select { background: #fff !important; color: #20232a !important; border-color: #d7dce5 !important; }
  html[data-theme="light"] .admin-page-root button:not([style*="#6c63ff"]):not([style*="#f44336"]):not([style*="#ff9800"]) { color: #424b5a !important; }
  html[data-theme="light"] .admin-page-root table,
  html[data-theme="light"] .admin-page-root tr,
  html[data-theme="light"] .admin-page-root td,
  html[data-theme="light"] .admin-page-root th { border-color: #e2e5ec !important; }
`;
document.head.appendChild(themeStyle);

function isValidSignupPassword(value: string): boolean {
  // Count Unicode code points and check each required character class explicitly.
  const chars = Array.from(value);
  return chars.length >= 10 &&
    /[a-z]/i.test(value) &&
    /[A-Z]/.test(value) &&
    /[0-9]/.test(value);
}

export default function WebApp() {
  const [page, setPage] = useState('home');
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signupVerification, setSignupVerification] = useState(false);
  const [signupCode, setSignupCode] = useState('');
  const [signupResendCooldown, setSignupResendCooldown] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [authMsg, setAuthMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotCooldown, setForgotCooldown] = useState(0);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryAccessToken, setRecoveryAccessToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [passwordUpdated, setPasswordUpdated] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState<'welcome' | 'dob' | 'name' | 'bio' | null>(null);
  const [onboardingTourActive, setOnboardingTourActive] = useState(false);
  const [onboardingTourStep, setOnboardingTourStep] = useState<OnboardingStep>('profile_photo');
  const [onboardingTourDone, setOnboardingTourDone] = useState<string[]>([]);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [liveUsers, setLiveUsers] = useState<{ id: string; user_id: string; name: string; avatar: string; bio: string }[]>([]);
  const [liveTs, setLiveTs] = useState(0);
  const [messagePartner, setMessagePartner] = useState('');
  const [viewProfileId, setViewProfileId] = useState<string | null>(null);
  const [onboardingName, setOnboardingName] = useState('');
  const [onboardingBio, setOnboardingBio] = useState('');
  const [onboardingDob, setOnboardingDob] = useState('');
  const [underage, setUnderage] = useState(false);
  const [state, setState] = useState('idle');
  const [id, setId] = useState('');
  const [log, setLog] = useState('');
  const [wsStatus, setWsStatus] = useState('connecting');
  const [partnerId, setPartnerId] = useState('');
  // WebSocket callbacks retain the render in which the socket was created;
  // keep the active partner in a ref so SDP/ICE validation uses current state.
  const partnerIdRef = useRef('');
  const [reportSent, setReportSent] = useState(false);
  const [reportPending, setReportPending] = useState(false);
  const [camError, setCamError] = useState('');
  const [noAudio, setNoAudio] = useState(false);
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const pcRef = useRef<any>(null);
  const lsRef = useRef<any>(null);
  const wsRef = useRef<WebSocket>(null);
  const dcRef = useRef<any>(null);
  const roomRef = useRef('');
  const [chatMessages, setChatMessages] = useState<{ me: boolean; text: string }[]>([]);
  const [showChat, setShowChat] = useState(false);
  const [partnerProfile, setPartnerProfile] = useState<{ userId: string; name: string; bio: string; avatar: string } | null>(null);
  const [myProfile, setMyProfile] = useState<{ userId: string; name: string; bio: string; avatar: string; cover: string; share_name: boolean; share_bio: boolean; date_of_birth?: string } | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [admin, setAdmin] = useState(false);
  const [partnerLeft, setPartnerLeft] = useState(false);
  const inCallRef = useRef(false);
  const frameIntervalRef = useRef<any>(null);
  const callSetupTimeoutRef = useRef<any>(null);
  const [banned, setBanned] = useState(false);
  const [bannedReason, setBannedReason] = useState('');

  function addLog(msg: string) { setLog(msg); }

  useEffect(() => {
    async function fetchLive() {
      const token = await getValidAccessToken();
      if (!token) { setLiveUsers([]); setLiveTs(Date.now()); return; }
      fetch(`${API_URL}/api/live?environment=${SIGNALING_ENV}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : []).then(d => { if (Array.isArray(d)) setLiveUsers(d); setLiveTs(Date.now()); }).catch(() => {});
    }
    fetchLive();
    const iv = setInterval(fetchLive, 5000);
    return () => clearInterval(iv);
  }, []);


  async function handleTourStepChange(step: OnboardingStep, completed: string[]) {
    const result = await saveOnboardingProgress(step, completed);
    if (result.error) throw new Error(result.error);
    setOnboardingTourStep(step);
    setOnboardingTourDone(completed);
  }

  async function handleAvatarSaved() {
    const completed = Array.from(new Set([...onboardingTourDone, 'profile_photo']));
    const result = await saveOnboardingProgress('discover', completed);
    if (result.error) { setAuthMsg('Your photo was saved, but onboarding progress could not be saved. Please try again.'); return; }
    setOnboardingTourDone(completed);
    setOnboardingTourStep('discover');
  }

  function handleNav(p: string) {
    if (p === 'profile') setViewProfileId(null);
    setPage(p);
  }

  useEffect(() => {
    let oauthLogin = false;
    try {
      oauthLogin = sessionStorage.getItem('liveme-oauth-login') === '1';
      sessionStorage.removeItem('liveme-oauth-login');
    } catch {}
    const recoveryQuery = new URLSearchParams(window.location.search);
    const recoveryHash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const recoveryCode = recoveryQuery.get('code');
    if (recoveryCode) {
      history.replaceState(null, '', window.location.pathname);
      setAuthLoading(true);
      void (async () => {
        const exchanged = await exchangeRecoveryCode(recoveryCode);
        if (exchanged.error || !exchanged.access_token) {
          setAuthMsg(exchanged.error || 'This password reset link is invalid or has expired. Request a new one.');
          setAuthLoading(false);
          return;
        }
        const result = await setSessionToken(exchanged.access_token, exchanged.refresh_token, true);
        if (result.error) setAuthMsg(result.error);
        else { setRecoveryAccessToken(exchanged.access_token); setRecoveryMode(true); }
        setAuthLoading(false);
      })();
      return;
    }
    const tokenHash = recoveryQuery.get('token_hash') || recoveryHash.get('token_hash');
    if (tokenHash && (recoveryQuery.get('type') === 'recovery' || recoveryHash.get('type') === 'recovery')) {
      history.replaceState(null, '', window.location.pathname);
      setAuthLoading(true);
      void (async () => {
        const verified = await verifyRecoveryToken(tokenHash);
        if (verified.error || !verified.access_token) {
          setAuthMsg(verified.error || 'This password reset link is invalid or has expired. Request a new one.');
          setAuthLoading(false);
          return;
        }
        const result = await setSessionToken(verified.access_token, verified.refresh_token, true);
        if (result.error) setAuthMsg(result.error);
        else { setRecoveryAccessToken(verified.access_token); setRecoveryMode(true); }
        setAuthLoading(false);
      })();
      return;
    }
    const hash = window.location.hash;
    if (hash.includes('access_token=')) {
      const params = new URLSearchParams(hash.slice(1));
      const token = params.get('access_token');
      const type = params.get('type');
      if (token) {
        if (window.opener) {
          window.opener.postMessage({ type: 'oauth_token', access_token: token, refresh_token: params.get('refresh_token'), oauthType: type }, window.location.origin);
          window.close();
          return;
        }
        history.replaceState(null, '', window.location.pathname + window.location.search);
        setAuthLoading(true);
        void setSessionToken(token, params.get('refresh_token'), type === 'recovery').then(result => {
          if (result.error) {
            setAuthMsg(result.error);
            setAuthLoading(false);
            return;
          }
          if (type === 'recovery') {
            setRecoveryAccessToken(token);
            setRecoveryMode(true);
            setAuthLoading(false);
          } else {
            try { sessionStorage.setItem('liveme-oauth-login', '1'); } catch {}
            window.location.reload();
          }
        });
        return;
      }
    }
    const u = getSession();
    if (u?.id) {
      void getValidAccessToken().then(validToken => {
        if (!validToken) {
          setUser(null);
          setAuthLoading(false);
          setAuthMsg('This browser could not verify its linked account. Please sign in with the account originally used here.');
          return;
        }
        setUser(u);
        setAuthLoading(false);
        isAdmin().then(setAdmin);
        getChatProfile().then(({ profile, error }) => {
          // Never treat a failed profile request as a new registration.
          if (error) { setAuthMsg('We could not verify your profile. Please refresh and try again.'); return; }
          if (profile) {
            setMyProfile({ userId: u.id, name: profile.display_name, bio: profile.bio, avatar: profile.avatar_url, cover: profile.cover_url, share_name: profile.share_name, share_bio: profile.share_bio, date_of_birth: profile.date_of_birth });
            if (oauthLogin) setPage('profile');
          } else {
            setOnboardingStep('welcome');
          }
        });
      });
    } else {
      setUser(null);
      setAuthLoading(false);
    }
    // Listen for OAuth tokens from popup windows
    async function handleOAuthMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin || e.data?.type !== 'oauth_token') return;
      const binding = await setSessionToken(e.data.access_token, e.data.refresh_token, e.data.oauthType === 'recovery');
      history.replaceState(null, '', window.location.pathname + window.location.search);
      if (binding.error) { setAuthMsg(binding.error); return; }
      const oauthType = e.data.oauthType;
      if (oauthType === 'recovery') { setRecoveryAccessToken(e.data.access_token); setRecoveryMode(true); }
      else {
        const u2 = getSession();
        setUser(u2);
        if (!u2?.id) { setPage('profile'); return; }
        isAdmin().then(setAdmin);
        getChatProfile().then(({ profile, error }) => {
          if (error) { setAuthMsg('We could not verify your profile. Please refresh and try again.'); return; }
          if (profile) {
            setMyProfile({ userId: u2.id, name: profile.display_name, bio: profile.bio, avatar: profile.avatar_url, cover: profile.cover_url, share_name: profile.share_name, share_bio: profile.share_bio, date_of_birth: profile.date_of_birth });
            setPage('profile');
          } else setOnboardingStep('welcome');
        });
      }
    }
    window.addEventListener('message', handleOAuthMessage);
    const unsub = onAuthChange(u2 => {
      setUser(u2);
      if (u2?.id) { isAdmin().then(setAdmin); getChatProfile().then(({ profile, error }) => { if (error) { setAuthMsg('We could not verify your profile. Please refresh and try again.'); return; } if (profile) setMyProfile({ userId: u2.id, name: profile.display_name, bio: profile.bio, avatar: profile.avatar_url, cover: profile.cover_url, share_name: profile.share_name, share_bio: profile.share_bio, date_of_birth: profile.date_of_birth }); else setOnboardingStep('welcome'); }); }
      else { setAdmin(false); setMyProfile(null); }
    });
    return () => { window.removeEventListener('message', handleOAuthMessage); unsub(); };
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    const stopPresence = startUserPresence(user.id);
    const stopOperatorMonitor = startOperatorSessionPresence(user.id);
    return () => { stopPresence(); stopOperatorMonitor(); };
  }, [user?.id]);

  useEffect(() => {
    if (!user) { setAdmin(false); setUnreadCount(0); setBanned(false); setBannedReason(''); return; }
    isAdmin().then(setAdmin);
    checkIsBanned(user.id).then(b => {
      setBanned(b);
      if (b) getBanReason(user.id).then(r => setBannedReason(r));
    });
    function pollUnread() {
      getConversations().then(({ conversations }) => {
        if (conversations) {
          setUnreadCount(conversations.reduce((sum, c) => sum + c.unread, 0));
        }
      });
    }
    pollUnread();
    const iv = setInterval(pollUnread, 5000);
    return () => clearInterval(iv);
  }, [user]);

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthMsg('');
    if (!captchaToken) { setAuthMsg('Please complete the security check first.'); return; }
    if (authMode === 'register') {
      if (!isValidSignupPassword(password)) {
        setAuthMsg('Use at least 10 characters with at least one uppercase letter, one lowercase letter, and one number.');
        return;
      }
      const normalizedEmail = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) { setAuthMsg('Enter a valid email address.'); return; }
      setSubmitting(true);
      const res = await signUp(normalizedEmail, password, captchaToken);
      setCaptchaToken('');
      setCaptchaResetKey(v => v + 1);
      setSubmitting(false);
      if (res.error) { setAuthMsg(res.error); return; }
      setEmail(normalizedEmail);
      setSignupCode('');
      setSignupVerification(true);
      setAuthMsg('We sent a 6-digit verification code to your email. Enter it below to finish creating your account.');
      setSignupResendCooldown(60);
      const timer = setInterval(() => setSignupResendCooldown(prev => { if (prev <= 1) { clearInterval(timer); return 0; } return prev - 1; }), 1000);
      return;
    }
    if (password.length < 8) { setAuthMsg('Password must be at least 8 characters'); return; }
    setSubmitting(true);
    const { error } = await signIn(email, password, captchaToken);
    setCaptchaToken('');
    setCaptchaResetKey(v => v + 1);
    setSubmitting(false);
    if (error) setAuthMsg(error);
    else setPage('profile');
  }

  async function handleSignupVerification(e: React.FormEvent) {
    e.preventDefault();
    setAuthMsg('');
    if (!/^\d{6}$/.test(signupCode.trim())) { setAuthMsg('Enter the 6-digit code from your email.'); return; }
    setSubmitting(true);
    const result = await verifySignupOtp(email, signupCode);
    setSubmitting(false);
    if (result.error) { setAuthMsg(result.error); return; }
    setSignupVerification(false);
    setSignupCode('');
    setAuthMsg('');
    setPage('profile');
  }

  async function handleResendSignupCode() {
    if (signupResendCooldown > 0 || submitting) return;
    setSubmitting(true);
    const result = await resendSignupOtp(email);
    setSubmitting(false);
    if (result.error) { setAuthMsg(result.error); return; }
    setAuthMsg('A new verification code has been sent if this address has a pending signup.');
    setSignupResendCooldown(60);
    const timer = setInterval(() => setSignupResendCooldown(prev => { if (prev <= 1) { clearInterval(timer); return 0; } return prev - 1; }), 1000);
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setAuthMsg('');
    if (!captchaToken) { setAuthMsg('Please complete the security check first.'); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(forgotEmail)) { setAuthMsg('Please enter a valid email address (e.g. name@domain.com)'); return; }
    setSubmitting(true);
    const { error } = await resetPassword(forgotEmail, window.location.origin, captchaToken);
    setCaptchaToken('');
    setCaptchaResetKey(v => v + 1);
    setSubmitting(false);
    if (error) {
      setAuthMsg(error);
      setForgotCooldown(60);
      const iv = setInterval(() => setForgotCooldown(prev => { if (prev <= 1) { clearInterval(iv); return 0; } return prev - 1; }), 1000);
    } else {
      setForgotSent(true);
      setForgotCooldown(60);
      const iv = setInterval(() => setForgotCooldown(prev => { if (prev <= 1) { clearInterval(iv); return 0; } return prev - 1; }), 1000);
    }
  }

  async function handlePasswordReset(e: React.FormEvent) {
    e.preventDefault();
    setAuthMsg('');
    if (newPassword.length < 8) { setAuthMsg('Password must be at least 8 characters'); return; }
    setSubmitting(true);
    const { error } = await updatePassword(newPassword, recoveryAccessToken);
    setSubmitting(false);
    if (error) setAuthMsg(error);
    else setPasswordUpdated(true);
  }

  function calcAge(dob: string): number {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return -1;
    const bd = new Date(`${dob}T00:00:00Z`);
    if (Number.isNaN(bd.getTime()) || bd.toISOString().slice(0, 10) !== dob) return -1;
    const now = new Date();
    let age = now.getUTCFullYear() - bd.getUTCFullYear();
    const month = now.getUTCMonth() - bd.getUTCMonth();
    if (month < 0 || (month === 0 && now.getUTCDate() < bd.getUTCDate())) age--;
    return age;
  }

  async function handleOnboardingSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAuthMsg('');
    if (onboardingStep === 'welcome') {
      if (!agreedToTerms) { setAuthMsg('You must agree to the terms to continue.'); return; }
      setOnboardingStep('dob');
    } else if (onboardingStep === 'dob') {
      if (!onboardingDob) { setAuthMsg('Please enter your date of birth'); return; }
      const age = calcAge(onboardingDob);
      if (age < 0) { setAuthMsg('Please enter a valid date of birth that is not in the future.'); return; }
      if (age < 18) {
        // Keep the registration incomplete until name and bio are submitted.
        // The final profile write stores the DOB and accepted terms together.
        setUnderage(true);
        setOnboardingStep('name');
        return;
      }
      if (myProfile) {
        setSubmitting(true);
        const { error } = await upsertChatProfile({
          display_name: myProfile.name,
          bio: myProfile.bio,
          avatar_url: myProfile.avatar,
          cover_url: myProfile.cover,
          share_name: myProfile.share_name,
          share_bio: myProfile.share_bio,
          date_of_birth: onboardingDob,
        });
        setSubmitting(false);
        if (error) setAuthMsg(error);
        else { setUnderage(false); setCamError(''); setOnboardingStep(null); setPage('profile'); }
      } else {
        setOnboardingStep('name');
      }
    } else if (onboardingStep === 'name') {
      if (!onboardingName || onboardingName.length < 1) { setAuthMsg('Display name is required'); return; }
      // Keep the profile absent until the full onboarding flow is completed.
      // Otherwise a partially completed registration could look like an old account on reload.
      setOnboardingStep('bio');
    } else {
      setSubmitting(true);
      const { error } = await upsertChatProfile({ display_name: onboardingName, bio: onboardingBio, avatar_url: '', cover_url: '', share_name: true, share_bio: true, date_of_birth: onboardingDob, terms_accepted_at: new Date().toISOString(), terms_version: '2026-11-11' } as any);
      setSubmitting(false);
      if (error) setAuthMsg(error);
      else { setUnderage(calcAge(onboardingDob) < 18); setCamError(''); setOnboardingStep(null); setPage('profile'); setOnboardingTourDone([]); setOnboardingTourStep('profile_photo'); setOnboardingTourActive(true); void saveOnboardingProgress('profile_photo', []); }
    }
  }

  async function handleLogout() {
    signOut();
    wsRef.current?.close();
    cleanup();
    setPage('home');
  }

  async function connect(accessToken: string): Promise<WebSocket | null> {
    setWsStatus('connecting');
    if (!accessToken) { setWsStatus('error'); addLog('Your session expired. Please sign in again.'); return null; }
    const socketUrl = new URL(WS_URL);
    socketUrl.searchParams.set('access_token', accessToken);
    socketUrl.searchParams.set('environment', SIGNALING_ENV);
    const ws = new WebSocket(socketUrl.toString());
    wsRef.current = ws;
    ws.onopen = () => { setWsStatus('connected'); addLog('Connected'); };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      addLog('Signal: ' + msg.type);
      switch (msg.type) {
        case 'connected': setId(msg.id); break;
        case 'matched': {
          // Ignore malformed, stale, duplicate, or cross-socket match events.
          // A live room must never be replaced by an unsolicited second match.
          if (wsRef.current !== ws || !msg.room || !msg.partner) {
            addLog('Ignored invalid or stale match event');
            break;
          }
          if (roomRef.current === msg.room && pcRef.current) {
            addLog('Ignored duplicate match event');
            break;
          }
          if (inCallRef.current && roomRef.current && roomRef.current !== msg.room) {
            addLog('Ignored unexpected match while another room is active');
            break;
          }
          if (callSetupTimeoutRef.current) { clearTimeout(callSetupTimeoutRef.current); callSetupTimeoutRef.current = null; }
          if (pcRef.current) { pcRef.current.ontrack = null; pcRef.current.onicecandidate = null; pcRef.current.close(); pcRef.current = null; }
          dcRef.current?.close?.(); dcRef.current = null;
          inCallRef.current = true; roomRef.current = msg.room || '';
          remoteStreamRef.current = null; pendingIceRef.current = [];
          partnerIdRef.current = msg.partner; setPartnerId(msg.partner); setPartnerLeft(false);
          if (msg.userId) setPartnerProfile({ userId: msg.userId, name: '', bio: '', avatar: '' });
          setChatMessages([]); setShowChat(false); setReportSent(false); setReportPending(false);
          addLog('Connecting video and chat…');
          startCall(ws, msg.role); break;
        }
        case 'partner_left':
          if (!msg.room || msg.room !== roomRef.current) break;
          addLog('Partner ended the call'); void cleanup(true); setPartnerLeft(true); break;
        case 'reported': addLog('You have been reported'); break;
        case 'report_ack': setReportSent(true); setReportPending(false); addLog('Report submitted'); break;
        case 'report_error': setReportSent(false); setReportPending(false); addLog(msg.reason || 'Report could not be submitted.'); break;
        case 'auth_error': addLog(msg.reason || 'Account verification failed. Please sign in again.'); cleanup(); break;
        case 'banned': addLog('BANNED: ' + msg.reason); setBanned(true); setBannedReason(msg.reason); cleanup(); break;
        case 'age_restricted': setUnderage(true); setCamError('Video chat is restricted to users 18+.'); setState('idle'); break;
        case 'sdp': handleSDP(ws, msg); break;
        case 'ice': handleICE(msg); break;
      }
    };
    ws.onerror = () => { setWsStatus('error'); addLog('WS error'); };
    ws.onclose = (e) => {
      if (wsRef.current !== ws) return;
      setWsStatus('disconnected'); addLog(`Disconnected (code ${e.code}${e.reason ? ': ' + e.reason : ''})`);
      if (inCallRef.current) { void cleanup(true); setPartnerLeft(true); }
    };
    return ws;
  }

  function updateCallReadiness(pc: RTCPeerConnection, dc: RTCDataChannel, callRoom: string) {
    if (pcRef.current !== pc || roomRef.current !== callRoom || dcRef.current !== dc) return;
    const videoReady = pc.connectionState === 'connected' ||
      pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed';
    const chatReady = dc.readyState === 'open';
    if (videoReady && chatReady) addLog('Chat ready');
    else if (videoReady) addLog('Video connected; preparing chat…');
    else if (chatReady) addLog('Chat channel connected; waiting for video…');
    else addLog('Connecting video and chat…');
  }

  async function startCall(ws: WebSocket, role?: string) {
    addLog('Connecting video and chat…');
    setState('connecting');
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayprojectsecret' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayprojectsecret' },
        { urls: 'turn:openrelay.metered.ca:80?transport=tcp', username: 'openrelayproject', credential: 'openrelayprojectsecret' },
      ],
    });
    pcRef.current = pc;
    const callRoom = roomRef.current;
    // A data channel can open before media ICE is connected. Never leave the
    // user on an infinite loading overlay if the media transport stalls.
    callSetupTimeoutRef.current = setTimeout(() => {
      if (pcRef.current !== pc || roomRef.current !== callRoom || pc.connectionState === 'connected') return;
      addLog('Video connection timed out. Please try Next and reconnect.');
      notifyMatchEnded(callRoom);
      void cleanup(true);
      setPartnerLeft(true);
    }, 25000);
    pc.onicecandidate = (e) => {
      if (e.candidate && pcRef.current === pc && roomRef.current === callRoom && ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: 'ice', candidate: e.candidate, room: callRoom }));
    };
    pc.ontrack = (e) => {
      if (pcRef.current !== pc || roomRef.current !== callRoom || !remoteRef.current) return;
      // Some browsers deliver streamless tracks (event.streams is empty). Build
      // one stable remote stream instead of silently dropping those video tracks.
      const remoteStream = e.streams?.[0] || remoteStreamRef.current || new MediaStream();
      if (!e.streams?.[0] && !remoteStream.getTracks().some(track => track.id === e.track.id)) {
        remoteStream.addTrack(e.track);
      }
      remoteStreamRef.current = remoteStream;
      if (remoteRef.current.srcObject !== remoteStream) remoteRef.current.srcObject = remoteStream;
      const playRemote = () => {
        const video = remoteRef.current;
        if (video && pcRef.current === pc && roomRef.current === callRoom && video.srcObject === remoteStream)
          void video.play().catch(error => addLog('Remote video playback needs a tap: ' + (error?.name || 'autoplay blocked')));
      };
      e.track.onunmute = playRemote;
      e.track.onended = () => { if (pcRef.current === pc && roomRef.current === callRoom) addLog('Partner video track ended'); };
      playRemote();
    };
    pc.oniceconnectionstatechange = () => {
      if (pcRef.current !== pc || roomRef.current !== callRoom) return;
      addLog('ICE: ' + pc.iceConnectionState);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        if (callSetupTimeoutRef.current) { clearTimeout(callSetupTimeoutRef.current); callSetupTimeoutRef.current = null; }
        setState('connected');
        if (dcRef.current) updateCallReadiness(pc, dcRef.current, callRoom);
      }
      if (pc.iceConnectionState === 'failed' || pc.connectionState === 'failed') { notifyMatchEnded(callRoom); void cleanup(true); setPartnerLeft(true); }
      else if (pc.iceConnectionState === 'disconnected') addLog('Connection interrupted. Trying to recover…');
    };
    pc.onconnectionstatechange = () => {
      if (pcRef.current !== pc || roomRef.current !== callRoom) return;
      addLog('Peer connection: ' + pc.connectionState);
      if (pc.connectionState === 'connected') {
        if (callSetupTimeoutRef.current) { clearTimeout(callSetupTimeoutRef.current); callSetupTimeoutRef.current = null; }
        addLog('Video connection established'); setState('connected');
        if (dcRef.current) updateCallReadiness(pc, dcRef.current, callRoom);
      }
      if (pc.connectionState === 'failed') { notifyMatchEnded(callRoom); void cleanup(true); setPartnerLeft(true); }
    };

    function onDcMessage(e: any) {
      try {
        const data = JSON.parse(e.data);
        if (pcRef.current !== pc) return;
        if (data.type === 'msg') {
          const msg = { me: false, text: data.text };
          setChatMessages(prev => [...prev, msg]);
          setTimeout(() => setChatMessages(prev => prev.filter(m => m !== msg)), 5000);
        } else if (data.type === 'profile') {
          setPartnerProfile(prev => ({ userId: data.userId || prev?.userId || '', name: data.name, bio: data.bio, avatar: data.avatar || '' }));
        }
      } catch {}
    }

    if (role === 'offer') {
      const dc = pc.createDataChannel('chat');
      dcRef.current = dc;
      dc.onopen = () => { if (pcRef.current !== pc || roomRef.current !== callRoom) return; updateCallReadiness(pc, dc, callRoom); if (myProfile) dc.send(JSON.stringify({ type: 'profile', userId: myProfile.userId, name: myProfile.name, bio: myProfile.bio, avatar: myProfile.avatar })); };
      dc.onmessage = onDcMessage;
    } else {
      pc.ondatachannel = (e) => {
        if (pcRef.current !== pc || roomRef.current !== callRoom) { e.channel.close(); return; }
        const dc = e.channel;
        dcRef.current = dc;
        dc.onopen = () => { if (pcRef.current !== pc || roomRef.current !== callRoom) return; updateCallReadiness(pc, dc, callRoom); if (myProfile) dc.send(JSON.stringify({ type: 'profile', userId: myProfile.userId, name: myProfile.name, bio: myProfile.bio, avatar: myProfile.avatar })); };
        dc.onmessage = onDcMessage;
      };
    }

    const stream = lsRef.current;
    if (stream) {
      stream.getTracks().forEach((t: any) => {
        pc.addTrack(t, stream);
        if (t.kind === 'audio') t.onended = () => { setNoAudio(true); addLog('Mic disconnected'); };
      });
    }
    if (role === 'offer') {
      try {
        addLog('Creating offer...');
        const offer = await pc.createOffer();
        if (pcRef.current !== pc || roomRef.current !== callRoom) return;
        await pc.setLocalDescription(offer);
        if (pcRef.current !== pc || roomRef.current !== callRoom) return;
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({ type: 'sdp', sdp: pc.localDescription, room: callRoom }));
        addLog('Sent offer');
      } catch (error: any) {
        if (pcRef.current === pc) { notifyMatchEnded(callRoom); addLog('Could not start call: ' + (error?.message || 'connection setup failed')); void cleanup(true); setPartnerLeft(true); }
      }
    } else {
      addLog('Waiting for offer...');
    }
  }

  async function handleSDP(ws: WebSocket, msg: any) {
    const pc = pcRef.current;
    if (!pc || !msg.room || msg.room !== roomRef.current || msg.from !== partnerIdRef.current) return;
    const activeRoom = roomRef.current;
    addLog('Received ' + msg.sdp.type);
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
    } catch (error: any) {
      if (pcRef.current === pc && roomRef.current === activeRoom) { notifyMatchEnded(activeRoom); addLog('Could not process call setup: ' + (error?.message || 'invalid signaling')); void cleanup(true); setPartnerLeft(true); }
      return;
    }
    if (pcRef.current !== pc || roomRef.current !== activeRoom) return;
    // ICE can arrive before the remote SDP on slower/mobile networks. Apply
    // queued candidates only after setRemoteDescription has completed.
    const queuedCandidates = pendingIceRef.current.splice(0);
    for (const candidate of queuedCandidates) {
      if (pcRef.current !== pc || roomRef.current !== activeRoom) return;
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); }
      catch (error: any) { addLog('Queued ICE candidate rejected: ' + (error?.message || 'unknown error')); }
    }
    if (msg.sdp.type === 'offer') {
      addLog('Creating answer...');
      const answer = await pc.createAnswer();
      if (pcRef.current !== pc || roomRef.current !== activeRoom) return;
      await pc.setLocalDescription(answer);
      if (pcRef.current !== pc || roomRef.current !== activeRoom) return;
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: 'sdp', sdp: pc.localDescription, room: activeRoom }));
      addLog('Sent answer');
    }
  }

  function notifyMatchEnded(room: string) {
    const ws = wsRef.current;
    if (room && ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'end', room }));
  }

  async function handleICE(msg: any) {
    const pc = pcRef.current;
    if (!pc || !msg.room || msg.room !== roomRef.current || msg.from !== partnerIdRef.current || !msg.candidate) return;
    if (!pc.remoteDescription?.type) {
      pendingIceRef.current.push(msg.candidate);
      return;
    }
    try { await pc.addIceCandidate(new RTCIceCandidate(msg.candidate)); }
    catch (error: any) { addLog('ICE candidate rejected: ' + (error?.message || 'unknown error')); }
  }

  async function findStranger() {
    // Refresh before any profile or signaling request so a revoked-but-unexpired JWT is not reused.
    const freshAccessToken = await refreshAccessToken();
    if (!freshAccessToken) {
      addLog('Authentication error: Supabase could not refresh your session. Please sign in again.');
      setCamError('Your sign-in session could not be refreshed. Please sign in again.');
      setWsStatus('error');
      setState('idle');
      return;
    }
    const { profile, error } = await getChatProfile();
    if (error || !profile) {
      setCamError('We could not verify your profile. Please refresh and try again.');
      return;
    }
    if (!profile.date_of_birth) {
      // Existing accounts are not forced through first-time onboarding.
      // Keep video chat gated until a valid age record is available.
      setCamError('Video chat requires a valid age record. Please contact support to update your account.');
      return;
    }
    const currentAge = calcAge(profile.date_of_birth);
    if (currentAge < 0) {
      setUnderage(false);
      setCamError('Your date of birth is invalid or in the future. Please contact support to correct it.');
      return;
    }
    if (currentAge < 18) {
      setUnderage(true);
      setCamError('Video chat is not available for users under 18. You can use the messaging system instead.');
      return;
    }
    // Re-evaluate from the freshly fetched profile. This clears a stale local
    // restriction after a valid DOB correction; the signaling server still
    // independently enforces the same 18+ rule.
    setUnderage(false);
    setCamError('');
    try {
      if (user?.id && localStorage.getItem('liveme-media-auto-request:' + user.id) === 'false') {
        setCamError('Automatic camera and microphone requests are turned off. Open Settings and enable “Automatically request both when starting Random Chat”.');
        setState('idle');
        return;
      }
    } catch {}
    if (user?.id) setMyProfile({ userId: user.id, name: profile.display_name, bio: profile.bio, avatar: profile.avatar_url, cover: profile.cover_url, share_name: profile.share_name, share_bio: profile.share_bio, date_of_birth: profile.date_of_birth });
    if (lsRef.current) {
      lsRef.current.getTracks().forEach((t: any) => t.stop());
      lsRef.current = null;
    }
    try {
      addLog('Requesting camera...');
      // Request camera and microphone together. Never enter the match queue with only one device.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      setNoAudio(false);
      addLog('Camera OK');
      lsRef.current = stream;
      if (localRef.current) {
        localRef.current.srcObject = stream;
        void localRef.current.play().catch(error => addLog('Local camera preview playback blocked: ' + (error?.name || 'autoplay blocked')));
      }
      setState('searching');
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        addLog('WS not open, reconnecting...');
        await new Promise<void>((resolve) => {
          connect(freshAccessToken).then((ws) => {
            if (!ws) { resolve(); return; }
            if (ws.readyState === WebSocket.OPEN) { resolve(); return; }
            ws.addEventListener('open', () => resolve(), { once: true });
            ws.addEventListener('error', () => resolve(), { once: true });
            setTimeout(resolve, 5000);
          }).catch(() => resolve());
        });
      }
      if (wsRef.current?.readyState !== WebSocket.OPEN) {
        addLog('Unable to connect to the chat server. Please try again.');
        setWsStatus('error');
        setState('idle');
        lsRef.current?.getTracks().forEach((t: any) => t.stop());
        lsRef.current = null;
        return;
      }
      // Use the same freshly refreshed JWT for socket authentication and queue entry.
      wsRef.current.send(JSON.stringify({ type: 'find', accessToken: freshAccessToken }));
      addLog('Searching for partner...');
    } catch (e: any) {
      const denied = e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError';
      const notFound = e.name === 'NotFoundError';
      const inUse = e.message?.includes('already in use') || e.name === 'NotReadableError';
      const camFail = e.message?.includes('Could not start');
      if (denied) setCamError('Camera or microphone permission denied. Allow BOTH devices for LiveMe in your browser settings, then try again.');
      else if (notFound) setCamError('A camera or microphone could not be found on this device.');
      else if (inUse) setCamError('Camera or microphone is in use by another app or tab. Close Zoom, OBS, or other camera apps and try again.\n\nIf no other apps are open:\n• Open Task Manager and end ALL Chrome processes\n• Check Windows: Settings → Privacy & Security → Camera → turn ON "Let desktop apps access your camera"\n• Or try a different browser (Firefox, Edge)');
      else if (camFail) setCamError('Camera or microphone failed to start. Try restarting your browser or reconnecting your devices.');
      else setCamError('Could not access both camera and microphone: ' + (e.message || e.name));
      addLog('Error: ' + (e.message || e.name));
    }
  }

  function reportUser() {
    if (!partnerId || reportSent || reportPending) return;
    var partnerName = partnerProfile?.name || 'this user';
    if (!confirm('Report ' + partnerName + ' for abuse?')) return;
    const lastMsg = chatMessages.length > 0 ? chatMessages[chatMessages.length - 1].text : '';
    if (wsRef.current?.readyState !== WebSocket.OPEN) { addLog('Cannot submit report: connection is not active.'); return; }
    wsRef.current.send(JSON.stringify({ type: 'report', target: partnerId, room: roomRef.current, messageText: lastMsg }));
    setReportPending(true);
    addLog('Submitting report...');
  }

  async function cleanup(suppressReport = false, preserveLocalStream = false) {
    const pUserId = partnerProfile?.userId;
    let pName = partnerProfile?.name || '';
    let pBio = partnerProfile?.bio || '';
    let pAvatar = partnerProfile?.avatar || '';
    const uid = pUserId;
    const savedName = pName;

    inCallRef.current = false;
    if (callSetupTimeoutRef.current) { clearTimeout(callSetupTimeoutRef.current); callSetupTimeoutRef.current = null; }
    const oldRoom = roomRef.current;
    roomRef.current = '';
    setPartnerLeft(false);
    if (!suppressReport && !reportSent && !reportPending && pUserId) {
      const partnerDisplayName = savedName || 'this user';
      if (confirm('Report ' + partnerDisplayName + ' for abuse?')) {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'report', target: partnerId, room: oldRoom, messageText: '' }));
          setReportPending(true);
        }
      }
    }
    // Critical teardown first (sync)
    // Next keeps the current camera/microphone capture alive. Stopping it here
    // races the next match: startCall can run before getUserMedia reacquires it,
    // leaving both local preview and outgoing video permanently black.
    if (!preserveLocalStream) {
      lsRef.current?.getTracks().forEach((t: any) => t.stop());
      lsRef.current = null;
    }
    if (pcRef.current) { pcRef.current.ontrack = null; pcRef.current.onicecandidate = null; pcRef.current.oniceconnectionstatechange = null; pcRef.current.onconnectionstatechange = null; pcRef.current.close(); }
    pcRef.current = null;
    dcRef.current?.close?.(); dcRef.current = null;
    if (remoteRef.current) { remoteRef.current.pause(); remoteRef.current.srcObject = null; }
    remoteStreamRef.current = null; pendingIceRef.current = [];
    // Keep the live local preview attached when advancing to the next partner.
    if (!preserveLocalStream && localRef.current) localRef.current.srcObject = null;
    setState('idle'); setNoAudio(false); setPartnerProfile(null); setChatMessages([]); setShowChat(false); partnerIdRef.current = ''; setPartnerId('');

    // Save to recent_live with profile fallback if name is missing
    if (uid && !savedName) {
      try {
        const { profile } = await getUserProfile(uid);
        if (profile) { pName = profile.display_name || ''; pBio = profile.bio || ''; pAvatar = profile.avatar_url || ''; }
      } catch {}
    }
    if (uid && uid !== user?.id) {
      try {
        const recent = JSON.parse(localStorage.getItem('recent_live') || '[]');
        recent.unshift({ id: uid, name: pName, bio: pBio, avatar: pAvatar, time: Date.now() });
        localStorage.setItem('recent_live', JSON.stringify(recent.slice(0, 20)));
      } catch (e) {} // ignore localStorage errors
      try { await saveRecentLive(uid, pName, pBio, pAvatar); } catch {}
    }
  }

  function skip() {
    const ws = wsRef.current;
    if (ws?.readyState !== WebSocket.OPEN) { void cleanup(true); setCamError('Connection lost. Please reconnect before finding another partner.'); return; }
    // Tear down only the old peer connection; retain the camera/mic stream
    // so the next room can attach live tracks immediately on either side.
    void cleanup(true, true);
    setPartnerId(''); setPartnerLeft(false); setState('searching'); setLog('Finding next partner…');
    ws.send(JSON.stringify({ type: 'next' }));
  }

  function sendChat() {
    const text = chatInput.trim();
    if (!text || !dcRef.current) return;
    dcRef.current.send(JSON.stringify({ type: 'msg', text }));
    const msg = { me: true, text };
    setChatMessages(prev => [...prev, msg]);
    setTimeout(() => setChatMessages(prev => prev.filter(m => m !== msg)), 5000);
    setChatInput('');
  }

  const wsColor = wsStatus === 'connected' ? '#4caf50' : wsStatus === 'connecting' ? '#ff9800' : '#f44336';
  const callActive = state === 'searching' || state === 'connecting' || state === 'connected';

  const sBtn: React.CSSProperties = {
    background: 'linear-gradient(135deg, #6c63ff, #2a6eff)',
    color: '#fff', border: 'none',
    padding: '14px 40px', borderRadius: 50, fontSize: 16, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'system-ui, sans-serif', width: '100%', maxWidth: 320,
    boxShadow: '0 4px 20px rgba(108,99,255,0.3)',
    transition: 'transform 0.2s, box-shadow 0.2s',
  };
  const input: React.CSSProperties = {
    background: 'rgba(255,255,255,0.06)',
    color: '#fff', border: '1px solid rgba(255,255,255,0.12)',
    padding: '14px 18px', borderRadius: 12, fontSize: 17, width: '100%',
    outline: 'none', fontFamily: 'system-ui, sans-serif', boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  };
  const mobileBtn: React.CSSProperties = {
    background: 'linear-gradient(135deg, #6c63ff, #2a6eff)',
    color: '#fff', border: 'none',
    padding: '12px', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'system-ui, sans-serif', width: '100%',
    boxShadow: '0 4px 20px rgba(108,99,255,0.3)',
  };

  if (signupVerification) {
    return (
      <div style={{ width: '100vw', minHeight: '100vh', background: '#0a0a0a', color: '#fff', fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <h1 style={{ fontSize: 40, fontWeight: 800, margin: 0, marginBottom: 8, background: 'linear-gradient(135deg, #6c63ff, #2a6eff, #00d4ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>LiveMe</h1>
        <h2 style={{ fontSize: 20, margin: '8px 0' }}>Verify your email</h2>
        <p style={{ color: '#aaa', fontSize: 14, textAlign: 'center', maxWidth: 340, lineHeight: 1.6, marginBottom: 18 }}>Enter the 6-digit code sent to <b style={{ color: '#fff' }}>{email}</b>. Check your spam or junk folder too.</p>
        <form onSubmit={handleSignupVerification} style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 360 }}>
          <input style={{ ...input, textAlign: 'center', letterSpacing: 8, fontSize: 22 }} type="text" inputMode="numeric" autoComplete="one-time-code" placeholder="000000" value={signupCode} onChange={e => setSignupCode(e.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} required />
          <button type="submit" disabled={submitting || signupCode.length !== 6} style={{ ...mobileBtn, opacity: submitting || signupCode.length !== 6 ? 0.5 : 1 }}>{submitting ? 'Verifying…' : 'Verify email and continue'}</button>
        </form>
        {authMsg && <p style={{ color: '#ff9800', fontSize: 13, textAlign: 'center', maxWidth: 340, marginTop: 14 }}>{authMsg}</p>}
        <button type="button" onClick={handleResendSignupCode} disabled={submitting || signupResendCooldown > 0} style={{ background: 'transparent', border: 0, color: '#9a91ff', padding: 14, cursor: 'pointer', marginTop: 8, opacity: submitting || signupResendCooldown > 0 ? 0.5 : 1 }}>{signupResendCooldown > 0 ? `Resend code in ${signupResendCooldown}s` : 'Resend verification code'}</button>
        <button type="button" onClick={() => { setSignupVerification(false); setSignupCode(''); setAuthMsg(''); }} style={{ background: 'transparent', border: 0, color: '#888', padding: 8, cursor: 'pointer' }}>Back to sign up</button>
      </div>
    );
  }

  if (recoveryMode) {
    return (
      <div style={{ width: '100vw', minHeight: '100vh', background: '#0a0a0a', fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <h1 style={{ fontSize: 40, fontWeight: 800, margin: 0, marginBottom: 4, background: 'linear-gradient(135deg, #6c63ff, #2a6eff, #00d4ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>LiveMe</h1>
        {passwordUpdated ? (
          <>
            <p style={{ color: '#4caf50', fontSize: 16, marginBottom: 16, textAlign: 'center' }}>Password updated successfully!</p>
            <p style={{ color: '#aaa', fontSize: 14, textAlign: 'center', maxWidth: 320, lineHeight: 1.5, marginBottom: 16 }}>
              Your password has been changed. You can now sign in with your new password.
            </p>
            <button onClick={() => { setRecoveryMode(false); setPasswordUpdated(false); setNewPassword(''); signOut(); }} style={mobileBtn}>
              Go to Sign In
            </button>
          </>
        ) : (
          <>
            <p style={{ color: '#888', fontSize: 14, marginBottom: 24 }}>Set a new password</p>
            <form onSubmit={handlePasswordReset} style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 360 }}>
              <input style={input} type="password" placeholder="New password (min 8 chars)" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={8} />
              <button type="submit" disabled={submitting} style={{...mobileBtn, opacity: submitting ? 0.5 : 1}}>{submitting ? 'Updating...' : 'Update Password'}</button>
            </form>
            {authMsg && <p style={{ color: authMsg.includes('error') || authMsg.includes('Error') ? '#f44336' : '#ff9800', fontSize: 13, marginTop: 12, textAlign: 'center', maxWidth: 320, wordBreak: 'break-word' }}>{authMsg}</p>}
          </>
        )}
      </div>
    );
  }

  if (onboardingStep && onboardingStep !== 'welcome') {
    return (
      <div style={{ width: '100vw', minHeight: '100vh', background: '#0a0a0a', fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <h1 style={{ fontSize: 40, fontWeight: 800, margin: 0, marginBottom: 4, background: 'linear-gradient(135deg, #6c63ff, #2a6eff, #00d4ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>LiveMe</h1>
        <p style={{ color: '#888', fontSize: 14, marginBottom: 24 }}>
          {onboardingStep === 'dob' ? 'Confirm your age' : onboardingStep === 'name' ? 'Choose your display name' : 'Add a bio (optional)'}
        </p>
        <form onSubmit={handleOnboardingSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 360 }}>
          {onboardingStep === 'dob' ? (
            <input style={input} type="date" value={onboardingDob} onChange={e => setOnboardingDob(e.target.value)} required />
          ) : onboardingStep === 'name' ? (
            <input style={input} type="text" placeholder="Display name (a-Z, 0-9, max 9 chars)" value={onboardingName} onChange={e => setOnboardingName(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 9))} maxLength={9} required />
          ) : (
            <>
              <p style={{ color: '#aaa', fontSize: 14, textAlign: 'center', wordBreak: 'break-word', margin: 0 }}>Display name: <b style={{ color: '#fff' }}>{onboardingName}</b></p>
              <textarea style={{ ...input, resize: 'vertical', minHeight: 80, fontFamily: 'inherit' }} placeholder="Tell people about yourself (optional)" value={onboardingBio} onChange={e => setOnboardingBio(e.target.value)} maxLength={200} />
            </>
          )}
          <button type="submit" disabled={submitting} style={{...mobileBtn, opacity: submitting ? 0.5 : 1}}>
            {submitting ? 'Saving...' : onboardingStep === 'dob' ? 'Next' : onboardingStep === 'name' ? 'Next' : 'Go to Profile'}
          </button>
        </form>
        {authMsg && <p style={{ color: authMsg.includes('error') || authMsg.includes('Error') ? '#f44336' : '#ff9800', fontSize: 13, marginTop: 12, textAlign: 'center', maxWidth: 320, wordBreak: 'break-word' }}>{authMsg}</p>}
        {onboardingStep === 'bio' && (
          <p style={{ color: '#6c63ff', fontSize: 12, marginTop: 12, cursor: 'pointer' }} onClick={handleOnboardingSubmit}>Skip</p>
        )}
      </div>
    );
  }

  if (authLoading) {
    return (
      <div style={{ width: '100vw', height: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <p style={{ color: '#888' }}>Loading...</p>
      </div>
    );
  }

  if (banned) {
    return (
      <div style={{ width: '100vw', height: '100vh', background: '#0a0a0a', fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#f44336', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20, fontSize: 28 }}>🚫</div>
        <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Account Banned</h1>
        <p style={{ color: '#f44336', fontSize: 14, marginBottom: 16, maxWidth: 360, lineHeight: 1.5 }}>
          {bannedReason ? `Reason: ${bannedReason}` : 'Your account has been suspended.'}
        </p>
        <p style={{ color: '#888', fontSize: 13, maxWidth: 360, lineHeight: 1.5 }}>
          If you believe this was a mistake, please contact support.
        </p>
      </div>
    );
  }

  // Single return with always-mounted video elements
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0a0a0a', fontFamily: 'system-ui, sans-serif', position: 'relative', overflow: 'hidden' }}>
      {/* Always-mounted video elements - hidden on non-chat pages so stream stays alive */}
      <div style={page === 'chat' ? { position: 'fixed', inset: 0, zIndex: 0 } : { position: 'fixed', width: 1, height: 1, opacity: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <video ref={remoteRef} autoPlay playsInline onLoadedMetadata={() => { const video = remoteRef.current; if (video) void video.play().catch(error => addLog('Remote playback waiting for user interaction: ' + (error?.name || 'autoplay blocked'))); }} onClick={() => { const video = remoteRef.current; if (video) void video.play().catch(error => addLog('Remote playback failed: ' + (error?.message || error?.name || 'unknown error'))); }} style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', objectFit: 'cover', background: '#111' }} />
        <video ref={localRef} autoPlay playsInline muted style={{ position: 'fixed', top: 'calc(14px + env(safe-area-inset-top, 0px))', right: 10, width: 100, height: 140, borderRadius: 10, zIndex: 10, border: '2px solid rgba(255,255,255,0.15)', objectFit: 'cover', background: '#111' }} />
      </div>

      {/* CHAT PAGE (overlaid on video) */}
      {page === 'chat' && (
        <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%' }}>
          <div style={{ position: 'absolute', top: 'calc(14px + env(safe-area-inset-top, 0px))', left: 14, zIndex: 30, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: wsColor, display: 'inline-block' }} />
            <span style={{ color: '#aaa', fontSize: 11 }}>{wsStatus}</span>
            {noAudio && <span style={{ color: '#ff9800', fontSize: 11, marginLeft: 4 }}>Mic off</span>}
          </div>

          {state === 'idle' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 20, background: 'rgba(0,0,0,0.6)' }}>
              <p style={{ color: '#888', marginBottom: 20 }}>Preview</p>
              <button onClick={findStranger} style={sBtn}>Start Chatting</button>
              <button onClick={() => setPage('profile')} style={{ ...sBtn, marginTop: 10, background: '#555', boxShadow: 'none' }}>Profile</button>
              {camError && (
                <div style={{ marginTop: 16, padding: '12px 20px', background: 'rgba(244,67,54,0.12)', borderRadius: 10, maxWidth: 320, textAlign: 'center' }}>
                  <p style={{ color: '#f44336', fontSize: 13, margin: 0, lineHeight: 1.4, whiteSpace: 'pre-line' }}>{camError}</p>
                  <div style={{ marginTop: 10, display: 'flex', gap: 10, justifyContent: 'center' }}>
                    <p style={{ color: '#888', fontSize: 11, cursor: 'pointer' }} onClick={() => setCamError('')}>Dismiss</p>
                    <p style={{ color: '#6c63ff', fontSize: 11, cursor: 'pointer', fontWeight: 600 }} onClick={findStranger}>Try Again</p>
                  </div>
                </div>
              )}
              {noAudio && (
                <div style={{ marginTop: 12, padding: '8px 16px', background: 'rgba(255,152,0,0.12)', borderRadius: 10, maxWidth: 320, textAlign: 'center' }}>
                  <p style={{ color: '#ff9800', fontSize: 12, margin: 0 }}>No microphone — your partner won't hear you</p>
                </div>
              )}
              <p style={{ color: '#aaa', fontSize: 14, marginTop: camError ? 8 : 20, textAlign: 'center', maxWidth: '80%' }}>{log}</p>
            </div>
          )}

          {(state === 'searching' || state === 'connecting') && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 20, background: 'rgba(0,0,0,0.6)' }}>
              <div style={{ width: 40, height: 40, border: '3px solid #333', borderTopColor: '#6c63ff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: 20 }} />
              <p style={{ color: '#aaa', fontSize: 18 }}>{log || (state === 'connecting' ? 'Connecting...' : 'Searching...')}</p>
              <button onClick={() => { wsRef.current?.send(JSON.stringify({ type: 'leave' })); cleanup(); }} style={{ ...sBtn, marginTop: 20, background: '#555', boxShadow: 'none' }}>Cancel</button>
            </div>
          )}

          {state === 'connected' && (
            window.innerWidth < 700 ? (
              <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, zIndex: 20 }}>
                <p style={{ color: '#aaa', fontSize: 11, margin: 0, writingMode: 'vertical-rl' as any, textOrientation: 'mixed' as any }}>{log}</p>
                <button onClick={() => setShowChat(!showChat)} style={{
                  ...sBtn, width: 52, padding: '6px 0', background: showChat ? '#6c63ff' : 'rgba(255,255,255,0.08)',
                  boxShadow: 'none', fontSize: 10, writingMode: 'vertical-rl' as any,
                }}>Chat</button>
                <button onClick={skip} style={{
                  ...sBtn, width: 52, padding: '6px 0', background: '#d32f2f',
                  boxShadow: 'none', fontSize: 10,
                }}>Next</button>
                <button onClick={() => setPage('profile')} style={{
                  ...sBtn, width: 52, padding: '6px 0', background: '#6c63ff',
                  boxShadow: 'none', fontSize: 10,
                }}>Profile</button>
                <button onClick={() => { wsRef.current?.send(JSON.stringify({ type: 'leave' })); cleanup(); setPage('home'); }} style={{
                  ...sBtn, width: 52, padding: '6px 0', background: '#d32f2f',
                  boxShadow: 'none', fontSize: 10,
                }}>End</button>
                <button onClick={() => { setPage('home'); }} style={{
                  ...sBtn, width: 52, padding: '6px 0', background: '#555',
                  boxShadow: 'none', fontSize: 10,
                }}>Home</button>
              </div>
            ) : (
              <div style={{ position: 'absolute', bottom: 30, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 20, gap: 6 }}>
                <p style={{ color: '#aaa', fontSize: 12, margin: 0 }}>{log}</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', padding: '0 10px' }}>
                  <button onClick={() => setShowChat(!showChat)} style={{
                    ...sBtn, width: 'auto', padding: '8px 16px', background: showChat ? '#6c63ff' : 'rgba(255,255,255,0.08)',
                    boxShadow: 'none', fontSize: 12,
                  }}>Chat</button>
                  <button onClick={skip} style={{
                    ...sBtn, width: 'auto', padding: '8px 16px', background: '#d32f2f',
                    boxShadow: 'none', fontSize: 12,
                  }}>Next →</button>
                  <button onClick={() => setPage('profile')} style={{
                    ...sBtn, width: 'auto', padding: '8px 16px', background: '#6c63ff',
                    boxShadow: 'none', fontSize: 12,
                  }}>Profile</button>
                  <button onClick={() => { wsRef.current?.send(JSON.stringify({ type: 'leave' })); cleanup(); setPage('home'); }} style={{
                    ...sBtn, width: 'auto', padding: '8px 16px', background: '#d32f2f',
                    boxShadow: 'none', fontSize: 12,
                  }}>End Call</button>
                  <button onClick={() => { setPage('home'); }} style={{
                    ...sBtn, width: 'auto', padding: '8px 16px', background: '#555',
                    boxShadow: 'none', fontSize: 12,
                  }}>Home</button>
                </div>
              </div>
            )
          )}

          {showChat && state === 'connected' && (
            <div style={{ position: 'absolute', bottom: 90, right: 14, width: 280, maxHeight: 300, background: 'rgba(20,20,20,0.95)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', zIndex: 25, display: 'flex', flexDirection: 'column' }}>
              {partnerProfile && (
                <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {partnerProfile.avatar ? <img src={partnerProfile.avatar} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} /> :
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#6c63ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 600 }}>
                    {(partnerProfile.name || 'A')[0].toUpperCase()}
                  </div>}
                  <div>
                    <p style={{ color: '#fff', fontSize: 12, fontWeight: 600, margin: 0 }}>{partnerProfile.name}</p>
                    <p style={{ color: '#888', fontSize: 10, margin: 0 }}>{partnerProfile.bio}</p>
                  </div>
                </div>
              )}
              <div style={{ padding: '4px 12px', background: 'rgba(255,152,0,0.1)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <p style={{ color: '#ff9800', fontSize: 10, margin: 0, textAlign: 'center' }}>Messages disappear after 5 seconds</p>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 4, minHeight: 80 }}>
                {chatMessages.map((m, i) => (
                  <div key={i} style={{ alignSelf: m.me ? 'flex-end' : 'flex-start', background: m.me ? '#6c63ff' : 'rgba(255,255,255,0.08)', padding: '6px 10px', borderRadius: 12, maxWidth: '80%', fontSize: 12, color: '#fff', wordBreak: 'break-word', animation: 'fadeIn 0.2s' }}>
                    {m.text}
                  </div>
                ))}
              </div>
              <form onSubmit={(e) => { e.preventDefault(); sendChat(); }} style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Type a message..." maxLength={200} style={{ flex: 1, background: 'transparent', border: 'none', padding: '8px 10px', color: '#fff', fontSize: 12, outline: 'none' }} />
                <button type="submit" style={{ background: 'transparent', border: 'none', color: '#6c63ff', padding: '8px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>Send</button>
              </form>
            </div>
          )}

          <p style={{ position: 'absolute', bottom: 3, left: 6, color: '#555', fontSize: 10, margin: 0, zIndex: 20, fontFamily: 'system-ui, sans-serif' }}>ID: {id}</p>
        </div>
      )}

      {partnerLeft && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 200, background: 'rgba(0,0,0,0.85)' }}>
          <p style={{ color: '#fff', fontSize: 20, fontWeight: 600, marginBottom: 24 }}>Your partner has ended the call</p>
          <button onClick={() => { setPartnerLeft(false); cleanup(); findStranger(); }} style={sBtn}>Find New Partner</button>
        </div>
      )}

      {/* NON-CHAT PAGES - mutually exclusive groups (same priority as old early returns) */}
      {page === 'privacy' && (
        <div className="page-content" style={{ width: '100%', height: '100%', background: '#0a0a0a', overflowY: 'auto' as const }}>
          <Navbar page={page} setPage={handleNav} user={user} onLogout={handleLogout} unreadCount={unreadCount} callActive={callActive} admin={admin} avatar={myProfile?.avatar} />
          <PrivacyPage />
          <Footer setPage={handleNav} />
        </div>
      )}

      {page === 'terms' && (
        <div className="page-content" style={{ width: '100%', height: '100%', background: '#0a0a0a', overflowY: 'auto' as const }}>
          <Navbar page={page} setPage={handleNav} user={user} onLogout={handleLogout} unreadCount={unreadCount} callActive={callActive} admin={admin} avatar={myProfile?.avatar} />
          <TermsPage />
          <Footer setPage={handleNav} />
        </div>
      )}

      {page === 'admin' && admin && (
        <div className="page-content" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Navbar page={page} setPage={handleNav} user={user} onLogout={handleLogout} unreadCount={unreadCount} callActive={callActive} admin={admin} avatar={myProfile?.avatar} />
          <AdminPage />
        </div>
      )}

      {!user ? (
        <div style={{ width: '100%', height: '100vh', background: '#0a0a0a', fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column', overflowY: 'auto' as const }}>
          <div className="mobile-auth" style={{ width: '100%', flex: 1, display: 'flex', flexDirection: 'column', padding: '20px', flexShrink: 0 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            {showForgot ? (
              <>
                <h1 style={{ fontSize: 40, fontWeight: 800, margin: 0, marginBottom: 4, background: 'linear-gradient(135deg, #6c63ff, #2a6eff, #00d4ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>LiveMe</h1>
                <p style={{ color: '#888', fontSize: 14, marginBottom: 24 }}>{forgotSent ? 'Check your email' : 'Reset password'}</p>
                {forgotSent ? (
                  <>
                    <p style={{ color: '#aaa', fontSize: 14, textAlign: 'center', maxWidth: 320, lineHeight: 1.5, marginBottom: 16, wordBreak: 'break-word' }}>
                      If an account exists at <b style={{ color: '#fff' }}>{forgotEmail}</b>, we've sent a password reset link. Check your inbox and spam folder.
                    </p>
                    <button onClick={() => { setShowForgot(false); setForgotSent(false); setForgotEmail(''); setAuthMsg(''); }} style={mobileBtn}>
                      Back to Sign In
                    </button>
                  </>
                ) : (
                  <form onSubmit={handleForgotPassword} style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 360 }}>
                    <TurnstileCaptcha onVerify={setCaptchaToken} resetKey={captchaResetKey} /><input style={input} type="email" placeholder="Your email address" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} required />
                    <button type="submit" disabled={submitting || !captchaToken || forgotCooldown > 0} style={{...mobileBtn, opacity: submitting || !captchaToken || forgotCooldown > 0 ? 0.5 : 1}}>
                      {submitting ? 'Sending...' : forgotCooldown > 0 ? `Wait ${forgotCooldown}s` : 'Send Reset Link'}
                    </button>
                    {authMsg && <p style={{ color: authMsg.includes('error') || authMsg.includes('Error') ? '#f44336' : '#ff9800', fontSize: 13, marginTop: 12, textAlign: 'center', maxWidth: 320, wordBreak: 'break-word' }}>{authMsg}</p>}
                    <p style={{ color: '#666', fontSize: 13, marginTop: 16, cursor: 'pointer' }} onClick={() => { setShowForgot(false); setAuthMsg(''); }}>
                      ← Back to Sign In
                    </p>
                  </form>
                )}
              </>
            ) : (
              <>
                <h1 style={{ fontSize: 40, fontWeight: 800, margin: 0, marginBottom: 4, background: 'linear-gradient(135deg, #6c63ff, #2a6eff, #00d4ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>LiveMe</h1>
                <p style={{ color: '#888', fontSize: 14, marginBottom: 24 }}>{authMode === 'login' ? 'Welcome back' : 'Create an account'}</p>
                <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 360 }}>
                  <input style={input} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
                  <div style={{ position: 'relative', width: '100%' }}>
                    <input style={{ ...input, paddingRight: 58 }} type={showPassword ? 'text' : 'password'} placeholder={authMode === 'register' ? '10+ chars, upper/lowercase + number' : 'Password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={authMode === 'register' ? 10 : 8} autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} />
                    <button type="button" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 0, background: 'transparent', color: '#aaa', padding: 8, cursor: 'pointer' }}>{showPassword ? 'Hide' : 'Show'}</button>
                  </div>
                  <TurnstileCaptcha onVerify={setCaptchaToken} resetKey={captchaResetKey} />
                  <button type="submit" disabled={submitting || !captchaToken} style={{...mobileBtn, opacity: submitting || !captchaToken ? 0.5 : 1}}>{submitting ? 'Please wait...' : authMode === 'login' ? 'Sign In' : 'Sign Up'}</button>
                </form>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '12px 0', width: '100%', maxWidth: 360 }}>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
                  <span style={{ color: '#666', fontSize: 12 }}>OR</span>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
                </div>
                <button type="button" onClick={() => signInWithGoogle()} style={{
                  background: '#4285F4', color: '#fff', border: 'none', padding: '12px', borderRadius: 10,
                  fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', width: '100%', maxWidth: 360,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                  <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#fff" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#fff" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#fff" d="M10.54 28.59A14.5 14.5 0 0 1 9.5 24c0-1.59.28-3.14.76-4.59l-7.98-6.19A23.99 23.99 0 0 0 0 24c0 3.77.87 7.35 2.56 10.56l7.98-5.97z"/><path fill="#fff" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 5.97C6.51 42.62 14.62 48 24 48z"/></svg>
                  Sign {authMode === 'login' ? 'in' : 'up'} with Google
                </button>
                <button type="button" onClick={() => signInWithGitHub()} style={{
                  background: '#24292e', color: '#fff', border: 'none', padding: '12px', borderRadius: 10,
                  fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', width: '100%', maxWidth: 360,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                  <svg width="20" height="20" viewBox="0 0 16 16" fill="white"><path fillRule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
                  Sign {authMode === 'login' ? 'in' : 'up'} with GitHub
                </button>
                {authMsg && <p style={{ color: authMsg.includes('error') || authMsg.includes('Error') ? '#f44336' : '#ff9800', fontSize: 13, marginTop: 12, textAlign: 'center', maxWidth: 320, wordBreak: 'break-word' }}>{authMsg}</p>}
                {authMode === 'login' && (
                  <p style={{ color: '#6c63ff', fontSize: 13, marginTop: 12, cursor: 'pointer' }} onClick={() => { setShowForgot(true); setAuthMsg(''); }}>
                    Forgot password?
                  </p>
                )}
                <p style={{ color: '#666', fontSize: 13, marginTop: 16, cursor: 'pointer' }} onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setAuthMsg(''); }}>
                  {authMode === 'login' ? "Don't have an account? Sign Up" : 'Already have an account? Sign In'}
                </p>
              </>
            )}
            </div>
            <Footer setPage={handleNav} />
          </div>
          <div className="desktop-layout" style={{ background: '#0a0a0a', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <Navbar page={page} setPage={handleNav} user={user} onLogout={handleLogout} unreadCount={unreadCount} callActive={callActive} admin={admin} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', paddingTop: 60 }}>
              <LandingPage
                onNav={handleNav}
                onStart={() => {}}
                authMode={authMode}
                authMsg={authMsg}
                submitting={submitting}
                email={email}
                password={password}
                onEmailChange={setEmail}
                onPasswordChange={setPassword}
                showPassword={showPassword}
                onTogglePassword={() => setShowPassword(v => !v)}
                onSubmit={handleAuth}
                onToggleAuth={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setPassword(''); setShowPassword(false); setAuthMsg(''); }}
                showForgot={showForgot}
                forgotSent={forgotSent}
                forgotEmail={forgotEmail}
                forgotCooldown={forgotCooldown}
                onForgotEmailChange={setForgotEmail}
                onForgotSubmit={handleForgotPassword}
                onShowForgot={() => { setShowForgot(true); setAuthMsg(''); }}
                onBackToSignIn={() => { setShowForgot(false); setForgotSent(false); setForgotEmail(''); setAuthMsg(''); }}
                onGoogleSignIn={() => { setAuthMsg(''); signInWithGoogle(); }}
                onGitHubSignIn={() => { setAuthMsg(''); signInWithGitHub(); }}
                captchaToken={captchaToken}
                captchaResetKey={captchaResetKey}
                onCaptchaVerify={setCaptchaToken}
              />
            </div>
            <Footer setPage={handleNav} />
          </div>
        </div>
      ) : (
        /* Authenticated user pages */
        <>
          {page === 'profile' && (
            <div className="page-content profile-page-shell" style={{ width: '100%', height: '100%', background: '#0a0a0a', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <Navbar page={page} setPage={handleNav} user={user} onLogout={handleLogout} unreadCount={unreadCount} callActive={callActive} admin={admin} avatar={myProfile?.avatar} />
              <ProfilePage onNav={setPage as any} user={user} onMessage={(id) => { setMessagePartner(id); setPage('messages'); }} onViewProfile={(id) => setViewProfileId(id)} viewUserId={viewProfileId} onClearView={() => setViewProfileId(null)} onAvatarSaved={handleAvatarSaved} />
              <Footer setPage={handleNav} />
            </div>
          )}

          {page === 'settings' && (
            <div className="page-content" style={{ width: '100%', height: '100%', background: '#0a0a0a', overflowY: 'auto' as const }}>
              <Navbar page={page} setPage={handleNav} user={user} onLogout={handleLogout} unreadCount={unreadCount} callActive={callActive} admin={admin} avatar={myProfile?.avatar} />
              <SettingsPage userId={user?.id || ''} onReplayOnboarding={() => { setOnboardingTourStep('profile_photo'); setOnboardingTourDone([]); setOnboardingTourActive(true); }} />
              <Footer setPage={handleNav} />
            </div>
          )}

          {page === 'wallet' && (
            <div className="page-content" style={{ width: '100%', height: '100%', background: '#0a0a0a', overflowY: 'auto' as const }}>
              <Navbar page={page} setPage={handleNav} user={user} onLogout={handleLogout} unreadCount={unreadCount} callActive={callActive} admin={admin} avatar={myProfile?.avatar} />
              <WalletPage />
              <Footer setPage={handleNav} />
            </div>
          )}

          {page === 'messages' && (
            <div className="page-content" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
              <Navbar page={page} setPage={handleNav} user={user} onLogout={handleLogout} unreadCount={unreadCount} callActive={callActive} admin={admin} avatar={myProfile?.avatar} />
              <MessagesPage onNav={setPage as any} user={user} messagePartner={messagePartner} onViewProfile={(id) => { setViewProfileId(id); setPage('profile'); }} onChatOpened={() => getConversations().then(({ conversations }) => { if (conversations) setUnreadCount(conversations.reduce((sum, c) => sum + c.unread, 0)); })} />
              {window.innerWidth >= 700 && <Footer setPage={handleNav} />}
            </div>
          )}

          {page === 'home' && (
            <div className="page-content" style={{ width: '100%', height: '100%', background: '#0a0a0a', display: 'flex', flexDirection: 'column', overflowY: 'auto' as const, overflowX: 'hidden' as const, maxWidth: '100%' }}>
              <Navbar page={page} setPage={handleNav} user={user} onLogout={handleLogout} unreadCount={unreadCount} callActive={callActive} admin={admin} avatar={myProfile?.avatar} />
              {underage && (
                <div style={{ padding: '10px 16px', background: 'rgba(244,67,54,0.1)', borderBottom: '1px solid rgba(244,67,54,0.2)', textAlign: 'center' }}>
                  <p style={{ color: '#f44336', fontSize: 13, margin: 0 }}>Video chat is restricted to users 18+. You can browse profiles and send messages.</p>
                </div>
              )}
              {(state === 'searching' || state === 'connecting') && (
                <div style={{ padding: '12px 16px', background: 'rgba(108,99,255,0.08)', borderBottom: '1px solid rgba(108,99,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 12, height: 12, border: '2px solid #6c63ff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    <span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>Looking for a partner</span>
                  </div>
                  <button onClick={() => { wsRef.current?.send(JSON.stringify({ type: 'leave' })); cleanup(); }} style={{
                    background: 'none', border: '1px solid #d32f2f', color: '#d32f2f', borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                  }}>Cancel</button>
                </div>
              )}
              {state === 'connected' && (
                <div style={{ padding: '12px 16px', background: 'rgba(76,175,80,0.08)', borderBottom: '1px solid rgba(76,175,80,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#4caf50', boxShadow: '0 0 6px #4caf50' }} />
                    <span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>
                      Live with {partnerProfile?.name || 'a partner'}
                    </span>
                    {partnerProfile?.avatar && <img src={partnerProfile.avatar} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />}
                  </div>
                  <button onClick={() => setPage('chat')} style={{
                    background: 'none', border: '1px solid #4caf50', color: '#4caf50', borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
                  }}>Return to Live</button>
                </div>
              )}
              {liveUsers.length > 0 && (
                <div style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <h2 style={{ color: '#fff', fontSize: 16, fontWeight: 700, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f44336', boxShadow: '0 0 6px #f44336' }} />
                    Live Now
                  </h2>
                  <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
                    {liveUsers.map(l => (
                      <div key={l.user_id} onClick={() => {}} style={{
                        flexShrink: 0, width: 200, background: 'linear-gradient(135deg, #6c63ff, #2a6eff)', borderRadius: 12,
                        border: 'none', overflow: 'hidden', cursor: 'pointer',
                      }}>
                        <div style={{ width: '100%', height: 150, background: '#2a2a2a', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
                          {l.avatar ? <img src={l.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} className="live-fallback" />
                            : <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#6c63ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 20, fontWeight: 700, position: 'absolute' }}>
                              {(l.name || 'A')[0].toUpperCase()}
                            </div>}

                        </div>
                        <div style={{ padding: '10px 12px', background: 'rgba(0,0,0,0.15)' }}>
                          <p style={{ color: '#fff', fontSize: 13, fontWeight: 600, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />
                            <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>LIVE</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <LandingPage onNav={setPage} onStart={() => {
                if (underage) return;
                if (state === 'connected' || state === 'searching') { setPage('chat'); return; }
                setPage('chat');
                setTimeout(findStranger, 100);
              }} underage={underage} />
              <Footer setPage={handleNav} />
            </div>
          )}
        </>
      )}



      {onboardingTourActive && user?.id && (
        <OnboardingTour
          initialStep={onboardingTourStep}
          completedSteps={onboardingTourDone}
          onStepChange={handleTourStepChange}
          onNavigate={(destination) => setPage(destination)}
          onStartCallDemo={() => {
            window.alert(underage
              ? 'Random video calls are restricted to adults. This introduction will continue without starting a call.'
              : 'Demo call: this is a tutorial preview only. No real person is connected and you are not placed in the matching queue.');
          }}
          onStartConversation={() => setPage('messages')}
          onFinish={() => {
            void handleTourStepChange('complete', Array.from(new Set([...onboardingTourDone, 'safety', 'complete'])))
              .then(() => setOnboardingTourActive(false))
              .catch(error => setAuthMsg(error?.message || 'Could not finish onboarding.'));
          }}
        />
      )}

      {onboardingStep === 'welcome' && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#1a1a1a', borderRadius: 16, padding: '28px 24px', maxWidth: 440, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }}>
            <h1 style={{ fontSize: 32, fontWeight: 800, margin: 0, marginBottom: 4, textAlign: 'center', background: 'linear-gradient(135deg, #6c63ff, #2a6eff, #00d4ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>LiveMe</h1>
            <p style={{ color: '#888', fontSize: 14, marginBottom: 12, textAlign: 'center' }}>Welcome! Before you start...</p>
            <div style={{ color: '#ccc', fontSize: 13, textAlign: 'left', lineHeight: 1.6, marginBottom: 12 }}>
              <p style={{ marginBottom: 10 }}>Meet people through Random Chat, build your profile, and continue conversations with private messages.</p>
              <p style={{ marginBottom: 8, color: '#6c63ff', fontWeight: 600 }}>Quick start tips</p>
              <p style={{ marginBottom: 6 }}>• Random Chat: allow camera and microphone access when you are ready to meet someone.</p>
              <p style={{ marginBottom: 6 }}>• Messaging: use your inbox to continue conversations with people you choose.</p>
              <p style={{ marginBottom: 6 }}>• Your profile: choose what name and bio details you share publicly.</p>
              <p style={{ marginBottom: 10, color: '#6c63ff', fontWeight: 600 }}>Stay safe</p>
              <p style={{ marginBottom: 6 }}>• Never share passwords, financial details, or your home address with strangers.</p>
              <p style={{ marginBottom: 6 }}>• Use report and block tools if someone behaves abusively or makes you uncomfortable.</p>
              <p style={{ marginBottom: 6 }}>• Be respectful and remember that people you meet online may not be who they claim to be.</p>
              <p style={{ marginBottom: 10, color: '#6c63ff', fontWeight: 600 }}>Age Requirement</p>
              <p style={{ marginBottom: 6 }}>• Live video chat is restricted to users aged 18 and older.</p>
              <p style={{ marginBottom: 6 }}>• If you are under 18, you can still use the text messaging system to chat with other users.</p>
              <p style={{ marginTop: 10, padding: 10, background: 'rgba(108,99,255,0.1)', borderRadius: 8, border: '1px solid rgba(108,99,255,0.2)' }}>
                By continuing, you confirm that you have read and understand the above. You agree to use LiveMe responsibly and in accordance with our terms.
              </p>
            </div>
            <form onSubmit={handleOnboardingSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ccc', fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={agreedToTerms} onChange={e => setAgreedToTerms(e.target.checked)} style={{ width: 18, height: 18, cursor: 'pointer' }} />
                I agree to the terms above
              </label>
              <button type="submit" disabled={submitting || !agreedToTerms} style={{...mobileBtn, opacity: submitting || !agreedToTerms ? 0.5 : 1}}>Continue</button>
            </form>
            {authMsg && <p style={{ color: authMsg.includes('error') || authMsg.includes('Error') ? '#f44336' : '#ff9800', fontSize: 13, marginTop: 10, textAlign: 'center' }}>{authMsg}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

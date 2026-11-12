import heic2any from 'heic2any';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { watchRecentLive, watchUserPresence } from '../chatPresence';
import OnlineDot from '../components/OnlineDot';
import { getChatProfile, upsertChatProfile, ChatProfile, getRecentLive, clearRecentLive, getUserProfile, getAllMessagesForDownload, isAdmin, getProfilePosts, createProfilePost, deleteProfilePost, updateProfilePost, setProfilePostPrivacy, setProfilePostReaction, setProfileCommentReaction, addProfilePostComment, ChatPost, uploadProfilePhoto, updateChatProfilePhoto, getProfilePhotos, deleteProfilePhoto, removeProfilePostImage, ProfilePhoto } from '../supabaseClient';

type Page = 'profile' | 'terms' | 'privacy' | 'home';

interface Props {
  onNav: (p: Page) => void;
  user: any;
  onMessage?: (userId: string) => void;
  viewUserId?: string | null;
  onViewProfile?: (userId: string) => void;
  onClearView?: () => void;
}

function formatCommentTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)}d`;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

type DecodedProfileImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
};

async function decodeProfileImage(file: File, onStage?: (stage: string) => void): Promise<DecodedProfileImage> {
  if (!file || !file.size) throw new Error('The selected file is empty. Please choose another image.');

  const loadImage = async (sourceFile: Blob): Promise<{ image: HTMLImageElement; url: string }> => {
    const url = URL.createObjectURL(sourceFile);
    const image = new Image();
    try {
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = (error?: Error) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeout);
          image.onload = null;
          image.onerror = null;
          error ? reject(error) : resolve();
        };
        const timeout = window.setTimeout(() => finish(new Error('Image loading timed out.')), 20000);
        image.onload = () => finish();
        image.onerror = () => finish(new Error('Browser image decoder rejected the file.'));
        image.src = url;
        if (image.complete && image.naturalWidth > 0) finish();
      });
      if (!image.naturalWidth || !image.naturalHeight) throw new Error('The selected image has no readable dimensions.');
      return { image, url };
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
  };

  let loaded: { image: HTMLImageElement; url: string } | null = null;
  try {
    try {
      loaded = await loadImage(file);
    } catch (nativeError) {
      // Android/iOS photo pickers can return HEIC/HEIF files even when the
      // filename or MIME metadata looks generic. Convert those bytes to JPEG.
      try {
        onStage?.('Converting photo format…');
        // Some mobile HEIC converters can remain pending indefinitely. Bound
        // this fallback so the editor always reports a useful failure.
        const converted = await Promise.race([
          heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 }),
          new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('Photo format conversion timed out. Please choose a JPEG or PNG copy of this photo.')), 15000)),
        ]);
        const jpegBlob = Array.isArray(converted) ? converted[0] : converted;
        loaded = await loadImage(jpegBlob);
      } catch {
        throw new Error('This photo format is not supported by the browser. Choose a JPEG/PNG/WebP photo, or export this HEIC/HEIF image as JPEG first.');
      }
    }
    return {
      source: loaded.image,
      width: loaded.image.naturalWidth,
      height: loaded.image.naturalHeight,
      cleanup: () => URL.revokeObjectURL(loaded!.url),
    };
  } catch (error: any) {
    throw new Error(error?.message || 'The browser could not read the selected image.');
  }
}

async function canvasToWebPBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  // Some mobile browsers silently return PNG when WebP encoding is unavailable.
  // Never label those PNG bytes as image/webp: Storage validates the MIME type
  // and the resulting public image may fail to render.
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('Photo processing timed out in this browser. Please try a smaller image or another browser.'));
    }, 15000);
    try {
      canvas.toBlob(result => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        resolve(result);
      }, 'image/webp', quality);
    } catch (error) {
      if (!settled) {
        settled = true;
        window.clearTimeout(timeout);
        reject(error);
      }
    }
  });
  if (!blob) throw new Error('Your browser could not prepare this photo. Please try another image.');
  if (blob.type.toLowerCase() !== 'image/webp') {
    throw new Error('This browser cannot encode WebP photos. Update Chrome or try another browser, then save again.');
  }
  return blob;
}

async function compressProfileImage(file: File): Promise<File> {
  // Some Android/gallery providers return a valid image with an empty or
  // generic MIME type. Decode the bytes first; the crop output is normalized
  // to WebP before it reaches storage.
  const decoded = await decodeProfileImage(file);
  try {
    // Bound mobile CPU work: use a small, descending set of canvas sizes
    // and qualities instead of dozens of sequential WebP encodes. Covers are
    // already cropped to a wide 1200px output, so they usually pass early.
    const attempts = [
      { maxSide: 1280, quality: 0.76 },
      { maxSide: 1024, quality: 0.66 },
      { maxSide: 896, quality: 0.56 },
      { maxSide: 768, quality: 0.46 },
      { maxSide: 640, quality: 0.38 },
      { maxSide: 512, quality: 0.32 },
      { maxSide: 384, quality: 0.28 },
    ];
    for (const attempt of attempts) {
      const scale = Math.min(1, attempt.maxSide / Math.max(decoded.width, decoded.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(decoded.width * scale));
      canvas.height = Math.max(1, Math.round(decoded.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Image compression is not supported in this browser.');
      context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
      const blob = await canvasToWebPBlob(canvas, attempt.quality);
      if (blob.size <= 200 * 1024) {
        return new File([blob], 'profile-photo.webp', { type: 'image/webp', lastModified: Date.now() });
      }
    }
  } finally {
    decoded.cleanup();
  }
  throw new Error('This image cannot be compressed below 200 KB. Please choose a smaller image.');
}


async function createSquareAvatarCrop(file: File, zoom: number, onStage?: (stage: string) => void): Promise<File> {
  onStage?.('Reading selected photo…');
  const decoded = await decodeProfileImage(file, onStage);
  try {
    onStage?.('Cropping square image…');
    const side = Math.min(decoded.width, decoded.height) / Math.max(1, zoom);
    const sx = (decoded.width - side) / 2;
    const sy = (decoded.height - side) / 2;
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 640;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image editing is not supported in this browser.');
    context.drawImage(decoded.source, sx, sy, side, side, 0, 0, 640, 640);
    onStage?.('Encoding profile picture…');
    const blob = await canvasToWebPBlob(canvas, 0.84);
    return new File([blob], 'profile-picture-crop.webp', { type: 'image/webp', lastModified: Date.now() });
  } finally {
    decoded.cleanup();
  }
}

const s = {
  page: { background: '#161616', fontFamily: 'system-ui, sans-serif', minHeight: '100vh' },
  wrap: { width: '100%', maxWidth: 960, margin: '0 auto', padding: '0 0 40px', display: 'flex', flexDirection: 'column' as const },
  coverWrap: { position: 'relative' as const, width: '100%', aspectRatio: '820/280' as any, overflow: 'hidden', background: 'linear-gradient(135deg, #6c63ff 0%, #2a6eff 50%, #00d4ff 100%)', flexShrink: 0 },
  coverImg: { width: '100%', height: '100%', objectFit: 'cover' as const, display: 'block', position: 'absolute' as const, inset: 0 },
  avatarWrap: { display: 'flex', justifyContent: 'flex-start', marginTop: -64, paddingLeft: 24 },
  avatar: { width: 132, height: 132, borderRadius: 0, border: '5px solid #1a1a1a', background: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44, color: '#fff', fontWeight: 700, overflow: 'hidden', position: 'relative' as const, flexShrink: 0, cursor: 'pointer' },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' as const, display: 'block' },
  nameSection: { padding: '8px 24px 16px', textAlign: 'left' as const, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderBottom: '1px solid rgba(255,255,255,.07)' },
  name: { color: '#fff', fontSize: 25, fontWeight: 750, letterSpacing: '-.5px', margin: 0 },
  contentArea: { padding: '8px 32px 32px', display: 'grid', gridTemplateColumns: 'minmax(0, 260px) minmax(0, 1fr)', alignItems: 'start', gap: 24 },
  card: { background: 'transparent', border: 'none', borderRadius: 0, padding: 0 },
  cardTitle: { color: '#fff', fontSize: 16, fontWeight: 600, margin: '0 0 16px' },
  label: { color: '#aaa', fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' },
  input: { background: '#2a2a2a', color: '#fff', border: '1px solid rgba(255,255,255,0.08)', padding: '11px 14px', borderRadius: 10, fontSize: 15, width: '100%', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const, marginBottom: 16 },
  textarea: { background: '#2a2a2a', color: '#fff', border: '1px solid rgba(255,255,255,0.08)', padding: '11px 14px', borderRadius: 10, fontSize: 15, width: '100%', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const, marginBottom: 16, resize: 'vertical' as const, minHeight: 64 },
  toggleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' },
  toggleLabel: { color: '#ccc', fontSize: 14 },
  toggleBtn: { padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', fontFamily: 'inherit' },
  saveBtn: { marginTop: 12, background: 'linear-gradient(135deg, #6c63ff, #2a6eff)', color: '#fff', border: 'none', padding: '12px', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', width: '100%' },
  msg: { fontSize: 13, textAlign: 'center' as const, marginTop: 12 },
  friendCard: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' },
  friendAvatar: { width: 36, height: 36, borderRadius: '50%', background: '#6c63ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 15, fontWeight: 600, flexShrink: 0 },
  friendName: { color: '#e0e0e0', fontSize: 14, fontWeight: 500 },
  friendBio: { color: '#777', fontSize: 12 },
  hiddenInput: { display: 'none' },
};

const hoverStyles = document.createElement('style');
hoverStyles.textContent = `
  .profile-content-area { display: grid; grid-template-columns: minmax(0, 260px) minmax(0, 1fr); gap: 24px; align-items: start; }
  .profile-avatar, .profile-avatar > img { border-radius: 0 !important; }
  .profile-sidebar { min-width: 0; position: sticky; top: 76px; max-height: calc(100vh - 92px); overflow-y: auto; scrollbar-width: thin; }
  .profile-main { min-width: 0; min-height: 0; display: flex; flex-direction: column; }
  .profile-main-content { min-width: 0; }
  .profile-tabs { position: sticky; top: 60px; z-index: 35; display: flex; gap: 4px; overflow-x: auto; overflow-y: hidden; white-space: nowrap; touch-action: pan-x; overscroll-behavior-x: contain; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
  .profile-tabs::-webkit-scrollbar { display: none; }
  @media (min-width: 700px) {
    /* Keep the profile shell and navigation fixed in the available page
       viewport. Only the selected tab's content gets vertical scrolling. */
    .profile-page-shell > .profile-page-root { flex: 1 1 auto; min-height: 0; }
    .profile-page-root { height: 100% !important; min-height: 0 !important; overflow: hidden !important; }
    .profile-page-root > .profile-wrap { height: 100%; min-height: 0; overflow: hidden; padding-bottom: 0; }
    .profile-main { display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: hidden; }
    .profile-main-content {
      display: block;
      flex: 1 1 auto;
      height: 0;
      min-height: 0;
      max-height: none !important;
      overflow-x: hidden !important;
      overflow-y: auto !important;
      overscroll-behavior-y: contain;
      scrollbar-gutter: stable;
      scrollbar-width: thin;
      -webkit-overflow-scrolling: touch;
    }
    .profile-main-content::-webkit-scrollbar { width: 8px; }
    .profile-main-content::-webkit-scrollbar-thumb { background: rgba(145,145,160,.42); border-radius: 8px; }
    .profile-tabs { position: relative; top: auto; flex: 0 0 auto; overflow-x: auto; overflow-y: hidden; }
    .profile-sidebar { position: static; max-height: none; overflow: visible; }
    /* Compact the profile's top identity area so the tab feed has useful
       viewport space on common laptop displays. */
    .cover-wrap { height: clamp(180px, 26vh, 230px) !important; aspect-ratio: auto !important; }
    .profile-avatar-wrap { margin-top: -54px !important; }
    .profile-avatar { width: 112px !important; height: 112px !important; }
    .profile-name-section { padding: 6px 24px 10px !important; }
    .profile-page-root > .profile-wrap > section[aria-label="Recent Live"] { padding: 8px 24px 4px !important; }
    .profile-page-root > .profile-wrap > section[aria-label="Recent Live"] h2 { margin-bottom: 7px !important; }
    .profile-content-area { flex: 1 1 auto; height: 0; min-height: 180px; overflow: hidden; align-items: stretch; }
  }
  @media (max-width: 699px) {
    /* Mobile keeps natural document scrolling and its original layout. */
    .profile-page-shell { display: block !important; overflow-x: hidden !important; overflow-y: auto !important; }
    .profile-page-root { height: auto !important; min-height: 100vh !important; overflow: visible !important; }
    .profile-main { display: block; }
    .profile-main-content { height: auto !important; min-height: 0; max-height: none; flex: initial; overflow: visible !important; overscroll-behavior: auto; }
    .profile-tabs { position: static; }
  }
  html[data-theme="light"] .profile-tabs { background: #f4f6fb !important; border-color: rgba(25,35,55,.14) !important; }
  @media (max-width: 699px) {
    .profile-content-area { padding: 8px 16px 32px !important; grid-template-columns: minmax(0, 1fr) !important; gap: 8px !important; }
    .profile-sidebar { position: static; max-height: none; overflow: visible; }
    .profile-section { padding-top: 16px !important; padding-bottom: 16px !important; }
    .profile-avatar { width: 100px !important; height: 100px !important; font-size: 32px !important; }
    .profile-avatar-wrap { margin-top: -48px !important; padding-left: 16px !important; }
    .profile-name-section { padding: 8px 16px 14px !important; align-items: flex-start !important; }
  }
`;
if (!document.getElementById('profile-hover-styles')) {
  hoverStyles.id = 'profile-hover-styles';
  document.head.appendChild(hoverStyles);
}

export default function ProfilePage({ onNav, user, onMessage, viewUserId, onViewProfile, onClearView }: Props) {
  const [displayName, setDisplayName] = useState('Anonymous');
  const [bio, setBio] = useState('');
  const [work, setWork] = useState('');
  const [education, setEducation] = useState('');
  const [shareDetails, setShareDetails] = useState(true);
  const [shareName, setShareName] = useState(false);
  const [shareBio, setShareBio] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [recent, setRecent] = useState<{ id: string; name: string; bio: string; avatar: string; time: string }[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [avatarUrl, setAvatarUrl] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarSaveStage, setAvatarSaveStage] = useState('');
  const [uploadingCover, setUploadingCover] = useState(false);
  const [avatarEditDraft, setAvatarEditDraft] = useState<{ file: File; url: string } | null>(null);
  const [avatarCropZoom, setAvatarCropZoom] = useState(1);
  const [viewedUser, setViewedUser] = useState<{ name: string; bio: string; avatar: string; cover: string; work: string; education: string; shareDetails: boolean } | null>(null);
  const [loadingViewed, setLoadingViewed] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [posts, setPosts] = useState<ChatPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [loadingOlderPosts, setLoadingOlderPosts] = useState(false);
  const [hasMorePosts, setHasMorePosts] = useState(false);
  const postsSentinelRef = useRef<HTMLDivElement>(null);
  const [openPostMenu, setOpenPostMenu] = useState<string | null>(null);
  const postMenuRef = useRef<HTMLDivElement>(null);
  const [openReactionPicker, setOpenReactionPicker] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [postActionMsg, setPostActionMsg] = useState('');
  const [privacySavingPostId, setPrivacySavingPostId] = useState<string | null>(null);
  const [postPrivacyMsg, setPostPrivacyMsg] = useState<{ id: string; text: string; error: boolean } | null>(null);
  const [postText, setPostText] = useState('');
  const [postImages, setPostImages] = useState<File[]>([]);
  const [postImagePreviews, setPostImagePreviews] = useState<string[]>([]);
  const [postPreviewOpen, setPostPreviewOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postMsg, setPostMsg] = useState('');
  const [activeTab, setActiveTab] = useState<'Posts' | 'Photos' | 'Timeline' | 'About'>('Posts');
  const [profilePhotos, setProfilePhotos] = useState<ProfilePhoto[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<{ url: string; alt: string } | null>(null);
  const [openPhotoMenu, setOpenPhotoMenu] = useState<string | null>(null);
  const [photoMenuPosition, setPhotoMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [selectedPost, setSelectedPost] = useState<ChatPost | null>(null);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const postImagesInputRef = useRef<HTMLInputElement>(null);

  const isViewingOther = viewUserId && viewUserId !== user?.id;

  useEffect(() => {
    if (!openPostMenu) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (postMenuRef.current && !postMenuRef.current.contains(event.target as Node)) setOpenPostMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpenPostMenu(null); };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [openPostMenu]);

  useEffect(() => {
    (async () => {
      const { profile } = await getChatProfile();
      if (profile) {
        setDisplayName(profile.display_name);
        setBio(profile.bio);
        setWork(profile.work || '');
        setEducation(profile.education || '');
        setShareDetails(profile.share_details !== false);
        setShareName(profile.share_name);
        setShareBio(profile.share_bio);
        setAvatarUrl(profile.avatar_url || localStorage.getItem('profile_avatar') || '');
        setCoverUrl(profile.cover_url || localStorage.getItem('profile_cover') || '');
      }
      setLoading(false);
    })();
    isAdmin().then(setAdmin);
  }, []);

  const profileOwnerId = isViewingOther && viewUserId ? viewUserId : (user?.id || '');
  const recentPresenceIds = recent.map((entry) => entry.id).filter(Boolean);
  const presenceTargetIds = Array.from(new Set([profileOwnerId, ...recentPresenceIds])).filter((id) => id && id !== user?.id);
  const presenceTargetKey = presenceTargetIds.slice().sort().join('|');

  // Profile pages and Recent Live chatheads use the same shared directory as inbox.
  // A profile can show presence even when the viewer has never messaged that user.
  useEffect(() => {
    if (!user?.id || !presenceTargetIds.length) {
      setOnlineUserIds(new Set());
      return;
    }
    return watchUserPresence(user.id, presenceTargetIds, setOnlineUserIds);
  }, [user?.id, presenceTargetKey]);

  // Keep the owner's Recent Live chatheads synchronized across tabs/devices.
  // Initial fetch handles the current snapshot; Realtime refreshes after inserts/deletes.
  useEffect(() => {
    const ownerId = user?.id;
    if (!ownerId || isViewingOther) return;
    let active = true;
    const refreshRecentLive = async () => {
      const { entries } = await getRecentLive();
      if (active && entries) {
        setRecent(entries.map(e => ({
          id: e.partner_id,
          name: e.partner_name,
          bio: e.partner_bio,
          avatar: e.partner_avatar,
          time: e.created_at,
        })));
      }
    };
    void refreshRecentLive();
    const stopWatching = watchRecentLive(ownerId, () => { void refreshRecentLive(); });
    return () => {
      active = false;
      stopWatching();
    };
  }, [user?.id, isViewingOther]);

  useEffect(() => {
    let active = true;
    setPhotosLoading(true);
    getProfilePhotos(profileOwnerId).then(({ photos }) => {
      if (active) setProfilePhotos(photos || []);
      if (active) setPhotosLoading(false);
    });
    return () => { active = false; };
  }, [profileOwnerId]);

  useEffect(() => {
    setActiveTab('Posts');
  }, [viewUserId]);

  useEffect(() => {
    let active = true;
    if (!profileOwnerId) { setPosts([]); setPostsLoading(false); return; }
    setPostsLoading(true);
    setLoadingOlderPosts(false);
    setHasMorePosts(false);
    setPosts([]);
    getProfilePosts(profileOwnerId, undefined, 20).then(({ posts: rows, error }) => {
      if (!active) return;
      const batch = rows || [];
      // Keep any post created locally while this initial request was in
      // flight; a stale response must not erase the just-published post.
      setPosts(current => {
        const merged = new Map<string, ChatPost>();
        for (const item of [...batch, ...current]) merged.set(item.id, item);
        return Array.from(merged.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      });
      setHasMorePosts(batch.length === 20);
      setPostMsg(error || '');
      setPostsLoading(false);
    });
    return () => { active = false; };
  }, [profileOwnerId]);

  async function loadOlderPosts() {
    if (loadingOlderPosts || postsLoading || !hasMorePosts || !posts.length) return;
    const oldestPost = posts[posts.length - 1];
    setLoadingOlderPosts(true);
    try {
      const { posts: rows, error } = await getProfilePosts(profileOwnerId, oldestPost.created_at, oldestPost.id, 20);
      if (error) { setPostMsg(error); return; }
      const batch = rows || [];
      setPosts(current => {
        const known = new Set(current.map(post => post.id));
        return [...current, ...batch.filter(post => !known.has(post.id))];
      });
      setHasMorePosts(batch.length === 20);
    } catch (error: any) {
      setPostMsg(error?.message || 'Could not load older posts.');
    } finally {
      setLoadingOlderPosts(false);
    }
  }

  useEffect(() => {
    if (!hasMorePosts || postsLoading || loadingOlderPosts || !['Posts', 'Photos', 'Timeline'].includes(activeTab)) return;
    const sentinel = postsSentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) void loadOlderPosts();
    }, { root: null, rootMargin: '700px 0px', threshold: 0 });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [activeTab, hasMorePosts, loadingOlderPosts, posts.length, postsLoading, profileOwnerId]);

  async function handlePostImageSelection(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []);
    e.target.value = '';
    if (!selected.length) return;
    const remaining = Math.max(0, 5 - postImages.length);
    if (!remaining) { setPostMsg('A post can contain up to 5 photos.'); return; }
    try {
      const compressed = await Promise.all(selected.slice(0, remaining).map(compressProfileImage));
      setPostImages(current => [...current, ...compressed].slice(0, 5));
      setPostImagePreviews(current => [...current, ...compressed.map(file => URL.createObjectURL(file))].slice(0, 5));
      setPostMsg('');
    } catch (error: any) {
      setPostMsg(error.message || 'Could not prepare these photos.');
    }
  }

  function removeDraftImage(index: number) {
    setPostImages(current => current.filter((_, i) => i !== index));
    setPostImagePreviews(current => { const removed = current[index]; if (removed) URL.revokeObjectURL(removed); return current.filter((_, i) => i !== index); });
  }

  async function publishPost() {
    if (posting || (!postText.trim() && postImages.length === 0)) return;
    setPosting(true);
    setPostMsg('');
    const uploadedPaths: string[] = [];
    try {
      // Upload all selected post photos concurrently so publishing does not
      // wait through a separate 30-second upload window for each image.
      const uploads = await Promise.all(postImages.map(file => uploadProfilePhoto(file, 'post')));
      for (const { photo, error } of uploads) {
        if (error || !photo) throw new Error(error || 'A photo could not be uploaded.');
        uploadedPaths.push(`${user.id}/${photo.name}`);
      }
      const { post, error } = await createProfilePost(postText, uploadedPaths);
      if (error || !post) throw new Error(error || 'Post was not published.');
      setPosts(current => [{ ...post, is_private: post.is_private ?? false, reactions: post.reactions || [], comments: post.comments || [] }, ...current]);
      setHasMorePosts(current => current);
      setPostText('');
      setPostImages([]);
      postImagePreviews.forEach(url => URL.revokeObjectURL(url));
      setPostImagePreviews([]);
      // Return to the profile as soon as the post row is saved. Gallery refresh
      // is optional and must never keep the publish overlay/spinner alive.
      setPostPreviewOpen(false);
      setPostMsg('Post published.');
      void getProfilePhotos(profileOwnerId).then(({ photos }) => {
        if (photos) setProfilePhotos(photos);
      }).catch(() => {});
    } catch (error: any) {
      void Promise.all(uploadedPaths.map(path => deleteProfilePhoto(path.replace(`${user.id}/`, '')))).catch(() => {});
      setPostMsg(error.message || 'Could not publish post.');
    } finally {
      setPosting(false);
    }
  }

  async function removePost(post: ChatPost) {
    if (!window.confirm('Delete this post?')) return;
    // If this post currently supplies the profile or cover image, clear that
    // profile reference before deleting its Storage object. Restore it if the
    // post deletion fails so the header never points at a missing file.
    const encodedPath = (path: string) => path.split('/').map(encodeURIComponent).join('/');
    const slotsToClear: { slot: 'avatar' | 'cover'; url: string }[] = [];
    if ((post.image_paths || []).some(path => avatarUrl.includes(encodedPath(path)))) slotsToClear.push({ slot: 'avatar', url: avatarUrl });
    if ((post.image_paths || []).some(path => coverUrl.includes(encodedPath(path)))) slotsToClear.push({ slot: 'cover', url: coverUrl });
    const cleared: typeof slotsToClear = [];
    for (const item of slotsToClear) {
      const { error } = await updateChatProfilePhoto(item.slot, '');
      if (error) {
        for (const previous of cleared) await updateChatProfilePhoto(previous.slot, previous.url);
        setPostMsg(error);
        return;
      }
      cleared.push(item);
    }
    const { error } = await deleteProfilePost(post.id);
    if (error) {
      for (const item of cleared) await updateChatProfilePhoto(item.slot, item.url);
      setPostMsg(error);
    } else {
      if (cleared.some(item => item.slot === 'avatar')) setAvatarUrl('');
      if (cleared.some(item => item.slot === 'cover')) setCoverUrl('');
      setPosts(current => current.filter(item => item.id !== post.id));
    }
  }

  async function editPost(post: ChatPost) {
    const next = window.prompt('Edit your post caption (max 500 characters):', post.content || '');
    if (next === null) return;
    const { error } = await updateProfilePost(post.id, next);
    if (error) { setPostActionMsg(error); return; }
    setPosts(current => current.map(item => item.id === post.id ? { ...item, content: next.trim() } : item));
    setOpenPostMenu(null);
    setPostActionMsg('Post updated.');
  }

  async function togglePostPrivacy(post: ChatPost) {
    if (privacySavingPostId) return;
    const nextPrivate = !post.is_private;
    setPrivacySavingPostId(post.id);
    setPostPrivacyMsg(null);
    try {
      const { error } = await setProfilePostPrivacy(post.id, nextPrivate);
      if (error) {
        setPostPrivacyMsg({ id: post.id, text: error, error: true });
        return;
      }
      setPosts(current => current.map(item => item.id === post.id ? { ...item, is_private: nextPrivate } : item));
      setOpenPostMenu(null);
      setPostPrivacyMsg({ id: post.id, text: nextPrivate ? 'This post is now private. Only you can see it.' : 'This post is now public.', error: false });
    } catch (error: any) {
      setPostPrivacyMsg({ id: post.id, text: error?.message || 'Could not change post privacy. Please try again.', error: true });
    } finally {
      setPrivacySavingPostId(null);
    }
  }

  async function reactToPost(post: ChatPost, reaction: ChatPost['reactions'][number]['reaction'] = 'like') {
    const mine = post.reactions.find(item => item.user_id === user?.id);
    const next = mine?.reaction === reaction ? null : reaction;
    const { error } = await setProfilePostReaction(post.id, next);
    if (error) { setPostActionMsg(error); return; }
    const updateReaction = (item: ChatPost): ChatPost => {
      if (item.id !== post.id) return item;
      const withoutMine = item.reactions.filter(row => row.user_id !== user?.id);
      return { ...item, reactions: next ? [...withoutMine, { post_id: post.id, user_id: user.id, reaction: next }] : withoutMine };
    };
    setPosts(current => current.map(updateReaction));
    setSelectedPost(current => current?.id === post.id ? updateReaction(current) : current);
  }

  async function reactToComment(postId: string, comment: ChatPost['comments'][number], reaction: ChatPost['comments'][number]['reactions'][number]['reaction']) {
    const mine = comment.reactions.find(item => item.user_id === user?.id);
    const next = mine?.reaction === reaction ? null : reaction;
    const { error } = await setProfileCommentReaction(comment.id, next);
    if (error) { setPostActionMsg(error); return; }
    const updateComment = (item: ChatPost): ChatPost => item.id !== postId ? item : {
      ...item,
      comments: item.comments.map(row => row.id !== comment.id ? row : {
        ...row,
        reactions: [...row.reactions.filter(entry => entry.user_id !== user?.id), ...(next ? [{ comment_id: comment.id, user_id: user.id, reaction: next }] : [])],
      }),
    };
    setPosts(current => current.map(updateComment));
    setSelectedPost(current => current ? updateComment(current) : current);
  }

  async function submitPostComment(postId: string) {
    const content = (commentDrafts[postId] || '').trim();
    if (!content) return;
    const { comment, error } = await addProfilePostComment(postId, content);
    if (error || !comment) { setPostActionMsg(error || 'Comment was not saved.'); return; }
    const enrichedComment = { ...comment, author_name: displayName || 'Anonymous', author_avatar: avatarUrl || '', reactions: [] };
    setPosts(current => current.map(item => item.id === postId ? { ...item, comments: [...item.comments, enrichedComment] } : item));
    setSelectedPost(current => current?.id === postId ? { ...current, comments: [...current.comments, enrichedComment] } : current);
    setCommentDrafts(current => ({ ...current, [postId]: '' }));
    setPostActionMsg('');
  }

  function renderPosts(canPublish: boolean, authorName: string, authorAvatar: string, photosOnly = false) {
    const canPreview = Boolean(postText.trim() || postImages.length);
    const visiblePosts = photosOnly ? posts.filter(post => (post.image_paths || []).length > 0) : posts;
    return (
      <div className="profile-section" style={{ ...s.card, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '18px 0 12px' }}>
          <h2 style={{ ...s.cardTitle, marginBottom: 14 }}>{photosOnly ? 'Photo posts' : 'Posts'}</h2>
          {canPublish && !photosOnly && (
            <div style={{ background: 'transparent', border: 0, borderBottom: '1px solid rgba(255,255,255,.08)', borderRadius: 0, padding: '0 0 16px', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                {authorAvatar ? <img src={authorAvatar} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} /> : <div style={s.friendAvatar}>{(authorName || 'A')[0].toUpperCase()}</div>}
                <div><strong style={{ color: '#f5f5f5', fontSize: 13 }}>{authorName || 'Anonymous'}</strong><div style={{ color: '#777', fontSize: 11 }}>Share an update with everyone</div></div>
              </div>
              <textarea value={postText} onChange={e => setPostText(e.target.value.slice(0, 500))} maxLength={500}
                placeholder="What's on your mind?" style={{ ...s.textarea, minHeight: 90, marginBottom: 10, background: '#1d1d1d', borderRadius: 11 }} />
              {postImages.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: postImages.length === 1 ? '1fr' : 'repeat(2,minmax(0,1fr))', gridTemplateRows: postImages.length === 3 ? 'repeat(2,minmax(0,1fr))' : undefined, aspectRatio: postImages.length === 3 ? '2 / 1' : undefined, gap: 7, marginBottom: 12 }}>
                {postImages.map((file, index) => <div key={index} style={{ position: 'relative', aspectRatio: postImages.length === 1 ? '16/10' : postImages.length === 3 && index > 0 ? '2/1' : '1', gridRow: postImages.length === 3 && index === 0 ? 'span 2' : undefined, borderRadius: 9, overflow: 'hidden', background: '#111' }}>
                  <img src={postImagePreviews[index]} alt={`Selected photo ${index + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button type="button" onClick={() => removeDraftImage(index)} aria-label="Remove selected photo" style={{ position: 'absolute', top: 7, right: 7, width: 28, height: 28, border: 0, borderRadius: 20, color: '#fff', background: 'rgba(0,0,0,.75)', cursor: 'pointer' }}>×</button>
                </div>)}
              </div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderTop: '1px solid rgba(255,255,255,.07)', paddingTop: 10 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button type="button" onClick={() => postImagesInputRef.current?.click()} disabled={postImages.length >= 5 || posting} style={{ border: 0, borderRadius: 9, padding: '9px 11px', background: 'rgba(108,99,255,.16)', color: '#b7b2ff', cursor: 'pointer', fontSize: 12 }}>＋ Photo {postImages.length ? `(${postImages.length}/5)` : ''}</button>
                  <span style={{ color: '#777', fontSize: 10 }}>Max 5 photos · 200 KB each</span>
                </div>
                <span style={{ color: '#777', fontSize: 11 }}>{postText.length}/500</span>
              </div>
              <input ref={postImagesInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" multiple onChange={handlePostImageSelection} style={s.hiddenInput} />
              <button type="button" onClick={() => setPostPreviewOpen(true)} disabled={!canPreview || posting} style={{ ...s.saveBtn, marginTop: 12, opacity: !canPreview || posting ? .45 : 1 }}>Preview post</button>
            </div>
          )}
          {postMsg && <p role="status" style={{ color: postMsg === 'Post published.' ? '#71cf8a' : '#f0a0a0', fontSize: 12, margin: '8px 0' }}>{postMsg}</p>}
          {postsLoading ? <p style={{ color: '#777', fontSize: 13 }}>Loading posts...</p> :
            visiblePosts.length === 0 ? <p style={{ color: '#777', fontSize: 13 }}>{photosOnly ? 'No photo posts yet.' : canPublish ? 'No posts yet. Share your first update!' : 'No posts yet.'}</p> : null}
        </div>
        {visiblePosts.map(post => (
          <article key={post.id} onClick={e => { if (!(e.target as HTMLElement).closest('button,input,textarea,form,a,[role="button"]')) setSelectedPost(post); }} style={{ padding: '18px 0 20px', borderTop: '1px solid rgba(255,255,255,.07)', cursor: 'zoom-in' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              {authorAvatar ? <img src={authorAvatar} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} /> : <div style={s.friendAvatar}>{(authorName || 'A')[0].toUpperCase()}</div>}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ color: '#eee', fontSize: 14, fontWeight: 650 }}>{authorName || 'Anonymous'}</div>
                <div style={{ color: '#777', fontSize: 11 }}>{new Date(post.created_at).toLocaleString()}</div>
              </div>
              <div ref={openPostMenu === post.id ? postMenuRef : null} style={{ position: 'relative' }}>
                {post.is_private && <span title="Only you can see this post" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#fff', background: 'rgba(145,112,255,.2)', border: '1px solid rgba(170,145,255,.55)', borderRadius: 20, padding: '5px 10px', marginRight: 7, fontSize: 11, fontWeight: 750, whiteSpace: 'nowrap' }}>🔒 PRIVATE · ONLY YOU</span>}
                {canPublish && <button type="button" onClick={() => setOpenPostMenu(current => current === post.id ? null : post.id)} aria-label="Post options" aria-expanded={openPostMenu === post.id} style={{ border: 0, background: 'transparent', color: '#bbb', fontSize: 23, lineHeight: 1, cursor: 'pointer', padding: '4px 8px' }}>⋯</button>}
                {canPublish && openPostMenu === post.id && <div style={{ position: 'absolute', right: 0, top: 34, zIndex: 20, minWidth: 170, padding: 6, borderRadius: 10, background: '#303030', border: '1px solid rgba(255,255,255,.12)', boxShadow: '0 8px 24px rgba(0,0,0,.4)' }}>
                  <button type="button" onClick={() => editPost(post)} style={{ display: 'block', width: '100%', padding: '10px 12px', textAlign: 'left', border: 0, borderRadius: 6, background: 'transparent', color: '#eee', cursor: 'pointer' }}>Edit post</button>
                  <button type="button" disabled={privacySavingPostId === post.id} onClick={e => { e.preventDefault(); e.stopPropagation(); void togglePostPrivacy(post); }} style={{ display: 'block', width: '100%', padding: '10px 12px', textAlign: 'left', border: 0, borderRadius: 6, background: privacySavingPostId === post.id ? 'rgba(255,255,255,.08)' : 'transparent', color: '#eee', cursor: privacySavingPostId === post.id ? 'wait' : 'pointer', opacity: privacySavingPostId === post.id ? .7 : 1 }}>{privacySavingPostId === post.id ? 'Saving…' : post.is_private ? 'Make public' : 'Make private'}</button>
                  <button type="button" onClick={() => { setOpenPostMenu(null); removePost(post); }} style={{ display: 'block', width: '100%', padding: '10px 12px', textAlign: 'left', border: 0, borderRadius: 6, background: 'transparent', color: '#ff9292', cursor: 'pointer' }}>Delete post</button>
                </div>}
              </div>
            </div>
            {postPrivacyMsg?.id === post.id && <p role="status" aria-live="polite" style={{ color: postPrivacyMsg.error ? '#ff9b9b' : '#80d99a', fontSize: 12, lineHeight: 1.4, margin: '0 0 10px' }}>{postPrivacyMsg.text}</p>}
            {post.content && <p style={{ color: '#e5e5e5', fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: '0 0 12px' }}>{post.content}</p>}
            {(post.image_paths || []).length > 0 && <div style={{ display: 'grid', gridTemplateColumns: post.image_paths.length === 1 ? '1fr' : 'repeat(2,minmax(0,1fr))', gridTemplateRows: post.image_paths.length >= 3 ? 'repeat(2,minmax(0,1fr))' : undefined, aspectRatio: post.image_paths.length === 1 ? '16/10' : post.image_paths.length >= 3 ? '2 / 1' : undefined, gap: 4, overflow: 'hidden', borderRadius: 10 }}>
              {post.image_paths.slice(0, 3).map((path, index) => <div key={path} style={{ position: 'relative', minWidth: 0, minHeight: 0, overflow: 'hidden', background: '#111', gridRow: post.image_paths.length >= 3 && index === 0 ? 'span 2' : undefined }}><img src={`https://btkcubibosbtpxcronnd.supabase.co/storage/v1/object/public/profile-photos/${path.split('/').map(encodeURIComponent).join('/')}`} alt={`Post photo ${index + 1}`} loading="lazy" style={{ display: 'block', width: '100%', height: '100%', minHeight: 0, aspectRatio: post.image_paths.length === 1 ? '16/10' : undefined, objectFit: 'cover', background: '#111' }} />{index === 2 && post.image_paths.length > 3 && <div aria-label={`${post.image_paths.length - 3} more photos`} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.58)', color: '#fff', fontSize: 'clamp(24px, 5vw, 38px)', fontWeight: 750 }}>+{post.image_paths.length - 3}</div>}</div>)}
            </div>}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '12px 2px 8px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
              <div style={{ color: '#999', fontSize: 11 }}>
                {post.reactions.length > 0 ? `👍 ${post.reactions.length} reaction${post.reactions.length === 1 ? '' : 's'}` : 'Be the first to react'}
                {post.comments.length > 0 ? ` · ${post.comments.length} comment${post.comments.length === 1 ? '' : 's'}` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <button type="button" onClick={() => setOpenReactionPicker(current => current === post.id ? null : post.id)} style={{ width: '100%', border: 0, background: 'transparent', color: post.reactions.some(item => item.user_id === user?.id) ? '#76aaff' : '#bbb', fontWeight: 650, padding: 8, cursor: 'pointer' }}>
                  {(() => { const mine = post.reactions.find(item => item.user_id === user?.id); const labels: Record<string,string> = { like: '👍 Like', love: '❤️ Love', haha: '😂 Haha', wow: '😮 Wow', sad: '😢 Sad', angry: '😡 Angry' }; return mine ? labels[mine.reaction] : '👍 Like'; })()}
                </button>
                {openReactionPicker === post.id && <div style={{ position: 'absolute', bottom: '100%', left: 0, zIndex: 30, display: 'flex', gap: 5, padding: 8, borderRadius: 24, background: '#303030', border: '1px solid rgba(255,255,255,.14)', boxShadow: '0 8px 24px rgba(0,0,0,.4)' }}>
                  {([{ value: 'like', emoji: '👍', label: 'Like' }, { value: 'love', emoji: '❤️', label: 'Love' }, { value: 'haha', emoji: '😂', label: 'Haha' }, { value: 'wow', emoji: '😮', label: 'Wow' }, { value: 'sad', emoji: '😢', label: 'Sad' }, { value: 'angry', emoji: '😡', label: 'Angry' }] as const).map(option => <button key={option.value} type="button" title={option.label} aria-label={option.label} onClick={() => { reactToPost(post, option.value); setOpenReactionPicker(null); }} style={{ border: 0, background: 'transparent', padding: 4, fontSize: 21, cursor: 'pointer' }}>{option.emoji}</button>)}
                </div>}
              </div>
              <button type="button" onClick={() => { setSelectedPost(post); setOpenReactionPicker(null); }} style={{ flex: 1, border: 0, background: 'transparent', color: '#bbb', fontWeight: 600, padding: 8, cursor: 'pointer' }}>💬 Comments{post.comments.length ? ` (${post.comments.length})` : ''}</button>
            </div>
          </article>
        ))}
        <div ref={postsSentinelRef} aria-hidden="true" style={{ height: 1 }} />
        {loadingOlderPosts && <p role="status" aria-live="polite" style={{ color: '#888', fontSize: 12, textAlign: 'center', padding: '14px 0' }}>Loading older posts…</p>}
        {!hasMorePosts && visiblePosts.length > 0 && <p style={{ color: '#666', fontSize: 11, textAlign: 'center', padding: '14px 0', margin: 0 }}>You’re all caught up.</p>}

        {postPreviewOpen && <div role="presentation" onClick={() => !posting && setPostPreviewOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <section role="dialog" aria-modal="true" aria-labelledby="post-preview-title" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', background: '#202020', border: '1px solid rgba(255,255,255,.1)', borderRadius: 16, padding: 18, boxShadow: '0 20px 70px rgba(0,0,0,.55)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
              <h3 id="post-preview-title" style={{ color: '#fff', fontSize: 17, margin: 0 }}>Preview your post</h3>
              <button type="button" onClick={() => setPostPreviewOpen(false)} disabled={posting} style={{ border: 0, background: 'transparent', color: '#aaa', fontSize: 24, cursor: 'pointer' }}>×</button>
            </div>
            <article style={{ background: '#171717', borderRadius: 12, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                {authorAvatar ? <img src={authorAvatar} alt="" style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover' }} /> : <div style={s.friendAvatar}>{(authorName || 'A')[0].toUpperCase()}</div>}
                <strong style={{ color: '#eee', fontSize: 13 }}>{authorName || 'Anonymous'}</strong>
              </div>
              {postText.trim() && <p style={{ color: '#e5e5e5', fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-wrap', margin: '0 0 12px' }}>{postText.trim()}</p>}
              {postImages.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: postImages.length === 1 ? '1fr' : 'repeat(2,minmax(0,1fr))', gridTemplateRows: postImages.length >= 3 ? 'repeat(2,minmax(0,1fr))' : undefined, aspectRatio: postImages.length === 1 ? '16/10' : postImages.length >= 3 ? '2 / 1' : undefined, gap: 4, borderRadius: 9, overflow: 'hidden' }}>
                {postImages.slice(0, 3).map((file, index) => <div key={index} style={{ position: 'relative', minWidth: 0, minHeight: 0, overflow: 'hidden', gridRow: postImages.length >= 3 && index === 0 ? 'span 2' : undefined }}><img src={postImagePreviews[index]} alt={`Preview photo ${index + 1}`} style={{ display: 'block', width: '100%', height: '100%', minHeight: 0, aspectRatio: postImages.length === 1 ? '16/10' : undefined, objectFit: 'cover' }} />{index === 2 && postImages.length > 3 && <div aria-label={`${postImages.length - 3} more photos`} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.58)', color: '#fff', fontSize: 32, fontWeight: 750 }}>+{postImages.length - 3}</div>}</div>)}
              </div>}
            </article>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button type="button" onClick={() => setPostPreviewOpen(false)} disabled={posting} style={{ flex: 1, border: '1px solid rgba(255,255,255,.12)', borderRadius: 10, padding: 12, background: '#303030', color: '#ddd', cursor: 'pointer' }}>Edit</button>
              <button type="button" onClick={publishPost} disabled={posting} style={{ ...s.saveBtn, flex: 1, marginTop: 0, opacity: posting ? .6 : 1 }}>{posting ? 'Publishing…' : 'Publish post'}</button>
            </div>
          </section>
        </div>}
      </div>
    );
  }

  useEffect(() => {
    if (!isViewingOther) { setViewedUser(null); return; }
    setLoadingViewed(true);
    getUserProfile(viewUserId).then(({ profile }) => {
      if (profile) setViewedUser({ name: profile.display_name || 'User', bio: profile.bio || '', avatar: profile.avatar_url || '', cover: profile.cover_url || '', work: profile.work || '', education: profile.education || '', shareDetails: profile.share_details !== false });
      setLoadingViewed(false);
    });
  }, [viewUserId, user?.id]);

  async function saveProfilePhoto(file: File, slot: 'avatar' | 'cover', onStage?: (stage: string) => void) {
    // Profile and cover changes are ordinary photo posts. The post's image
    // path is the canonical file used by both the profile header and Photos tab.
    const uploadFile = file.type === 'image/webp' && file.size > 0 && file.size <= 200 * 1024
      ? file
      : await compressProfileImage(file);
    onStage?.('Uploading photo…');
    const { photo, error } = await uploadProfilePhoto(uploadFile, 'post');
    if (error || !photo) throw new Error(error || 'Photo upload failed.');
    const imagePath = `${user.id}/${photo.name}`;
    let createdPost: ChatPost | undefined;
    try {
      onStage?.('Creating photo post…');
      const caption = slot === 'avatar' ? 'Updated their profile picture.' : 'Updated their cover photo.';
      const { post, error: postError } = await createProfilePost(caption, [imagePath]);
      if (postError || !post) throw new Error(postError || 'Photo post was not saved.');
      createdPost = post;
      const photoUrl = `${photo.url}?v=${Date.now()}`;
      onStage?.('Updating profile…');
      const { error: profileError } = await updateChatProfilePhoto(slot, photoUrl);
      if (profileError) throw new Error(profileError);
      if (slot === 'avatar') {
        setAvatarUrl(photoUrl);
        try { window.localStorage.removeItem('profile_avatar'); } catch {}
      } else {
        setCoverUrl(photoUrl);
        try { window.localStorage.removeItem('profile_cover'); } catch {}
      }
      // Publish locally as soon as the profile update succeeds. Do not make
      // closing the crop dialog depend on a second Posts-tab network request.
      setPosts(current => [createdPost!, ...current.filter(item => item.id !== createdPost!.id)]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
      setMsg(slot === 'avatar' ? 'Profile picture saved and posted.' : 'Cover photo saved and posted.');
      onStage?.('Photo post saved.');

      // Hydrate reactions/comments in the background. A slow feed refresh must
      // never keep the avatar/cover uploader in its saving state.
      void getProfilePosts(profileOwnerId, undefined, 20).then(refreshed => {
        const authoritativePost = refreshed.posts?.find(item => item.id === createdPost!.id);
        if (!authoritativePost) return;
        setPosts(current => {
          const merged = new Map<string, ChatPost>();
          for (const item of [authoritativePost, ...current]) merged.set(item.id, item);
          return Array.from(merged.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        });
      }).catch(() => {});
      void getProfilePhotos(profileOwnerId).then(({ photos }) => {
        if (photos) setProfilePhotos(photos);
      }).catch(() => {});
    } catch (error) {
      // Once the image post exists, keep it. A later avatar/cover profile-row
      // failure must not erase the successfully uploaded photo from Photos.
      // Only remove the orphaned Storage object when post creation failed.
      if (!createdPost) void deleteProfilePhoto(photo.name).catch(() => {});
      throw error;
    }
  }

  function openAvatarEditor(file: File) {
    if (avatarEditDraft?.url) URL.revokeObjectURL(avatarEditDraft.url);
    setAvatarCropZoom(1);
    setAvatarEditDraft({ file, url: URL.createObjectURL(file) });
  }

  function closeAvatarEditor() {
    if (avatarEditDraft?.url) URL.revokeObjectURL(avatarEditDraft.url);
    setAvatarEditDraft(null);
    setAvatarCropZoom(1);
  }

  async function saveAvatarCrop() {
    if (!avatarEditDraft || uploadingAvatar) return;
    setUploadingAvatar(true);
    setAvatarSaveStage('Preparing image…');
    setMsg('');
    try {
      const cropped = await createSquareAvatarCrop(avatarEditDraft.file, avatarCropZoom, setAvatarSaveStage);
      await saveProfilePhoto(cropped, 'avatar', setAvatarSaveStage);
      closeAvatarEditor();
    } catch (error: any) {
      setAvatarSaveStage('Save stopped');
      setMsg(error.message || 'Could not save this profile picture.');
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setMsg('');
    openAvatarEditor(file);
  }

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingCover(true);
    setMsg('');
    try {
      await saveProfilePhoto(file, 'cover');
    } catch (error: any) {
      setMsg(error.message || 'Could not save this cover photo.');
    } finally {
      setUploadingCover(false);
    }
  }

  async function handleGalleryUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingGallery(true);
    setMsg('');
    let uploadedName = '';
    try {
      // Adding a photo to the gallery creates a normal image-only post.
      // Photos is a projection of post images, never a second storage record.
      const prepared = await compressProfileImage(file);
      const { photo, error: uploadError } = await uploadProfilePhoto(prepared, 'post');
      if (uploadError || !photo) throw new Error(uploadError || 'Photo upload failed.');
      uploadedName = photo.name;
      const imagePath = `${user.id}/${photo.name}`;
      const { post, error: postError } = await createProfilePost('', [imagePath]);
      if (postError || !post) throw new Error(postError || 'Photo post was not saved.');
      setPosts(current => [post, ...current.filter(item => item.id !== post.id)].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
      setMsg('Photo added to your posts and gallery.');
    } catch (error: any) {
      if (uploadedName) await deleteProfilePhoto(uploadedName).catch(() => {});
      setMsg(error.message || 'Failed to upload photo.');
    } finally {
      setUploadingGallery(false);
    }
  }

  async function useGalleryPhoto(photo: ProfilePhoto, slot: 'avatar' | 'cover') {
    try {
      const response = await fetch(photo.url);
      if (!response.ok) throw new Error('Could not open this gallery photo.');
      const blob = await response.blob();
      const file = new File([blob], photo.name.split('/').pop() || 'gallery-photo.webp', { type: blob.type || 'image/webp' });
      if (slot === 'avatar') openAvatarEditor(file);
      else await saveProfilePhoto(file, 'cover');
    } catch (error: any) {
      setMsg(error.message || 'Could not use this photo.');
    }
  }

  async function handleDeletePhoto(photo: ProfilePhoto) {
    if (!window.confirm('Delete this photo?')) return;
    let postImageRemoved = false;
    if (photo.name.startsWith('posts/')) {
      const matchingPost = posts.find(post => (post.image_paths || []).includes(`${user.id}/${photo.name}`));
      if (matchingPost) {
        const imagePath = `${user.id}/${photo.name}`;
        const encodedPath = imagePath.split('/').map(encodeURIComponent).join('/');
        const clearsAvatar = avatarUrl.includes(encodedPath);
        const clearsCover = coverUrl.includes(encodedPath);
        if (clearsAvatar) {
          const { error } = await updateChatProfilePhoto('avatar', '');
          if (error) { setMsg(error); return; }
        }
        if (clearsCover) {
          const { error } = await updateChatProfilePhoto('cover', '');
          if (error) {
            if (clearsAvatar) await updateChatProfilePhoto('avatar', avatarUrl);
            setMsg(error);
            return;
          }
        }
        const { error } = await removeProfilePostImage(matchingPost.id, imagePath);
        if (error) {
          if (clearsAvatar) await updateChatProfilePhoto('avatar', avatarUrl);
          if (clearsCover) await updateChatProfilePhoto('cover', coverUrl);
          setMsg(error);
          return;
        }
        if (clearsAvatar) setAvatarUrl('');
        if (clearsCover) setCoverUrl('');
        setPosts(current => current.map(post => post.id === matchingPost.id ? { ...post, image_paths: (post.image_paths || []).filter(path => path !== imagePath) } : post));
        postImageRemoved = true;
      }
    }
    if (photo.name === 'avatar.webp' || photo.name === 'cover.webp') {
      const nextAvatar = photo.name === 'avatar.webp' ? '' : avatarUrl;
      const nextCover = photo.name === 'cover.webp' ? '' : coverUrl;
      const { error: profileError } = await upsertChatProfile({
        display_name: displayName, bio, avatar_url: nextAvatar, cover_url: nextCover,
        share_name: shareName, share_bio: shareBio, work, education, share_details: shareDetails
      });
      if (profileError) { setMsg(profileError); return; }
      setAvatarUrl(nextAvatar);
      setCoverUrl(nextCover);
    }
    if (!postImageRemoved) {
      const { error } = await deleteProfilePhoto(photo.name);
      if (error) { setMsg(error); return; }
    }
    setProfilePhotos(current => current.filter(item => item.name !== photo.name));
    setMsg('Photo deleted.');
  }

  function renderProfileTabs(canEdit: boolean, authorName: string, authorAvatar: string) {
    const tabs: ('Posts' | 'Photos' | 'Timeline' | 'About')[] = ['Posts', 'Photos', 'Timeline', 'About'];
    const sidebarBio = canEdit ? bio : (viewedUser?.bio || '');
    const postGalleryPhotos = posts.flatMap(post => (post.image_paths || []).map(path => ({
      name: path.startsWith(`${profileOwnerId}/`) ? path.slice(profileOwnerId.length + 1) : path,
      url: `https://btkcubibosbtpxcronnd.supabase.co/storage/v1/object/public/profile-photos/${path.split('/').map(encodeURIComponent).join('/')}`,
      size: 0,
      post,
    })));
    const galleryPhotos = [
      ...postGalleryPhotos,
      ...profilePhotos.map(photo => ({ ...photo, post: null as ChatPost | null })),
    ];
    return (
      <>
        <div className="profile-content-area" style={s.contentArea}>
          <aside className="profile-sidebar" style={{ minWidth: 0 }}>
            <section className="profile-section" style={{ ...s.card, paddingBottom: 18, borderBottom: '1px solid rgba(255,255,255,.08)' }}>
              <h2 style={{ ...s.cardTitle, marginBottom: 10 }}>Intro</h2>
              <p style={{ color: '#ccc', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: 0 }}>{sidebarBio || 'No bio added yet.'}</p>
              {canEdit && <button type="button" onClick={() => setActiveTab('About')} style={{ marginTop: 12, border: 0, background: 'rgba(255,255,255,.08)', color: '#ddd', borderRadius: 7, padding: '8px 12px', fontSize: 12, fontWeight: 650, cursor: 'pointer' }}>Edit bio</button>}
            </section>
            <section className="profile-section" style={{ ...s.card, paddingTop: 18, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,.08)' }}>
              <h2 style={{ ...s.cardTitle, marginBottom: 10 }}>Profile details</h2>
              <p style={{ color: '#ccc', fontSize: 13, margin: '0 0 8px', overflowWrap: 'anywhere' }}>{authorName}</p>
              {(canEdit ? shareDetails : viewedUser?.shareDetails) && (canEdit ? work : viewedUser?.work) && <p style={{ color: '#aaa', fontSize: 13, lineHeight: 1.5, margin: '6px 0' }}><strong>Work</strong><br />{canEdit ? work : viewedUser?.work}</p>}
              {(canEdit ? shareDetails : viewedUser?.shareDetails) && (canEdit ? education : viewedUser?.education) && <p style={{ color: '#aaa', fontSize: 13, lineHeight: 1.5, margin: '6px 0' }}><strong>Education</strong><br />{canEdit ? education : viewedUser?.education}</p>}
              {canEdit && <button type="button" onClick={() => setActiveTab('About')} style={{ marginTop: 8, border: 0, background: 'rgba(255,255,255,.08)', color: '#ddd', borderRadius: 7, padding: '7px 10px', fontSize: 12, fontWeight: 650, cursor: 'pointer' }}>Edit details</button>}
            </section>
            <section className="profile-section" style={{ ...s.card, paddingTop: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
                <h2 style={{ ...s.cardTitle, margin: 0 }}>Photos</h2>
                <button type="button" onClick={() => setActiveTab('Photos')} style={{ border: 0, background: 'transparent', color: '#aaa4ff', fontSize: 11, fontWeight: 650, cursor: 'pointer' }}>See all</button>
              </div>
              {photosLoading ? <p style={{ color: '#777', fontSize: 12 }}>Loading photos…</p> :
                galleryPhotos.length === 0 ? <p style={{ color: '#777', fontSize: 12 }}>No photos yet.</p> :
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 5 }}>
                  {galleryPhotos.slice(0, 6).map((photo, index) => (
                    <button key={`${photo.post?.id || 'legacy'}:${photo.name}:${index}`} type="button" onClick={() => photo.post ? setSelectedPost(photo.post) : setSelectedPhoto({ url: photo.url, alt: 'Profile gallery photo' })} aria-label="Open original post or photo" style={{ display: 'block', width: '100%', aspectRatio: '1', padding: 0, border: 0, borderRadius: 6, overflow: 'hidden', background: '#292929', cursor: 'zoom-in' }}>
                      <img src={photo.url} alt="Profile gallery" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </button>
                  ))}
                </div>
              }
              {canEdit && <button type="button" disabled={uploadingGallery || galleryPhotos.length >= 25} onClick={() => galleryInputRef.current?.click()} style={{ marginTop: 10, width: '100%', border: 0, borderRadius: 7, padding: '9px 10px', background: 'rgba(108,99,255,.16)', color: '#c2bdff', fontSize: 12, fontWeight: 650, cursor: 'pointer', opacity: uploadingGallery || galleryPhotos.length >= 25 ? .5 : 1 }}>{uploadingGallery ? 'Uploading…' : '＋ Add photo'}</button>}
            </section>
          </aside>
          <main className="profile-main">
            <nav className="profile-tabs" aria-label="Profile sections" style={{ padding: '0 0 0', borderBottom: '1px solid rgba(255,255,255,.08)', background: document.documentElement.dataset.theme === 'light' ? '#f4f6fb' : '#161616' }}>
          {tabs.map(tab => (
            <button key={tab} type="button" onClick={() => setActiveTab(tab)} style={{
              background: 'transparent', border: 0, borderBottom: activeTab === tab ? '2px solid #7770ff' : '2px solid transparent',
              color: activeTab === tab ? (document.documentElement.dataset.theme === 'light' ? '#292d38' : '#fff') : (document.documentElement.dataset.theme === 'light' ? '#687080' : '#999'), padding: '13px 14px', fontSize: 13, fontWeight: 650, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0
            }}>{tab}</button>
          ))}
            </nav>
            <div className="profile-main-content">
              {activeTab === 'Posts' && renderPosts(canEdit, authorName, authorAvatar)}
          {activeTab === 'Photos' && (
            <>
            <section className="profile-section" style={s.card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
                <h2 style={{ ...s.cardTitle, margin: 0 }}>Photos</h2>
                {canEdit && <button type="button" disabled={uploadingGallery || profilePhotos.length >= 25} onClick={() => galleryInputRef.current?.click()} style={{ ...s.toggleBtn, background: '#39348a', color: '#fff', opacity: uploadingGallery || profilePhotos.length >= 25 ? .5 : 1 }}>{uploadingGallery ? 'Uploading…' : 'Add photo'}</button>}
              </div>
              {canEdit && <p style={{ color: '#777', fontSize: 11, margin: '0 0 12px' }}>{galleryPhotos.length}/25 photos · max 200 KB each · 5 MB total · WebP only</p>}
              {canEdit && msg && <p style={{ color: msg.includes('saved') || msg.includes('deleted') ? '#4caf50' : '#f44336', fontSize: 12 }}>{msg}</p>}
              {photosLoading || postsLoading ? <p style={{ color: '#777', fontSize: 13 }}>Loading photos…</p> :
                galleryPhotos.length === 0 ? <p style={{ color: '#777', fontSize: 13 }}>No photos yet.</p> :
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                  {galleryPhotos.map((photo, index) => (
                    <div key={`${photo.post?.id || 'legacy'}:${photo.name}:${index}`} style={{ position: 'relative', background: '#292929', borderRadius: 9 }}>
                      <button type="button" onClick={() => photo.post ? setSelectedPost(photo.post) : setSelectedPhoto({ url: photo.url, alt: 'Profile gallery photo' })} aria-label="Open original post or photo" style={{ display: 'block', width: '100%', aspectRatio: '1', padding: 0, border: 0, borderRadius: 9, overflow: 'hidden', background: 'transparent', cursor: 'zoom-in' }}><img src={photo.url} alt="Profile gallery" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></button>
                      {canEdit && <div style={{ position: 'absolute', top: 6, right: 6, zIndex: 4 }}>
                        <button type="button" aria-label="Photo options" aria-haspopup="menu" aria-expanded={openPhotoMenu === photo.name} onClick={event => {
                          if (openPhotoMenu === photo.name) { setOpenPhotoMenu(null); setPhotoMenuPosition(null); return; }
                          const rect = event.currentTarget.getBoundingClientRect();
                          const menuWidth = Math.min(208, window.innerWidth - 24);
                          const left = Math.max(12, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 12));
                          const menuHeight = 148;
                          const top = rect.bottom + menuHeight + 8 > window.innerHeight ? Math.max(12, rect.top - menuHeight - 8) : rect.bottom + 6;
                          setPhotoMenuPosition({ top, left });
                          setOpenPhotoMenu(photo.name);
                        }} style={{ width: 34, height: 34, border: '1px solid rgba(255,255,255,.22)', borderRadius: '50%', background: 'rgba(0,0,0,.82)', color: '#fff', fontSize: 23, lineHeight: 1, cursor: 'pointer', display: 'grid', placeItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,.35)' }}>⋯</button>
                      </div>}
                    </div>
                  ))}
                </div>
              }
            </section>
            <div ref={postsSentinelRef} aria-hidden="true" style={{ height: 1 }} />
            {loadingOlderPosts && <p role="status" aria-live="polite" style={{ color: '#888', fontSize: 12, textAlign: 'center', padding: '14px 0' }}>Loading older photos…</p>}
            </>
          )}
          {activeTab === 'Timeline' && (
            <>
              {canEdit && <section style={s.card}>
                <h2 style={s.cardTitle}>Recent Live activity</h2>
                {recent.length === 0 ? <p style={{ color: '#777', fontSize: 13 }}>No recent interactions yet.</p> :
                  recent.map((entry, index) => <div key={entry.id || index} style={{ color: '#aaa', fontSize: 13, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,.05)' }}>Connected with {entry.name || 'someone'} · {new Date(entry.time).toLocaleDateString()}</div>)}
              </section>}
              {renderPosts(false, authorName, authorAvatar)}
            </>
          )}
          {activeTab === 'About' && (canEdit ? (
            <div className="profile-section" style={s.card}>
              <h2 style={s.cardTitle}>About</h2>
              <form onSubmit={handleSave}>
                <label style={s.label}>Display Name {displayName !== 'Anonymous' && displayName !== '' && <span style={{ color: '#666', fontSize: 12, fontWeight: 400 }}>(locked — set at signup)</span>}</label>
                <input style={{ ...s.input, opacity: displayName !== 'Anonymous' && displayName !== '' ? 0.6 : 1, cursor: displayName !== 'Anonymous' && displayName !== '' ? 'not-allowed' : 'text' }} value={displayName} readOnly={displayName !== 'Anonymous' && displayName !== ''} onChange={e => setDisplayName(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 9))} maxLength={9} placeholder="e.g. CoolUser1" />
                <label style={s.label}>Bio</label>
                <textarea style={s.textarea} value={bio} onChange={e => setBio(e.target.value)} maxLength={200} placeholder="Tell people about yourself..." />
                <h3 style={{ ...s.cardTitle, marginTop: 10, marginBottom: 12 }}>Work & Education</h3>
                <label style={s.label}>Work</label>
                <input style={s.input} value={work} onChange={e => setWork(e.target.value)} maxLength={120} placeholder="e.g. Designer at ABC Studio" />
                <label style={s.label}>Education</label>
                <input style={s.input} value={education} onChange={e => setEducation(e.target.value)} maxLength={120} placeholder="e.g. University · Course or degree" />
                <div style={s.toggleRow}><span style={s.toggleLabel}>Show work and education on my profile</span><button type="button" style={{ ...s.toggleBtn, background: shareDetails ? '#4caf50' : '#444', color: '#fff' }} onClick={() => setShareDetails(!shareDetails)}>{shareDetails ? 'ON' : 'OFF'}</button></div>
                <div style={s.toggleRow}><span style={s.toggleLabel}>Show name to partner</span><button type="button" style={{ ...s.toggleBtn, background: shareName ? '#4caf50' : '#444', color: '#fff' }} onClick={() => setShareName(!shareName)}>{shareName ? 'ON' : 'OFF'}</button></div>
                <div style={s.toggleRow}><span style={s.toggleLabel}>Show bio to partner</span><button type="button" style={{ ...s.toggleBtn, background: shareBio ? '#4caf50' : '#444', color: '#fff' }} onClick={() => setShareBio(!shareBio)}>{shareBio ? 'ON' : 'OFF'}</button></div>
                <button type="submit" disabled={saving} style={{ ...s.saveBtn, opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving...' : 'Save Changes'}</button>
              </form>
              {msg && <p style={{ ...s.msg, color: msg === 'Saved!' || msg === 'Photo saved.' || msg === 'Photo deleted.' ? '#4caf50' : '#f44336' }}>{msg}</p>}
            </div>
          ) : (
            <section style={s.card}>
              <h2 style={s.cardTitle}>About</h2>
              <p style={{ color: '#ccc', fontSize: 14, whiteSpace: 'pre-wrap' }}>{viewedUser?.bio || 'No bio added.'}</p>
              {viewedUser?.shareDetails && <div style={{ marginTop: 18 }}>
                {viewedUser.work && <p style={{ color: '#ccc', fontSize: 13, margin: '8px 0' }}><strong>Work:</strong> {viewedUser.work}</p>}
                {viewedUser.education && <p style={{ color: '#ccc', fontSize: 13, margin: '8px 0' }}><strong>Education:</strong> {viewedUser.education}</p>}
              </div>}
            </section>
          ))}
{selectedPost && <div role="presentation" onClick={() => setSelectedPost(null)} style={{ position: 'fixed', inset: 0, zIndex: 1500, background: 'rgba(0,0,0,.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14 }}>
          <section role="dialog" aria-modal="true" aria-label="Expanded post" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 760, maxHeight: '92vh', overflowY: 'auto', background: '#202020', border: '1px solid rgba(255,255,255,.12)', borderRadius: 16, boxShadow: '0 18px 60px rgba(0,0,0,.6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,.08)' }}><strong style={{ color: '#fff' }}>Comments</strong><button type="button" onClick={() => setSelectedPost(null)} aria-label="Close expanded post" style={{ border: 0, borderRadius: 20, background: '#383838', color: '#fff', width: 34, height: 34, fontSize: 22, cursor: 'pointer' }}>×</button></div>
            <div style={{ padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                {authorAvatar ? <img src={authorAvatar} alt="" style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover' }} /> : <div style={s.friendAvatar}>{(authorName || 'A')[0].toUpperCase()}</div>}
                <div style={{ minWidth: 0, flex: 1 }}><div style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>{authorName || 'Anonymous'}</div><div style={{ color: '#888', fontSize: 11 }}>{new Date(selectedPost.created_at).toLocaleString()}</div></div>
                {selectedPost.is_private && <span style={{ color: '#c9baff', fontSize: 10, fontWeight: 700 }}>🔒 PRIVATE</span>}
              </div>
              {selectedPost.content && <p style={{ color: '#eee', fontSize: 15, lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: '0 0 14px' }}>{selectedPost.content}</p>}
              {(selectedPost.image_paths || []).map((path, index) => <img key={path} src={`https://btkcubibosbtpxcronnd.supabase.co/storage/v1/object/public/profile-photos/${path.split('/').map(encodeURIComponent).join('/')}`} alt={`Post photo ${index + 1}`} style={{ display: 'block', width: '100%', maxHeight: '70vh', objectFit: 'contain', margin: '0 auto 10px', borderRadius: 8 }} />)}
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#aaa', fontSize: 12, padding: '12px 0 9px', borderBottom: '1px solid rgba(255,255,255,.08)' }}><span>{selectedPost.reactions.length} reactions</span><span>{selectedPost.comments.length} comments</span></div>
              <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid rgba(255,255,255,.08)', padding: '8px 0' }}>
                <button type="button" onClick={() => setOpenReactionPicker(current => current === selectedPost.id ? null : selectedPost.id)} style={{ flex: 1, border: 0, background: 'transparent', color: selectedPost.reactions.some(item => item.user_id === user?.id) ? '#76aaff' : '#bbb', fontWeight: 650, padding: 9, cursor: 'pointer' }}>{(() => { const mine = selectedPost.reactions.find(item => item.user_id === user?.id); const labels: Record<string,string> = { like: '👍 Like', love: '❤️ Love', haha: '😂 Haha', wow: '😮 Wow', sad: '😢 Sad', angry: '😡 Angry' }; return mine ? labels[mine.reaction] : '👍 Like'; })()}</button>
                <button type="button" onClick={() => document.getElementById(`modal-comment-${selectedPost.id}`)?.focus()} style={{ flex: 1, border: 0, background: 'transparent', color: '#bbb', fontWeight: 650, padding: 9, cursor: 'pointer' }}>💬 Comment</button>
              </div>
              {openReactionPicker === selectedPost.id && <div style={{ display: 'flex', justifyContent: 'center', gap: 7, padding: '8px 0', background: '#292929', borderRadius: 10, marginTop: 8 }}>
                {([{ value: 'like', emoji: '👍', label: 'Like' }, { value: 'love', emoji: '❤️', label: 'Love' }, { value: 'haha', emoji: '😂', label: 'Haha' }, { value: 'wow', emoji: '😮', label: 'Wow' }, { value: 'sad', emoji: '😢', label: 'Sad' }, { value: 'angry', emoji: '😡', label: 'Angry' }] as const).map(option => <button key={option.value} type="button" title={option.label} aria-label={option.label} onClick={() => { reactToPost(selectedPost, option.value); setOpenReactionPicker(null); }} style={{ border: 0, background: 'transparent', padding: 4, fontSize: 21, cursor: 'pointer' }}>{option.emoji}</button>)}
              </div>}
              <div style={{ paddingTop: 8 }}>{selectedPost.comments.map(comment => <div key={comment.id} style={{ display: 'flex', gap: 8, paddingTop: 10 }}>
                {comment.author_avatar ? <img src={comment.author_avatar} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} /> : <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#383838', color: '#ddd', display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: 12, fontWeight: 700 }}>{(comment.author_name || 'M').trim()[0]?.toUpperCase() || 'M'}</div>}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ background: '#292929', borderRadius: 12, padding: '8px 11px' }}><div style={{ color: '#ddd', fontSize: 12, fontWeight: 700, marginBottom: 3 }}>{comment.author_name || 'Member'}</div><div style={{ color: '#e5e5e5', fontSize: 13, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{comment.content}</div></div>
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: '4px 8px 0' }}>
                    <span title={new Date(comment.created_at).toLocaleString()} style={{ color: '#888', fontSize: 10 }}>{formatCommentTimestamp(comment.created_at)}</span>
                    {(['like','love','haha','wow','sad','angry'] as const).map((kind, index) => { const emoji = ['👍','❤️','😂','😮','😢','😡'][index]; const count = comment.reactions.filter(item => item.reaction === kind).length; const active = comment.reactions.some(item => item.user_id === user?.id && item.reaction === kind); return <button key={kind} type="button" title={kind} onClick={() => reactToComment(selectedPost.id, comment, kind)} style={{ border: 0, background: 'transparent', color: active ? '#8db8ff' : '#888', padding: '1px 2px', fontSize: 11, cursor: 'pointer', fontWeight: active ? 800 : 500 }}>{emoji}{count > 0 ? ` ${count}` : ''}</button>; })}
                    <span style={{ color: '#888', fontSize: 10 }}>{comment.reactions.length} reactions</span>
                  </div>
                </div>
              </div>)}</div>
              <form onSubmit={e => { e.preventDefault(); submitPostComment(selectedPost.id); }} style={{ display: 'flex', gap: 8, marginTop: 14, position: 'sticky', bottom: -18, padding: '12px 0 0', background: '#202020' }}>
                {avatarUrl ? <img src={avatarUrl} alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} /> : <div style={{ ...s.friendAvatar, width: 34, height: 34, fontSize: 13 }}>{(displayName || 'A')[0].toUpperCase()}</div>}
                <input id={`modal-comment-${selectedPost.id}`} value={commentDrafts[selectedPost.id] || ''} onChange={e => setCommentDrafts(current => ({ ...current, [selectedPost.id]: e.target.value.slice(0, 500) }))} placeholder="Write a comment..." maxLength={500} style={{ flex: 1, minWidth: 0, border: '1px solid rgba(255,255,255,.1)', borderRadius: 20, padding: '10px 14px', background: '#292929', color: '#eee', outline: 'none', fontSize: 13 }} />
                <button type="submit" disabled={!(commentDrafts[selectedPost.id] || '').trim()} style={{ border: 0, borderRadius: 20, padding: '0 14px', background: '#3978d6', color: '#fff', fontWeight: 650, opacity: (commentDrafts[selectedPost.id] || '').trim() ? 1 : .45, cursor: 'pointer' }}>Send</button>
              </form>
            </div>
          </section>
        </div>}
            </div>
          </main>
        </div>
        {openPhotoMenu && photoMenuPosition && createPortal(
          <div role="presentation" onClick={() => { setOpenPhotoMenu(null); setPhotoMenuPosition(null); }} style={{ position: 'fixed', inset: 0, zIndex: 5000 }}>
            <div role="menu" aria-label="Photo options" onClick={event => event.stopPropagation()} style={{ position: 'fixed', top: photoMenuPosition.top, left: photoMenuPosition.left, width: 'min(208px, calc(100vw - 24px))', boxSizing: 'border-box', padding: 6, borderRadius: 10, background: '#252525', border: '1px solid rgba(255,255,255,.16)', boxShadow: '0 12px 34px rgba(0,0,0,.62)', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {(() => {
                const photo = galleryPhotos.find(item => item.name === openPhotoMenu);
                if (!photo) return null;
                return <>
                  <button type="button" role="menuitem" onClick={() => { setOpenPhotoMenu(null); setPhotoMenuPosition(null); useGalleryPhoto(photo, 'avatar'); }} style={{ border: 0, borderRadius: 7, padding: '11px 10px', textAlign: 'left', background: 'transparent', color: '#eee', fontSize: 13, cursor: 'pointer', width: '100%' }}>Set as profile picture</button>
                  <button type="button" role="menuitem" onClick={() => { setOpenPhotoMenu(null); setPhotoMenuPosition(null); useGalleryPhoto(photo, 'cover'); }} style={{ border: 0, borderRadius: 7, padding: '11px 10px', textAlign: 'left', background: 'transparent', color: '#eee', fontSize: 13, cursor: 'pointer', width: '100%' }}>Set as cover photo</button>
                  <div style={{ height: 1, background: 'rgba(255,255,255,.1)', margin: '2px 4px' }} />
                  <button type="button" role="menuitem" onClick={() => { setOpenPhotoMenu(null); setPhotoMenuPosition(null); handleDeletePhoto(photo); }} style={{ border: 0, borderRadius: 7, padding: '11px 10px', textAlign: 'left', background: 'transparent', color: '#ff8b8b', fontSize: 13, cursor: 'pointer', width: '100%' }}>Delete photo</button>
                </>;
              })()}
            </div>
          </div>,
          document.body
        )}
        {selectedPhoto && <div role="presentation" onClick={() => setSelectedPhoto(null)} style={{ position: 'fixed', inset: 0, zIndex: 1600, background: 'rgba(0,0,0,.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <section role="dialog" aria-modal="true" aria-label="Photo viewer" onClick={e => e.stopPropagation()} style={{ position: 'relative', width: '100%', maxWidth: 1100, maxHeight: '94vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <button type="button" onClick={() => setSelectedPhoto(null)} aria-label="Close photo" style={{ position: 'absolute', zIndex: 2, top: -12, right: -8, width: 40, height: 40, border: 0, borderRadius: '50%', background: 'rgba(35,35,35,.9)', color: '#fff', fontSize: 28, cursor: 'pointer' }}>×</button>
            <img src={selectedPhoto.url} alt={selectedPhoto.alt} style={{ display: 'block', maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8, boxShadow: '0 12px 50px rgba(0,0,0,.55)' }} />
          </section>
        </div>}
      </>
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName || displayName.length < 1) { setMsg('Display name is required'); return; }
    setSaving(true);
    setMsg('');
    const { error } = await upsertChatProfile({ display_name: displayName, bio, avatar_url: avatarUrl, cover_url: coverUrl, share_name: shareName, share_bio: shareBio, work, education, share_details: shareDetails });
    setSaving(false);
    if (error) setMsg(error);
    else setMsg('Saved!');
  }

  if (loading || loadingViewed) return <div style={{ ...s.page, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>Loading...</div>;

  const initial = (isViewingOther ? viewedUser?.name : displayName)?.[0]?.toUpperCase() || 'A';

  // Viewing another user's profile (read-only)
  if (isViewingOther && viewedUser) {
    return (
      <div className="profile-page-root" style={s.page}>
        <div style={s.wrap}>
          
          <div className="cover-wrap" style={s.coverWrap}>
            {viewedUser.cover ? <img src={viewedUser.cover} alt="" style={s.coverImg} /> : null}
          </div>
          <div className="profile-avatar-wrap" style={s.avatarWrap}>
            <div className="profile-avatar" style={{ ...s.avatar, cursor: 'default' }}>
              {viewedUser.avatar ? <img src={viewedUser.avatar} alt="" style={s.avatarImg} /> : <span>{initial}</span>}
              <OnlineDot online={onlineUserIds.has(profileOwnerId)} size={18} borderColor="#1a1a1a" style={{ right: 7, bottom: 7 }} />
            </div>
          </div>
          <div className="profile-name-section" style={s.nameSection}>
            <h1 style={s.name}>{viewedUser.name}</h1>
            {viewedUser.bio && <p style={{ color: '#aaa', fontSize: 14, margin: '4px 0 0' }}>{viewedUser.bio}</p>}
          </div>
          {onMessage && (
            <div style={{ padding: '8px 24px 24px' }}>
              <button onClick={() => { onMessage(viewUserId); onClearView?.(); }} style={s.saveBtn}>Message</button>
            </div>
          )}
          {renderProfileTabs(false, viewedUser.name, viewedUser.avatar)}
        </div>
      </div>
    );
  }

  return (
    <div className="profile-page-root" style={s.page}>
      <div className="profile-wrap" style={s.wrap}>
        <div className="cover-wrap" style={{ ...s.coverWrap, cursor: 'pointer' }} onClick={() => coverInputRef.current?.click()} role="button" aria-label="Change cover photo">
          {coverUrl ? <img src={coverUrl} alt="" style={s.coverImg} /> : null}
        </div>
        <input ref={coverInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleCoverUpload} style={s.hiddenInput} />


        <div className="profile-avatar-wrap" style={s.avatarWrap}>
          <div className="avatar-circle profile-avatar" style={s.avatar} onClick={() => avatarInputRef.current?.click()} role="button" aria-label="Change profile picture" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') avatarInputRef.current?.click(); }}>
            {avatarUrl ? <img src={avatarUrl} alt="" style={s.avatarImg} /> : <span>{initial}</span>}
          </div>
        </div>
        <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarUpload} style={s.hiddenInput} />
        <input ref={galleryInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleGalleryUpload} style={s.hiddenInput} />

        <div className="profile-name-section" style={s.nameSection}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1 style={s.name}>{displayName}</h1>
            {bio && <p style={{ color: '#aaa', fontSize: 14, lineHeight: 1.5, margin: '6px 0 0', maxWidth: 520 }}>{bio}</p>}
          </div>
          <button type="button" onClick={() => setActiveTab('About')} style={{ flexShrink: 0, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.06)', color: '#eee', borderRadius: 9, padding: '9px 13px', fontSize: 12, fontWeight: 650, cursor: 'pointer' }}>Edit profile</button>
        </div>

        <section aria-label="Recent Live" style={{ padding: '12px 24px 8px' }}>
          <h2 style={{ color: '#fff', fontSize: 15, fontWeight: 650, margin: '0 0 12px' }}>Recent Live</h2>
          {recent.length === 0 ? (
            <p style={{ color: '#666', fontSize: 13, margin: 0 }}>No recent interactions yet. Start chatting to meet people!</p>
          ) : (
            <div style={{ display: 'flex', gap: 14, overflowX: 'auto', overflowY: 'hidden', paddingBottom: 8, WebkitOverflowScrolling: 'touch' }}>
              {recent.map((r, i) => (
                <div key={r.id || i} style={{ width: 76, minWidth: 76, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <span style={{ position: 'relative', display: 'inline-flex' }}>
                    <button type="button" onClick={() => onViewProfile?.(r.id)} aria-label={'View ' + (r.name || 'user') + ' profile'} style={{ width: 62, height: 62, borderRadius: '50%', padding: 0, border: '2px solid #6c63ff', background: '#292929', overflow: 'hidden', cursor: 'pointer' }}>
                      {r.avatar ? <img src={r.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ color: '#fff', fontSize: 22, display: 'grid', placeItems: 'center', height: '100%' }}>{(r.name || '?')[0].toUpperCase()}</span>}
                    </button>
                    <OnlineDot online={onlineUserIds.has(r.id)} size={12} borderColor="#161616" />
                  </span>
                  <span style={{ color: '#ddd', fontSize: 11, textAlign: 'center', maxWidth: 76, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name || 'Unknown'}</span>
                  {onMessage && r.id && <button type="button" onClick={() => onMessage(r.id)} style={{ border: 0, background: 'rgba(108,99,255,.16)', color: '#aaa4ff', borderRadius: 12, padding: '4px 8px', fontSize: 10 }}>Message</button>}
                </div>
              ))}
            </div>
          )}
          {recent.length > 0 && <button type="button" onClick={async () => { await clearRecentLive(); setRecent([]); }} style={{ border: 0, background: 'transparent', color: '#888', fontSize: 11, padding: '4px 0', cursor: 'pointer' }}>Clear history</button>}
        </section>

        {renderProfileTabs(true, displayName, avatarUrl)}

        {avatarEditDraft && <div role="presentation" onClick={() => { if (!uploadingAvatar) closeAvatarEditor(); }} style={{ position: 'fixed', inset: 0, zIndex: 6000, background: 'rgba(0,0,0,.86)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <section role="dialog" aria-modal="true" aria-labelledby="avatar-editor-title" onClick={event => event.stopPropagation()} style={{ width: '100%', maxWidth: 440, boxSizing: 'border-box', padding: 20, borderRadius: 16, background: '#202020', border: '1px solid rgba(255,255,255,.12)', boxShadow: '0 18px 60px rgba(0,0,0,.6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
              <h2 id="avatar-editor-title" style={{ color: '#fff', fontSize: 18, margin: 0 }}>Edit profile picture</h2>
              <button type="button" onClick={closeAvatarEditor} disabled={uploadingAvatar} aria-label="Close editor" style={{ border: 0, background: 'transparent', color: '#aaa', fontSize: 26, cursor: uploadingAvatar ? 'not-allowed' : 'pointer' }}>×</button>
            </div>
            <p style={{ color: '#aaa', fontSize: 13, margin: '0 0 14px' }}>Move the zoom slider to frame your photo inside the square.</p>
            <div style={{ width: 'min(100%, 320px)', aspectRatio: '1', margin: '0 auto 18px', position: 'relative', overflow: 'hidden', background: '#111', borderRadius: 4 }}>
              <img src={avatarEditDraft.url} alt="Profile picture crop preview" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${avatarCropZoom})`, transformOrigin: 'center center' }} />
              <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'linear-gradient(to right, transparent 33.1%, rgba(255,255,255,.8) 33.3%, transparent 33.6%, transparent 66.4%, rgba(255,255,255,.8) 66.7%, transparent 67%), linear-gradient(to bottom, transparent 33.1%, rgba(255,255,255,.8) 33.3%, transparent 33.6%, transparent 66.4%, rgba(255,255,255,.8) 66.7%, transparent 67%)', border: '1px solid rgba(255,255,255,.8)', boxSizing: 'border-box' }} />
            </div>
            <label htmlFor="avatar-crop-zoom" style={{ display: 'flex', justifyContent: 'space-between', color: '#ccc', fontSize: 13, marginBottom: 8 }}><span>Zoom</span><span>{avatarCropZoom.toFixed(1)}×</span></label>
            <input id="avatar-crop-zoom" type="range" min="1" max="3" step="0.05" value={avatarCropZoom} onChange={event => setAvatarCropZoom(Number(event.target.value))} disabled={uploadingAvatar} style={{ width: '100%', accentColor: '#7770ff' }} />
            {msg && <p role="alert" style={{ color: '#ff8b8b', fontSize: 12, margin: '12px 0 0' }}>{msg}</p>}
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button type="button" onClick={closeAvatarEditor} disabled={uploadingAvatar} style={{ flex: 1, border: '1px solid rgba(255,255,255,.14)', borderRadius: 9, padding: 12, background: '#303030', color: '#ddd', cursor: uploadingAvatar ? 'not-allowed' : 'pointer' }}>Cancel</button>
              <button type="button" onClick={saveAvatarCrop} disabled={uploadingAvatar} style={{ ...s.saveBtn, flex: 1, marginTop: 0, opacity: uploadingAvatar ? .6 : 1 }}>{uploadingAvatar ? (avatarSaveStage || 'Saving…') : 'Save picture'}</button>
            </div>
          </section>
        </div>}


      </div>
    </div>
  );
}
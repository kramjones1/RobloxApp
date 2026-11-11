import React, { useEffect, useRef, useState } from 'react';
import { getChatProfile, upsertChatProfile, ChatProfile, getRecentLive, clearRecentLive, getUserProfile, getAllMessagesForDownload, isAdmin, getProfilePosts, createProfilePost, deleteProfilePost, ChatPost, uploadProfilePhoto, getProfilePhotos, deleteProfilePhoto, removeProfilePostImage, ProfilePhoto } from '../supabaseClient';

type Page = 'profile' | 'terms' | 'privacy' | 'home';

interface Props {
  onNav: (p: Page) => void;
  user: any;
  onMessage?: (userId: string) => void;
  viewUserId?: string | null;
  onViewProfile?: (userId: string) => void;
  onClearView?: () => void;
}

async function compressProfileImage(file: File): Promise<File> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Please choose a JPEG, PNG, or WebP image.');
  }
  const bitmap = await createImageBitmap(file);
  try {
    for (const maxSide of [1280, 1024, 900, 768, 640]) {
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Image compression is not supported in this browser.');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.82, 0.72, 0.62, 0.52, 0.42]) {
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', quality));
        if (blob && blob.size <= 200 * 1024) {
          return new File([blob], 'profile-photo.webp', { type: 'image/webp', lastModified: Date.now() });
        }
      }
    }
  } finally {
    bitmap.close();
  }
  throw new Error('This image cannot be compressed below 200 KB. Please choose a smaller image.');
}

const s = {
  page: { background: '#161616', fontFamily: 'system-ui, sans-serif', minHeight: '100vh' },
  wrap: { maxWidth: 700, margin: '0 auto', padding: '0 0 40px', display: 'flex', flexDirection: 'column' as const },
  coverWrap: { position: 'relative' as const, width: '100%', aspectRatio: '820/280' as any, overflow: 'hidden', background: 'linear-gradient(135deg, #6c63ff 0%, #2a6eff 50%, #00d4ff 100%)', flexShrink: 0 },
  coverImg: { width: '100%', height: '100%', objectFit: 'cover' as const, display: 'block', position: 'absolute' as const, inset: 0 },
  avatarWrap: { display: 'flex', justifyContent: 'flex-start', marginTop: -64, paddingLeft: 24 },
  avatar: { width: 132, height: 132, borderRadius: '50%', border: '5px solid #1a1a1a', background: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44, color: '#fff', fontWeight: 700, overflow: 'hidden', position: 'relative' as const, flexShrink: 0, cursor: 'pointer' },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' as const, display: 'block' },
  nameSection: { padding: '8px 24px 16px', textAlign: 'left' as const, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderBottom: '1px solid rgba(255,255,255,.07)' },
  name: { color: '#fff', fontSize: 25, fontWeight: 750, letterSpacing: '-.5px', margin: 0 },
  contentArea: { padding: '8px 24px 40px', display: 'flex', flexDirection: 'column' as const, gap: 12 },
  card: { background: '#1f1f1f', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 20 },
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
  @media (max-width: 699px) {
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
  const [shareName, setShareName] = useState(false);
  const [shareBio, setShareBio] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [recent, setRecent] = useState<{ id: string; name: string; bio: string; avatar: string; time: string }[]>([]);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [viewedUser, setViewedUser] = useState<{ name: string; bio: string; avatar: string; cover: string } | null>(null);
  const [loadingViewed, setLoadingViewed] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [posts, setPosts] = useState<ChatPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [postText, setPostText] = useState('');
  const [postImages, setPostImages] = useState<File[]>([]);
  const [postImagePreviews, setPostImagePreviews] = useState<string[]>([]);
  const [postPreviewOpen, setPostPreviewOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postMsg, setPostMsg] = useState('');
  const [imageEditorOpen, setImageEditorOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'Posts' | 'Photos' | 'Timeline' | 'About'>('Posts');
  const [profilePhotos, setProfilePhotos] = useState<ProfilePhoto[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const postImagesInputRef = useRef<HTMLInputElement>(null);

  const isViewingOther = viewUserId && viewUserId !== user?.id;

  useEffect(() => {
    (async () => {
      const { profile } = await getChatProfile();
      if (profile) {
        setDisplayName(profile.display_name);
        setBio(profile.bio);
        setShareName(profile.share_name);
        setShareBio(profile.share_bio);
        setAvatarUrl(profile.avatar_url || localStorage.getItem('profile_avatar') || '');
        setCoverUrl(profile.cover_url || localStorage.getItem('profile_cover') || '');
      }
      setLoading(false);
    })();
    getRecentLive().then(({ entries }) => {
      if (entries) setRecent(entries.map(e => ({ id: e.partner_id, name: e.partner_name, bio: e.partner_bio, avatar: e.partner_avatar, time: e.created_at })));
    });
    isAdmin().then(setAdmin);
  }, []);

  const profileOwnerId = isViewingOther && viewUserId ? viewUserId : (user?.id || '');

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
    getProfilePosts(profileOwnerId).then(({ posts: rows, error }) => {
      if (!active) return;
      setPosts(rows || []);
      setPostMsg(error || '');
      setPostsLoading(false);
    });
    return () => { active = false; };
  }, [profileOwnerId]);

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
      for (const file of postImages) {
        const { photo, error } = await uploadProfilePhoto(file, 'post');
        if (error || !photo) throw new Error(error || 'A photo could not be uploaded.');
        uploadedPaths.push(`${user.id}/${photo.name}`);
      }
      const { post, error } = await createProfilePost(postText, uploadedPaths);
      if (error || !post) throw new Error(error || 'Post was not published.');
      setPosts(current => [post, ...current].slice(0, 20));
      setPostText('');
      setPostImages([]);
      postImagePreviews.forEach(url => URL.revokeObjectURL(url));
      setPostImagePreviews([]);
      setPostPreviewOpen(false);
      const { photos } = await getProfilePhotos(profileOwnerId);
      setProfilePhotos(photos || []);
      setPostMsg('Post published.');
    } catch (error: any) {
      await Promise.all(uploadedPaths.map(path => deleteProfilePhoto(path.replace(`${user.id}/`, ''))));
      setPostMsg(error.message || 'Could not publish post.');
    } finally {
      setPosting(false);
    }
  }

  async function removePost(postId: string) {
    if (!window.confirm('Delete this post?')) return;
    const { error } = await deleteProfilePost(postId);
    if (error) setPostMsg(error);
    else setPosts(current => current.filter(post => post.id !== postId));
  }

  function renderPosts(canPublish: boolean, authorName: string, authorAvatar: string) {
    const canPreview = Boolean(postText.trim() || postImages.length);
    return (
      <div style={{ ...s.card, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px 12px' }}>
          <h2 style={{ ...s.cardTitle, marginBottom: 14 }}>Posts</h2>
          {canPublish && (
            <div style={{ background: '#252525', border: '1px solid rgba(255,255,255,.07)', borderRadius: 14, padding: 14, marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                {authorAvatar ? <img src={authorAvatar} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} /> : <div style={s.friendAvatar}>{(authorName || 'A')[0].toUpperCase()}</div>}
                <div><strong style={{ color: '#f5f5f5', fontSize: 13 }}>{authorName || 'Anonymous'}</strong><div style={{ color: '#777', fontSize: 11 }}>Share an update with everyone</div></div>
              </div>
              <textarea value={postText} onChange={e => setPostText(e.target.value.slice(0, 500))} maxLength={500}
                placeholder="What's on your mind?" style={{ ...s.textarea, minHeight: 90, marginBottom: 10, background: '#1d1d1d', borderRadius: 11 }} />
              {postImages.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: postImages.length === 1 ? '1fr' : 'repeat(2,minmax(0,1fr))', gap: 7, marginBottom: 12 }}>
                {postImages.map((file, index) => <div key={index} style={{ position: 'relative', aspectRatio: postImages.length === 1 ? '16/10' : '1', borderRadius: 9, overflow: 'hidden', background: '#111' }}>
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
              <input ref={postImagesInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handlePostImageSelection} style={s.hiddenInput} />
              <button type="button" onClick={() => setPostPreviewOpen(true)} disabled={!canPreview || posting} style={{ ...s.saveBtn, marginTop: 12, opacity: !canPreview || posting ? .45 : 1 }}>Preview post</button>
            </div>
          )}
          {postMsg && <p role="status" style={{ color: postMsg === 'Post published.' ? '#71cf8a' : '#f0a0a0', fontSize: 12, margin: '8px 0' }}>{postMsg}</p>}
          {postsLoading ? <p style={{ color: '#777', fontSize: 13 }}>Loading posts...</p> :
            posts.length === 0 ? <p style={{ color: '#777', fontSize: 13 }}>{canPublish ? 'No posts yet. Share your first update!' : 'No posts yet.'}</p> : null}
        </div>
        {posts.map(post => (
          <article key={post.id} style={{ padding: '16px 20px 20px', borderTop: '1px solid rgba(255,255,255,.07)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              {authorAvatar ? <img src={authorAvatar} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} /> : <div style={s.friendAvatar}>{(authorName || 'A')[0].toUpperCase()}</div>}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ color: '#eee', fontSize: 14, fontWeight: 650 }}>{authorName || 'Anonymous'}</div>
                <div style={{ color: '#777', fontSize: 11 }}>{new Date(post.created_at).toLocaleString()}</div>
              </div>
              {canPublish && <button type="button" onClick={() => removePost(post.id)} aria-label="Delete post" style={{ border: 0, background: 'transparent', color: '#999', fontSize: 12, cursor: 'pointer', padding: 8 }}>Delete</button>}
            </div>
            {post.content && <p style={{ color: '#e5e5e5', fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: '0 0 12px' }}>{post.content}</p>}
            {(post.image_paths || []).length > 0 && <div style={{ display: 'grid', gridTemplateColumns: post.image_paths.length === 1 ? '1fr' : 'repeat(2,minmax(0,1fr))', gap: 4, overflow: 'hidden', borderRadius: 10 }}>
              {post.image_paths.map((path, index) => <img key={path} src={`${'https://btkcubibosbtpxcronnd.supabase.co'}/storage/v1/object/public/profile-photos/${path.split('/').map(encodeURIComponent).join('/')}`} alt={`Post photo ${index + 1}`} loading="lazy" style={{ width: '100%', aspectRatio: post.image_paths.length === 1 ? '16/10' : '1', objectFit: 'cover', background: '#111', gridColumn: post.image_paths.length === 3 && index === 0 ? 'span 2' : undefined }} />)}
            </div>}
          </article>
        ))}
        {posts.length >= 20 && <p style={{ color: '#666', fontSize: 11, textAlign: 'center', padding: '0 20px 14px', margin: 0 }}>Showing the latest 20 posts</p>}
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
              {postImages.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: postImages.length === 1 ? '1fr' : 'repeat(2,minmax(0,1fr))', gap: 4, borderRadius: 9, overflow: 'hidden' }}>
                {postImages.map((file, index) => <img key={index} src={postImagePreviews[index]} alt={`Preview photo ${index + 1}`} style={{ width: '100%', aspectRatio: postImages.length === 1 ? '16/10' : '1', objectFit: 'cover', gridColumn: postImages.length === 3 && index === 0 ? 'span 2' : undefined }} />)}
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
      if (profile) setViewedUser({ name: profile.display_name || 'User', bio: profile.bio || '', avatar: profile.avatar_url || '', cover: profile.cover_url || '' });
      setLoadingViewed(false);
    });
  }, [viewUserId, user?.id]);

  async function saveProfilePhoto(file: File, slot: 'avatar' | 'cover' | 'gallery') {
    const compressed = await compressProfileImage(file);
    const { photo, error } = await uploadProfilePhoto(compressed, slot);
    if (error || !photo) throw new Error(error || 'Photo upload failed.');
    if (slot === 'avatar' || slot === 'cover') {
      const nextAvatar = slot === 'avatar' ? photo.url : avatarUrl;
      const nextCover = slot === 'cover' ? photo.url : coverUrl;
      const { error: profileError } = await upsertChatProfile({
        display_name: displayName, bio, avatar_url: nextAvatar, cover_url: nextCover,
        share_name: shareName, share_bio: shareBio
      });
      if (profileError) {
        await deleteProfilePhoto(photo.name);
        throw new Error(profileError);
      }
      if (slot === 'avatar') {
        setAvatarUrl(photo.url);
        localStorage.removeItem('profile_avatar');
      } else {
        setCoverUrl(photo.url);
        localStorage.removeItem('profile_cover');
      }
    }
    const { photos } = await getProfilePhotos(profileOwnerId);
    setProfilePhotos(photos || []);
    setMsg('Photo saved.');
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingAvatar(true);
    setMsg('');
    try { await saveProfilePhoto(file, 'avatar'); }
    catch (error: any) { setMsg(error.message || 'Failed to upload profile picture.'); }
    finally { setUploadingAvatar(false); }
  }

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingCover(true);
    setMsg('');
    try { await saveProfilePhoto(file, 'cover'); }
    catch (error: any) { setMsg(error.message || 'Failed to upload cover photo.'); }
    finally { setUploadingCover(false); }
  }

  async function handleGalleryUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingGallery(true);
    setMsg('');
    try { await saveProfilePhoto(file, 'gallery'); }
    catch (error: any) { setMsg(error.message || 'Failed to upload photo.'); }
    finally { setUploadingGallery(false); }
  }

  async function handleDeletePhoto(photo: ProfilePhoto) {
    if (!window.confirm('Delete this photo?')) return;
    if (photo.name.startsWith('posts/')) {
      const matchingPost = posts.find(post => (post.image_paths || []).includes(`${user.id}/${photo.name}`));
      if (matchingPost) {
        const { error } = await removeProfilePostImage(matchingPost.id, `${user.id}/${photo.name}`);
        if (error) { setMsg(error); return; }
        setPosts(current => current.map(post => post.id === matchingPost.id ? { ...post, image_paths: (post.image_paths || []).filter(path => path !== `${user.id}/${photo.name}`) } : post));
      }
    }
    if (photo.name === 'avatar.webp' || photo.name === 'cover.webp') {
      const nextAvatar = photo.name === 'avatar.webp' ? '' : avatarUrl;
      const nextCover = photo.name === 'cover.webp' ? '' : coverUrl;
      const { error: profileError } = await upsertChatProfile({
        display_name: displayName, bio, avatar_url: nextAvatar, cover_url: nextCover,
        share_name: shareName, share_bio: shareBio
      });
      if (profileError) { setMsg(profileError); return; }
      setAvatarUrl(nextAvatar);
      setCoverUrl(nextCover);
    }
    const { error } = await deleteProfilePhoto(photo.name);
    if (error) { setMsg(error); return; }
    setProfilePhotos(current => current.filter(item => item.name !== photo.name));
    setMsg('Photo deleted.');
  }

  function renderProfileTabs(canEdit: boolean, authorName: string, authorAvatar: string) {
    const tabs: ('Posts' | 'Photos' | 'Timeline' | 'About')[] = ['Posts', 'Photos', 'Timeline', 'About'];
    return (
      <>
        <nav aria-label="Profile sections" style={{ display: 'flex', gap: 4, padding: '0 24px', borderBottom: '1px solid rgba(255,255,255,.08)', overflowX: 'auto' }}>
          {tabs.map(tab => (
            <button key={tab} type="button" onClick={() => setActiveTab(tab)} style={{
              background: 'transparent', border: 0, borderBottom: activeTab === tab ? '2px solid #7770ff' : '2px solid transparent',
              color: activeTab === tab ? '#fff' : '#999', padding: '13px 14px', fontSize: 13, fontWeight: 650, cursor: 'pointer', whiteSpace: 'nowrap'
            }}>{tab}</button>
          ))}
        </nav>
        <div style={s.contentArea}>
          {activeTab === 'Posts' && renderPosts(canEdit, authorName, authorAvatar)}
          {activeTab === 'Photos' && (
            <section style={s.card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
                <h2 style={{ ...s.cardTitle, margin: 0 }}>Photos</h2>
                {canEdit && <button type="button" disabled={uploadingGallery || profilePhotos.length >= 25} onClick={() => galleryInputRef.current?.click()} style={{ ...s.toggleBtn, background: '#39348a', color: '#fff', opacity: uploadingGallery || profilePhotos.length >= 5 ? .5 : 1 }}>{uploadingGallery ? 'Uploading…' : 'Add photo'}</button>}
              </div>
              {canEdit && <p style={{ color: '#777', fontSize: 11, margin: '0 0 12px' }}>{profilePhotos.length}/25 photos · max 200 KB each · 5 MB total · WebP only</p>}
              {canEdit && msg && <p style={{ color: msg.includes('saved') || msg.includes('deleted') ? '#4caf50' : '#f44336', fontSize: 12 }}>{msg}</p>}
              {photosLoading ? <p style={{ color: '#777', fontSize: 13 }}>Loading photos…</p> :
                profilePhotos.length === 0 ? <p style={{ color: '#777', fontSize: 13 }}>No photos yet.</p> :
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                  {profilePhotos.map(photo => (
                    <div key={photo.name} style={{ position: 'relative', aspectRatio: '1', background: '#292929', borderRadius: 9, overflow: 'hidden' }}>
                      <img src={photo.url} alt="Profile gallery" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      {canEdit && <button type="button" onClick={() => handleDeletePhoto(photo)} aria-label="Delete photo" style={{ position: 'absolute', top: 6, right: 6, border: 0, borderRadius: 20, background: 'rgba(0,0,0,.72)', color: '#fff', width: 26, height: 26, cursor: 'pointer' }}>×</button>}
                    </div>
                  ))}
                </div>
              }
            </section>
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
            <div style={s.card}>
              <h2 style={s.cardTitle}>About</h2>
              <form onSubmit={handleSave}>
                <label style={s.label}>Display Name {displayName !== 'Anonymous' && displayName !== '' && <span style={{ color: '#666', fontSize: 12, fontWeight: 400 }}>(locked — set at signup)</span>}</label>
                <input style={{ ...s.input, opacity: displayName !== 'Anonymous' && displayName !== '' ? 0.6 : 1, cursor: displayName !== 'Anonymous' && displayName !== '' ? 'not-allowed' : 'text' }} value={displayName} readOnly={displayName !== 'Anonymous' && displayName !== ''} onChange={e => setDisplayName(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 9))} maxLength={9} placeholder="e.g. CoolUser1" />
                <label style={s.label}>Bio</label>
                <textarea style={s.textarea} value={bio} onChange={e => setBio(e.target.value)} maxLength={200} placeholder="Tell people about yourself..." />
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
            </section>
          ))}
        </div>
      </>
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName || displayName.length < 1) { setMsg('Display name is required'); return; }
    setSaving(true);
    setMsg('');
    const { error } = await upsertChatProfile({ display_name: displayName, bio, avatar_url: avatarUrl, cover_url: coverUrl, share_name: shareName, share_bio: shareBio });
    setSaving(false);
    if (error) setMsg(error);
    else setMsg('Saved!');
  }

  if (loading || loadingViewed) return <div style={{ ...s.page, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>Loading...</div>;

  const initial = (isViewingOther ? viewedUser?.name : displayName)?.[0]?.toUpperCase() || 'A';

  // Viewing another user's profile (read-only)
  if (isViewingOther && viewedUser) {
    return (
      <div style={s.page}>
        <div style={s.wrap}>
          
          <div className="cover-wrap" style={s.coverWrap}>
            {viewedUser.cover ? <img src={viewedUser.cover} alt="" style={s.coverImg} /> : null}
          </div>
          <div className="profile-avatar-wrap" style={s.avatarWrap}>
            <div className="avatar-circle profile-avatar" style={{ ...s.avatar, cursor: 'default' }}>
              {viewedUser.avatar ? <img src={viewedUser.avatar} alt="" style={s.avatarImg} /> : <span>{initial}</span>}
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
    <div style={s.page}>
      <div style={s.wrap}>
        <div className="cover-wrap" style={{ ...s.coverWrap, cursor: 'pointer' }} onClick={() => setImageEditorOpen(true)} role="button" aria-label="Edit profile photos">
          {coverUrl ? <img src={coverUrl} alt="" style={s.coverImg} /> : null}
        </div>
        <input ref={coverInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleCoverUpload} style={s.hiddenInput} />

        {imageEditorOpen && (
          <div role="presentation" onClick={() => setImageEditorOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
            <section role="dialog" aria-modal="true" aria-labelledby="profile-image-editor-title" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 440, background: '#202020', border: '1px solid rgba(255,255,255,.1)', borderRadius: 16, padding: 20, boxShadow: '0 18px 60px rgba(0,0,0,.5)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                <h2 id="profile-image-editor-title" style={{ color: '#fff', fontSize: 18, margin: 0 }}>Edit profile photos</h2>
                <button type="button" onClick={() => setImageEditorOpen(false)} aria-label="Close" style={{ background: 'transparent', border: 0, color: '#aaa', fontSize: 24, cursor: 'pointer' }}>×</button>
              </div>
              <p style={{ color: '#999', fontSize: 13, margin: '0 0 18px' }}>Choose which photo you want to update.</p>
              {msg && <p role="status" style={{ color: msg === 'Photo saved.' ? '#78c98a' : '#f0a0a0', fontSize: 12, margin: '0 0 12px' }}>{msg}</p>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderTop: '1px solid rgba(255,255,255,.08)' }}>
                {avatarUrl ? <img src={avatarUrl} alt="" style={{ width: 58, height: 58, borderRadius: '50%', objectFit: 'cover' }} /> : <div style={{ width: 58, height: 58, borderRadius: '50%', background: '#333', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 22 }}>{initial}</div>}
                <div style={{ flex: 1, minWidth: 0 }}><strong style={{ color: '#eee', fontSize: 14 }}>Profile picture</strong><p style={{ color: '#888', fontSize: 11, margin: '3px 0 0' }}>Shown beside your name and posts</p></div>
                <button type="button" disabled={uploadingAvatar} onClick={() => avatarInputRef.current?.click()} style={{ background: '#39348a', color: '#fff', border: 0, borderRadius: 8, padding: '9px 12px', fontSize: 12, cursor: 'pointer' }}>{uploadingAvatar ? 'Saving…' : 'Change'}</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderTop: '1px solid rgba(255,255,255,.08)' }}>
                <div style={{ width: 92, height: 58, borderRadius: 8, overflow: 'hidden', background: 'linear-gradient(135deg,#6c63ff,#00a8cc)', flexShrink: 0 }}>{coverUrl && <img src={coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}</div>
                <div style={{ flex: 1, minWidth: 0 }}><strong style={{ color: '#eee', fontSize: 14 }}>Cover photo</strong><p style={{ color: '#888', fontSize: 11, margin: '3px 0 0' }}>The wide image at the top of your profile</p></div>
                <button type="button" disabled={uploadingCover} onClick={() => coverInputRef.current?.click()} style={{ background: '#39348a', color: '#fff', border: 0, borderRadius: 8, padding: '9px 12px', fontSize: 12, cursor: 'pointer' }}>{uploadingCover ? 'Saving…' : 'Change'}</button>
              </div>
              <p style={{ color: '#777', fontSize: 11, margin: '12px 0 0' }}>JPEG, PNG, or WebP images are compressed to WebP. Maximum 200 KB each, 5 photos and 1 MB total per account. Changes save automatically.</p>
            </section>
          </div>
        )}

        <div className="profile-avatar-wrap" style={s.avatarWrap}>
          <div className="avatar-circle profile-avatar" style={s.avatar} onClick={() => setImageEditorOpen(true)} role="button" aria-label="Edit profile photos" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setImageEditorOpen(true); }}>
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
                  <button type="button" onClick={() => onViewProfile?.(r.id)} aria-label={'View ' + (r.name || 'user') + ' profile'} style={{ width: 62, height: 62, borderRadius: '50%', padding: 0, border: '2px solid #6c63ff', background: '#292929', overflow: 'hidden', cursor: 'pointer' }}>
                    {r.avatar ? <img src={r.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ color: '#fff', fontSize: 22, display: 'grid', placeItems: 'center', height: '100%' }}>{(r.name || '?')[0].toUpperCase()}</span>}
                  </button>
                  <span style={{ color: '#ddd', fontSize: 11, textAlign: 'center', maxWidth: 76, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name || 'Unknown'}</span>
                  {onMessage && r.id && <button type="button" onClick={() => onMessage(r.id)} style={{ border: 0, background: 'rgba(108,99,255,.16)', color: '#aaa4ff', borderRadius: 12, padding: '4px 8px', fontSize: 10 }}>Message</button>}
                </div>
              ))}
            </div>
          )}
          {recent.length > 0 && <button type="button" onClick={async () => { await clearRecentLive(); setRecent([]); }} style={{ border: 0, background: 'transparent', color: '#888', fontSize: 11, padding: '4px 0', cursor: 'pointer' }}>Clear history</button>}
        </section>

        {renderProfileTabs(true, displayName, avatarUrl)}

      </div>
    </div>
  );
}
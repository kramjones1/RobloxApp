import React, { useState } from 'react';
import { SUPABASE_URL, SUPABASE_ANON_KEY, getValidAccessToken } from '../supabaseClient';

type Props = { userId: string };

export default function ProfilePerformanceCheck({ userId }: Props) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState('Ready to test your production profile.');
  const [expanded, setExpanded] = useState(false);

  const run = async () => {
    setRunning(true);
    setExpanded(true);
    setResult('Starting read-only checks…');
    try {
      const token = await getValidAccessToken();
      if (!token) throw new Error('Your LiveMe session expired. Sign in again and retry.');
      const headers = { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token, Accept: 'application/json' };
      const readOnce = async () => {
        const start = Date.now();
        const profileStart = Date.now();
        const profileResponse = await fetch(SUPABASE_URL + '/rest/v1/chat_profiles?user_id=eq.' + encodeURIComponent(userId) + '&select=user_id,display_name,bio,avatar_url,cover_url', { headers });
        if (!profileResponse.ok) throw new Error('Profile request failed: HTTP ' + profileResponse.status);
        await profileResponse.json();
        const profileMs = Date.now() - profileStart;

        const postsStart = Date.now();
        const postsResponse = await fetch(SUPABASE_URL + '/rest/v1/chat_posts?user_id=eq.' + encodeURIComponent(userId) + '&select=id,content,image_paths,created_at&order=created_at.desc&limit=50', { headers });
        if (!postsResponse.ok) throw new Error('Posts request failed: HTTP ' + postsResponse.status);
        const posts = await postsResponse.json();
        const postsMs = Date.now() - postsStart;

        let imageMs: number | null = null;
        let imageBytes = 0;
        let imagePath = '';
        for (const post of posts) {
          if (Array.isArray(post.image_paths) && post.image_paths.length) { imagePath = post.image_paths[0]; break; }
        }
        if (imagePath) {
          const encoded = imagePath.split('/').map(encodeURIComponent).join('/');
          const imageStart = Date.now();
          const imageResponse = await fetch(SUPABASE_URL + '/storage/v1/object/public/profile-photos/' + encoded, { headers: { apikey: SUPABASE_ANON_KEY } });
          if (!imageResponse.ok) throw new Error('Image request failed: HTTP ' + imageResponse.status);
          imageBytes = (await imageResponse.blob()).size;
          imageMs = Date.now() - imageStart;
        }
        return { totalMs: Date.now() - start, profileMs, postsMs, imageMs, imageBytes, postCount: posts.length };
      };

      const lines = ['Read-only production API test', 'Account: ' + userId, ''];
      for (const parallel of [1, 3, 5]) {
        const start = Date.now();
        const results = await Promise.all(Array.from({ length: parallel }, () => readOnce()));
        const avg = (key: 'profileMs' | 'postsMs') => Math.round(results.reduce((sum, item) => sum + item[key], 0) / results.length);
        const images = results.filter(item => item.imageMs !== null);
        lines.push(parallel + ' parallel request' + (parallel === 1 ? '' : 's') + ': ' + (Date.now() - start) + ' ms elapsed');
        lines.push('  Profile average: ' + avg('profileMs') + ' ms');
        lines.push('  Posts/gallery average: ' + avg('postsMs') + ' ms');
        lines.push('  Posts found: ' + results[0].postCount);
        lines.push('  Image download: ' + (images.length ? Math.round(images.reduce((sum, item) => sum + (item.imageMs || 0), 0) / images.length) + ' ms (' + Math.round(images[0].imageBytes / 1024) + ' KB)' : 'No post image found'));
        lines.push('');
      }
      lines.push('Finished. This measures this phone and browser only; it is not a 25- or 200-user load test.');
      setResult(lines.join('\n'));
    } catch (error: any) {
      setResult('Test could not complete: ' + (error?.message || String(error)));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ position: 'fixed', zIndex: 9998, right: 12, bottom: 72, width: 'min(380px, calc(100vw - 24px))', padding: 14, border: '1px solid rgba(108,99,255,.35)', borderRadius: 12, background: 'rgba(108,99,255,.06)' }}>
      <button type="button" onClick={() => setExpanded(value => !value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid #6c63ff', borderRadius: 8, background: 'transparent', color: 'inherit', fontWeight: 700 }}>
        {expanded ? 'Hide' : 'Open'} Profile Performance Test
      </button>
      {expanded && <>
        <p style={{ color: '#aaa', fontSize: 12, lineHeight: 1.5, margin: '10px 0' }}>Runs read-only profile, posts/gallery, and first-image requests against production. It does not create or change any data. It tests 1, 3, then 5 parallel requests from this device only.</p>
        <button type="button" disabled={running} onClick={run} style={{ width: '100%', padding: 12, border: 0, borderRadius: 8, background: '#6c63ff', color: '#fff', fontWeight: 700, opacity: running ? .6 : 1 }}>{running ? 'Testing…' : 'Run test'}</button>
        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 12, color: '#d8dbea', background: '#10131b', padding: 10, borderRadius: 8, marginTop: 10 }}>{result}</pre>
      </>}
    </div>
  );
}

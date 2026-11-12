import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

// Read-only profile API load test. No sign-in, writes, uploads, or DB mutations.
// Required: SUPABASE_ACCESS_TOKEN OR SUPABASE_TEST_EMAIL + SUPABASE_TEST_PASSWORD (local only).
// Optional: SUPABASE_URL, SUPABASE_ANON_KEY, TARGET_USER_ID, IMAGE_PATH,
//           TEST_DURATION (default 30s per stage).
const BASE = (__ENV.SUPABASE_URL || 'https://btkcubibosbtpxcronnd.supabase.co').replace(/\/$/, '');
const KEY = __ENV.SUPABASE_ANON_KEY;
let TOKEN = __ENV.SUPABASE_ACCESS_TOKEN || '';
const TARGET = __ENV.TARGET_USER_ID;
const DURATION = __ENV.TEST_DURATION || '30s';

const profileMs = new Trend('profile_request_ms');
const postsMs = new Trend('posts_request_ms');
const imageMs = new Trend('image_download_ms');
const requestErrors = new Rate('request_errors');

export const options = {
  stages: [
    { duration: DURATION, target: 1 },
    { duration: DURATION, target: 5 },
    { duration: DURATION, target: 10 },
    { duration: DURATION, target: 25 },
    { duration: '15s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
    request_errors: ['rate<0.05'],
  },
  discardResponseBodies: false,
};

function headers(token = TOKEN) {
  return {
    apikey: KEY,
    Authorization: 'Bearer ' + token,
    Accept: 'application/json',
  };
}

export function setup() {
  if (!TOKEN || !KEY) {
    throw new Error('Set SUPABASE_ACCESS_TOKEN and SUPABASE_ANON_KEY locally; never commit or share them.');
  }
  const r = http.get(BASE + '/auth/v1/user', { headers: headers(), tags: { name: 'auth_validate' } });
  if (r.status !== 200) {
    throw new Error('Access token validation failed (HTTP ' + r.status + '). Refresh the token and retry.');
  }
  const user = r.json();
  const targetId = TARGET || user.id;
  return { userId: user.id, targetId, accessToken: TOKEN };
}

export default function (data) {
  const h = headers(data.accessToken);
  let ok = true;

  // Mirrors the current self-profile read path used by the app.
  const p = http.get(
    BASE + '/rest/v1/chat_profiles?user_id=eq.' + encodeURIComponent(data.targetId) + '&select=user_id,display_name,bio,avatar_url,cover_url',
    { headers: h, tags: { name: 'profile_read' } }
  );
  profileMs.add(p.timings.duration);
  ok = check(p, { 'profile read HTTP 200': r => r.status === 200 }) && ok;

  // Posts are the source of truth for image-backed profile content/gallery.
  const posts = http.get(
    BASE + '/rest/v1/chat_posts?user_id=eq.' + encodeURIComponent(data.targetId) + '&select=id,content,image_paths,created_at&order=created_at.desc&limit=50',
    { headers: h, tags: { name: 'profile_posts_read' } }
  );
  postsMs.add(posts.timings.duration);
  ok = check(posts, { 'posts read HTTP 200': r => r.status === 200 }) && ok;

  if (posts.status === 200) {
    let rows = [];
    try { rows = posts.json(); } catch (_) {}
    let imagePath = __ENV.IMAGE_PATH || '';
    if (!imagePath) {
      for (const row of rows) {
        if (Array.isArray(row.image_paths) && row.image_paths.length) {
          imagePath = row.image_paths[0];
          break;
        }
      }
    }
    if (imagePath) {
      const encodedPath = imagePath.split('/').map(encodeURIComponent).join('/');
      const img = http.get(BASE + '/storage/v1/object/public/profile-photos/' + encodedPath, {
        headers: { apikey: KEY },
        tags: { name: 'profile_image_download' },
      });
      imageMs.add(img.timings.duration);
      ok = check(img, { 'profile image HTTP 200': r => r.status === 200 }) && ok;
    }
  }
  requestErrors.add(!ok);
  sleep(1);
}

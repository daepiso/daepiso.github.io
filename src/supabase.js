import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// index.html 이 CDN 에서 전역 supabase 를 먼저 로드한다.
export const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
  realtime: { params: { eventsPerSecond: 2 } },
});

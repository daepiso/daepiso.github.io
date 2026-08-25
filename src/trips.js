import {
  TRIP_STALE_MS,
  ARRIVAL_RADIUS_M,
  STORAGE_KEYS,
  HEARTBEAT_INTERVAL_MS,
} from './constants.js';
import { haversineMeters } from './geo.js';

// ─────────────────────────────── 판정 (순수 함수, 테스트 대상)

export function isStale(lastSeenAt, now = new Date()) {
  const last = lastSeenAt instanceof Date ? lastSeenAt : new Date(lastSeenAt);
  return now.getTime() - last.getTime() > TRIP_STALE_MS;
}

export function hasArrived(current, shelter) {
  return haversineMeters(current, shelter) <= ARRIVAL_RADIUS_M;
}

// ─────────────────────────────── 이동 기록
// 서버가 아는 것은 "어느 대피소를 골랐는가" 뿐이다.
// 이동 경로도, 상세 좌표도 보내지 않는다.

let heartbeatTimer = null;
let countsChannel = null;

export function getDeviceId(storage = globalThis.localStorage) {
  let id = storage.getItem(STORAGE_KEYS.deviceId);
  if (!id) {
    id = crypto.randomUUID();
    storage.setItem(STORAGE_KEYS.deviceId, id);
  }
  return id;
}

export async function startTrip(shelterId) {
  const { db } = await import('./supabase.js');
  const { error } = await db.rpc('start_trip', {
    p_device_id: getDeviceId(),
    p_shelter_id: shelterId,
  });
  if (error) throw new Error(`이동 시작 기록 실패: ${error.message}`);

  clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    sendHeartbeat().catch(() => {});
  }, HEARTBEAT_INTERVAL_MS);
}

export async function sendHeartbeat() {
  const { db } = await import('./supabase.js');
  await db.rpc('trip_heartbeat', { p_device_id: getDeviceId() });
}

export async function endTrip(reason) {
  clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  const { db } = await import('./supabase.js');
  await db.rpc('end_trip', { p_device_id: getDeviceId(), p_reason: reason });
}

export function isTripActive() {
  return heartbeatTimer !== null;
}

export async function fetchCounts(shelterIds) {
  if (shelterIds.length === 0) return new Map();
  const { db } = await import('./supabase.js');
  const { data, error } = await db.rpc('shelter_counts', { p_shelter_ids: shelterIds });
  if (error) return new Map();
  return new Map((data ?? []).map((r) => [r.shelter_id, r.moving_count]));
}

// 인원 수 실시간 구독. 실패해도 앱은 계속 동작해야 한다.
export async function subscribeCounts(onChange) {
  const { db } = await import('./supabase.js');
  await unsubscribeCounts();
  countsChannel = db
    .channel('shelter-counts')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'shelter_live_counts' },
      (payload) => {
        const row = payload.new ?? payload.old;
        if (row?.shelter_id != null) onChange(row.shelter_id, row.moving_count ?? 0);
      },
    )
    .subscribe();
  return countsChannel;
}

export async function unsubscribeCounts() {
  if (!countsChannel) return;
  const { db } = await import('./supabase.js');
  await db.removeChannel(countsChannel);
  countsChannel = null;
}

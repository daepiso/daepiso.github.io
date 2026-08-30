import {
  TRIP_STALE_MS,
  ARRIVAL_RADIUS_M,
  STORAGE_KEYS,
  HEARTBEAT_INTERVAL_MS,
  COUNT_POLL_INTERVAL_MS,
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

// 내가 지금 어디로 가는 중인지 기억한다.
// 길찾기를 누르면 카카오맵으로 넘어가면서 화면이 통째로 사라지므로,
// 돌아왔을 때 "내가 가는 중"임을 알려면 저장해둬야 한다.
export function getActiveTrip(storage = globalThis.localStorage) {
  try {
    const raw = storage.getItem(STORAGE_KEYS.activeTrip);
    if (!raw) return null;
    const t = JSON.parse(raw);
    if (!t?.shelterId) return null;
    if (isStale(t.startedAt)) return null;
    return t;
  } catch {
    return null;
  }
}

function rememberTrip(shelterId, storage = globalThis.localStorage) {
  try {
    storage.setItem(
      STORAGE_KEYS.activeTrip,
      JSON.stringify({ shelterId, startedAt: new Date().toISOString() }),
    );
  } catch { /* 무시 */ }
}

function forgetTrip(storage = globalThis.localStorage) {
  try {
    storage.removeItem(STORAGE_KEYS.activeTrip);
  } catch { /* 무시 */ }
}

export async function startTrip(shelterId) {
  const { db } = await import('./supabase.js');
  const { error } = await db.rpc('start_trip', {
    p_device_id: getDeviceId(),
    p_shelter_id: shelterId,
  });
  if (error) throw new Error(`이동 시작 기록 실패: ${error.message}`);

  rememberTrip(shelterId);
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
  forgetTrip();
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

// 인원 수를 지켜보는 방법은 두 가지다.
//
// 실시간 연결(웹소켓)은 즉시 반영되지만 사람마다 하나씩 붙잡고 있어서
// 동시 200명이 한계다. 재난 때는 그보다 많이 몰릴 수 있다.
//
// 그래서 실시간을 먼저 시도하고, 자리가 없거나 끊기면 주기 조회로
// 넘어간다. 주기 조회는 연결을 붙잡지 않아 사람 수 제한이 없다.
// 인원 수가 20초 늦게 갱신되는 것은 대피에 아무 지장이 없다.

let pollTimer = null;

function stopPolling() {
  clearInterval(pollTimer);
  pollTimer = null;
}

function startPolling(getShelterIds, onCounts) {
  if (pollTimer) return;
  const tick = async () => {
    const ids = getShelterIds();
    if (ids.length === 0) return;
    const counts = await fetchCounts(ids);
    if (counts.size > 0) onCounts(counts);
  };
  tick();
  pollTimer = setInterval(tick, COUNT_POLL_INTERVAL_MS);
}

export function isPolling() {
  return pollTimer !== null;
}

export async function watchCounts({ getShelterIds, onChange, onCounts }) {
  const { db } = await import('./supabase.js');
  await unwatchCounts();

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
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        stopPolling();
        return;
      }
      // CHANNEL_ERROR, TIMED_OUT, CLOSED — 실시간을 못 쓰는 상황이다.
      startPolling(getShelterIds, onCounts);
    });

  return countsChannel;
}

export async function unwatchCounts() {
  stopPolling();
  if (!countsChannel) return;
  const { db } = await import('./supabase.js');
  await db.removeChannel(countsChannel);
  countsChannel = null;
}

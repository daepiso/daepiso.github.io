import { TRIP_STALE_MS, ARRIVAL_RADIUS_M } from './constants.js';
import { haversineMeters } from './geo.js';

export function isStale(lastSeenAt, now = new Date()) {
  const last = lastSeenAt instanceof Date ? lastSeenAt : new Date(lastSeenAt);
  return now.getTime() - last.getTime() > TRIP_STALE_MS;
}

export function hasArrived(current, shelter) {
  return haversineMeters(current, shelter) <= ARRIVAL_RADIUS_M;
}

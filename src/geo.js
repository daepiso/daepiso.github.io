import { RADIUS_STEPS_M, WALK_METERS_PER_MINUTE } from './constants.js';

const EARTH_RADIUS_M = 6371000;
const toRad = (deg) => (deg * Math.PI) / 180;

export function haversineMeters(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s))));
}

export function formatDistance(meters) {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)}km`;
  const rounded = Math.max(10, Math.round(meters / 10) * 10);
  return rounded >= 1000 ? '1.0km' : `${rounded}m`;
}

export function walkMinutes(meters) {
  return Math.max(1, Math.round(meters / WALK_METERS_PER_MINUTE));
}

export function expandRadius(currentM) {
  const i = RADIUS_STEPS_M.indexOf(currentM);
  if (i === -1 || i === RADIUS_STEPS_M.length - 1) return null;
  return RADIUS_STEPS_M[i + 1];
}

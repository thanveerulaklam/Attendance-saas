const EARTH_RADIUS_M = 6_371_000;

export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

export type FieldSite = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  radius_m: number;
};

export function findMatchingFieldSite(
  lat: number,
  lng: number,
  sites: FieldSite[]
): { site: FieldSite; distanceM: number } | null {
  let best: { site: FieldSite; distanceM: number } | null = null;
  for (const site of sites) {
    const distanceM = haversineDistanceMeters(
      lat,
      lng,
      Number(site.latitude),
      Number(site.longitude)
    );
    if (distanceM <= Number(site.radius_m) && (!best || distanceM < best.distanceM)) {
      best = { site, distanceM };
    }
  }
  return best;
}

export function nearestFieldSite(
  lat: number,
  lng: number,
  sites: FieldSite[]
): { site: FieldSite; distanceM: number } | null {
  let best: { site: FieldSite; distanceM: number } | null = null;
  for (const site of sites) {
    const distanceM = haversineDistanceMeters(
      lat,
      lng,
      Number(site.latitude),
      Number(site.longitude)
    );
    if (!best || distanceM < best.distanceM) {
      best = { site, distanceM };
    }
  }
  return best;
}

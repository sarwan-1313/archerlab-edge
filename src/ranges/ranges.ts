/**
 * Finding archery ranges and clubs near the athlete, from OpenStreetMap
 * (places tagged sport=archery), through the public Overpass API. Only a
 * rounded location (about 1 km) is sent, and only when the athlete asks.
 */

export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
export const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

export interface LatLon { lat: number; lon: number }

export interface Range {
  id: string;
  name: string;
  /** False when OpenStreetMap has no name for the place. */
  named: boolean;
  lat: number;
  lon: number;
  distanceKm: number;
  kind: string;
  /** False when OpenStreetMap says the place is private or members only. */
  publicAccess: boolean | null;
  indoor: boolean | null;
  address: string | null;
  website: string | null;
  phone: string | null;
  openingHours: string | null;
}

/** Rounds a location to two decimals (about 1 km), so the exact position never leaves the device. */
export function coarse(point: LatLon): LatLon {
  return { lat: Math.round(point.lat * 100) / 100, lon: Math.round(point.lon * 100) / 100 };
}

/** Great-circle distance in kilometres. */
export function distanceKm(a: LatLon, b: LatLon): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function overpassQuery(centre: LatLon, radiusKm: number): string {
  const { lat, lon } = coarse(centre);
  const around = `(around:${Math.round(radiusKm * 1000)},${lat},${lon})`;
  return `[out:json][timeout:25];(nwr["sport"="archery"]${around};nwr["club"="archery"]${around};);out center tags 80;`;
}

interface OverpassElement { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }

const KIND_LABEL: Record<string, string> = {
  pitch: 'Range', sports_centre: 'Sports centre', club: 'Club', sports_hall: 'Indoor hall', fitness_centre: 'Indoor range', shop: 'Archery shop',
};

function kindOf(tags: Record<string, string>): string {
  if (tags.shop) return 'Archery shop';
  if (tags.club) return 'Club';
  if (tags.leisure && KIND_LABEL[tags.leisure]) return KIND_LABEL[tags.leisure];
  if (tags.building === 'sports_hall') return 'Indoor hall';
  return 'Range';
}

function addressOf(tags: Record<string, string>): string | null {
  const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
  const parts = [street, tags['addr:city'] ?? tags['addr:town'] ?? tags['addr:village'], tags['addr:postcode']].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

/** Turns an Overpass response into ranges sorted by distance, merging duplicates (a club and its range mapped at the same spot). */
export function parseRanges(response: unknown, from: LatLon): Range[] {
  const elements = (response as { elements?: OverpassElement[] })?.elements;
  if (!Array.isArray(elements)) return [];
  const ranges: Range[] = [];
  for (const element of elements) {
    const lat = element.lat ?? element.center?.lat;
    const lon = element.lon ?? element.center?.lon;
    if (typeof lat !== 'number' || typeof lon !== 'number') continue;
    const tags = element.tags ?? {};
    const access = tags.access;
    const website = tags.website ?? tags['contact:website'] ?? tags.url ?? null;
    ranges.push({
      id: `${element.type}/${element.id}`,
      name: tags.name ?? tags.operator ?? (tags.club ? 'Archery club' : 'Archery range'),
      named: Boolean(tags.name ?? tags.operator),
      lat, lon,
      distanceKm: distanceKm(from, { lat, lon }),
      kind: kindOf(tags),
      publicAccess: access ? !['private', 'members', 'no'].includes(access) : null,
      indoor: tags.indoor === 'yes' || tags.covered === 'yes' || tags.building === 'sports_hall' ? true : tags.indoor === 'no' ? false : null,
      address: addressOf(tags),
      website: website && /^https?:\/\//i.test(website) ? website : website ? `https://${website}` : null,
      phone: tags.phone ?? tags['contact:phone'] ?? null,
      openingHours: tags.opening_hours ?? null,
    });
  }
  ranges.sort((a, b) => a.distanceKm - b.distanceKm);
  const merged: Range[] = [];
  for (const range of ranges) {
    const twin = merged.find((other) => distanceKm(other, range) < 0.15 && (other.name === range.name || !other.named || !range.named));
    if (!twin) { merged.push(range); continue; }
    if (!twin.named && range.named) { twin.name = range.name; twin.named = true; }
    twin.website ??= range.website;
    twin.address ??= range.address;
    twin.phone ??= range.phone;
    twin.openingHours ??= range.openingHours;
    twin.publicAccess ??= range.publicAccess;
    twin.indoor ??= range.indoor;
  }
  return merged;
}

export function directionsLinks(range: Pick<Range, 'lat' | 'lon' | 'name'>) {
  const at = `${range.lat.toFixed(6)},${range.lon.toFixed(6)}`;
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${at}`,
    apple: `https://maps.apple.com/?daddr=${at}&q=${encodeURIComponent(range.name)}`,
    osm: `https://www.openstreetmap.org/?mlat=${range.lat.toFixed(6)}&mlon=${range.lon.toFixed(6)}#map=16/${at.replace(',', '/')}`,
  };
}

export async function findRanges(centre: LatLon, radiusKm: number, fetcher: typeof fetch = (...args) => fetch(...args)): Promise<Range[]> {
  let response: Response;
  try {
    response = await fetcher(OVERPASS_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `data=${encodeURIComponent(overpassQuery(centre, radiusKm))}` });
  } catch {
    throw new Error('OpenStreetMap could not be reached. Check your connection and try again.');
  }
  if (response.status === 429 || response.status === 504) throw new Error('The map service is busy. Wait a minute and try again.');
  if (!response.ok) throw new Error(`The map service returned an error (${response.status}).`);
  return parseRanges(await response.json(), centre);
}

/** Looks up a town or postcode, for athletes who would rather not share their location. */
export async function geocode(query: string, fetcher: typeof fetch = (...args) => fetch(...args)): Promise<(LatLon & { label: string }) | null> {
  const url = `${NOMINATIM_URL}?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
  let response: Response;
  try { response = await fetcher(url, { headers: { accept: 'application/json' } }); } catch { throw new Error('The place search could not be reached. Check your connection.'); }
  if (!response.ok) throw new Error(`The place search returned an error (${response.status}).`);
  const results = await response.json() as Array<{ lat: string; lon: string; display_name: string }>;
  const first = results[0];
  return first ? { lat: Number(first.lat), lon: Number(first.lon), label: first.display_name } : null;
}

// ---------- map tiles ----------

export const TILE_SIZE = 256;

/** Web Mercator world pixel position of a point at a zoom level. */
export function worldPixel(point: LatLon, zoom: number): { x: number; y: number } {
  const scale = TILE_SIZE * 2 ** zoom;
  const sin = Math.sin((Math.max(-85, Math.min(85, point.lat)) * Math.PI) / 180);
  return { x: ((point.lon + 180) / 360) * scale, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale };
}

/** The highest zoom (up to 16) at which every point fits in a width × height view with some padding. */
export function fitZoom(points: readonly LatLon[], width: number, height: number, padding = 40): number {
  if (points.length < 2) return 13;
  for (let zoom = 16; zoom >= 2; zoom -= 1) {
    const pixels = points.map((point) => worldPixel(point, zoom));
    const xs = pixels.map((p) => p.x); const ys = pixels.map((p) => p.y);
    if (Math.max(...xs) - Math.min(...xs) <= width - padding * 2 && Math.max(...ys) - Math.min(...ys) <= height - padding * 2) return zoom;
  }
  return 2;
}

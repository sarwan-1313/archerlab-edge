import { describe, expect, it } from 'vitest';
import { coarse, directionsLinks, distanceKm, findRanges, fitZoom, geocode, overpassQuery, parseRanges, worldPixel } from './ranges';

const home = { lat: 37.7219, lon: -122.4782 };

describe('archery ranges', () => {
  it('sends only a rounded location', () => {
    expect(coarse({ lat: 37.72191, lon: -122.47823 })).toEqual({ lat: 37.72, lon: -122.48 });
    const query = overpassQuery(home, 25);
    expect(query).toContain('around:25000,37.72,-122.48');
    expect(query).not.toContain('37.7219');
  });

  it('measures distance', () => {
    expect(distanceKm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(111.19, 1);
  });

  it('reads places, sorts by distance and merges a club with its unnamed range', () => {
    const ranges = parseRanges({
      elements: [
        { type: 'way', id: 2, center: { lat: 37.80, lon: -122.47 }, tags: { sport: 'archery', leisure: 'pitch' } },
        { type: 'node', id: 3, lat: 37.8001, lon: -122.4701, tags: { sport: 'archery', club: 'sport', name: 'Golden Gate Archery', website: 'gga.example.org', access: 'members' } },
        { type: 'node', id: 1, lat: 37.73, lon: -122.48, tags: { sport: 'archery', name: 'Lake Range', indoor: 'yes', 'addr:street': 'Main St', 'addr:housenumber': '5', 'addr:city': 'SF' } },
        { type: 'node', id: 4, tags: { sport: 'archery' } },
      ],
    }, home);
    expect(ranges.map((range) => range.name)).toEqual(['Lake Range', 'Golden Gate Archery']);
    expect(ranges[0]).toMatchObject({ indoor: true, address: '5 Main St, SF', kind: 'Range' });
    expect(ranges[1]).toMatchObject({ website: 'https://gga.example.org', publicAccess: false });
    expect(parseRanges({ nope: true }, home)).toEqual([]);
    expect(directionsLinks(ranges[0]).google).toBe('https://www.google.com/maps/dir/?api=1&destination=37.730000,-122.480000');
  });

  it('explains a busy service and a failed connection', async () => {
    await expect(findRanges(home, 10, (async () => new Response('', { status: 429 })) as typeof fetch)).rejects.toThrow('busy');
    await expect(findRanges(home, 10, (async () => { throw new TypeError('offline'); }) as typeof fetch)).rejects.toThrow('could not be reached');
    const ok = await findRanges(home, 10, (async () => new Response(JSON.stringify({ elements: [] }), { status: 200 })) as typeof fetch);
    expect(ok).toEqual([]);
  });

  it('geocodes a place name', async () => {
    const found = await geocode('San Francisco', (async () => new Response(JSON.stringify([{ lat: '37.77', lon: '-122.41', display_name: 'San Francisco, CA' }]))) as typeof fetch);
    expect(found).toEqual({ lat: 37.77, lon: -122.41, label: 'San Francisco, CA' });
  });

  it('places points on map tiles and picks a zoom that fits them', () => {
    expect(worldPixel({ lat: 0, lon: 0 }, 0)).toEqual({ x: 128, y: 128 });
    const zoom = fitZoom([home, { lat: 37.80, lon: -122.47 }], 600, 360);
    expect(zoom).toBeGreaterThanOrEqual(10);
    expect(zoom).toBeLessThanOrEqual(13);
    expect(fitZoom([home], 600, 360)).toBe(13);
  });
});

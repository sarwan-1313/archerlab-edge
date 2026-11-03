import { describe, expect, it } from 'vitest';
import { COUNTRIES, coarse, defaultCountry, directionsLinks, distanceKm, findRanges, fitZoom, fromWorldPixel, geocode, geocodeUrls, overpassQuery, parseRanges, worldPixel } from './ranges';

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
    const found = await geocode('San Francisco', 'us', (async () => new Response(JSON.stringify([{ lat: '37.77', lon: '-122.41', display_name: 'San Francisco, CA' }]))) as typeof fetch);
    expect(found).toEqual({ lat: 37.77, lon: -122.41, label: 'San Francisco, CA' });
  });

  it('searches a postcode inside the chosen country, then falls back to plain text', async () => {
    const urls = geocodeUrls('94587', 'US');
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain('postalcode=94587');
    expect(urls[0]).toContain('countrycodes=us');
    expect(urls[1]).toContain('q=94587');
    expect(geocodeUrls('Union City, CA', 'us')).toHaveLength(1);
    const asked: string[] = [];
    const found = await geocode('94587', 'us', (async (url: string) => {
      asked.push(url);
      return new Response(JSON.stringify(url.includes('postalcode') ? [] : [{ lat: '37.59', lon: '-122.02', display_name: 'Union City, CA' }]));
    }) as unknown as typeof fetch);
    expect(asked).toHaveLength(2);
    expect(found?.label).toBe('Union City, CA');
    expect(await geocode('nowhere', 'us', (async () => new Response('[]')) as typeof fetch)).toBeNull();
  });

  it('picks a starting country from the browser language', () => {
    expect(defaultCountry('en-IN')).toBe('in');
    expect(defaultCountry('pa_IN')).toBe('in');
    expect(defaultCountry('en')).toBe('us');
    expect(defaultCountry('en-ZZ')).toBe('us');
    expect(COUNTRIES.every((country) => /^[a-z]{2}$/.test(country.code))).toBe(true);
  });

  it('stops waiting on a server that never answers, and tries the backup', async () => {
    const hang = ((_: string, init?: RequestInit) => new Promise((_resolve, reject) => { init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))); })) as unknown as typeof fetch;
    await expect(findRanges(home, 10, hang, 20)).rejects.toThrow('too long');
    await expect(geocode('x', 'us', hang, 20)).rejects.toThrow('too long');
    let calls = 0;
    const flaky = (async () => { calls += 1; return calls === 1 ? new Response('', { status: 504 }) : new Response(JSON.stringify({ elements: [] })); }) as typeof fetch;
    expect(await findRanges(home, 10, flaky)).toEqual([]);
    expect(calls).toBe(2);
  });

  it('places points on map tiles and picks a zoom that fits them', () => {
    expect(worldPixel({ lat: 0, lon: 0 }, 0)).toEqual({ x: 128, y: 128 });
    const zoom = fitZoom([home, { lat: 37.80, lon: -122.47 }], 600, 360);
    expect(zoom).toBeGreaterThanOrEqual(10);
    expect(zoom).toBeLessThanOrEqual(13);
    expect(fitZoom([home], 600, 360)).toBe(13);
    const back = fromWorldPixel(worldPixel(home, 12), 12);
    expect(back.lat).toBeCloseTo(home.lat, 5);
    expect(back.lon).toBeCloseTo(home.lon, 5);
    expect(fromWorldPixel({ x: 0, y: 0 }, 2).lat).toBeGreaterThan(80);
  });
});

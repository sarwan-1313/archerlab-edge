import { useMemo, useState, type FormEvent } from 'react';
import { ActionButton } from '../components/ActionButton';
import { AppIcon } from '../components/AppIcon';
import { PageHeader } from '../components/PageHeader';
import { COUNTRIES, TILE_SIZE, defaultCountry, directionsLinks, findRanges, fitZoom, geocode, worldPixel, type LatLon, type Range } from '../ranges/ranges';
import { useLanguage } from '../i18n/i18n';
import '../styles/video.css';

const MAP_W = 640;
const MAP_H = 380;
const RADII = [10, 25, 50, 100];
const COUNTRY_KEY = 'archerlab-edge:range-country';

function initialCountry(): string {
  try {
    const saved = localStorage.getItem(COUNTRY_KEY);
    if (saved && COUNTRIES.some((country) => country.code === saved)) return saved;
  } catch { /* fall back to the browser language */ }
  return defaultCountry(typeof navigator === 'undefined' ? undefined : navigator.language);
}

/** A small OpenStreetMap tile map with numbered markers. */
function RangeMap({ centre, ranges, selected, onSelect }: { centre: LatLon; ranges: readonly Range[]; selected: string | null; onSelect: (id: string) => void }) {
  const shown = ranges.slice(0, 20);
  const zoom = fitZoom([centre, ...shown.slice(0, 8)], MAP_W, MAP_H);
  const points = [centre, ...shown.slice(0, 8)].map((point) => worldPixel(point, zoom));
  const xs = points.map((p) => p.x); const ys = points.map((p) => p.y);
  const middle = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  const origin = { x: middle.x - MAP_W / 2, y: middle.y - MAP_H / 2 };
  const tiles: Array<{ x: number; y: number; key: string }> = [];
  const count = 2 ** zoom;
  for (let tx = Math.floor(origin.x / TILE_SIZE); tx <= Math.floor((origin.x + MAP_W) / TILE_SIZE); tx += 1) {
    for (let ty = Math.floor(origin.y / TILE_SIZE); ty <= Math.floor((origin.y + MAP_H) / TILE_SIZE); ty += 1) {
      if (ty < 0 || ty >= count) continue;
      tiles.push({ x: tx, y: ty, key: `${tx}-${ty}` });
    }
  }
  const at = (point: LatLon) => { const pixel = worldPixel(point, zoom); return { x: pixel.x - origin.x, y: pixel.y - origin.y }; };
  const me = at(centre);
  return (
    <figure className="range-map">
      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} role="img" aria-label={`Map of ${shown.length} archery places near you`}>
        {tiles.map((tile) => (
          <image key={tile.key} href={`https://tile.openstreetmap.org/${zoom}/${((tile.x % count) + count) % count}/${tile.y}.png`} x={tile.x * TILE_SIZE - origin.x} y={tile.y * TILE_SIZE - origin.y} width={TILE_SIZE} height={TILE_SIZE} />
        ))}
        <circle cx={me.x} cy={me.y} r={8} fill="#2ee6ff" stroke="#04060a" strokeWidth={3} />
        {shown.map((range, index) => {
          const p = at(range);
          if (p.x < -10 || p.y < -10 || p.x > MAP_W + 10 || p.y > MAP_H + 10) return null;
          const active = range.id === selected;
          return (
            <g key={range.id} className="range-map__pin" onClick={() => onSelect(range.id)}>
              <path d={`M ${p.x} ${p.y} l -10 -18 a 12 12 0 1 1 20 0 z`} fill={active ? '#ff6b1a' : '#ffc53d'} stroke="#04060a" strokeWidth={2} />
              <text x={p.x} y={p.y - 22} textAnchor="middle" fontSize={11} fontWeight={800} fill="#04060a">{index + 1}</text>
            </g>
          );
        })}
      </svg>
      <figcaption>Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a></figcaption>
    </figure>
  );
}

/** Archery ranges, clubs and shops near the athlete, from OpenStreetMap. */
export function RangesPage() {
  const [centre, setCentre] = useState<(LatLon & { label: string }) | null>(null);
  const [radius, setRadius] = useState(25);
  const [ranges, setRanges] = useState<Range[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [place, setPlace] = useState('');
  const [country, setCountry] = useState(initialCountry);
  const [selected, setSelected] = useState<string | null>(null);
  const { t } = useLanguage();

  const search = async (point: LatLon & { label: string }, km = radius) => {
    setBusy(true);
    setStatus(null);
    setCentre(point);
    try {
      const found = await findRanges(point, km);
      setRanges(found);
      setSelected(null);
      if (!found.length) setStatus(`No archery places are mapped within ${km} km of ${point.label}. Try a wider search; places only appear here once someone adds them to OpenStreetMap.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The search failed.');
    } finally {
      setBusy(false);
    }
  };

  const useLocation = () => {
    if (!('geolocation' in navigator)) { setStatus('This browser cannot share your location. Search for a town instead.'); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (position) => void search({ lat: position.coords.latitude, lon: position.coords.longitude, label: 'your location' }),
      (error) => { setBusy(false); setStatus(error.code === error.PERMISSION_DENIED ? 'Location was not shared. Search for a town or postcode instead.' : 'Your location could not be found. Search for a town instead.'); },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 },
    );
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!place.trim()) return;
    setBusy(true);
    try {
      try { localStorage.setItem(COUNTRY_KEY, country); } catch { /* remembered for this visit only */ }
      const found = await geocode(place.trim(), country);
      const countryName = COUNTRIES.find((item) => item.code === country)?.name ?? 'that country';
      if (!found) { setBusy(false); setStatus(`“${place.trim()}” was not found in ${countryName}. Check the country, then try the postcode again or a nearby town.`); return; }
      await search({ ...found, label: found.label.split(',').slice(0, 2).join(',') });
    } catch (error) {
      setBusy(false);
      setStatus(error instanceof Error ? error.message : 'The search failed.');
    }
  };

  const list = useMemo(() => ranges ?? [], [ranges]);

  return (
    <div className="page-container page-container--wide scoring-page">
      <PageHeader title={t('ranges.title', 'Find a range')} subtitle={t('ranges.subtitle', 'Archery ranges, clubs and shops near you, from OpenStreetMap. Your location is only used when you ask, rounded to about 1 km.')} />
      <section className="va-panel" aria-labelledby="ranges-search-title">
        <h2 id="ranges-search-title">{t('ranges.where', 'Where are you?')}</h2>
        <div className="va-actions">
          <ActionButton variant="primary" type="button" disabled={busy} onClick={useLocation}><AppIcon name="map" size={16} /> {t('ranges.useLocation', 'Use my location')}</ActionButton>
          <label className="end-timer__sound">Within
            <select value={radius} onChange={(event) => { const km = Number(event.target.value); setRadius(km); if (centre) void search(centre, km); }}>{RADII.map((km) => <option key={km} value={km}>{km} km</option>)}</select>
          </label>
        </div>
        <form className="scoring-fields" onSubmit={(event) => void submit(event)}>
          <label>Country
            <select value={country} onChange={(event) => setCountry(event.target.value)}>
              {COUNTRIES.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
            </select>
          </label>
          <label>Postcode, town or city<input value={place} onChange={(event) => setPlace(event.target.value)} placeholder="e.g. 94587 or Union City" autoComplete="postal-code" /></label>
          <ActionButton variant="secondary" type="submit" disabled={busy}>{busy ? 'Searching…' : t('ranges.search', 'Search')}</ActionButton>
        </form>
        {status ? <p className="va-import-status" role="status">{status}</p> : null}
      </section>

      {centre && list.length ? (
        <div className="scoring-layout">
          <section className="va-panel" aria-label="Map"><RangeMap centre={centre} ranges={list} selected={selected} onSelect={setSelected} /></section>
          <section className="va-panel" aria-labelledby="ranges-list-title">
            <h2 id="ranges-list-title">{list.length} near {centre.label} <small>within {radius} km</small></h2>
            <ol className="range-list">
              {list.slice(0, 40).map((range, index) => {
                const links = directionsLinks(range);
                return (
                  <li key={range.id} className={range.id === selected ? 'is-selected' : undefined}>
                    <button type="button" className="range-list__name" onClick={() => setSelected(range.id)}>
                      <span className="range-list__number">{index + 1}</span>
                      <strong>{range.name}</strong>
                      <small>{range.distanceKm < 1 ? `${Math.round(range.distanceKm * 1000)} m` : `${range.distanceKm.toFixed(1)} km`} · {range.kind}{range.indoor ? ' · indoor' : ''}{range.publicAccess === false ? ' · members only' : ''}</small>
                    </button>
                    {range.address ? <span className="va-faint">{range.address}</span> : null}
                    {range.openingHours ? <span className="va-faint">Hours: {range.openingHours}</span> : null}
                    <span className="range-list__links">
                      <a href={links.google} target="_blank" rel="noreferrer">{t('ranges.directions', 'Directions')}</a>
                      <a href={links.apple} target="_blank" rel="noreferrer">Apple Maps</a>
                      {range.website ? <a href={range.website} target="_blank" rel="noreferrer">Website</a> : null}
                      {range.phone ? <a href={`tel:${range.phone.replace(/[^+\d]/g, '')}`}>Call</a> : null}
                    </span>
                  </li>
                );
              })}
            </ol>
            <p className="va-faint">Listings come from OpenStreetMap volunteers and can be out of date: check with the club before you go. Missing a range? <a href="https://www.openstreetmap.org/" target="_blank" rel="noreferrer">Add it to OpenStreetMap</a>.</p>
          </section>
        </div>
      ) : null}
    </div>
  );
}

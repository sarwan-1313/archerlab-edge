import { useState } from 'react';
import { ActionButton } from '../components/ActionButton';
import { AppIcon } from '../components/AppIcon';
import { PageHeader } from '../components/PageHeader';
import { estimateSightMark, loadEquipment, newBow, saveEquipment, setSightMark, type BowSetup, type EquipmentData } from '../equipment/equipment';
import '../styles/video.css';

const BOW_TYPES: Array<{ value: BowSetup['bowType']; label: string }> = [
  { value: 'recurve', label: 'Recurve' }, { value: 'compound', label: 'Compound' }, { value: 'barebow', label: 'Barebow' }, { value: 'traditional', label: 'Traditional' }, { value: 'other', label: 'Other' },
];
const COMMON_DISTANCES = [18, 25, 30, 40, 50, 60, 70, 90];

const numberOrNull = (value: string) => {
  const parsed = Number(value);
  return value.trim() && Number.isFinite(parsed) ? parsed : null;
};

function BowEditor({ bow, onChange, onDelete }: { bow: BowSetup; onChange: (bow: BowSetup) => void; onDelete: () => void }) {
  const [distance, setDistance] = useState('');
  const [mark, setMark] = useState('');
  const [lookup, setLookup] = useState('');
  const set = <K extends keyof BowSetup>(key: K, value: BowSetup[K]) => onChange({ ...bow, [key]: value });
  const estimate = numberOrNull(lookup) !== null ? estimateSightMark(bow.sightMarks, numberOrNull(lookup)!) : null;
  const missing = COMMON_DISTANCES.filter((d) => !bow.sightMarks.some((item) => item.distanceM === d));

  return (
    <section className="va-panel" aria-label={bow.name}>
      <div className="scoring-fields">
        <label>Name<input value={bow.name} onChange={(event) => set('name', event.target.value)} /></label>
        <label>Bow type<select value={bow.bowType} onChange={(event) => set('bowType', event.target.value as BowSetup['bowType'])}>{BOW_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
        <label>Draw weight (lb)<input inputMode="decimal" value={bow.drawWeightLb ?? ''} onChange={(event) => set('drawWeightLb', numberOrNull(event.target.value))} /></label>
        <label>Draw length (in)<input inputMode="decimal" value={bow.drawLengthIn ?? ''} onChange={(event) => set('drawLengthIn', numberOrNull(event.target.value))} /></label>
        <label>Arrows<input value={bow.arrow} placeholder="Model" onChange={(event) => set('arrow', event.target.value)} /></label>
        <label>Spine<input value={bow.spine} onChange={(event) => set('spine', event.target.value)} /></label>
        <label>Arrow length (in)<input inputMode="decimal" value={bow.arrowLengthIn ?? ''} onChange={(event) => set('arrowLengthIn', numberOrNull(event.target.value))} /></label>
        <label>Point weight (gr)<input inputMode="numeric" value={bow.pointGrains ?? ''} onChange={(event) => set('pointGrains', numberOrNull(event.target.value))} /></label>
      </div>
      <label className="scoring-notes">Notes<input value={bow.notes} placeholder="Brace height, tiller, limbs, plunger…" onChange={(event) => set('notes', event.target.value)} /></label>

      <h3>Sight marks</h3>
      {bow.sightMarks.length ? (
        <table className="compare-table">
          <thead><tr><th scope="col">Distance</th><th scope="col">Mark</th><th scope="col"><span className="sr-only">Remove</span></th></tr></thead>
          <tbody>{bow.sightMarks.map((item) => (
            <tr key={item.distanceM}><th scope="row">{item.distanceM} m</th><td>{item.mark}</td><td><button type="button" className="privacy-link" onClick={() => set('sightMarks', bow.sightMarks.filter((other) => other.distanceM !== item.distanceM))}>Remove</button></td></tr>
          ))}</tbody>
        </table>
      ) : <p className="va-faint">No marks yet. Add the mark you use at each distance you shoot.</p>}
      <form className="scoring-fields" onSubmit={(event) => {
        event.preventDefault();
        const d = numberOrNull(distance); const m = numberOrNull(mark);
        if (d === null || m === null || d <= 0) return;
        set('sightMarks', setSightMark(bow.sightMarks, d, m));
        setDistance(''); setMark('');
      }}>
        <label>Distance (m)<input inputMode="decimal" value={distance} onChange={(event) => setDistance(event.target.value)} /></label>
        <label>Mark<input inputMode="decimal" value={mark} onChange={(event) => setMark(event.target.value)} /></label>
        <ActionButton variant="secondary" type="submit"><AppIcon name="plus" size={16} /> Add mark</ActionButton>
      </form>

      <h3>Estimate a mark</h3>
      <div className="scoring-fields">
        <label>Distance (m)<input inputMode="decimal" value={lookup} placeholder={missing[0] ? String(missing[0]) : '60'} onChange={(event) => setLookup(event.target.value)} /></label>
      </div>
      {numberOrNull(lookup) !== null ? (
        estimate ? (
          <p className="va-import-status" role="status">
            {estimate.basis === 'recorded' ? `Your recorded mark: ${estimate.mark}.` : `Estimated mark: ${estimate.mark.toFixed(2)}${estimate.basis === 'beyond' ? ' (outside your recorded distances, so less reliable)' : ''}. Shoot a few arrows to confirm before relying on it.`}
          </p>
        ) : <p className="va-faint">Add marks for at least two distances to get an estimate.</p>
      ) : null}
      <div className="va-actions"><ActionButton variant="danger" type="button" onClick={() => { if (window.confirm(`Delete ${bow.name} and its sight marks?`)) onDelete(); }}><AppIcon name="trash" size={16} /> Delete bow</ActionButton></div>
    </section>
  );
}

/** Bows, arrows and sight marks, with estimates for distances not yet shot. Stored on this device. */
export function EquipmentPage({ onProfile }: { onProfile?: () => void } = {}) {
  const [data, setData] = useState<EquipmentData>(() => loadEquipment());
  const update = (next: EquipmentData) => { setData(next); saveEquipment(next); };
  const active = data.bows.find((bow) => bow.id === data.activeBowId) ?? data.bows[0] ?? null;

  return (
    <div className="page-container page-container--wide scoring-page">
      <PageHeader
        title="Equipment"
        subtitle="Your bows, arrows and sight marks. Estimate the mark for a new distance from the ones you have. Stored on this device."
        actions={<div className="va-actions">
          <ActionButton variant="primary" type="button" onClick={() => { const bow = newBow(data.bows.length ? `Bow ${data.bows.length + 1}` : 'My bow'); update({ bows: [...data.bows, bow], activeBowId: bow.id }); }}><AppIcon name="plus" size={16} /> Add bow</ActionButton>
          {onProfile ? <ActionButton variant="secondary" type="button" onClick={onProfile}><AppIcon name="user" size={16} /> Profile</ActionButton> : null}
        </div>}
      />
      {data.bows.length > 1 ? (
        <div className="scoring-rounds" role="tablist" aria-label="Bows">
          {data.bows.map((bow) => (
            <button key={bow.id} type="button" role="tab" aria-selected={bow.id === active?.id} className={`scoring-round${bow.id === active?.id ? ' is-selected' : ''}`} onClick={() => update({ ...data, activeBowId: bow.id })}>
              <strong>{bow.name}</strong><small>{bow.drawWeightLb ? `${bow.drawWeightLb} lb · ` : ''}{bow.sightMarks.length} sight mark{bow.sightMarks.length === 1 ? '' : 's'}</small>
            </button>
          ))}
        </div>
      ) : null}
      {active ? (
        <BowEditor
          key={active.id}
          bow={active}
          onChange={(bow) => update({ ...data, bows: data.bows.map((item) => (item.id === bow.id ? bow : item)) })}
          onDelete={() => { const bows = data.bows.filter((item) => item.id !== active.id); update({ bows, activeBowId: bows[0]?.id ?? null }); }}
        />
      ) : <p className="va-muted">Add your bow to record its setup and sight marks.</p>}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { ActionButton } from '../components/ActionButton';
import { AppIcon } from '../components/AppIcon';
import { PageHeader } from '../components/PageHeader';
import { TargetFaceInput, markersFor } from '../components/scoring/TargetFaceInput';
import { useAthleteProfile } from '../hooks/useAthleteProfile';
import { savePracticeEntry } from '../practice-log/storage';
import { usePracticeLog } from '../practice-log/usePracticeLog';
import { entryFromRound } from '../scoring/practice';
import { FACES, ROUNDS, faceById, maxRoundScore, roundById } from '../scoring/rounds';
import {
  addArrow, arrowAt, arrowFromLabel, arrowLabel, completedEnds, endTotal, grouping, groupingHints, isComplete, isScoredRound, newRound,
  roundTotals, scoreButtons, sortEnd, toCm, undoArrow, type Arrow, type ScoredRound,
} from '../scoring/scoring';
import { PHASE_LABEL, beepsFor, formatClock, timerState, type TimerPhase } from '../scoring/timer';
import '../styles/video.css';

/**
 * Scoring: shoot a standard round end by end, with the competition end timer,
 * placing each arrow on the face so groups can be measured. A finished round
 * goes into the practice log. Everything stays on the device.
 */

export const ROUND_IN_PROGRESS_KEY = 'archerlab-edge:round-in-progress';

function loadInProgress(): ScoredRound | null {
  try {
    const raw = localStorage.getItem(ROUND_IN_PROGRESS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isScoredRound(parsed) ? parsed : null;
  } catch { return null; }
}

function storeInProgress(round: ScoredRound | null) {
  try {
    if (round) localStorage.setItem(ROUND_IN_PROGRESS_KEY, JSON.stringify(round));
    else localStorage.removeItem(ROUND_IN_PROGRESS_KEY);
  } catch { /* lasts for this page only */ }
}

let audio: AudioContext | null = null;
function beep(count: number) {
  if (!count) return;
  try {
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    audio ??= new Context();
    for (let index = 0; index < count; index += 1) {
      const start = audio.currentTime + index * 0.45;
      const tone = audio.createOscillator();
      const gain = audio.createGain();
      tone.frequency.value = 2900;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.4, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);
      tone.connect(gain).connect(audio.destination);
      tone.start(start);
      tone.stop(start + 0.34);
    }
  } catch { /* sound is a convenience */ }
}

/** Remounted for each end (keyed by end number), so it starts idle every end. */
function EndTimer({ secondsPerEnd }: { secondsPerEnd: number }) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [sound, setSound] = useState(true);
  const lastPhase = useRef<TimerPhase | null>(null);

  useEffect(() => {
    if (startedAt === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [startedAt]);

  const state = startedAt === null ? null : timerState(now - startedAt, secondsPerEnd);
  useEffect(() => {
    if (!state || state.phase === lastPhase.current) return;
    lastPhase.current = state.phase;
    if (sound) beep(beepsFor(state.phase));
  }, [state, sound]);

  return (
    <section className={`end-timer end-timer--${state?.phase ?? 'idle'}`} aria-label="End timer">
      <div className="end-timer__light" aria-hidden="true" />
      <div className="end-timer__read" role="timer" aria-live="off">
        <strong>{state ? formatClock(state.remaining) : formatClock(secondsPerEnd)}</strong>
        <span>{state ? PHASE_LABEL[state.phase] : `${formatClock(secondsPerEnd)} per end`}</span>
      </div>
      <div className="va-actions">
        {startedAt === null || state?.phase === 'stop'
          ? <ActionButton variant="secondary" type="button" onClick={() => { lastPhase.current = null; setNow(Date.now()); setStartedAt(Date.now()); }}><AppIcon name="play" size={16} /> {state?.phase === 'stop' ? 'Restart timer' : 'Start timer'}</ActionButton>
          : <ActionButton variant="ghost" type="button" onClick={() => setStartedAt(null)}><AppIcon name="stop" size={16} /> Stop</ActionButton>}
        <label className="end-timer__sound"><input type="checkbox" checked={sound} onChange={(event) => setSound(event.target.checked)} /> Signals</label>
      </div>
    </section>
  );
}

function Setup({ onStart }: { onStart: (round: ScoredRound) => void }) {
  const [roundId, setRoundId] = useState(ROUNDS[0].id);
  const preset = roundById(roundId);
  const [faceId, setFaceId] = useState(preset.faceId);
  const [distance, setDistance] = useState(String(preset.distanceM));
  const [ends, setEnds] = useState(String(preset.ends));
  const [perEnd, setPerEnd] = useState(String(preset.arrowsPerEnd));

  const choose = (id: string) => {
    const next = roundById(id);
    setRoundId(id);
    setFaceId(next.faceId);
    setDistance(String(next.distanceM));
    setEnds(String(next.ends));
    setPerEnd(String(next.arrowsPerEnd));
  };
  const custom = roundId === 'practice';
  const number = (value: string, fallback: number, max: number) => Math.min(max, Math.max(1, Math.round(Number(value)) || fallback));

  return (
    <section className="va-panel scoring-setup" aria-labelledby="scoring-setup-title">
      <h2 id="scoring-setup-title">Choose a round</h2>
      <div className="scoring-rounds" role="radiogroup" aria-label="Round">
        {ROUNDS.map((round) => (
          <button key={round.id} type="button" role="radio" aria-checked={round.id === roundId} className={`scoring-round${round.id === roundId ? ' is-selected' : ''}`} onClick={() => choose(round.id)}>
            <strong>{round.name}</strong>
            <small>{round.id === 'practice' ? round.description : `${round.ends * round.arrowsPerEnd} arrows · ${round.distanceM} m · ${faceById(round.faceId).label}`}</small>
          </button>
        ))}
      </div>
      <p className="va-muted">{preset.description}</p>
      <div className="scoring-fields">
        <label>Face<select value={faceId} onChange={(event) => setFaceId(event.target.value)}>{FACES.map((face) => <option key={face.id} value={face.id}>{face.label}</option>)}</select></label>
        <label>Distance (m)<input inputMode="numeric" value={distance} onChange={(event) => setDistance(event.target.value)} /></label>
        <label>Ends<input inputMode="numeric" value={ends} disabled={!custom} onChange={(event) => setEnds(event.target.value)} /></label>
        <label>Arrows per end<input inputMode="numeric" value={perEnd} disabled={!custom} onChange={(event) => setPerEnd(event.target.value)} /></label>
      </div>
      <div className="va-actions">
        <ActionButton variant="primary" type="button" onClick={() => onStart(newRound(preset, {
          faceId,
          distanceM: number(distance, preset.distanceM, 150),
          ends: custom ? number(ends, preset.ends, 60) : preset.ends,
          arrowsPerEnd: custom ? number(perEnd, preset.arrowsPerEnd, 12) : preset.arrowsPerEnd,
        }))}><AppIcon name="target" size={16} /> Start round</ActionButton>
      </div>
    </section>
  );
}

function GroupPanel({ round, handedness }: { round: ScoredRound; handedness: 'left' | 'right' }) {
  const face = faceById(round.faceId);
  const all = round.ends.flat();
  const group = grouping(all);
  if (!group) return <p className="va-faint">Place three or more arrows on the face to see your group size and where it sits.</p>;
  const hints = groupingHints(group.direction, handedness);
  return (
    <div className="scoring-group">
      <div className="va-stat-row">
        <div className="va-stat"><span>Group size</span><strong>{toCm(group.meanSpread * 2, face).toFixed(1)} cm</strong><small>average spread across, {group.count} arrows</small></div>
        <div className="va-stat"><span>Widest pair</span><strong>{toCm(group.extremeSpread, face).toFixed(1)} cm</strong><small>between the two furthest arrows</small></div>
        <div className="va-stat"><span>Group sits</span><strong>{group.direction}</strong><small>{group.direction === 'centred' ? 'on the middle' : `${toCm(group.offset, face).toFixed(1)} cm from the centre`}</small></div>
      </div>
      {hints.length ? (
        <details className="scoring-hints">
          <summary>Common causes to check</summary>
          <ul>{hints.map((hint) => <li key={hint}>{hint}</li>)}</ul>
          <p className="va-faint">General archery advice, not a diagnosis. A video analysis shows what your own form is doing.</p>
        </details>
      ) : null}
    </div>
  );
}

function Scoresheet({ round }: { round: ScoredRound }) {
  const totals = roundTotals(round.ends.filter((end) => end.length));
  return (
    <div className="scoresheet-wrap">
      <table className="scoresheet">
        <caption className="sr-only">Score sheet</caption>
        <thead><tr><th scope="col">End</th><th scope="col">Arrows</th><th scope="col">End</th><th scope="col">Total</th></tr></thead>
        <tbody>
          {round.ends.filter((end) => end.length).map((end, index) => (
            <tr key={index}>
              <th scope="row">{index + 1}</th>
              <td>{sortEnd(end).map((arrow, arrowIndex) => <span key={arrowIndex} className={`scoresheet__arrow scoresheet__arrow--${arrow.isX || arrow.score >= 9 ? 'gold' : arrow.score >= 7 ? 'red' : arrow.score >= 5 ? 'blue' : arrow.score >= 3 ? 'black' : 'white'}`}>{arrowLabel(arrow)}</span>)}</td>
              <td>{endTotal(end)}</td>
              <td>{totals.running[index]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Shooting({ round, onChange, onFinish, onAbandon }: { round: ScoredRound; onChange: (round: ScoredRound) => void; onFinish: (notes: string) => void; onAbandon: () => void }) {
  const [notes, setNotes] = useState('');
  const { profile } = useAthleteProfile();
  const handedness = profile?.handedness === 'left' ? 'left' : 'right';
  const face = faceById(round.faceId);
  const current = round.ends[round.ends.length - 1];
  const endFull = current.length >= round.arrowsPerEnd;
  const endNumber = endFull ? round.ends.length + 1 : round.ends.length;
  const done = isComplete(round);
  const totals = roundTotals(round.ends.filter((end) => end.length));
  const earlier = round.ends.slice(0, -1).flat();
  const [showAll, setShowAll] = useState(false);
  const group = grouping(showAll ? round.ends.flat() : current.length >= 3 ? current : []);

  const add = (arrow: Arrow) => { if (!done) onChange(addArrow(round, arrow)); };

  return (
    <>
      <section className="session-summary-cards scoring-totals" aria-label="Round so far">
        <article><span>{round.name}</span><strong>{totals.total}</strong><small>of {maxRoundScore({ ends: round.plannedEnds, arrowsPerEnd: round.arrowsPerEnd })} · {round.distanceM} m</small></article>
        <article><span>End</span><strong>{Math.min(endNumber, round.plannedEnds)}<small>/{round.plannedEnds}</small></strong><small>{done ? 'Round complete' : endFull ? 'Next end ready' : `${current.length} of ${round.arrowsPerEnd} arrows`}</small></article>
        <article><span>Average</span><strong>{totals.average === null ? '–' : totals.average.toFixed(2)}</strong><small>{totals.tens} tens · {totals.xs} X</small></article>
      </section>

      {!done ? <EndTimer key={endNumber} secondsPerEnd={roundById(round.roundId).secondsPerEnd} /> : null}

      <div className="scoring-layout">
        <section className="va-panel" aria-labelledby="scoring-face-title">
          <h2 id="scoring-face-title">{done ? 'All arrows' : `End ${Math.min(endNumber, round.plannedEnds)}`} <small>{face.label}</small></h2>
          <TargetFaceInput
            kind={face.kind}
            label={`${face.label} target face. ${done ? '' : 'Tap where each arrow landed.'}`}
            markers={[...markersFor(showAll || done ? earlier : [], 'earlier'), ...markersFor(endFull ? [] : current, 'current', true)]}
            group={group ? { ...group.centre, spread: group.meanSpread } : null}
            onPlace={done ? undefined : (x, y) => add(arrowAt(x, y, face.kind))}
          />
          {!done ? (
            <div className="scoring-buttons" role="group" aria-label="Enter a score without placing it">
              {scoreButtons(face.kind).map((label) => <button key={label} type="button" onClick={() => add(arrowFromLabel(label))}>{label}</button>)}
            </div>
          ) : null}
          <div className="va-actions">
            <ActionButton variant="ghost" type="button" disabled={!round.ends.flat().length} onClick={() => onChange(undoArrow(round))}><AppIcon name="undo" size={16} /> Undo arrow</ActionButton>
            <label className="end-timer__sound"><input type="checkbox" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} /> Show earlier ends</label>
          </div>
        </section>
        <section className="va-panel" aria-labelledby="scoring-sheet-title">
          <h2 id="scoring-sheet-title">Score sheet</h2>
          {totals.arrows ? <Scoresheet round={round} /> : <p className="va-faint">Arrows appear here as you score them, best first in each end, as on a paper score sheet.</p>}
          <h3>{showAll ? 'Whole round' : 'This end'} grouping</h3>
          <GroupPanel round={showAll ? round : { ...round, ends: [endFull ? [] : current] }} handedness={handedness} />
          <label className="scoring-notes">Notes (optional)<input value={notes} placeholder="Wind, equipment, how it felt" onChange={(event) => setNotes(event.target.value)} /></label>
          <div className="va-actions">
            <ActionButton variant={done ? 'primary' : 'secondary'} type="button" disabled={!totals.arrows} onClick={() => onFinish(notes)}><AppIcon name="check" size={16} /> {done ? 'Save round' : 'Finish early and save'}</ActionButton>
            <ActionButton variant="danger" type="button" onClick={() => { if (window.confirm('Discard this round? The arrows scored so far will be lost.')) onAbandon(); }}><AppIcon name="trash" size={16} /> Discard</ActionButton>
          </div>
        </section>
      </div>
    </>
  );
}

function History({ onPick }: { onPick: (id: string) => void }) {
  const { entries } = usePracticeLog();
  const rounds = useMemo(() => entries.filter((entry) => entry.source === 'round' && entry.round).sort((a, b) => b.date - a.date), [entries]);
  const bests = useMemo(() => {
    const best = new Map<string, number>();
    for (const entry of rounds) {
      const key = `${entry.round!.name}|${entry.distanceM ?? ''}|${entry.arrows}`;
      best.set(key, Math.max(best.get(key) ?? 0, entry.totalScore ?? 0));
    }
    return best;
  }, [rounds]);
  if (!rounds.length) return null;
  return (
    <section className="va-panel" aria-labelledby="scoring-history-title">
      <h2 id="scoring-history-title">Your rounds</h2>
      <ul className="scoring-history">
        {rounds.slice(0, 12).map((entry) => {
          const key = `${entry.round!.name}|${entry.distanceM ?? ''}|${entry.arrows}`;
          const best = entry.totalScore !== null && entry.totalScore === bests.get(key);
          return (
            <li key={entry.id}>
              <button type="button" onClick={() => onPick(entry.id)}>
                <strong>{entry.totalScore ?? '–'}{best ? <span className="scoring-pb">PB</span> : null}</strong>
                <span>{entry.round!.name} · {entry.distanceM} m · {entry.arrows} arrows</span>
                <small>{new Date(entry.date).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}</small>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SavedRound({ id, onClose }: { id: string; onClose: () => void }) {
  const { entries } = usePracticeLog();
  const { profile } = useAthleteProfile();
  const entry = entries.find((item) => item.id === id);
  if (!entry?.round) return null;
  const round: ScoredRound = { id: entry.id, roundId: 'saved', name: entry.round.name, faceId: entry.round.faceId, distanceM: entry.distanceM ?? 0, arrowsPerEnd: entry.round.arrowsPerEnd, plannedEnds: entry.round.ends.length, startedAt: entry.date, ends: entry.round.ends };
  const face = faceById(round.faceId);
  const group = grouping(round.ends.flat());
  return (
    <section className="va-panel" aria-labelledby="saved-round-title">
      <h2 id="saved-round-title">{entry.round.name}: {entry.totalScore} <small>{new Date(entry.date).toLocaleDateString()}</small></h2>
      <div className="scoring-layout">
        <TargetFaceInput kind={face.kind} label={`Every arrow of this round on the ${face.label} face`} markers={markersFor(round.ends.flat(), 'earlier')} group={group ? { ...group.centre, spread: group.meanSpread } : null} />
        <div>
          <Scoresheet round={round} />
          <GroupPanel round={round} handedness={profile?.handedness === 'left' ? 'left' : 'right'} />
        </div>
      </div>
      <div className="va-actions"><ActionButton variant="secondary" type="button" onClick={onClose}>Close</ActionButton></div>
    </section>
  );
}

export function ScoringPage({ onTraining }: { onTraining?: () => void } = {}) {
  const [round, setRound] = useState<ScoredRound | null>(() => loadInProgress());
  const [saved, setSaved] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const update = (next: ScoredRound | null) => { setRound(next); storeInProgress(next); };

  const finish = async (notes: string) => {
    if (!round) return;
    try {
      const entry = entryFromRound(round, notes);
      await savePracticeEntry(entry);
      update(null);
      setSaved(`Saved ${entry.round?.name}: ${entry.totalScore} from ${entry.arrows} arrows, in your practice log.`);
      setViewing(entry.id);
    } catch {
      setError('The round could not be saved. Check browser storage and try again; your arrows are kept.');
    }
  };

  return (
    <div className="page-container page-container--wide scoring-page">
      <PageHeader
        title="Scoring"
        subtitle="Score a round end by end with the competition timer, and tap where each arrow lands to see your groups. Saved to your practice log on this device."
        actions={onTraining ? <div className="va-actions"><ActionButton variant="secondary" type="button" onClick={onTraining}><AppIcon name="calendar" size={16} /> Practice log</ActionButton></div> : undefined}
      />
      {saved ? <p className="va-import-status" role="status">{saved}</p> : null}
      {error ? <p className="va-import-status" role="alert">{error}</p> : null}
      {round ? (
        <Shooting round={round} onChange={(next) => { setSaved(null); update(next); }} onFinish={(notes) => void finish(notes)} onAbandon={() => update(null)} />
      ) : (
        <>
          {viewing ? <SavedRound id={viewing} onClose={() => setViewing(null)} /> : null}
          <Setup onStart={(next) => { setSaved(null); setViewing(null); update(next); }} />
          <History onPick={setViewing} />
        </>
      )}
      {round && completedEnds(round) === 0 && !round.ends[0].length ? <p className="va-faint">Tip: put the phone on the shooting line and tap the arrows when you walk up to the target. The score buttons work when you do not want to place arrows.</p> : null}
    </div>
  );
}

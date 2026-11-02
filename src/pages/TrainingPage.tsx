import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ActionButton } from '../components/ActionButton';
import { AppIcon } from '../components/AppIcon';
import { PageHeader } from '../components/PageHeader';
import { GoalProgressCard } from '../components/training/GoalProgressCard';
import { dayKey, heatmap, streaks, totals, entriesInWeek, weeklySeries, type WeekBucket } from '../practice-log/aggregate';
import { manualEntry } from '../practice-log/sources';
import { deletePracticeEntry, savePracticeEntry, savePracticeGoals } from '../practice-log/storage';
import type { Feeling, FocusGoal, PracticeEntry, PracticeGoals } from '../practice-log/types';
import { usePracticeLog } from '../practice-log/usePracticeLog';
import { listVideoReports, loadVideoReport } from '../video-analysis/storage';
import '../styles/video.css';

/**
 * Training: the practice log. Live sessions and video analyses add entries
 * automatically; the athlete can add their own. Everything stays on the device.
 */

const HEATMAP_WEEKS = 26;
const CHART_WEEKS = 12;
const SOURCE_LABELS: Record<PracticeEntry['source'], string> = { live: 'Live session', video: 'Video analysis', manual: 'Logged by hand' };
const FEELINGS: Record<Feeling, string> = { 1: 'Rough', 2: 'Off', 3: 'Okay', 4: 'Good', 5: 'Great' };

const shortDate = (date: Date | number) => new Date(date).toLocaleDateString([], { day: 'numeric', month: 'short' });

function heatLevel(arrows: number, trained: boolean): number {
  if (!trained) return 0;
  if (arrows < 30) return 1;
  if (arrows < 72) return 2;
  if (arrows < 144) return 3;
  return 4;
}

function Heatmap({ entries }: { entries: readonly PracticeEntry[] }) {
  const grid = useMemo(() => heatmap(entries, HEATMAP_WEEKS), [entries]);
  const cell = 11;
  const gap = 3;
  const days = grid.flat().filter((day) => day.trained).length;
  return (
    <figure className="training-heatmap">
      <figcaption><span>Training days</span><strong>{days}<small>in {HEATMAP_WEEKS} weeks</small></strong></figcaption>
      <div className="training-heatmap__scroll">
        <svg viewBox={`0 0 ${HEATMAP_WEEKS * (cell + gap)} ${7 * (cell + gap)}`} role="img" aria-label={`Training days over the last ${HEATMAP_WEEKS} weeks: ${days} days with training`}>
          {grid.map((week, column) => week.map((day, row) => (
            <rect
              key={day.key}
              x={column * (cell + gap)}
              y={row * (cell + gap)}
              width={cell}
              height={cell}
              rx={2}
              className={`training-heatmap__day training-heatmap__day--${day.future ? 'future' : heatLevel(day.arrows, day.trained)}`}
            >
              <title>{`${day.date.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}: ${day.trained ? `${day.arrows} arrows` : 'no training'}`}</title>
            </rect>
          )))}
        </svg>
      </div>
      <div className="trend-chart__axis" aria-hidden="true"><span>{shortDate(grid[0][0].date)}</span><span>Mon–Sun columns</span><span>Today</span></div>
    </figure>
  );
}

function WeeklyBars({ weeks }: { weeks: WeekBucket[] }) {
  const max = Math.max(1, ...weeks.map((week) => week.arrows));
  const width = 100 / weeks.length;
  const current = weeks.at(-1)!;
  return (
    <figure className="trend-chart">
      <figcaption><span>Arrows per week</span><strong>{current.arrows}<small>this week</small></strong></figcaption>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={`Arrows per week for ${weeks.length} weeks: ${weeks.map((week) => week.arrows).join(', ')}`}>
        {weeks.map((week, index) => {
          const height = (week.arrows / max) * 38;
          return (
            <rect key={week.key} x={index * width + width * 0.15} y={40 - height} width={width * 0.7} height={height} className={`trend-chart__bar ${index === weeks.length - 1 ? 'trend-chart__bar--gold' : 'training-chart__bar'}`}>
              <title>{`Week of ${shortDate(week.start)}: ${week.arrows} arrows, ${week.sessions} sessions`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="trend-chart__axis" aria-hidden="true"><span>{shortDate(weeks[0].start)}</span><span>This week</span></div>
    </figure>
  );
}

function WeeklyLine({ weeks, pick, label, unit, digits, domain }: { weeks: WeekBucket[]; pick: (week: WeekBucket) => number | null; label: string; unit: string; digits: number; domain: [number, number] }) {
  const values = weeks.map(pick);
  const known = values.filter((value): value is number => value !== null);
  const [low, high] = known.length ? [Math.min(domain[0], ...known), Math.max(domain[1], ...known)] : domain;
  const step = 100 / Math.max(1, weeks.length - 1);
  const y = (value: number) => 38 - ((value - low) / Math.max(1e-9, high - low)) * 36;
  // Break the line at weeks with no value instead of drawing through them.
  const path = values.map((value, index) => (value === null ? '' : `${index && values[index - 1] !== null ? 'L' : 'M'}${(index * step).toFixed(2)} ${y(value).toFixed(2)}`)).join(' ');
  const latest = [...values].reverse().find((value) => value !== null) ?? null;
  return (
    <figure className="trend-chart">
      <figcaption><span>{label}</span><strong>{latest === null ? '--' : latest.toFixed(digits)}<small>{latest === null ? 'no data yet' : unit}</small></strong></figcaption>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={known.length ? `${label} by week: ${values.map((value) => (value === null ? 'none' : value.toFixed(digits))).join(', ')}` : `${label}: no data yet`}>
        <path d={path} className="training-chart__line" />
        {values.map((value, index) => (value === null ? null : (
          <circle key={weeks[index].key} cx={index * step} cy={y(value)} r={1.2} className="training-chart__dot">
            <title>{`Week of ${shortDate(weeks[index].start)}: ${value.toFixed(digits)}`}</title>
          </circle>
        )))}
      </svg>
      <div className="trend-chart__axis" aria-hidden="true"><span>{shortDate(weeks[0].start)}</span><span>This week</span></div>
    </figure>
  );
}

function ManualEntryForm({ onDone }: { onDone: () => void }) {
  const [date, setDate] = useState(dayKey(Date.now()));
  const [arrows, setArrows] = useState('');
  const [total, setTotal] = useState('');
  const [distance, setDistance] = useState('');
  const [face, setFace] = useState('');
  const [notes, setNotes] = useState('');
  const [feeling, setFeeling] = useState<Feeling | undefined>();
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const arrowCount = Number(arrows);
    if (!Number.isFinite(arrowCount) || arrowCount < 0) { setError('Enter how many arrows you shot.'); return; }
    const totalScore = total.trim() === '' ? null : Number(total);
    if (totalScore !== null && (!Number.isFinite(totalScore) || totalScore < 0 || totalScore > arrowCount * 10)) { setError('The total score should be between 0 and 10 points per arrow.'); return; }
    const [year, month, day] = date.split('-').map(Number);
    // Noon, so the entry stays on the chosen day whatever the time zone does.
    const when = new Date(year, month - 1, day, 12).getTime();
    try {
      await savePracticeEntry(manualEntry({ date: when, arrows: arrowCount, totalScore, distanceM: Number(distance) || undefined, targetFace: face, notes, feeling }));
      onDone();
    } catch {
      setError('The entry could not be saved on this device.');
    }
  };

  return (
    <form className="va-panel training-form" onSubmit={(event) => void submit(event)} aria-labelledby="training-form-title">
      <h2 id="training-form-title">Add a practice entry</h2>
      <div className="training-form__grid">
        <label><span>Date</span><input type="date" required value={date} max={dayKey(Date.now())} onChange={(event) => setDate(event.target.value)} /></label>
        <label><span>Arrows</span><input type="number" required min={0} max={1000} inputMode="numeric" value={arrows} onChange={(event) => setArrows(event.target.value)} /></label>
        <label><span>Total score <small>optional</small></span><input type="number" min={0} inputMode="numeric" value={total} onChange={(event) => setTotal(event.target.value)} /></label>
        <label><span>Distance (m) <small>optional</small></span><input type="number" min={1} max={150} inputMode="numeric" value={distance} onChange={(event) => setDistance(event.target.value)} /></label>
        <label><span>Target face <small>optional</small></span><input type="text" maxLength={40} placeholder="e.g. 122 cm, 40 cm triple" value={face} onChange={(event) => setFace(event.target.value)} /></label>
      </div>
      <fieldset className="training-form__feeling">
        <legend>How did it feel? <small>optional</small></legend>
        {([1, 2, 3, 4, 5] as Feeling[]).map((value) => (
          <label key={value}><input type="radio" name="feeling" checked={feeling === value} onChange={() => setFeeling(value)} /> {value} · {FEELINGS[value]}</label>
        ))}
      </fieldset>
      <label className="training-form__notes"><span>Notes <small>optional</small></span><textarea rows={3} maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
      {error ? <p className="va-import-status" role="alert">{error}</p> : null}
      <div className="va-actions">
        <ActionButton variant="primary" type="submit"><AppIcon name="check" size={16} /> Save entry</ActionButton>
        <ActionButton variant="ghost" type="button" onClick={onDone}>Cancel</ActionButton>
      </div>
    </form>
  );
}

function GoalsForm({ goals, onDone, onVideo }: { goals: PracticeGoals; onDone: () => void; onVideo?: () => void }) {
  const [arrows, setArrows] = useState(goals.weeklyArrows?.toString() ?? '');
  const [sessions, setSessions] = useState(goals.weeklySessions?.toString() ?? '');
  const [focusOptions, setFocusOptions] = useState<FocusGoal[] | null>(null);
  const [focusTitle, setFocusTitle] = useState(goals.focus?.title ?? '');

  // Focus areas come from the latest video analysis on this device.
  useEffect(() => {
    let cancelled = false;
    listVideoReports()
      .then(async (summaries) => (summaries[0] ? loadVideoReport(summaries[0].id) : null))
      .then((report) => { if (!cancelled) setFocusOptions(report ? report.focusAreas.map((finding) => ({ category: finding.category, title: finding.title, reportId: report.id })) : []); })
      .catch(() => { if (!cancelled) setFocusOptions([]); });
    return () => { cancelled = true; };
  }, []);

  const options = focusOptions ?? [];
  // Keep the current focus selectable even when it came from an older report.
  const choices = goals.focus && !options.some((option) => option.title === goals.focus!.title) ? [goals.focus, ...options] : options;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parse = (value: string) => (value.trim() && Number(value) > 0 ? Math.round(Number(value)) : null);
    await savePracticeGoals({ weeklyArrows: parse(arrows), weeklySessions: parse(sessions), focus: choices.find((choice) => choice.title === focusTitle) ?? null, updatedAt: Date.now() }).catch(() => undefined);
    onDone();
  };

  return (
    <form className="va-panel training-form" onSubmit={(event) => void submit(event)} aria-labelledby="training-goals-title">
      <h2 id="training-goals-title">Weekly goals</h2>
      <div className="training-form__grid">
        <label><span>Arrows per week</span><input type="number" min={0} max={5000} inputMode="numeric" placeholder="e.g. 300" value={arrows} onChange={(event) => setArrows(event.target.value)} /></label>
        <label><span>Sessions per week</span><input type="number" min={0} max={21} inputMode="numeric" placeholder="e.g. 3" value={sessions} onChange={(event) => setSessions(event.target.value)} /></label>
        <label><span>Focus area</span>
          <select value={focusTitle} onChange={(event) => setFocusTitle(event.target.value)} disabled={focusOptions === null}>
            <option value="">{focusOptions === null ? 'Loading…' : choices.length ? 'No focus area' : 'Analyse a video to pick one'}</option>
            {choices.map((choice) => <option key={choice.title} value={choice.title}>{choice.title}</option>)}
          </select>
        </label>
      </div>
      {focusOptions !== null && !choices.length && onVideo ? <p className="va-faint">Focus areas come from your latest video analysis. <button type="button" className="privacy-link" onClick={onVideo}>Analyse a video</button></p> : null}
      <div className="va-actions">
        <ActionButton variant="primary" type="submit"><AppIcon name="check" size={16} /> Save goals</ActionButton>
        <ActionButton variant="ghost" type="button" onClick={onDone}>Cancel</ActionButton>
      </div>
    </form>
  );
}

function EntryRow({ entry }: { entry: PracticeEntry }) {
  const details = [
    entry.averageScore !== null ? `avg ${entry.averageScore.toFixed(1)}${entry.totalScore !== null && entry.source === 'manual' ? ` (${entry.totalScore})` : ''}` : null,
    entry.formScore !== null ? `form ${entry.formScore} (estimate)` : null,
    entry.distanceM ? `${entry.distanceM} m` : null,
    entry.targetFace ?? null,
    entry.feeling ? `felt ${entry.feeling}/5` : null,
  ].filter(Boolean);
  const remove = () => {
    if (window.confirm('Delete this entry from your practice log? The session or video report itself is kept.')) void deletePracticeEntry(entry.id).catch(() => undefined);
  };
  return (
    <li className="training-entry">
      <div className="training-entry__date"><strong>{new Date(entry.date).toLocaleDateString([], { day: 'numeric' })}</strong><span>{new Date(entry.date).toLocaleDateString([], { month: 'short' })}</span></div>
      <div className="training-entry__body">
        <strong>{entry.arrows} arrows <small>{SOURCE_LABELS[entry.source]}</small></strong>
        {details.length ? <span>{details.join(' · ')}</span> : null}
        {entry.focusAreas.length ? <span>Focus: {entry.focusAreas.join(', ')}</span> : null}
        {entry.notes ? <span className="training-entry__notes">{entry.notes}</span> : null}
      </div>
      <button type="button" className="training-entry__delete" aria-label={`Delete the entry from ${new Date(entry.date).toLocaleDateString()}`} onClick={remove}><AppIcon name="trash" size={16} /></button>
    </li>
  );
}

export function TrainingPage({ onVideo }: { onVideo?: () => void } = {}) {
  const { entries, goals, status } = usePracticeLog();
  const [form, setForm] = useState<'entry' | 'goals' | null>(null);
  const week = useMemo(() => totals(entriesInWeek(entries)), [entries]);
  const streak = useMemo(() => streaks(entries), [entries]);
  const weeks = useMemo(() => weeklySeries(entries, CHART_WEEKS), [entries]);

  return (
    <div className="training-page">
      <PageHeader
        title="Training"
        subtitle="Your practice log: live sessions and video analyses are added automatically, and you can log any other practice. Stored on this device."
        actions={<div className="va-actions">
          <ActionButton variant="primary" type="button" onClick={() => setForm('entry')}><AppIcon name="plus" size={16} /> Add entry</ActionButton>
          <ActionButton variant="secondary" type="button" onClick={() => setForm('goals')}><AppIcon name="target" size={16} /> Goals</ActionButton>
        </div>}
      />
      {status === 'error' ? <p className="va-import-status" role="alert">The practice log could not be opened in this browser.</p> : null}
      {form === 'entry' ? <ManualEntryForm onDone={() => setForm(null)} /> : null}
      {form === 'goals' ? <GoalsForm goals={goals} onVideo={onVideo} onDone={() => setForm(null)} /> : null}

      <section className="session-summary-cards training-stats" aria-label="This week">
        <article><span>Arrows this week</span><strong>{week.arrows}</strong><small>{goals.weeklyArrows ? `of ${goals.weeklyArrows} goal` : 'No weekly goal set'}</small></article>
        <article><span>Sessions this week</span><strong>{week.sessions}</strong><small>{goals.weeklySessions ? `of ${goals.weeklySessions} goal` : 'No weekly goal set'}</small></article>
        <article><span>Current streak</span><strong>{streak.current}</strong><small>{streak.current === 1 ? 'day' : 'days'} in a row</small></article>
        <article><span>Longest streak</span><strong>{streak.longest}</strong><small>{streak.longest === 1 ? 'day' : 'days'}</small></article>
      </section>

      <GoalProgressCard entries={entries} goals={goals} onEdit={() => setForm('goals')} />

      <Heatmap entries={entries} />

      <div className="training-charts">
        <WeeklyBars weeks={weeks} />
        <WeeklyLine weeks={weeks} pick={(item) => item.averageScore} label="Average arrow score" unit="points" digits={1} domain={[6, 10]} />
        <WeeklyLine weeks={weeks} pick={(item) => item.formScore} label="Form score (estimate)" unit="of 100, unvalidated" digits={0} domain={[40, 90]} />
      </div>

      <section className="va-panel" aria-labelledby="training-log-title">
        <h2 id="training-log-title">Log <small>{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</small></h2>
        {entries.length ? (
          <ul className="training-log">{entries.map((entry) => <EntryRow key={entry.id} entry={entry} />)}</ul>
        ) : (
          <p className="va-muted">{status === 'loading' ? 'Loading…' : 'Nothing logged yet. Finish a live session, analyse a video, or add an entry by hand.'}</p>
        )}
      </section>
    </div>
  );
}

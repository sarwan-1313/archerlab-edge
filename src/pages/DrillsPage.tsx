import { useEffect, useMemo, useRef, useState } from 'react';
import { ActionButton } from '../components/ActionButton';
import { AppIcon } from '../components/AppIcon';
import { PageHeader } from '../components/PageHeader';
import { DRILLS, drillDurationS, drillState, drillsFor, type Drill, type DrillPhase } from '../drills/drills';
import { manualEntry } from '../practice-log/sources';
import { savePracticeEntry } from '../practice-log/storage';
import { usePracticeLog } from '../practice-log/usePracticeLog';
import { formatClock } from '../scoring/timer';
import { beep } from '../utils/beep';
import { useLanguage } from '../i18n/i18n';
import { CATEGORY_INFO } from '../video-analysis/rubric';
import '../styles/video.css';

const PHASE_TEXT: Record<DrillPhase, string> = { ready: 'Get ready', work: '', rest: 'Rest', done: 'Done' };

function DrillRunner({ drill, onClose }: { drill: Drill; onClose: () => void }) {
  const { t } = useLanguage();
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [sound, setSound] = useState(true);
  const [logged, setLogged] = useState(false);
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (startedAt === null || pausedAt !== null) return;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [pausedAt, startedAt]);

  const elapsed = startedAt === null ? 0 : (pausedAt ?? now) - startedAt;
  const state = drillState(drill, elapsed);
  const key = `${state.phase}-${state.rep}`;
  useEffect(() => {
    if (startedAt === null || key === last.current) return;
    last.current = key;
    if (sound) beep(state.phase === 'work' ? 1 : state.phase === 'rest' ? 2 : state.phase === 'done' ? 3 : 0, state.phase === 'rest' ? 1800 : 2900);
  }, [key, sound, startedAt, state.phase]);

  const log = async () => {
    await savePracticeEntry(manualEntry({ date: Date.now(), arrows: 0, totalScore: null, notes: `Drill: ${drill.name} (${drill.reps} × ${drill.workS} s)` }));
    setLogged(true);
  };

  const running = startedAt !== null && state.phase !== 'done';
  return (
    <section className={`va-panel drill-runner drill-runner--${startedAt === null ? 'idle' : state.phase}`} aria-labelledby="drill-runner-title">
      <h2 id="drill-runner-title">{drill.name} <small>{drill.reps} × {drill.workS} s {drill.workLabel.toLowerCase()}, {drill.restS} s rest · {formatClock(drillDurationS(drill))}</small></h2>
      <div className="drill-runner__clock" role="timer">
        <strong>{startedAt === null ? formatClock(drill.workS) : formatClock(state.remaining)}</strong>
        <span>{startedAt === null ? 'Press start when you are in position' : state.phase === 'work' ? `${drill.workLabel}: rep ${state.rep} of ${drill.reps}` : state.phase === 'rest' ? `${t('drills.rest', 'Rest')}: ${state.rep + 1}/${drill.reps}` : t(`drills.${state.phase}`, PHASE_TEXT[state.phase])}</span>
      </div>
      <ol className="drill-steps">{drill.steps.map((step) => <li key={step}>{step}</li>)}</ol>
      {drill.safety ? <p className="va-callout"><AppIcon name="shield" size={16} /> {drill.safety}</p> : null}
      <div className="va-actions">
        {startedAt === null || state.phase === 'done' ? (
          <ActionButton variant="primary" type="button" onClick={() => { last.current = null; setPausedAt(null); setNow(Date.now()); setStartedAt(Date.now()); setLogged(false); }}><AppIcon name="play" size={16} /> {state.phase === 'done' ? 'Again' : t('drills.start', 'Start')}</ActionButton>
        ) : pausedAt === null ? (
          <ActionButton variant="secondary" type="button" onClick={() => setPausedAt(Date.now())}><AppIcon name="pause" size={16} /> {t('drills.pause', 'Pause')}</ActionButton>
        ) : (
          <ActionButton variant="primary" type="button" onClick={() => { setStartedAt((value) => (value ?? 0) + Date.now() - pausedAt); setPausedAt(null); setNow(Date.now()); }}><AppIcon name="play" size={16} /> {t('drills.resume', 'Resume')}</ActionButton>
        )}
        {state.phase === 'done' && startedAt !== null ? <ActionButton variant="secondary" type="button" disabled={logged} onClick={() => void log()}><AppIcon name="check" size={16} /> {logged ? 'Logged' : 'Log in practice log'}</ActionButton> : null}
        <label className="end-timer__sound"><input type="checkbox" checked={sound} onChange={(event) => setSound(event.target.checked)} /> {t('timer.signals', 'Signals')}</label>
        <ActionButton variant="ghost" type="button" onClick={onClose} disabled={running && pausedAt === null}>Choose another drill</ActionButton>
      </div>
    </section>
  );
}

/** Guided drills with work and rest timers, suggested from the athlete's focus area. */
export function DrillsPage({ onTraining }: { onTraining?: () => void } = {}) {
  const { goals } = usePracticeLog();
  const focus = goals.focus?.category ?? null;
  const drills = useMemo(() => drillsFor(focus), [focus]);
  const [chosen, setChosen] = useState<Drill | null>(null);
  const { t } = useLanguage();

  return (
    <div className="page-container page-container--wide scoring-page">
      <PageHeader
        title={t('drills.title', 'Drills')}
        subtitle={t('drills.subtitle', 'Timed drills for each part of your shot, with work and rest prompts. Choose one, get into position, and follow the timer.')}
        actions={onTraining ? <div className="va-actions"><ActionButton variant="secondary" type="button" onClick={onTraining}><AppIcon name="calendar" size={16} /> Practice log</ActionButton></div> : undefined}
      />
      {chosen ? <DrillRunner key={chosen.id} drill={chosen} onClose={() => setChosen(null)} /> : null}
      {!chosen ? (
        <section className="va-panel" aria-labelledby="drill-list-title">
          <h2 id="drill-list-title">{focus ? <>Suggested for your focus: {CATEGORY_INFO[focus]?.label ?? goals.focus?.title}</> : 'All drills'}</h2>
          {!focus ? <p className="va-muted">Set a focus area from a video analysis (Training → Goals) to see the drills that help it most first.</p> : null}
          <div className="scoring-rounds">
            {drills.map((drill) => (
              <button key={drill.id} type="button" className="scoring-round" onClick={() => setChosen(drill)}>
                <strong>{drill.name}</strong>
                <small>{drill.summary}</small>
                <small>{drill.reps} × {drill.workS} s · {formatClock(drillDurationS(drill))} · {drill.equipment}</small>
              </button>
            ))}
          </div>
          <p className="va-faint">{DRILLS.length} drills. These are general training exercises; a coach can tailor them to you.</p>
        </section>
      ) : null}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { STEP_LABEL, breathState } from '../../vip/breathing';
import { ActionButton } from '../ActionButton';
import { AppIcon } from '../AppIcon';

const STEP_S = 4;
const CYCLES = 4;

/** A calm-down before shooting: box breathing with a growing and shrinking circle (a CSS animation, so it costs almost nothing). */
export function BreathCoach() {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (startedAt === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [startedAt]);

  const state = startedAt === null ? null : breathState((now - startedAt) / 1000, STEP_S, CYCLES);
  const running = state !== null && !state.done;

  return (
    <section className="va-panel breath" aria-labelledby="breath-title">
      <h2 id="breath-title"><AppIcon name="sparkles" size={18} /> Calm before the shot</h2>
      <p className="va-muted">Box breathing: in, hold, out and hold for {STEP_S} seconds each, {CYCLES} times. Many archers use it to settle nerves before an end.</p>
      <div className={`breath__stage${running ? ` breath__stage--${state.step}` : ''}`}>
        <div className="breath__circle" style={{ animationDuration: `${STEP_S * 4}s` }} aria-hidden="true" />
        <div className="breath__text" role="status" aria-live="polite">
          {state === null ? <strong>Ready</strong> : state.done ? <strong>Well done</strong> : <><strong>{STEP_LABEL[state.step]}</strong><span>{state.secondsLeft}</span></>}
          {running ? <small>Round {state.cycle} of {CYCLES}</small> : null}
        </div>
      </div>
      <div className="va-actions">
        {running
          ? <ActionButton variant="secondary" type="button" onClick={() => setStartedAt(null)}><AppIcon name="stop" size={16} /> Stop</ActionButton>
          : <ActionButton variant="primary" type="button" onClick={() => { setNow(Date.now()); setStartedAt(Date.now()); }}><AppIcon name="play" size={16} /> {state?.done ? 'Again' : 'Start'}</ActionButton>}
      </div>
    </section>
  );
}

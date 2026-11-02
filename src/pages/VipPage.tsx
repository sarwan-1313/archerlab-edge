import { useMemo, useState } from 'react';
import { ActionButton } from '../components/ActionButton';
import { AppIcon } from '../components/AppIcon';
import { VipCodeDialog } from '../components/vip/VipCodeDialog';
import { BreathCoach } from '../components/vip/BreathCoach';
import { WindChallenge } from '../components/vip/WindChallenge';
import { usePracticeLog } from '../practice-log/usePracticeLog';
import { CELEBRATE_KEY, celebrationsOn, confetti, thunk } from '../vip/confetti';
import { predictNextRound } from '../vip/predict';
import { useVip } from '../vip/vip';
import '../styles/video.css';

const FACTS = [
  'The X ring on a 122 cm face is 6.1 cm across: smaller than a tennis ball, at 70 metres.',
  'An Olympic recurve arrow leaves the bow at around 200 km/h and still takes over a second to reach 70 m.',
  'Archers aim off for wind: at 70 m a steady crosswind can move an arrow a full ring or more.',
  'A "Robin Hood" is splitting one arrow with another: it is rare, and it ruins two arrows.',
  'Korean women recurve archers have won the Olympic team gold at every Games since 1988.',
  'Some elite archers train to release between heartbeats, when the bow is steadiest.',
  'Clickers were invented so archers release at exactly the same draw length every shot.',
];

function Predictor() {
  const { entries } = usePracticeLog();
  const prediction = useMemo(() => predictNextRound(entries), [entries]);
  return (
    <section className="va-panel" aria-labelledby="vip-predict-title">
      <h2 id="vip-predict-title"><AppIcon name="sparkles" size={18} /> Score predictor</h2>
      {prediction ? (
        <>
          <div className="va-stat-row">
            <div className="va-stat"><span>Next {prediction.round}</span><strong>{prediction.predicted}</strong><small>predicted, out of {prediction.max}</small></div>
            <div className="va-stat"><span>Personal best</span><strong>{prediction.best}</strong><small>{prediction.predicted > prediction.best ? 'A PB is on the cards!' : `${prediction.best - prediction.predicted} to beat it`}</small></div>
            <div className="va-stat"><span>Trend</span><strong>{prediction.trendPerRound >= 0 ? '+' : ''}{prediction.trendPerRound.toFixed(1)}</strong><small>points per round, last {Math.min(prediction.rounds, 10)} rounds</small></div>
          </div>
          <p className="va-faint">A straight-line guess from your recent scores, just for fun.</p>
        </>
      ) : <p className="va-muted">Score three rounds of the same kind on the Scoring page and the predictor will guess your next score.</p>}
    </section>
  );
}

/** The VIP Lounge: hidden extras for people with the code. */
export function VipPage({ onUnlocked }: { onUnlocked?: () => void } = {}) {
  const vip = useVip();
  const [asking, setAsking] = useState(false);
  const [celebrate, setCelebrate] = useState(celebrationsOn);
  const [fact, setFact] = useState(() => Math.floor(Math.random() * FACTS.length));

  if (!vip) {
    return (
      <div className="page-container scoring-page vip-locked">
        <section className="va-panel vip-hero">
          <span className="vip-hero__crown"><AppIcon name="crown" size={40} /></span>
          <h1>VIP Lounge</h1>
          <p>Members only. Ask the owner of ArcherLab Edge for a code.</p>
          <ActionButton variant="primary" type="button" onClick={() => setAsking(true)}><AppIcon name="crown" size={16} /> Enter code</ActionButton>
        </section>
        {asking ? <VipCodeDialog onClose={() => setAsking(false)} onUnlocked={() => { setAsking(false); onUnlocked?.(); }} /> : null}
      </div>
    );
  }

  const toggleCelebrate = (on: boolean) => {
    setCelebrate(on);
    try { localStorage.setItem(CELEBRATE_KEY, on ? '1' : '0'); } catch { /* ignore */ }
    if (on) { confetti(); thunk(); }
  };

  return (
    <div className="page-container page-container--wide scoring-page">
      <section className="va-panel vip-hero">
        <span className="vip-hero__crown"><AppIcon name="crown" size={40} /></span>
        <h1>Welcome to the VIP Lounge</h1>
        <p>Hidden extras, just for you. The app wears gold while VIP mode is on. Use <strong>VIP mode · Log out</strong> in the corner to leave.</p>
      </section>

      <WindChallenge />

      <div className="scoring-layout">
        <section className="va-panel" aria-labelledby="vip-celebrate-title">
          <h2 id="vip-celebrate-title"><AppIcon name="sparkles" size={18} /> Celebrations</h2>
          <label className="coach-tools-setting__toggle"><input type="checkbox" checked={celebrate} onChange={(event) => toggleCelebrate(event.target.checked)} /> <span>Confetti and an arrow “thunk” for every X and 10 on the Scoring page</span></label>
          <ActionButton variant="ghost" type="button" onClick={() => { confetti(); thunk(); }}>Try it</ActionButton>
        </section>
        <section className="va-panel" aria-labelledby="vip-fact-title">
          <h2 id="vip-fact-title"><AppIcon name="target" size={18} /> Archery secrets</h2>
          <p className="vip-fact">{FACTS[fact]}</p>
          <ActionButton variant="ghost" type="button" onClick={() => setFact((fact + 1) % FACTS.length)}>Another one</ActionButton>
        </section>
      </div>

      <div className="scoring-layout">
        <BreathCoach />
        <Predictor />
      </div>
    </div>
  );
}

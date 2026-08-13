import { useState, type MouseEvent } from 'react';
import { ActionButton } from '../components/ActionButton';
import { PageHeader } from '../components/PageHeader';
import type { ReportedShotResult } from '../types/gestureScore';
import type { ShotAnalysis } from '../types/shotAnalysis';

export function ManualShotEntryPage({ shot, onSave }: { shot?: ShotAnalysis; onSave?: (result: ReportedShotResult) => void }) {
  const [target, setTarget] = useState<{ x: number; y: number }>(); const [score, setScore] = useState('10'); const [notes, setNotes] = useState('');
  const place = (event: MouseEvent<HTMLButtonElement>) => { const bounds = event.currentTarget.getBoundingClientRect(); setTarget({ x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height }); };
  return <div className="mx-auto w-full max-w-3xl px-gutter pb-24 pt-20 md:px-container-padding"><PageHeader title="Manual Entry" subtitle={shot ? `Attach athlete-reported result to ${shot.id}` : 'Capture a shot before entering its result'} compact />
    <section className="relative flex w-full flex-col items-center overflow-hidden rounded-xl border border-white/5 bg-surface-container-high p-container-padding">
      <h2 className="font-label-caps text-label-caps text-on-surface-variant">Tap target to place actual arrow</h2>
      <button type="button" aria-label="Target face" onClick={place} className="relative mt-4 h-64 w-64 rounded-full border border-white/10 bg-[radial-gradient(circle,_#facc15_0%,_#facc15_20%,_transparent_20.5%),radial-gradient(circle,_#ef4444_0%,_#ef4444_40%,_transparent_40.5%),radial-gradient(circle,_#3b82f6_0%,_#3b82f6_60%,_transparent_60.5%),radial-gradient(circle,_#1f2937_0%,_#1f2937_80%,_transparent_80.5%),radial-gradient(circle,_#f9fafb_0%,_#f9fafb_100%)] md:h-80 md:w-80">{target ? <span className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-background" style={{ left: `${target.x * 100}%`, top: `${target.y * 100}%` }} /> : null}</button>
    </section>
    <section className="mt-stack-md grid gap-stack-md md:grid-cols-2"><div className="rounded-xl border border-white/10 bg-surface-container p-stack-md"><h3>Manual Score Entry</h3><div className="mt-3 grid grid-cols-4 gap-2">{['X','10','9','8','7','6','5','4','3','2','1','M'].map((value) => <button key={value} type="button" className={`h-11 rounded border ${score === value ? 'border-primary text-primary' : 'border-white/10'}`} onClick={() => setScore(value)}>{value}</button>)}</div></div>
      <div className="rounded-xl border border-white/10 bg-surface-container p-stack-md"><h3>Notes</h3><textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-3 min-h-[120px] w-full rounded-lg border border-white/10 bg-surface-container-low p-3" placeholder="Wind, release timing, equipment…" /></div></section>
    <div className="mt-section-gap"><ActionButton className="w-full justify-center" disabled={!shot} onClick={() => shot && onSave?.({ score: score === 'X' ? 10 : score === 'M' ? 0 : Number(score), isX: score === 'X', source: 'manual', capturedAt: Date.now(), targetX: target?.x, targetY: target?.y, notes })}>Confirm Shot Result</ActionButton></div>
  </div>;
}

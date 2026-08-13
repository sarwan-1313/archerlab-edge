import type { ShotAnalysis } from '../../types/shotAnalysis';
import { SHOT_CONFIG } from '../../shot-analysis/config';

export function ShotTimeline({ shot }: { shot: ShotAnalysis }) {
  const span = SHOT_CONFIG.preReleaseMs + SHOT_CONFIG.postReleaseMs;
  const percent = (relativeMs: number) => `${((relativeMs + SHOT_CONFIG.preReleaseMs) / span) * 100}%`;
  return (
    <div className="shot-timeline" aria-label="Shot timeline centered on release">
      <div className="shot-timeline__track">
        <span className="shot-timeline__phase shot-timeline__phase--anchor" style={{ left: percent(SHOT_CONFIG.anchorStartMs), width: `calc(${percent(SHOT_CONFIG.anchorEndMs)} - ${percent(SHOT_CONFIG.anchorStartMs)})` }} />
        <span className="shot-timeline__phase shot-timeline__phase--follow" style={{ left: percent(SHOT_CONFIG.followThroughStartMs), width: `calc(${percent(SHOT_CONFIG.followThroughEndMs)} - ${percent(SHOT_CONFIG.followThroughStartMs)})` }} />
        <span className="shot-timeline__release" style={{ left: percent(0) }}><i />RELEASE</span>
      </div>
      <div className="shot-timeline__ticks"><span>-1200 ms</span><span>-600</span><span>0</span><span>+400</span><span>+800 ms</span></div>
      <div className="shot-timeline__legend"><span>Anchor / hold</span><span>Follow-through</span><span>{shot.frames.length} numeric samples</span></div>
    </div>
  );
}

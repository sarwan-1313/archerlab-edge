import { outlierShots, rhythmRows, spread, steadiness } from '../../video-analysis/rhythm';
import type { VideoAnalysisReport } from '../../video-analysis/types';

const COLOURS = { draw: '#2f8fd8', hold: '#ffc53d', follow: '#3ddc84' };

/** Each shot's draw, hold and follow-through as bars lined up at the release, with how steady the timing was. */
export function RhythmPanel({ report }: { report: VideoAnalysisReport }) {
  const rows = rhythmRows(report.shots).filter((row) => row.hold !== null || row.draw !== null);
  if (rows.length < 2) return null;
  const draws = spread(rows.map((row) => row.draw));
  const holds = spread(rows.map((row) => row.hold));
  const outliers = new Set(outlierShots(rows));
  const before = Math.max(...rows.map((row) => (row.draw ?? 0) + (row.hold ?? 0)), 1);
  const after = Math.max(...rows.map((row) => row.follow ?? 0), 0.5);
  const width = 600;
  const rowH = 22;
  const left = 64;
  const scale = (width - left - 12) / (before + after);
  const releaseX = left + before * scale;
  const height = rows.length * rowH + 28;

  return (
    <section className="va-panel" aria-labelledby="va-rhythm-title">
      <h2 id="va-rhythm-title">Shot rhythm</h2>
      <div className="va-stat-row">
        {holds ? <div className="va-stat"><span>Hold at anchor</span><strong>{holds.mean.toFixed(1)} s</strong><small>± {holds.sd.toFixed(1)} s · {steadiness(holds)}</small></div> : null}
        {draws ? <div className="va-stat"><span>Draw</span><strong>{draws.mean.toFixed(1)} s</strong><small>± {draws.sd.toFixed(1)} s · {steadiness(draws)}</small></div> : null}
        <div className="va-stat"><span>Shots timed</span><strong>{rows.length}</strong><small>{outliers.size ? `${outliers.size} with an unusual hold` : 'no unusual holds'}</small></div>
      </div>
      <div className="rhythm-chart">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Timing of ${rows.length} shots lined up at the release`}>
          <line x1={releaseX} x2={releaseX} y1={4} y2={height - 18} stroke="#ff6b1a" strokeWidth={1.5} strokeDasharray="4 3" />
          <text x={releaseX} y={height - 4} textAnchor="middle" fontSize={11} fill="#8e9aab">release</text>
          {rows.map((row, index) => {
            const y = 6 + index * rowH;
            const holdStart = releaseX - (row.hold ?? 0) * scale;
            const drawStart = holdStart - (row.draw ?? 0) * scale;
            return (
              <g key={row.index}>
                <text x={left - 8} y={y + 12} textAnchor="end" fontSize={12} fill={outliers.has(row.index) ? '#ffb020' : '#c3cbd6'}>Shot {row.index + 1}{outliers.has(row.index) ? ' !' : ''}</text>
                {row.draw !== null ? <rect x={drawStart} y={y} width={row.draw * scale} height={14} rx={3} fill={COLOURS.draw}><title>{`Draw ${row.draw.toFixed(1)} s`}</title></rect> : null}
                {row.hold !== null ? <rect x={holdStart} y={y} width={row.hold * scale} height={14} rx={3} fill={COLOURS.hold}><title>{`Hold ${row.hold.toFixed(1)} s`}</title></rect> : null}
                {row.follow !== null ? <rect x={releaseX} y={y} width={row.follow * scale} height={14} rx={3} fill={COLOURS.follow}><title>{`Follow-through ${row.follow.toFixed(1)} s`}</title></rect> : null}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="compare-legend"><span><i style={{ background: COLOURS.draw }} />Draw</span><span><i style={{ background: COLOURS.hold }} />Hold at anchor</span><span><i style={{ background: COLOURS.follow }} />Follow-through</span></div>
      <p className="va-faint">Steady timing from shot to shot is a sign of a repeatable shot. A hold much longer than usual often means the shot should have been let down. Timings come from the video and are estimates.</p>
    </section>
  );
}

import { createPortal } from 'react-dom';
import { CATEGORY_INFO, formatMetricShort } from '../../video-analysis/rubric';
import { LEVEL_LABEL } from '../../video-analysis/scoring';
import { BOW_LABEL, VIEW_LABEL, formatDate } from '../../video-analysis/format';
import type { FocusFrame } from '../../video-analysis/browser/keyFrames';
import type { MetricKey, ShotReport, VideoAnalysisReport } from '../../video-analysis/types';

function metric(shot: ShotReport, key: MetricKey): string {
  const value = shot.metrics[key];
  return value ? formatMetricShort(key, value.value) : '–';
}

/**
 * The report laid out for paper: black on white, one column, no controls. It is mounted straight under
 * <body> and hidden on screen; the print stylesheet (video.css) shows only it, so "Print / Save as PDF"
 * and the browser's own Print both produce it. Key frames are passed in once rendered.
 */
export function PrintableReport({ report, frames }: { report: VideoAnalysisReport; frames: FocusFrame[] }) {
  const { scores } = report;
  return createPortal(
    <article className="va-print">
      <header className="va-print__head">
        <h1>ArcherLab Edge · Video form report</h1>
        <p>{report.source.fileName} · analysed {formatDate(report.createdAt)} · {VIEW_LABEL[report.view.kind]} view · {report.settings.handedness === 'right' ? 'right' : 'left'}-hand draw · {BOW_LABEL[report.settings.bowType]} · {report.shots.length} shot{report.shots.length === 1 ? '' : 's'}</p>
      </header>

      <section className="va-print__score">
        <div>
          <span>Form score</span>
          <strong>{scores.overall === null ? '–' : Math.round(scores.overall)}<small>/100</small></strong>
        </div>
        <div>
          <span>Estimated level</span>
          <strong>{scores.level ? LEVEL_LABEL[scores.level] : 'Not enough data'}</strong>
          <small>{scores.confidence} confidence</small>
        </div>
        <p className="va-print__note">This score is a heuristic estimate from movement alone and has not been validated. The numbers are measurements from video, not medical or coaching judgments.</p>
      </section>

      <section>
        <h2>Area scores <small>0–100 · heuristic</small></h2>
        <table className="va-print__table">
          <tbody>
            {scores.categories.map((category) => (
              <tr key={category.id}>
                <th scope="row">{category.label}</th>
                <td className="va-print__num">{category.score === null ? '–' : Math.round(category.score)}</td>
                <td><span className="va-print__bar"><span style={{ width: `${category.score ?? 0}%` }} /></span></td>
                <td>{category.score === null ? 'Not measurable in this clip.' : CATEGORY_INFO[category.id].blurb}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>What to work on</h2>
        {report.focusAreas.length ? report.focusAreas.map((finding, index) => {
          const frame = frames.find((item) => item.findingId === finding.id);
          return (
            <div key={finding.id} className="va-print__finding">
              <div>
                <h3>{index + 1}. {finding.title} <small>{CATEGORY_INFO[finding.category].label}{finding.experimental ? ' · experimental' : ''}</small></h3>
                <p><strong>What we saw:</strong> {finding.observed}</p>
                <p><strong>Why it matters:</strong> {finding.why}</p>
                <p><strong>How to fix it:</strong> {finding.fix}</p>
                <p><strong>Drill:</strong> {finding.drill}</p>
              </div>
              {frame ? (
                <figure>
                  <img src={frame.src} alt={`Key frame for ${finding.title}`} />
                  <figcaption>{frame.caption}</figcaption>
                </figure>
              ) : null}
            </div>
          );
        }) : <p>No clear weaknesses were measured in this clip.</p>}
      </section>

      {report.shots.length ? (
        <section>
          <h2>Shot by shot</h2>
          <table className="va-print__table va-print__shots">
            <thead>
              <tr><th>Shot</th><th>Release</th><th>Draw</th><th>Aim</th><th>Follow-through</th><th>Bow arm</th><th>Bow-hand sway</th><th>Form</th><th>Data</th></tr>
            </thead>
            <tbody>
              {report.shots.map((shot) => (
                <tr key={shot.index}>
                  <td>{shot.index}</td>
                  <td>{shot.release.toFixed(2)} s</td>
                  <td>{metric(shot, 'drawDuration')}</td>
                  <td>{metric(shot, 'holdDuration')}</td>
                  <td>{metric(shot, 'followThroughHold')}</td>
                  <td>{metric(shot, 'bowElbowAngle')}</td>
                  <td>{metric(shot, 'bowHandSway')}</td>
                  <td className="va-print__num">{shot.formScore === null ? '–' : Math.round(shot.formScore)}</td>
                  <td>{shot.source === 'audio-only' ? 'heard only' : shot.quality.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {report.plan.length ? (
        <section>
          <h2>Practice plan</h2>
          <ol className="va-print__plan">
            {report.plan.map((step) => <li key={step.title}><strong>{step.title}.</strong> {step.detail}</li>)}
          </ol>
        </section>
      ) : null}

      <footer className="va-print__foot">
        Analysed on the athlete’s device with {report.engineVersion} ({report.settings.model} pose model, {Math.round(report.tracking.trackedRatio * 100)}% of frames tracked). {report.view.note}
      </footer>
    </article>,
    document.body,
  );
}

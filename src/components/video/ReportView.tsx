import { useMemo, useRef, useState, type ReactNode } from 'react';
import { commentAuthor, shotAtTime, type ReportComment } from '../../cloud/account/coachReview';
import { RESOURCE_LIBRARY } from '../../video-analysis/resources';
import { CATEGORY_INFO, METRIC_RUBRIC, formatMetricShort } from '../../video-analysis/rubric';
import { LEVEL_LABEL } from '../../video-analysis/scoring';
import { BOW_LABEL, VIEW_LABEL, formatSeconds, scoreTone } from '../../video-analysis/format';
import type { Finding, MetricKey, ResourceLink, ShotReport, VideoAnalysisReport } from '../../video-analysis/types';
import { AppIcon, type AppIconName } from '../AppIcon';
import { ActionButton } from '../ActionButton';
import { StatusBadge } from '../StatusBadge';
import { AnalysisPlayer, type PlayerHandle, type SeekRequest, type TimelineMarker } from './AnalysisPlayer';
import { CommentsPanel, type CommentsPanelProps } from './CommentsPanel';
import { LevelBadge } from './LevelBadge';

type ReportViewProps = {
  report: VideoAnalysisReport;
  videoUrl: string | null;
  cloudCoach?: ReactNode;
  /** Share-with-a-coach controls, shown before the AI review. */
  sharing?: ReactNode;
  actions: ReactNode;
  notice?: ReactNode;
  /** Re-score controls, shown under the score callouts. */
  settingsControl?: ReactNode;
  /** Comments, for a report in the cloud while signed in. `onAdd` gets the replay's moment, or null for the whole report. */
  comments?: Omit<CommentsPanelProps, 'onAdd' | 'onJump'> & { onAdd: (body: string, at: { timeS: number; shotIndex: number | null } | null) => Promise<boolean> };
};

const RESOURCE_ICON: Record<ResourceLink['kind'], AppIconName> = {
  video: 'play-circle', playlist: 'film', article: 'grid', manual: 'accessibility', search: 'scan',
};

function Scoreboard({ report }: { report: VideoAnalysisReport }) {
  const { scores } = report;
  return (
    <section className="scoreboard va-scoreboard" aria-label="Form score">
      <div className="scoreboard__total">
        <span>Form score</span>
        <strong>{scores.overall === null ? '–' : Math.round(scores.overall)}<small>/100</small></strong>
        <small>{scores.level ? LEVEL_LABEL[scores.level] : 'Not enough data to rate'}</small>
        <small className="va-estimate-note">Estimate from movement only, not a validated rating</small>
      </div>
      <div className="scoreboard__stats">
        <div><span>Estimated level</span><strong><LevelBadge level={scores.level} /></strong><small>{scores.confidence} confidence · estimate</small></div>
        <div><span>Shots found</span><strong>{report.shots.length}</strong><small>{report.letDowns.length ? `${report.letDowns.length} let-down${report.letDowns.length === 1 ? '' : 's'}` : `${Math.round(report.tracking.trackedRatio * 100)}% of frames tracked`}</small></div>
        <div><span>Camera view</span><strong>{VIEW_LABEL[report.view.kind]}</strong><small>{report.settings.handedness === 'right' ? 'Right' : 'Left'}-hand draw{report.settings.handednessSource === 'auto' ? ' · detected' : ''}</small></div>
        <div><span>Bow</span><strong>{BOW_LABEL[report.settings.bowType]}</strong><small>{report.source.analysisFps} fps{report.tracking.refinedFrames ? ` + ${report.tracking.refinedFrames} precision frames` : ''}</small></div>
      </div>
    </section>
  );
}

function Callouts({ report }: { report: VideoAnalysisReport }) {
  const { scores } = report;
  const next = scores.nextLevel;
  return (
    <div className="va-callouts">
      {scores.levelCap ? (
        <p className="va-callout"><strong>Level capped:</strong> {scores.levelCap.reason}</p>
      ) : null}
      {next ? (
        <p className="va-callout">
          <strong>Next level: {LEVEL_LABEL[next.level]} at {next.threshold}.</strong>{' '}
          {next.gap > 0 ? `You are ${Math.ceil(next.gap)} points away. ` : ''}
          The biggest gains are in {next.focus.map((id) => CATEGORY_INFO[id].label.toLowerCase()).join(' and ')}.
        </p>
      ) : null}
      {scores.confidenceReasons.length ? (
        <p className="va-callout va-callout--info"><strong>About this estimate:</strong> {scores.confidenceReasons.join(' ')}</p>
      ) : null}
      <p className="va-callout va-callout--info"><strong>Camera angle:</strong> {report.view.note}</p>
    </div>
  );
}

function Categories({ report }: { report: VideoAnalysisReport }) {
  return (
    <section className="va-panel" aria-labelledby="va-categories-title">
      <h2 id="va-categories-title">Form breakdown <small>0–100 · heuristic</small></h2>
      <div className="va-categories">
        {report.scores.categories.map((category) => (
          <article key={category.id} className={`va-category${category.score === null ? ' va-category--empty' : ''}`}>
            <header><span>{category.label}</span><strong>{category.score === null ? '–' : Math.round(category.score)}</strong></header>
            <div className="va-bar" aria-hidden="true"><div className={`va-score--${scoreTone(category.score)}`} style={{ width: `${category.score ?? 0}%` }} /></div>
            <p>{category.score === null ? 'Not measurable in this clip.' : CATEGORY_INFO[category.id].blurb}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function FindingCard({ finding, rank, onShow }: { finding: Finding; rank: number; onShow: (finding: Finding) => void }) {
  const resources = finding.resourceIds.map((id) => ({ id, ...RESOURCE_LIBRARY[id] })).filter((resource) => resource.url);
  return (
    <article className={`va-finding va-finding--${finding.severity}`}>
      <div className="va-finding__head">
        <span className="va-finding__rank">{String(rank).padStart(2, '0')}</span>
        <StatusBadge label={finding.severity === 'high' ? 'Priority' : finding.severity === 'medium' ? 'Improve' : 'Refine'} tone={finding.severity === 'high' ? 'danger' : 'warning'} compact />
        <StatusBadge label={CATEGORY_INFO[finding.category].label} tone="info" compact />
        {finding.experimental ? <StatusBadge label="Experimental" tone="info" compact /> : null}
      </div>
      <h3>{finding.title}</h3>
      <p><strong>What we saw:</strong> {finding.observed}</p>
      <p><strong>Why it matters:</strong> {finding.why}</p>
      <p><strong>How to fix it:</strong> {finding.fix}</p>
      <p className="va-finding__drill"><strong>Drill:</strong> {finding.drill}</p>
      <div className="va-finding__actions">
        {finding.where.time !== null ? (
          <ActionButton variant="secondary" type="button" onClick={() => onShow(finding)}>
            <AppIcon name="play" size={14} /> Show me{finding.where.shotIndex ? ` (shot ${finding.where.shotIndex})` : ''}
          </ActionButton>
        ) : null}
        {resources.map((resource) => <a key={resource.id} href={resource.url} target="_blank" rel="noreferrer">{resource.title} ↗</a>)}
      </div>
    </article>
  );
}

function shotMetric(shot: ShotReport, key: MetricKey): string {
  const metric = shot.metrics[key];
  return metric ? formatMetricShort(key, metric.value) : '–';
}

function ShotTable({ report, onSeek }: { report: VideoAnalysisReport; onSeek: (t: number) => void }) {
  if (!report.shots.length) return null;
  return (
    <section className="va-panel" aria-labelledby="va-shots-title">
      <h2 id="va-shots-title">Shot by shot <small>click a row to replay it</small></h2>
      <div className="va-table-wrap">
        <table className="va-table">
          <thead>
            <tr><th>Shot</th><th>Release</th><th>Draw</th><th>Aim</th><th>Follow-through</th><th>Bow arm</th><th>Release line</th><th>Bow-hand sway</th><th>Form</th><th>Data</th></tr>
          </thead>
          <tbody>
            {report.shots.map((shot) => (
              <tr key={shot.index} onClick={() => onSeek(shot.anchorStart ?? Math.max(0, shot.release - 1))} tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter') onSeek(shot.anchorStart ?? Math.max(0, shot.release - 1)); }}>
                <td><strong>{shot.index}</strong></td>
                <td>{shot.release.toFixed(2)} s {shot.releaseSource === 'audio' ? <span className="va-pill va-pill--audio" title="Release time taken from the sound">audio</span> : null}</td>
                <td>{shotMetric(shot, 'drawDuration')}</td>
                <td>{shotMetric(shot, 'holdDuration')}</td>
                <td>{shotMetric(shot, 'followThroughHold')}</td>
                <td>{shotMetric(shot, 'bowElbowAngle')}</td>
                <td>{shot.metrics.releaseBackFraction ? `${Math.round(Math.max(0, shot.metrics.releaseBackFraction.value) * 100)}% back` : '–'}</td>
                <td>{shotMetric(shot, 'bowHandSway')}</td>
                <td><strong>{shot.formScore === null ? '–' : Math.round(shot.formScore)}</strong></td>
                <td><span className={`va-pill va-pill--${shot.source === 'audio-only' ? 'audio' : shot.quality.label}`}>{shot.source === 'audio-only' ? 'heard only' : shot.quality.label}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Consistency({ report }: { report: VideoAnalysisReport }) {
  const entries = (Object.entries(report.session) as Array<[MetricKey, { value: number; confidence: number }]>);
  const audioShots = report.shots.filter((shot) => shot.audio);
  const clicker = report.shots.map((shot) => shot.metrics.clickerReaction?.value).filter((value): value is number => typeof value === 'number');
  const flights = report.shots.map((shot) => shot.audio?.flightTime).filter((value): value is number => typeof value === 'number');
  const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  if (!entries.length && !report.audio) return null;
  return (
    <section className="va-panel" aria-labelledby="va-consistency-title">
      <h2 id="va-consistency-title">Consistency &amp; sound</h2>
      <div className="va-stat-row">
        {entries.map(([key, entry]) => (
          <div key={key} className="va-stat"><span>{METRIC_RUBRIC[key].short}</span><strong>{formatMetricShort(key, entry.value)}</strong><small>across {report.shots.filter((shot) => shot.source !== 'audio-only').length} shots</small></div>
        ))}
        {report.audio?.available ? (
          <div className="va-stat"><span>Releases heard</span><strong>{audioShots.filter((shot) => shot.audio?.releaseOnset !== undefined).length}/{report.shots.length}</strong><small>{report.audio.syncOffsetS !== null ? `sound ↔ video offset ${(report.audio.syncOffsetS * 1000).toFixed(0)} ms` : 'release timing from sound'}</small></div>
        ) : report.audio ? (
          <div className="va-stat"><span>Audio</span><strong>Off</strong><small>{report.audio.reason}</small></div>
        ) : null}
        {clicker.length ? <div className="va-stat"><span>Clicker → release</span><strong>{formatSeconds(average(clicker), 2)}</strong><small>experimental · {clicker.length} shot{clicker.length === 1 ? '' : 's'}</small></div> : null}
        {flights.length ? <div className="va-stat"><span>Release → impact sound</span><strong>{formatSeconds(average(flights), 2)}</strong><small>arrow flight + sound travel</small></div> : null}
      </div>
    </section>
  );
}

export function ReportView({ report, videoUrl, cloudCoach, sharing, actions, notice, settingsControl, comments }: ReportViewProps) {
  const [seek, setSeek] = useState<SeekRequest | null>(null);
  const nonce = useRef(0);
  const playerRef = useRef<PlayerHandle>(null);
  const show = (t: number, joints: SeekRequest['joints'] = []) => {
    nonce.current += 1;
    setSeek({ t, joints, nonce: nonce.current });
    document.querySelector('.va-review')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };
  const others = report.findings.filter((finding) => !report.focusAreas.includes(finding));
  const commentItems = comments?.comments;
  const currentUserId = comments?.currentUserId;
  const viewerIsOwner = comments?.viewerIsOwner;
  const ownerEmail = comments?.ownerEmail ?? null;
  const markers = useMemo<TimelineMarker[]>(() => (commentItems ?? [])
    .filter((comment) => comment.time_s !== null)
    .map((comment) => ({ id: comment.id, t: comment.time_s as number, label: `${commentAuthor(comment, currentUserId ?? '', viewerIsOwner ?? true, ownerEmail)}: ${comment.body.slice(0, 120)}` })), [commentItems, currentUserId, ownerEmail, viewerIsOwner]);
  // Comments jump the replay like "Show me": to their moment, else to their shot.
  const jumpToComment = (comment: ReportComment) => {
    if (comment.time_s !== null) { show(comment.time_s); return; }
    const shot = report.shots.find((item) => item.index === comment.shot_index);
    if (shot) show(shot.anchorStart ?? Math.max(0, shot.release - 1));
  };
  const addComment = (body: string, atMoment: boolean) => {
    if (!comments) return Promise.resolve(false);
    if (!atMoment) return comments.onAdd(body, null);
    const timeS = playerRef.current?.currentTime() ?? 0;
    return comments.onAdd(body, { timeS, shotIndex: shotAtTime(report.shots, timeS) });
  };

  return (
    <div className="va-report">
      {notice}
      <Scoreboard report={report} />
      <Callouts report={report} />
      {settingsControl}
      <AnalysisPlayer report={report} videoUrl={videoUrl} seek={seek} handle={playerRef} markers={markers} />
      {comments ? <CommentsPanel {...comments} onAdd={addComment} onJump={jumpToComment} /> : null}

      <section className="va-panel" aria-labelledby="va-focus-title">
        <h2 id="va-focus-title">What to work on <small>{report.focusAreas.length ? `top ${report.focusAreas.length}` : ''}</small></h2>
        {report.focusAreas.length ? (
          <div className="va-focus">
            {report.focusAreas.map((finding, index) => <FindingCard key={finding.id} finding={finding} rank={index + 1} onShow={(item) => show(item.where.time ?? 0, item.where.joints)} />)}
          </div>
        ) : (
          <p className="va-muted">{report.shots.length ? 'No clear weaknesses were measured in this clip. Film more shots, or from another angle, for a deeper look.' : 'No complete shots were found, so there is nothing to coach yet. Check the tips below and try another clip.'}</p>
        )}
        {others.length ? (
          <details className="va-details" style={{ marginTop: 16 }}>
            <summary>{others.length} more thing{others.length === 1 ? '' : 's'} to refine</summary>
            <div className="va-focus" style={{ marginTop: 12 }}>
              {others.map((finding, index) => <FindingCard key={finding.id} finding={finding} rank={report.focusAreas.length + index + 1} onShow={(item) => show(item.where.time ?? 0, item.where.joints)} />)}
            </div>
          </details>
        ) : null}
      </section>

      {report.strengths.length ? (
        <section className="va-panel" aria-labelledby="va-strengths-title">
          <h2 id="va-strengths-title">What you do well</h2>
          <ul className="va-strengths">
            {report.strengths.map((strength) => <li key={strength.metric}><AppIcon name="check" size={15} /> {strength.title} <small>{strength.detail}</small></li>)}
          </ul>
        </section>
      ) : null}

      <Categories report={report} />
      <ShotTable report={report} onSeek={(t) => show(t)} />
      <Consistency report={report} />

      <div className="va-two">
        <section className="va-panel" aria-labelledby="va-plan-title">
          <h2 id="va-plan-title">Your next sessions</h2>
          <ol className="va-plan">
            {report.plan.map((step) => <li key={step.title}><strong>{step.title}</strong><span>{step.detail}</span></li>)}
          </ol>
        </section>
        <section className="va-panel" aria-labelledby="va-resources-title">
          <h2 id="va-resources-title">Watch &amp; read</h2>
          <ul className="va-resources">
            {report.resources.map((resource) => (
              <li key={resource.id}>
                <a href={resource.url} target="_blank" rel="noreferrer">
                  <span><AppIcon name={RESOURCE_ICON[resource.kind]} size={18} /></span>
                  <strong>{resource.title}</strong>
                  <small>{resource.publisher} · {resource.reason}</small>
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {sharing}
      {cloudCoach}

      <section className="va-panel">
        <details className="va-details">
          <summary>How this was measured, and its limits</summary>
          <ul>
            <li>Engine {report.engineVersion}: {report.tracking.framesAnalyzed} frames analysed ({Math.round(report.tracking.trackedRatio * 100)}% with the archer tracked) using the {report.settings.model} pose model on the {report.settings.delegate === 'unknown' ? 'device' : report.settings.delegate}{report.tracking.processingMs ? ` in ${(report.tracking.processingMs / 1000).toFixed(1)} s` : ''}.</li>
            {report.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
          </ul>
        </details>
      </section>

      <div className="va-actions">{actions}</div>
    </div>
  );
}

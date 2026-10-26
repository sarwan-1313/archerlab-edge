import { useRef, useState } from 'react';
import { buildConsensus, type CoachReview } from '../../cloud/ai/coachReview';
import { forgetProviderSetting, isRemembered, loadProviderSetting, saveProviderSetting } from '../../cloud/ai/keyStore';
import { PROVIDERS, type CloudProviderId, type MediaPart } from '../../cloud/ai/providers';
import { runCloudReview, type ProviderOutcome } from '../../cloud/ai/runCloudReview';
import { fileToBase64, renderKeyFrames } from '../../video-analysis/browser/keyFrames';
import { loadVideo } from '../../video-analysis/browser/runVideoAnalysis';
import { formatBytes } from '../../video-analysis/format';
import type { VideoAnalysisReport } from '../../video-analysis/types';
import { ActionButton } from '../ActionButton';
import { AppIcon } from '../AppIcon';
import { StatusBadge } from '../StatusBadge';
import { LevelBadge } from './LevelBadge';

const ORDER: CloudProviderId[] = ['anthropic', 'openai', 'gemini'];
const INLINE_VIDEO_LIMIT = 14 * 1024 * 1024;

interface ProviderState { enabled: boolean; apiKey: string; model: string }

function initialState(): Record<CloudProviderId, ProviderState> {
  return Object.fromEntries(ORDER.map((id) => {
    const stored = loadProviderSetting(id);
    return [id, { enabled: stored?.enabled ?? false, apiKey: stored?.apiKey ?? '', model: stored?.model || PROVIDERS[id].defaultModel }];
  })) as Record<CloudProviderId, ProviderState>;
}

function ReviewCard({ review }: { review: CoachReview }) {
  const info = PROVIDERS[review.provider];
  return (
    <article className="va-review-card">
      <header>
        <strong>{info.name}</strong>
        <small className="va-faint">{review.model}{review.usedVideo ? ' · watched the video' : ''}</small>
        <LevelBadge level={review.level} />
      </header>
      {review.summary ? <p>{review.summary}</p> : null}
      {review.strengths.length ? <><h4>Strengths</h4><ul>{review.strengths.map((item) => <li key={item}>{item}</li>)}</ul></> : null}
      {review.improvements.length ? (
        <>
          <h4>Improve</h4>
          <ul>{review.improvements.map((item) => <li key={item.title}><strong>{item.title}.</strong> {item.detail}{item.drill ? <em> Drill: {item.drill}</em> : null}</li>)}</ul>
        </>
      ) : null}
      {review.disagreements.length ? <><h4>Disagrees with the measurements</h4><ul>{review.disagreements.map((item) => <li key={item}>{item}</li>)}</ul></> : null}
      {review.safety.length ? <><h4>Safety</h4><ul>{review.safety.map((item) => <li key={item}>{item}</li>)}</ul></> : null}
    </article>
  );
}

type CloudCoachPanelProps = {
  report: VideoAnalysisReport;
  videoUrl: string | null;
  videoBlob: Blob | null;
};

export function CloudCoachPanel({ report, videoUrl, videoBlob }: CloudCoachPanelProps) {
  const [providers, setProviders] = useState(initialState);
  const [remember, setRemember] = useState(() => ORDER.some(isRemembered));
  const [sendVideo, setSendVideo] = useState(false);
  const [consent, setConsent] = useState(false);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<ProviderOutcome[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const enabled = ORDER.filter((id) => providers[id].enabled && providers[id].apiKey.trim());
  const videoSmallEnough = Boolean(videoBlob && videoBlob.size <= INLINE_VIDEO_LIMIT);
  const update = (id: CloudProviderId, patch: Partial<ProviderState>) => {
    setProviders((current) => {
      const next = { ...current, [id]: { ...current[id], ...patch } };
      saveProviderSetting(id, next[id], remember);
      return next;
    });
  };

  const run = async () => {
    if (!consent || !enabled.length) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setOutcomes([]);
    try {
      let stills: MediaPart[] = [];
      if (videoUrl) {
        setStatus('Preparing annotated still frames…');
        const video = document.createElement('video');
        // Cloud-stored videos come from another origin; request them with CORS so frames can be read.
        if (!videoUrl.startsWith('blob:')) video.crossOrigin = 'anonymous';
        await loadVideo(video, videoUrl);
        stills = await renderKeyFrames(report, video);
        video.removeAttribute('src');
        video.load();
      }
      let clip: MediaPart | null = null;
      if (sendVideo && videoBlob && videoSmallEnough && providers.gemini.enabled) {
        setStatus('Reading the clip for Gemini…');
        clip = { kind: 'video', mimeType: videoBlob.type || 'video/mp4', base64: await fileToBase64(videoBlob), caption: 'the athlete\'s full clip' };
      }
      setStatus(`Asking ${enabled.map((id) => PROVIDERS[id].name).join(', ')}…`);
      const results = await runCloudReview(
        enabled.map((id) => ({ provider: id, apiKey: providers[id].apiKey, model: providers[id].model, sendVideo: id === 'gemini' && sendVideo })),
        report, stills, clip, controller.signal,
      );
      setOutcomes(results);
      setStatus(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The review could not be prepared.');
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const reviews = outcomes.filter((outcome): outcome is Extract<ProviderOutcome, { status: 'ok' }> => outcome.status === 'ok').map((outcome) => outcome.review);
  const consensus = reviews.length ? buildConsensus(reviews, report.scores.level) : null;

  return (
    <section className="va-panel va-cloud" aria-labelledby="va-cloud-title">
      <h2 id="va-cloud-title"><AppIcon name="sparkles" size={20} /> Second opinion from AI coaches <small>optional · your own API keys</small></h2>
      <p className="va-muted">
        Ask up to three AI models to review the same shots. Each gets the measurements above plus {videoUrl ? 'six annotated still frames' : 'no images (the video is not stored)'}, and answers as a coach. Their views are combined so you can see where they agree. Keys stay in this browser and go only to the provider you choose; ArcherLab has no server.
      </p>
      <div className="va-cloud__providers">
        {ORDER.map((id) => {
          const info = PROVIDERS[id];
          const state = providers[id];
          return (
            <div key={id} className={`va-provider${state.enabled ? ' is-enabled' : ''}`}>
              <header>
                <label className="va-toggle"><input type="checkbox" checked={state.enabled} onChange={(event) => update(id, { enabled: event.target.checked })} /><strong>{info.name}</strong></label>
                <small>{info.company}</small>
              </header>
              <input type="password" autoComplete="off" spellCheck={false} placeholder={`API key (${info.keyHint})`} value={state.apiKey} onChange={(event) => update(id, { apiKey: event.target.value })} aria-label={`${info.name} API key`} />
              <input type="text" spellCheck={false} value={state.model} onChange={(event) => update(id, { model: event.target.value })} aria-label={`${info.name} model`} />
              <a href={info.keyUrl} target="_blank" rel="noreferrer">Get a {info.company} key ↗</a>
            </div>
          );
        })}
      </div>
      <label className="va-toggle"><input type="checkbox" checked={remember} onChange={(event) => {
        setRemember(event.target.checked);
        for (const id of ORDER) {
          if (providers[id].apiKey) saveProviderSetting(id, providers[id], event.target.checked);
        }
      }} /><span>Remember keys on this device<small>Off: keys are forgotten when this tab closes.</small></span></label>
      {providers.gemini.enabled ? (
        <label className="va-toggle"><input type="checkbox" checked={sendVideo} disabled={!videoSmallEnough} onChange={(event) => setSendVideo(event.target.checked)} /><span>Let Gemini watch the whole clip<small>{videoBlob ? (videoSmallEnough ? `Sends the ${formatBytes(videoBlob.size)} video to Google instead of stills.` : `Only clips under ${formatBytes(INLINE_VIDEO_LIMIT)} can be sent; this one is ${formatBytes(videoBlob.size)}.`) : 'Available while the original video is open or stored.'}</small></span></label>
      ) : null}
      <label className="va-toggle va-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>I agree that {sendVideo ? 'the video' : 'still frames'} and the measurements will be sent to the providers I selected, under their terms.<small>If the archer is under 18, a parent or guardian has agreed to this.</small></span></label>
      <div className="va-actions">
        <ActionButton variant="primary" type="button" disabled={!consent || !enabled.length || running} onClick={() => void run()}>
          <AppIcon name="sparkles" size={16} /> {running ? 'Reviewing…' : `Ask ${enabled.length || ''} coach${enabled.length === 1 ? '' : 'es'}`.replace('  ', ' ')}
        </ActionButton>
        {running ? <ActionButton variant="ghost" type="button" onClick={() => abortRef.current?.abort()}>Cancel</ActionButton> : null}
        {ORDER.some((id) => providers[id].apiKey) && !running ? (
          <ActionButton variant="ghost" type="button" onClick={() => { ORDER.forEach(forgetProviderSetting); setProviders(initialState()); }}>Forget keys</ActionButton>
        ) : null}
      </div>
      {status ? <p className="va-import-status" role="status">{status}</p> : null}

      {consensus ? (
        <div className="va-cloud">
          <div className="va-callouts">
            <p className="va-callout">
              <strong>Combined level: {consensus.level ? <LevelBadge level={consensus.level} /> : 'no agreement'}</strong>{' '}
              Votes — {Object.entries(consensus.levelVotes).map(([level, votes]) => `${level}: ${votes}`).join(', ')} (includes ArcherLab's on-device estimate).
            </p>
          </div>
          {consensus.agreed.length ? (
            <ul className="va-agreed">
              {consensus.agreed.map((item) => (
                <li key={item.title}>
                  <em>{item.votes > 1 ? `${item.votes} of ${reviews.length} coaches agree` : `${PROVIDERS[item.providers[0]].name} only`}</em>
                  <strong>{item.title}</strong>
                  {item.detail ? <span>{item.detail}</span> : null}
                  {item.drill ? <span>Drill: {item.drill}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {outcomes.length ? (
        <div className="va-review-grid">
          {outcomes.map((outcome) => outcome.status === 'ok'
            ? <ReviewCard key={outcome.provider} review={outcome.review} />
            : (
              <article key={outcome.provider} className="va-review-card va-review-card--error">
                <header><strong>{PROVIDERS[outcome.provider].name}</strong><StatusBadge label="Failed" tone="danger" compact /></header>
                <p>{outcome.error}</p>
              </article>
            ))}
        </div>
      ) : null}
      <p className="va-faint">AI coaches can be wrong, and they only see what the camera saw. Treat this as a second opinion, not a diagnosis, and check anything surprising with a qualified coach.</p>
    </section>
  );
}

import { useId, useState, type FormEvent } from 'react';
import type { CoachReview } from '../../cloud/ai/coachReview';
import { LOCAL_COACH_NAME } from '../../cloud/ai/coachReview';
import { LOCAL_MODEL, LOCAL_MODEL_SIZE_LABEL } from '../../local-coach/model';
import { describeProgress, useLocalCoach } from '../../local-coach/useLocalCoach';
import type { VideoAnalysisReport } from '../../video-analysis/types';
import { ActionButton } from '../ActionButton';
import { AppIcon } from '../AppIcon';

const SUGGESTIONS = ['What should I fix first?', 'Which drill should I start with?', 'How consistent were my shots?'];

type LocalCoachCardProps = {
  report: VideoAnalysisReport;
  review: CoachReview | null;
  onReview: (review: CoachReview | null) => void;
};

/**
 * The private coach: a small language model that runs in this browser. Nothing
 * here is sent anywhere; the only network use is the one-time model download.
 * This file is loaded on demand, and the model itself only after a click.
 */
export default function LocalCoachCard({ report, review, onReview }: LocalCoachCardProps) {
  const coach = useLocalCoach(report, review, onReview);
  const titleId = useId();
  const [question, setQuestion] = useState('');
  const busy = coach.stage !== 'idle' && coach.stage !== 'confirm';
  const submit = (event: FormEvent) => {
    event.preventDefault();
    coach.ask(question);
    setQuestion('');
  };
  const ask = (text: string) => coach.ask(text);

  return (
    <div className={`va-provider va-local${review ? ' is-enabled' : ''}`} role="group" aria-labelledby={titleId}>
      <header>
        <strong id={titleId}>{LOCAL_COACH_NAME} <small>(runs on this device)</small></strong>
        <small>{LOCAL_MODEL.name}</small>
      </header>
      <p className="va-muted">
        A small AI model that runs on your own graphics chip. Your report is never sent anywhere, and no key or account is needed. It is less capable than the cloud coaches, so treat it as a rough second opinion.
      </p>

      {coach.support === null ? <p className="va-faint" role="status">Checking whether this device can run it…</p> : null}
      {coach.support && !coach.support.ok ? (
        <p className="va-callout" role="note"><strong>Not available here.</strong> {coach.support.reason} The cloud coaches work on any device.</p>
      ) : null}

      {coach.support?.ok && coach.stage === 'idle' ? (
        <div className="va-actions">
          <ActionButton variant="primary" type="button" onClick={coach.start}>
            <AppIcon name="sparkles" size={16} /> {review ? 'Review again' : 'Ask the private coach'}
          </ActionButton>
          {coach.downloaded ? <ActionButton variant="ghost" type="button" onClick={coach.forget}>Remove model ({LOCAL_MODEL_SIZE_LABEL})</ActionButton> : null}
        </div>
      ) : null}
      {coach.support?.ok && coach.stage === 'idle' && !coach.downloaded && !review ? (
        <p className="va-faint">First use downloads the model once ({LOCAL_MODEL_SIZE_LABEL}); you will be asked before anything is downloaded.</p>
      ) : null}

      {coach.stage === 'confirm' ? (
        <div className="va-local__confirm" role="alertdialog" aria-labelledby="va-local-confirm-title" aria-describedby="va-local-confirm-body">
          <strong id="va-local-confirm-title">Download {LOCAL_MODEL_SIZE_LABEL}?</strong>
          <div id="va-local-confirm-body">
            <p>
              The private coach needs the {LOCAL_MODEL.name} model by {LOCAL_MODEL.maker}: <strong>{LOCAL_MODEL_SIZE_LABEL}</strong> once, then it is saved in this browser and later reviews need no download. While loaded it uses about {(LOCAL_MODEL.gpuMemoryMb / 1000).toFixed(1)} GB of graphics memory.
            </p>
            <p>
              Licence: <a href={LOCAL_MODEL.licenceUrl} target="_blank" rel="noreferrer">{LOCAL_MODEL.licence}</a>, which allows this use. The files come from Hugging Face and GitHub, which see an ordinary download request from you; your report and questions are never sent to them or anyone else.
            </p>
            {coach.room === false ? <p className="va-callout" role="alert">This browser may not have enough free storage for the model. Free some space first, or it may fail part-way.</p> : null}
            <p className="va-faint">Use Wi‑Fi if you are on a mobile plan. Stopping part-way keeps what was saved.</p>
          </div>
          <div className="va-actions">
            <ActionButton variant="primary" type="button" onClick={coach.confirmDownload}><AppIcon name="download" size={16} /> Download {LOCAL_MODEL_SIZE_LABEL} and ask</ActionButton>
            <ActionButton variant="ghost" type="button" onClick={coach.cancelDownload}>Not now</ActionButton>
          </div>
        </div>
      ) : null}

      {coach.stage === 'loading' ? (
        <div className="va-local__progress" role="status">
          <label htmlFor="va-local-progress">{describeProgress(coach.progress?.text ?? '', coach.downloading)} {Math.round((coach.progress?.fraction ?? 0) * 100)}%</label>
          <progress id="va-local-progress" max={1} value={coach.progress?.fraction ?? 0} />
        </div>
      ) : null}
      {coach.stage === 'reviewing' ? <p className="va-import-status" role="status">Writing the review on your device… {coach.partial ? `${coach.partial.split(/\s+/).length} words so far` : ''}</p> : null}
      {coach.stage === 'loading' || coach.stage === 'reviewing' || coach.stage === 'answering' ? (
        <div className="va-actions"><ActionButton variant="ghost" type="button" onClick={coach.stop}>Stop</ActionButton></div>
      ) : null}

      {coach.error ? <p className="va-callout va-callout--danger" role="alert">{coach.error}</p> : null}
      {coach.notice ? <p className="va-faint" role="status">{coach.notice}</p> : null}

      {review ? (
        <section className="va-chat" aria-labelledby="va-chat-title">
          <h4 id="va-chat-title">Ask about this report</h4>
          <p className="va-faint">Answers use only this report’s measurements. The coach cannot see the video.</p>
          {coach.turns.length || coach.stage === 'answering' ? (
            <ol className="va-chat__log" aria-live="polite">
              {coach.turns.map((turn, index) => <li key={index} className={`va-chat__turn va-chat__turn--${turn.role}`}><span className="va-chat__who">{turn.role === 'user' ? 'You' : LOCAL_COACH_NAME}</span>{turn.content}</li>)}
              {coach.stage === 'answering' ? <li className="va-chat__turn va-chat__turn--assistant"><span className="va-chat__who">{LOCAL_COACH_NAME}</span>{coach.partial || 'Thinking…'}</li> : null}
            </ol>
          ) : (
            <div className="va-chat__ideas">{SUGGESTIONS.map((text) => <button key={text} type="button" className="va-chat__idea" disabled={busy} onClick={() => ask(text)}>{text}</button>)}</div>
          )}
          <form className="va-chat__form" onSubmit={submit}>
            <input type="text" value={question} maxLength={400} disabled={busy} placeholder="Ask a question about your report" aria-label="Question for the private coach" onChange={(event) => setQuestion(event.target.value)} />
            <ActionButton variant="secondary" type="submit" disabled={busy || !question.trim()}>Ask</ActionButton>
          </form>
        </section>
      ) : null}
    </div>
  );
}

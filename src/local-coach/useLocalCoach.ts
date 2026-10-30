import { useCallback, useEffect, useRef, useState } from 'react';
import type { CoachReview } from '../cloud/ai/coachReview';
import type { VideoAnalysisReport } from '../video-analysis/types';
import { LoadCancelled, hasRoomForModel, isModelCached, loadLocalEngine, modelWasDownloaded, removeLocalModel, type LoadProgress, type LocalEngine } from './engine';
import { LocalCoachStopped, askFollowUp, buildChatSystem, runLocalReview, type ChatTurn } from './localReview';
import { checkLocalCoachSupport, type GpuSupport } from './webgpu';

export type LocalStage =
  /** Nothing running. */
  | 'idle'
  /** The model is not on this device yet; waiting for the athlete to confirm the download. */
  | 'confirm'
  | 'loading'
  | 'reviewing'
  | 'answering';

/** WebLLM's progress text is long and technical; this says the same in a few words. */
export function describeProgress(text: string, downloading: boolean): string {
  if (/fetch|download/i.test(text) || downloading) return downloading ? 'Downloading the model…' : 'Reading the saved model…';
  if (/shader|gpu|compil/i.test(text)) return 'Preparing your graphics chip…';
  return 'Loading the model…';
}

const DEVICE_LOST = /device (was )?lost|out of memory|\bOOM\b|failed to allocate/i;

/** `review` is owned by the parent, which also feeds it to the combined consensus. */
export function useLocalCoach(report: VideoAnalysisReport, review: CoachReview | null, onReview: (review: CoachReview | null) => void) {
  const [support, setSupport] = useState<GpuSupport | null>(null);
  const [stage, setStage] = useState<LocalStage>('idle');
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(modelWasDownloaded);
  const [room, setRoom] = useState<boolean | null>(null);
  const [partial, setPartial] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);

  const engineRef = useRef<LocalEngine | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  /** Set while waiting for the athlete to confirm the download; called with their answer. */
  const confirmRef = useRef<((accepted: boolean) => void) | null>(null);
  const aliveRef = useRef(true);
  const onReviewRef = useRef(onReview);
  onReviewRef.current = onReview;
  const turnsRef = useRef(turns);
  turnsRef.current = turns;
  const reviewRef = useRef(review);
  reviewRef.current = review;

  useEffect(() => {
    let cancelled = false;
    void checkLocalCoachSupport().then((result) => { if (!cancelled) setSupport(result); });
    return () => { cancelled = true; };
  }, []);

  /** Frees the graphics memory the model uses and ends its worker. Leaving the page always does this. */
  const release = useCallback(async () => {
    abortRef.current?.abort();
    const engine = engineRef.current;
    engineRef.current = null;
    await engine?.unload().catch(() => undefined);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      confirmRef.current?.(false);
      engineRef.current?.interrupt();
      void release();
    };
  }, [release]);

  const guard = <T,>(setter: (value: T) => void) => (value: T) => { if (aliveRef.current) setter(value); };
  const show = {
    stage: guard(setStage), progress: guard(setProgress), partial: guard(setPartial), error: guard(setError),
    notice: guard(setNotice), turns: guard(setTurns), downloading: guard(setDownloading), room: guard(setRoom), downloaded: guard(setDownloaded),
  };

  const fail = async (caught: unknown) => {
    if (caught instanceof LoadCancelled || caught instanceof LocalCoachStopped) {
      show.notice('Stopped.');
      return;
    }
    const message = caught instanceof Error ? caught.message : '';
    if (DEVICE_LOST.test(message)) {
      // The graphics chip dropped the model (usually out of memory); the next try loads it afresh.
      await release();
      show.error('The graphics chip ran out of memory or was reset. Close other tabs that use heavy graphics and try again.');
    } else {
      show.error(message || 'The private coach hit a problem. Try again.');
    }
  };

  const ensureEngine = async (): Promise<LocalEngine> => {
    if (engineRef.current) return engineRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    show.stage('loading');
    show.progress({ fraction: 0, text: '' });
    const engine = await loadLocalEngine(show.progress, controller.signal);
    if (!aliveRef.current) {
      await engine.unload();
      throw new LoadCancelled();
    }
    engineRef.current = engine;
    show.downloaded(true);
    return engine;
  };

  const writeReview = async () => {
    const engine = await ensureEngine();
    show.stage('reviewing');
    show.partial('');
    const result = await runLocalReview(engine, report, show.partial);
    show.turns([]);
    onReviewRef.current(result);
  };

  /** Runs `task` with the busy flag, stage reset and error handling that every action needs. */
  const run = async (task: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    show.error(null);
    show.notice(null);
    try {
      await task();
    } catch (caught) {
      await fail(caught);
    } finally {
      busyRef.current = false;
      abortRef.current = null;
      show.stage('idle');
      show.partial('');
      show.progress(null);
    }
  };

  /** Starts a review; when the model must be downloaded first, asks the athlete to confirm. */
  const start = () => {
    if (busyRef.current) return;
    void run(async () => {
      if (!engineRef.current && !(await isModelCached())) {
        show.downloading(true);
        show.room(await hasRoomForModel());
        show.stage('confirm');
        const accepted = await new Promise<boolean>((resolve) => { confirmRef.current = resolve; });
        confirmRef.current = null;
        if (!accepted) return;
      } else {
        show.downloading(false);
      }
      await writeReview();
    });
  };

  const confirmDownload = () => confirmRef.current?.(true);
  const cancelDownload = () => confirmRef.current?.(false);

  /** Ends whatever the coach is doing: the download, the review being written or an answer. */
  const stop = () => {
    if (stage === 'confirm') { cancelDownload(); return; }
    if (stage === 'loading') abortRef.current?.abort();
    else engineRef.current?.interrupt();
  };

  const ask = (question: string) => {
    const text = question.trim();
    if (!text || busyRef.current || !reviewRef.current) return;
    void run(async () => {
      const engine = await ensureEngine();
      show.stage('answering');
      show.partial('');
      const history = turnsRef.current;
      show.turns([...history, { role: 'user', content: text }]);
      const answer = await askFollowUp(engine, buildChatSystem(report, reviewRef.current), history, text, show.partial);
      const note = answer.truncated ? ' …' : answer.stopped ? ' (stopped)' : '';
      show.turns([...history, { role: 'user', content: text }, { role: 'assistant', content: (answer.text || 'No answer was written.') + note }]);
    });
  };

  const forget = () => {
    void run(async () => {
      await release();
      await removeLocalModel();
      show.downloaded(false);
      show.notice('The model was removed from this device.');
    });
  };

  return { support, stage, progress, downloading, downloaded, room, partial, error, notice, turns, start, confirmDownload, cancelDownload, stop, ask, forget };
}

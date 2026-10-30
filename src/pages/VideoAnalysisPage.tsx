import { useCallback, useEffect, useRef, useState } from 'react';
import { backupReport, describeCloudError, listCloudReports, loadCloudReport } from '../cloud/account/cloudSync';
import { memberLabel } from '../cloud/account/clubRoster';
import type { ClubMember } from '../cloud/account/clubs';
import { listSharedWithMe, loadReviewReport, type ReportShare, type SharedReport } from '../cloud/account/coachReview';
import { useCloudAccount } from '../cloud/account/useCloudAccount';
import { useReportComments } from '../cloud/account/useReportComments';
import { ActionButton } from '../components/ActionButton';
import { AppIcon } from '../components/AppIcon';
import { PageHeader } from '../components/PageHeader';
import { CloudCoachPanel } from '../components/video/CloudCoachPanel';
import { LevelBadge } from '../components/video/LevelBadge';
import { ProcessingView } from '../components/video/ProcessingView';
import { RescorePanel } from '../components/video/RescorePanel';
import { ReportView } from '../components/video/ReportView';
import { ShareWithCoachPanel } from '../components/video/ShareWithCoachPanel';
import { TrimPreview } from '../components/video/TrimPreview';
import { UploadPanel, type UploadOptions } from '../components/video/UploadPanel';
import { useAthleteProfile } from '../hooks/useAthleteProfile';
import { isWakeLockSupported, useWakeLock } from '../hooks/useWakeLock';
import { readReportParam, routeForPage } from '../navigation/routes';
import { AnalysisCancelledError } from '../video-analysis/browser/frameCapture';
import { availableModels } from '../video-analysis/browser/poseModel';
import { loadVideo, runVideoAnalysis, type AnalysisProgress } from '../video-analysis/browser/runVideoAnalysis';
import { VIDEO_CONFIG } from '../video-analysis/config';
import { VIEW_LABEL, formatBytes, formatClock, formatDate } from '../video-analysis/format';
import { buildReport } from '../video-analysis/buildReport';
import { chooseDefaultModel, isPoseModelVariant } from '../video-analysis/modelChoice';
import { rangeLength } from '../video-analysis/range';
import { applyReportToProfile, isFormStatus } from '../video-analysis/profileStatus';
import { ReportFileError, inputFromReport, readReportFile, type ReportBundle, type RescoreSettings } from '../video-analysis/reportFile';
import { carryOverAnnotations } from '../video-analysis/annotations';
import { fixtureFromReport } from '../video-analysis/validation/labels';
import { deleteVideoReport, listVideoReports, loadVideoBlob, loadVideoReport, reportToJson, saveVideoReport, updateVideoReport } from '../video-analysis/storage';
import { toShotAnalyses } from '../video-analysis/toShotAnalyses';
import type { BowType, PoseModelVariant, ReportLabels, TimeRange, VideoAnalysisReport, VideoReportSummary } from '../video-analysis/types';
import type { ShotAnalysis } from '../types/shotAnalysis';
import { entryFromVideoReport } from '../practice-log/sources';
import { recordPracticeEntry } from '../practice-log/storage';
import '../styles/video.css';

const OPTIONS_KEY = 'archerlab-edge:video-options';
// Set only when the athlete picks a pose model, so the default can improve for everyone else.
const MODEL_CHOICE_KEY = 'archerlab-edge:video-model';
const BOW_TYPES: BowType[] = ['recurve', 'compound', 'barebow', 'traditional'];

type View =
  | { kind: 'upload' }
  | { kind: 'preview'; file: File; url: string; converted?: boolean }
  | { kind: 'processing'; file: File; url: string; range: TimeRange }
  | { kind: 'report'; report: VideoAnalysisReport; videoUrl: string | null; videoBlob: Blob | null; source: 'fresh' | 'saved' | 'cloud' | 'file' | 'shared'; share?: ReportShare; club?: ClubMember }
  | { kind: 'error'; message: string; file?: File };

function readOptions(): Partial<UploadOptions> {
  try {
    const raw = localStorage.getItem(OPTIONS_KEY);
    return raw ? JSON.parse(raw) as Partial<UploadOptions> : {};
  } catch {
    return {};
  }
}

function readModelChoice(): PoseModelVariant | null {
  try {
    const choice = localStorage.getItem(MODEL_CHOICE_KEY);
    if (isPoseModelVariant(choice)) return choice;
  } catch { /* fall through */ }
  // Older saved options always held a model; anything but the old Lite default was a deliberate pick.
  const legacy = readOptions().model;
  return isPoseModelVariant(legacy) && legacy !== 'lite' ? legacy : null;
}

const TIPS = [
  { title: 'Side-on', body: 'Camera level with your chest, square to the shooting line. Other angles work, with less precision.' },
  { title: 'Whole body', body: 'Head to feet in frame, with a little space around you.' },
  { title: '3+ shots', body: 'More shots unlock consistency measures and a steadier level.' },
  { title: 'Steady camera', body: 'Use a tripod or lean the phone against something solid.' },
  { title: 'Sound on', body: 'The release sound pins the exact moment of each shot.' },
];

type ReportViewState = Extract<View, { kind: 'report' }>;

type VideoAnalysisPageProps = {
  /** Opens the clip's shots in Analytics and Replay. */
  onOpenInAnalytics?: (shots: ShotAnalysis[]) => void;
  /** False while the device is offline: only the pose models already on it can run. */
  online?: boolean;
  /** Reports whether a clip is being analysed, so the app can hold a new version back until it is done. */
  onProcessingChange?: (processing: boolean) => void;
};

export function VideoAnalysisPage({ onOpenInAnalytics, online = true, onProcessingChange }: VideoAnalysisPageProps = {}) {
  const { profile, save } = useAthleteProfile();
  const account = useCloudAccount();
  const [view, setView] = useState<View>({ kind: 'upload' });
  const [options, setOptions] = useState<UploadOptions>(() => ({
    quality: 'standard', model: 'lite', handedness: 'auto', bowType: 'recurve', analyzeAudio: true, keepVideo: false, updateProfile: true, ...readOptions(),
  }));
  const [models, setModels] = useState<PoseModelVariant[]>(['lite']);
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [history, setHistory] = useState<VideoReportSummary[]>([]);
  const [cloudHistory, setCloudHistory] = useState<VideoReportSummary[]>([]);
  const [sharedWithMe, setSharedWithMe] = useState<SharedReport[]>([]);
  // A /video?report=<id> link, opened once the sign-in state is known.
  const pendingReportRef = useRef(account.configured ? readReportParam(window.location.search) : undefined);
  const [notice, setNotice] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [rescoring, setRescoring] = useState(false);
  const reportFileRef = useRef<HTMLInputElement>(null);
  const [reportFileError, setReportFileError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Distinguishes the athlete pressing Cancel from React tearing an effect down (e.g. StrictMode re-runs).
  const userCancelledRef = useRef(false);
  const urlsRef = useRef<string[]>([]);
  const profileRef = useRef(profile);
  useEffect(() => { profileRef.current = profile; }, [profile]);

  // Default the bow type from the profile once it loads.
  const bowFromProfile = profile?.bowType;
  useEffect(() => {
    if (typeof bowFromProfile === 'string' && BOW_TYPES.includes(bowFromProfile as BowType) && !readOptions().bowType) {
      setOptions((current) => ({ ...current, bowType: bowFromProfile as BowType }));
    }
  }, [bowFromProfile]);

  useEffect(() => {
    try { localStorage.setItem(OPTIONS_KEY, JSON.stringify(options)); } catch { /* per-viewer convenience only */ }
  }, [options]);

  useEffect(() => {
    let cancelled = false;
    void availableModels().then((variants) => {
      if (cancelled) return;
      setModels(variants);
      setOptions((current) => ({ ...current, model: chooseDefaultModel(variants, readModelChoice()) }));
    });
    return () => { cancelled = true; };
    // Again when the connection comes or goes: offline, only models already on this device can load.
  }, [online]);

  const refreshHistory = useCallback(() => {
    listVideoReports().then(setHistory).catch(() => setHistory([]));
  }, []);
  useEffect(() => { refreshHistory(); }, [refreshHistory]);

  const sessionUserId = account.session?.user.id;
  const { client: cloudApi, freshSession } = account;
  const [cloudRevision, setCloudRevision] = useState(0);
  const refreshCloudHistory = useCallback(() => setCloudRevision((revision) => revision + 1), []);
  useEffect(() => {
    if (!cloudApi || !sessionUserId) { setCloudHistory([]); return; }
    let cancelled = false;
    void freshSession().then((session) => (session ? listCloudReports(cloudApi, session) : []))
      .then((rows) => { if (!cancelled) setCloudHistory(rows); })
      .catch(() => { if (!cancelled) setCloudHistory([]); });
    return () => { cancelled = true; };
  }, [cloudApi, cloudRevision, freshSession, sessionUserId]);

  useEffect(() => {
    if (!cloudApi || !sessionUserId) { setSharedWithMe([]); return; }
    let cancelled = false;
    // Projects set up before coach review have no shares table; the list then stays empty.
    void freshSession().then((session) => (session ? listSharedWithMe(cloudApi, session) : []))
      .then((rows) => { if (!cancelled) setSharedWithMe(rows); })
      .catch(() => { if (!cancelled) setSharedWithMe([]); });
    return () => { cancelled = true; };
  }, [cloudApi, freshSession, sessionUserId]);

  const makeUrl = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    urlsRef.current.push(url);
    return url;
  };
  useEffect(() => () => {
    abortRef.current?.abort();
    urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const changeOptions = (next: UploadOptions) => {
    if (next.model !== options.model) {
      try { localStorage.setItem(MODEL_CHOICE_KEY, next.model); } catch { /* per-viewer convenience only */ }
    }
    setOptions(next);
  };

  // A chosen file is previewed first, so long videos can be trimmed before any tracking.
  const chooseFile = (file: File, converted = false) => {
    setNotice(null);
    setReportFileError(null);
    setView({ kind: 'preview', file, url: makeUrl(file), converted });
  };

  // A converted clip goes the same way as a chosen one: straight to the trim and preview step.
  const openConvertedFile = (file: File) => {
    chooseFile(file, true);
    setNotice(`Converted to ${file.name} (${formatBytes(file.size)}) on this device. Nothing was uploaded.`);
  };

  const startAnalysis = (file: File, url: string, range: TimeRange) => {
    setNotice(null);
    setProgress(null);
    setView({ kind: 'processing', file, url, range });
  };

  useWakeLock(view.kind === 'processing');
  const processing = view.kind === 'processing';
  useEffect(() => {
    onProcessingChange?.(processing);
    return () => onProcessingChange?.(false);
  }, [onProcessingChange, processing]);

  // Options, models and profile are read once, when the run starts, so changing them never restarts a run.
  const runInputsRef = useRef({ options, models, save, refreshHistory });
  useEffect(() => { runInputsRef.current = { options, models, save, refreshHistory }; }, [options, models, save, refreshHistory]);

  // Run the engine once the processing view (and its video element) is on screen.
  const processingFile = view.kind === 'processing' ? view.file : null;
  const processingUrl = view.kind === 'processing' ? view.url : null;
  const processingRange = view.kind === 'processing' ? view.range : null;
  useEffect(() => {
    if (!processingFile || !processingUrl || !processingRange) return;
    const { options, models, save, refreshHistory } = runInputsRef.current;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const controller = new AbortController();
    abortRef.current = controller;
    userCancelledRef.current = false;
    const profileHandedness = profileRef.current?.handedness === 'left' || profileRef.current?.handedness === 'right' ? profileRef.current.handedness as 'left' | 'right' : undefined;
    (async () => {
      try {
        await loadVideo(video, processingUrl);
        if (controller.signal.aborted) return;
        if (rangeLength(processingRange) > VIDEO_CONFIG.warnDurationS) {
          setNotice(`Long clip: analysis may take a few minutes. ${isWakeLockSupported() ? 'The screen stays on meanwhile; keep this tab open and in front.' : 'Keep this tab open and in front, and the screen on.'}`);
        }
        const report = await runVideoAnalysis({
          file: processingFile, video, canvas,
          quality: options.quality, model: models.includes(options.model) ? options.model : 'lite',
          requestedHandedness: options.handedness, profileHandedness, bowType: options.bowType,
          analyzeAudio: options.analyzeAudio, range: processingRange, signal: controller.signal, onProgress: setProgress,
        });
        if (controller.signal.aborted) return;
        const keep = options.keepVideo ? processingFile : null;
        try {
          await saveVideoReport(report, keep);
        } catch {
          setNotice('The report could not be saved on this device (storage may be full), but you can still review and export it.');
        }
        recordPracticeEntry(entryFromVideoReport(report));
        if (options.updateProfile) {
          try {
            await save(applyReportToProfile(profileRef.current as Record<string, unknown> | null, report));
          } catch { /* Profile update is best-effort. */ }
        }
        refreshHistory();
        setView({ kind: 'report', report, videoUrl: processingUrl, videoBlob: processingFile, source: 'fresh' });
      } catch (error) {
        if (error instanceof AnalysisCancelledError || controller.signal.aborted) {
          if (userCancelledRef.current && abortRef.current === controller) setView({ kind: 'upload' });
          return;
        }
        console.error('Video analysis failed', error);
        setView({ kind: 'error', file: processingFile, message: error instanceof Error ? error.message : 'The analysis failed.' });
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    })();
    return () => controller.abort();
  }, [processingFile, processingRange, processingUrl]);

  const openSaved = async (summary: VideoReportSummary) => {
    setNotice(null);
    const report = await loadVideoReport(summary.id);
    if (!report) { setNotice('That report is no longer on this device.'); refreshHistory(); return; }
    const blob = summary.hasVideo ? await loadVideoBlob(summary.id) : null;
    setView({ kind: 'report', report, videoUrl: blob ? makeUrl(blob) : null, videoBlob: blob, source: 'saved' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openCloud = async (summary: VideoReportSummary) => {
    if (!account.client) return;
    setNotice(null);
    try {
      const session = await account.freshSession();
      if (!session) return;
      const loaded = await loadCloudReport(account.client, session, summary.id);
      if (!loaded) { setNotice('That report is no longer in your account.'); return; }
      setView({ kind: 'report', report: loaded.report, videoUrl: loaded.videoUrl, videoBlob: null, source: 'cloud' });
    } catch (error) {
      setNotice(describeCloudError(error));
    }
  };

  /** Opens a report from the cloud by id: one shared with this coach, or the athlete's own. */
  const openReview = useCallback(async (reportId: string) => {
    if (!cloudApi) return;
    setNotice(null);
    try {
      const session = await freshSession();
      if (!session) { setNotice('Sign in on your Profile page to open a report shared with you, then come back here.'); return; }
      const loaded = await loadReviewReport(cloudApi, session, reportId);
      if (!loaded) { setNotice('That report could not be opened. The athlete may have stopped sharing it or deleted it, or it was shared with a different email than the one you signed in with.'); return; }
      setView({ kind: 'report', report: loaded.report, videoUrl: loaded.videoUrl, videoBlob: null, source: loaded.share || loaded.club !== undefined ? 'shared' : 'cloud', share: loaded.share ?? undefined, club: loaded.club ?? undefined });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      setNotice(describeCloudError(error));
    }
  }, [cloudApi, freshSession]);

  useEffect(() => {
    const reportId = pendingReportRef.current;
    if (!reportId || !account.ready) return;
    pendingReportRef.current = undefined;
    if (!sessionUserId) { setNotice('This link opens a report shared with you. Sign in on your Profile page with the email it was shared with, then come back to Video Analysis: it will be under “Shared with me”.'); return; }
    void openReview(reportId);
  }, [account.ready, openReview, sessionUserId]);

  // Keep the address bar on the cloud report that is open, so it can be reloaded or bookmarked.
  const openCloudId = view.kind === 'report' && (view.source === 'shared' || view.source === 'cloud') ? view.report.id : undefined;
  useEffect(() => {
    if (pendingReportRef.current) return;
    const path = routeForPage('video-analysis', { reportId: openCloudId });
    if (`${window.location.pathname}${window.location.search}` !== path) window.history.replaceState(window.history.state, '', path);
  }, [openCloudId]);

  // Comments need the report in the cloud: shared with this coach, or backed up by the athlete.
  const commentsReportId = view.kind === 'report' && account.session && (view.source === 'shared' || view.source === 'cloud' || cloudHistory.some((item) => item.id === view.report.id))
    ? view.report.id : null;
  const viaClub = view.kind === 'report' && view.source === 'shared' && !view.share && Boolean(view.club);
  const comments = useReportComments(cloudApi, freshSession, commentsReportId, viaClub);

  const rescore = async (current: ReportViewState, changes: RescoreSettings) => {
    setNotice(null);
    setRescoring(true);
    // Let the button show its busy state before the synchronous engine run.
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    try {
      // Notes and a coach's labels are not engine output, so they are carried over to the new scoring.
      const report = carryOverAnnotations(current.report, buildReport(inputFromReport(current.report, changes)));
      if (current.source !== 'file') {
        try {
          await updateVideoReport(report);
          // Same id, so the clip's log entry is replaced with the new form score and focus areas.
          recordPracticeEntry(entryFromVideoReport(report));
        } catch {
          setNotice('The re-scored report could not be saved on this device (storage may be full), but you can still review and export it.');
        }
        // Only refresh the profile when this clip is its latest form status, so an old clip never replaces a newer one.
        const formStatus = profileRef.current?.formStatus;
        if (options.updateProfile && (!isFormStatus(formStatus) || formStatus.lastReportId === report.id)) {
          try {
            await save(applyReportToProfile(profileRef.current as Record<string, unknown> | null, report));
          } catch { /* Profile update is best-effort. */ }
        }
        refreshHistory();
      }
      // Leave the page alone if another report was opened meanwhile.
      setView((shown) => (shown.kind === 'report' && shown.report.id === report.id ? { ...shown, report } : shown));
    } catch (error) {
      console.error('Re-scoring failed', error);
      setNotice('This report could not be re-scored.');
    } finally {
      setRescoring(false);
    }
  };

  // A full export (Privacy page) holds every report; they are scored again and saved here.
  const importBundle = async ({ inputs, skipped }: ReportBundle) => {
    const count = `${inputs.length} report${inputs.length === 1 ? '' : 's'}`;
    if (!window.confirm(`Import ${count} to this device?\n\nEach one is scored again with the current engine and saved here. A report that is already on this device is replaced by the imported copy.`)) return;
    let saved = 0;
    for (const input of inputs) {
      try {
        await updateVideoReport(buildReport(input));
        saved += 1;
      } catch (error) {
        console.error('Importing a report failed', error);
      }
    }
    refreshHistory();
    const missed = inputs.length - saved + skipped;
    setReportFileError(null);
    setNotice(`Imported ${saved} of ${inputs.length + skipped} reports. Open them from “Your video analyses” below.${missed ? ` ${missed} could not be imported (no pose landmarks, malformed, or storage full).` : ''}`);
  };

  const openReportFile = async (file: File) => {
    setNotice(null);
    setReportFileError(null);
    try {
      const contents = readReportFile(await file.text());
      if ('bundle' in contents) { await importBundle(contents.bundle); return; }
      const report = buildReport(contents.report);
      setView({ kind: 'report', report, videoUrl: null, videoBlob: null, source: 'file' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      if (!(error instanceof ReportFileError)) console.error('Opening a report file failed', error);
      setReportFileError(error instanceof ReportFileError ? error.message : 'That file could not be opened as a report.');
    }
  };

  // A note is kept with the report; a report that is not saved on this device yet keeps it until it is.
  const saveShotNotes = async (current: ReportViewState, shotIndex: number, notes: string) => {
    const report = { ...current.report, shots: current.report.shots.map((shot) => shot.index === shotIndex ? { ...shot, notes: notes || undefined } : shot) };
    setView({ ...current, report });
    if (current.source === 'file') return;
    try {
      await updateVideoReport(report);
      refreshHistory();
    } catch (error) {
      setNotice(`The note could not be saved on this device: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const saveLabels = async (current: ReportViewState, labels: ReportLabels) => {
    const report = { ...current.report, labels };
    setView({ ...current, report });
    if (current.source === 'file' || current.source === 'cloud' || current.source === 'shared') return;
    try {
      await updateVideoReport(report);
    } catch (error) {
      setNotice(`The labels could not be saved on this device: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const exportFixture = (report: VideoAnalysisReport, labels: ReportLabels) => {
    const blob = new Blob([fixtureFromReport(report, labels)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${report.source.fileName.replace(/\.[^.]+$/, '') || 'clip'}-fixture.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const saveFileReport = async (current: ReportViewState) => {
    setNotice(null);
    try {
      const summary = await updateVideoReport(current.report);
      // The same clip may already be on this device with its video kept.
      const blob = summary.hasVideo ? await loadVideoBlob(summary.id) : null;
      refreshHistory();
      setView({ ...current, source: 'saved', videoBlob: blob, videoUrl: blob ? makeUrl(blob) : null });
      setNotice('Saved to this device.');
    } catch {
      setNotice('The report could not be saved on this device (storage may be full).');
    }
  };

  const exportJson = (report: VideoAnalysisReport) => {
    const blob = new Blob([reportToJson(report)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${report.source.fileName.replace(/\.[^.]+$/, '') || 'archerlab'}-analysis.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const removeReport = async (report: VideoAnalysisReport) => {
    if (!window.confirm('Delete this analysis from this device?')) return;
    await deleteVideoReport(report.id).catch(() => undefined);
    refreshHistory();
    setView({ kind: 'upload' });
  };

  const backup = async (report: VideoAnalysisReport, blob: Blob | null) => {
    if (!account.client) return;
    setBackingUp(true);
    try {
      const session = await account.freshSession();
      if (!session) { setNotice('Sign in on your Profile page to back up reports.'); return; }
      const result = await backupReport(account.client, session, report, blob);
      refreshCloudHistory();
      setNotice(result.videoSkippedReason ?? (result.videoUploaded ? 'Report and video backed up to your account.' : 'Report backed up to your account.'));
    } catch (error) {
      setNotice(describeCloudError(error));
    } finally {
      setBackingUp(false);
    }
  };

  const openInAnalytics = (report: VideoAnalysisReport) => {
    if (!onOpenInAnalytics) return;
    const shots = toShotAnalyses(report);
    if (!shots.length) { setNotice('None of the shots in this clip had enough tracked movement around release to open in Analytics.'); return; }
    onOpenInAnalytics(shots);
  };

  const subtitle = 'Upload a recorded clip from any angle. Every frame is tracked on this device, with audio, to rate your form and coach your next session.';

  return (
    <div className="page-container va-page">
      <PageHeader
        title="Video Analysis"
        subtitle={subtitle}
        actions={view.kind === 'report' ? <ActionButton variant="secondary" type="button" onClick={() => setView({ kind: 'upload' })}><AppIcon name="upload" size={16} /> Analyse another</ActionButton> : undefined}
      />
      {notice ? <p className="va-callout" role="status">{notice}</p> : null}

      {view.kind === 'upload' ? (
        <>
          <UploadPanel options={options} availableModels={models} offline={!online} onOptionsChange={changeOptions} onFile={chooseFile} />
          <div className="va-open-report">
            <input ref={reportFileRef} type="file" accept="application/json,.json" aria-label="Report file" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void openReportFile(file); }} />
            <ActionButton variant="ghost" type="button" onClick={() => reportFileRef.current?.click()}><AppIcon name="upload" size={16} /> Open report file (.json)</ActionButton>
            {reportFileError ? <p className="va-callout" role="alert">{reportFileError}</p> : null}
          </div>
          <section aria-labelledby="va-tips-title">
            <h2 id="va-tips-title" className="va-section-title">For the best results</h2>
            <ul className="va-tips">{TIPS.map((tip) => <li key={tip.title}><strong>{tip.title}</strong><span>{tip.body}</span></li>)}</ul>
          </section>
          {history.length || cloudHistory.length ? (
            <section className="va-panel" aria-labelledby="va-history-title">
              <h2 id="va-history-title">Your video analyses <small>{history.length} on this device{cloudHistory.length ? ` · ${cloudHistory.length} in your account` : ''}</small></h2>
              <div className="va-history">
                {history.map((item) => (
                  <button key={item.id} type="button" className="va-history-row" onClick={() => void openSaved(item)}>
                    <span className="va-history-score">{item.overall === null ? '–' : Math.round(item.overall)}</span>
                    <span><strong>{item.fileName}</strong><small>{formatDate(item.createdAt)} · {item.shots} shot{item.shots === 1 ? '' : 's'} · {VIEW_LABEL[item.view]}{item.hasVideo ? ' · video kept' : ''}</small></span>
                    <LevelBadge level={item.level} />
                    <AppIcon name="arrow-right" size={16} />
                  </button>
                ))}
                {cloudHistory.filter((item) => !history.some((local) => local.id === item.id)).map((item) => (
                  <button key={`cloud-${item.id}`} type="button" className="va-history-row" onClick={() => void openCloud(item)}>
                    <span className="va-history-score">{item.overall === null ? '–' : Math.round(item.overall)}</span>
                    <span><strong>{item.fileName}</strong><small>{formatDate(item.createdAt)} · in your account{item.hasVideo ? ' · with video' : ''}</small></span>
                    <LevelBadge level={item.level} />
                    <AppIcon name="cloud" size={16} />
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          {sharedWithMe.length ? (
            <section className="va-panel" aria-labelledby="va-shared-title">
              <h2 id="va-shared-title">Shared with me <small>{sharedWithMe.length} report{sharedWithMe.length === 1 ? '' : 's'} from athletes · read-only</small></h2>
              <div className="va-history">
                {sharedWithMe.map((item) => (
                  <button key={item.id} type="button" className="va-history-row" onClick={() => void openReview(item.report_id)}>
                    <span className="va-history-score">{item.summary && item.summary.overall !== null ? Math.round(item.summary.overall) : '–'}</span>
                    <span><strong>{item.summary?.fileName ?? 'Video report'}</strong><small>from {item.owner_email ?? 'an athlete'} · shared {formatDate(Date.parse(item.created_at))}{item.summary ? ` · ${item.summary.shots} shot${item.summary.shots === 1 ? '' : 's'}` : ''}{item.include_video ? ' · with video' : ''}</small></span>
                    <LevelBadge level={item.summary?.level ?? null} />
                    <AppIcon name="arrow-right" size={16} />
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      {view.kind === 'preview' ? (
        <TrimPreview key={view.url} file={view.file} url={view.url} onAnalyse={(range) => startAnalysis(view.file, view.url, range)} onCancel={() => { setNotice(null); setView({ kind: 'upload' }); }} onConverted={view.converted ? undefined : openConvertedFile} online={online} />
      ) : null}

      {view.kind === 'processing' ? (
        <ProcessingView
          fileName={`${view.file.name} · ${formatBytes(view.file.size)} · ${formatClock(view.range.start, 1)}–${formatClock(view.range.end, 1)}`}
          screenKeptAwake={isWakeLockSupported()}
          videoRef={videoRef}
          canvasRef={canvasRef}
          progress={progress}
          handedness={options.handedness === 'left' ? 'left' : 'right'}
          onCancel={() => { userCancelledRef.current = true; abortRef.current?.abort(); }}
        />
      ) : null}

      {view.kind === 'error' ? (
        <section className="empty-state" role="alert">
          <div className="empty-state__icon"><AppIcon name="film" size={26} /></div>
          <h2>That clip could not be analysed</h2>
          <p>{view.message}</p>
          <div className="analytics-empty-state__actions">
            {view.file ? <ActionButton variant="primary" type="button" onClick={() => chooseFile(view.file as File)}>Try again</ActionButton> : null}
            <ActionButton variant="secondary" type="button" onClick={() => setView({ kind: 'upload' })}>Choose another video</ActionButton>
          </div>
        </section>
      ) : null}

      {view.kind === 'report' ? (
        <ReportView
          report={view.report}
          videoUrl={view.videoUrl}
          notice={view.source === 'shared' ? (
            <p className="va-callout va-callout--info">
              <strong>{view.club && !view.share ? `Shared with your club by ${memberLabel(view.club)}.` : `Shared with you by ${view.share?.owner_email ?? 'an athlete'}.`}</strong> You can read this report and comment on it; only the athlete can change, share or delete it. {view.videoUrl ? '' : 'The video was not shared, so the replay shows the timeline without footage. '}Frame-by-frame landmarks stay on the athlete’s device.
            </p>
          ) : view.source === 'cloud' ? <p className="va-callout va-callout--info">Opened from your account. Frame-by-frame landmarks stay on the device that analysed the clip, so this copy shows the results without the skeleton replay.</p>
            : view.source === 'file' ? <p className="va-callout va-callout--info">Opened from a report file and scored again with the current engine. It is not saved on this device yet.</p> : undefined}
          onSaveLabels={(labels) => void saveLabels(view, labels)}
          onExportFixture={(labels) => exportFixture(view.report, labels)}
          onShotNotes={view.source === 'cloud' ? undefined : (shotIndex, notes) => void saveShotNotes(view, shotIndex, notes)}
          comments={commentsReportId && account.session ? {
            comments: comments.comments,
            currentUserId: account.session.user.id,
            viewerIsOwner: view.source !== 'shared',
            ownerEmail: view.source === 'shared' ? view.share?.owner_email ?? null : account.session.user.email?.toLowerCase() ?? null,
            owner: view.club && !view.share ? { id: view.club.athlete_id, label: view.club.display_name } : undefined,
            busy: comments.busy,
            status: comments.status,
            onAdd: comments.add,
            onDelete: (id) => void comments.remove(id),
            onRefresh: comments.refresh,
          } : undefined}
          settingsControl={view.report.samples.length ? <RescorePanel key={view.report.id} report={view.report} busy={rescoring} onRescore={(changes) => void rescore(view, changes)} /> : undefined}
          cloudCoach={view.source === 'shared' ? undefined : <CloudCoachPanel report={view.report} videoUrl={view.videoUrl} videoBlob={view.videoBlob} />}
          sharing={account.client && account.session && view.source !== 'file' && view.source !== 'shared' ? (
            <ShareWithCoachPanel key={view.report.id} report={view.report} videoBlob={view.videoBlob} client={account.client} freshSession={account.freshSession} onBackedUp={refreshCloudHistory} />
          ) : undefined}
          actions={(
            <>
              {onOpenInAnalytics && view.report.samples.some((sample) => sample.image) && view.report.shots.some((shot) => shot.source !== 'audio-only') ? (
                <ActionButton variant="secondary" type="button" onClick={() => openInAnalytics(view.report)}><AppIcon name="grid" size={16} /> Open in Analytics</ActionButton>
              ) : null}
              {view.source !== 'shared' ? <ActionButton variant="secondary" type="button" onClick={() => exportJson(view.report)}><AppIcon name="download" size={16} /> Export report (JSON)</ActionButton> : null}
              {view.source === 'file' ? <ActionButton variant="primary" type="button" onClick={() => void saveFileReport(view)}><AppIcon name="check" size={16} /> Save to this device</ActionButton> : null}
              {account.configured && view.source !== 'cloud' && view.source !== 'file' && view.source !== 'shared' ? (
                <>
                  <ActionButton variant="secondary" type="button" disabled={backingUp || !account.session} title={account.session ? undefined : 'Sign in on your Profile page first'} onClick={() => void backup(view.report, null)}>
                    <AppIcon name="cloud" size={16} /> {backingUp ? 'Backing up…' : account.session ? 'Back up report' : 'Sign in to back up'}
                  </ActionButton>
                  {account.session && view.videoBlob ? (
                    <ActionButton variant="secondary" type="button" disabled={backingUp} onClick={() => void backup(view.report, view.videoBlob)}>
                      <AppIcon name="upload" size={16} /> Back up report + video ({formatBytes(view.videoBlob.size)})
                    </ActionButton>
                  ) : null}
                </>
              ) : null}
              {view.source !== 'cloud' && view.source !== 'file' && view.source !== 'shared' ? <ActionButton variant="danger" type="button" onClick={() => void removeReport(view.report)}><AppIcon name="trash" size={16} /> Delete</ActionButton> : null}
              <ActionButton variant="primary" type="button" onClick={() => setView({ kind: 'upload' })}><AppIcon name="upload" size={16} /> Analyse another video</ActionButton>
            </>
          )}
        />
      ) : null}
    </div>
  );
}

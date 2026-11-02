import { useEffect, useRef, useState } from 'react';
import { converterIsCached, openConverter, type Converter } from '../../video-analysis/browser/convertVideo';
import {
  CONVERT_CONFIG, ConvertCancelledError, describeConvertFailure, estimateConvertSeconds, formatDurationRough, remainingSeconds,
  type ConvertError, type MediaInfo,
} from '../../video-analysis/convert';
import { formatBytes, formatClock } from '../../video-analysis/format';
import { ActionButton } from '../ActionButton';
import { AppIcon } from '../AppIcon';

type Phase =
  | { kind: 'offer' }
  | { kind: 'downloading'; loadedBytes: number; totalBytes: number }
  | { kind: 'reading' }
  | { kind: 'confirm'; info: MediaInfo; estimateS: number | null }
  | { kind: 'converting'; info: MediaInfo; estimateS: number | null; fraction: number | null; elapsedS: number }
  | { kind: 'failed'; error: ConvertError };

type ConvertPanelProps = {
  file: File;
  /** False while the device is offline: the converter then only runs if an earlier conversion left it on the device. */
  online?: boolean;
  /** Called with the converted MP4, which replaces the original for the rest of the flow. */
  onConverted: (file: File) => void;
};

const sourceSummary = (info: MediaInfo) => [
  info.videoCodec ? info.videoCodec.toUpperCase() : null,
  info.width && info.height ? `${info.width}×${info.height}` : null,
  info.durationS !== null ? formatClock(info.durationS, 0) : null,
].filter(Boolean).join(' · ');

/**
 * Offered when the browser cannot play a file (typically an iPhone HEVC .mov in Chrome). Converts it to a
 * 720 px H.264 MP4 with ffmpeg compiled to WebAssembly, on this device: the clip is never uploaded, and the
 * converter itself is only downloaded once the athlete asks for it.
 */
export function ConvertPanel({ file, online = true, onConverted }: ConvertPanelProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'offer' });
  // Whether the converter is already on this device. Only asked while offline; unknown (null) never blocks the button.
  const [storedOffline, setStoredOffline] = useState<boolean | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const confirmRef = useRef<{ converter: Converter; info: MediaInfo; estimateS: number | null } | null>(null);
  const onConvertedRef = useRef(onConverted);
  useEffect(() => { onConvertedRef.current = onConverted; }, [onConverted]);

  // Leaving the page, or choosing another video, stops the conversion and frees the converter.
  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (online) { setStoredOffline(null); return; }
    let cancelled = false;
    void converterIsCached().then((stored) => { if (!cancelled) setStoredOffline(stored); });
    return () => { cancelled = true; };
  }, [online]);
  const unavailableOffline = !online && storedOffline === false;

  const runConversion = async (converter: Converter, info: MediaInfo, estimateS: number | null, signal: AbortSignal) => {
    const startedAt = performance.now();
    const elapsed = () => (performance.now() - startedAt) / 1000;
    let fraction: number | null = info.durationS === null ? null : 0;
    const tick = () => setPhase({ kind: 'converting', info, estimateS, fraction, elapsedS: elapsed() });
    tick();
    // The clock keeps moving between ffmpeg's progress reports, so the time left stays honest.
    const timer = window.setInterval(tick, 1000);
    try {
      const converted = await converter.convert((progress) => { fraction = progress.fraction; tick(); });
      if (signal.aborted) return;
      onConvertedRef.current(converted);
    } finally {
      window.clearInterval(timer);
    }
  };

  const fail = (error: unknown, controller: AbortController) => {
    if (error instanceof ConvertCancelledError || controller.signal.aborted) { setPhase({ kind: 'offer' }); return; }
    console.error('Video conversion failed', error);
    setPhase({ kind: 'failed', error: describeConvertFailure(error) });
  };

  const start = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ kind: 'downloading', loadedBytes: 0, totalBytes: CONVERT_CONFIG.approxDownloadBytes });
    let converter: Converter | null = null;
    try {
      converter = await openConverter(file, {
        signal: controller.signal,
        onDownload: ({ loadedBytes, totalBytes }) => {
          setPhase(loadedBytes >= totalBytes ? { kind: 'reading' } : { kind: 'downloading', loadedBytes, totalBytes });
        },
      });
      const estimateS = estimateConvertSeconds(converter.info);
      if (converter.info.durationS !== null && converter.info.durationS > CONVERT_CONFIG.warnDurationS) {
        // Long clips wait for a yes: they take many minutes and a lot of memory.
        confirmRef.current = { converter, info: converter.info, estimateS };
        setPhase({ kind: 'confirm', info: converter.info, estimateS });
        return;
      }
      await runConversion(converter, converter.info, estimateS, controller.signal);
    } catch (error) {
      fail(error, controller);
    } finally {
      // A long clip keeps its converter while the athlete decides.
      if (converter && confirmRef.current?.converter !== converter) converter.close();
    }
  };

  const confirmLong = async () => {
    const pending = confirmRef.current;
    const controller = abortRef.current;
    if (!pending || !controller) return;
    confirmRef.current = null;
    try {
      await runConversion(pending.converter, pending.info, pending.estimateS, controller.signal);
    } catch (error) {
      fail(error, controller);
    } finally {
      pending.converter.close();
    }
  };

  const cancel = () => {
    confirmRef.current?.converter.close();
    confirmRef.current = null;
    abortRef.current?.abort();
    setPhase({ kind: 'offer' });
  };

  if (phase.kind === 'offer' || phase.kind === 'failed') {
    return (
      <div className="va-convert" role="group" aria-label="Convert the video">
        {phase.kind === 'failed' ? (
          <div className="va-callout" role="alert">
            <strong>Conversion failed.</strong> {phase.error.message}
            {phase.error.log.length ? (
              <details className="va-convert__log">
                <summary>What ffmpeg reported</summary>
                <pre>{phase.error.log.join('\n')}</pre>
              </details>
            ) : null}
          </div>
        ) : null}
        <p className="va-muted">
          Convert it to an H.264 MP4 (long edge {CONVERT_CONFIG.longEdgePx} px, sound kept) with ffmpeg running in this browser. The video is not uploaded.
          The first time, this downloads the converter, about {formatBytes(CONVERT_CONFIG.approxDownloadBytes)}.
        </p>
        {unavailableOffline ? (
          <p className="va-callout" role="status">
            You are offline, and the converter has not been downloaded to this device yet. Connect to the internet once to convert this video; the converter is kept on this device afterwards, so later conversions also work offline.
          </p>
        ) : null}
        <div className="va-actions">
          <ActionButton variant="primary" type="button" disabled={unavailableOffline} onClick={() => void start()}>
            <AppIcon name="film" size={16} /> {phase.kind === 'failed' ? 'Try again' : 'Convert to MP4 on this device'}
          </ActionButton>
        </div>
        <p className="va-faint">
          The converter is ffmpeg, licensed GPL-2.0-or-later; this app is MIT. <a href={`${import.meta.env.BASE_URL}ffmpeg/NOTICE.txt`} target="_blank" rel="noreferrer">Licence and source</a>.
        </p>
      </div>
    );
  }

  const percent = phase.kind === 'downloading' ? Math.round((phase.loadedBytes / phase.totalBytes) * 100)
    : phase.kind === 'converting' && phase.fraction !== null ? Math.round(phase.fraction * 100)
      : null;
  const left = phase.kind === 'converting' ? (phase.fraction === null ? null : remainingSeconds(phase.elapsedS, phase.fraction, phase.estimateS)) : null;

  return (
    <div className="va-convert" role="group" aria-label="Converting the video">
      {phase.kind === 'confirm' ? (
        <>
          <p className="va-callout" role="alert">
            <strong>This clip is {formatClock(phase.info.durationS ?? 0, 0)} long.</strong>{' '}
            Clips over {CONVERT_CONFIG.warnDurationS / 60} minutes can take a long time to convert{phase.estimateS !== null ? ` (roughly ${formatDurationRough(phase.estimateS)} here)` : ''} and need a lot of memory.
            Keep this tab open and in front while it runs. You can also cancel, and trim or export a shorter clip from your phone.
          </p>
          <p className="va-faint">{sourceSummary(phase.info)}</p>
          <div className="va-actions">
            <ActionButton variant="primary" type="button" onClick={() => void confirmLong()}>Convert anyway</ActionButton>
            <ActionButton variant="ghost" type="button" onClick={cancel}>Cancel</ActionButton>
          </div>
        </>
      ) : (
        <>
          <p className="va-convert__title">
            {/* Only the step is announced; the percentage and countdown change every second and stay silent. */}
            <span role="status">{phase.kind === 'downloading' ? 'Downloading the converter…' : phase.kind === 'reading' ? 'Reading the video…' : 'Converting to MP4…'}</span>
            {percent !== null ? <strong> {percent}%</strong> : null}
          </p>
          <div
            className="va-progress__bar"
            role="progressbar"
            aria-label={phase.kind === 'downloading' ? 'Converter download' : 'Conversion progress'}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent ?? undefined}
          >
            <div style={{ width: `${percent ?? 100}%`, opacity: percent === null ? 0.35 : 1 }} />
          </div>
          {phase.kind === 'downloading' ? (
            <p className="va-faint">{formatBytes(phase.loadedBytes)} of {formatBytes(phase.totalBytes)}. Only the first conversion downloads it.</p>
          ) : null}
          {phase.kind === 'converting' ? (
            <>
              <p className="va-muted">
                {phase.fraction === null
                  ? 'The length of this video is unknown, so the time left cannot be estimated.'
                  : left === null ? 'Working out the time left…' : left <= 1 ? 'Almost done…' : `About ${formatDurationRough(left)} left.`}
                {phase.estimateS !== null && phase.fraction !== null && phase.fraction < 0.03 ? ` Estimated total: ${formatDurationRough(phase.estimateS)}.` : ''}
              </p>
              <p className="va-faint">{sourceSummary(phase.info)} → H.264 MP4, {CONVERT_CONFIG.longEdgePx} px. Keep this tab open and in front.</p>
            </>
          ) : null}
          <div className="va-actions">
            <ActionButton variant="secondary" type="button" onClick={cancel}><AppIcon name="close" size={16} /> Cancel</ActionButton>
          </div>
        </>
      )}
    </div>
  );
}

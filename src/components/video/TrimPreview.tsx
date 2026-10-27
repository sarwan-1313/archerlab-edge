import { useRef, useState } from 'react';
import { resolveDuration } from '../../video-analysis/browser/frameCapture';
import { UNPLAYABLE_VIDEO_MESSAGE } from '../../video-analysis/browser/runVideoAnalysis';
import { VIDEO_CONFIG } from '../../video-analysis/config';
import { formatBytes, formatClock } from '../../video-analysis/format';
import { defaultRange, rangeLength, rangeProblem } from '../../video-analysis/range';
import type { TimeRange } from '../../video-analysis/types';
import { ActionButton } from '../ActionButton';
import { AppIcon } from '../AppIcon';
import { ConvertPanel } from './ConvertPanel';

type TrimPreviewProps = {
  file: File;
  url: string;
  onAnalyse: (range: TimeRange) => void;
  onCancel: () => void;
  /** When given, a video that cannot be played offers a conversion to MP4, and the result replaces `file`. */
  onConverted?: (file: File) => void;
};

const STEP_S = 0.1;
const round = (t: number) => Math.round(t / STEP_S) * STEP_S;

/** Shows the chosen clip and lets the athlete pick the part to analyse before any tracking starts. */
export function TrimPreview({ file, url, onAnalyse, onCancel, onConverted }: TrimPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [range, setRange] = useState<TimeRange | null>(null);
  const [current, setCurrent] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const onLoadedMetadata = async () => {
    const video = videoRef.current;
    // Some browsers open an HEVC .mov, and even play its sound, but cannot decode the picture.
    if (video && video.videoWidth === 0) { setError(UNPLAYABLE_VIDEO_MESSAGE); return; }
    // Recorder files can report an infinite length until it is worked out.
    const length = video ? await resolveDuration(video) : NaN;
    if (!Number.isFinite(length) || length <= 0) { setError('The video length could not be read. Try exporting the clip again as an MP4.'); return; }
    setDuration(length);
    setRange(defaultRange(length));
  };

  const seek = (t: number) => {
    const video = videoRef.current;
    if (video) video.currentTime = t;
    setCurrent(t);
  };
  // Keeps at least the minimum length between the handles.
  const setStart = (t: number) => {
    if (!range) return;
    const start = Math.max(0, Math.min(round(t), range.end - VIDEO_CONFIG.minRangeS));
    setRange({ ...range, start });
    return start;
  };
  const setEnd = (t: number) => {
    if (!range || duration === null) return;
    const end = Math.min(duration, Math.max(round(t), range.start + VIDEO_CONFIG.minRangeS));
    setRange({ ...range, end });
    return end;
  };

  const problem = range && duration !== null ? rangeProblem(range, duration) : null;
  const tooLong = duration !== null && duration > VIDEO_CONFIG.maxDurationS;
  const percent = (t: number) => (duration ? (t / duration) * 100 : 0);

  return (
    <section className="va-processing va-trim" aria-label="Preview and trim the video">
      <div className="va-stage">
        <video ref={videoRef} src={url} controls playsInline preload="metadata" aria-label="Video preview"
          onLoadedMetadata={() => void onLoadedMetadata()}
          onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
          onError={() => setError(UNPLAYABLE_VIDEO_MESSAGE)} />
      </div>
      <div className="va-panel va-trim__controls">
        <span className="va-eyebrow">Step 1 of 2 · {file.name} · {formatBytes(file.size)}</span>
        <h2>Choose what to analyse</h2>
        {error ? <p className="va-callout" role="alert">{error}</p> : null}
        {error && onConverted ? <ConvertPanel file={file} onConverted={onConverted} /> : null}
        {duration === null || !range ? (
          error ? null : <p className="va-muted">Loading the preview…</p>
        ) : (
          <>
            <p className="va-muted">
              {tooLong
                ? `This video is ${formatClock(duration, 0)} long. Up to ${Math.round(VIDEO_CONFIG.maxDurationS / 60)} minutes can be analysed at once, so choose the part with the shots you want reviewed.`
                : 'The whole clip is selected. Trim it to skip setup and walking about: only the selected part is tracked.'}
            </p>
            <div className="va-trim__bar" aria-hidden="true">
              <div className="va-trim__selected" style={{ left: `${percent(range.start)}%`, width: `${percent(range.end) - percent(range.start)}%` }} />
              <div className="va-trim__head" style={{ left: `${percent(current)}%` }} />
            </div>
            <label className="va-field">
              <span>Start · {formatClock(range.start, 1)}</span>
              <input type="range" min={0} max={duration} step={STEP_S} value={range.start} aria-label="Start of the analysed part"
                onChange={(event) => { const start = setStart(Number(event.target.value)); if (start !== undefined) seek(start); }} />
            </label>
            <label className="va-field">
              <span>End · {formatClock(range.end, 1)}</span>
              <input type="range" min={0} max={duration} step={STEP_S} value={range.end} aria-label="End of the analysed part"
                onChange={(event) => { const end = setEnd(Number(event.target.value)); if (end !== undefined) seek(end); }} />
            </label>
            <div className="va-trim__set">
              <ActionButton variant="secondary" type="button" onClick={() => setStart(current)}>Set start here</ActionButton>
              <ActionButton variant="secondary" type="button" onClick={() => setEnd(current)}>Set end here</ActionButton>
              <span className="va-faint">at {formatClock(current, 1)}</span>
            </div>
            <p className="va-trim__length">Selected: <strong>{formatClock(rangeLength(range), 1)}</strong> <small>({formatClock(range.start, 1)}–{formatClock(range.end, 1)})</small></p>
            {problem ? <p className="va-callout" role="alert">{problem}</p> : null}
          </>
        )}
        <div className="va-actions">
          <ActionButton variant="primary" type="button" disabled={!range || Boolean(problem) || Boolean(error)} onClick={() => { if (range) onAnalyse(range); }}>
            <AppIcon name="scan" size={16} /> Analyse
          </ActionButton>
          <ActionButton variant="ghost" type="button" onClick={onCancel}>Choose another video</ActionButton>
        </div>
      </div>
    </section>
  );
}

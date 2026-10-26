import { useRef, useState, type DragEvent, type FormEvent, type ReactNode } from 'react';
import { dropboxEnabled, googleDriveEnabled } from '../../cloud/config';
import { importFromLink, pickFromDropbox, pickFromGoogleDrive } from '../../cloud/pickers';
import { MODEL_LABELS } from '../../video-analysis/browser/poseModel';
import { BOW_LABEL, formatBytes } from '../../video-analysis/format';
import type { AnalysisQuality, BowType, PoseModelVariant } from '../../video-analysis/types';
import type { ArcherHandedness } from '../../types/biomechanics';
import { ActionButton } from '../ActionButton';
import { AppIcon } from '../AppIcon';

export interface UploadOptions {
  quality: AnalysisQuality;
  model: PoseModelVariant;
  handedness: 'auto' | ArcherHandedness;
  bowType: BowType;
  analyzeAudio: boolean;
  keepVideo: boolean;
  updateProfile: boolean;
}

type UploadPanelProps = {
  options: UploadOptions;
  availableModels: PoseModelVariant[];
  onOptionsChange: (options: UploadOptions) => void;
  onFile: (file: File) => void;
};

export function Chips<T extends string>({ name, value, options, onChange }: { name: string; value: T; options: Array<{ value: T; label: string; disabled?: boolean }>; onChange: (value: T) => void }) {
  return (
    <div className="va-chips" role="radiogroup" aria-label={name}>
      {options.map((option) => (
        <label key={option.value} className={`va-chip${option.value === value ? ' is-selected' : ''}${option.disabled ? ' is-disabled' : ''}`}>
          <input type="radio" name={name} value={option.value} checked={option.value === value} disabled={option.disabled} onChange={() => onChange(option.value)} />
          {option.label}
        </label>
      ))}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="va-field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

const QUALITY_HINT: Record<AnalysisQuality, string> = {
  fast: '12 frames per second, then a precision pass around each release. Quickest.',
  standard: '24 frames per second plus a precision pass around each release. Recommended.',
  max: 'Every frame of the video. Slowest; best for slow-motion clips.',
};

export function UploadPanel({ options, availableModels, onOptionsChange, onFile }: UploadPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState('');
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const set = <K extends keyof UploadOptions>(key: K, value: UploadOptions[K]) => onOptionsChange({ ...options, [key]: value });

  const acceptFile = (file: File | undefined | null) => {
    if (!file) return;
    if (file.type && !file.type.startsWith('video/') && !/\.(mp4|m4v|mov|webm|mkv|avi)$/i.test(file.name)) {
      setImportStatus('That file is not a video. Choose an MP4, MOV or WebM clip.');
      return;
    }
    setImportStatus(null);
    onFile(file);
  };

  const runImport = async (work: (progress: (loaded: number, total: number | null) => void) => Promise<File | null>) => {
    setImporting(true);
    setImportStatus('Opening…');
    try {
      const file = await work((loaded, total) => setImportStatus(`Downloading ${formatBytes(loaded)}${total ? ` of ${formatBytes(total)}` : ''}…`));
      if (file) acceptFile(file);
      else setImportStatus(null);
    } catch (error) {
      setImportStatus(error instanceof Error ? error.message : 'The import failed.');
    } finally {
      setImporting(false);
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    acceptFile(event.dataTransfer.files?.[0]);
  };

  const submitLink = (event: FormEvent) => {
    event.preventDefault();
    if (link.trim()) void runImport((progress) => importFromLink(link.trim(), progress));
  };

  return (
    <section className="va-upload" aria-label="Choose a video">
      <div
        className={`va-drop${dragging ? ' is-dragging' : ''}`}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <div className="va-drop__inner">
          <span className="va-drop__icon"><AppIcon name="upload" size={30} /></span>
          <span className="va-eyebrow">Recorded clip · any camera angle</span>
          <h2>Drop your shooting video</h2>
          <p className="va-muted">MP4, MOV or WebM up to 15 minutes. Every frame is tracked on this device, and the sound of each release sharpens the timing.</p>
          <input ref={inputRef} type="file" accept="video/*,.mov,.mp4,.m4v,.webm" aria-label="Video file" onChange={(event) => { acceptFile(event.target.files?.[0]); event.target.value = ''; }} />
          <ActionButton variant="primary" type="button" onClick={() => inputRef.current?.click()} disabled={importing}>
            <AppIcon name="film" size={18} /> Choose video
          </ActionButton>
          <div className="va-import-row">
            {dropboxEnabled ? <ActionButton variant="secondary" type="button" disabled={importing} onClick={() => void runImport(pickFromDropbox)}><AppIcon name="cloud" size={16} /> Dropbox</ActionButton> : null}
            {googleDriveEnabled ? <ActionButton variant="secondary" type="button" disabled={importing} onClick={() => void runImport(pickFromGoogleDrive)}><AppIcon name="cloud" size={16} /> Google Drive</ActionButton> : null}
            <ActionButton variant="ghost" type="button" disabled={importing} onClick={() => setLinkOpen((open) => !open)} aria-expanded={linkOpen}><AppIcon name="link" size={16} /> From a link</ActionButton>
          </div>
          {linkOpen ? (
            <form className="va-link-form" onSubmit={submitLink}>
              <input type="url" inputMode="url" placeholder="https://…/clip.mp4" value={link} onChange={(event) => setLink(event.target.value)} aria-label="Video link" />
              <ActionButton variant="secondary" type="submit" disabled={importing || !link.trim()}>Import</ActionButton>
            </form>
          ) : null}
          {importStatus ? <p className="va-import-status" role="status">{importStatus}</p> : null}
          <p className="va-faint">On a phone, “Choose video” also opens Google Drive, iCloud, Dropbox and other storage apps.</p>
        </div>
      </div>

      <div className="va-panel va-options">
        <h2>Analysis settings</h2>
        <Field label="Precision" hint={QUALITY_HINT[options.quality]}>
          <Chips name="Precision" value={options.quality} onChange={(value) => set('quality', value)} options={[
            { value: 'fast', label: 'Fast' }, { value: 'standard', label: 'Standard' }, { value: 'max', label: 'Every frame' },
          ]} />
        </Field>
        <Field label="Pose model" hint={availableModels.length > 1 ? MODEL_LABELS[options.model] : 'The built-in model. Larger, more accurate models can be added to the deployment (see docs/video-analysis.md).'}>
          <Chips name="Pose model" value={options.model} onChange={(value) => set('model', value)} options={(['lite', 'full', 'heavy'] as const).map((variant) => ({
            value: variant, label: variant === 'lite' ? 'Lite' : variant === 'full' ? 'Full' : 'Heavy', disabled: !availableModels.includes(variant),
          }))} />
        </Field>
        <Field label="Drawing hand" hint={options.handedness === 'auto' ? 'Worked out from the video: the hand that comes to your face at full draw.' : undefined}>
          <Chips name="Drawing hand" value={options.handedness} onChange={(value) => set('handedness', value)} options={[
            { value: 'auto', label: 'Auto' }, { value: 'right', label: 'Right' }, { value: 'left', label: 'Left' },
          ]} />
        </Field>
        <Field label="Bow type">
          <Chips name="Bow type" value={options.bowType} onChange={(value) => set('bowType', value)} options={(['recurve', 'compound', 'barebow', 'traditional'] as const).map((bow) => ({ value: bow, label: BOW_LABEL[bow] }))} />
        </Field>
        <label className="va-toggle"><input type="checkbox" checked={options.analyzeAudio} onChange={(event) => set('analyzeAudio', event.target.checked)} /><span>Listen to the audio<small>Times each release from its sound, and picks up clicker and arrow-impact sounds.</small></span></label>
        <label className="va-toggle"><input type="checkbox" checked={options.keepVideo} onChange={(event) => set('keepVideo', event.target.checked)} /><span>Keep the video on this device<small>Lets you replay it with the skeleton later. Off: only the measurements are saved.</small></span></label>
        <label className="va-toggle"><input type="checkbox" checked={options.updateProfile} onChange={(event) => set('updateProfile', event.target.checked)} /><span>Update my athlete profile<small>Adds the estimated level and focus areas to your profile's form status.</small></span></label>
      </div>
    </section>
  );
}

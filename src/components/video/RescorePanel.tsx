import { useState } from 'react';
import { BOW_LABEL } from '../../video-analysis/format';
import type { RescoreSettings } from '../../video-analysis/reportFile';
import type { BowType, VideoAnalysisReport } from '../../video-analysis/types';
import { ActionButton } from '../ActionButton';
import { AppIcon } from '../AppIcon';
import { Chips, Field } from './UploadPanel';

const BOW_TYPES: BowType[] = ['recurve', 'compound', 'barebow', 'traditional'];

type RescorePanelProps = {
  report: VideoAnalysisReport;
  busy: boolean;
  onRescore: (settings: RescoreSettings) => void;
};

/** Scores the stored movement again with different settings; the video is not tracked again. */
export function RescorePanel({ report, busy, onRescore }: RescorePanelProps) {
  const [bowType, setBowType] = useState<BowType>(report.settings.bowType);
  const [requestedHandedness, setRequestedHandedness] = useState<RescoreSettings['requestedHandedness']>(report.settings.requestedHandedness);
  const detected = report.settings.handednessSource === 'auto' ? ` Detected: ${report.settings.handedness} hand.` : '';
  return (
    <details className="va-panel va-details va-rescore">
      <summary>Change analysis settings</summary>
      <p>Score this clip again from the movement already tracked. The video is not processed again, so this takes a moment.</p>
      <div className="va-options">
        <Field label="Bow type">
          <Chips name="Re-score bow type" value={bowType} onChange={setBowType} options={BOW_TYPES.map((bow) => ({ value: bow, label: BOW_LABEL[bow] }))} />
        </Field>
        <Field label="Drawing hand" hint={requestedHandedness === 'auto' ? `Worked out from the video.${detected}` : undefined}>
          <Chips name="Re-score drawing hand" value={requestedHandedness} onChange={setRequestedHandedness} options={[
            { value: 'auto', label: 'Auto' }, { value: 'right', label: 'Right' }, { value: 'left', label: 'Left' },
          ]} />
        </Field>
        <div>
          <ActionButton variant="secondary" type="button" disabled={busy} onClick={() => onRescore({ bowType, requestedHandedness })}>
            <AppIcon name="scan" size={16} /> {busy ? 'Re-scoring…' : 'Re-score'}
          </ActionButton>
        </div>
      </div>
    </details>
  );
}

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReportLabels, VideoAnalysisReport } from '../../video-analysis/types';
import { LabelPanel } from './LabelPanel';

afterEach(cleanup);

const report = {
  source: { nativeFps: 25, analysisFps: 12 },
  shots: [{ index: 1, release: 4 }, { index: 2, release: 10 }],
} as unknown as VideoAnalysisReport;

function setup(currentTime = 7.5) {
  const onSave = vi.fn<(labels: ReportLabels) => void>();
  const onExportFixture = vi.fn<(labels: ReportLabels) => void>();
  const onSeek = vi.fn();
  render(<LabelPanel report={report} currentTime={() => currentTime} onSeek={onSeek} onSave={onSave} onExportFixture={onExportFixture} />);
  return { onSave, onExportFixture, onSeek };
}

describe('LabelPanel', () => {
  it('steps a release by one frame of the clip and shows it', () => {
    const { onSeek, onSave } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Shot 1: release one frame later' }));
    expect(onSeek).toHaveBeenLastCalledWith(4.04);
    fireEvent.click(screen.getByRole('button', { name: 'Save labels' }));
    expect(onSave.mock.calls[0][0].shots[0].release).toBeCloseTo(4.04, 9);
  });

  it('marks a false shot, adds a missed one at the replay time, rates areas and the level', () => {
    const { onSave } = setup(7.5);
    fireEvent.change(screen.getByLabelText('What shot 2 was'), { target: { value: 'false' } });
    expect((screen.getByLabelText('Shot 2: Stance & posture rating') as HTMLSelectElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Add a missed shot here/ }));
    // The added shot sorts between the two engine shots.
    fireEvent.change(screen.getByLabelText('Shot 2: Release rating'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Overall level'), { target: { value: 'advanced' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save labels' }));

    const saved = onSave.mock.calls[0][0];
    expect(saved.shots.map((shot) => [shot.engineIndex, shot.release, shot.status])).toEqual([[1, 4, 'shot'], [null, 7.5, 'shot'], [2, 10, 'false']]);
    expect(saved.shots[1].ratings).toEqual({ release: 4 });
    expect(saved.level).toBe('advanced');
    expect(screen.getByRole('button', { name: 'Labels saved' })).toBeTruthy();
  });

  it('exports the current labels as a fixture', () => {
    const { onExportFixture } = setup();
    fireEvent.change(screen.getByLabelText('What shot 1 was'), { target: { value: 'let-down' } });
    fireEvent.click(screen.getByRole('button', { name: /Export as fixture/ }));
    expect(onExportFixture.mock.calls[0][0].shots[0].status).toBe('let-down');
  });

  it('starts from labels saved earlier', () => {
    const labels: ReportLabels = { shots: [{ engineIndex: 1, release: 4.2, status: 'shot', ratings: { posture: 2 } }], level: 'beginner', labelledAt: 1 };
    render(<LabelPanel report={{ ...report, labels }} currentTime={() => 0} onSeek={() => undefined} onSave={() => undefined} onExportFixture={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Show the release of shot 1' }).textContent).toBe('4.200 s');
    expect((screen.getByLabelText('Overall level') as HTMLSelectElement).value).toBe('beginner');
  });
});

// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const transcribe = vi.fn<(recording: Blob) => Promise<string>>();
vi.mock('../voice-notes/browser/transcriber', () => ({
  transcribe: (recording: Blob) => transcribe(recording),
  voiceModelDeployed: async () => true,
}));

const { VoiceNotePanel } = await import('./VoiceNotePanel');

const stopTrack = vi.fn();
const recorders: Array<{ stop: () => void }> = [];
const recorder = { stop: () => recorders.at(-1)?.stop() };

class FakeRecorder {
  state: 'inactive' | 'recording' = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  stream: MediaStream;
  constructor(stream: MediaStream) {
    this.stream = stream;
    recorders.push(this);
  }
  start() { this.state = 'recording'; }
  stop() {
    if (this.state === 'inactive') return;
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['audio']) });
    this.onstop?.();
  }
}

beforeEach(() => {
  localStorage.clear();
  transcribe.mockReset();
  stopTrack.mockReset();
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: stopTrack }] })) },
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function recordNote(text: string) {
  transcribe.mockResolvedValue(text);
  fireEvent.click(screen.getByRole('button', { name: /Voice note/ }));
  await screen.findByText(/Listening/);
  await act(async () => { recorder.stop(); });
  await screen.findByLabelText(/Note \(edit if needed\)/);
}

describe('VoiceNotePanel', () => {
  it('asks before the one-time model download, showing its size, and records nothing until then', () => {
    render(<VoiceNotePanel onSave={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /Voice note/ }));
    expect(screen.getByRole('alertdialog').textContent).toMatch(/one-time download of about \d+(\.\d)? MB.*never uploaded/s);
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('suggests the score it heard, and saves it only when the athlete confirms', async () => {
    const onSave = vi.fn();
    render(<VoiceNotePanel onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: /Voice note/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Download and record' }));
    await screen.findByText(/Listening/);
    transcribe.mockResolvedValue('Nine, a little low.');
    await act(async () => { recorder.stop(); });

    expect(await screen.findByRole('button', { name: 'Save note and score 9' })).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
    expect(stopTrack).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save note and score 9' }));
    expect(onSave).toHaveBeenCalledWith('Nine, a little low.', { score: 9, isX: false, matched: 'nine' });
  });

  it('can save the note without the score, and follows the athlete\'s edits', async () => {
    localStorage.setItem('archerlab-edge:voice-notes', JSON.stringify({ downloadAccepted: true }));
    const onSave = vi.fn();
    render(<VoiceNotePanel onSave={onSave} />);
    await recordNote('ten, bow arm collapsed');
    fireEvent.change(screen.getByLabelText(/Note \(edit if needed\)/), { target: { value: 'X, bow arm collapsed' } });
    expect(screen.getByRole('button', { name: 'Save note and score X' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save note only' }));
    expect(onSave).toHaveBeenCalledWith('X, bow arm collapsed', null);
  });

  it('offers no score where a shot has none', async () => {
    localStorage.setItem('archerlab-edge:voice-notes', JSON.stringify({ downloadAccepted: true }));
    render(<VoiceNotePanel onSave={() => undefined} suggestScore={false} />);
    await recordNote('ten');
    expect(screen.queryByRole('button', { name: /and score/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Save note' })).toBeTruthy();
  });

  it('turning on "listen after each shot" asks first, then records when the next shot arrives', async () => {
    const { rerender } = render(<VoiceNotePanel onSave={() => undefined} showAutoListen autoListenKey="shot-1" />);
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText(/Listen for 4 s after each shot/));
    fireEvent.click(screen.getByRole('button', { name: 'Download and turn on' }));
    expect((screen.getByLabelText(/Listen for 4 s after each shot/) as HTMLInputElement).checked).toBe(true);
    rerender(<VoiceNotePanel onSave={() => undefined} showAutoListen autoListenKey="shot-2" />);
    expect(await screen.findByText(/Listening/)).toBeTruthy();
  });

  it('releases the microphone when it goes away mid-recording', async () => {
    localStorage.setItem('archerlab-edge:voice-notes', JSON.stringify({ downloadAccepted: true }));
    const { unmount } = render(<VoiceNotePanel onSave={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /Voice note/ }));
    await screen.findByText(/Listening/);
    unmount();
    expect(stopTrack).toHaveBeenCalled();
    expect(transcribe).not.toHaveBeenCalled();
  });
});

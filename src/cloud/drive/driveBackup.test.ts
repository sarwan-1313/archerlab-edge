import { describe, expect, it } from 'vitest';
import { EMPTY_GOALS, type PracticeLogData } from '../../practice-log/types';
import { buildReport, summarizeReport } from '../../video-analysis/buildReport';
import { makeScenario, scriptShots, syntheticSamples } from '../../video-analysis/testing/syntheticArcher';
import type { VideoAnalysisReport } from '../../video-analysis/types';
import {
  BACKUP_FILE, SYNCED_SETTING_KEYS, applySettingsTo, deleteDriveData, driveProfileData, idFromFileName, readSettingsFrom,
  restoreFromDrive, saveToDrive, saveVideoToDrive, type LocalData,
} from './driveBackup';
import type { DriveFile, DriveRest, UploadOptions } from './driveRest';

const scenario = makeScenario({ shots: scriptShots(2) });
const report = (id: string): VideoAnalysisReport => buildReport({
  id,
  createdAt: 1_800_000_000_000,
  samples: syntheticSamples(scenario, 24),
  source: { fileName: 'clip.mp4', fileSize: 1000, mimeType: 'video/mp4', durationS: scenario.durationS, width: 1280, height: 720, nativeFps: 30, analysisFps: 24, hasAudio: false },
  settings: { quality: 'standard', requestedHandedness: 'auto', bowType: 'recurve', model: 'lite', delegate: 'CPU' },
  audio: { kind: 'unavailable', reason: 'No audio track.' },
});

/** An in-memory Drive folder. */
function fakeDrive() {
  const files = new Map<string, DriveFile & { blob: Blob }>();
  let next = 0;
  const uploads: UploadOptions[] = [];
  const api: DriveRest = {
    ensureFolder: async () => 'folder',
    listFiles: async () => [...files.values()].map(({ blob: _blob, ...file }) => { void _blob; return file; }),
    upload: async (_folder, options) => {
      uploads.push(options);
      const id = options.existingId ?? `file${(next += 1)}`;
      const file = { id, name: options.name, mimeType: options.mimeType, appProperties: options.appProperties, blob: options.body };
      files.set(id, file);
      return file;
    },
    download: async (id) => {
      const file = files.get(id);
      if (!file) throw new Error('missing');
      return file.blob;
    },
    remove: async (id) => { files.delete(id); },
  };
  return { api, files, uploads };
}

function device(initial: { profile?: Record<string, unknown> | null; log?: PracticeLogData; reports?: VideoAnalysisReport[]; settings?: Record<string, string> } = {}) {
  const state: { profile: Record<string, unknown> | null; log: PracticeLogData; reports: Map<string, VideoAnalysisReport>; videos: Map<string, Blob>; settings: Record<string, string> } = {
    profile: initial.profile ?? null,
    log: initial.log ?? { entries: [], goals: { ...EMPTY_GOALS } },
    reports: new Map((initial.reports ?? []).map((item) => [item.id, item])),
    videos: new Map<string, Blob>(),
    settings: { ...initial.settings },
  };
  const local: LocalData = {
    readProfile: async () => state.profile,
    applyProfile: async (profile) => { state.profile = profile; },
    readPracticeLog: async () => state.log,
    mergePracticeLog: async (log) => {
      const byId = new Map(state.log.entries.map((entry) => [entry.id, entry]));
      for (const entry of log.entries) byId.set(entry.id, entry);
      state.log = { entries: [...byId.values()], goals: log.goals };
      return log.entries.length;
    },
    readSettings: () => state.settings,
    applySettings: (settings) => { state.settings = { ...state.settings, ...settings }; },
    listReports: async () => [...state.reports.values()].map((item) => summarizeReport(item, state.videos.has(item.id))),
    loadReport: async (id) => state.reports.get(id) ?? null,
    saveReport: async (item, video) => { state.reports.set(item.id, item); if (video) state.videos.set(item.id, video); },
  };
  return { local, state };
}

const entry = (id: string) => ({ id, source: 'manual' as const, date: 1, arrows: 36, averageScore: 9, totalScore: 324, scoredArrows: 36, formScore: null, focusAreas: [] });

describe('saving to the athlete’s Google Drive', () => {
  it('saves the profile without its photo, the practice log, settings and each report', async () => {
    const drive = fakeDrive();
    const { local } = device({
      profile: { id: 'default', displayName: 'Sam', profilePhotoBlob: new Blob(['img']), profilePhotoUrl: 'blob:x', updatedAt: 10 },
      log: { entries: [entry('a')], goals: { ...EMPTY_GOALS, weeklyArrows: 200, updatedAt: 3 } },
      reports: [report('r1'), report('r2')],
      settings: { 'archerlab-edge:lite-mode': '1' },
    });
    const result = await saveToDrive(drive.api, local);
    expect(result).toMatchObject({ reportsSaved: 2, reportsUnchanged: 0 });
    const names = [...drive.files.values()].map((file) => file.name).sort();
    expect(names[0]).toBe(BACKUP_FILE);
    expect(names.slice(1).map((name) => idFromFileName(name, 'report'))).toEqual(['r1', 'r2']);
    const backup = JSON.parse(await [...drive.files.values()].find((file) => file.name === BACKUP_FILE)!.blob.text());
    expect(backup.profile).toEqual({ id: 'default', displayName: 'Sam', updatedAt: 10 });
    expect(backup.practiceLog.entries).toHaveLength(1);
    expect(backup.settings).toEqual({ 'archerlab-edge:lite-mode': '1' });
  });

  it('skips reports that are already in Drive unchanged, and overwrites the backup in place', async () => {
    const drive = fakeDrive();
    const { local } = device({ reports: [report('r1')] });
    await saveToDrive(drive.api, local);
    const again = await saveToDrive(drive.api, local);
    expect(again).toMatchObject({ reportsSaved: 0, reportsUnchanged: 1 });
    expect(drive.files.size).toBe(2);
    expect(drive.uploads[2].existingId).toBeTruthy();
  });

  it('restores everything on a new device: report scores come back from the saved body positions', async () => {
    const drive = fakeDrive();
    const original = report('r1');
    const phone = device({ profile: { id: 'default', displayName: 'Sam', handedness: 'left', updatedAt: 10 }, log: { entries: [entry('a'), entry('b')], goals: { ...EMPTY_GOALS, updatedAt: 1 } }, reports: [original], settings: { 'archerlab-edge:coach-tools': '1' } });
    await saveToDrive(drive.api, phone.local);

    const fresh = device();
    const result = await restoreFromDrive(drive.api, fresh.local);
    expect(result).toEqual({ profileRestored: true, practiceEntries: 2, reportsRestored: 1, reportsSkipped: 0, videosRestored: 0 });
    expect(fresh.state.profile).toMatchObject({ displayName: 'Sam', handedness: 'left' });
    expect(fresh.state.settings).toEqual({ 'archerlab-edge:coach-tools': '1' });
    const restored = fresh.state.reports.get('r1')!;
    // Saved body positions are rounded to 5 decimals, so scores match closely rather than exactly.
    expect(restored.scores.overall).toBeCloseTo(original.scores.overall ?? 0, 1);
    expect(restored.shots).toHaveLength(original.shots.length);
  });

  it('keeps a newer profile and reports already on this device', async () => {
    const drive = fakeDrive();
    await saveToDrive(drive.api, device({ profile: { id: 'default', displayName: 'Old', updatedAt: 5 }, reports: [report('r1')] }).local);
    const here = device({ profile: { id: 'default', displayName: 'New', updatedAt: 50 }, reports: [report('r1')] });
    const result = await restoreFromDrive(drive.api, here.local);
    expect(result.profileRestored).toBe(false);
    expect(result.reportsRestored).toBe(0);
    expect(here.state.profile).toMatchObject({ displayName: 'New' });
  });

  it('brings videos back only when asked', async () => {
    const drive = fakeDrive();
    await saveToDrive(drive.api, device({ reports: [report('r1')] }).local);
    await saveVideoToDrive(drive.api, 'r1', new Blob(['video'], { type: 'video/mp4' }));
    expect([...drive.files.values()].some((file) => file.name === 'video-r1.mp4')).toBe(true);
    const without = device();
    expect((await restoreFromDrive(drive.api, without.local)).videosRestored).toBe(0);
    const withVideos = device();
    expect((await restoreFromDrive(drive.api, withVideos.local, { includeVideos: true })).videosRestored).toBe(1);
    expect(await withVideos.state.videos.get('r1')!.text()).toBe('video');
  });

  it('skips report files that cannot be opened instead of failing the restore', async () => {
    const drive = fakeDrive();
    await drive.api.upload('folder', { name: 'report-bad.json', mimeType: 'application/json', body: new Blob(['{nope']) });
    expect(await restoreFromDrive(drive.api, device().local)).toMatchObject({ reportsRestored: 0, reportsSkipped: 1 });
  });

  it('deletes every file it saved, and the folder', async () => {
    const drive = fakeDrive();
    await saveToDrive(drive.api, device({ reports: [report('r1')] }).local);
    expect(await deleteDriveData(drive.api)).toBe(2);
    expect(drive.files.size).toBe(0);
  });
});

describe('Drive backup helpers', () => {
  it('only carries listed settings, never sign-in sessions or AI keys', () => {
    const store = new Map<string, string>([['archerlab-edge:lite-mode', '1'], ['archerlab-edge:cloud-session', 'secret'], ['archerlab-edge:ai-keys', 'k']]);
    const settings = readSettingsFrom({ getItem: (key) => store.get(key) ?? null });
    expect(settings).toEqual({ 'archerlab-edge:lite-mode': '1' });
    const written = new Map<string, string>();
    applySettingsTo({ setItem: (key, value) => { written.set(key, value); } }, { ...settings, 'archerlab-edge:cloud-session': 'x' });
    expect([...written.keys()]).toEqual(['archerlab-edge:lite-mode']);
    expect(SYNCED_SETTING_KEYS.some((key) => /session|key/i.test(key))).toBe(false);
  });

  it('reads report ids from file names', () => {
    expect(idFromFileName('report-video_1_abc.json.gz', 'report')).toBe('video_1_abc');
    expect(idFromFileName('report-x.json', 'report')).toBe('x');
    expect(idFromFileName('video-x.mov', 'video')).toBe('x');
    expect(idFromFileName(BACKUP_FILE, 'report')).toBeNull();
    expect(driveProfileData({ a: 1, profilePhotoBlob: new Blob([]) })).toEqual({ a: 1 });
  });
});

describe('practice log in Drive', () => {
  it('is never wiped by a save from a device with fewer entries', async () => {
    const drive = fakeDrive();
    await saveToDrive(drive.api, device({ log: { entries: [entry('a'), entry('b')], goals: { ...EMPTY_GOALS, updatedAt: 5 } } }).local);
    await saveToDrive(drive.api, device({ log: { entries: [entry('c')], goals: { ...EMPTY_GOALS, updatedAt: 1 } } }).local);
    const fresh = device();
    expect((await restoreFromDrive(drive.api, fresh.local)).practiceEntries).toBe(3);
    expect(fresh.state.log.goals.updatedAt).toBe(5);
  });
});

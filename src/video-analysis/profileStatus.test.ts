import { describe, expect, it } from 'vitest';
import { buildReport } from './buildReport';
import { applyReportToProfile, isFormStatus } from './profileStatus';
import { RESOURCE_LIBRARY, recommendResources } from './resources';
import { makeScenario, scriptShots, syntheticSamples } from './testing/syntheticArcher';

function reportFor(id: string, createdAt: number, shots = 3) {
  const scenario = makeScenario({ shots: scriptShots(shots, { faults: { bowElbowBend: 30 } }) });
  return buildReport({
    id, createdAt,
    samples: syntheticSamples(scenario, 12),
    source: { fileName: `${id}.mp4`, fileSize: 1, mimeType: 'video/mp4', durationS: scenario.durationS, width: 1280, height: 720, nativeFps: 30, analysisFps: 12, hasAudio: false },
    settings: { quality: 'fast', requestedHandedness: 'auto', bowType: 'recurve', model: 'lite', delegate: 'CPU' },
    audio: null,
  });
}

describe('applyReportToProfile', () => {
  it('adds form status without touching the self-reported level or photo', () => {
    const photo = new Blob(['x']);
    const profile = { displayName: 'Archer', experienceLevel: 'beginner', profilePhotoBlob: photo };
    const updated = applyReportToProfile(profile, reportFor('a', 1000));
    expect(updated.experienceLevel).toBe('beginner');
    expect(updated.profilePhotoBlob).toBe(photo);
    expect(isFormStatus(updated.formStatus)).toBe(true);
    expect(updated.formStatus.estimatedLevel).not.toBeNull();
    expect(updated.formStatus.focus.length).toBeGreaterThan(0);
    expect(updated.formStatus.history).toHaveLength(1);
  });

  it('builds a history and replaces a re-saved report', () => {
    let profile = applyReportToProfile(null, reportFor('a', 1000));
    profile = applyReportToProfile(profile, reportFor('b', 2000));
    profile = applyReportToProfile(profile, reportFor('a', 1000));
    expect(profile.formStatus.history.map((entry) => entry.reportId)).toEqual(['a', 'b']);
    expect(profile.formStatus.lastReportId).toBe('a');
  });

  it('keeps the last known level when a clip cannot be scored', () => {
    const scored = applyReportToProfile(null, reportFor('a', 1000));
    const empty = reportFor('empty', 3000, 0);
    const updated = applyReportToProfile(scored, empty);
    expect(updated.formStatus.estimatedLevel).toBe(scored.formStatus.estimatedLevel);
    expect(updated.formStatus.history).toHaveLength(2);
  });
});

describe('resources', () => {
  it('only links to https pages', () => {
    for (const resource of Object.values(RESOURCE_LIBRARY)) expect(resource.url.startsWith('https://')).toBe(true);
  });

  it('recommends links for the focus areas, with labelled searches', () => {
    const report = reportFor('r', 1);
    const links = recommendResources(report.focusAreas, 'beginner', 'recurve');
    expect(links.length).toBeGreaterThan(2);
    expect(links.some((link) => link.kind === 'search' && link.publisher.includes('not vetted'))).toBe(true);
    expect(new Set(links.map((link) => link.id)).size).toBe(links.length);
  });

  it('suits compound archers', () => {
    const links = recommendResources([], 'advanced', 'compound');
    expect(links.some((link) => link.id === 'wa-sara-lopez')).toBe(true);
    expect(links.some((link) => link.id === 'wa-ellison')).toBe(false);
  });
});

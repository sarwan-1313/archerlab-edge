import { VIDEO_CONFIG } from './config';
import { resourcesForCategory } from './resources';
import { CATEGORY_INFO, METRIC_RUBRIC, SESSION_METRICS, bandScore, formatMetric, rubricFor } from './rubric';
import { metricApplies } from './scoring';
import { mean, median } from './signal';
import type { BowType, ConfidenceLabel, Finding, FindingLocation, MetricKey, MetricMap, PlanStep, ScoreSummary, ShotReport, SkillLevel, Strength } from './types';
import { dist3 } from './vec';

interface CopyContext {
  value: number;
  formatted: string;
  bowType: BowType;
  posture?: ShotReport['posture'];
}

interface Copy {
  title: string;
  observed: string;
  why: string;
  fix: string;
  drill: string;
}

const pct = (value: number) => `${Math.round(value * 100)}%`;

/** Plain-language coaching copy for each metric when it needs work. */
const FINDING_COPY: Record<MetricKey, (context: CopyContext) => Copy> = {
  bowElbowAngle: ({ formatted, bowType }) => ({
    title: 'Bow arm bends at full draw',
    observed: `Your bow arm measured ${formatted} at anchor. ArcherLab's target is ${bowType === 'compound' ? '160°' : '165°'} or straighter.`,
    why: 'A bent bow arm lets the bow move toward you at release and changes your draw length from shot to shot, so groups open up.',
    fix: 'Push the bow toward the target with a straight but relaxed arm. Keep the bow shoulder low and turn the inside of the elbow slightly away from the string instead of locking it.',
    drill: 'Mirror drill: 3 sets of 10 slow draws with a stretch band, checking the bow arm stays straight from set-up to follow-through.',
  }),
  drawForearmAlignment: ({ formatted }) => ({
    title: 'Draw elbow is out of line with the arrow',
    observed: `At anchor your draw forearm points ${formatted} away from the arrow line.`,
    why: 'When the elbow is not behind the arrow, the arm holds the weight instead of the back, which makes a clean, repeatable release harder.',
    fix: 'Bring the draw elbow around behind the arrow so the forearm points along the arrow toward the target. Draw with the shoulder blade, not the hand.',
    drill: 'Elbow-line check: come to anchor with a band while someone films from behind you; the forearm should line up with the arrow. 3 × 8 reps.',
  }),
  shoulderAlignment: ({ formatted }) => ({
    title: 'Shoulders are not lined up with the arrow',
    observed: `Your shoulder line sits ${formatted} off the arrow line at full draw.`,
    why: 'Open or twisted shoulders break the "T" shape, so the arms hold the bow instead of the larger back muscles.',
    fix: 'Set up with level shoulders roughly parallel to the arrow, then keep moving the draw-side shoulder back behind the arrow as you draw.',
    drill: 'Blank-boss shooting at 5 m with no target face: 2 ends of 6, thinking only about the shoulder line at full draw.',
  }),
  bowShoulderRise: ({ value, posture }) => {
    const bowHigher = posture?.bowShoulderHigher ?? true;
    return {
      title: bowHigher ? 'Bow shoulder lifts at full draw' : 'Draw shoulder rides high at full draw',
      observed: `One shoulder sits about ${pct(value)} of a shoulder width higher than the other at anchor.`,
      why: 'A raised shoulder usually means the arm is fighting the draw weight. It moves the bow at release and can strain the shoulder over time.',
      fix: bowHigher
        ? 'Set the bow shoulder low before you draw and keep it there. If you cannot keep it down, the bow may be too heavy for now.'
        : 'Relax the draw-side shoulder and draw with the back so both shoulders stay level.',
      drill: 'Band draws in front of a mirror: 3 × 10, pausing at anchor to check that both shoulders are low and level.',
    };
  },
  torsoLean: ({ formatted, posture }) => {
    const toward = posture?.leanTowardTarget;
    return {
      title: toward === true ? 'Upper body leans toward the target' : toward === false ? 'Upper body leans away from the target' : 'Upper body leans at full draw',
      observed: `Your torso is ${formatted} from vertical at anchor.`,
      why: 'Leaning shifts your balance and changes where arrows go whenever the lean changes, which is hard to repeat.',
      fix: toward === false
        ? 'Stand tall with weight evenly over both feet and shoulders stacked over the hips. Leaning back often means the bow is too heavy.'
        : 'Stand tall with weight evenly over both feet and shoulders stacked over the hips, then raise the bow to you rather than reaching toward it.',
      drill: 'Posture reps: 5 slow draws holding 3 s at anchor, keeping head and shoulders over the hips. Check on video or in a mirror.',
    };
  },
  bowHandSway: ({ formatted }) => ({
    title: 'Bow hand moves a lot while aiming',
    observed: `In the last part of the hold, the bow hand moved about ${formatted}.`,
    why: 'Movement while aiming is the main cause of arrows spreading sideways and up and down.',
    fix: 'Keep the bow hand relaxed in the grip, let the sight float instead of forcing it still, and let the shot go as the pin settles.',
    drill: 'Holding drill: with a light bow or band, hold at full draw for 5–8 s, 3 sets of 5, aiming at a small mark.',
  }),
  headSway: ({ formatted }) => ({
    title: 'Head moves while aiming',
    observed: `Your head moved ${formatted} while you aimed.`,
    why: 'The head carries your anchor and your eye. If it moves, both the aim and the anchor change.',
    fix: 'Bring the string to your face rather than your face to the string, then keep your head still and upright until the arrow lands.',
    drill: 'Anchor freeze: 3 ends of 6 holding the head still for a slow two-count after each release.',
  }),
  anchorSway: ({ formatted }) => ({
    title: 'Anchor is not settled',
    observed: `The draw hand moved ${formatted} against your face while holding.`,
    why: 'A moving anchor changes where the arrow launches from, which shows up as vertical spread.',
    fix: 'Use one firm, repeatable contact point (jaw, chin or corner of the mouth) and keep the hand locked to it while you aim.',
    drill: 'Eyes-closed anchors: 10 slow draws to anchor with your eyes closed, feeling for the same contact every time.',
  }),
  drawCreep: ({ value }) => ({
    title: 'Draw hand creeps forward before release',
    observed: `Your draw length shrank by about ${Math.abs(value).toFixed(1)}% of a shoulder width per second just before release.`,
    why: 'Losing draw length ("creeping") lowers arrow speed and tends to drop arrows low and inconsistently.',
    fix: 'Keep expanding through the shot: keep moving the shoulder blade back while you aim, until the clicker or release goes off.',
    drill: 'Expansion drill with a band: reach anchor, then keep the shoulder-blade movement going for 2 s before releasing. 3 × 8.',
  }),
  releaseBackFraction: ({ value }) => ({
    title: 'Release hand moves away from the arrow line',
    observed: `Only ${pct(Math.max(0, value))} of the draw hand's movement after release went straight back along the arrow.`,
    why: 'A plucking release pulls the string sideways, which shows up as left–right spread.',
    fix: 'Relax the fingers so the string leaves on its own, and let the hand slide back along the jaw and neck.',
    drill: 'Close-range blank-boss: 3 ends of 6, filming or watching the hand finish just behind the neck.',
  }),
  releaseTravel: ({ formatted }) => ({
    title: 'Release looks static',
    observed: `The draw hand travelled only ${formatted} after release.`,
    why: 'A static ("dead") release usually means back tension stopped before the shot, so the fingers do the work.',
    fix: 'Keep the back working through the release so the hand moves back past the ear on its own.',
    drill: 'Back-tension band drill: 3 × 10, finishing every rep with the hand behind the neck.',
  }),
  headMoveAtRelease: ({ formatted }) => ({
    title: 'Head moves at release',
    observed: `Your head moved ${formatted} at the moment of release.`,
    why: 'Flinching, or lifting the head to watch the arrow, moves the bow before the arrow has left it.',
    fix: 'Keep looking at your aiming point until the arrow lands, holding the head still for a full second after release.',
    drill: 'Blank-boss shots at close range with your eyes fixed on one spot through the whole follow-through.',
  }),
  bowArmDrop: ({ formatted }) => ({
    title: 'Bow arm drops right after release',
    observed: `The bow hand dropped ${formatted} within a third of a second of release.`,
    why: 'Dropping the arm early is often "peeking" or relaxing too soon, which can move the bow while the arrow is still leaving.',
    fix: 'Keep the bow arm pointing at the target until the arrow lands; let the bow tip forward in the sling instead of dropping the arm.',
    drill: 'Finish-and-freeze: after every shot, hold the bow arm up for a slow two-count.',
  }),
  followThroughHold: ({ formatted }) => ({
    title: 'Follow-through ends too quickly',
    observed: `You held the finish for ${formatted} after release.`,
    why: 'A short follow-through often means the shot is being cut short mentally, which shows up as inconsistent releases.',
    fix: 'Treat the follow-through as part of the shot: hold the finish position until the arrow hits.',
    drill: 'Count "one, two" after each release before you move.',
  }),
  holdDuration: ({ value, formatted }) => value < 1.5
    ? {
      title: 'Releasing very soon after reaching anchor',
      observed: `You released about ${formatted} after reaching anchor.`,
      why: 'Very short holds can mean snap shooting or target panic, where the release fires before the aim settles.',
      fix: 'Settle at anchor before you aim and let the shot finish. A coach can help with blank-boss and clicker drills if the release feels hard to control.',
      drill: 'Blank-boss: 3 ends of 6, deliberately holding 2 s at anchor before releasing.',
    }
    : {
      title: 'Holding a long time before releasing',
      observed: `You held about ${formatted} at anchor before releasing.`,
      why: 'Long holds tire the muscles and usually make the aim worse, not better.',
      fix: 'If the shot has not gone after about 4–5 seconds, let down and start again.',
      drill: 'Let-down practice: if the release has not happened by a slow five-count, come down and restart. 2 ends.',
    },
  drawDuration: ({ value, formatted }) => ({
    title: value < 1 ? 'Very quick draw' : 'Slow, effortful draw',
    observed: `Your draw took about ${formatted}.`,
    why: 'An even draw speed helps you arrive at the same anchor, with the same alignment, every time.',
    fix: value < 1 ? 'Slow the draw down into one smooth, steady movement of about 1.5–2.5 seconds.' : 'Draw in one smooth, steady movement. If drawing feels like a struggle, the bow may be too heavy for now.',
    drill: 'Count-paced draws with a band: draw on a steady "one, two", 3 × 10.',
  }),
  clickerReaction: ({ formatted }) => ({
    title: 'Slow reaction to the clicker',
    observed: `About ${formatted} passed between the click and the release.`,
    why: 'A slow reaction lets the aim and back tension fade before the arrow leaves.',
    fix: 'Treat the clicker as the trigger: keep expanding and let the release happen as soon as it clicks.',
    drill: 'Clicker drill at a blank boss: 3 ends of 6 focusing on releasing as soon as the clicker drops.',
  }),
  anchorSpread: ({ value }) => ({
    title: 'Anchor position changes between shots',
    observed: `Your anchor moved about ${pct(value)} of a shoulder width from shot to shot.`,
    why: 'Each different anchor launches the arrow from a different place, one of the biggest sources of vertical spread.',
    fix: 'Pick one clear reference (string touching nose and chin, hand under the jaw) and use it on every shot.',
    drill: 'Eyes-closed anchors, then 6 shots checking you feel the same contact each time.',
  }),
  holdTimeCv: ({ value }) => ({
    title: 'Shot rhythm changes from shot to shot',
    observed: `Your aiming time varied by about ${pct(value)} between shots.`,
    why: 'Consistent timing is a sign of a repeatable shot process; big changes usually mean some shots are being forced.',
    fix: 'Use the same steps in the same order on every shot and let your timing settle.',
    drill: 'Shoot an end saying each step in your head: stance, set-up, draw, anchor, aim, release, finish.',
  }),
  drawTimeCv: ({ value }) => ({
    title: 'Draw speed changes between shots',
    observed: `Your draw time varied by about ${pct(value)} between shots.`,
    why: 'Varying the draw usually means arriving at anchor slightly differently each time.',
    fix: 'Draw at the same steady pace on every shot.',
    drill: 'Count-paced draws with a band: 3 × 10 on a steady "one, two".',
  }),
  elbowAngleSd: ({ formatted }) => ({
    title: 'Bow arm changes from shot to shot',
    observed: `Your bow-arm angle varied by about ±${formatted} between shots.`,
    why: 'If the bow arm changes, the draw length and the bow\'s position change with it.',
    fix: 'Set the bow arm in the same position at set-up, before you draw, on every shot.',
    drill: 'Set-up pause: hold the set-up position for one second before every draw, checking the bow arm.',
  }),
};

const STRENGTH_COPY: Partial<Record<MetricKey, string>> = {
  bowElbowAngle: 'Straight, strong bow arm',
  drawForearmAlignment: 'Draw elbow in line behind the arrow',
  shoulderAlignment: 'Shoulders lined up with the arrow',
  bowShoulderRise: 'Level, settled shoulders',
  torsoLean: 'Upright, balanced posture',
  bowHandSway: 'Steady bow hand while aiming',
  headSway: 'Still head while aiming',
  anchorSway: 'Solid anchor',
  releaseBackFraction: 'Release moves straight back along the arrow',
  releaseTravel: 'Dynamic release',
  headMoveAtRelease: 'Head stays still through the release',
  bowArmDrop: 'Bow arm stays up after the shot',
  followThroughHold: 'Patient follow-through',
  holdDuration: 'Settled aiming time',
  drawDuration: 'Smooth draw tempo',
  anchorSpread: 'Very repeatable anchor',
  holdTimeCv: 'Consistent shot rhythm',
  drawTimeCv: 'Consistent draw tempo',
  elbowAngleSd: 'Same bow arm shot after shot',
};

function locate(metric: MetricKey, shots: readonly ShotReport[]): FindingLocation {
  const rubric = METRIC_RUBRIC[metric];
  const measured = shots.filter((shot) => shot.source !== 'audio-only');
  if (!measured.length) return { shotIndex: null, time: null, joints: rubric.joints };
  let worst: ShotReport | undefined;
  if (SESSION_METRICS.includes(metric)) {
    if (metric === 'anchorSpread') {
      const anchors = measured.filter((shot) => shot.anchorVector);
      if (anchors.length) {
        const center = {
          x: mean(anchors.map((shot) => shot.anchorVector!.x)),
          y: mean(anchors.map((shot) => shot.anchorVector!.y)),
          z: mean(anchors.map((shot) => shot.anchorVector!.z)),
        };
        worst = [...anchors].sort((a, b) => dist3(b.anchorVector!, center) - dist3(a.anchorVector!, center))[0];
      }
    } else {
      const base: MetricKey = metric === 'elbowAngleSd' ? 'bowElbowAngle' : metric === 'drawTimeCv' ? 'drawDuration' : 'holdDuration';
      const values = measured.map((shot) => shot.metrics[base]?.value).filter((value): value is number => typeof value === 'number');
      if (values.length) {
        const center = median(values);
        worst = [...measured].filter((shot) => shot.metrics[base]).sort((a, b) => Math.abs((b.metrics[base]!.value) - center) - Math.abs((a.metrics[base]!.value) - center))[0];
      }
    }
  } else {
    worst = [...measured].filter((shot) => shot.scores[metric] !== undefined).sort((a, b) => (a.scores[metric] as number) - (b.scores[metric] as number))[0];
  }
  if (!worst) return { shotIndex: null, time: null, joints: rubric.joints };
  let time = worst.release + rubric.showAt;
  if (worst.anchorStart !== null && time < worst.anchorStart) time = rubric.showAt <= -1.5 && worst.drawStart !== null ? worst.drawStart + 0.3 : worst.anchorStart + 0.1;
  return { shotIndex: worst.index, time: Math.max(0, time), joints: rubric.joints };
}

export interface CoachingInput {
  aggregated: MetricMap;
  shots: readonly ShotReport[];
  scores: ScoreSummary;
  bowType: BowType;
}

/** Turns scored metrics into findings (what to fix), strengths (what to keep) and the top focus areas. */
export function buildCoaching({ aggregated, shots, scores, bowType }: CoachingInput): { findings: Finding[]; strengths: Strength[]; focusAreas: Finding[] } {
  const level: SkillLevel = scores.level ?? 'beginner';
  const findings: Finding[] = [];
  const strengths: Strength[] = [];
  for (const [metric, value] of Object.entries(aggregated) as Array<[MetricKey, NonNullable<MetricMap[MetricKey]>]>) {
    if (!metricApplies(metric, bowType)) continue;
    const rubric = rubricFor(metric, bowType);
    const score = bandScore(value.value, rubric.band);
    const formatted = formatMetric(metric, value.value);
    if (score < VIDEO_CONFIG.scoring.findingScoreMax && value.confidence >= VIDEO_CONFIG.scoring.findingMinConfidence) {
      const where = locate(metric, shots);
      const shot = where.shotIndex ? shots.find((candidate) => candidate.index === where.shotIndex) : undefined;
      const copy = FINDING_COPY[metric]({ value: value.value, formatted, bowType, posture: shot?.posture });
      findings.push({
        id: `${metric}`,
        metric,
        category: rubric.category,
        severity: score < 45 ? 'high' : score < 60 ? 'medium' : 'low',
        score,
        confidence: value.confidence,
        ...copy,
        where,
        resourceIds: resourcesForCategory(rubric.category, level, bowType),
        experimental: rubric.experimental,
      });
    } else if (score >= VIDEO_CONFIG.scoring.strengthScoreMin && value.confidence >= VIDEO_CONFIG.scoring.strengthMinConfidence && STRENGTH_COPY[metric]) {
      strengths.push({ metric, title: STRENGTH_COPY[metric] as string, detail: `${rubric.label}: ${formatted}`, score });
    }
  }
  const impact = (finding: Finding) => (100 - finding.score) * METRIC_RUBRIC[finding.metric].weight * CATEGORY_INFO[finding.category].weight * finding.confidence * (finding.experimental ? 0.6 : 1);
  findings.sort((a, b) => impact(b) - impact(a));
  const focusAreas: Finding[] = [];
  const usedCategories = new Set<string>();
  for (const finding of findings) {
    if (focusAreas.length >= 3) break;
    if (usedCategories.has(finding.category)) continue;
    usedCategories.add(finding.category);
    focusAreas.push(finding);
  }
  strengths.sort((a, b) => b.score - a.score);
  return { findings, strengths: strengths.slice(0, 5), focusAreas };
}

/** A short practice plan for the next few sessions. */
export function buildPlan(focus: readonly Finding[], level: SkillLevel | null, confidence: ConfidenceLabel, findings: readonly Finding[]): PlanStep[] {
  const plan: PlanStep[] = [];
  if (confidence === 'low') {
    plan.push({
      title: 'Record a clearer clip first',
      detail: 'Film side-on with the whole body in frame, the camera at chest height 3–5 m away, in good light, and include at least 3 shots. The analysis gets much more reliable.',
    });
  }
  focus.slice(0, 2).forEach((finding, index) => {
    plan.push({ title: `${index === 0 ? 'Main' : 'Second'} focus: ${finding.title}`, detail: finding.drill });
  });
  const heavyBowSigns = findings.some((finding) => (finding.metric === 'bowShoulderRise' || finding.metric === 'torsoLean' || finding.metric === 'drawDuration') && finding.severity === 'high');
  if (heavyBowSigns) {
    plan.push({ title: 'Check your draw weight', detail: 'Several signs point to the bow being hard to hold. Ask a coach whether a lighter draw weight would let you build form first.' });
  }
  if (level === 'beginner' || level === null) {
    plan.push({ title: 'Blank-boss end every session', detail: 'Shoot one end at a blank boss from 5–10 m so you can think only about form, not score.' });
  } else if (level === 'intermediate') {
    plan.push({ title: 'Film the same end every week', detail: 'Record 6 arrows from the same camera position each week; your profile tracks the form score over time.' });
  } else {
    plan.push({ title: 'Compare against your best sessions', detail: 'Film a full end at competition distance and compare rhythm and anchor consistency with your best-scoring days.' });
  }
  plan.push({ title: 'Re-test in 3–4 sessions', detail: 'Upload a new clip from the same angle to see whether the focus areas improve.' });
  return plan;
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { BIOMECHANICS_CONFIG } from '../biomechanics/config';
import { getBowSide } from '../biomechanics/handedness';
import { createInstantaneousBiomechanics, unavailableMetric } from '../biomechanics/metrics';
import { calculateReferenceDeltas, createBiomechanicsReference, type ReferenceSample } from '../biomechanics/referencePose';
import { RollingTimeBuffer } from '../biomechanics/rollingBuffer';
import { TimeAwareEma } from '../biomechanics/smoothing';
import { calculateBowHandMotion, calculateHeadMotion, calculateShoulderVariation } from '../biomechanics/stability';
import type { ArcherHandedness, BiomechanicsFrame, BiomechanicsMetric, BiomechanicsReference, BiomechanicsSnapshot } from '../types/biomechanics';
import type { PoseResult } from '../types/pose';

type Options = { poseResult: PoseResult | null; handedness: ArcherHandedness; active: boolean; resetKey?: string | number; reference?: BiomechanicsReference; onReferenceChange?: (reference: BiomechanicsReference | undefined) => void };
const metricNames = ['shoulderLine', 'bowArm', 'torso', 'head', 'bowHand', 'shoulderVariation'] as const;
type MetricName = typeof metricNames[number];

function emptySnapshot(handedness: ArcherHandedness, reason = 'Waiting for athlete'): BiomechanicsSnapshot {
  return {
    timestampMs: 0, athleteDetected: false, poseConfidence: 0,
    shoulderLineAngle: unavailableMetric(reason, '°'),
    bowArmElbowAngle: unavailableMetric(reason, '°'),
    torsoLean: unavailableMetric(reason, '°'),
    headMotion: unavailableMetric(reason, '% SW'),
    bowHandMotion: unavailableMetric(reason, '% SW'),
    shoulderVariation: unavailableMetric(reason, '°'),
    debug: { handedness, bowSide: getBowSide(handedness), timestampMs: 0, historySamples: 0, historyDurationMs: 0, shoulderWidth: null, metricConfidence: 0, headRmsPercent: null, bowHandRmsPercent: null },
  };
}

function smooth(metric: BiomechanicsMetric, smoother: TimeAwareEma, timestampMs: number): BiomechanicsMetric {
  if (!metric.available || metric.rawValue === null) return metric;
  const smoothedValue = smoother.update(metric.rawValue, timestampMs);
  return { ...metric, value: smoothedValue, smoothedValue };
}

export function useBiomechanics({ poseResult, handedness, active, resetKey, reference, onReferenceChange }: Options) {
  const [snapshot, setSnapshot] = useState<BiomechanicsSnapshot>(() => emptySnapshot(handedness));
  const [isCapturingReference, setIsCapturingReference] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const historyRef = useRef(new RollingTimeBuffer<BiomechanicsFrame>(BIOMECHANICS_CONFIG.windowDurationMs));
  const smoothersRef = useRef(Object.fromEntries(metricNames.map((name) => [name, new TimeAwareEma(BIOMECHANICS_CONFIG.smoothingTimeConstantMs, BIOMECHANICS_CONFIG.smoothingResetGapMs)])) as Record<MetricName, TimeAwareEma>);
  const lastPoseRef = useRef(-1);
  const lastTrackedRef = useRef<number | null>(null);
  const lastHeadReferenceRef = useRef<'ears' | 'nose' | undefined>(undefined);
  const lastUiRef = useRef(-Infinity);
  const captureStartedRef = useRef<number | null>(null);
  const captureSamplesRef = useRef<ReferenceSample[]>([]);

  const resetTemporal = useCallback(() => {
    historyRef.current.clear();
    metricNames.forEach((name) => smoothersRef.current[name].reset());
    lastPoseRef.current = -1;
    lastTrackedRef.current = null;
    lastHeadReferenceRef.current = undefined;
    captureStartedRef.current = null;
    captureSamplesRef.current = [];
    setIsCapturingReference(false);
  }, []);

  useEffect(() => { resetTemporal(); setSnapshot(emptySnapshot(handedness)); }, [handedness, resetKey, resetTemporal]);
  useEffect(() => {
    if (active) return;
    resetTemporal();
    setSnapshot(emptySnapshot(handedness, 'Camera is not active'));
  }, [active, handedness, resetTemporal]);

  useEffect(() => {
    if (!active || !poseResult || poseResult.timestamp <= lastPoseRef.current) return;
    lastPoseRef.current = poseResult.timestamp;
    if (!poseResult.athleteDetected) {
      if (isCapturingReference && captureStartedRef.current !== null && poseResult.timestamp - captureStartedRef.current >= BIOMECHANICS_CONFIG.referenceCaptureTimeoutMs) {
        setIsCapturingReference(false);
        setCaptureError('Reference capture needs a clearly visible athlete. Reframe and try again.');
        captureStartedRef.current = null;
      }
      const lostFor = lastTrackedRef.current === null ? Infinity : poseResult.timestamp - lastTrackedRef.current;
      if (lostFor > BIOMECHANICS_CONFIG.trackingLossResetMs) resetTemporal();
      setSnapshot(emptySnapshot(handedness, 'Athlete not detected'));
      return;
    }
    lastTrackedRef.current = poseResult.timestamp;
    const instant = createInstantaneousBiomechanics(poseResult, handedness);
    if (lastHeadReferenceRef.current && instant.frame.headReference && lastHeadReferenceRef.current !== instant.frame.headReference) {
      historyRef.current.clear(); smoothersRef.current.head.reset();
    }
    lastHeadReferenceRef.current = instant.frame.headReference;
    historyRef.current.push(instant.frame);
    const frames = historyRef.current.values();
    const shoulderLineAngle = smooth(instant.shoulderLine, smoothersRef.current.shoulderLine, poseResult.timestamp);
    const bowArmElbowAngle = smooth(instant.bowArmElbow, smoothersRef.current.bowArm, poseResult.timestamp);
    const torsoLean = smooth(instant.torsoLean, smoothersRef.current.torso, poseResult.timestamp);
    const headMotion = smooth(calculateHeadMotion(frames), smoothersRef.current.head, poseResult.timestamp);
    const bowHandMotion = smooth(calculateBowHandMotion(frames), smoothersRef.current.bowHand, poseResult.timestamp);
    const shoulderVariation = smooth(calculateShoulderVariation(frames), smoothersRef.current.shoulderVariation, poseResult.timestamp);

    if (isCapturingReference && captureStartedRef.current !== null) {
      if (instant.shoulderLine.rawValue !== null && instant.bowArmElbow.rawValue !== null && instant.torsoLean.rawValue !== null) {
        captureSamplesRef.current.push({
          timestampMs: poseResult.timestamp,
          shoulderLineAngleDeg: instant.shoulderLine.rawValue,
          bowArmElbowAngleDeg: instant.bowArmElbow.rawValue,
          torsoLeanDeg: instant.torsoLean.rawValue,
          confidence: Math.min(instant.shoulderLine.confidence, instant.bowArmElbow.confidence, instant.torsoLean.confidence),
        });
      }
      const elapsed = poseResult.timestamp - captureStartedRef.current;
      if (elapsed >= BIOMECHANICS_CONFIG.referenceCaptureDurationMs) {
        const captured = createBiomechanicsReference(captureSamplesRef.current);
        if (captured) {
          onReferenceChange?.(captured); setIsCapturingReference(false); setCaptureError(null); captureStartedRef.current = null;
        } else if (elapsed >= BIOMECHANICS_CONFIG.referenceCaptureTimeoutMs) {
          setIsCapturingReference(false); setCaptureError('Keep the full bow-side arm and torso visible, then try again.'); captureStartedRef.current = null;
        }
      }
    }

    const next: BiomechanicsSnapshot = {
      timestampMs: poseResult.timestamp, athleteDetected: true, poseConfidence: poseResult.averageVisibility,
      shoulderLineAngle, bowArmElbowAngle, torsoLean, headMotion, bowHandMotion, shoulderVariation,
      currentFrame: instant.frame,
      debug: {
        handedness, bowSide: getBowSide(handedness), timestampMs: poseResult.timestamp,
        historySamples: frames.length, historyDurationMs: historyRef.current.durationMs,
        shoulderWidth: instant.frame.shoulderWidth ?? null, metricConfidence: instant.frame.confidence,
        headRmsPercent: headMotion.rawValue, bowHandRmsPercent: bowHandMotion.rawValue,
      },
    };
    next.reference = calculateReferenceDeltas(next, reference);
    if (poseResult.timestamp - lastUiRef.current >= BIOMECHANICS_CONFIG.uiUpdateIntervalMs) { lastUiRef.current = poseResult.timestamp; setSnapshot(next); }
  }, [active, handedness, isCapturingReference, onReferenceChange, poseResult, reference, resetTemporal]);

  const captureReference = useCallback(() => {
    captureSamplesRef.current = [];
    captureStartedRef.current = poseResult?.timestamp ?? performance.now();
    setCaptureError(null); setIsCapturingReference(true);
  }, [poseResult?.timestamp]);
  const resetReference = useCallback(() => { onReferenceChange?.(undefined); setCaptureError(null); }, [onReferenceChange]);
  return { snapshot, reference, captureReference, resetReference, isCapturingReference, captureError, history: historyRef.current.values() };
}

export type PoseEngineStatus = 'idle' | 'loading' | 'ready' | 'running' | 'error';

export type PoseDetectionState = 'no-athlete' | 'athlete-detected' | 'low-visibility';

export type PoseLandmark = {
  x: number;
  y: number;
  z: number;
  visibility?: number;
  presence?: number;
};

export type PoseWorldLandmark = PoseLandmark;

export type PoseResult = {
  landmarks: PoseLandmark[];
  worldLandmarks: PoseWorldLandmark[];
  timestamp: number;
  athleteDetected: boolean;
  averageVisibility: number;
};

export type PoseDebugStats = {
  fps: number;
  landmarkCount: number;
  averageVisibility: number;
  videoWidth: number;
  videoHeight: number;
};

export type CalibrationReadiness = {
  camera: boolean;
  athlete: boolean;
  shoulders: boolean;
  arms: boolean;
  lowerBody: boolean;
  upperBody: boolean;
  fullBody: boolean;
  ready: boolean;
};

export type PoseConnection = {
  start: number;
  end: number;
};


export type TrainingWorkflowState =
  | 'WELCOME'
  | 'CAMERA_SETUP'
  | 'READY_CHECK'
  | 'SESSION_READY'
  | 'SESSION_ACTIVE'
  | 'SHOT_REVIEW'
  | 'SESSION_ENDING'
  | 'SESSION_SUMMARY';

export type TrainingWorkflowEvent =
  | 'START_ANALYSIS'
  | 'CAMERA_CONFIRMED'
  | 'READINESS_PASSED'
  | 'READINESS_LOST'
  | 'BACK_TO_CAMERA_SETUP'
  | 'SESSION_STARTED'
  | 'SHOT_COMPLETED'
  | 'CONTINUE_SESSION'
  | 'END_SESSION_CONFIRMED'
  | 'SESSION_FINALIZED'
  | 'START_NEW_SESSION';

const transitions: Partial<Record<TrainingWorkflowState, Partial<Record<TrainingWorkflowEvent, TrainingWorkflowState>>>> = {
  WELCOME: { START_ANALYSIS: 'CAMERA_SETUP' },
  CAMERA_SETUP: { CAMERA_CONFIRMED: 'READY_CHECK' },
  READY_CHECK: { READINESS_PASSED: 'SESSION_READY', BACK_TO_CAMERA_SETUP: 'CAMERA_SETUP' },
  SESSION_READY: { BACK_TO_CAMERA_SETUP: 'CAMERA_SETUP', READINESS_LOST: 'READY_CHECK', SESSION_STARTED: 'SESSION_ACTIVE' },
  SESSION_ACTIVE: { SHOT_COMPLETED: 'SHOT_REVIEW', END_SESSION_CONFIRMED: 'SESSION_ENDING' },
  SHOT_REVIEW: { CONTINUE_SESSION: 'SESSION_ACTIVE', END_SESSION_CONFIRMED: 'SESSION_ENDING' },
  SESSION_ENDING: { SESSION_FINALIZED: 'SESSION_SUMMARY' },
  SESSION_SUMMARY: { START_NEW_SESSION: 'CAMERA_SETUP' },
};

export function transitionTrainingWorkflow(state: TrainingWorkflowState, event: TrainingWorkflowEvent): TrainingWorkflowState {
  return transitions[state]?.[event] ?? state;
}

export function isActiveTrainingState(state: TrainingWorkflowState): boolean {
  return state === 'SESSION_ACTIVE' || state === 'SHOT_REVIEW' || state === 'SESSION_ENDING';
}

export function isSetupTrainingState(state: TrainingWorkflowState): boolean {
  return state === 'CAMERA_SETUP' || state === 'READY_CHECK' || state === 'SESSION_READY';
}

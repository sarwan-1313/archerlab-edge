import { describe, expect, it } from 'vitest';
import { isActiveTrainingState, transitionTrainingWorkflow, type TrainingWorkflowState } from './trainingWorkflow';

describe('training workflow presentation state', () => {
  it('follows the complete guided path deterministically', () => {
    const events = [
      'START_ANALYSIS',
      'CAMERA_CONFIRMED',
      'READINESS_PASSED',
      'SESSION_STARTED',
      'SHOT_COMPLETED',
      'CONTINUE_SESSION',
      'END_SESSION_CONFIRMED',
      'SESSION_FINALIZED',
    ] as const;
    const expected: TrainingWorkflowState[] = [
      'CAMERA_SETUP',
      'READY_CHECK',
      'SESSION_READY',
      'SESSION_ACTIVE',
      'SHOT_REVIEW',
      'SESSION_ACTIVE',
      'SESSION_ENDING',
      'SESSION_SUMMARY',
    ];

    let state: TrainingWorkflowState = 'WELCOME';
    events.forEach((event, index) => {
      state = transitionTrainingWorkflow(state, event);
      expect(state).toBe(expected[index]);
    });
  });

  it('ignores transitions that are not valid for the current UI state', () => {
    expect(transitionTrainingWorkflow('CAMERA_SETUP', 'SESSION_STARTED')).toBe('CAMERA_SETUP');
    expect(transitionTrainingWorkflow('SESSION_ACTIVE', 'READINESS_PASSED')).toBe('SESSION_ACTIVE');
    expect(transitionTrainingWorkflow('SESSION_SUMMARY', 'SHOT_COMPLETED')).toBe('SESSION_SUMMARY');
  });

  it('only protects navigation while a session is active or finalizing', () => {
    expect(isActiveTrainingState('CAMERA_SETUP')).toBe(false);
    expect(isActiveTrainingState('SESSION_ACTIVE')).toBe(true);
    expect(isActiveTrainingState('SHOT_REVIEW')).toBe(true);
    expect(isActiveTrainingState('SESSION_ENDING')).toBe(true);
    expect(isActiveTrainingState('SESSION_SUMMARY')).toBe(false);
  });
});

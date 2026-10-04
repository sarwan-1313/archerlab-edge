import type { AppIconName } from '../components/AppIcon';
import type { GuideDetailPageKey, PageKey } from '../types';

export type GuideCategory = 'Prepare' | 'Train' | 'Review';

export type GuideProcedureStep = {
  title: string;
  description: string;
};

export type GuideTroubleshootingItem = {
  issue: string;
  solution: string;
};

export type GuideManualStep = {
  page: GuideDetailPageKey;
  slug: string;
  number: number;
  category: GuideCategory;
  title: string;
  overview: string;
  purpose: string;
  introduction: string;
  procedure: GuideProcedureStep[];
  expectedResult: string;
  tips: string[];
  troubleshooting: GuideTroubleshootingItem[];
  context?: {
    title: string;
    items: string[];
  };
  notice?: {
    tone: 'info' | 'warning';
    title: string;
    body: string;
  };
  productAction?: {
    label: string;
    page: Extract<PageKey, 'live-analysis' | 'saved-recordings' | 'dashboard'>;
  };
};

export const guideManualSteps: readonly GuideManualStep[] = [
  {
    page: 'guide-start-analysis',
    slug: 'start-analysis',
    number: 1,
    category: 'Prepare',
    title: 'Start Analysis',
    overview: 'Open the guided workflow from Home or any Start Analysis action.',
    purpose: 'Begin a guided ArcherLab Edge training workflow.',
    introduction: 'Start Analysis opens the guided training workflow. It takes you to Camera Setup before any training session is recorded.',
    procedure: [
      { title: 'Open ArcherLab Edge', description: 'Begin from the Home screen.' },
      { title: 'Select Start Analysis', description: 'Use the primary Start Analysis action to open the guided workflow.' },
      { title: 'Continue to Camera Setup', description: 'ArcherLab Edge opens camera preparation before readiness checks and session recording.' },
    ],
    expectedResult: 'The Camera Setup screen opens and begins preparing the local camera workflow.',
    tips: [
      'Connect the camera before starting.',
      'Use a current browser with camera and local-storage support.',
    ],
    troubleshooting: [
      { issue: 'Start Analysis does not open the workflow', solution: 'Return to Home and try again. If it still does not open, refresh ArcherLab Edge and select Start Analysis once more.' },
    ],
    productAction: { label: 'Start Analysis', page: 'live-analysis' },
  },
  {
    page: 'guide-camera-setup',
    slug: 'camera-setup',
    number: 2,
    category: 'Prepare',
    title: 'Set Up Camera',
    overview: "Allow camera access, choose the view, and keep the archer's shooting posture visible.",
    purpose: 'Position the camera so ArcherLab Edge can clearly observe the shooting form.',
    introduction: 'Camera Setup combines the live preview, camera-angle choice, framing guidance, and local-processing status in one preparation screen.',
    procedure: [
      { title: 'Allow camera permission', description: 'When the browser requests access, allow ArcherLab Edge to use the camera.' },
      { title: 'Position the camera', description: 'Place the device on a stable surface where the athlete can remain in view.' },
      { title: 'Keep the athlete visible', description: 'Keep the head, torso, arms, hips, knees, and ankles inside the frame so the full shooting stance can be checked.' },
      { title: 'Check lighting', description: 'Use even lighting and avoid a strong light source directly behind the athlete.' },
      { title: 'Confirm the preview', description: 'Review the live preview and the selected camera angle before continuing.' },
    ],
    expectedResult: 'A live preview is visible and ArcherLab Edge can begin checking athlete and landmark visibility.',
    tips: [
      'Use a fixed camera position and avoid moving it after setup.',
      'Move farther away if the shooting arm leaves the frame.',
      'Side view is useful when you want to review bow-arm and release movement.',
    ],
    troubleshooting: [
      { issue: 'Camera does not appear', solution: 'Check browser camera permission and make sure another application is not using the camera, then use Try Camera Again.' },
      { issue: 'The athlete is partly outside the frame', solution: 'Move the camera farther away or adjust its angle until the required shooting posture is visible.' },
    ],
    productAction: { label: 'Open Live Analysis', page: 'live-analysis' },
  },
  {
    page: 'guide-readiness',
    slug: 'readiness',
    number: 3,
    category: 'Prepare',
    title: 'Confirm Readiness',
    overview: 'Check that the camera, pose detection, and analysis engine are ready.',
    purpose: 'Verify the required training systems before starting the session.',
    introduction: 'Readiness prevents session recording from starting until the camera feed, athlete visibility, and on-device analysis engine are usable.',
    context: { title: 'Readiness checks', items: ['Camera', 'Pose Detection', 'Analysis Engine'] },
    procedure: [
      { title: 'Check camera status', description: 'Confirm that the selected camera is active and supplying a local preview.' },
      { title: 'Check pose detection', description: 'Keep the athlete in the prepared position until ArcherLab Edge reports that the shooting posture is visible.' },
      { title: 'Check analysis status', description: 'Wait for the on-device analysis engine to report that it is ready.' },
      { title: 'Continue', description: 'Continue only after all required readiness items are satisfied.' },
    ],
    expectedResult: 'The readiness screen shows the required systems as ready and enables Continue.',
    tips: [
      'Hold the setup position briefly while the readiness checks settle.',
      'Resolve the item marked Needs Attention before trying to continue.',
    ],
    troubleshooting: [
      { issue: 'Pose is not detected', solution: 'Keep the athlete fully visible, improve the lighting, and reposition the camera if necessary.' },
      { issue: 'Readiness does not complete', solution: 'Review the status that needs attention, correct its guidance, and use the available retry action.' },
    ],
  },
  {
    page: 'guide-start-session',
    slug: 'start-session',
    number: 4,
    category: 'Prepare',
    title: 'Start Session',
    overview: 'Begin recording after the readiness screen confirms the setup is usable.',
    purpose: 'Begin a new training session after setup is ready.',
    introduction: 'The Ready to Begin screen is the final checkpoint before local recording, telemetry capture, and the active shot workflow begin.',
    procedure: [
      { title: 'Review readiness', description: 'Confirm the camera, handedness, selected view, and on-device status shown on the ready screen.' },
      { title: 'Select Start Session', description: 'Use Start Session when you are positioned and ready to train.' },
      { title: 'Confirm Session Active', description: 'Look for the Session Active status in Live Analysis before performing recorded shots.' },
    ],
    expectedResult: 'Live Analysis enters its active training state and shows session controls and shot-cycle status.',
    tips: [
      'Start the session before beginning the first shot you want recorded.',
      'Avoid changing camera position after the session starts.',
    ],
    troubleshooting: [
      { issue: 'Start Session is unavailable', solution: 'Return to the readiness checks and correct any camera, pose, or analysis item that is no longer ready.' },
      { issue: 'The session cannot start recording', solution: 'Read the error shown on the Ready to Begin screen, verify browser media support, and try again.' },
    ],
  },
  {
    page: 'guide-perform-shots',
    slug: 'perform-shots',
    number: 5,
    category: 'Train',
    title: 'Perform Shots',
    overview: 'Shoot naturally while Live Analysis follows the configured shot workflow.',
    purpose: 'Perform normal shooting movements while ArcherLab Edge observes the active workflow.',
    introduction: 'During an active session, Live Analysis shows athlete visibility, the current shot phase, session totals, and the controls supported by the selected capture mode.',
    procedure: [
      { title: 'Stay inside the camera frame', description: 'Maintain the position established during Camera Setup.' },
      { title: 'Perform the shot naturally', description: 'Follow your normal shooting sequence without changing the camera setup.' },
      { title: 'Watch shot status', description: 'Wait until the visible release-capture status reports Ready for release.' },
      { title: 'Mark or confirm the release', description: 'Use Mark release for the default manual workflow. If experimental detection is enabled, review the Likely release detected candidate and choose Confirm release or Ignore.' },
      { title: 'Wait for shot completion', description: 'Allow Capturing follow-through to finish before reviewing or recording the result.' },
    ],
    expectedResult: 'A completed capture opens the existing Shot Recorded review for that shot.',
    tips: [
      'Pause and restore visibility if the athlete-detection warning appears.',
      'Use the capture control shown by your configured workflow; do not rush into the next shot while review is open.',
    ],
    troubleshooting: [
      { issue: 'Athlete detection is lost', solution: 'Return to the prepared position, restore full visibility, and wait for detection before continuing.' },
      { issue: 'A shot is not completed', solution: 'Check the on-screen shot status and use the available release control when the session is configured for manual capture.' },
    ],
    notice: { tone: 'info', title: 'Stay with the visible workflow', body: 'ArcherLab Edge reports the current shot state in the interface. You do not need to interpret its internal detection logic.' },
  },
  {
    page: 'guide-record-scores',
    slug: 'record-scores',
    number: 6,
    category: 'Train',
    title: 'Record Scores',
    overview: 'Confirm gesture scoring or use the manual score controls after a shot is recorded.',
    purpose: 'Associate a completed shot with the athlete-reported score.',
    introduction: 'Scoring is shown after shot capture when the session is configured for manual or gesture-assisted score entry.',
    context: { title: 'Available methods', items: ['Manual score entry', 'Gesture scoring when enabled for the session'] },
    procedure: [
      { title: 'Complete the shot', description: 'Wait until ArcherLab Edge records the current shot and opens its review.' },
      { title: 'Enter or confirm the score', description: 'Use the score controls currently shown for the configured entry method.' },
      { title: 'Verify the score', description: 'Check the Recorded as result before continuing the session.' },
    ],
    expectedResult: 'The reported score is associated with the current captured shot and appears in its review.',
    tips: [
      'Check X and miss selections carefully before confirming.',
      'If gesture entry is inconvenient, use the manual option exposed by the score overlay.',
    ],
    troubleshooting: [
      { issue: 'The score was entered incorrectly', solution: 'Use Edit Score in the current shot review, select the correct value, and confirm it. Biomechanics Replay also provides Undo Score before a result is added again.' },
      { issue: 'Gesture entry does not settle on the intended score', solution: 'Use the Manual Entry action offered by the gesture score overlay.' },
    ],
  },
  {
    page: 'guide-review-shots',
    slug: 'review-shots',
    number: 7,
    category: 'Train',
    title: 'Review Shots',
    overview: 'Inspect the captured score, data quality, and available biomechanics before continuing.',
    purpose: 'Review available shot data during or after a session.',
    introduction: 'The compact Shot Recorded review opens automatically after capture. Completed-session and Analytics views provide additional ways to select an earlier shot and inspect its stored information.',
    context: { title: 'Review information when available', items: ['Athlete-reported score', 'Data quality', 'Hold stability', 'Alignment change', 'Follow-through', 'Shot phases and tracking details'] },
    procedure: [
      { title: 'Let capture complete', description: 'Wait for the current Shot Recorded panel to open automatically.' },
      { title: 'Review the score', description: 'Check the athlete-reported result, if one was entered.' },
      { title: 'Review available metrics', description: 'Inspect data quality, hold stability, alignment change, and follow-through values that were captured.' },
      { title: 'Open review details', description: 'Use Review Details to see shot phases, pose confidence, usable frames, and tracking loss.' },
      { title: 'Continue training', description: 'Use Continue Session when the active-session review is complete.' },
    ],
    expectedResult: 'The selected shot remains clearly identified while its available score, quality, and captured metrics are shown.',
    tips: [
      'Treat unavailable values as unavailable rather than estimating them.',
      'Use the detailed replay view for release timing and before/after comparisons.' ,
    ],
    troubleshooting: [
      { issue: 'A metric is unavailable', solution: 'Review the shot data-quality label. Tracking loss or incomplete visibility can make individual values unavailable.' },
      { issue: 'No shot can be selected', solution: 'Complete at least one shot capture first, then open its review or the completed-session summary.' },
    ],
  },
  {
    page: 'guide-end-session',
    slug: 'end-session',
    number: 8,
    category: 'Train',
    title: 'End Session',
    overview: 'Finish training and let the current recording finalize before leaving.',
    purpose: 'Finish the active training session through the existing save workflow.',
    introduction: 'End Session stops active capture, finalizes the local recording, and prepares the session summary.',
    procedure: [
      { title: 'Finish the final shot', description: 'Make sure the current shot review or capture workflow is complete.' },
      { title: 'Select End Session', description: 'Use the dedicated End Session action in Live Analysis.' },
      { title: 'Confirm the action', description: 'In the End Training Session confirmation, choose End Session when you are ready to finish.' },
      { title: 'Wait for finalization', description: 'Keep ArcherLab Edge open while the local recording and session workflow finish.' },
    ],
    expectedResult: 'ArcherLab Edge opens Session Complete with the captured session information.',
    tips: [
      'Review the shot count before confirming the end of the session.',
      'Use Continue Session in the confirmation dialog if you opened it by mistake.',
    ],
    troubleshooting: [
      { issue: 'The session reports a save problem', solution: 'Read the warning on Session Complete. Captured shots remain available in that summary even if recording finalization was not completed.' },
    ],
    notice: { tone: 'warning', title: 'Allow finalization to finish', body: 'Do not close or refresh the application while the interface is actively finalizing the current session.' },
  },
  {
    page: 'guide-session-summary',
    slug: 'session-summary',
    number: 9,
    category: 'Review',
    title: 'Review Session Summary',
    overview: 'Inspect shot count, duration, scores, data quality, and captured metrics.',
    purpose: 'Review the information captured during the completed training session.',
    introduction: 'Session Complete summarizes the current finished session and lets you select individual shots without changing their stored results.',
    context: { title: 'Information shown when present', items: ['Shot count', 'Session duration', 'Athlete-reported scores', 'Data quality', 'Captured biomechanics metrics'] },
    procedure: [
      { title: 'Review the session overview', description: 'Start with the captured shot count, score summary, duration, and save status that are available.' },
      { title: 'Inspect individual shots', description: 'Select a shot from the timeline to make its stored details current.' },
      { title: 'Review available metrics', description: 'Read the captured hold stability, release alignment, score, time, and data quality shown for that shot.' },
    ],
    expectedResult: 'The summary reflects the completed session and updates the selected-shot detail without leaving the page.',
    tips: [
      'Use the data-quality label when deciding whether to compare a captured value.',
      'Open View Full Session only when the recording was saved successfully.',
    ],
    troubleshooting: [
      { issue: 'A score is missing', solution: 'The summary shows Not entered for a shot that did not receive an athlete-reported result.' },
      { issue: 'View Full Session is not shown', solution: 'The recording save needs attention; use the summary that remains on screen and read its save warning.' },
    ],
    productAction: { label: 'View Sessions', page: 'saved-recordings' },
  },
  {
    page: 'guide-analytics',
    slug: 'analytics',
    number: 10,
    category: 'Review',
    title: 'View Analytics',
    overview: 'Inspect the current captured shots, consistency summaries, and descriptive comparisons.',
    purpose: 'Review performance information calculated from the captured shots currently available to ArcherLab Edge.',
    introduction: 'Analytics summarizes captured shot quality, scores, movement consistency, and descriptive score comparisons. Saved video sessions are reviewed separately in Sessions.',
    context: { title: 'Analytics surfaces', items: ['Session overview metrics', 'Score summary', 'Captured shot history', 'Cross-shot variability', 'Descriptive biomechanics and score comparison'] },
    procedure: [
      { title: 'Open Analytics', description: 'Select Analytics from navigation or from the completed-session workflow.' },
      { title: 'Review summary information', description: 'Inspect the captured-shot, score-coverage, and average movement values that have enough valid data.' },
      { title: 'Review comparisons', description: 'Use cross-shot variability and descriptive score groups when ArcherLab Edge reports that enough data is available.' },
      { title: 'Open Sessions when needed', description: 'Use Sessions to replay a specific saved local recording and its synchronized telemetry.' },
    ],
    expectedResult: 'Analytics shows only the summaries supported by the currently available valid captures and clearly marks missing data.',
    tips: [
      'Collect at least two valid shots before expecting cross-shot averages.',
      'Treat score-group comparisons as descriptive, not predictive or causal.',
    ],
    troubleshooting: [
      { issue: 'Analytics shows no performance data', solution: 'Start Live Analysis and capture shots. Analytics cannot calculate a session overview without captured shot data.' },
      { issue: 'A comparison says More data needed', solution: 'Capture and score more valid shots so each required comparison group has enough usable values.' },
    ],
    notice: { tone: 'info', title: 'Descriptive analysis only', body: 'Analytics does not predict results or provide automated coaching. It summarizes the data currently captured by the application.' },
    productAction: { label: 'Open Analytics', page: 'dashboard' },
  },
] as const;

export const guideCategoryMetadata: Readonly<Record<GuideCategory, { order: number; title: string; icon: AppIconName }>> = {
  Prepare: { order: 1, title: 'Open a guided training session', icon: 'camera' },
  Train: { order: 2, title: 'Capture and score each shot', icon: 'sensors' },
  Review: { order: 3, title: 'Review the completed work', icon: 'grid' },
};

const guideStepByPage = new Map<GuideDetailPageKey, GuideManualStep>(
  guideManualSteps.map((step) => [step.page, step]),
);

export function guideStepForPage(page: PageKey): GuideManualStep | undefined {
  return guideStepByPage.get(page as GuideDetailPageKey);
}

export function isGuideDetailPage(page: PageKey): page is GuideDetailPageKey {
  return guideStepByPage.has(page as GuideDetailPageKey);
}

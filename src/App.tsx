import { lazy, useCallback, useEffect, useRef, useState } from 'react';
import { AppIcon } from './components/AppIcon';
import { BottomNav } from './components/BottomNav';
import { OnboardingModal } from './components/OnboardingModal';
import { PageTransition } from './components/PageTransition';
import { PrivacyBadge } from './components/PrivacyBadge';
import { RouteLoadingBoundary } from './components/RouteLoadingBoundary';
import { SidebarNav } from './components/SidebarNav';
import { desktopNavItems, mobileNavItems } from './data/mockData';
import { guideStepForPage, isGuideDetailPage } from './data/userGuide';
import { attachReportedResult, clearReportedResult } from './gesture-entry/shotAssociation';
import { HomePage } from './pages/HomePage';
import { LiveAnalysisPage } from './pages/LiveAnalysisPage';
import { runPresentationTransition } from './motion/runPresentationTransition';
import { pageForPathname, resolvePageFromPathname, routeForPage } from './navigation/routes';
import { useAthleteProfile } from './hooks/useAthleteProfile';

const CalibrationPage = lazy(() => import('./pages/CalibrationPage').then((module) => ({ default: module.CalibrationPage })));
const GestureGuidePage = lazy(() => import('./pages/GestureGuidePage').then((module) => ({ default: module.GestureGuidePage })));
const GuideDetailPage = lazy(() => import('./pages/GuideDetailPage').then((module) => ({ default: module.GuideDetailPage })));
const ManualShotEntryPage = lazy(() => import('./pages/ManualShotEntryPage').then((module) => ({ default: module.ManualShotEntryPage })));
const MultiCameraPage = lazy(() => import('./pages/MultiCameraPage').then((module) => ({ default: module.MultiCameraPage })));
const NewSessionPage = lazy(() => import('./pages/NewSessionPage').then((module) => ({ default: module.NewSessionPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((module) => ({ default: module.ProfilePage })));
const ReplayAnalysisPage = lazy(() => import('./pages/ReplayAnalysisPage').then((module) => ({ default: module.ReplayAnalysisPage })));
const SavedRecordingsPage = lazy(() => import('./pages/SavedRecordingsPage').then((module) => ({ default: module.SavedRecordingsPage })));
const SessionDashboardPage = lazy(() => import('./pages/SessionDashboardPage').then((module) => ({ default: module.SessionDashboardPage })));
const UserGuidePage = lazy(() => import('./pages/UserGuidePage').then((module) => ({ default: module.UserGuidePage })));
import type { PageKey, SessionConfiguration } from './types';
import type { BiomechanicsReference, CameraView } from './types/biomechanics';
import type { ReportedShotResult } from './types/gestureScore';
import type { ShotAnalysis } from './types/shotAnalysis';

const ONBOARDING_KEY = 'archerlab-edge:onboarding-complete';
const TRAINING_STAGE_KEY = 'archerlab-edge:training-stage';
const ACTIVE_SESSION_KEY = 'archerlab-edge:live-session-active';
const SESSION_SHOTS_KEY = 'archerlab-edge:session-shots';

const ROUTE_LOADING_STATUS = {
  home: 'Loading Home...',
  'new-session': 'Preparing your session...',
  calibration: 'Loading calibration...',
  'live-analysis': 'Preparing Live Analysis...',
  'manual-shot-entry': 'Opening shot entry...',
  'replay-analysis': 'Loading replay...',
  dashboard: 'Loading analytics...',
  'multi-camera': 'Loading multi-camera view...',
  'gesture-guide': 'Loading gesture guide...',
  'user-guide': 'Loading guide...',
  'guide-start-analysis': 'Loading Start Analysis guide...',
  'guide-camera-setup': 'Loading Camera Setup guide...',
  'guide-readiness': 'Loading Readiness guide...',
  'guide-start-session': 'Loading Start Session guide...',
  'guide-perform-shots': 'Loading Perform Shots guide...',
  'guide-record-scores': 'Loading Record Scores guide...',
  'guide-review-shots': 'Loading Review Shots guide...',
  'guide-end-session': 'Loading End Session guide...',
  'guide-session-summary': 'Loading Session Summary guide...',
  'guide-analytics': 'Loading Analytics guide...',
  'saved-recordings': 'Loading sessions...',
  profile: 'Loading profile...',
} as const satisfies Record<PageKey, string>;

function primaryPageFor(page: PageKey): PageKey {
  if (page === 'new-session' || page === 'calibration' || page === 'multi-camera') return 'live-analysis';
  if (page === 'manual-shot-entry' || page === 'replay-analysis') return 'dashboard';
  if (page === 'gesture-guide' || isGuideDetailPage(page)) return 'user-guide';
  return page;
}

function getInitialPage(): PageKey {
  return pageForPathname(window.location.pathname);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasObjectFields(value: Record<string, unknown>, fields: string[]): boolean {
  return fields.every((field) => isRecord(value[field]));
}

function isValidShotAnalysis(value: unknown): value is ShotAnalysis {
  if (!isRecord(value)
    || typeof value.id !== 'string'
    || typeof value.capturedAt !== 'number'
    || typeof value.releaseTimestampMs !== 'number'
    || (value.handedness !== 'left' && value.handedness !== 'right')
    || (value.releaseSource !== 'manual' && value.releaseSource !== 'automatic-candidate-confirmed')
    || !Array.isArray(value.frames)
    || !Array.isArray(value.preReleaseFrames)
    || !Array.isArray(value.postReleaseFrames)
    || !Array.isArray(value.phases)
    || !isRecord(value.releaseMetrics)
    || !isRecord(value.summary)
    || !isRecord(value.dataQuality)) return false;
  const summaryFields = [
    'holdShoulderVariationDeg', 'holdBowArmVariationDeg', 'holdTorsoVariationDeg',
    'headMotionBeforeRelease', 'bowHandMotionBeforeRelease', 'releaseShoulderDeltaDeg',
    'releaseBowArmDeltaDeg', 'releaseHeadDisplacement', 'releaseBowHandDisplacement',
    'followThroughShoulderVariationDeg',
  ];
  const releaseFields = [
    'shoulder', 'bowArm', 'torso', 'headDisplacement', 'bowHandDisplacement',
    'followThroughShoulderVariation', 'followThroughTorsoVariation',
    'followThroughHeadMotion', 'followThroughBowHandMotion',
  ];
  return hasObjectFields(value.summary, summaryFields) && hasObjectFields(value.releaseMetrics, releaseFields)
    && typeof value.dataQuality.label === 'string'
    && typeof value.dataQuality.usableFrameRatio === 'number'
    && typeof value.dataQuality.averagePoseConfidence === 'number';
}

function readPersistedShots(): ShotAnalysis[] {
  try {
    const raw = sessionStorage.getItem(SESSION_SHOTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isValidShotAnalysis) : [];
  } catch {
    return [];
  }
}

function clearTrainingPersistence(clearShots = false) {
  try {
    sessionStorage.removeItem(TRAINING_STAGE_KEY);
    sessionStorage.removeItem(ACTIVE_SESSION_KEY);
    if (clearShots) sessionStorage.removeItem(SESSION_SHOTS_KEY);
  } catch { /* Session storage can be unavailable in private contexts. */ }
}

type GuardedExit = {
  id: number;
  target: PageKey;
  mode: 'push' | 'pop';
  targetIndex?: number;
};
type RouteHistoryState = {
  archerLabPage: PageKey;
  archerLabIndex: number;
};

function historyIndexFrom(state: unknown): number | undefined {
  if (!state || typeof state !== 'object') return undefined;
  const index = (state as Partial<RouteHistoryState>).archerLabIndex;
  return typeof index === 'number' && Number.isInteger(index) && index >= 0 ? index : undefined;
}

function routeHistoryState(page: PageKey, index: number): RouteHistoryState {
  return { archerLabPage: page, archerLabIndex: index };
}

function readReplayShotId(): string | undefined {
  const value = new URLSearchParams(window.location.search).get('shot');
  return value || undefined;
}

function isHandedness(value: unknown): value is SessionConfiguration['handedness'] {
  return value === 'left' || value === 'right';
}

function isCameraView(value: unknown): value is SessionConfiguration['cameraView'] {
  return value === 'side' || value === 'front' || value === 'rear';
}

function App() {
  const initialPageRef = useRef<PageKey>(getInitialPage());
  const [activePage, setActivePage] = useState<PageKey>(initialPageRef.current);
  const [canGoBack, setCanGoBack] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try { return localStorage.getItem(ONBOARDING_KEY) !== 'true'; } catch { return true; }
  });
  const [sessionConfiguration, setSessionConfiguration] = useState<SessionConfiguration>({ handedness: 'right', cameraView: 'side', scoreEntryMethod: 'gesture-manual', shotCaptureMethod: 'manual' });
  const [profileDefaults, setProfileDefaults] = useState<Partial<Pick<SessionConfiguration, 'handedness' | 'cameraView'>>>({});
  const [reference, setReference] = useState<BiomechanicsReference>();
  const [shots, setShots] = useState<ShotAnalysis[]>(readPersistedShots);
  const [selectedShotId, setSelectedShotId] = useState<string | undefined>(readReplayShotId);
  const [trainingFlowKey, setTrainingFlowKey] = useState(0);
  const [sessionActive, setSessionActive] = useState(false);
  const [guardedExit, setGuardedExit] = useState<GuardedExit>();
  const [routeRevision, setRouteRevision] = useState(0);
  const { profile } = useAthleteProfile();
  // Track accepted navigation synchronously, before a native transition renders it.
  const navigationPageRef = useRef(initialPageRef.current);
  const navigationRevisionRef = useRef(0);
  const routeIndexRef = useRef(0);
  const restoringPopRef = useRef(false);
  const navigationRequestSequenceRef = useRef(0);
  const selectedShot = shots.find((shot) => shot.id === selectedShotId) ?? shots.at(-1);
  const activeGuideStep = guideStepForPage(activePage);

  const commitNavigation = useCallback((
    page: PageKey,
    { mode = 'push', targetIndex, shotId }: { mode?: 'push' | 'pop'; targetIndex?: number; shotId?: string } = {},
  ) => {
    const previousPage = navigationPageRef.current;
    if (mode === 'push' && page === previousPage) return;
    const nextIndex = mode === 'push'
      ? routeIndexRef.current + 1
      : targetIndex ?? routeIndexRef.current;

    if (mode === 'push') {
      // Keep the address bar authoritative before presentation work begins.
      window.history.pushState(routeHistoryState(page, nextIndex), '', routeForPage(page, { shotId }));
    }

    routeIndexRef.current = nextIndex;
    setCanGoBack(nextIndex > 0);
    if (page === previousPage) return;
    navigationPageRef.current = page;
    const revision = ++navigationRevisionRef.current;

    if (activePage === 'live-analysis') clearTrainingPersistence();
    runPresentationTransition(
      () => {
        // A delayed presentation callback must not undo newer navigation.
        if (revision !== navigationRevisionRef.current) return;
        setActivePage(page);
        if (page === 'home') window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      },
      { cameraSafe: activePage === 'live-analysis' || page === 'live-analysis', kind: 'page' },
    );
  }, [activePage]);

  useEffect(() => {
    const initialPage = initialPageRef.current;
    const initialIndex = historyIndexFrom(window.history.state) ?? 0;
    routeIndexRef.current = initialIndex;
    setCanGoBack(initialIndex > 0);
    window.history.replaceState(
      routeHistoryState(initialPage, initialIndex),
      '',
      routeForPage(initialPage, { shotId: readReplayShotId() }),
    );
  }, []);

  useEffect(() => {
    const resolvedPage = resolvePageFromPathname(window.location.pathname);
    if (resolvedPage !== undefined || activePage !== 'home') return;
    window.history.replaceState(
      routeHistoryState('home', routeIndexRef.current),
      '',
      routeForPage('home'),
    );
  }, [activePage, routeRevision]);

  useEffect(() => {
    setProfileDefaults({
      handedness: isHandedness(profile?.handedness) ? profile.handedness : undefined,
      cameraView: isCameraView(profile?.defaultCameraAngle) ? profile.defaultCameraAngle : undefined,
    });
  }, [profile]);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const target = resolvePageFromPathname(window.location.pathname) ?? 'home';
      setSelectedShotId(readReplayShotId());
      const targetIndex = historyIndexFrom(event.state)
        ?? Math.max(0, routeIndexRef.current - 1);
      setRouteRevision((revision) => revision + 1);

      if (restoringPopRef.current) {
        restoringPopRef.current = false;
        commitNavigation(target, { mode: 'pop', targetIndex });
        return;
      }

      if (target === navigationPageRef.current) {
        routeIndexRef.current = targetIndex;
        setCanGoBack(targetIndex > 0);
        return;
      }

      if (sessionActive) {
        const confirmed = window.confirm('End Training Session?\n\nYour completed shots will be saved before leaving Live Analysis.');
        if (!confirmed) {
          const restoreDelta = routeIndexRef.current - targetIndex;
          if (restoreDelta) {
            restoringPopRef.current = true;
            window.history.go(restoreDelta);
          } else {
            restoringPopRef.current = true;
            window.history.forward();
          }
          return;
        }
        navigationRequestSequenceRef.current += 1;
        setGuardedExit({
          id: navigationRequestSequenceRef.current,
          target,
          mode: 'pop',
          targetIndex,
        });
        return;
      }

      commitNavigation(target, { mode: 'pop', targetIndex });
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activePage, commitNavigation, sessionActive]);

  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_SHOTS_KEY, JSON.stringify(shots));
    } catch {
      // Session storage can be full; the in-memory session remains usable.
    }
  }, [activePage, shots]);

  const requestNavigation = useCallback((page: PageKey) => {
    if (page === navigationPageRef.current) return;
    if (sessionActive) {
      const confirmed = window.confirm('End Training Session?\n\nYour completed shots will be saved before leaving Live Analysis.');
      if (!confirmed) return;
      navigationRequestSequenceRef.current += 1;
      setGuardedExit({ id: navigationRequestSequenceRef.current, target: page, mode: 'push' });
      return;
    }
    commitNavigation(page);
  }, [commitNavigation, sessionActive]);

  const goBack = () => {
    if (routeIndexRef.current > 0) {
      window.history.back();
      return;
    }
    requestNavigation('home');
  };

  const beginTraining = (configuration?: SessionConfiguration, options?: { preserveReference?: boolean }) => {
    // Ignore a second Start click while the first request is still leaving Home.
    if (navigationPageRef.current === 'live-analysis' && activePage !== 'live-analysis') return;
    const nextConfiguration = configuration ?? {
        ...sessionConfiguration,
        handedness: profileDefaults.handedness ?? sessionConfiguration.handedness,
        cameraView: profileDefaults.cameraView ?? sessionConfiguration.cameraView,
      };
    setSessionConfiguration(nextConfiguration);
    if (!options?.preserveReference) setReference(undefined);
    setShots([]);
    setSelectedShotId(undefined);
    clearTrainingPersistence(true);
    setTrainingFlowKey((value) => value + 1);
    commitNavigation('live-analysis');
  };

  const closeOnboarding = useCallback(() => {
    try { localStorage.setItem(ONBOARDING_KEY, 'true'); } catch { /* Storage can be unavailable in private contexts. */ }
    setShowOnboarding(false);
  }, []);
  const openOnboarding = () => runPresentationTransition(() => setShowOnboarding(true), { kind: 'modal' });
  const startFromOnboarding = () => { closeOnboarding(); beginTraining(); };
  const addShot = (shot: ShotAnalysis) => { setShots((current) => [...current, shot]); setSelectedShotId(shot.id); };
  const attachResult = (shotId: string, result: ReportedShotResult) => setShots((current) => attachReportedResult(current, shotId, result));
  const clearResult = (shotId: string) => setShots((current) => clearReportedResult(current, shotId));

  const completeGuardedExit = useCallback(() => {
    if (!guardedExit) return;
    const { target, mode, targetIndex } = guardedExit;
    setGuardedExit(undefined);
    setSessionActive(false);
    clearTrainingPersistence();
    if (mode === 'pop') {
      const nextIndex = targetIndex ?? routeIndexRef.current;
      window.history.replaceState(routeHistoryState(target, nextIndex), '', routeForPage(target, { shotId: readReplayShotId() }));
      commitNavigation(target, { mode: 'pop', targetIndex: nextIndex });
      return;
    }
    commitNavigation(target);
  }, [commitNavigation, guardedExit]);

  const currentPage = (() => {
    switch (activePage) {
      case 'home': return <HomePage onStart={() => beginTraining()} onGuide={() => requestNavigation('user-guide')} onProfile={() => requestNavigation('profile')} hasProfile={Boolean(profile)} hasTrainingHistory={shots.length > 0} />;
      case 'new-session': return <NewSessionPage initialConfiguration={sessionConfiguration} onGestureGuide={() => requestNavigation('gesture-guide')} onStart={beginTraining} />;
      case 'calibration': return <CalibrationPage handedness={sessionConfiguration.handedness} reference={reference} onReferenceChange={setReference} onComplete={() => beginTraining(sessionConfiguration, { preserveReference: true })} />;
      case 'live-analysis': return <LiveAnalysisPage key={trainingFlowKey} handedness={sessionConfiguration.handedness} cameraView={sessionConfiguration.cameraView} scoreEntryMethod={sessionConfiguration.scoreEntryMethod} autoReleaseDefault={sessionConfiguration.shotCaptureMethod === 'experimental-auto-confirm'} shots={shots} onShotCaptured={addShot} onAttachResult={attachResult} onUndoLastShot={() => setShots((current) => current.slice(0, -1))} onGestureGuide={() => requestNavigation('user-guide')} onCameraViewChange={(cameraView: CameraView) => setSessionConfiguration((current) => ({ ...current, cameraView }))} reference={reference} onSessionActiveChange={setSessionActive} navigationEndRequest={guardedExit?.id} onNavigationEndComplete={completeGuardedExit} onViewSessions={() => requestNavigation('saved-recordings')} onViewAnalytics={() => requestNavigation('dashboard')} onStartNewSession={() => beginTraining()} onHome={() => requestNavigation('home')} />;
      case 'manual-shot-entry': return <ManualShotEntryPage shot={selectedShot} onCancel={goBack} onSave={(result) => { if (selectedShot) attachResult(selectedShot.id, result); requestNavigation('replay-analysis'); }} />;
      case 'replay-analysis': return <ReplayAnalysisPage shot={selectedShot} shotNumber={selectedShot ? shots.findIndex((shot) => shot.id === selectedShot.id) + 1 : 0} onManualEntry={() => requestNavigation('manual-shot-entry')} onUndoScore={() => selectedShot && clearResult(selectedShot.id)} />;
      case 'dashboard': return <SessionDashboardPage shots={shots} selectedShotId={selectedShotId} onStart={() => beginTraining()} onSelectShot={(shotId) => { setSelectedShotId(shotId); commitNavigation('replay-analysis', { shotId }); }} />;
      case 'multi-camera': return <MultiCameraPage />;
      case 'gesture-guide': return <GestureGuidePage onBack={goBack} />;
      case 'saved-recordings': return <SavedRecordingsPage onStart={() => beginTraining()} />;
      case 'profile': return <ProfilePage />;
      case 'user-guide': return <UserGuidePage onStart={() => beginTraining()} onHome={() => requestNavigation('home')} onOnboarding={openOnboarding} onOpenStep={requestNavigation} />;
      case 'guide-start-analysis':
      case 'guide-camera-setup':
      case 'guide-readiness':
      case 'guide-start-session':
      case 'guide-perform-shots':
      case 'guide-record-scores':
      case 'guide-review-shots':
      case 'guide-end-session':
      case 'guide-session-summary':
      case 'guide-analytics':
        return activeGuideStep ? <GuideDetailPage step={activeGuideStep} onNavigate={requestNavigation} onProductNavigate={(page) => page === 'live-analysis' ? beginTraining() : requestNavigation(page)} /> : null;
    }
  })();

  const navActive = primaryPageFor(activePage);
  const handleNavSelect = (page: PageKey) => page === 'live-analysis' && activePage !== 'live-analysis' ? beginTraining() : requestNavigation(page);

  return (
    <>
      <div className="app-shell">
        <div className="app-frame">
          <SidebarNav items={desktopNavItems} active={navActive} onSelect={handleNavSelect} />
          <div className="app-content">
            <header className="app-topbar">
              <div className="app-topbar__inner">
                <div className="app-topbar__leading">
                  {canGoBack ? <button type="button" className="app-back" onClick={goBack} aria-label="Go back"><AppIcon name="arrow-left" size={18} /><span>Back</span></button> : null}
                  <button type="button" className="app-brand" onClick={() => requestNavigation('home')} aria-label="Go to Home"><span className="app-brand__mark"><AppIcon name="target" size={18} /></span><span>ArcherLab <strong>Edge</strong></span></button>
                </div>
                <div className="app-topbar__privacy"><PrivacyBadge /></div>
                <button type="button" className="app-topbar__profile" onClick={() => requestNavigation('profile')} aria-label="Open athlete profile"><AppIcon name="sensors" size={18} /></button>
              </div>
            </header>
            <main className={`app-main ${activePage === 'home' ? 'app-main--home' : ''}`}>
              <RouteLoadingBoundary key={activePage} status={ROUTE_LOADING_STATUS[activePage]}>
                <PageTransition cameraSafe={activePage === 'live-analysis'}>{currentPage}</PageTransition>
              </RouteLoadingBoundary>
            </main>
          </div>
        </div>
        <BottomNav items={mobileNavItems} active={navActive} onSelect={handleNavSelect} />
        {showOnboarding ? <OnboardingModal onClose={closeOnboarding} onStart={startFromOnboarding} /> : null}
      </div>
    </>
  );
}

export default App;

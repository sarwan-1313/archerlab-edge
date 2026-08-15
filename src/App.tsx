import { useState } from 'react';
import { AppIcon } from './components/AppIcon';
import { BottomNav } from './components/BottomNav';
import { PrivacyBadge } from './components/PrivacyBadge';
import { SidebarNav } from './components/SidebarNav';
import { desktopNavItems, mobileNavItems } from './data/mockData';
import { HomePage } from './pages/HomePage';
import { NewSessionPage } from './pages/NewSessionPage';
import { CalibrationPage } from './pages/CalibrationPage';
import { LiveAnalysisPage } from './pages/LiveAnalysisPage';
import { ManualShotEntryPage } from './pages/ManualShotEntryPage';
import { ReplayAnalysisPage } from './pages/ReplayAnalysisPage';
import { SessionDashboardPage } from './pages/SessionDashboardPage';
import { MultiCameraPage } from './pages/MultiCameraPage';
import { GestureGuidePage } from './pages/GestureGuidePage';
import { SavedRecordingsPage } from './pages/SavedRecordingsPage';
import { ProfilePage } from './pages/ProfilePage';
import { attachReportedResult, clearReportedResult } from './gesture-entry/shotAssociation';
import type { PageKey, SessionConfiguration } from './types';
import type { BiomechanicsReference, CameraView } from './types/biomechanics';
import type { ReportedShotResult } from './types/gestureScore';
import type { ShotAnalysis } from './types/shotAnalysis';

function App() {
  const [activePage, setActivePage] = useState<PageKey>('home');
  const [sessionConfiguration, setSessionConfiguration] = useState<SessionConfiguration>({ handedness: 'right', cameraView: 'side', scoreEntryMethod: 'gesture-manual', shotCaptureMethod: 'manual' });
  const [reference, setReference] = useState<BiomechanicsReference>();
  const [shots, setShots] = useState<ShotAnalysis[]>([]);
  const [selectedShotId, setSelectedShotId] = useState<string>();
  const selectedShot = shots.find((shot) => shot.id === selectedShotId) ?? shots.at(-1);
  const addShot = (shot: ShotAnalysis) => { setShots((current) => [...current, shot]); setSelectedShotId(shot.id); };
  const attachResult = (shotId: string, result: ReportedShotResult) => setShots((current) => attachReportedResult(current, shotId, result));
  const clearResult = (shotId: string) => setShots((current) => clearReportedResult(current, shotId));

  const currentPage = (() => {
    switch (activePage) {
      case 'home': return <HomePage />;
      case 'new-session': return <NewSessionPage onGestureGuide={() => setActivePage('gesture-guide')} onStart={(configuration) => { setSessionConfiguration(configuration); setReference(undefined); setShots([]); setSelectedShotId(undefined); setActivePage('calibration'); }} />;
      case 'calibration': return <CalibrationPage handedness={sessionConfiguration.handedness} reference={reference} onReferenceChange={setReference} onComplete={() => setActivePage('live-analysis')} />;
      case 'live-analysis': return <LiveAnalysisPage handedness={sessionConfiguration.handedness} cameraView={sessionConfiguration.cameraView} scoreEntryMethod={sessionConfiguration.scoreEntryMethod} autoReleaseDefault={sessionConfiguration.shotCaptureMethod === 'experimental-auto-confirm'} shots={shots} onShotCaptured={addShot} onAttachResult={attachResult} onClearResult={clearResult} onUndoLastShot={() => setShots((current) => current.slice(0, -1))} onGestureGuide={() => setActivePage('gesture-guide')} onManualEntry={(shotId) => { setSelectedShotId(shotId); setActivePage('manual-shot-entry'); }} onReplay={(shotId) => { setSelectedShotId(shotId); setActivePage('replay-analysis'); }} onCameraViewChange={(cameraView: CameraView) => setSessionConfiguration((current) => ({ ...current, cameraView }))} reference={reference} onRecalibrate={() => setActivePage('calibration')} />;
      case 'manual-shot-entry': return <ManualShotEntryPage shot={selectedShot} onCancel={() => setActivePage('replay-analysis')} onSave={(result) => { if (selectedShot) attachResult(selectedShot.id, result); setActivePage('replay-analysis'); }} />;
      case 'replay-analysis': return <ReplayAnalysisPage shot={selectedShot} shotNumber={selectedShot ? shots.findIndex((shot) => shot.id === selectedShot.id) + 1 : 0} onManualEntry={() => setActivePage('manual-shot-entry')} onUndoScore={() => selectedShot && clearResult(selectedShot.id)} />;
      case 'dashboard': return <SessionDashboardPage shots={shots} onSelectShot={(shotId) => { setSelectedShotId(shotId); setActivePage('replay-analysis'); }} />;
      case 'multi-camera': return <MultiCameraPage />;
      case 'gesture-guide': return <GestureGuidePage onBack={() => setActivePage('live-analysis')} />;
    case 'saved-recordings': return <SavedRecordingsPage />;
    case 'profile': return <ProfilePage />;
    }
  })();

  return (
    <div className="app-shell">
      <div className="app-frame">
        <SidebarNav items={desktopNavItems} active={activePage} onSelect={setActivePage} />

        <div className="app-content">
          <header className="app-topbar">
            <div className="app-topbar__inner">
              <div className="app-brand">
                <AppIcon name="devices" size={20} className="text-primary" />
                <span className="font-headline-sm text-headline-sm-mobile text-primary-fixed-dim tracking-tight md:text-headline-sm">
                  ArcherLab Edge
                </span>
              </div>
              <div className="app-topbar__privacy">
                <PrivacyBadge />
              </div>
              <button type="button" className="app-topbar__profile" aria-label="Open profile">
                <AppIcon name="sensors" size={18} />
              </button>
            </div>
          </header>

          <main className="app-main">{currentPage}</main>
        </div>
      </div>

      <BottomNav items={mobileNavItems} active={activePage} onSelect={setActivePage} />
    </div>
  );
}

export default App;

import { useMemo, useState } from 'react';
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
import type { PageKey, SessionConfiguration } from './types';
import type { BiomechanicsReference, CameraView } from './types/biomechanics';

function App() {
  const [activePage, setActivePage] = useState<PageKey>('home');
  const [sessionConfiguration, setSessionConfiguration] = useState<SessionConfiguration>({ handedness: 'right', cameraView: 'side' });
  const [reference, setReference] = useState<BiomechanicsReference>();

  const currentPage = useMemo(() => {
    switch (activePage) {
      case 'home': return <HomePage />;
      case 'new-session': return <NewSessionPage onStart={(configuration) => { setSessionConfiguration(configuration); setReference(undefined); setActivePage('calibration'); }} />;
      case 'calibration': return <CalibrationPage handedness={sessionConfiguration.handedness} reference={reference} onReferenceChange={setReference} onComplete={() => setActivePage('live-analysis')} />;
      case 'live-analysis': return <LiveAnalysisPage handedness={sessionConfiguration.handedness} cameraView={sessionConfiguration.cameraView} onCameraViewChange={(cameraView: CameraView) => setSessionConfiguration((current) => ({ ...current, cameraView }))} reference={reference} onRecalibrate={() => setActivePage('calibration')} />;
      case 'manual-shot-entry': return <ManualShotEntryPage />;
      case 'replay-analysis': return <ReplayAnalysisPage />;
      case 'dashboard': return <SessionDashboardPage />;
      case 'multi-camera': return <MultiCameraPage />;
    }
  }, [activePage, reference, sessionConfiguration]);

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

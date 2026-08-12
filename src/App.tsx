import { useMemo, useState, type ReactNode } from 'react';
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
import type { PageKey } from './types';

const pageMap: Record<PageKey, (navigate: (page: PageKey) => void) => ReactNode> = {
  home: () => <HomePage />,
  'new-session': (navigate) => <NewSessionPage onStart={() => navigate('calibration')} />,
  calibration: (navigate) => <CalibrationPage onComplete={() => navigate('live-analysis')} />,
  'live-analysis': (navigate) => <LiveAnalysisPage onRecalibrate={() => navigate('calibration')} />,
  'manual-shot-entry': () => <ManualShotEntryPage />,
  'replay-analysis': () => <ReplayAnalysisPage />,
  dashboard: () => <SessionDashboardPage />,
  'multi-camera': () => <MultiCameraPage />,
};

function App() {
  const [activePage, setActivePage] = useState<PageKey>('home');

  const currentPage = useMemo(() => pageMap[activePage](setActivePage), [activePage]);

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

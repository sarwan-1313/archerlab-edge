import { Component, Suspense, useCallback, useEffect, useState, type ReactNode, type ErrorInfo } from 'react';
import { AppLoadingScreen } from './AppLoadingScreen';

class RouteErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Unable to render route:', error, info); }
  render() {
    if (this.state.failed) return <section className="empty-state" role="alert"><h1>This page could not be opened</h1><p>A page file may be unavailable. Check your connection and reload to try again.</p><button type="button" className="button button--primary" onClick={() => window.location.reload()}>Reload page</button></section>;
    return this.props.children;
  }
}

function RouteLoadingFallback({ onShown, status }: { onShown: () => void; status: string }) {
  useEffect(() => {
    onShown();
  }, [onShown]);

  return <AppLoadingScreen variant="route" status={status} />;
}

export function RouteLoadingBoundary({ children, status }: { children: ReactNode; status: string }) {
  const [showedFallback, setShowedFallback] = useState(false);
  const markFallbackShown = useCallback(() => setShowedFallback(true), []);

  return (
    <RouteErrorBoundary><Suspense fallback={<RouteLoadingFallback onShown={markFallbackShown} status={status} />}>
      <div className={`route-content ${showedFallback ? 'route-content--revealed' : ''}`}>
        {children}
      </div>
    </Suspense></RouteErrorBoundary>
  );
}

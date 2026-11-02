import { useOnlineStatus } from '../pwa/useOnlineStatus';
import { AppIcon } from './AppIcon';

/** A small badge in the top bar while the device is offline. Live and video analysis keep working. */
export function OfflineIndicator() {
  const online = useOnlineStatus();
  // The live region stays mounted so screen readers announce the change.
  return (
    <div className="offline-indicator-slot" role="status">
      {online ? null : (
        <span className="offline-indicator">
          <AppIcon name="cloud-off" size={14} />
          <span>Offline</span>
          <span className="visually-hidden">. Analysis still works; cloud features need a connection.</span>
        </span>
      )}
    </div>
  );
}

import { updateStore, useUpdateState, type UpdateStore } from '../pwa/updateStore';
import { ActionButton } from './ActionButton';
import { AppIcon } from './AppIcon';

/**
 * "Update available" with a Reload button. It waits until no analysis is running, and nothing reloads
 * unless the athlete presses the button.
 */
export function UpdateToast({ store = updateStore }: { store?: UpdateStore }) {
  const { updateReady, dismissed, held } = useUpdateState(store);
  const visible = updateReady && !dismissed && !held;
  return (
    <div className="update-toast-region" role="status">
      {visible ? (
        <div className="update-toast">
          <span className="update-toast__icon"><AppIcon name="refresh" size={18} /></span>
          <div className="update-toast__copy">
            <strong>Update available</strong>
            <span>Reload to get the latest version.</span>
          </div>
          <ActionButton variant="primary" type="button" onClick={() => store.apply()}>Reload</ActionButton>
          <button type="button" className="update-toast__dismiss" aria-label="Dismiss update notice" onClick={() => store.dismiss()}><AppIcon name="close" size={16} /></button>
        </div>
      ) : null}
    </div>
  );
}

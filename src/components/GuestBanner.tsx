import { useSyncExternalStore } from 'react';
import { isGuest, subscribeGuestMode } from '../onboarding/guestMode';
import { AppIcon } from './AppIcon';

/** A reminder, while in guest mode, that nothing is kept after the app closes. */
export function GuestBanner({ onCreateProfile }: { onCreateProfile: () => void }) {
  const guest = useSyncExternalStore(subscribeGuestMode, () => isGuest(), () => false);
  if (!guest) return null;
  return (
    <div className="guest-banner" role="status">
      <span className="guest-banner__text"><AppIcon name="user" size={16} /><span><strong>Guest mode.</strong> Nothing is saved after you close the app.</span></span>
      <button type="button" onClick={onCreateProfile}>Save my work</button>
    </div>
  );
}

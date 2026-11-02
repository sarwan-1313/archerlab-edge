import { exitVip, useVip } from '../../vip/vip';
import { AppIcon } from '../AppIcon';

/** The "VIP mode · Log out" button in the bottom-right corner while VIP mode is on. */
export function VipLogout({ onLoggedOut }: { onLoggedOut: () => void }) {
  const vip = useVip();
  if (!vip) return null;
  return (
    <button type="button" className="vip-logout" onClick={() => { exitVip(); onLoggedOut(); }}>
      <AppIcon name="crown" size={16} />
      <span>VIP mode</span>
      <strong><AppIcon name="logout" size={15} /> Log out</strong>
    </button>
  );
}

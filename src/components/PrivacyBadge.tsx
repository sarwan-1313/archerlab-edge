import { AppIcon } from './AppIcon';

export function PrivacyBadge() {
  return (
    <div className="privacy-badge">
      <AppIcon name="shield" size={16} className="text-primary" />
      <div className="privacy-badge__copy">
        <span className="privacy-badge__label">
          Privacy Vault
        </span>
        <span className="privacy-badge__state">
          Local Processing
        </span>
      </div>
    </div>
  );
}

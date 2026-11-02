import { AppIcon } from './AppIcon';
import type { NavItem, PageKey } from '../types';
import { ProfilePreview } from './ProfilePreview';
import { useLanguage } from '../i18n/i18n';

type SidebarNavProps = {
  items: NavItem[];
  active: PageKey;
  onSelect: (key: PageKey) => void;
};

export function SidebarNav({ items, active, onSelect }: SidebarNavProps) {
  const { t } = useLanguage();
  return (
    <nav className="sidebar-nav" aria-label="Primary navigation">
      <button type="button" className="sidebar-nav__brand" onClick={() => onSelect('home')} aria-label="ArcherLab Edge: go to Home from sidebar">
        <span className="sidebar-nav__brand-mark"><AppIcon name="target" size={18} /></span>
        <span>ArcherLab <strong>Edge</strong></span>
      </button>
      <button type="button" className="sidebar-nav__profile" onClick={() => onSelect('profile')} aria-current={active === 'profile' ? 'page' : undefined} title="Open your profile">
        <ProfilePreview />
      </button>

      <div className="sidebar-nav__items">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect(item.key)}
            className={[
              'sidebar-nav__item',
              active === item.key
                ? 'sidebar-nav__item--active'
                : '',
            ].join(' ')}
            aria-current={active === item.key ? 'page' : undefined}
          >
            <AppIcon name={item.icon} size={18} strokeWidth={1.8} />
            <span className="font-body-md text-body-md">{t(`nav.${item.key}`, item.label)}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

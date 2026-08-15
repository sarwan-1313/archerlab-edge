import { AppIcon } from './AppIcon';
import type { NavItem, PageKey } from '../types';
import { ProfilePreview } from './ProfilePreview';

type SidebarNavProps = {
  items: NavItem[];
  active: PageKey;
  onSelect: (key: PageKey) => void;
};

export function SidebarNav({ items, active, onSelect }: SidebarNavProps) {
  return (
    <nav className="sidebar-nav">
      <div className="sidebar-nav__profile">
        {/* replaced by local athlete profile when available */}
        <ProfilePreview />
      </div>

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
          >
            <AppIcon name={item.icon} size={18} strokeWidth={1.8} />
            <span className="font-body-md text-body-md">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

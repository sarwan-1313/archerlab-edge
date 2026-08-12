import { AppIcon } from './AppIcon';
import type { NavItem, PageKey } from '../types';

type SidebarNavProps = {
  items: NavItem[];
  active: PageKey;
  onSelect: (key: PageKey) => void;
};

export function SidebarNav({ items, active, onSelect }: SidebarNavProps) {
  return (
    <nav className="sidebar-nav">
      <div className="sidebar-nav__profile">
        <img
          alt="Archer profile"
          className="h-12 w-12 rounded-full border border-primary/30 object-cover"
          src="https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=200&q=80"
        />
        <div>
          <h2 className="font-headline-sm text-headline-sm text-primary">Elite Archer</h2>
          <p className="font-body-md text-body-md text-on-surface-variant">VNT-9200</p>
          <p className="mt-1 font-data-mono text-[10px] text-primary-fixed-dim">Status: Calibrated</p>
        </div>
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

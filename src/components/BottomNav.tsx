import { AppIcon } from './AppIcon';
import type { NavItem, PageKey } from '../types';

type BottomNavProps = {
  items: NavItem[];
  active: PageKey;
  onSelect: (key: PageKey) => void;
};

export function BottomNav({ items, active, onSelect }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="Primary navigation">
      <div className="bottom-nav__inner">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect(item.key)}
            className={[
              'bottom-nav__item',
              active === item.key ? 'bottom-nav__item--active' : '',
            ].join(' ')}
            aria-current={active === item.key ? 'page' : undefined}
          >
            <AppIcon name={item.icon} size={18} strokeWidth={1.8} />
            <span className="block text-center leading-none">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

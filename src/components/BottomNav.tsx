import { AppIcon } from './AppIcon';
import { useLanguage } from '../i18n/i18n';
import type { NavItem, PageKey } from '../types';

type BottomNavProps = {
  items: NavItem[];
  active: PageKey;
  onSelect: (key: PageKey) => void;
};

export function BottomNav({ items, active, onSelect }: BottomNavProps) {
  const { t } = useLanguage();
  const short: Partial<Record<PageKey, string>> = { 'video-analysis': 'nav.video', 'live-analysis': 'nav.live' };
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
              `bottom-nav__item--${item.key}`,
              active === item.key ? 'bottom-nav__item--active' : '',
            ].join(' ')}
            aria-current={active === item.key ? 'page' : undefined}
          >
            <AppIcon name={item.icon} size={18} strokeWidth={1.8} />
            <span className="block text-center leading-none">{t(short[item.key] ?? `nav.${item.key}`, item.label)}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

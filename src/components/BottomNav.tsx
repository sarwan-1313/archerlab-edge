import { useCallback, useState } from 'react';
import { AppIcon } from './AppIcon';
import { MoreMenu } from './MoreMenu';
import { useLanguage } from '../i18n/i18n';
import type { NavItem, PageKey } from '../types';

type BottomNavProps = {
  items: NavItem[];
  active: PageKey;
  onSelect: (key: PageKey) => void;
  /** The page actually open, to mark it in the More menu. */
  current?: PageKey;
};

export function BottomNav({ items, active, onSelect, current = active }: BottomNavProps) {
  const { t } = useLanguage();
  const [moreOpen, setMoreOpen] = useState(false);
  const closeMore = useCallback(() => setMoreOpen(false), []);
  const short: Partial<Record<PageKey, string>> = { 'video-analysis': 'nav.video', 'live-analysis': 'nav.live' };
  const inMore = !items.some((item) => item.key === active);
  return (
    <>
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
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={['bottom-nav__item', 'bottom-nav__item--more', inMore ? 'bottom-nav__item--active' : ''].join(' ')}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
          >
            <AppIcon name="menu" size={18} strokeWidth={1.8} />
            <span className="block text-center leading-none">{t('nav.more', 'More')}</span>
          </button>
        </div>
      </nav>
      {moreOpen ? <MoreMenu active={current} onSelect={onSelect} onClose={closeMore} /> : null}
    </>
  );
}

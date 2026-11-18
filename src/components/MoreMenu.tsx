import { useEffect, useRef } from 'react';
import { AppIcon } from './AppIcon';
import { useLanguage } from '../i18n/i18n';
import { moreNavItems, navGroupLabels } from '../data/navigation';
import type { NavItem, PageKey } from '../types';

type MoreMenuProps = {
  active: PageKey;
  onSelect: (key: PageKey) => void;
  onClose: () => void;
};

/** The phone's More sheet: every page that is not on the bottom bar, in a few short groups. */
export function MoreMenu({ active, onSelect, onClose }: MoreMenuProps) {
  const { t } = useLanguage();
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sheetRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const groups = new Map<NonNullable<NavItem['group']>, NavItem[]>();
  for (const item of moreNavItems) {
    const group = item.group ?? 'help';
    groups.set(group, [...(groups.get(group) ?? []), item]);
  }

  return (
    <div className="more-menu" role="presentation" onClick={onClose}>
      <div className="more-menu__sheet" ref={sheetRef} role="dialog" aria-modal="true" aria-label={t('nav.more', 'More')} onClick={(event) => event.stopPropagation()}>
        <div className="more-menu__header">
          <h2>{t('nav.more', 'More')}</h2>
          <button type="button" className="more-menu__close" onClick={onClose} aria-label="Close menu"><AppIcon name="close" size={20} /></button>
        </div>
        {[...groups].map(([group, items]) => (
          <section key={group} className="more-menu__group" aria-label={t(`navgroup.${group}`, navGroupLabels[group])}>
            <h3>{t(`navgroup.${group}`, navGroupLabels[group])}</h3>
            <div className="more-menu__items">
              {items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={['more-menu__item', active === item.key ? 'more-menu__item--active' : ''].join(' ')}
                  aria-current={active === item.key ? 'page' : undefined}
                  onClick={() => { onSelect(item.key); onClose(); }}
                >
                  <AppIcon name={item.icon} size={20} strokeWidth={1.8} />
                  <span>{t(`nav.${item.key}`, item.label)}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

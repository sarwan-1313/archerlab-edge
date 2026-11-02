import { AppIcon } from './AppIcon';
import type { NavItem, PageKey } from '../types';
import { ProfilePreview } from './ProfilePreview';
import { useLanguage } from '../i18n/i18n';
import { useVip } from '../vip/vip';

type SidebarNavProps = {
  items: NavItem[];
  active: PageKey;
  onSelect: (key: PageKey) => void;
  /** Opens the VIP code dialog. */
  onVipCode?: () => void;
};

export function SidebarNav({ items, active, onSelect, onVipCode }: SidebarNavProps) {
  const { t } = useLanguage();
  const vip = useVip();
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
        {vip ? (
          <button type="button" onClick={() => onSelect('vip')} className={['sidebar-nav__item', 'sidebar-nav__item--vip', active === 'vip' ? 'sidebar-nav__item--active' : ''].join(' ')} aria-current={active === 'vip' ? 'page' : undefined}>
            <AppIcon name="crown" size={18} strokeWidth={1.8} />
            <span className="font-body-md text-body-md">VIP Lounge</span>
          </button>
        ) : null}
      </div>
      {!vip && onVipCode ? (
        <button type="button" className="sidebar-nav__vip" onClick={onVipCode} title="Have a VIP code?">
          <span aria-hidden="true">VIP</span>
          <span className="sr-only">Enter a VIP code</span>
        </button>
      ) : null}
    </nav>
  );
}

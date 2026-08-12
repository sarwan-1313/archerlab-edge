import type { ReactNode } from 'react';

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  compact?: boolean;
};

export function PageHeader({ title, subtitle, actions, compact = false }: PageHeaderProps) {
  return (
    <header className="page-header mb-section-gap flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="page-header__copy">
        <h1 className={compact ? 'font-headline-sm text-headline-sm-mobile md:text-headline-sm text-primary-fixed-dim tracking-tight' : 'font-display-lg text-display-lg text-on-background mb-2'}>
          {title}
        </h1>
        {subtitle ? <p className="font-body-lg text-body-lg text-on-surface-variant">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-header__actions flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}

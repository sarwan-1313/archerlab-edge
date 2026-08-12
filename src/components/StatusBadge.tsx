type StatusBadgeProps = {
  label: string;
  tone?: 'primary' | 'info' | 'success' | 'warning' | 'danger';
  compact?: boolean;
};

const toneMap: Record<NonNullable<StatusBadgeProps['tone']>, string> = {
  primary: 'bg-primary/10 text-primary border-primary/30',
  info: 'bg-secondary-container/30 text-primary-fixed border-primary/30',
  success: 'bg-primary-container/20 text-primary-fixed border-primary-container/30',
  warning: 'bg-error-container/20 text-error border-error/30',
  danger: 'bg-error-container/25 text-error border-error/40',
};

export function StatusBadge({ label, tone = 'primary', compact = false }: StatusBadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center justify-center rounded border font-label-caps uppercase tracking-[0.08em] text-[10px]',
        compact ? 'px-2 py-1' : 'px-2.5 py-1',
        toneMap[tone],
      ].join(' ')}
    >
      {label}
    </span>
  );
}

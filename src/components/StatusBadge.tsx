type StatusBadgeProps = {
  label: string;
  tone?: 'primary' | 'info' | 'success' | 'warning' | 'danger';
  compact?: boolean;
};

export function StatusBadge({ label, tone = 'primary', compact = false }: StatusBadgeProps) {
  return (
    <span
      className={[
        'status-badge',
        `status-badge--${tone}`,
        compact ? 'status-badge--compact' : '',
      ].join(' ')}
    >
      {label}
    </span>
  );
}

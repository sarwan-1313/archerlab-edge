import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
  children: ReactNode;
};

export function ActionButton({ variant = 'primary', children, className = '', ...props }: ActionButtonProps) {
  const styles = {
    primary: 'border border-transparent bg-primary-fixed-dim text-on-primary shadow-[0_0_0_1px_rgba(0,218,243,0.3)] hover:bg-primary',
    secondary: 'border border-white/10 bg-surface-container-high text-on-surface hover:border-primary/30 hover:bg-surface-bright',
    ghost: 'border border-transparent text-on-surface-variant hover:text-primary hover:bg-surface-variant/40',
  };

  return (
    <button
      {...props}
      className={[
        'inline-flex min-h-[46px] appearance-none items-center justify-center gap-2 rounded-xl px-4 py-3 font-headline-sm text-headline-sm-mobile transition-all duration-150 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60',
        styles[variant],
        className,
      ].join(' ')}
    >
      {children}
    </button>
  );
}

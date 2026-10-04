import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  children: ReactNode;
};

export function ActionButton({ variant = 'primary', children, className = '', ...props }: ActionButtonProps) {
  return (
    <button
      {...props}
      className={[
        'button',
        `button--${variant}`,
        className,
      ].join(' ')}
    >
      {children}
    </button>
  );
}

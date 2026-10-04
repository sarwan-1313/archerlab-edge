import type { ReactNode } from 'react';

type PageTransitionProps = {
  children: ReactNode;
  cameraSafe?: boolean;
};

export function PageTransition({ children, cameraSafe = false }: PageTransitionProps) {
  return (
    <div className={`page-transition ${cameraSafe ? 'page-transition--camera-safe' : ''}`}>
      {children}
    </div>
  );
}

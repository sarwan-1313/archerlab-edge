import { useEffect, useRef } from 'react';
import { ActionButton } from '../ActionButton';
import { AppIcon } from '../AppIcon';
import { runPresentationTransition } from '../../motion/runPresentationTransition';

export function EndSessionDialog({ isEnding, onCancel, onConfirm }: { isEnding: boolean; onCancel: () => void; onConfirm: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLButtonElement>('button')?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isEnding) { event.preventDefault(); cancelRef.current(); }
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialog?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
      const first = controls[0]; const last = controls.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previousOverflow; if (trigger?.isConnected) trigger.focus(); };
  }, [isEnding]);
  const closeWithMotion = () => runPresentationTransition(onCancel, { kind: 'modal' });
  const confirmWithMotion = () => runPresentationTransition(onConfirm, { cameraSafe: true, kind: 'modal' });
  return (
    <div className="session-end-backdrop" role="presentation">
      <section ref={dialogRef} className="session-end-dialog" role="alertdialog" aria-modal="true" aria-labelledby="session-end-title" aria-describedby="session-end-description">
        <span className="session-end-dialog__icon"><AppIcon name="stop" size={22} /></span>
        <span className="eyebrow">Session control</span>
        <h2 id="session-end-title">End Training Session?</h2>
        <p id="session-end-description">Your completed shots will be saved to this session.</p>
        <div>
          <ActionButton variant="secondary" onClick={closeWithMotion} disabled={isEnding}>Continue Session</ActionButton>
          <ActionButton variant="danger" onClick={confirmWithMotion} disabled={isEnding}>{isEnding ? 'Ending Session…' : 'End Session'}</ActionButton>
        </div>
      </section>
    </div>
  );
}

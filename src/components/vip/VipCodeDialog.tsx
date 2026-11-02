import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { CODE_LENGTH, enterVip, lockedFor, verifyCode } from '../../vip/vip';
import { confetti } from '../../vip/confetti';
import { AppIcon } from '../AppIcon';

/** Asks for the secret VIP code in four boxes, checks it, and opens VIP mode. */
export function VipCodeDialog({ onClose, onUnlocked }: { onClose: () => void; onUnlocked: () => void }) {
  const [chars, setChars] = useState<string[]>(() => Array(CODE_LENGTH).fill(''));
  const [message, setMessage] = useState<string | null>(() => {
    const wait = lockedFor();
    return wait ? `Too many tries. Wait ${Math.ceil(wait / 1000)} seconds.` : null;
  });
  const [checking, setChecking] = useState(false);
  const [shake, setShake] = useState(false);
  const boxes = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    boxes.current[0]?.focus();
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const check = async (code: string) => {
    setChecking(true);
    const result = await verifyCode(code);
    setChecking(false);
    if (result.ok) {
      enterVip();
      confetti();
      onUnlocked();
      return;
    }
    setShake(true);
    window.setTimeout(() => setShake(false), 450);
    setChars(Array(CODE_LENGTH).fill(''));
    boxes.current[0]?.focus();
    setMessage(result.reason === 'locked' ? `Too many tries. Wait ${Math.ceil(result.waitMs / 1000)} seconds.` : `That is not the code. ${result.left} ${result.left === 1 ? 'try' : 'tries'} left.`);
  };

  const set = (index: number, value: string) => {
    const char = value.replace(/[^0-9a-z]/gi, '').slice(-1).toUpperCase();
    const next = [...chars];
    next[index] = char;
    setChars(next);
    setMessage(null);
    if (char && index < CODE_LENGTH - 1) boxes.current[index + 1]?.focus();
    if (next.every(Boolean)) void check(next.join(''));
  };

  const keyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !chars[index] && index > 0) boxes.current[index - 1]?.focus();
    if (event.key === 'ArrowLeft' && index > 0) boxes.current[index - 1]?.focus();
    if (event.key === 'ArrowRight' && index < CODE_LENGTH - 1) boxes.current[index + 1]?.focus();
  };

  const paste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData('text').replace(/[^0-9a-z]/gi, '').toUpperCase().slice(0, CODE_LENGTH);
    if (!text) return;
    event.preventDefault();
    const next = Array.from({ length: CODE_LENGTH }, (_, index) => text[index] ?? '');
    setChars(next);
    if (next.every(Boolean)) void check(next.join(''));
    else boxes.current[text.length]?.focus();
  };

  return (
    <div className="vip-dialog" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`vip-dialog__card${shake ? ' is-shaking' : ''}`} role="dialog" aria-modal="true" aria-labelledby="vip-dialog-title">
        <button type="button" className="vip-dialog__close" onClick={onClose} aria-label="Close"><AppIcon name="close" size={18} /></button>
        <span className="vip-dialog__crown"><AppIcon name="crown" size={30} /></span>
        <h2 id="vip-dialog-title">VIP code</h2>
        <p>Enter the secret code you were given.</p>
        <div className="vip-dialog__boxes" role="group" aria-label={`${CODE_LENGTH}-character code`}>
          {chars.map((char, index) => (
            <input
              key={index}
              ref={(element) => { boxes.current[index] = element; }}
              value={char}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="one-time-code"
              maxLength={2}
              aria-label={`Character ${index + 1}`}
              disabled={checking}
              onChange={(event) => set(index, event.target.value)}
              onKeyDown={(event) => keyDown(index, event)}
              onPaste={paste}
            />
          ))}
        </div>
        <p className="vip-dialog__message" role="status">{checking ? 'Checking…' : message ?? ' '}</p>
      </section>
    </div>
  );
}

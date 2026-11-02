import { useState } from 'react';
import { useLanguage } from '../../i18n/i18n';
import { cardStats, type CardStats } from '../../practice-log/progressCard';
import type { PracticeEntry } from '../../practice-log/types';
import { ActionButton } from '../ActionButton';
import { AppIcon } from '../AppIcon';

const W = 1080;
const H = 1350;

/** Draws a portrait card (Instagram 4:5) with this week's training. */
async function drawCard(stats: CardStats, name: string, t: (key: string, english: string) => string): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const context = canvas.getContext('2d');
  if (!context) return null;
  try { await document.fonts?.ready; } catch { /* fonts are optional */ }
  const display = "'Barlow Condensed', 'Arial Narrow', sans-serif";
  const body = "'Inter', system-ui, sans-serif";

  const gradient = context.createLinearGradient(0, 0, W, H);
  gradient.addColorStop(0, '#04060a');
  gradient.addColorStop(1, '#0d1a24');
  context.fillStyle = gradient;
  context.fillRect(0, 0, W, H);

  // A faint target face in the corner.
  const rings = ['#ffd23f', '#e0393e', '#2f8fd8', '#1d1d1f', '#f4f4f0'];
  for (let index = rings.length - 1; index >= 0; index -= 1) {
    context.beginPath();
    context.arc(W - 120, 200, 70 + index * 70, 0, Math.PI * 2);
    context.fillStyle = rings[index];
    context.globalAlpha = 0.09;
    context.fill();
  }
  context.globalAlpha = 1;

  context.fillStyle = '#2ee6ff';
  context.font = `700 34px ${body}`;
  context.fillText('ARCHERLAB EDGE', 80, 120);
  context.fillStyle = '#f3f6fa';
  context.font = `800 96px ${display}`;
  context.fillText(name || 'My training', 80, 230, W - 160);
  context.fillStyle = '#8e9aab';
  context.font = `500 38px ${body}`;
  context.fillText(`${t('card.thisWeek', 'This week')} · ${new Date().toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })}`, 80, 295);

  const tiles: Array<[string, string, string]> = [
    [t('card.arrows', 'Arrows'), String(stats.weekArrows), `${stats.totalArrows.toLocaleString()} logged`],
    [t('card.sessions', 'Sessions'), String(stats.weekSessions), 'this week'],
    [t('card.streak', 'Day streak'), String(stats.streak), stats.streak === 1 ? 'day' : 'days in a row'],
    [t('card.form', 'Form score'), stats.formScore === null ? '–' : String(Math.round(stats.formScore)), stats.formChange === null ? 'latest video' : `${stats.formChange >= 0 ? '+' : ''}${Math.round(stats.formChange)} since last`],
  ];
  tiles.forEach(([label, value, note], index) => {
    const x = 80 + (index % 2) * 470;
    const y = 380 + Math.floor(index / 2) * 330;
    context.fillStyle = 'rgba(46, 230, 255, 0.07)';
    context.fillRect(x, y, 440, 290);
    context.fillStyle = '#2ee6ff';
    context.fillRect(x, y, 8, 290);
    context.fillStyle = '#8e9aab';
    context.font = `700 30px ${body}`;
    context.fillText(label.toUpperCase(), x + 40, y + 62);
    context.fillStyle = '#f3f6fa';
    context.font = `800 140px ${display}`;
    context.fillText(value, x + 36, y + 200);
    context.fillStyle = '#7d899c';
    context.font = `500 30px ${body}`;
    context.fillText(note, x + 40, y + 252, 380);
  });

  if (stats.bestRound) {
    const y = 1060;
    context.fillStyle = 'rgba(255, 197, 61, 0.12)';
    context.fillRect(80, y, W - 160, 150);
    context.fillStyle = '#ffc53d';
    context.font = `700 30px ${body}`;
    context.fillText(t('card.bestRound', 'Best round').toUpperCase(), 120, y + 55);
    context.fillStyle = '#f3f6fa';
    context.font = `800 64px ${display}`;
    context.fillText(`${stats.bestRound.total} · ${stats.bestRound.name}`, 120, y + 125, W - 240);
  }

  context.fillStyle = '#7d899c';
  context.font = `500 28px ${body}`;
  context.fillText('Tracked on-device with ArcherLab Edge', 80, H - 70);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/** Makes a progress image to post or send, shared with the phone's share sheet where it can be, or downloaded. */
export function ProgressCardButton({ entries, name }: { entries: readonly PracticeEntry[]; name: string }) {
  const { t } = useLanguage();
  const [preview, setPreview] = useState<{ url: string; blob: Blob } | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const make = async () => {
    setStatus(null);
    const blob = await drawCard(cardStats(entries), name, t);
    if (!blob) { setStatus('The image could not be made in this browser.'); return; }
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview({ url: URL.createObjectURL(blob), blob });
  };

  const share = async () => {
    if (!preview) return;
    const file = new File([preview.blob], 'archerlab-progress.png', { type: 'image/png' });
    try {
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'My archery training' }); return; }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
    }
    const link = document.createElement('a');
    link.href = preview.url;
    link.download = file.name;
    link.click();
  };

  return (
    <>
      <ActionButton variant="ghost" type="button" onClick={() => void make()}><AppIcon name="share" size={16} /> {t('card.share', 'Share progress')}</ActionButton>
      {preview ? (
        <div className="progress-card" role="dialog" aria-label="Progress image">
          <img src={preview.url} alt="Your training this week as an image" />
          <div className="va-actions">
            <ActionButton variant="primary" type="button" onClick={() => void share()}><AppIcon name="share" size={16} /> Share or save</ActionButton>
            <ActionButton variant="ghost" type="button" onClick={() => { URL.revokeObjectURL(preview.url); setPreview(null); }}>Close</ActionButton>
          </div>
        </div>
      ) : null}
      {status ? <span className="va-faint" role="status">{status}</span> : null}
    </>
  );
}

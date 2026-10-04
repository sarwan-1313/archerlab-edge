import { useEffect, useRef, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { useAthleteProfile } from '../hooks/useAthleteProfile';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5MB

export function ProfilePage() {
  const { profile, loadError, save, removePhoto } = useAthleteProfile();
  const [form, setForm] = useState<any>({ displayName: '', archerId: '', handedness: 'right', bowType: '', discipline: '', experienceLevel: '', defaultCameraAngle: 'side' });
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { if (profile) { setForm((f:any) => ({ ...f, displayName: profile.displayName ?? '', archerId: profile.archerId ?? '', handedness: profile.handedness ?? 'right', bowType: profile.bowType ?? '', discipline: profile.discipline ?? '', experienceLevel: profile.experienceLevel ?? '', defaultCameraAngle: profile.defaultCameraAngle ?? 'side' })); setPhotoPreview(profile.profilePhotoUrl ?? null); } }, [profile]);

  const onFile = async (file?: File) => {
    setError(null);
    if (!file) return;
    if (!['image/png','image/jpeg','image/webp'].includes(file.type)) { setError('Unsupported image type'); return; }
    if (file.size > MAX_PHOTO_BYTES) { setError('Image too large (max 5MB)'); return; }
    setSaving(true); setSaved(false);
    try { await save({ ...profile, ...form, profilePhotoBlob: file }); setSaved(true); }
    catch { setError('The photo could not be saved. Check available browser storage and try again.'); }
    finally { setSaving(false); }
  };

  const onChange = (k: string, v: any) => { setSaved(false); setForm((s:any) => ({ ...s, [k]: v })); };
  const onSave = async (ev?: any) => { ev?.preventDefault(); if (saving) return; setError(null); setSaving(true); setSaved(false);
    try { await save({ ...profile, ...form }); setSaved(true); } catch { setError('Your profile could not be saved. Check browser storage and try again.'); } finally { setSaving(false); }
  };
  const onRemove = async () => { setError(null); setSaving(true); setSaved(false); try { await removePhoto(); setPhotoPreview(null); setSaved(true); } catch { setError('The photo could not be removed. Try again.'); } finally { setSaving(false); } };
  return (<div className="page-container page-container--wide"><PageHeader title="Athlete Profile" subtitle="Local athlete identity stored on this device" />
    {loadError ? <p role="alert">Your profile could not be loaded from this device. Try again or save the form to recreate it.</p> : null}
    <form className="profile-form" onSubmit={onSave}>
      <div className="profile-grid">
        <div className="profile-card">
          <div className="photo-preview">
            {photoPreview ? <img className="profile-avatar" src={photoPreview} alt="Profile" /> : <div className="avatar-placeholder" aria-label="Profile initials"><strong>{(form.displayName || 'Athlete').trim().split(/\s+/).map((s: string) => s[0]).join('').slice(0, 2).toUpperCase()}</strong></div>}
          </div>
          <div className="profile-photo-actions">
            <input className="profile-photo-input" ref={inputRef} type="file" aria-label="Profile photo" disabled={saving} accept="image/png,image/jpeg,image/webp" onChange={(e) => onFile(e.target.files?.[0])} />
            <div className="profile-photo-buttons">
              <button type="button" disabled={saving} onClick={() => inputRef.current?.click()}>Choose Photo</button>
              <button type="button" disabled={saving || !photoPreview} onClick={onRemove}>Remove Photo</button>
            </div>
            {error ? <div role="alert">{error}</div> : null}
          </div>
        </div>
        <div className="profile-fields">
          <label>Display name<input value={form.displayName} onChange={(e) => onChange('displayName', e.target.value)} /></label>
          <label>Archer ID (optional)<input value={form.archerId} onChange={(e) => onChange('archerId', e.target.value)} /></label>
          <label>Handedness<select value={form.handedness} onChange={(e) => onChange('handedness', e.target.value)}><option value="right">Right</option><option value="left">Left</option></select></label>
          <label>Bow type<select value={form.bowType} onChange={(e) => onChange('bowType', e.target.value)}><option value="">(unspecified)</option><option value="recurve">Recurve</option><option value="compound">Compound</option><option value="barebow">Barebow</option><option value="other">Other</option></select></label>
          <label>Discipline<input value={form.discipline} onChange={(e) => onChange('discipline', e.target.value)} /></label>
          <label>Experience level<select value={form.experienceLevel} onChange={(e) => onChange('experienceLevel', e.target.value)}><option value="">(unspecified)</option><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option><option value="competitive">Competitive</option></select></label>
          <label>Default camera view<select value={form.defaultCameraAngle} onChange={(e) => onChange('defaultCameraAngle', e.target.value)}><option value="side">Side</option><option value="front">Front</option><option value="rear">Rear</option><option value="custom">Custom</option></select></label>
          <div style={{ marginTop: 12 }}><button className="analysis-cta" type="submit" disabled={saving}><strong>{saving ? 'Saving?' : 'Save Profile'}</strong></button></div>
        </div>
      </div>
      {saved ? <p role="status">Profile saved on this device.</p> : null}
    </form>
  </div>);
}

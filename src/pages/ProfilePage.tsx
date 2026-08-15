import { useEffect, useRef, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { useAthleteProfile } from '../hooks/useAthleteProfile';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5MB

export function ProfilePage() {
  const { profile, save, removePhoto } = useAthleteProfile();
  const [form, setForm] = useState<any>({ displayName: '', archerId: '', handedness: 'right', bowType: '', discipline: '', experienceLevel: '', defaultCameraAngle: 'side' });
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { if (profile) { setForm((f:any) => ({ ...f, displayName: profile.displayName ?? '', archerId: profile.archerId ?? '', handedness: profile.handedness ?? 'right', bowType: profile.bowType ?? '', discipline: profile.discipline ?? '', experienceLevel: profile.experienceLevel ?? '', defaultCameraAngle: profile.defaultCameraAngle ?? 'side' })); setPhotoPreview(profile.profilePhotoUrl ?? null); } }, [profile]);

  const onFile = async (file?: File) => {
    setError(null);
    if (!file) return;
    if (!['image/png','image/jpeg','image/webp'].includes(file.type)) { setError('Unsupported image type'); return; }
    if (file.size > MAX_PHOTO_BYTES) { setError('Image too large (max 5MB)'); return; }
    // create preview
    const url = URL.createObjectURL(file);
    setPhotoPreview(url);
    // save to profile as blob
    await save({ ...form, profilePhotoBlob: file });
  };

  const onChange = (k: string, v: any) => setForm((s:any) => ({ ...s, [k]: v }));
  const onSave = async (ev?: any) => { ev?.preventDefault(); setError(null); await save({ ...form }); };
  const onRemove = async () => { setPhotoPreview(null); await removePhoto(); };
  return (<div className="page-container page-container--wide"><PageHeader title="Athlete Profile" subtitle="Local athlete identity stored on this device" />
    <form className="profile-form" onSubmit={onSave}>
      <div className="profile-grid">
        <div className="profile-card">
          <div className="photo-preview">
            {photoPreview ? <img src={photoPreview} alt="profile" style={{ width: 160, height: 160, objectFit: 'cover', borderRadius: 8 }} /> : <div className="avatar-placeholder" style={{ width: 160, height: 160, borderRadius: 8, background: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><strong style={{ fontSize: 36 }}>{(form.displayName || ' ').split(' ').map((s:any)=>s[0]).join('').slice(0,2).toUpperCase()}</strong></div>}
          </div>
          <div style={{ marginTop: 8 }}>
            <input ref={inputRef} type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0])} />
            <div style={{ marginTop: 8 }}>
              <button type="button" onClick={() => inputRef.current?.click()}>Upload Photo</button>
              <button type="button" onClick={onRemove}>Remove Photo</button>
            </div>
            {error ? <div style={{ color: 'red' }}>{error}</div> : null}
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
          <div style={{ marginTop: 12 }}><button className="analysis-cta" type="submit"><strong>Save Profile</strong></button></div>
        </div>
      </div>
    </form>
  </div>);
}

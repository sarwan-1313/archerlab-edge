import { useAthleteProfile } from '../hooks/useAthleteProfile';

export function ProfilePreview() {
  const { profile, loadError } = useAthleteProfile();
  const initials = (profile?.displayName || 'Athlete').trim().split(/\s+/).map((part: string) => part[0]).join('').slice(0, 2).toUpperCase();
  if (!profile) return <div style={{ display: 'flex', gap: 12 }}><div className="avatar-placeholder h-12 w-12 rounded-full"><strong>{initials}</strong></div><div><h2 className="font-headline-sm text-headline-sm text-primary">Guest</h2><p className="font-body-md text-body-md text-on-surface-variant">{loadError ? 'Profile unavailable' : 'No profile'}</p></div></div>;
  const url = profile.profilePhotoUrl ?? null;
  return (<div style={{ display: 'flex', gap: 12 }}>
    {url ? <img alt="Athlete profile" src={url} className="h-12 w-12 rounded-full border border-primary/30 object-cover" /> : <div className="avatar-placeholder h-12 w-12 rounded-full"><strong>{initials}</strong></div>}
    <div>
      <h2 className="font-headline-sm text-headline-sm text-primary">{profile.displayName ?? 'Athlete'}</h2>
      <p className="font-body-md text-body-md text-on-surface-variant">{profile.archerId ?? ''}</p>
      <p className="mt-1 font-data-mono text-[10px] text-primary-fixed-dim">{profile.handedness ? `${profile.bowType ?? ''} - ${profile.handedness}` : 'No defaults'}</p>
    </div>
  </div>);
}

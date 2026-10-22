import { useAthleteProfile } from '../hooks/useAthleteProfile';

export function ProfilePreview() {
  const { profile, loadError } = useAthleteProfile();
  const initials = (profile?.displayName || 'Athlete').trim().split(/\s+/).map((part: string) => part[0]).join('').slice(0, 2).toUpperCase();
  const url = profile?.profilePhotoUrl ?? null;
  const name = profile ? profile.displayName ?? 'Athlete' : 'Guest';
  const detail = profile
    ? (profile.handedness ? `${profile.bowType ?? ''} · ${profile.handedness}`.replace(/^ · /, '') : profile.archerId ?? 'No defaults')
    : (loadError ? 'Profile unavailable' : 'No profile yet');

  return (
    <div className="sidebar-profile">
      {url
        ? <img alt="Athlete profile" src={url} className="sidebar-profile__avatar" />
        : <span className="sidebar-profile__avatar sidebar-profile__avatar--initials" aria-hidden="true">{initials}</span>}
      <div className="sidebar-profile__text">
        <h2>{name}</h2>
        <p>{detail}</p>
      </div>
    </div>
  );
}

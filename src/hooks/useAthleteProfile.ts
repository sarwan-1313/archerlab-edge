import { useEffect, useState, useRef } from 'react';
import { loadProfile, saveProfile } from '../profile/profileStorage';

export function useAthleteProfile() {
  const [profile, setProfile] = useState<any | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void loadProfile('default').then((p) => {
      if (!mounted) return;
      if (p && p.profilePhotoBlob instanceof Blob) {
        try { const u = URL.createObjectURL(p.profilePhotoBlob); p.profilePhotoUrl = u; urlRef.current = u; } catch { p.profilePhotoUrl = null; }
      }
      setProfile(p);
    }).catch(() => { if (mounted) setProfile(null); });
    return () => { mounted = false; if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; } };
  }, []);

  const save = async (data: any) => {
    const toSave = { id: 'default', ...data, updatedAt: Date.now(), createdAt: data.createdAt ?? Date.now() };
    // profilePhotoUrl is ephemeral, do not persist it
    if (toSave.profilePhotoUrl) delete toSave.profilePhotoUrl;
    await saveProfile(toSave);
    // create object URL if blob present
    if (toSave.profilePhotoBlob instanceof Blob) {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      try { const u = URL.createObjectURL(toSave.profilePhotoBlob); toSave.profilePhotoUrl = u; urlRef.current = u; } catch { toSave.profilePhotoUrl = null; }
    }
    setProfile(toSave);
  };

  const removePhoto = async () => {
    if (!profile) return;
    const p = { ...profile };
    delete p.profilePhotoBlob; if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
    await saveProfile({ id: 'default', ...p, profilePhotoBlob: undefined });
    setProfile({ ...p, profilePhotoUrl: null });
  };

  return { profile, save, removePhoto };
}

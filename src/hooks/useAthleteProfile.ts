import { useEffect, useState } from 'react';
import { loadProfile, saveProfile } from '../profile/profileStorage';

type Profile = Record<string, any> & { id?: string; profilePhotoUrl?: string | null };
type ProfileSnapshot = { profile: Profile | null; loading: boolean; loadError: Error | null };

const listeners = new Set<() => void>();
let snapshot: ProfileSnapshot = { profile: null, loading: true, loadError: null };
let loadPromise: Promise<void> | null = null;
let sharedPhotoUrl: string | null = null;

function notify() {
  listeners.forEach((listener) => listener());
}

function setSnapshot(next: ProfileSnapshot) {
  snapshot = next;
  notify();
}

function profileWithPhoto(profile: Profile | null): Profile | null {
  if (sharedPhotoUrl) {
    URL.revokeObjectURL(sharedPhotoUrl);
    sharedPhotoUrl = null;
  }
  if (!profile) return null;
  if (!(profile.profilePhotoBlob instanceof Blob)) return { ...profile, profilePhotoUrl: null };
  try {
    sharedPhotoUrl = URL.createObjectURL(profile.profilePhotoBlob);
    return { ...profile, profilePhotoUrl: sharedPhotoUrl };
  } catch {
    return { ...profile, profilePhotoUrl: null };
  }
}

function ensureLoaded(force = false) {
  if (loadPromise) return loadPromise;
  if (!force && !snapshot.loading) return Promise.resolve();
  setSnapshot({ ...snapshot, loading: true, loadError: null });
  loadPromise = loadProfile('default').then((profile) => {
    setSnapshot({ profile: profileWithPhoto(profile), loading: false, loadError: null });
  }).catch((error) => {
    setSnapshot({ ...snapshot, loading: false, loadError: error instanceof Error ? error : new Error(String(error)) });
  }).finally(() => {
    loadPromise = null;
  });
  return loadPromise;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAthleteProfile() {
  const [current, setCurrent] = useState(snapshot);

  useEffect(() => {
    const refresh = listeners.size === 0;
    const unsubscribe = subscribe(() => setCurrent(snapshot));
    void ensureLoaded(refresh);
    return () => { unsubscribe(); };
  }, []);

  const save = async (data: Profile) => {
    const toSave: Profile = { id: 'default', ...data, updatedAt: Date.now(), createdAt: data.createdAt ?? Date.now() };
    delete toSave.profilePhotoUrl;
    await saveProfile(toSave);
    setSnapshot({ profile: profileWithPhoto(toSave), loading: false, loadError: null });
    window.dispatchEvent(new Event('archerlab:profile-updated'));
  };

  const removePhoto = async () => {
    if (!snapshot.profile) return;
    const toSave = { ...snapshot.profile };
    delete toSave.profilePhotoBlob;
    delete toSave.profilePhotoUrl;
    await saveProfile({ id: 'default', ...toSave, profilePhotoBlob: undefined });
    setSnapshot({ profile: profileWithPhoto({ ...toSave, profilePhotoBlob: undefined }), loading: false, loadError: null });
    window.dispatchEvent(new Event('archerlab:profile-updated'));
  };

  return { ...current, reloadProfile: () => ensureLoaded(true), save, removePhoto };
}

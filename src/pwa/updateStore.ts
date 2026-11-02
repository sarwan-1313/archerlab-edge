import { useEffect, useSyncExternalStore } from 'react';

export interface UpdateSnapshot {
  /** A new version of the app is installed and waiting for the athlete to reload. */
  updateReady: boolean;
  /** The athlete chose "Later" for this update. */
  dismissed: boolean;
  /** An analysis is running, so the update must not interrupt it. */
  held: boolean;
}

/**
 * Where "a new version is available" is kept, apart from the service worker so the toast and the
 * analysis pages never import it. An update is only ever applied when the athlete presses Reload, and
 * never while an analysis holds it back.
 */
export function createUpdateStore() {
  let updateReady = false;
  let dismissed = false;
  let holds = 0;
  let reload: () => void = () => window.location.reload();
  let snapshot: UpdateSnapshot = { updateReady, dismissed, held: false };
  const listeners = new Set<() => void>();

  const publish = () => {
    const held = holds > 0;
    if (snapshot.updateReady === updateReady && snapshot.dismissed === dismissed && snapshot.held === held) return;
    snapshot = { updateReady, dismissed, held };
    listeners.forEach((listener) => listener());
  };

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    getSnapshot: (): UpdateSnapshot => snapshot,
    /**
     * A new version is waiting. `applyUpdate` is what the Reload button runs. The registration helper can say
     * so more than once for the same version, so this never undoes a "Later".
     */
    announceUpdate(applyUpdate: () => void) {
      reload = applyUpdate;
      updateReady = true;
      publish();
    },
    /** A new worker took over a page that still runs the old code, so reloading is no longer optional. */
    announceTakeover(reloadNow: () => void) {
      reload = reloadNow;
      updateReady = true;
      dismissed = false;
      publish();
    },
    /** The Reload button. */
    apply() { reload(); },
    /** "Later": hides the toast until the app is opened again, or a new worker takes over. */
    dismiss() {
      dismissed = true;
      publish();
    },
    /** Marks an analysis as running; the returned function ends the hold. */
    hold() {
      holds += 1;
      publish();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        holds -= 1;
        publish();
      };
    },
    isHeld: () => holds > 0,
  };
}

export type UpdateStore = ReturnType<typeof createUpdateStore>;

export const updateStore: UpdateStore = createUpdateStore();

export function useUpdateState(store: UpdateStore = updateStore): UpdateSnapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/** Holds updates back while `active`, so a reload can never cut an analysis short. */
export function useHoldUpdates(active: boolean, store: UpdateStore = updateStore): void {
  useEffect(() => (active ? store.hold() : undefined), [active, store]);
}

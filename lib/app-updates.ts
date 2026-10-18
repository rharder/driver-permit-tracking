export const UPDATE_CHECK_MS = 5 * 60_000;
export const UPDATE_IDLE_MS = 10_000;

type UpdateEnvironment = {
  runningVersion: string;
  now: () => number;
  visible: () => boolean;
  check: () => void;
  canReload: () => boolean;
  checkpoint: () => boolean;
  reload: (version: string) => void;
  onReady: (ready: boolean) => void;
};

/** Scheduling is independent of network completion; a stalled check cannot stall the UI. */
export function createAppUpdateCoordinator(env: UpdateEnvironment) {
  let lastCheck = -Infinity;
  let lastInteraction = env.now();
  let readyAt = Infinity;
  let pendingVersion: string | null = null;
  let reloading = false;
  return {
    check(force = false) {
      if (!env.visible() || (!force && env.now() - lastCheck < 60_000)) return;
      lastCheck = env.now();
      env.check();
    },
    receive(message: unknown) {
      const update = message as { type?: string; version?: unknown } | null;
      if (update?.type !== 'APP_UPDATE_READY' || typeof update.version !== 'string'
        || !/^[a-zA-Z0-9._-]{1,96}$/.test(update.version) || update.version === 'development'
        || update.version === env.runningVersion || reloading) return;
      if (pendingVersion !== update.version) readyAt = env.now();
      pendingVersion = update.version;
      env.onReady(true);
    },
    interact() { lastInteraction = env.now(); },
    apply() {
      if (!pendingVersion || reloading || !env.visible() || !env.canReload()
        || env.now() - Math.max(lastInteraction, readyAt) < UPDATE_IDLE_MS) return;
      // The caller persists the latest log and pending sync marker synchronously.
      // Never reload if storage is full, inaccessible, or the snapshot is not settled.
      if (!env.checkpoint()) return;
      reloading = true;
      env.reload(pendingVersion);
    },
  };
}

export function checkpointLocalLog(storage: Pick<Storage, 'setItem' | 'getItem'>, key: string, data: unknown, preserveSync: () => boolean) {
  try {
    const snapshot = JSON.stringify(data);
    const saved = storage.getItem(key);
    // A different tab may have saved a newer log. Never overwrite it to reload.
    if (saved !== null && saved !== snapshot) return false;
    storage.setItem(key, snapshot);
    return storage.getItem(key) === snapshot && preserveSync();
  } catch { return false; }
}

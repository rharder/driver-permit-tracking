// A network interface is not proof that Firebase is reachable. Only server-backed
// snapshots (or an acknowledged write) can confirm that the log is current.
export function snapshotSyncStatus(metadata: { fromCache: boolean; hasPendingWrites: boolean }, role: 'owner' | 'supervisor' | 'viewer') {
  if (metadata.fromCache) return {
    status: 'offline' as const,
    message: role === 'viewer' ? 'Saved copy · view only' : 'Saved on device · sync pending',
  };
  if (metadata.hasPendingWrites) return { status: 'saving' as const, message: 'Saved on device · syncing…' };
  return { status: 'synced' as const, message: role === 'viewer' ? 'View only' : 'Synced' };
}

export function matchesPendingUpload(raw: string | null, uid: string, familyId: string, payloadJson: string) {
  try {
    const pending = JSON.parse(raw ?? 'null') as { uid: string; familyId: string; payloadJson: string } | null;
    return Boolean(pending && pending.uid === uid && pending.familyId === familyId && pending.payloadJson === payloadJson);
  } catch { return false; }
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getAuth,
  getRedirectResult,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  getFirestore,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  serverTimestamp,
  setDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyDhJVLylH40lUgfIJL9nSQfqbBJpEbbdaM',
  authDomain: 'kids-money-tracker-f24be.firebaseapp.com',
  projectId: 'kids-money-tracker-f24be',
  storageBucket: 'kids-money-tracker-f24be.firebasestorage.app',
  messagingSenderId: '148984236841',
  appId: '1:148984236841:web:6c03e95dc169891dc54538',
};

const FAMILY_COLLECTION = 'permitHourFamilies';
const ACCESS_COLLECTION = 'permitHourAccess';
const ACCESS_CACHE_KEY = 'permit-hours-cloud-access-v2';

export type FamilyRole = 'owner' | 'supervisor' | 'viewer';
export type SyncStatus = 'local' | 'connecting' | 'setup' | 'saving' | 'synced' | 'offline' | 'unapproved' | 'error';

export type FamilyMembers = {
  supervisorEmails: string[];
  viewerEmails: string[];
};

export type CloudSyncState = {
  user: User | null;
  role: FamilyRole | null;
  status: SyncStatus;
  members: FamilyMembers;
  message: string;
  cloudReady: boolean;
};

type FamilyDocument<T> = FamilyMembers & {
  ownerUid: string;
  ownerEmail: string;
  schemaVersion: 1;
  payload: T;
};

type AccessDocument = {
  email: string;
  familyId: string;
  role: FamilyRole;
};

type CachedAccess = AccessDocument & { uid: string };

type UseFirebaseSyncOptions<T> = {
  data: T;
  localReady: boolean;
  onRemoteData: (data: T) => void;
};

const initialState: CloudSyncState = {
  user: null,
  role: null,
  status: 'local',
  members: { supervisorEmails: [], viewerEmails: [] },
  message: 'Local only',
  cloudReady: false,
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function roleFor<T>(user: User, family: FamilyDocument<T>): FamilyRole | null {
  const email = normalizeEmail(user.email ?? '');
  if (family.ownerUid === user.uid) return 'owner';
  if (family.supervisorEmails?.map(normalizeEmail).includes(email)) return 'supervisor';
  if (family.viewerEmails?.map(normalizeEmail).includes(email)) return 'viewer';
  return null;
}

function cachedAccess(user: User): CachedAccess | null {
  try {
    const value = JSON.parse(localStorage.getItem(ACCESS_CACHE_KEY) ?? 'null') as CachedAccess | null;
    return value?.uid === user.uid && value.familyId && value.role ? value : null;
  } catch {
    return null;
  }
}

function cacheAccess(user: User, access: AccessDocument) {
  localStorage.setItem(ACCESS_CACHE_KEY, JSON.stringify({ ...access, uid: user.uid, savedAt: Date.now() }));
}

function getDatabase(): Firestore {
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    return getFirestore(app);
  }
}

export function useFirebaseSync<T>({ data, localReady, onRemoteData }: UseFirebaseSyncOptions<T>) {
  const [state, setState] = useState<CloudSyncState>(initialState);
  const databaseRef = useRef<Firestore | null>(null);
  const userRef = useRef<User | null>(null);
  const roleRef = useRef<FamilyRole | null>(null);
  const familyIdRef = useRef<string | null>(null);
  const cloudReadyRef = useRef(false);
  const lastCloudPayloadRef = useRef('');
  const saveTimerRef = useRef<number | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const updateState = useCallback((update: Partial<CloudSyncState>) => {
    setState((current) => ({ ...current, ...update }));
  }, []);

  const watchFamily = useCallback((user: User, db: Firestore, familyId: string) => {
    unsubscribeRef.current?.();
    familyIdRef.current = familyId;
    const familyRef = doc(db, FAMILY_COLLECTION, familyId);
    unsubscribeRef.current = onSnapshot(
      familyRef,
      { includeMetadataChanges: true },
      (snapshot) => {
        if (!snapshot.exists()) {
          cloudReadyRef.current = false;
          updateState({ status: 'error', message: 'Shared log unavailable', cloudReady: false });
          return;
        }

        const family = snapshot.data() as FamilyDocument<T>;
        const role = roleFor(user, family);
        if (!role) {
          roleRef.current = null;
          familyIdRef.current = null;
          cloudReadyRef.current = false;
          updateState({ role: null, status: 'unapproved', message: 'Access not approved', cloudReady: false });
          return;
        }

        const access: AccessDocument = { email: normalizeEmail(user.email ?? ''), familyId, role };
        const payloadJson = JSON.stringify(family.payload);
        roleRef.current = role;
        cloudReadyRef.current = true;
        cacheAccess(user, access);
        if (family.payload && payloadJson !== lastCloudPayloadRef.current) {
          lastCloudPayloadRef.current = payloadJson;
          onRemoteData(family.payload);
        }

        const offline = snapshot.metadata.fromCache && !navigator.onLine;
        const pending = snapshot.metadata.hasPendingWrites;
        updateState({
          role,
          members: {
            supervisorEmails: Array.isArray(family.supervisorEmails) ? family.supervisorEmails : [],
            viewerEmails: Array.isArray(family.viewerEmails) ? family.viewerEmails : [],
          },
          status: offline ? 'offline' : pending ? 'saving' : 'synced',
          message: offline ? 'Saved offline' : pending ? 'Saving…' : role === 'viewer' ? 'View only' : 'Synced',
          cloudReady: true,
        });
      },
      (error) => {
        if (error.code === 'permission-denied') {
          cloudReadyRef.current = false;
          updateState({ status: 'unapproved', message: 'Access not approved', cloudReady: false });
          return;
        }
        updateState({ status: 'offline', message: 'Saved offline' });
      },
    );
  }, [onRemoteData, updateState]);

  useEffect(() => {
    if (!localReady) return;
    const db = getDatabase();
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    const auth = getAuth(app);
    databaseRef.current = db;
    void setPersistence(auth, browserLocalPersistence);
    void getRedirectResult(auth).catch(() => undefined);

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      userRef.current = user;
      unsubscribeRef.current?.();
      if (!user) {
        roleRef.current = null;
        familyIdRef.current = null;
        cloudReadyRef.current = false;
        updateState(initialState);
        return;
      }

      const savedAccess = cachedAccess(user);
      updateState({
        user,
        role: savedAccess?.role ?? null,
        status: navigator.onLine ? 'connecting' : 'offline',
        message: navigator.onLine ? 'Connecting…' : savedAccess?.role === 'viewer' ? 'Offline · view only' : 'Saved offline',
        cloudReady: Boolean(savedAccess && !navigator.onLine),
      });
      roleRef.current = savedAccess?.role ?? null;
      familyIdRef.current = savedAccess?.familyId ?? null;
      cloudReadyRef.current = Boolean(savedAccess && !navigator.onLine);

      try {
        const email = normalizeEmail(user.email ?? '');
        if (!email || email.includes('/')) throw new Error('A valid Google-account email is required');
        const accessSnapshot = await getDoc(doc(db, ACCESS_COLLECTION, email));
        if (!accessSnapshot.exists()) {
          roleRef.current = null;
          familyIdRef.current = null;
          cloudReadyRef.current = false;
          updateState({ user, role: null, status: 'setup', message: 'Cloud setup available', cloudReady: false });
          return;
        }
        const access = accessSnapshot.data() as AccessDocument;
        roleRef.current = access.role;
        familyIdRef.current = access.familyId;
        watchFamily(user, db, access.familyId);
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === 'permission-denied') {
          updateState({ user, role: null, status: 'unapproved', message: 'Access not approved', cloudReady: false });
          return;
        }
        if (savedAccess) {
          watchFamily(user, db, savedAccess.familyId);
          return;
        }
        updateState({ user, role: null, status: 'offline', message: 'Local only while offline', cloudReady: false });
      }
    });

    const updateConnection = () => {
      if (!navigator.onLine && userRef.current) updateState({ status: 'offline', message: roleRef.current === 'viewer' ? 'Offline · view only' : 'Saved offline' });
    };
    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);
    return () => {
      unsubscribeAuth();
      unsubscribeRef.current?.();
      window.removeEventListener('online', updateConnection);
      window.removeEventListener('offline', updateConnection);
    };
  }, [localReady, updateState, watchFamily]);

  useEffect(() => {
    if (!localReady || !cloudReadyRef.current || !userRef.current || !familyIdRef.current || roleRef.current === 'viewer') return;
    const payloadJson = JSON.stringify(data);
    if (payloadJson === lastCloudPayloadRef.current) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    updateState({ status: navigator.onLine ? 'saving' : 'offline', message: navigator.onLine ? 'Saving…' : 'Saved offline' });
    saveTimerRef.current = window.setTimeout(() => {
      const db = databaseRef.current;
      const familyId = familyIdRef.current;
      if (!db || !familyId) return;
      void setDoc(doc(db, FAMILY_COLLECTION, familyId), { payload: data, updatedAt: serverTimestamp() }, { merge: true })
        .then(() => {
          lastCloudPayloadRef.current = payloadJson;
          updateState({ status: navigator.onLine ? 'synced' : 'offline', message: navigator.onLine ? 'Synced' : 'Saved offline' });
        })
        .catch(() => updateState({ status: 'offline', message: 'Saved offline' }));
    }, 350);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [data, localReady, updateState]);

  async function signInWithGoogle() {
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await setPersistence(auth, browserLocalPersistence);
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        await signInWithRedirect(auth, provider);
        return;
      }
      if (code !== 'auth/popup-closed-by-user') throw error;
    }
  }

  async function signOutUser() {
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    await signOut(getAuth(app));
  }

  async function createHousehold() {
    const user = userRef.current;
    const db = databaseRef.current;
    const email = normalizeEmail(user?.email ?? '');
    if (!user || !db || !email || email.includes('/')) throw new Error('Sign in with a valid Google account first');
    const familyId = user.uid;
    const access: AccessDocument = { email, familyId, role: 'owner' };
    const family: FamilyDocument<T> & { createdAt: unknown; updatedAt: unknown } = {
      ownerUid: user.uid,
      ownerEmail: email,
      supervisorEmails: [],
      viewerEmails: [],
      schemaVersion: 1,
      payload: data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const batch = writeBatch(db);
    batch.set(doc(db, FAMILY_COLLECTION, familyId), family);
    batch.set(doc(db, ACCESS_COLLECTION, email), access);
    await batch.commit();
    roleRef.current = 'owner';
    familyIdRef.current = familyId;
    lastCloudPayloadRef.current = JSON.stringify(data);
    cacheAccess(user, access);
    watchFamily(user, db, familyId);
  }

  async function updateMembers(members: FamilyMembers) {
    const db = databaseRef.current;
    const familyId = familyIdRef.current;
    if (!db || !familyId || roleRef.current !== 'owner') throw new Error('Only the household owner can manage access');
    const ownerEmail = normalizeEmail(userRef.current?.email ?? '');
    const supervisors = [...new Set(members.supervisorEmails.map(normalizeEmail).filter((email) => email && !email.includes('/') && email !== ownerEmail))];
    const viewers = [...new Set(members.viewerEmails.map(normalizeEmail).filter((email) => email && !email.includes('/') && email !== ownerEmail && !supervisors.includes(email)))];
    const currentEmails = new Set([...state.members.supervisorEmails, ...state.members.viewerEmails]);
    const nextEmails = new Set([...supervisors, ...viewers]);
    const batch = writeBatch(db);
    batch.update(doc(db, FAMILY_COLLECTION, familyId), { supervisorEmails: supervisors, viewerEmails: viewers, updatedAt: serverTimestamp() });
    for (const email of supervisors) batch.set(doc(db, ACCESS_COLLECTION, email), { email, familyId, role: 'supervisor' } satisfies AccessDocument);
    for (const email of viewers) batch.set(doc(db, ACCESS_COLLECTION, email), { email, familyId, role: 'viewer' } satisfies AccessDocument);
    for (const email of currentEmails) {
      if (!nextEmails.has(email)) batch.delete(doc(db, ACCESS_COLLECTION, email));
    }
    await batch.commit();
  }

  return { state, signInWithGoogle, signOutUser, createHousehold, updateMembers };
}

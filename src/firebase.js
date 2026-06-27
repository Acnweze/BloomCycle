import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

export const firebaseConfigured = Object.values(firebaseConfig).every(Boolean);

let auth = null;
let firebaseApp = null;
let authReady = Promise.resolve();
const DEMO_ACCOUNTS_KEY = 'bloomcycle-demo-accounts-v1';
const DEMO_SESSION_KEY = 'bloomcycle-demo-session-v1';
const demoListeners = new Set();

if (firebaseConfigured) {
  firebaseApp = initializeApp(firebaseConfig);
  auth = getAuth(firebaseApp);
  authReady = setPersistence(auth, browserLocalPersistence);
}

function readDemoAccounts() {
  try {
    return JSON.parse(localStorage.getItem(DEMO_ACCOUNTS_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeDemoAccounts(accounts) {
  localStorage.setItem(DEMO_ACCOUNTS_KEY, JSON.stringify(accounts));
}

function readDemoSession() {
  return localStorage.getItem(DEMO_SESSION_KEY) || '';
}

function writeDemoSession(uid) {
  if (uid) {
    localStorage.setItem(DEMO_SESSION_KEY, uid);
  } else {
    localStorage.removeItem(DEMO_SESSION_KEY);
  }
}

function getDemoUserByUid(uid) {
  return readDemoAccounts().find((account) => account.uid === uid) || null;
}

function getDemoUserByEmail(email) {
  const cleanEmail = email.trim().toLowerCase();
  return readDemoAccounts().find((account) => account.email === cleanEmail) || null;
}

function notifyDemoAuth(user) {
  demoListeners.forEach((listener) => listener(user));
}

function getDemoCurrentUser() {
  const user = getDemoUserByUid(readDemoSession());
  return user
    ? {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName
      }
    : null;
}

function requireApp() {
  if (!firebaseApp) {
    const error = new Error('Cloud backup is temporarily unavailable.');
    error.code = 'cloud/not-configured';
    throw error;
  }
  return firebaseApp;
}

function requireAuth() {
  if (!auth) {
    const error = new Error('Account service is temporarily unavailable. Please try again later.');
    error.code = 'auth/not-configured';
    throw error;
  }
  return auth;
}

export function observeAuth(callback) {
  if (!auth) {
    callback(getDemoCurrentUser());
    const listener = (user) => callback(user);
    demoListeners.add(listener);
    return () => demoListeners.delete(listener);
  }

  if (!auth) {
    callback(null);
    return () => {};
  }

  let unsubscribe = () => {};
  authReady.then(() => {
    unsubscribe = onAuthStateChanged(auth, callback);
  }).catch(() => callback(null));
  return () => unsubscribe();
}

export async function registerAccount(email, username, password) {
  if (!auth) {
    const cleanEmail = email.trim().toLowerCase();
    if (getDemoUserByEmail(cleanEmail)) {
      const error = new Error('An account already uses this email address.');
      error.code = 'auth/email-already-in-use';
      throw error;
    }
    const user = {
      uid: crypto.randomUUID(),
      email: cleanEmail,
      displayName: username.trim()
    };
    const accounts = readDemoAccounts();
    accounts.push({ ...user, password });
    writeDemoAccounts(accounts);
    writeDemoSession(user.uid);
    notifyDemoAuth(user);
    return user;
  }

  await authReady;
  const credential = await createUserWithEmailAndPassword(requireAuth(), email, password);
  await updateProfile(credential.user, { displayName: username });
  return credential.user;
}

export async function signInAccount(email, password) {
  if (!auth) {
    const account = getDemoUserByEmail(email);
    if (!account || account.password !== password) {
      const error = new Error('Email or password is incorrect.');
      error.code = 'auth/invalid-credential';
      throw error;
    }
    const user = {
      uid: account.uid,
      email: account.email,
      displayName: account.displayName
    };
    writeDemoSession(user.uid);
    notifyDemoAuth(user);
    return user;
  }

  await authReady;
  const credential = await signInWithEmailAndPassword(requireAuth(), email, password);
  return credential.user;
}

export async function sendResetEmail(email) {
  if (!auth) {
    if (!getDemoUserByEmail(email)) {
      const error = new Error('Email or password is incorrect.');
      error.code = 'auth/invalid-credential';
      throw error;
    }
    return;
  }

  await authReady;
  await sendPasswordResetEmail(requireAuth(), email);
}

export async function signOutAccount() {
  if (!auth) {
    writeDemoSession('');
    notifyDemoAuth(null);
    return;
  }

  await authReady;
  await signOut(requireAuth());
}

export async function saveCloudBackup(userId, data) {
  const { doc, getFirestore, serverTimestamp, setDoc } = await import('firebase/firestore');
  const database = getFirestore(requireApp());
  await setDoc(doc(database, 'users', userId, 'backups', 'cycleData'), {
    data,
    updatedAt: serverTimestamp()
  });
}

export async function loadCloudBackup(userId) {
  const record = await loadCloudBackupRecord(userId);
  return record?.data || null;
}

export async function loadCloudBackupRecord(userId) {
  const { doc, getDoc, getFirestore } = await import('firebase/firestore');
  const database = getFirestore(requireApp());
  const snapshot = await getDoc(doc(database, 'users', userId, 'backups', 'cycleData'));
  if (!snapshot.exists()) return null;
  const record = snapshot.data();
  return {
    data: record.data,
    updatedAt: record.updatedAt?.toMillis?.() || 0
  };
}

export async function deleteCloudBackup(userId) {
  const { deleteDoc, doc, getFirestore } = await import('firebase/firestore');
  const database = getFirestore(requireApp());
  await deleteDoc(doc(database, 'users', userId, 'backups', 'cycleData'));
}

export function getAuthMessage(error) {
  const messages = {
    'auth/email-already-in-use': 'An account already uses this email address.',
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/network-request-failed': 'Could not reach the account service. Check your connection and try again.',
    'auth/not-configured': 'Account service is temporarily unavailable. Please try again later.',
    'auth/too-many-requests': 'Too many attempts. Wait a moment before trying again.',
    'auth/user-disabled': 'This account has been disabled.',
    'auth/weak-password': 'Use a stronger password with at least 8 characters.'
  };

  return messages[error?.code] || error?.message || 'Could not complete this account request.';
}

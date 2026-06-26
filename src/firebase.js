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
let authReady = Promise.resolve();

if (firebaseConfigured) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  authReady = setPersistence(auth, browserLocalPersistence);
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
  await authReady;
  const credential = await createUserWithEmailAndPassword(requireAuth(), email, password);
  await updateProfile(credential.user, { displayName: username });
  return credential.user;
}

export async function signInAccount(email, password) {
  await authReady;
  const credential = await signInWithEmailAndPassword(requireAuth(), email, password);
  return credential.user;
}

export async function sendResetEmail(email) {
  await authReady;
  await sendPasswordResetEmail(requireAuth(), email);
}

export async function signOutAccount() {
  await authReady;
  await signOut(requireAuth());
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

import { initializeApp, getApps, type FirebaseOptions } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";

const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export function isFirebaseConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId
  );
}

function ensureFirebaseApp() {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase is not configured");
  }

  if (!getApps().length) {
    initializeApp(firebaseConfig);
  }

  return getAuth();
}

export async function firebaseLogin(email: string, password: string): Promise<string> {
  const auth = ensureFirebaseApp();
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user.getIdToken();
}

export async function firebaseRegister(email: string, password: string, displayName?: string): Promise<string> {
  const auth = ensureFirebaseApp();
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) {
    await updateProfile(credential.user, { displayName });
  }
  return credential.user.getIdToken();
}

export async function firebaseLogout(): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const auth = getAuth();
  await signOut(auth);
}

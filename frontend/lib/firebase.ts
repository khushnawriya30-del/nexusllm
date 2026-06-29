// Firebase initialization (client-only, lazy).
//
// Configured purely from NEXT_PUBLIC_FIREBASE_* env vars. When the web API key
// / project id / app id aren't set, Firebase is considered DISABLED and the app
// falls back to its original open / admin-key behaviour — nothing breaks if you
// haven't set up a Firebase project yet.

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyCE6oAEpUx6XFE-QM2O_bNVA287rLOlcXY",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "nexusllm-35fe0.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "nexusllm-35fe0",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "nexusllm-35fe0.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "475470500131",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:475470500131:web:7de38a5a6ed21b8726fc96",
};

export const firebaseEnabled = Boolean(
  config.apiKey && config.projectId && config.appId,
);

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;

export function getFirebaseAuth(): Auth | null {
  if (!firebaseEnabled) return null;
  if (typeof window === "undefined") return null;
  if (_auth) return _auth;
  _app = getApps().length ? getApps()[0] : initializeApp(config as any);
  _auth = getAuth(_app);
  return _auth;
}

export const googleProvider = new GoogleAuthProvider();

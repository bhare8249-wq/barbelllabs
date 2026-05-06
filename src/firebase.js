import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getAnalytics } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

// Firestore offline persistence (#226). Writes queue locally when offline and
// flush automatically on reconnect — critical for spotty gym wifi. The
// persistentLocalCache also gives us instant reads from the local IDB cache
// so the app feels snappy even before the network round-trip lands.
//
// `persistentMultipleTabManager` keeps multiple tabs of the app coherent.
// (Most users have one tab open; some power users keep History in another.
// Without this, only the first tab gets persistence.)
//
// This is separate from the IndexedDB store the workoutSession module uses
// for in-flight workout state. They coexist fine — Dexie's database is
// `barbellLabsSession`, Firebase's is `firestore/...`.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

export const googleProvider = new GoogleAuthProvider();
export const analytics = getAnalytics(app);

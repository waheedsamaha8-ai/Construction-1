import { initializeApp } from "firebase/app";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  Firestore,
} from "firebase/firestore";

export const firebaseConfig = {
  apiKey: "AIzaSyBEkZNYpRWhkNErbhFMgHZ3lDrg4irUz0s",
  authDomain: "construction-manager-pro-14ead.firebaseapp.com",
  projectId: "construction-manager-pro-14ead",
  storageBucket: "construction-manager-pro-14ead.firebasestorage.app",
  messagingSenderId: "133291168732",
  appId: "1:133291168732:web:a32944eea3e343e7453519",
};

// Reclaim localStorage space from old Firestore multi-tab keys and oversized vthumb_* entries
// so QuotaExceededError never occurs in browser storage.
try {
  if (typeof window !== "undefined" && window.localStorage) {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k) continue;
      if (
        k.startsWith("firestore_") ||
        k.startsWith("vthumb_")
      ) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => {
      try {
        window.localStorage.removeItem(k);
      } catch {}
    });
  }
} catch {}

// Initialize Firebase with user's specific project
export const app = initializeApp(firebaseConfig);

// Initialize Cloud Firestore with single-tab IndexedDB persistent cache:
// - Full offline + 0ms IndexedDB reads without touching 5MB localStorage (prevents WebStorageSharedClientState QuotaExceededError)
let firestoreInstance: Firestore;
try {
  firestoreInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentSingleTabManager({ forceOwnership: true }),
    }),
  });
} catch (e) {
  firestoreInstance = getFirestore(app);
}

export const db = firestoreInstance;

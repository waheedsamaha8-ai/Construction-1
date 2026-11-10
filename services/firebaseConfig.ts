import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

export const firebaseConfig = {
  apiKey: "AIzaSyBEkZNYpRWhkNErbhFMgHZ3lDrg4irUz0s",
  authDomain: "construction-manager-pro-14ead.firebaseapp.com",
  projectId: "construction-manager-pro-14ead",
  storageBucket: "construction-manager-pro-14ead.firebasestorage.app",
  messagingSenderId: "133291168732",
  appId: "1:133291168732:web:a32944eea3e343e7453519"
};

// Initialize Firebase with user's specific project
export const app = initializeApp(firebaseConfig);

// Initialize Cloud Firestore and get a reference to the service
export const db = getFirestore(app);
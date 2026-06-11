// firebase.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";


import {
  getAuth,
  GoogleAuthProvider
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA_psBUYTuQMfahaK8CrGAEkD84gDuYSpQ",
  authDomain: "notes-zero.firebaseapp.com",
  projectId: "notes-zero",
  storageBucket: "notes-zero.firebasestorage.app",
  messagingSenderId: "437012330577",
  appId: "1:437012330577:web:5d5db0c952e7ef4a486070"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const storage = getStorage(app);

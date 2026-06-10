// app.js

import {
  auth,
  googleProvider
} from "./firebase.js";

import {
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const userInfo = document.getElementById("userInfo");

const ADMIN_UIDS = [
  "m08YeUgzKehdtt6GywauQjiSZZC2"
];

function isAdmin(user) {
  return user && ADMIN_UIDS.includes(user.uid);
}

loginBtn.addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    console.error(error);
    alert("ログインに失敗しました");
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error(error);
    alert("ログアウトに失敗しました");
  }
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    loginBtn.classList.add("hidden");
    logoutBtn.classList.remove("hidden");
    userInfo.textContent = user.displayName || user.email || "ログイン中";

    document.querySelectorAll(".public-card").forEach((card) => {
      card.classList.remove("hidden");
    });

    document.querySelectorAll(".admin-card").forEach((card) => {
      card.classList.toggle("hidden", !isAdmin(user));
    });
  } else {
    loginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
    userInfo.textContent = "";

    document.querySelectorAll(".admin-card").forEach((card) => {
      card.classList.add("hidden");
    });
  }
});

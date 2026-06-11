// account.js

import {
  auth,
  googleProvider,
  db
} from "./firebase.js";

import {
  isAdmin
} from "./admin.js";

import {
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const userInfo = document.getElementById("userInfo");

const accountName = document.getElementById("accountName");
const accountEmail = document.getElementById("accountEmail");
const accountRoleBadge = document.getElementById("accountRoleBadge");
const accountUidText = document.getElementById("accountUidText");

const usageStatus = document.getElementById("usageStatus");
const usageGrid = document.getElementById("usageGrid");
const reloadUsageBtn = document.getElementById("reloadUsageBtn");

let currentUser = null;
let currentIsAdmin = false;

const USER_LIMITS = {
  quickMemos: 100,
  tasks: 100,
  sharedMemos: null
};

const COMMON_USAGE_ITEMS = [
  {
    key: "quickMemos",
    label: "クイックメモ",
    collectionName: "quickMemos",
    ownerField: "uid",
    limit: USER_LIMITS.quickMemos
  },
  {
    key: "tasks",
    label: "タスク",
    collectionName: "tasks",
    ownerField: "uid",
    limit: USER_LIMITS.tasks
  },
  {
    key: "sharedMemos",
    label: "共有メモ",
    collectionName: "sharedMemos",
    ownerField: "ownerUid",
    limit: USER_LIMITS.sharedMemos
  }
];

const ADMIN_USAGE_ITEMS = [
  {
    key: "normalMemos",
    label: "通常メモ",
    collectionName: "normalMemos",
    ownerField: "uid",
    limit: null
  },
  {
    key: "normalFolders",
    label: "通常メモフォルダ",
    collectionName: "normalFolders",
    ownerField: "uid",
    limit: null
  },
  {
    key: "chatRooms",
    label: "チャット部屋",
    collectionName: "chatRooms",
    ownerField: "uid",
    limit: null
  },
  {
    key: "chatMessages",
    label: "チャット吹き出し",
    collectionName: "chatMessages",
    ownerField: "uid",
    limit: null
  },
  {
    key: "diaries",
    label: "日記",
    collectionName: "diaries",
    ownerField: "uid",
    limit: null
  },
  {
    key: "dreamDiaries",
    label: "夢日記",
    collectionName: "dreamDiaries",
    ownerField: "uid",
    limit: null
  },
  {
    key: "musicMemos",
    label: "曲メモ",
    collectionName: "musicMemos",
    ownerField: "uid",
    limit: null
  },
  {
    key: "people",
    label: "人物帳",
    collectionName: "people",
    ownerField: "uid",
    limit: null
  },
  {
    key: "storyWorks",
    label: "ストーリー作品",
    collectionName: "storyWorks",
    ownerField: "uid",
    limit: null
  },
  {
    key: "storyEpisodes",
    label: "ストーリー本文",
    collectionName: "storyEpisodes",
    ownerField: "uid",
    limit: null
  }
];

/* ---------- auth ---------- */

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

reloadUsageBtn.addEventListener("click", async () => {
  if (!currentUser) {
    alert("先にログインしてください");
    return;
  }

  await loadUsage();
});

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  currentIsAdmin = isAdmin(user);

  if (!user) {
    showLoggedOutView();
    return;
  }

  showLoggedInView(user);
  await loadUsage();
});

/* ---------- view ---------- */

function showLoggedOutView() {
  loginBtn.classList.remove("hidden");
  logoutBtn.classList.add("hidden");

  userInfo.textContent = "未ログイン";

  accountName.textContent = "ログインしていません";
  accountEmail.textContent = "Googleでログインすると、アカウント情報と使用状況を確認できます。";

  accountRoleBadge.textContent = "未ログイン";
  accountRoleBadge.className = "account-role-badge user";

  accountUidText.textContent = "";

  usageStatus.textContent = "ログインすると使用状況を表示します。";
  usageGrid.innerHTML = "";
}

function showLoggedInView(user) {
  loginBtn.classList.add("hidden");
  logoutBtn.classList.remove("hidden");

  const displayName = user.displayName || "名前なし";
  const email = user.email || "メールアドレスなし";

  userInfo.textContent = displayName || email || "ログイン中";

  accountName.textContent = displayName;
  accountEmail.textContent = email;

  accountRoleBadge.textContent = currentIsAdmin ? "管理者" : "一般ユーザー";
  accountRoleBadge.className = currentIsAdmin
    ? "account-role-badge admin"
    : "account-role-badge user";

  accountUidText.textContent = `UID: ${user.uid}`;
}

/* ---------- usage ---------- */

async function loadUsage() {
  if (!currentUser) return;

  usageStatus.textContent = "使用状況を読み込み中...";
  usageGrid.innerHTML = "";

  try {
    const items = currentIsAdmin
      ? [...COMMON_USAGE_ITEMS, ...ADMIN_USAGE_ITEMS]
      : COMMON_USAGE_ITEMS;

    const results = [];

    for (const item of items) {
      const count = await countUserDocs(item.collectionName, item.ownerField);

      results.push({
        ...item,
        count
      });
    }

    renderUsage(results);

    usageStatus.textContent = currentIsAdmin
      ? "管理者用の使用状況も表示しています。"
      : "一般ユーザー向けの使用状況を表示しています。";
  } catch (error) {
    console.error(error);
    usageStatus.textContent = "使用状況の読み込みに失敗しました。";
  }
}

async function countUserDocs(collectionName, ownerField) {
  const q = query(
    collection(db, collectionName),
    where(ownerField, "==", currentUser.uid)
  );

  const snapshot = await getDocs(q);

  return snapshot.size;
}

function renderUsage(items) {
  usageGrid.innerHTML = "";

  if (items.length === 0) {
    usageGrid.innerHTML = `<p class="empty-text">表示できる使用状況がありません。</p>`;
    return;
  }

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "usage-card";

    const title = document.createElement("h3");
    title.textContent = item.label;

    const number = document.createElement("p");
    number.className = "usage-number";
    number.textContent = item.count;

    const limit = document.createElement("p");
    limit.className = "usage-limit";

    if (item.limit) {
      limit.textContent = `${item.count} / ${item.limit}件`;
    } else {
      limit.textContent = "上限なし";
    }

    const bar = document.createElement("div");
    bar.className = "usage-bar";

    const barInner = document.createElement("span");

    if (item.limit) {
      const percent = Math.min((item.count / item.limit) * 100, 100);
      barInner.style.width = `${percent}%`;
    } else {
      barInner.style.width = "100%";
    }

    bar.appendChild(barInner);

    card.appendChild(title);
    card.appendChild(number);
    card.appendChild(limit);
    card.appendChild(bar);

    usageGrid.appendChild(card);
  });
}

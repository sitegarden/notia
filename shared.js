import {
  auth,
  googleProvider,
  db
} from "./firebase.js";

import {
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  doc,
  getDocs,
  deleteDoc,
  updateDoc,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const reloadSharedBtn = document.getElementById("reloadSharedBtn");

const userInfo = document.getElementById("userInfo");
const sharedStatus = document.getElementById("sharedStatus");
const sharedMemoList = document.getElementById("sharedMemoList");

let currentUser = null;
let sharedMemos = [];

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

reloadSharedBtn.addEventListener("click", async () => {
  if (!currentUser) return;
  await loadSharedMemos();
});

onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  if (!user) {
    userInfo.textContent = "未ログイン";
    loginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
    sharedStatus.textContent = "ログインすると共有メモを表示します。";
    sharedMemoList.innerHTML = "";
    return;
  }

  userInfo.textContent = user.displayName || user.email || "ログイン中";
  loginBtn.classList.add("hidden");
  logoutBtn.classList.remove("hidden");

  await loadSharedMemos();
});

async function loadSharedMemos() {
  if (!currentUser) return;

  sharedStatus.textContent = "共有メモを読み込み中...";
  sharedMemoList.innerHTML = "";

  try {
    const q = query(
      collection(db, "sharedMemos"),
      where("ownerUid", "==", currentUser.uid)
    );

    const snapshot = await getDocs(q);

    sharedMemos = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));

    sharedMemos.sort((a, b) => {
      return getSortTime(b) - getSortTime(a);
    });

    renderSharedMemos();
  } catch (error) {
    console.error(error);
    sharedStatus.textContent = "共有メモの読み込みに失敗しました。";
  }
}

function renderSharedMemos() {
  sharedMemoList.innerHTML = "";

  if (sharedMemos.length === 0) {
    sharedStatus.textContent = "まだ共有しているメモはありません。";
    return;
  }

  sharedStatus.textContent = `${sharedMemos.length}件の共有メモがあります。`;

  sharedMemos.forEach((memo) => {
    const card = document.createElement("article");
    card.className = "shared-list-card";

    const head = document.createElement("div");
    head.className = "shared-list-card-head";

    const titleArea = document.createElement("div");

    const label = document.createElement("p");
    label.className = "label";
    label.textContent = memo.isPublic ? "PUBLIC" : "PRIVATE";

    const title = document.createElement("h3");
    title.textContent = memo.title || "無題のメモ";

    const date = document.createElement("small");
    date.textContent = makeDateText(memo.updatedAt || memo.createdAt);

    titleArea.appendChild(label);
    titleArea.appendChild(title);
    titleArea.appendChild(date);

    const actions = document.createElement("div");
    actions.className = "shared-list-actions";

    const openBtn = document.createElement("a");
    openBtn.textContent = "開く";
    openBtn.href = makeShareUrl(memo.id);
    openBtn.target = "_blank";
    openBtn.rel = "noopener";

    const copyBtn = document.createElement("button");
    copyBtn.textContent = "URLコピー";
    copyBtn.addEventListener("click", async () => {
      await copyShareUrl(memo.id);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "共有解除";
    deleteBtn.className = "danger-btn";
    deleteBtn.addEventListener("click", async () => {
      await deleteSharedMemo(memo.id);
    });

    actions.appendChild(openBtn);
    actions.appendChild(copyBtn);
    actions.appendChild(deleteBtn);

    head.appendChild(titleArea);
    head.appendChild(actions);

    const body = document.createElement("p");
    body.className = "shared-list-preview";
    body.textContent = makePreview(memo.body || "");

    const urlBox = document.createElement("input");
    urlBox.className = "shared-url-input";
    urlBox.value = makeShareUrl(memo.id);
    urlBox.readOnly = true;

    card.appendChild(head);

    if (memo.body) {
      card.appendChild(body);
    }

    card.appendChild(urlBox);

    sharedMemoList.appendChild(card);
  });
}

async function copyShareUrl(shareId) {
  const url = makeShareUrl(shareId);

  try {
    await navigator.clipboard.writeText(url);
    alert("共有URLをコピーしました");
  } catch (error) {
    console.error(error);
    alert("コピーに失敗しました");
  }
}

async function deleteSharedMemo(shareId) {
  const memo = sharedMemos.find((item) => item.id === shareId);

  const ok = confirm("この共有メモを解除しますか？\n共有URLから見られなくなります。");
  if (!ok) return;

  try {
    await deleteDoc(doc(db, "sharedMemos", shareId));

    if (memo && memo.sourceType === "quickMemo" && memo.sourceId) {
      await updateDoc(doc(db, "quickMemos", memo.sourceId), {
        shareId: "",
        sharedAt: null
      });
    }

    await loadSharedMemos();
    alert("共有を解除しました");
  } catch (error) {
    console.error(error);
    alert("共有解除に失敗しました");
  }
}
function makeShareUrl(shareId) {
  const url = new URL("share.html", location.href);
  url.searchParams.set("id", shareId);
  return url.toString();
}

function makePreview(text) {
  return String(text)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function makeDateText(date) {
  if (!date) return "日付なし";

  if (date.toDate) {
    const d = date.toDate();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  return "日付なし";
}

function getSortTime(item) {
  const date = item.updatedAt || item.createdAt;

  if (!date) return 0;

  if (date.toDate) {
    return date.toDate().getTime();
  }

  return 0;
}

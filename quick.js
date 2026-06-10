// quick.js

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
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const userInfo = document.getElementById("userInfo");

const addFolderBtn = document.getElementById("addFolderBtn");
const folderList = document.getElementById("folderList");
const folderSelect = document.getElementById("folderSelect");

const searchInput = document.getElementById("searchInput");
const newMemoBtn = document.getElementById("newMemoBtn");
const memoList = document.getElementById("memoList");
const memoEditor = document.getElementById("memoEditor");
const saveMemoBtn = document.getElementById("saveMemoBtn");
const deleteMemoBtn = document.getElementById("deleteMemoBtn");
const saveStatus = document.getElementById("saveStatus");

let currentUser = null;
let folders = [];
let memos = [];
let selectedFolderId = "all";
let selectedMemoId = null;

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

onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  if (user) {
    loginBtn.classList.add("hidden");
    logoutBtn.classList.remove("hidden");
    userInfo.textContent = user.displayName || user.email || "ログイン中";

    await loadFolders();
    await loadMemos();
  } else {
    loginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
    userInfo.textContent = "";

    folders = [];
    memos = [];
    selectedMemoId = null;
    memoEditor.value = "";
    memoList.innerHTML = "";
    renderFolders();
    renderFolderSelect();
    saveStatus.textContent = "ログインしてください";
  }
});

/* ---------- folders ---------- */

addFolderBtn.addEventListener("click", async () => {
  if (!currentUser) {
    alert("先にログインしてください");
    return;
  }

  const name = prompt("フォルダ名を入力してね");

  if (!name || !name.trim()) return;

  try {
    await addDoc(collection(db, "memoFolders"), {
      uid: currentUser.uid,
      name: name.trim(),
      createdAt: serverTimestamp()
    });

    await loadFolders();
  } catch (error) {
    console.error(error);
    alert("フォルダ作成に失敗しました");
  }
});

async function loadFolders() {
  if (!currentUser) return;

  const q = query(
    collection(db, "memoFolders"),
    where("uid", "==", currentUser.uid)
  );

  const snapshot = await getDocs(q);

  folders = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data()
  }));

  folders.sort((a, b) => {
    const aTime = a.createdAt?.seconds || 0;
    const bTime = b.createdAt?.seconds || 0;
    return aTime - bTime;
  });

  renderFolders();
  renderFolderSelect();
}
function renderFolders() {
  folderList.innerHTML = "";

  const allBtn = document.createElement("button");
  allBtn.className = selectedFolderId === "all" ? "folder-item active" : "folder-item";
  allBtn.textContent = "すべて";
  allBtn.addEventListener("click", () => {
    selectedFolderId = "all";
    renderFolders();
    renderMemos();
  });
  folderList.appendChild(allBtn);

  const noFolderBtn = document.createElement("button");
  noFolderBtn.className = selectedFolderId === "" ? "folder-item active" : "folder-item";
  noFolderBtn.textContent = "フォルダなし";
  noFolderBtn.addEventListener("click", () => {
    selectedFolderId = "";
    renderFolders();
    renderMemos();
  });
  folderList.appendChild(noFolderBtn);

  folders.forEach((folder) => {
    const btn = document.createElement("button");
    btn.className = selectedFolderId === folder.id ? "folder-item active" : "folder-item";
    btn.textContent = folder.name;

    btn.addEventListener("click", () => {
      selectedFolderId = folder.id;
      renderFolders();
      renderMemos();
    });

    folderList.appendChild(btn);
  });
}

function renderFolderSelect() {
  folderSelect.innerHTML = `<option value="">フォルダなし</option>`;

  folders.forEach((folder) => {
    const option = document.createElement("option");
    option.value = folder.id;
    option.textContent = folder.name;
    folderSelect.appendChild(option);
  });
}

/* ---------- memos ---------- */

newMemoBtn.addEventListener("click", () => {
  selectedMemoId = null;
  memoEditor.value = "";
  folderSelect.value = selectedFolderId !== "all" ? selectedFolderId : "";
  saveStatus.textContent = "新規メモ";
  renderMemos();
  memoEditor.focus();
});

saveMemoBtn.addEventListener("click", async () => {
  await saveMemo();
});

deleteMemoBtn.addEventListener("click", async () => {
  if (!currentUser) return;

  if (!selectedMemoId) {
    alert("削除するメモを選んでください");
    return;
  }

  const ok = confirm("このメモを削除しますか？");

  if (!ok) return;

  try {
    await deleteDoc(doc(db, "quickMemos", selectedMemoId));

    selectedMemoId = null;
    memoEditor.value = "";
    saveStatus.textContent = "削除しました";

    await loadMemos();
  } catch (error) {
    console.error(error);
    alert("削除に失敗しました");
  }
});

async function saveMemo() {
  if (!currentUser) {
    alert("先にログインしてください");
    return;
  }

  const body = memoEditor.value.trim();

  if (!body) {
    alert("メモが空です");
    return;
  }

  const title = getTitleFromBody(body);
  const folderId = folderSelect.value;

  try {
    if (selectedMemoId) {
      await updateDoc(doc(db, "quickMemos", selectedMemoId), {
        body,
        title,
        folderId,
        updatedAt: serverTimestamp()
      });

      saveStatus.textContent = "保存しました";
    } else {
      const docRef = await addDoc(collection(db, "quickMemos"), {
        uid: currentUser.uid,
        type: "quick",
        body,
        title,
        folderId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      selectedMemoId = docRef.id;
      saveStatus.textContent = "作成しました";
    }

    await loadMemos();
  } catch (error) {
    console.error(error);
    alert("保存に失敗しました");
  }
}

async function loadMemos() {
  if (!currentUser) return;

  const q = query(
    collection(db, "quickMemos"),
    where("uid", "==", currentUser.uid)
  );

  const snapshot = await getDocs(q);

  memos = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data()
  }));

  memos.sort((a, b) => {
    const aTime = a.updatedAt?.seconds || 0;
    const bTime = b.updatedAt?.seconds || 0;
    return bTime - aTime;
  });

  renderMemos();
}

function renderMemos() {
  memoList.innerHTML = "";

  const keyword = searchInput.value.trim().toLowerCase();

  let filtered = memos;

  if (selectedFolderId !== "all") {
    filtered = filtered.filter((memo) => (memo.folderId || "") === selectedFolderId);
  }

  if (keyword) {
    filtered = filtered.filter((memo) => {
      const title = (memo.title || "").toLowerCase();
      const body = (memo.body || "").toLowerCase();
      return title.includes(keyword) || body.includes(keyword);
    });
  }

  if (filtered.length === 0) {
    const empty = document.createElement("p");
    empty.className = "memo-preview";
    empty.textContent = "メモがありません";
    memoList.appendChild(empty);
    return;
  }

  filtered.forEach((memo) => {
    const btn = document.createElement("button");
    btn.className = selectedMemoId === memo.id ? "memo-item active" : "memo-item";

    const title = document.createElement("p");
    title.className = "memo-title";
    title.textContent = memo.title || "無題";

    const preview = document.createElement("p");
    preview.className = "memo-preview";
    preview.textContent = makePreview(memo.body);

    btn.appendChild(title);
    btn.appendChild(preview);

    btn.addEventListener("click", () => {
      selectedMemoId = memo.id;
      memoEditor.value = memo.body || "";
      folderSelect.value = memo.folderId || "";
      saveStatus.textContent = "編集中";
      renderMemos();
    });

    memoList.appendChild(btn);
  });
}

searchInput.addEventListener("input", () => {
  renderMemos();
});

memoEditor.addEventListener("input", () => {
  saveStatus.textContent = selectedMemoId ? "未保存の変更あり" : "新規メモ";
});

/* ---------- helpers ---------- */

function getTitleFromBody(body) {
  const firstLine = body
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  return firstLine || "無題";
}

function makePreview(body = "") {
  const lines = body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= 1) return "本文なし";

  return lines.slice(1).join(" ").slice(0, 60);
}

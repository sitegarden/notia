// story.js

import {
  auth,
  googleProvider,
  db
} from "./firebase.js";

import {
  blockIfNotAdmin
} from "./admin.js";

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
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const userInfo = document.getElementById("userInfo");

const addWorkBtn = document.getElementById("addWorkBtn");
const workList = document.getElementById("workList");

const addEpisodeBtn = document.getElementById("addEpisodeBtn");
const selectedWorkInfo = document.getElementById("selectedWorkInfo");
const episodeList = document.getElementById("episodeList");

const storyEditorTitle = document.getElementById("storyEditorTitle");
const episodeOrderInput = document.getElementById("episodeOrderInput");
const episodeTitleInput = document.getElementById("episodeTitleInput");
const episodeBodyInput = document.getElementById("episodeBodyInput");

const storyStatus = document.getElementById("storyStatus");
const newEpisodeBtn = document.getElementById("newEpisodeBtn");
const deleteEpisodeBtn = document.getElementById("deleteEpisodeBtn");
const saveEpisodeBtn = document.getElementById("saveEpisodeBtn");

let currentUser = null;
let works = [];
let episodes = [];

let selectedWorkId = null;
let selectedEpisodeId = null;

/* auth */

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
    blockIfNotAdmin(user);

    loginBtn.classList.add("hidden");
    logoutBtn.classList.remove("hidden");
    userInfo.textContent = user.displayName || user.email || "ログイン中";
    storyStatus.textContent = "ストーリーを保存できます";

    await loadWorks();
  } else {
    loginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
    userInfo.textContent = "";

    works = [];
    episodes = [];
    selectedWorkId = null;
    selectedEpisodeId = null;

    renderWorks();
    renderEpisodes();
    clearEditor();

    storyStatus.textContent = "ログインしてください";
  }
});

/* works */

addWorkBtn.addEventListener("click", async () => {
  await createWork();
});

async function createWork() {
  if (!currentUser) {
    alert("先にログインしてください");
    return;
  }

  const title = prompt("作品タイトルを入力してね");

  if (!title || !title.trim()) return;

  const description = prompt("作品説明を書く？ 空でもOK") || "";

  try {
    const docRef = await addDoc(collection(db, "storyWorks"), {
      uid: currentUser.uid,
      title: title.trim(),
      description: description.trim(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    selectedWorkId = docRef.id;
    selectedEpisodeId = null;

    await loadWorks();
    await loadEpisodes();
  } catch (error) {
    console.error(error);
    alert("作品作成に失敗しました");
  }
}

async function loadWorks() {
  if (!currentUser) return;

  const q = query(
    collection(db, "storyWorks"),
    where("uid", "==", currentUser.uid)
  );

  const snapshot = await getDocs(q);

  works = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data()
  }));

  works.sort((a, b) => {
    const aTime = a.updatedAt?.seconds || 0;
    const bTime = b.updatedAt?.seconds || 0;
    return bTime - aTime;
  });

  if (!selectedWorkId && works.length > 0) {
    selectedWorkId = works[0].id;
  }

  renderWorks();

  if (selectedWorkId) {
    await loadEpisodes();
  } else {
    renderEpisodes();
    clearEditor();
  }
}

function renderWorks() {
  workList.innerHTML = "";

  if (works.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-text";
    empty.textContent = "作品がありません";
    workList.appendChild(empty);
    return;
  }

  works.forEach((work) => {
    const btn = document.createElement("button");
    btn.className = selectedWorkId === work.id ? "story-item active" : "story-item";

    const title = document.createElement("p");
    title.className = "story-item-title";
    title.textContent = work.title || "無題の作品";

    const sub = document.createElement("p");
    sub.className = "story-item-sub";
    sub.textContent = work.description || "説明なし";

    btn.appendChild(title);
    btn.appendChild(sub);

    btn.addEventListener("click", async () => {
      selectedWorkId = work.id;
      selectedEpisodeId = null;
      clearEditor();

      renderWorks();
      await loadEpisodes();
    });

    workList.appendChild(btn);
  });
}

/* episodes */

addEpisodeBtn.addEventListener("click", () => {
  prepareNewEpisode();
});

newEpisodeBtn.addEventListener("click", () => {
  prepareNewEpisode();
});

function prepareNewEpisode() {
  if (!selectedWorkId) {
    alert("先に作品を選んでください");
    return;
  }

  selectedEpisodeId = null;

  const nextOrder = episodes.length + 1;

  episodeOrderInput.value = nextOrder;
  episodeTitleInput.value = `第${nextOrder}話`;
  episodeBodyInput.value = "";

  storyEditorTitle.textContent = "新規エピソード";
  storyStatus.textContent = "新規エピソード";

  renderEpisodes();
  episodeTitleInput.focus();
}

async function loadEpisodes() {
  if (!currentUser || !selectedWorkId) return;

  const q = query(
    collection(db, "storyEpisodes"),
    where("uid", "==", currentUser.uid),
    where("workId", "==", selectedWorkId)
  );

  const snapshot = await getDocs(q);

  episodes = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data()
  }));

  episodes.sort((a, b) => {
    const aOrder = Number(a.order || 0);
    const bOrder = Number(b.order || 0);

    if (aOrder !== bOrder) return aOrder - bOrder;

    const aTime = a.createdAt?.seconds || 0;
    const bTime = b.createdAt?.seconds || 0;

    return aTime - bTime;
  });

  renderEpisodes();
  updateSelectedWorkInfo();
}

function renderEpisodes() {
  episodeList.innerHTML = "";

  const work = getSelectedWork();

  if (!work) {
    selectedWorkInfo.textContent = "作品を選択してください";
    const empty = document.createElement("p");
    empty.className = "empty-text";
    empty.textContent = "話がありません";
    episodeList.appendChild(empty);
    return;
  }

  updateSelectedWorkInfo();

  if (episodes.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-text";
    empty.textContent = "この作品にはまだ話がありません";
    episodeList.appendChild(empty);
    return;
  }

  episodes.forEach((episode) => {
    const btn = document.createElement("button");
    btn.className = selectedEpisodeId === episode.id ? "story-item active" : "story-item";

    const title = document.createElement("p");
    title.className = "story-item-title";
    title.textContent = episode.title || "無題の話";

    const sub = document.createElement("p");
    sub.className = "story-item-sub";
    sub.textContent = `並び順：${episode.order || 0}`;

    btn.appendChild(title);
    btn.appendChild(sub);

    btn.addEventListener("click", () => {
      selectEpisode(episode);
    });

    episodeList.appendChild(btn);
  });
}

function selectEpisode(episode) {
  selectedEpisodeId = episode.id;

  episodeOrderInput.value = episode.order || "";
  episodeTitleInput.value = episode.title || "";
  episodeBodyInput.value = episode.body || "";

  storyEditorTitle.textContent = episode.title || "無題の話";
  storyStatus.textContent = "編集中";

  renderEpisodes();
}

saveEpisodeBtn.addEventListener("click", async () => {
  await saveEpisode();
});

async function saveEpisode() {
  if (!currentUser) {
    alert("先にログインしてください");
    return;
  }

  if (!selectedWorkId) {
    alert("先に作品を選んでください");
    return;
  }

  const order = Number(episodeOrderInput.value || 0);
  const title = episodeTitleInput.value.trim();
  const body = episodeBodyInput.value.trim();

  if (!title && !body) {
    alert("タイトルか本文を入力してください");
    return;
  }

  const safeTitle = title || "無題の話";

  try {
    if (selectedEpisodeId) {
      await updateDoc(doc(db, "storyEpisodes", selectedEpisodeId), {
        order,
        title: safeTitle,
        body,
        updatedAt: serverTimestamp()
      });

      storyStatus.textContent = "保存しました";
    } else {
      const docRef = await addDoc(collection(db, "storyEpisodes"), {
        uid: currentUser.uid,
        workId: selectedWorkId,
        order,
        title: safeTitle,
        body,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      selectedEpisodeId = docRef.id;
      storyStatus.textContent = "作成しました";
    }

    await updateDoc(doc(db, "storyWorks", selectedWorkId), {
      updatedAt: serverTimestamp()
    });

    await loadEpisodes();
    await loadWorks();

    const selected = episodes.find((episode) => episode.id === selectedEpisodeId);
    if (selected) {
      selectEpisode(selected);
    }
  } catch (error) {
    console.error(error);
    alert("エピソード保存に失敗しました");
  }
}

deleteEpisodeBtn.addEventListener("click", async () => {
  await deleteEpisode();
});

async function deleteEpisode() {
  if (!currentUser) {
    alert("先にログインしてください");
    return;
  }

  if (!selectedEpisodeId) {
    alert("削除する話を選んでください");
    return;
  }

  const ok = confirm("この話を削除しますか？");

  if (!ok) return;

  try {
    await deleteDoc(doc(db, "storyEpisodes", selectedEpisodeId));

    selectedEpisodeId = null;
    clearEditor();
    storyStatus.textContent = "削除しました";

    await loadEpisodes();

    if (selectedWorkId) {
      await updateDoc(doc(db, "storyWorks", selectedWorkId), {
        updatedAt: serverTimestamp()
      });
      await loadWorks();
    }
  } catch (error) {
    console.error(error);
    alert("エピソード削除に失敗しました");
  }
}

/* editor status */

[
  episodeOrderInput,
  episodeTitleInput,
  episodeBodyInput
].forEach((input) => {
  input.addEventListener("input", () => {
    storyStatus.textContent = selectedEpisodeId
      ? "未保存の変更あり"
      : "新規エピソード";
  });
});

/* helpers */

function getSelectedWork() {
  return works.find((work) => work.id === selectedWorkId);
}

function updateSelectedWorkInfo() {
  const work = getSelectedWork();

  if (!work) {
    selectedWorkInfo.textContent = "作品を選択してください";
    return;
  }

  const count = episodes.length;
  selectedWorkInfo.textContent = `${work.title || "無題の作品"} / ${count}件`;
}

function clearEditor() {
  storyEditorTitle.textContent = "話を選択";
  episodeOrderInput.value = "";
  episodeTitleInput.value = "";
  episodeBodyInput.value = "";
}

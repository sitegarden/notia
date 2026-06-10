// music.js

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
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const userInfo = document.getElementById("userInfo");

const musicFormTitle = document.getElementById("musicFormTitle");
const musicTitleInput = document.getElementById("musicTitleInput");
const musicArtistInput = document.getElementById("musicArtistInput");
const musicGenreInput = document.getElementById("musicGenreInput");
const musicUrlInput = document.getElementById("musicUrlInput");
const musicLyricsInput = document.getElementById("musicLyricsInput");
const musicTranslationInput = document.getElementById("musicTranslationInput");

const musicStatus = document.getElementById("musicStatus");
const newMusicBtn = document.getElementById("newMusicBtn");
const deleteMusicBtn = document.getElementById("deleteMusicBtn");
const saveMusicBtn = document.getElementById("saveMusicBtn");

const musicSearchInput = document.getElementById("musicSearchInput");
const musicGenreFilter = document.getElementById("musicGenreFilter");
const musicList = document.getElementById("musicList");

let currentUser = null;
let musicMemos = [];
let selectedMusicId = null;

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
    loginBtn.classList.add("hidden");
    logoutBtn.classList.remove("hidden");
    userInfo.textContent = user.displayName || user.email || "ログイン中";
    musicStatus.textContent = "曲メモを保存できます";

    await loadMusicMemos();
  } else {
    loginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
    userInfo.textContent = "";

    musicMemos = [];
    selectedMusicId = null;
    clearMusicForm();
    musicList.innerHTML = "";
    musicStatus.textContent = "ログインしてください";
    renderGenreFilter();
  }
});

/* events */

newMusicBtn.addEventListener("click", () => {
  selectedMusicId = null;
  clearMusicForm();
  musicStatus.textContent = "新規曲メモ";
  renderMusicList();
});

saveMusicBtn.addEventListener("click", async () => {
  await saveMusicMemo();
});

deleteMusicBtn.addEventListener("click", async () => {
  await deleteMusicMemo();
});

musicSearchInput.addEventListener("input", () => {
  renderMusicList();
});

musicGenreFilter.addEventListener("change", () => {
  renderMusicList();
});

[
  musicTitleInput,
  musicArtistInput,
  musicGenreInput,
  musicUrlInput,
  musicLyricsInput,
  musicTranslationInput
].forEach((input) => {
  input.addEventListener("input", () => {
    musicStatus.textContent = selectedMusicId
      ? "未保存の変更あり"
      : "新規曲メモ";
  });
});

/* load */

async function loadMusicMemos() {
  if (!currentUser) return;

  const q = query(
    collection(db, "musicMemos"),
    where("uid", "==", currentUser.uid)
  );

  const snapshot = await getDocs(q);

  musicMemos = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data()
  }));

  musicMemos.sort((a, b) => {
    const aTime = a.updatedAt?.seconds || 0;
    const bTime = b.updatedAt?.seconds || 0;
    return bTime - aTime;
  });

  renderGenreFilter();
  renderMusicList();
}

/* save */

async function saveMusicMemo() {
  if (!currentUser) {
    alert("先にログインしてください");
    return;
  }

  const title = musicTitleInput.value.trim();
  const artist = musicArtistInput.value.trim();
  const genre = musicGenreInput.value.trim();
  const url = musicUrlInput.value.trim();
  const lyrics = musicLyricsInput.value.trim();
  const translation = musicTranslationInput.value.trim();

  if (!title) {
    alert("曲名を入力してください");
    return;
  }

  try {
    if (selectedMusicId) {
      await updateDoc(doc(db, "musicMemos", selectedMusicId), {
        title,
        artist,
        genre,
        url,
        lyrics,
        translation,
        updatedAt: serverTimestamp()
      });

      musicStatus.textContent = "保存しました";
    } else {
      const docRef = await addDoc(collection(db, "musicMemos"), {
        uid: currentUser.uid,
        title,
        artist,
        genre,
        url,
        lyrics,
        translation,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      selectedMusicId = docRef.id;
      musicStatus.textContent = "作成しました";
    }

    await loadMusicMemos();
  } catch (error) {
    console.error(error);
    alert("曲メモの保存に失敗しました");
  }
}

/* delete */

async function deleteMusicMemo() {
  if (!currentUser) {
    alert("先にログインしてください");
    return;
  }

  if (!selectedMusicId) {
    alert("削除する曲メモを選んでください");
    return;
  }

  const ok = confirm("この曲メモを削除しますか？");

  if (!ok) return;

  try {
    await deleteDoc(doc(db, "musicMemos", selectedMusicId));

    selectedMusicId = null;
    clearMusicForm();
    musicStatus.textContent = "削除しました";

    await loadMusicMemos();
  } catch (error) {
    console.error(error);
    alert("曲メモの削除に失敗しました");
  }
}

/* render */

function renderMusicList() {
  musicList.innerHTML = "";

  const keyword = musicSearchInput.value.trim().toLowerCase();
  const genreFilter = musicGenreFilter.value;

  let filtered = musicMemos;

  if (genreFilter !== "all") {
    filtered = filtered.filter((memo) => (memo.genre || "") === genreFilter);
  }

  if (keyword) {
    filtered = filtered.filter((memo) => {
      const title = (memo.title || "").toLowerCase();
      const artist = (memo.artist || "").toLowerCase();
      const genre = (memo.genre || "").toLowerCase();
      const lyrics = (memo.lyrics || "").toLowerCase();
      const translation = (memo.translation || "").toLowerCase();

      return (
        title.includes(keyword) ||
        artist.includes(keyword) ||
        genre.includes(keyword) ||
        lyrics.includes(keyword) ||
        translation.includes(keyword)
      );
    });
  }

  if (filtered.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-text";
    empty.textContent = "曲メモがありません";
    musicList.appendChild(empty);
    return;
  }

  filtered.forEach((memo) => {
    const card = document.createElement("button");
    card.className = selectedMusicId === memo.id
      ? "music-card active"
      : "music-card";

    const disc = document.createElement("div");
    disc.className = "music-disc";
    disc.textContent = "♪";

    const main = document.createElement("div");
    main.className = "music-card-main";

    const title = document.createElement("p");
    title.className = "music-title";
    title.textContent = memo.title || "無題の曲";

    const meta = document.createElement("p");
    meta.className = "music-meta";
    meta.textContent = makeMetaText(memo);

    const preview = document.createElement("p");
    preview.className = "music-preview";
    preview.textContent = makeMusicPreview(memo);

    main.appendChild(title);
    main.appendChild(meta);
    main.appendChild(preview);

    if (memo.url) {
      const link = document.createElement("a");
      link.className = "music-link";
      link.href = memo.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "URLを開く";

      link.addEventListener("click", (event) => {
        event.stopPropagation();
      });

      main.appendChild(link);
    }

    card.appendChild(disc);
    card.appendChild(main);

    card.addEventListener("click", () => {
      selectMusicMemo(memo);
    });

    musicList.appendChild(card);
  });
}

function renderGenreFilter() {
  const currentValue = musicGenreFilter.value || "all";

  musicGenreFilter.innerHTML = `<option value="all">すべてのジャンル</option>`;

  const genres = [...new Set(
    musicMemos
      .map((memo) => memo.genre || "")
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, "ja"));

  genres.forEach((genre) => {
    const option = document.createElement("option");
    option.value = genre;
    option.textContent = genre;
    musicGenreFilter.appendChild(option);
  });

  if ([...musicGenreFilter.options].some((option) => option.value === currentValue)) {
    musicGenreFilter.value = currentValue;
  } else {
    musicGenreFilter.value = "all";
  }
}

/* select */

function selectMusicMemo(memo) {
  selectedMusicId = memo.id;

  musicFormTitle.textContent = "曲メモを編集";
  musicTitleInput.value = memo.title || "";
  musicArtistInput.value = memo.artist || "";
  musicGenreInput.value = memo.genre || "";
  musicUrlInput.value = memo.url || "";
  musicLyricsInput.value = memo.lyrics || "";
  musicTranslationInput.value = memo.translation || "";

  musicStatus.textContent = "編集中";

  renderMusicList();
}

/* helpers */

function clearMusicForm() {
  musicFormTitle.textContent = "曲メモを追加";
  musicTitleInput.value = "";
  musicArtistInput.value = "";
  musicGenreInput.value = "";
  musicUrlInput.value = "";
  musicLyricsInput.value = "";
  musicTranslationInput.value = "";
}

function makeMetaText(memo) {
  const parts = [];

  if (memo.artist) parts.push(memo.artist);
  if (memo.genre) parts.push(memo.genre);

  return parts.length ? parts.join(" / ") : "アーティスト・ジャンル未設定";
}

function makeMusicPreview(memo) {
  if (memo.lyrics) {
    return memo.lyrics.replace(/\s+/g, " ").slice(0, 80);
  }

  if (memo.translation) {
    return memo.translation.replace(/\s+/g, " ").slice(0, 80);
  }

  return "歌詞・和訳なし";
}

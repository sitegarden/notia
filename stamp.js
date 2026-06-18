// stamp.js

import {
  auth,
  googleProvider,
  db,
  storage
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

import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const userInfo = document.getElementById("userInfo");

const stampFormTitle = document.getElementById("stampFormTitle");
const newStampPackBtn = document.getElementById("newStampPackBtn");

const packTitleInput = document.getElementById("packTitleInput");
const packCharacterInput = document.getElementById("packCharacterInput");
const packStatusInput = document.getElementById("packStatusInput");
const packTagsInput = document.getElementById("packTagsInput");
const packMemoInput = document.getElementById("packMemoInput");

const mainImageInput = document.getElementById("mainImageInput");
const tabImageInput = document.getElementById("tabImageInput");
const stampImagesInput = document.getElementById("stampImagesInput");
const stampSelectedText = document.getElementById("stampSelectedText");
const stampDraftList = document.getElementById("stampDraftList");

const stampStatus = document.getElementById("stampStatus");
const saveStampPackBtn = document.getElementById("saveStampPackBtn");
const deleteStampPackBtn = document.getElementById("deleteStampPackBtn");
const reloadStampPacksBtn = document.getElementById("reloadStampPacksBtn");

const stampSearchInput = document.getElementById("stampSearchInput");
const stampStatusFilter = document.getElementById("stampStatusFilter");
const stampPackList = document.getElementById("stampPackList");

let currentUser = null;
let editingPackId = null;
let stampPacks = [];

let mainImageFile = null;
let tabImageFile = null;
let stampDrafts = [];

let existingMainImage = null;
let existingTabImage = null;
let existingStickers = [];

const MAX_FILE_SIZE = 5 * 1024 * 1024;

function setStatus(message) {
  stampStatus.textContent = message;
}

function escapeHtml(text = "") {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(timestamp) {
  if (!timestamp?.toDate) return "";
  return timestamp.toDate().toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function validateFile(file) {
  if (!file) return true;

  if (!file.type.startsWith("image/")) {
    alert("画像ファイルを選んでください。");
    return false;
  }

  if (file.size > MAX_FILE_SIZE) {
    alert("画像は5MB以下にしてください。");
    return false;
  }

  return true;
}

function createStoragePath(userId, file, type) {
  const ext = file.name.split(".").pop() || "png";
  const safeExt = ext.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `stampPacks/${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}_${type}.${safeExt}`;
}

async function uploadImage(file, type) {
  if (!file || !currentUser) return null;

  const storagePath = createStoragePath(currentUser.uid, file, type);
  const imageRef = ref(storage, storagePath);

  await uploadBytes(imageRef, file);
  const url = await getDownloadURL(imageRef);

  return {
    url,
    storagePath,
    name: file.name,
    size: file.size,
    type: file.type
  };
}

async function safeDeleteStorage(storagePath) {
  if (!storagePath) return;

  try {
    await deleteObject(ref(storage, storagePath));
  } catch (error) {
    console.warn("Storage削除失敗:", error);
  }
}

function resetForm() {
  editingPackId = null;

  packTitleInput.value = "";
  packCharacterInput.value = "";
  packStatusInput.value = "制作中";
  packTagsInput.value = "";
  packMemoInput.value = "";

  mainImageInput.value = "";
  tabImageInput.value = "";
  stampImagesInput.value = "";

  mainImageFile = null;
  tabImageFile = null;
  stampDrafts = [];

  existingMainImage = null;
  existingTabImage = null;
  existingStickers = [];

  stampSelectedText.textContent = "まだスタンプ画像は選択されていません。";
  stampFormTitle.textContent = "スタンプセットを追加";
  deleteStampPackBtn.classList.add("hidden");

  renderDraftList();
  setStatus(currentUser ? "保存できます" : "ログインしてください");
}

function renderDraftList() {
  const items = [];

  if (existingMainImage?.url) {
    items.push(`
      <div class="stamp-draft-card special">
        <img src="${escapeHtml(existingMainImage.url)}" alt="メイン画像" />
        <div>
          <strong>メイン画像</strong>
          <p>保存済み</p>
        </div>
      </div>
    `);
  }

  if (existingTabImage?.url) {
    items.push(`
      <div class="stamp-draft-card special tab-preview">
        <img src="${escapeHtml(existingTabImage.url)}" alt="タブ画像" />
        <div>
          <strong>タブ画像</strong>
          <p>保存済み</p>
        </div>
      </div>
    `);
  }

  if (mainImageFile) {
    items.push(`
      <div class="stamp-draft-card special">
        <img src="${URL.createObjectURL(mainImageFile)}" alt="新しいメイン画像" />
        <div>
          <strong>新しいメイン画像</strong>
          <p>${escapeHtml(mainImageFile.name)}</p>
        </div>
      </div>
    `);
  }

  if (tabImageFile) {
    items.push(`
      <div class="stamp-draft-card special tab-preview">
        <img src="${URL.createObjectURL(tabImageFile)}" alt="新しいタブ画像" />
        <div>
          <strong>新しいタブ画像</strong>
          <p>${escapeHtml(tabImageFile.name)}</p>
        </div>
      </div>
    `);
  }

  existingStickers.forEach((sticker, index) => {
    items.push(`
      <div class="stamp-draft-card">
        <img src="${escapeHtml(sticker.url)}" alt="保存済みスタンプ ${index + 1}" />
        <input
          type="text"
          value="${escapeHtml(sticker.text || "")}"
          data-existing-index="${index}"
          placeholder="セリフメモ"
        />
        <button type="button" data-remove-existing="${index}">×</button>
      </div>
    `);
  });

  stampDrafts.forEach((draft, index) => {
    items.push(`
      <div class="stamp-draft-card">
        <img src="${URL.createObjectURL(draft.file)}" alt="追加スタンプ ${index + 1}" />
        <input
          type="text"
          value="${escapeHtml(draft.text || "")}"
          data-draft-index="${index}"
          placeholder="セリフメモ"
        />
        <button type="button" data-remove-draft="${index}">×</button>
      </div>
    `);
  });

  stampDraftList.innerHTML = items.length
    ? items.join("")
    : `<p class="empty-text">スタンプ画像を追加するとここに並びます。</p>`;
}

function syncDraftTexts() {
  stampDraftList.querySelectorAll("[data-draft-index]").forEach((input) => {
    const index = Number(input.dataset.draftIndex);
    if (stampDrafts[index]) {
      stampDrafts[index].text = input.value;
    }
  });

  stampDraftList.querySelectorAll("[data-existing-index]").forEach((input) => {
    const index = Number(input.dataset.existingIndex);
    if (existingStickers[index]) {
      existingStickers[index].text = input.value;
    }
  });
}

function renderPacks() {
  const searchText = stampSearchInput.value.trim().toLowerCase();
  const statusFilter = stampStatusFilter.value;

  const filtered = stampPacks.filter((pack) => {
    const joined = [
      pack.title,
      pack.character,
      pack.tags,
      pack.memo,
      pack.status,
      ...(pack.stickers || []).map((item) => item.text || "")
    ]
      .join(" ")
      .toLowerCase();

    const matchSearch = !searchText || joined.includes(searchText);
    const matchStatus = statusFilter === "all" || pack.status === statusFilter;

    return matchSearch && matchStatus;
  });

  if (!filtered.length) {
    stampPackList.innerHTML = `<p class="empty-text">スタンプセットがありません。</p>`;
    return;
  }

  stampPackList.innerHTML = filtered.map((pack) => {
    const mainUrl =
      pack.mainImage?.url ||
      pack.stickers?.[0]?.url ||
      "";

    const stickerCount = pack.stickers?.length || 0;
    const created = formatDate(pack.createdAt);
    const updated = formatDate(pack.updatedAt);

    return `
      <article class="stamp-pack-card" data-id="${pack.id}">
        <div class="stamp-pack-thumb">
          ${
            mainUrl
              ? `<img src="${escapeHtml(mainUrl)}" alt="${escapeHtml(pack.title)}" />`
              : `<span>NO IMAGE</span>`
          }
        </div>

        <div class="stamp-pack-body">
          <div class="stamp-pack-title-row">
            <h3>${escapeHtml(pack.title || "無題のスタンプ")}</h3>
            <span class="stamp-status-badge">${escapeHtml(pack.status || "制作中")}</span>
          </div>

          <p class="stamp-pack-meta">
            ${escapeHtml(pack.character || "キャラ未設定")} / ${stickerCount}枚
          </p>

          ${
            pack.tags
              ? `<p class="stamp-pack-tags">${escapeHtml(pack.tags)}</p>`
              : ""
          }

          ${
            pack.memo
              ? `<p class="stamp-pack-memo">${escapeHtml(pack.memo)}</p>`
              : ""
          }

          <div class="stamp-mini-grid">
            ${(pack.stickers || []).slice(0, 8).map((sticker) => `
              <div class="stamp-mini">
                <img src="${escapeHtml(sticker.url)}" alt="${escapeHtml(sticker.text || "")}" />
              </div>
            `).join("")}
          </div>

          <p class="stamp-date">
            ${updated ? `更新：${updated}` : created ? `作成：${created}` : ""}
          </p>
        </div>
      </article>
    `;
  }).join("");
}

async function loadStampPacks() {
  if (!currentUser) {
    stampPacks = [];
    renderPacks();
    return;
  }

  setStatus("読み込み中...");

  const q = query(
  collection(db, "stampPacks"),
  where("uid", "==", currentUser.uid)
);

const snapshot = await getDocs(q);

stampPacks = snapshot.docs
  .map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data()
  }))
  .sort((a, b) => {
    const aTime = a.updatedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
    const bTime = b.updatedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
    return bTime - aTime;
  });
  renderPacks();
  setStatus("読み込み完了");
}

function editPack(packId) {
  const pack = stampPacks.find((item) => item.id === packId);
  if (!pack) return;

  editingPackId = pack.id;

  packTitleInput.value = pack.title || "";
  packCharacterInput.value = pack.character || "";
  packStatusInput.value = pack.status || "制作中";
  packTagsInput.value = pack.tags || "";
  packMemoInput.value = pack.memo || "";

  mainImageInput.value = "";
  tabImageInput.value = "";
  stampImagesInput.value = "";

  mainImageFile = null;
  tabImageFile = null;
  stampDrafts = [];

  existingMainImage = pack.mainImage || null;
  existingTabImage = pack.tabImage || null;
  existingStickers = [...(pack.stickers || [])];

  stampFormTitle.textContent = "スタンプセットを編集";
  deleteStampPackBtn.classList.remove("hidden");

  renderDraftList();
  setStatus("編集中");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function saveStampPack() {
  if (!currentUser) {
    alert("ログインしてください。");
    return;
  }

  syncDraftTexts();

  const title = packTitleInput.value.trim();
  const character = packCharacterInput.value.trim();
  const status = packStatusInput.value;
  const tags = packTagsInput.value.trim();
  const memo = packMemoInput.value.trim();

  if (!title) {
    alert("セット名を入力してください。");
    return;
  }

  saveStampPackBtn.disabled = true;
  setStatus("保存中...");

  try {
    let mainImage = existingMainImage;
    let tabImage = existingTabImage;

    if (mainImageFile) {
      if (existingMainImage?.storagePath) {
        await safeDeleteStorage(existingMainImage.storagePath);
      }
      mainImage = await uploadImage(mainImageFile, "main");
    }

    if (tabImageFile) {
      if (existingTabImage?.storagePath) {
        await safeDeleteStorage(existingTabImage.storagePath);
      }
      tabImage = await uploadImage(tabImageFile, "tab");
    }

    const uploadedStickers = [];

    for (let i = 0; i < stampDrafts.length; i++) {
      const draft = stampDrafts[i];
      const uploaded = await uploadImage(draft.file, `stamp_${i + 1}`);

      uploadedStickers.push({
        ...uploaded,
        text: draft.text || "",
        order: existingStickers.length + i + 1
      });
    }

    const stickers = [
      ...existingStickers.map((item, index) => ({
        ...item,
        order: index + 1
      })),
      ...uploadedStickers
    ];

    const payload = {
      uid: currentUser.uid,
      title,
      character,
      status,
      tags,
      memo,
      mainImage,
      tabImage,
      stickers,
      updatedAt: serverTimestamp()
    };

    if (editingPackId) {
      await updateDoc(doc(db, "stampPacks", editingPackId), payload);
    } else {
      await addDoc(collection(db, "stampPacks"), {
        ...payload,
        createdAt: serverTimestamp()
      });
    }

    resetForm();
    await loadStampPacks();
    setStatus("保存しました");
  } catch (error) {
    console.error(error);
    setStatus("保存に失敗しました");
    alert("保存に失敗しました。");
  } finally {
    saveStampPackBtn.disabled = false;
  }
}

async function deleteStampPack() {
  if (!currentUser || !editingPackId) return;

  const ok = confirm("このスタンプセットを削除しますか？画像もStorageから削除します。");
  if (!ok) return;

  const pack = stampPacks.find((item) => item.id === editingPackId);
  if (!pack) return;

  setStatus("削除中...");

  try {
    if (pack.mainImage?.storagePath) {
      await safeDeleteStorage(pack.mainImage.storagePath);
    }

    if (pack.tabImage?.storagePath) {
      await safeDeleteStorage(pack.tabImage.storagePath);
    }

    for (const sticker of pack.stickers || []) {
      if (sticker.storagePath) {
        await safeDeleteStorage(sticker.storagePath);
      }
    }

    await deleteDoc(doc(db, "stampPacks", editingPackId));

    resetForm();
    await loadStampPacks();
    setStatus("削除しました");
  } catch (error) {
    console.error(error);
    setStatus("削除に失敗しました");
    alert("削除に失敗しました。");
  }
}

loginBtn.addEventListener("click", async () => {
  await signInWithPopup(auth, googleProvider);
});

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
});

newStampPackBtn.addEventListener("click", resetForm);
saveStampPackBtn.addEventListener("click", saveStampPack);
deleteStampPackBtn.addEventListener("click", deleteStampPack);
reloadStampPacksBtn.addEventListener("click", loadStampPacks);

mainImageInput.addEventListener("change", () => {
  const file = mainImageInput.files?.[0] || null;
  if (file && !validateFile(file)) {
    mainImageInput.value = "";
    return;
  }

  mainImageFile = file;
  renderDraftList();
});

tabImageInput.addEventListener("change", () => {
  const file = tabImageInput.files?.[0] || null;
  if (file && !validateFile(file)) {
    tabImageInput.value = "";
    return;
  }

  tabImageFile = file;
  renderDraftList();
});

stampImagesInput.addEventListener("change", () => {
  const files = Array.from(stampImagesInput.files || []);

  const validFiles = files.filter(validateFile);

  stampDrafts.push(
    ...validFiles.map((file) => ({
      file,
      text: ""
    }))
  );

  stampSelectedText.textContent = validFiles.length
    ? `${validFiles.length}枚追加しました。`
    : "まだスタンプ画像は選択されていません。";

  stampImagesInput.value = "";
  renderDraftList();
});

stampDraftList.addEventListener("input", syncDraftTexts);

stampDraftList.addEventListener("click", async (event) => {
  const removeDraftIndex = event.target.dataset.removeDraft;
  const removeExistingIndex = event.target.dataset.removeExisting;

  if (removeDraftIndex !== undefined) {
    syncDraftTexts();
    stampDrafts.splice(Number(removeDraftIndex), 1);
    renderDraftList();
  }

  if (removeExistingIndex !== undefined) {
    syncDraftTexts();

    const index = Number(removeExistingIndex);
    const target = existingStickers[index];

    const ok = confirm("この保存済みスタンプ画像を外しますか？Storageからも削除します。");
    if (!ok) return;

    if (target?.storagePath) {
      await safeDeleteStorage(target.storagePath);
    }

    existingStickers.splice(index, 1);
    renderDraftList();
  }
});

stampPackList.addEventListener("click", (event) => {
  const card = event.target.closest(".stamp-pack-card");
  if (!card) return;

  editPack(card.dataset.id);
});

stampSearchInput.addEventListener("input", renderPacks);
stampStatusFilter.addEventListener("change", renderPacks);

onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  if (user) {
    loginBtn.classList.add("hidden");
    logoutBtn.classList.remove("hidden");
    userInfo.textContent = user.displayName || user.email || "ログイン中";

    saveStampPackBtn.disabled = false;
    setStatus("保存できます");

    await loadStampPacks();
  } else {
    loginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
    userInfo.textContent = "";

    saveStampPackBtn.disabled = true;
    deleteStampPackBtn.classList.add("hidden");

    stampPacks = [];
    renderPacks();
    resetForm();
  }
});

resetForm();

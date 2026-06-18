// gallery.js

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

const galleryFormTitle = document.getElementById("galleryFormTitle");
const newGalleryBtn = document.getElementById("newGalleryBtn");

const collectionTitleInput = document.getElementById("collectionTitleInput");
const collectionTypeInput = document.getElementById("collectionTypeInput");
const collectionSourceInput = document.getElementById("collectionSourceInput");
const collectionTagsInput = document.getElementById("collectionTagsInput");
const collectionMemoInput = document.getElementById("collectionMemoInput");

const galleryImagesInput = document.getElementById("galleryImagesInput");
const gallerySelectedText = document.getElementById("gallerySelectedText");
const galleryDraftList = document.getElementById("galleryDraftList");

const galleryStatus = document.getElementById("galleryStatus");
const saveGalleryBtn = document.getElementById("saveGalleryBtn");
const deleteGalleryBtn = document.getElementById("deleteGalleryBtn");
const reloadGalleryBtn = document.getElementById("reloadGalleryBtn");

const gallerySearchInput = document.getElementById("gallerySearchInput");
const galleryTypeFilter = document.getElementById("galleryTypeFilter");
const galleryCollectionList = document.getElementById("galleryCollectionList");

const galleryPreviewModal = document.getElementById("galleryPreviewModal");
const galleryPreviewBackdrop = document.getElementById("galleryPreviewBackdrop");
const closeGalleryPreviewBtn = document.getElementById("closeGalleryPreviewBtn");
const previewGalleryTitle = document.getElementById("previewGalleryTitle");
const previewGalleryMeta = document.getElementById("previewGalleryMeta");
const previewGalleryType = document.getElementById("previewGalleryType");
const previewGalleryMemo = document.getElementById("previewGalleryMemo");
const previewGalleryGrid = document.getElementById("previewGalleryGrid");

[
  loginBtn,
  logoutBtn,
  newGalleryBtn,
  saveGalleryBtn,
  deleteGalleryBtn,
  reloadGalleryBtn,
  closeGalleryPreviewBtn
].forEach((btn) => {
  if (btn) btn.type = "button";
});

document.querySelectorAll("form").forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
  });
});

let currentUser = null;
let editingCollectionId = null;
let galleryCollections = [];

let galleryDrafts = [];
let existingImages = [];

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const COLLECTION_TYPES = [
  "イラスト",
  "AIアイコン",
  "絵柄参考",
  "キャラ",
  "シリーズ",
  "資料",
  "ネタ",
  "この人のイラスト",
  "推し絵柄",
  "背景参考",
  "表情参考",
  "ポーズ参考",
  "色使い参考",
  "その他"
];

function setStatus(message) {
  galleryStatus.textContent = message;
}

function escapeHtml(text = "") {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setupTypeOptions() {
  collectionTypeInput.innerHTML = COLLECTION_TYPES
    .map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`)
    .join("");

  galleryTypeFilter.innerHTML = [
    `<option value="all">すべて</option>`,
    ...COLLECTION_TYPES.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`)
  ].join("");
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
  return `galleryCollections/${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}_${type}.${safeExt}`;
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
  editingCollectionId = null;

  collectionTitleInput.value = "";
  collectionTypeInput.value = "イラスト";
  collectionSourceInput.value = "";
  collectionTagsInput.value = "";
  collectionMemoInput.value = "";

  galleryImagesInput.value = "";
  galleryDrafts = [];
  existingImages = [];

  gallerySelectedText.textContent = "まだ画像は選択されていません。";
  galleryFormTitle.textContent = "コレクションを追加";
  deleteGalleryBtn.classList.add("hidden");

  renderDraftList();
  setStatus(currentUser ? "保存できます" : "ログインしてください");
}

function syncDraftTexts() {
  galleryDraftList.querySelectorAll("[data-draft-index]").forEach((input) => {
    const index = Number(input.dataset.draftIndex);
    if (galleryDrafts[index]) {
      galleryDrafts[index].memo = input.value;
    }
  });

  galleryDraftList.querySelectorAll("[data-existing-index]").forEach((input) => {
    const index = Number(input.dataset.existingIndex);
    if (existingImages[index]) {
      existingImages[index].memo = input.value;
    }
  });
}

function renderDraftList() {
  const items = [];

  existingImages.forEach((image, index) => {
    items.push(`
      <div class="gallery-draft-card">
        <img src="${escapeHtml(image.url)}" alt="保存済み画像 ${index + 1}" />
        <input
          type="text"
          value="${escapeHtml(image.memo || "")}"
          data-existing-index="${index}"
          placeholder="画像メモ"
        />
        <button type="button" data-remove-existing="${index}">×</button>
      </div>
    `);
  });

  galleryDrafts.forEach((draft, index) => {
    items.push(`
      <div class="gallery-draft-card">
        <img src="${URL.createObjectURL(draft.file)}" alt="追加画像 ${index + 1}" />
        <input
          type="text"
          value="${escapeHtml(draft.memo || "")}"
          data-draft-index="${index}"
          placeholder="画像メモ"
        />
        <button type="button" data-remove-draft="${index}">×</button>
      </div>
    `);
  });

  galleryDraftList.innerHTML = items.length
    ? items.join("")
    : `<p class="empty-text">画像を追加するとここに並びます。</p>`;
}

function renderCollections() {
  const searchText = gallerySearchInput.value.trim().toLowerCase();
  const typeFilter = galleryTypeFilter.value;

  const filtered = galleryCollections.filter((item) => {
    const joined = [
      item.title,
      item.type,
      item.source,
      item.tags,
      item.memo,
      ...(item.images || []).map((image) => image.memo || "")
    ]
      .join(" ")
      .toLowerCase();

    const matchSearch = !searchText || joined.includes(searchText);
    const matchType = typeFilter === "all" || item.type === typeFilter;

    return matchSearch && matchType;
  });

  if (!filtered.length) {
    galleryCollectionList.innerHTML = `<p class="empty-text">コレクションがありません。</p>`;
    return;
  }

  galleryCollectionList.innerHTML = filtered.map((item) => {
    const mainUrl = item.images?.[0]?.url || "";
    const imageCount = item.images?.length || 0;
    const created = formatDate(item.createdAt);
    const updated = formatDate(item.updatedAt);

    return `
      <article class="gallery-collection-card" data-id="${item.id}">
        <div class="gallery-collection-thumb">
          ${
            mainUrl
              ? `<img src="${escapeHtml(mainUrl)}" alt="${escapeHtml(item.title)}" />`
              : `<span>NO IMAGE</span>`
          }
        </div>

        <div class="gallery-collection-body">
          <div class="gallery-title-row">
            <h3>${escapeHtml(item.title || "無題のコレクション")}</h3>
            <span class="gallery-type-badge">${escapeHtml(item.type || "イラスト")}</span>
          </div>

          <p class="gallery-meta">
            ${escapeHtml(item.source || "作者・出典未設定")} / ${imageCount}枚
          </p>

          ${
            item.tags
              ? `<p class="gallery-tags">${escapeHtml(item.tags)}</p>`
              : ""
          }

          ${
            item.memo
              ? `<p class="gallery-memo">${escapeHtml(item.memo)}</p>`
              : ""
          }

          <div class="gallery-mini-grid">
            ${(item.images || []).slice(0, 6).map((image) => `
              <div class="gallery-mini">
                <img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.memo || "")}" />
              </div>
            `).join("")}
          </div>

          <p class="gallery-date">
            ${updated ? `更新：${updated}` : created ? `作成：${created}` : ""}
          </p>

          <div class="gallery-card-actions">
            <button type="button" class="small-btn preview-gallery-btn" data-preview-id="${item.id}">
              プレビュー
            </button>
            <button type="button" class="small-btn edit-gallery-btn" data-edit-id="${item.id}">
              編集
            </button>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

async function loadGalleryCollections() {
  if (!currentUser) {
    galleryCollections = [];
    renderCollections();
    return;
  }

  setStatus("読み込み中...");

  try {
    const q = query(
      collection(db, "galleryCollections"),
      where("uid", "==", currentUser.uid)
    );

    const snapshot = await getDocs(q);

    galleryCollections = snapshot.docs
      .map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }))
      .sort((a, b) => {
        const aTime = a.updatedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
        const bTime = b.updatedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
      });

    renderCollections();
    setStatus("読み込み完了");
  } catch (error) {
    console.error("読み込みエラー:", error);
    setStatus(`読み込み失敗：${error.message}`);
  }
}

function editCollection(collectionId) {
  const item = galleryCollections.find((collection) => collection.id === collectionId);
  if (!item) return;

  editingCollectionId = item.id;

  collectionTitleInput.value = item.title || "";
  collectionTypeInput.value = COLLECTION_TYPES[0] || "その他";
  collectionSourceInput.value = item.source || "";
  collectionTagsInput.value = item.tags || "";
  collectionMemoInput.value = item.memo || "";

  galleryImagesInput.value = "";
  galleryDrafts = [];
  existingImages = [...(item.images || [])];

  galleryFormTitle.textContent = "コレクションを編集";
  deleteGalleryBtn.classList.remove("hidden");

  renderDraftList();
  setStatus("編集中");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openGalleryPreview(collectionId) {
  const item = galleryCollections.find((collection) => collection.id === collectionId);
  if (!item) return;

  previewGalleryTitle.textContent = item.title || "無題のコレクション";
  previewGalleryType.textContent = item.type || "イラスト";

  const imageCount = item.images?.length || 0;

  previewGalleryMeta.textContent = [
    item.source || "作者・出典未設定",
    `${imageCount}枚`
  ].join(" / ");

  previewGalleryMemo.textContent = item.memo || "";

  const images = item.images || [];

  if (!images.length) {
    previewGalleryGrid.innerHTML = `<p class="empty-text">画像がありません。</p>`;
  } else {
    previewGalleryGrid.innerHTML = images.map((image, index) => `
      <article class="gallery-preview-item">
        <div class="gallery-preview-image">
          <img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.memo || `画像${index + 1}`)}" />
        </div>

        <p>${escapeHtml(image.memo || `画像 ${index + 1}`)}</p>
      </article>
    `).join("");
  }

  galleryPreviewModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function closeGalleryPreview() {
  galleryPreviewModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

async function saveGalleryCollection() {
  if (!currentUser) {
    alert("ログインしてください。");
    return;
  }

  syncDraftTexts();

  const title = collectionTitleInput.value.trim();
  const type = collectionTypeInput.value;
  const source = collectionSourceInput.value.trim();
  const tags = collectionTagsInput.value.trim();
  const memo = collectionMemoInput.value.trim();

  if (!title) {
    alert("タイトルを入力してください。");
    return;
  }

  saveGalleryBtn.disabled = true;
  setStatus("保存中...");

  try {
    const uploadedImages = [];

    for (let i = 0; i < galleryDrafts.length; i++) {
      const draft = galleryDrafts[i];
      const uploaded = await uploadImage(draft.file, `gallery_${i + 1}`);

      uploadedImages.push({
        ...uploaded,
        memo: draft.memo || "",
        order: existingImages.length + i + 1
      });
    }

    const images = [
      ...existingImages.map((image, index) => ({
        ...image,
        order: index + 1
      })),
      ...uploadedImages
    ];

    const payload = {
      uid: currentUser.uid,
      title,
      type,
      source,
      tags,
      memo,
      images,
      updatedAt: serverTimestamp()
    };

    if (editingCollectionId) {
      await updateDoc(doc(db, "galleryCollections", editingCollectionId), payload);
    } else {
      await addDoc(collection(db, "galleryCollections"), {
        ...payload,
        createdAt: serverTimestamp()
      });
    }

    resetForm();
    await loadGalleryCollections();
    setStatus("保存しました");
  } catch (error) {
    console.error("保存エラー:", error);
    setStatus(`保存に失敗しました：${error.message}`);
    alert(`保存に失敗しました。\n${error.message}`);
  } finally {
    saveGalleryBtn.disabled = false;
  }
}

async function deleteGalleryCollection() {
  if (!currentUser || !editingCollectionId) return;

  const ok = confirm("このコレクションを削除しますか？画像もStorageから削除します。");
  if (!ok) return;

  const item = galleryCollections.find((collection) => collection.id === editingCollectionId);
  if (!item) return;

  setStatus("削除中...");

  try {
    for (const image of item.images || []) {
      if (image.storagePath) {
        await safeDeleteStorage(image.storagePath);
      }
    }

    await deleteDoc(doc(db, "galleryCollections", editingCollectionId));

    resetForm();
    await loadGalleryCollections();
    setStatus("削除しました");
  } catch (error) {
    console.error("削除エラー:", error);
    setStatus(`削除に失敗しました：${error.message}`);
    alert(`削除に失敗しました。\n${error.message}`);
  }
}

loginBtn.addEventListener("click", async () => {
  await signInWithPopup(auth, googleProvider);
});

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
});

newGalleryBtn.addEventListener("click", resetForm);
saveGalleryBtn.addEventListener("click", saveGalleryCollection);
deleteGalleryBtn.addEventListener("click", deleteGalleryCollection);
reloadGalleryBtn.addEventListener("click", loadGalleryCollections);

galleryImagesInput.addEventListener("change", () => {
  const files = Array.from(galleryImagesInput.files || []);
  const validFiles = files.filter(validateFile);

  galleryDrafts.push(
    ...validFiles.map((file) => ({
      file,
      memo: ""
    }))
  );

  gallerySelectedText.textContent = validFiles.length
    ? `${validFiles.length}枚追加しました。`
    : "まだ画像は選択されていません。";

  galleryImagesInput.value = "";
  renderDraftList();
});

galleryDraftList.addEventListener("input", syncDraftTexts);

galleryDraftList.addEventListener("click", async (event) => {
  const removeDraftIndex = event.target.dataset.removeDraft;
  const removeExistingIndex = event.target.dataset.removeExisting;

  if (removeDraftIndex !== undefined) {
    syncDraftTexts();
    galleryDrafts.splice(Number(removeDraftIndex), 1);
    renderDraftList();
  }

  if (removeExistingIndex !== undefined) {
    syncDraftTexts();

    const index = Number(removeExistingIndex);
    const target = existingImages[index];

    const ok = confirm("この保存済み画像を外しますか？Storageからも削除します。");
    if (!ok) return;

    if (target?.storagePath) {
      await safeDeleteStorage(target.storagePath);
    }

    existingImages.splice(index, 1);
    renderDraftList();
  }
});

galleryCollectionList.addEventListener("click", (event) => {
  const editBtn = event.target.closest("[data-edit-id]");
  const previewBtn = event.target.closest("[data-preview-id]");
  const card = event.target.closest(".gallery-collection-card");

  if (editBtn) {
    event.stopPropagation();
    editCollection(editBtn.dataset.editId);
    return;
  }

  if (previewBtn) {
    event.stopPropagation();
    openGalleryPreview(previewBtn.dataset.previewId);
    return;
  }

  if (card) {
    openGalleryPreview(card.dataset.id);
  }
});

closeGalleryPreviewBtn.addEventListener("click", closeGalleryPreview);
galleryPreviewBackdrop.addEventListener("click", closeGalleryPreview);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeGalleryPreview();
  }
});

gallerySearchInput.addEventListener("input", renderCollections);
galleryTypeFilter.addEventListener("change", renderCollections);

setupTypeOptions();

onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  if (user) {
    loginBtn.classList.add("hidden");
    logoutBtn.classList.remove("hidden");
    userInfo.textContent = user.displayName || user.email || "ログイン中";

    saveGalleryBtn.disabled = false;
    resetForm();
    await loadGalleryCollections();
  } else {
    loginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
    userInfo.textContent = "";

    saveGalleryBtn.disabled = true;
    deleteGalleryBtn.classList.add("hidden");

    galleryCollections = [];
    renderCollections();
    resetForm();
  }
});

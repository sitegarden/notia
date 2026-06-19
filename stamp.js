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
const packAiInput = document.getElementById("packAiInput");
const packPhotoInput = document.getElementById("packPhotoInput");
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
const aiFilterBtn = document.getElementById("aiFilterBtn");
const photoFilterBtn = document.getElementById("photoFilterBtn");
const stampPackList = document.getElementById("stampPackList");

const stampPreviewModal = document.getElementById("stampPreviewModal");
const stampPreviewBackdrop = document.getElementById("stampPreviewBackdrop");
const closeStampPreviewBtn = document.getElementById("closeStampPreviewBtn");
const previewPackTitle = document.getElementById("previewPackTitle");
const previewPackMeta = document.getElementById("previewPackMeta");
const previewPackStatus = document.getElementById("previewPackStatus");
const previewPackMemo = document.getElementById("previewPackMemo");
const previewStampGrid = document.getElementById("previewStampGrid");

[
  loginBtn,
  logoutBtn,
  newStampPackBtn,
  saveStampPackBtn,
  deleteStampPackBtn,
  reloadStampPacksBtn,
  closeStampPreviewBtn
].forEach((btn) => {
  if (btn) btn.type = "button";
});

document.querySelectorAll("form").forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
  });
});

let currentUser = null;
let editingPackId = null;
let stampPacks = [];

let mainImageFile = null;
let tabImageFile = null;
let stampDrafts = [];

let existingMainImage = null;
let existingTabImage = null;
let existingStickers = [];
let activeKindFilters = new Set();

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


function normalizeStatus(status = "制作中") {
  if (status === "完成" || status === "申請済み" || status === "申請中") {
    return "完成/申請中";
  }

  if (status === "保留") {
    return "制作中";
  }

  return status || "制作中";
}

function getStatusClass(status = "制作中") {
  const normalized = normalizeStatus(status);

  if (normalized === "制作中") return "status-progress";
  if (normalized === "完成/申請中") return "status-review";
  if (normalized === "販売中") return "status-sale";
  if (normalized === "リジェクト") return "status-reject";
  if (normalized === "販売停止") return "status-stop";

  return "status-progress";
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

  packAiInput.checked = false;
  packPhotoInput.checked = false;

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
  const aiFilterActive = activeKindFilters.has("ai");
  const photoFilterActive = activeKindFilters.has("photo");

  const filtered = stampPacks.filter((pack) => {
    const joined = [
      pack.title,
      pack.character,
      pack.tags,
      pack.memo,
      pack.status,
      pack.aiGenerated ? "AI生成" : "",
      pack.photoUsed ? "写真使用" : "",
      ...(pack.stickers || []).map((item) => item.text || "")
    ]
      .join(" ")
      .toLowerCase();

    const matchSearch = !searchText || joined.includes(searchText);
    const packStatus = normalizeStatus(pack.status);
const matchStatus = statusFilter === "all" || packStatus === statusFilter;
const matchAi = !aiFilterActive || !!pack.aiGenerated;
const matchPhoto = !photoFilterActive || !!pack.photoUsed;

return matchSearch && matchStatus && matchAi && matchPhoto;
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
            <span class="stamp-status-badge ${getStatusClass(pack.status)}">
  ${escapeHtml(normalizeStatus(pack.status))}
</span>
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
  pack.aiGenerated || pack.photoUsed
  ? `<div class="stamp-kind-badges">
      ${pack.aiGenerated ? `<span>AI生成</span>` : ""}
      ${pack.photoUsed ? `<span>写真使用</span>` : ""}
    </div>`
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

<div class="stamp-card-actions">
  <button type="button" class="small-btn preview-pack-btn" data-preview-id="${pack.id}">
    プレビュー
  </button>
  <button type="button" class="small-btn edit-pack-btn" data-edit-id="${pack.id}">
    編集
  </button>
</div>

          
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
  packStatusInput.value = normalizeStatus(pack.status);
packTagsInput.value = pack.tags || "";
packAiInput.checked = !!pack.aiGenerated;
packPhotoInput.checked = !!pack.photoUsed;
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

function openStampPreview(packId) {
  const pack = stampPacks.find((item) => item.id === packId);
  if (!pack) return;

  previewPackTitle.textContent = pack.title || "無題のスタンプ";
  previewPackStatus.textContent = normalizeStatus(pack.status);
  previewPackStatus.className = `stamp-status-badge ${getStatusClass(pack.status)}`;

  const stickerCount = pack.stickers?.length || 0;

  previewPackMeta.textContent = [
    pack.character || "キャラ未設定",
    `${stickerCount}枚`
  ].join(" / ");

  previewPackMemo.textContent = pack.memo || "";

  const stickers = pack.stickers || [];

  if (!stickers.length) {
    previewStampGrid.innerHTML = `<p class="empty-text">スタンプ画像がありません。</p>`;
  } else {
    previewStampGrid.innerHTML = stickers.map((sticker, index) => `
      <article class="stamp-preview-item">
        <div class="stamp-preview-image">
          <img src="${escapeHtml(sticker.url)}" alt="${escapeHtml(sticker.text || `スタンプ${index + 1}`)}" />
        </div>

        <p>
          ${escapeHtml(sticker.text || `スタンプ ${index + 1}`)}
        </p>
      </article>
    `).join("");
  }

  stampPreviewModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function closeStampPreview() {
  stampPreviewModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
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
const aiGenerated = packAiInput.checked;
const photoUsed = packPhotoInput.checked;

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
  aiGenerated,
  photoUsed,
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

closeStampPreviewBtn.addEventListener("click", closeStampPreview);
stampPreviewBackdrop.addEventListener("click", closeStampPreview);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeStampPreview();
  }
});

stampPackList.addEventListener("click", (event) => {
  const editBtn = event.target.closest("[data-edit-id]");
  const previewBtn = event.target.closest("[data-preview-id]");
  const card = event.target.closest(".stamp-pack-card");

  if (editBtn) {
    event.stopPropagation();
    editPack(editBtn.dataset.editId);
    return;
  }

  if (previewBtn) {
    event.stopPropagation();
    openStampPreview(previewBtn.dataset.previewId);
    return;
  }

  if (card) {
    openStampPreview(card.dataset.id);
  }
});

function updateKindFilterButtons() {
  if (aiFilterBtn) {
    aiFilterBtn.classList.toggle("active", activeKindFilters.has("ai"));
  }

  if (photoFilterBtn) {
    photoFilterBtn.classList.toggle("active", activeKindFilters.has("photo"));
  }
}
function toggleKindFilter(kind) {
  if (activeKindFilters.has(kind)) {
    activeKindFilters.delete(kind);
  } else {
    activeKindFilters.add(kind);
  }

  updateKindFilterButtons();
  renderPacks();
}

if (aiFilterBtn) {
  aiFilterBtn.addEventListener("click", () => toggleKindFilter("ai"));
}

if (photoFilterBtn) {
  photoFilterBtn.addEventListener("click", () => toggleKindFilter("photo"));
}

stampSearchInput.addEventListener("input", renderPacks);
stampStatusFilter.addEventListener("change", renderPacks);

onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  if (user) {
    loginBtn.classList.add("hidden");
    logoutBtn.classList.remove("hidden");
    userInfo.textContent = user.displayName || user.email || "ログイン中";

    saveStampPackBtn.disabled = false;
    resetForm();
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

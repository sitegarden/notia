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
const collectionSourceTypeInput = document.getElementById("collectionSourceTypeInput");
const gallerySourceTypeFilter = document.getElementById("gallerySourceTypeFilter");
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

const collectionPersonInput = document.getElementById("collectionPersonInput");
const galleryPersonFilter = document.getElementById("galleryPersonFilter");

const collectionAuthorInput = document.getElementById("collectionAuthorInput");
const collectionGenreInput = document.getElementById("collectionGenreInput");

const galleryAuthorFilter = document.getElementById("galleryAuthorFilter");
const galleryGenreFilter = document.getElementById("galleryGenreFilter");

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
let people = [];

let galleryDrafts = [];
let existingImages = [];

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const COLLECTION_TYPES = [
  "OC",
  "FA",
  "GIFT",
  "絵柄",
  "AIアイコン",
  "キャラクター",
  "AI資料",
  "画像",
  "友人のイラスト",
  "スクリーンショット",
  "その他"
];

const SOURCE_TYPES = [
  "絵チャ",
  "OCFAゲーム",
  "DrawMe",
  "オープンチャット",
  "パロコラ",
  "友人",
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
    `<option value="all">種類すべて</option>`,
    ...COLLECTION_TYPES.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`)
  ].join("");

  if (collectionSourceTypeInput) {
    collectionSourceTypeInput.innerHTML = [
      `<option value="">入手元：指定なし</option>`,
      ...SOURCE_TYPES.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`)
    ].join("");
  }

  if (gallerySourceTypeFilter) {
    gallerySourceTypeFilter.innerHTML = [
      `<option value="all">入手元すべて</option>`,
      `<option value="">入手元なし</option>`,
      ...SOURCE_TYPES.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`)
    ].join("");
  }
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

function getPersonLabel(person) {
  if (!person) return "人物なし";

  return [
    person.name || "名前なし",
    person.nickname ? `（${person.nickname}）` : ""
  ].join("");
}

function updatePersonOptions() {
  const currentPersonValue = collectionPersonInput?.value || "";
  const currentAuthorValue = collectionAuthorInput?.value || "";

  const currentFilterValue = galleryPersonFilter?.value || "all";
  const currentAuthorFilterValue = galleryAuthorFilter?.value || "all";

  const personOptions = people.map((person) => {
    const label = getPersonLabel(person);
    return `<option value="${escapeHtml(person.id)}">${escapeHtml(label)}</option>`;
  });

  if (collectionPersonInput) {
    collectionPersonInput.innerHTML = [
      `<option value="">コレクション全体の人物：なし</option>`,
      ...personOptions
    ].join("");

    collectionPersonInput.value = people.some((person) => person.id === currentPersonValue)
      ? currentPersonValue
      : "";
  }

  if (collectionAuthorInput) {
    collectionAuthorInput.innerHTML = [
      `<option value="">コレクション全体の作者：なし</option>`,
      ...personOptions
    ].join("");

    collectionAuthorInput.value = people.some((person) => person.id === currentAuthorValue)
      ? currentAuthorValue
      : "";
  }

  if (galleryPersonFilter) {
    galleryPersonFilter.innerHTML = [
      `<option value="all">人物すべて</option>`,
      `<option value="">紐付けなし</option>`,
      ...personOptions
    ].join("");

    const filterExists =
      currentFilterValue === "all" ||
      currentFilterValue === "" ||
      people.some((person) => person.id === currentFilterValue);

    galleryPersonFilter.value = filterExists ? currentFilterValue : "all";
  }

  if (galleryAuthorFilter) {
    galleryAuthorFilter.innerHTML = [
      `<option value="all">作者すべて</option>`,
      `<option value="">紐付けなし</option>`,
      ...personOptions
    ].join("");

    const authorFilterExists =
      currentAuthorFilterValue === "all" ||
      currentAuthorFilterValue === "" ||
      people.some((person) => person.id === currentAuthorFilterValue);

    galleryAuthorFilter.value = authorFilterExists ? currentAuthorFilterValue : "all";
  }
}

function createPersonSelectHtml(value = "", dataName = "") {
  return `
    <select ${dataName} class="gallery-image-person-select">
      <option value="">画像の人物：なし</option>
      ${people.map((person) => {
        const label = getPersonLabel(person);
        const selected = person.id === value ? "selected" : "";

        return `<option value="${escapeHtml(person.id)}" ${selected}>${escapeHtml(label)}</option>`;
      }).join("")}
    </select>
  `;
}

function createAuthorSelectHtml(value = "", dataName = "") {
  return `
  <select ${dataName} class="gallery-image-author-select">
    <option value="">画像の作者：なし</option>
    ${people.map((person) => {
      const label = getPersonLabel(person);
      const selected = person.id === value ? "selected" : "";

      return `<option value="${escapeHtml(person.id)}" ${selected}>${escapeHtml(label)}</option>`;
    }).join("")}
  </select>
  `;
}

function getPersonData(personId) {
  const person = people.find((item) => item.id === personId);

  return {
    personId: person?.id || "",
    personName: person?.name || "",
    personNickname: person?.nickname || "",
    personIconUrl: person?.iconImageUrl || ""
  };
}

function getAuthorData(authorId) {
  const author = people.find((item) => item.id === authorId);

  return {
    authorId: author?.id || "",
    authorName: author?.name || "",
    authorNickname: author?.nickname || "",
    authorIconUrl: author?.iconImageUrl || ""
  };
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
  collectionTypeInput.value = COLLECTION_TYPES[0] || "その他";

if (collectionSourceTypeInput) {
  collectionSourceTypeInput.value = "";
}
  
  collectionSourceInput.value = "";
  collectionPersonInput.value = "";
  collectionAuthorInput.value = "";
  collectionGenreInput.value = "";
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

  galleryDraftList.querySelectorAll("[data-draft-person-index]").forEach((select) => {
    const index = Number(select.dataset.draftPersonIndex);
    if (galleryDrafts[index]) {
      galleryDrafts[index].personId = select.value;
    }
  });

  galleryDraftList.querySelectorAll("[data-existing-person-index]").forEach((select) => {
    const index = Number(select.dataset.existingPersonIndex);
    if (existingImages[index]) {
      existingImages[index].personId = select.value;
    }
  });

  galleryDraftList.querySelectorAll("[data-draft-author-index]").forEach((select) => {
  const index = Number(select.dataset.draftAuthorIndex);

  if (galleryDrafts[index]) {
    galleryDrafts[index].authorId = select.value;
  }
});

galleryDraftList.querySelectorAll("[data-existing-author-index]").forEach((select) => {
  const index = Number(select.dataset.existingAuthorIndex);

  if (existingImages[index]) {
    existingImages[index].authorId = select.value;
  }
});
}

function renderDraftList() {
  const items = [];

  existingImages.forEach((image, index) => {
    items.push(`
      <div class="gallery-draft-card">
        <img src="${escapeHtml(image.url)}" alt="保存済み画像 ${index + 1}" />

        <div class="gallery-draft-fields">
          <input
            type="text"
            value="${escapeHtml(image.memo || "")}"
            data-existing-index="${index}"
            placeholder="画像メモ"
          />

          ${createPersonSelectHtml(
            image.personId || "",
            `data-existing-person-index="${index}"`
          )}

          ${createAuthorSelectHtml(
            image.authorId || "",
            `data-existing-author-index="${index}"`
          )}
        </div>

        <button type="button" data-remove-existing="${index}">×</button>
      </div>
    `);
  });

  galleryDrafts.forEach((draft, index) => {
    items.push(`
      <div class="gallery-draft-card">
        <img src="${URL.createObjectURL(draft.file)}" alt="追加画像 ${index + 1}" />

        <div class="gallery-draft-fields">
          <input
            type="text"
            value="${escapeHtml(draft.memo || "")}"
            data-draft-index="${index}"
            placeholder="画像メモ"
          />

          ${createPersonSelectHtml(
            draft.personId || "",
            `data-draft-person-index="${index}"`
          )}

          ${createAuthorSelectHtml(
            draft.authorId || "",
            `data-draft-author-index="${index}"`
          )}
        </div>

        <button type="button" data-remove-draft="${index}">×</button>
      </div>
    `);
  });

  galleryDraftList.innerHTML = items.length
    ? items.join("")
    : `<p class="empty-text">画像を追加するとここに並びます。</p>`;
}

function updateGenreFilterOptions() {
  if (!galleryGenreFilter) return;

  const currentValue = galleryGenreFilter.value || "all";

  const genres = Array.from(
    new Set(
      galleryCollections
        .map((item) => item.genre)
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, "ja", { numeric: true }));

  galleryGenreFilter.innerHTML = [
    `<option value="all">ジャンルすべて</option>`,
    `<option value="">ジャンルなし</option>`,
    ...genres.map((genre) => `<option value="${escapeHtml(genre)}">${escapeHtml(genre)}</option>`)
  ].join("");

  galleryGenreFilter.value =
    currentValue === "all" ||
    currentValue === "" ||
    genres.includes(currentValue)
      ? currentValue
      : "all";
}

function renderCollections() {
  const searchText = gallerySearchInput.value.trim().toLowerCase();
  const typeFilter = galleryTypeFilter.value;
  const authorFilter = galleryAuthorFilter?.value || "all";
  const genreFilter = galleryGenreFilter?.value || "all";
  const personFilter = galleryPersonFilter?.value || "all";
  const sourceTypeFilter = gallerySourceTypeFilter?.value || "all";

  const filtered = galleryCollections.filter((item) => {
   const joined = [
  item.title,
  item.type,
  item.sourceType,
  item.source,
  item.genre,
  item.personName,
  item.personNickname,
  item.authorName,
  item.authorNickname,
  item.tags,
  item.memo,
  ...(item.images || []).map((image) => [
    image.memo,
    image.personName,
    image.personNickname,
    image.authorName,
    image.authorNickname
  ].join(" "))
]
.join(" ")
.toLowerCase();
    
    const matchSearch = !searchText || joined.includes(searchText);
    const matchType = typeFilter === "all" || item.type === typeFilter;

    const matchSourceType =
  sourceTypeFilter === "all" ||
  (sourceTypeFilter === "" && !item.sourceType) ||
  item.sourceType === sourceTypeFilter;

    const matchPerson =
  personFilter === "all" ||
  (personFilter === "" && !item.personId && !(item.images || []).some((image) => image.personId)) ||
  item.personId === personFilter ||
  (item.images || []).some((image) => image.personId === personFilter);

    const matchAuthor =
  authorFilter === "all" ||
  (authorFilter === "" && !item.authorId && !(item.images || []).some((image) => image.authorId)) ||
  item.authorId === authorFilter ||
  (item.images || []).some((image) => image.authorId === authorFilter);

const matchGenre =
  genreFilter === "all" ||
  (genreFilter === "" && !item.genre) ||
  item.genre === genreFilter;

    return matchSearch && matchType && matchSourceType && matchPerson && matchAuthor && matchGenre;
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

${
  item.personName
    ? `<div class="gallery-linked-person">
        ${
          item.personIconUrl
            ? `<img src="${escapeHtml(item.personIconUrl)}" alt="${escapeHtml(item.personName)}" />`
            : `<span>${escapeHtml(item.personName.slice(0, 1))}</span>`
        }
        <p>${escapeHtml(item.personName)}</p>
      </div>`
    : ""
}
        
          <div class="gallery-title-row">
            <h3>${escapeHtml(item.title || "無題のコレクション")}</h3>
            <span class="gallery-type-badge">${escapeHtml(item.type || "イラスト")}</span>
          </div>

          <p class="gallery-meta">
  ${escapeHtml(item.type || "種類なし")} / 
  ${escapeHtml(item.sourceType || "入手元なし")} / 
  ${escapeHtml(item.genre || "ジャンルなし")} / 
  ${escapeHtml(item.personName || "人物なし")} / 
  ${escapeHtml(item.authorName || item.source || "作者・出典未設定")} / 
  ${imageCount}枚
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

async function loadPeopleForGallery() {
  if (!currentUser) {
    people = [];
    updatePersonOptions();
    return;
  }

  try {
    const q = query(
      collection(db, "people"),
      where("uid", "==", currentUser.uid)
    );

    const snapshot = await getDocs(q);

    people = snapshot.docs
      .map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }))
      .sort((a, b) => {
        const aKey = String(a.reading || a.name || "").trim();
        const bKey = String(b.reading || b.name || "").trim();

        const result = aKey.localeCompare(bKey, "ja", {
          numeric: true,
          sensitivity: "base"
        });

        if (result !== 0) return result;

        const aTime = a.updatedAt?.seconds || 0;
        const bTime = b.updatedAt?.seconds || 0;
        return bTime - aTime;
      });

    updatePersonOptions();
  } catch (error) {
    console.error("人物読み込みエラー:", error);
    people = [];
    updatePersonOptions();
  }
}

async function loadGalleryCollections() {
  if (!currentUser) {
    galleryCollections = [];
    updateGenreFilterOptions();
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

    

    updateGenreFilterOptions();
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
  collectionTypeInput.value = item.type || COLLECTION_TYPES[0] || "その他";

if (collectionSourceTypeInput) {
  collectionSourceTypeInput.value = item.sourceType || "";
}
  
  collectionSourceInput.value = item.source || "";
  collectionPersonInput.value = item.personId || "";
  collectionAuthorInput.value = item.authorId || "";
  collectionGenreInput.value = item.genre || "";
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
  previewGalleryType.textContent = item.type || "";

  const imageCount = item.images?.length || 0;

  previewGalleryMeta.textContent = [
  item.type ? `種類：${item.type}` : "種類なし",
  item.sourceType ? `入手元：${item.sourceType}` : "入手元なし",
  item.genre ? `ジャンル：${item.genre}` : "ジャンルなし",
  item.personName ? `人物：${item.personName}` : "人物なし",
  item.authorName ? `作者：${item.authorName}` : item.source || "作者・出典未設定",
  `${imageCount}枚`
].join(" / ");

  previewGalleryMemo.textContent = item.memo || "";

  const images = item.images || [];

  if (!images.length) {
    previewGalleryGrid.innerHTML = `<p class="empty-text">画像がありません。</p>`;
  } else {
    previewGalleryGrid.innerHTML = images.map((image, index) => `
  <article class="gallery-preview-item">
    ${
      image.personName
        ? `<div class="gallery-image-person">
            ${
              image.personIconUrl
                ? `<img src="${escapeHtml(image.personIconUrl)}" alt="${escapeHtml(image.personName)}" />`
                : `<span>${escapeHtml(image.personName.slice(0, 1))}</span>`
            }
            <p>${escapeHtml(image.personName)}</p>
          </div>`
        : ""
    }

    ${
  image.authorName
    ? `<div class="gallery-image-person">
        ${
          image.authorIconUrl
            ? `<img src="${escapeHtml(image.authorIconUrl)}" alt="${escapeHtml(image.authorName)}" />`
            : `<span>${escapeHtml(image.authorName.slice(0, 1))}</span>`
        }
        <p>作者：${escapeHtml(image.authorName)}</p>
      </div>`
    : ""
}

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
  const sourceType = collectionSourceTypeInput?.value || "";

  const collectionPersonId = collectionPersonInput?.value || "";
  const collectionPersonData = getPersonData(collectionPersonId);

  const collectionAuthorId = collectionAuthorInput?.value || "";
  const collectionAuthorData = getAuthorData(collectionAuthorId);

  const genre = collectionGenreInput.value.trim();
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

      const imagePersonData = getPersonData(draft.personId || "");
      const imageAuthorData = getAuthorData(draft.authorId || "");

      uploadedImages.push({
        ...uploaded,
        memo: draft.memo || "",
        ...imagePersonData,
        ...imageAuthorData,
        order: existingImages.length + i + 1
      });
    }

    const normalizedExistingImages = existingImages.map((image, index) => {
      const imagePersonData = getPersonData(image.personId || "");
      const imageAuthorData = getAuthorData(image.authorId || "");

      return {
        ...image,
        ...imagePersonData,
        ...imageAuthorData,
        order: index + 1
      };
    });

    const images = [
      ...normalizedExistingImages,
      ...uploadedImages
    ];

    const payload = {
      uid: currentUser.uid,
      title,
      type,
      sourceType,
      source,

      personId: collectionPersonData.personId,
      personName: collectionPersonData.personName,
      personNickname: collectionPersonData.personNickname,
      personIconUrl: collectionPersonData.personIconUrl,

      authorId: collectionAuthorData.authorId,
      authorName: collectionAuthorData.authorName,
      authorNickname: collectionAuthorData.authorNickname,
      authorIconUrl: collectionAuthorData.authorIconUrl,

      genre,
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
  memo: "",
  personId: "",
  authorId: ""
}))
);

  gallerySelectedText.textContent = validFiles.length
    ? `${validFiles.length}枚追加しました。`
    : "まだ画像は選択されていません。";

  galleryImagesInput.value = "";
  renderDraftList();
});

galleryDraftList.addEventListener("input", syncDraftTexts);
galleryDraftList.addEventListener("change", syncDraftTexts);

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
collectionPersonInput?.addEventListener("change", () => {
  setStatus(editingCollectionId ? "未保存の変更あり" : "新規コレクション");
});
collectionAuthorInput?.addEventListener("change", () => {
  setStatus(editingCollectionId ? "未保存の変更あり" : "新規コレクション");
});

collectionGenreInput?.addEventListener("input", () => {
  setStatus(editingCollectionId ? "未保存の変更あり" : "新規コレクション");
});

galleryAuthorFilter?.addEventListener("change", renderCollections);
galleryGenreFilter?.addEventListener("change", renderCollections);

galleryPersonFilter?.addEventListener("change", renderCollections);

setupTypeOptions();

onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  if (user) {
  loginBtn.classList.add("hidden");
  logoutBtn.classList.remove("hidden");
  userInfo.textContent = user.displayName || user.email || "ログイン中";

  saveGalleryBtn.disabled = false;

  await loadPeopleForGallery();
  resetForm();
  await loadGalleryCollections();
} else {
    loginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
    userInfo.textContent = "";

    saveGalleryBtn.disabled = true;
    deleteGalleryBtn.classList.add("hidden");

    people = [];
galleryCollections = [];

updatePersonOptions();
updateGenreFilterOptions();
resetForm();
renderCollections();
  }
});

collectionSourceTypeInput?.addEventListener("change", () => {
  setStatus(editingCollectionId ? "未保存の変更あり" : "新規コレクション");
});

gallerySourceTypeFilter?.addEventListener("change", renderCollections);

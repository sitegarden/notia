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
const collectionSourceTypeInput = document.getElementById("collectionSourceTypeInput");
const collectionPersonInput = document.getElementById("collectionPersonInput");
const collectionAuthorInput = document.getElementById("collectionAuthorInput");
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
const gallerySourceTypeFilter = document.getElementById("gallerySourceTypeFilter");
const galleryPersonFilter = document.getElementById("galleryPersonFilter");
const galleryAuthorFilter = document.getElementById("galleryAuthorFilter");
const galleryCollectionList = document.getElementById("galleryCollectionList");
const loadMoreCollectionsBtn = document.getElementById("loadMoreCollectionsBtn");

const galleryPreviewModal = document.getElementById("galleryPreviewModal");
const galleryPreviewBackdrop = document.getElementById("galleryPreviewBackdrop");
const closeGalleryPreviewBtn = document.getElementById("closeGalleryPreviewBtn");
const previewGalleryTitle = document.getElementById("previewGalleryTitle");
const previewGalleryMeta = document.getElementById("previewGalleryMeta");
const previewGalleryType = document.getElementById("previewGalleryType");
const previewGalleryMemo = document.getElementById("previewGalleryMemo");
const previewGalleryGrid = document.getElementById("previewGalleryGrid");
const loadMorePreviewImagesBtn = document.getElementById("loadMorePreviewImagesBtn");

[
  loginBtn,
  logoutBtn,
  newGalleryBtn,
  saveGalleryBtn,
  deleteGalleryBtn,
  reloadGalleryBtn,
  closeGalleryPreviewBtn,
  loadMoreCollectionsBtn,
  loadMorePreviewImagesBtn
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

const COLLECTION_PAGE_SIZE = 30;
let visibleCollectionCount = COLLECTION_PAGE_SIZE;

const PREVIEW_IMAGE_PAGE_SIZE = 30;
let currentPreviewCollectionId = null;
let visiblePreviewImageCount = PREVIEW_IMAGE_PAGE_SIZE;

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
    ...COLLECTION_TYPES.map(
      (type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`
    )
  ].join("");

  if (collectionSourceTypeInput) {
    collectionSourceTypeInput.innerHTML = [
      `<option value="">入手元：指定なし</option>`,
      ...SOURCE_TYPES.map(
        (type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`
      )
    ].join("");
  }

  if (gallerySourceTypeFilter) {
    gallerySourceTypeFilter.innerHTML = [
      `<option value="all">入手元すべて</option>`,
      `<option value="">入手元なし</option>`,
      ...SOURCE_TYPES.map(
        (type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`
      )
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

    collectionPersonInput.value = people.some(
      (person) => person.id === currentPersonValue
    )
      ? currentPersonValue
      : "";
  }

  if (collectionAuthorInput) {
    collectionAuthorInput.innerHTML = [
      `<option value="">コレクション全体の作者：なし</option>`,
      ...personOptions
    ].join("");

    collectionAuthorInput.value = people.some(
      (person) => person.id === currentAuthorValue
    )
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

    galleryPersonFilter.value = filterExists
      ? currentFilterValue
      : "all";
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

    galleryAuthorFilter.value = authorFilterExists
      ? currentAuthorFilterValue
      : "all";
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

/*
  ギャラリーに保存されている古い名前・アイコンではなく、
  人物帳の現在のデータを優先して返す。

  人物帳から人物を消した場合だけ、
  ギャラリー保存時点のデータを予備として使う。
*/
function getLivePerson(personId, fallback = {}, role = "person") {
  const person = people.find((item) => item.id === personId);

  const isAuthor = role === "author";

  const fallbackName = isAuthor
    ? fallback.authorName || ""
    : fallback.personName || "";

  const fallbackNickname = isAuthor
    ? fallback.authorNickname || ""
    : fallback.personNickname || "";

  const fallbackIconUrl = isAuthor
    ? fallback.authorIconUrl || ""
    : fallback.personIconUrl || "";

  if (!person) {
    return {
      id: personId || "",
      name: fallbackName,
      nickname: fallbackNickname,
      iconUrl: fallbackIconUrl
    };
  }

  return {
    id: person.id,
    name: person.name || "",
    nickname: person.nickname || "",
    iconUrl: person.iconImageUrl || ""
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

  return `galleryCollections/${userId}/${Date.now()}_${Math.random()
    .toString(36)
    .slice(2)}_${type}.${safeExt}`;
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

  if (collectionPersonInput) {
    collectionPersonInput.value = "";
  }

  if (collectionAuthorInput) {
    collectionAuthorInput.value = "";
  }

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
  galleryDraftList
    .querySelectorAll("[data-draft-index]")
    .forEach((input) => {
      const index = Number(input.dataset.draftIndex);

      if (galleryDrafts[index]) {
        galleryDrafts[index].memo = input.value;
      }
    });

  galleryDraftList
    .querySelectorAll("[data-existing-index]")
    .forEach((input) => {
      const index = Number(input.dataset.existingIndex);

      if (existingImages[index]) {
        existingImages[index].memo = input.value;
      }
    });

  galleryDraftList
    .querySelectorAll("[data-draft-person-index]")
    .forEach((select) => {
      const index = Number(select.dataset.draftPersonIndex);

      if (galleryDrafts[index]) {
        galleryDrafts[index].personId = select.value;
      }
    });

  galleryDraftList
    .querySelectorAll("[data-existing-person-index]")
    .forEach((select) => {
      const index = Number(select.dataset.existingPersonIndex);

      if (existingImages[index]) {
        existingImages[index].personId = select.value;
      }
    });

  galleryDraftList
    .querySelectorAll("[data-draft-author-index]")
    .forEach((select) => {
      const index = Number(select.dataset.draftAuthorIndex);

      if (galleryDrafts[index]) {
        galleryDrafts[index].authorId = select.value;
      }
    });

  galleryDraftList
    .querySelectorAll("[data-existing-author-index]")
    .forEach((select) => {
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

function renderCollections() {
  const searchText = gallerySearchInput.value.trim().toLowerCase();
  const typeFilter = galleryTypeFilter.value;
  const sourceTypeFilter = gallerySourceTypeFilter?.value || "all";
  const personFilter = galleryPersonFilter?.value || "all";
  const authorFilter = galleryAuthorFilter?.value || "all";

  const filtered = galleryCollections.filter((item) => {
    const livePerson = getLivePerson(item.personId, item, "person");
    const liveAuthor = getLivePerson(item.authorId, item, "author");

    const joined = [
      item.title,
      item.type,
      item.sourceType,
      livePerson.name,
      livePerson.nickname,
      liveAuthor.name,
      liveAuthor.nickname,
      item.tags,
      item.memo,
      ...(item.images || []).map((image) => {
        const liveImagePerson = getLivePerson(
          image.personId,
          image,
          "person"
        );

        const liveImageAuthor = getLivePerson(
          image.authorId,
          image,
          "author"
        );

        return [
          image.memo,
          liveImagePerson.name,
          liveImagePerson.nickname,
          liveImageAuthor.name,
          liveImageAuthor.nickname
        ].join(" ");
      })
    ]
      .join(" ")
      .toLowerCase();

    const matchSearch = !searchText || joined.includes(searchText);

    const matchType =
      typeFilter === "all" ||
      item.type === typeFilter;

    const matchSourceType =
      sourceTypeFilter === "all" ||
      (sourceTypeFilter === "" && !item.sourceType) ||
      item.sourceType === sourceTypeFilter;

    const matchPerson =
      personFilter === "all" ||
      (
        personFilter === "" &&
        !item.personId &&
        !(item.images || []).some((image) => image.personId)
      ) ||
      item.personId === personFilter ||
      (item.images || []).some(
        (image) => image.personId === personFilter
      );

    const matchAuthor =
      authorFilter === "all" ||
      (
        authorFilter === "" &&
        !item.authorId &&
        !(item.images || []).some((image) => image.authorId)
      ) ||
      item.authorId === authorFilter ||
      (item.images || []).some(
        (image) => image.authorId === authorFilter
      );

    return (
      matchSearch &&
      matchType &&
      matchSourceType &&
      matchPerson &&
      matchAuthor
    );
  });

  if (!filtered.length) {
    galleryCollectionList.innerHTML =
      `<p class="empty-text">コレクションがありません。</p>`;

    if (loadMoreCollectionsBtn) {
      loadMoreCollectionsBtn.classList.add("hidden");
    }

    return;
  }

  const visibleItems = filtered.slice(0, visibleCollectionCount);

  galleryCollectionList.innerHTML = visibleItems
    .map((item) => {
      const mainUrl = item.images?.[0]?.url || "";
      const imageCount = item.images?.length || 0;
      const created = formatDate(item.createdAt);
      const updated = formatDate(item.updatedAt);

      const livePerson = getLivePerson(item.personId, item, "person");
      const liveAuthor = getLivePerson(item.authorId, item, "author");

      return `
        <article class="gallery-collection-card" data-id="${item.id}">
          <div class="gallery-collection-thumb">
            ${
              mainUrl
                ? `<img src="${escapeHtml(mainUrl)}" alt="${escapeHtml(item.title || "")}" />`
                : `<span>NO IMAGE</span>`
            }
          </div>

          <div class="gallery-collection-body">
            ${
              livePerson.name
                ? `<div class="gallery-linked-person">
                    ${
                      livePerson.iconUrl
                        ? `<img src="${escapeHtml(livePerson.iconUrl)}" alt="${escapeHtml(livePerson.name)}" />`
                        : `<span>${escapeHtml(livePerson.name.slice(0, 1))}</span>`
                    }
                    <p>${escapeHtml(livePerson.name)}</p>
                  </div>`
                : ""
            }

            <div class="gallery-title-row">
              <h3>${escapeHtml(item.title || "無題のコレクション")}</h3>
              <span class="gallery-type-badge">${escapeHtml(item.type || "種類なし")}</span>
            </div>

            <p class="gallery-meta">
              ${[
                item.type,
                item.sourceType,
                livePerson.name,
                liveAuthor.name,
                `${imageCount}枚`
              ]
                .filter(Boolean)
                .map((text) => escapeHtml(text))
                .join(" / ")}
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
              ${(item.images || [])
                .slice(0, 6)
                .map(
                  (image) => `
                    <div class="gallery-mini">
                      <img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.memo || "")}" />
                    </div>
                  `
                )
                .join("")}
            </div>

            <p class="gallery-date">
              ${
                updated
                  ? `更新：${updated}`
                  : created
                    ? `作成：${created}`
                    : ""
              }
            </p>

            <div class="gallery-card-actions">
              <button
                type="button"
                class="small-btn preview-gallery-btn"
                data-preview-id="${item.id}"
              >
                プレビュー
              </button>

              <button
                type="button"
                class="small-btn edit-gallery-btn"
                data-edit-id="${item.id}"
              >
                編集
              </button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  if (loadMoreCollectionsBtn) {
    if (visibleCollectionCount < filtered.length) {
      loadMoreCollectionsBtn.classList.remove("hidden");
      loadMoreCollectionsBtn.textContent =
        `もっと見る（${filtered.length - visibleCollectionCount}件）`;
    } else {
      loadMoreCollectionsBtn.classList.add("hidden");
    }
  }
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

    if (galleryCollections.length) {
      renderCollections();
    }
  } catch (error) {
    console.error("人物読み込みエラー:", error);

    people = [];
    updatePersonOptions();
  }
}

function resetCollectionPaging() {
  visibleCollectionCount = COLLECTION_PAGE_SIZE;
  renderCollections();
}

async function loadGalleryCollections() {
  if (!currentUser) {
    galleryCollections = [];
    visibleCollectionCount = COLLECTION_PAGE_SIZE;
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
        const aTime =
          a.updatedAt?.toMillis?.() ||
          a.createdAt?.toMillis?.() ||
          0;

        const bTime =
          b.updatedAt?.toMillis?.() ||
          b.createdAt?.toMillis?.() ||
          0;

        return bTime - aTime;
      });

    visibleCollectionCount = COLLECTION_PAGE_SIZE;
    renderCollections();

    setStatus("読み込み完了");
  } catch (error) {
    console.error("読み込みエラー:", error);
    setStatus(`読み込み失敗：${error.message}`);
  }
}

function editCollection(collectionId) {
  const item = galleryCollections.find(
    (collection) => collection.id === collectionId
  );

  if (!item) return;

  editingCollectionId = item.id;

  collectionTitleInput.value = item.title || "";
  collectionTypeInput.value =
    item.type ||
    COLLECTION_TYPES[0] ||
    "その他";

  if (collectionSourceTypeInput) {
    collectionSourceTypeInput.value = item.sourceType || "";
  }

  if (collectionPersonInput) {
    collectionPersonInput.value = item.personId || "";
  }

  if (collectionAuthorInput) {
    collectionAuthorInput.value = item.authorId || "";
  }

  collectionTagsInput.value = item.tags || "";
  collectionMemoInput.value = item.memo || "";

  galleryImagesInput.value = "";
  galleryDrafts = [];
  existingImages = [...(item.images || [])];

  galleryFormTitle.textContent = "コレクションを編集";
  deleteGalleryBtn.classList.remove("hidden");

  renderDraftList();
  setStatus("編集中");

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

function renderPreviewImages() {
  if (!currentPreviewCollectionId) return;

  const item = galleryCollections.find(
    (collection) => collection.id === currentPreviewCollectionId
  );

  if (!item) return;

  const images = item.images || [];

  if (!images.length) {
    previewGalleryGrid.innerHTML =
      `<p class="empty-text">画像がありません。</p>`;

    if (loadMorePreviewImagesBtn) {
      loadMorePreviewImagesBtn.classList.add("hidden");
    }

    return;
  }

  const visibleImages = images.slice(
    0,
    visiblePreviewImageCount
  );

  previewGalleryGrid.innerHTML = visibleImages
    .map((image, index) => {
      const liveImagePerson = getLivePerson(
        image.personId,
        image,
        "person"
      );

      const liveImageAuthor = getLivePerson(
        image.authorId,
        image,
        "author"
      );

      return `
        <article class="gallery-preview-item">
          ${
            liveImagePerson.name
              ? `<div class="gallery-image-person">
                  ${
                    liveImagePerson.iconUrl
                      ? `<img src="${escapeHtml(liveImagePerson.iconUrl)}" alt="${escapeHtml(liveImagePerson.name)}" />`
                      : `<span>${escapeHtml(liveImagePerson.name.slice(0, 1))}</span>`
                  }
                  <p>${escapeHtml(liveImagePerson.name)}</p>
                </div>`
              : ""
          }

          ${
            liveImageAuthor.name
              ? `<div class="gallery-image-person">
                  ${
                    liveImageAuthor.iconUrl
                      ? `<img src="${escapeHtml(liveImageAuthor.iconUrl)}" alt="${escapeHtml(liveImageAuthor.name)}" />`
                      : `<span>${escapeHtml(liveImageAuthor.name.slice(0, 1))}</span>`
                  }
                  <p>作者：${escapeHtml(liveImageAuthor.name)}</p>
                </div>`
              : ""
          }

          <div class="gallery-preview-image">
            <img
              src="${escapeHtml(image.url)}"
              alt="${escapeHtml(image.memo || `画像${index + 1}`)}"
            />
          </div>

          <p>${escapeHtml(image.memo || `画像 ${index + 1}`)}</p>
        </article>
      `;
    })
    .join("");

  if (loadMorePreviewImagesBtn) {
    if (visiblePreviewImageCount < images.length) {
      loadMorePreviewImagesBtn.classList.remove("hidden");
      loadMorePreviewImagesBtn.textContent =
        `画像をもっと見る（${images.length - visiblePreviewImageCount}枚）`;
    } else {
      loadMorePreviewImagesBtn.classList.add("hidden");
    }
  }
}

function openGalleryPreview(collectionId) {
  const item = galleryCollections.find(
    (collection) => collection.id === collectionId
  );

  if (!item) return;

  const livePerson = getLivePerson(item.personId, item, "person");
  const liveAuthor = getLivePerson(item.authorId, item, "author");

  currentPreviewCollectionId = collectionId;
  visiblePreviewImageCount = PREVIEW_IMAGE_PAGE_SIZE;

  previewGalleryTitle.textContent =
    item.title || "無題のコレクション";

  previewGalleryType.textContent = item.type || "";

  const imageCount = item.images?.length || 0;

  previewGalleryMeta.textContent = [
    item.type ? `種類：${item.type}` : "",
    item.sourceType ? `入手元：${item.sourceType}` : "",
    livePerson.name ? `人物：${livePerson.name}` : "",
    liveAuthor.name ? `作者：${liveAuthor.name}` : "",
    `${imageCount}枚`
  ]
    .filter(Boolean)
    .join(" / ");

  previewGalleryMemo.textContent = item.memo || "";

  renderPreviewImages();

  galleryPreviewModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function closeGalleryPreview() {
  galleryPreviewModal.classList.add("hidden");
  document.body.classList.remove("modal-open");

  currentPreviewCollectionId = null;
  visiblePreviewImageCount = PREVIEW_IMAGE_PAGE_SIZE;

  if (loadMorePreviewImagesBtn) {
    loadMorePreviewImagesBtn.classList.add("hidden");
  }
}

async function saveGalleryCollection() {
  if (!currentUser) {
    alert("ログインしてください。");
    return;
  }

  syncDraftTexts();

  const title = collectionTitleInput.value.trim();
  const type = collectionTypeInput.value;
  const sourceType = collectionSourceTypeInput?.value || "";

  const collectionPersonId =
    collectionPersonInput?.value || "";

  const collectionPersonData = getPersonData(
    collectionPersonId
  );

  const collectionAuthorId =
    collectionAuthorInput?.value || "";

  const collectionAuthorData = getAuthorData(
    collectionAuthorId
  );

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

      const uploaded = await uploadImage(
        draft.file,
        `gallery_${i + 1}`
      );

      const imagePersonData = getPersonData(
        draft.personId || ""
      );

      const imageAuthorData = getAuthorData(
        draft.authorId || ""
      );

      uploadedImages.push({
        ...uploaded,
        memo: draft.memo || "",
        ...imagePersonData,
        ...imageAuthorData,
        order: existingImages.length + i + 1
      });
    }

    const normalizedExistingImages = existingImages.map(
      (image, index) => {
        const imagePersonData = getPersonData(
          image.personId || ""
        );

        const imageAuthorData = getAuthorData(
          image.authorId || ""
        );

        return {
          ...image,
          ...imagePersonData,
          ...imageAuthorData,
          order: index + 1
        };
      }
    );

    const images = [
      ...normalizedExistingImages,
      ...uploadedImages
    ];

    const payload = {
      uid: currentUser.uid,
      title,
      type,
      sourceType,

      personId: collectionPersonData.personId,
      personName: collectionPersonData.personName,
      personNickname: collectionPersonData.personNickname,
      personIconUrl: collectionPersonData.personIconUrl,

      authorId: collectionAuthorData.authorId,
      authorName: collectionAuthorData.authorName,
      authorNickname: collectionAuthorData.authorNickname,
      authorIconUrl: collectionAuthorData.authorIconUrl,

      tags,
      memo,
      images,
      updatedAt: serverTimestamp()
    };

    if (editingCollectionId) {
      await updateDoc(
        doc(db, "galleryCollections", editingCollectionId),
        payload
      );
    } else {
      await addDoc(
        collection(db, "galleryCollections"),
        {
          ...payload,
          createdAt: serverTimestamp()
        }
      );
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

  const ok = confirm(
    "このコレクションを削除しますか？画像もStorageから削除します。"
  );

  if (!ok) return;

  const item = galleryCollections.find(
    (collection) => collection.id === editingCollectionId
  );

  if (!item) return;

  setStatus("削除中...");

  try {
    for (const image of item.images || []) {
      if (image.storagePath) {
        await safeDeleteStorage(image.storagePath);
      }
    }

    await deleteDoc(
      doc(db, "galleryCollections", editingCollectionId)
    );

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
  const files = Array.from(
    galleryImagesInput.files || []
  );

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

    const ok = confirm(
      "この保存済み画像を外しますか？Storageからも削除します。"
    );

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

closeGalleryPreviewBtn.addEventListener(
  "click",
  closeGalleryPreview
);

galleryPreviewBackdrop.addEventListener(
  "click",
  closeGalleryPreview
);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeGalleryPreview();
  }
});

gallerySearchInput.addEventListener(
  "input",
  resetCollectionPaging
);

galleryTypeFilter.addEventListener(
  "change",
  resetCollectionPaging
);

gallerySourceTypeFilter?.addEventListener(
  "change",
  resetCollectionPaging
);

galleryPersonFilter?.addEventListener(
  "change",
  resetCollectionPaging
);

galleryAuthorFilter?.addEventListener(
  "change",
  resetCollectionPaging
);

collectionSourceTypeInput?.addEventListener("change", () => {
  setStatus(
    editingCollectionId
      ? "未保存の変更あり"
      : "新規コレクション"
  );
});

collectionPersonInput?.addEventListener("change", () => {
  setStatus(
    editingCollectionId
      ? "未保存の変更あり"
      : "新規コレクション"
  );
});

collectionAuthorInput?.addEventListener("change", () => {
  setStatus(
    editingCollectionId
      ? "未保存の変更あり"
      : "新規コレクション"
  );
});

loadMoreCollectionsBtn?.addEventListener("click", () => {
  visibleCollectionCount += COLLECTION_PAGE_SIZE;
  renderCollections();
});

loadMorePreviewImagesBtn?.addEventListener("click", () => {
  visiblePreviewImageCount += PREVIEW_IMAGE_PAGE_SIZE;
  renderPreviewImages();
});

setupTypeOptions();

onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  if (user) {
    loginBtn.classList.add("hidden");
    logoutBtn.classList.remove("hidden");

    userInfo.textContent =
      user.displayName ||
      user.email ||
      "ログイン中";

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
    visibleCollectionCount = COLLECTION_PAGE_SIZE;

    updatePersonOptions();
    resetForm();
    renderCollections();
  }
});

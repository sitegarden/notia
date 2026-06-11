// image.js

import {
  auth,
  googleProvider,
  db,
  storage
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

const imageFormTitle = document.getElementById("imageFormTitle");
const newImageMemoBtn = document.getElementById("newImageMemoBtn");

const uploadModeBtn = document.getElementById("uploadModeBtn");
const urlModeBtn = document.getElementById("urlModeBtn");
const uploadArea = document.getElementById("uploadArea");
const urlArea = document.getElementById("urlArea");

const imageFileInput = document.getElementById("imageFileInput");
const selectedFileText = document.getElementById("selectedFileText");
const imageUrlInput = document.getElementById("imageUrlInput");

const imagePreview = document.getElementById("imagePreview");
const imagePreviewEmpty = document.getElementById("imagePreviewEmpty");

const imageTitleInput = document.getElementById("imageTitleInput");
const imageCategoryInput = document.getElementById("imageCategoryInput");
const imageTagsInput = document.getElementById("imageTagsInput");
const imageMemoInput = document.getElementById("imageMemoInput");
const imageFavoriteInput = document.getElementById("imageFavoriteInput");

const imageStatus = document.getElementById("imageStatus");
const copyMarkdownBtn = document.getElementById("copyMarkdownBtn");
const deleteImageMemoBtn = document.getElementById("deleteImageMemoBtn");
const saveImageMemoBtn = document.getElementById("saveImageMemoBtn");

const reloadImageMemosBtn = document.getElementById("reloadImageMemosBtn");
const imageSearchInput = document.getElementById("imageSearchInput");
const imageCategoryFilter = document.getElementById("imageCategoryFilter");
const favoriteOnlyInput = document.getElementById("favoriteOnlyInput");
const imageMemoList = document.getElementById("imageMemoList");

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif"
];

let currentUser = null;
let imageMemos = [];
let selectedImageMemoId = null;
let selectedFile = null;
let inputMode = "upload";

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

  if (!user) {
    loginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
    userInfo.textContent = "";

    imageMemos = [];
    selectedImageMemoId = null;
    selectedFile = null;

    clearForm();
    renderImageMemos();

    imageStatus.textContent = "ログインしてください";
    return;
  }

  if (!isAdmin(user)) {
    alert("このページは管理人専用です");
    location.href = "/";
    return;
  }

  loginBtn.classList.add("hidden");
  logoutBtn.classList.remove("hidden");
  userInfo.textContent = user.displayName || user.email || "ログイン中";
  imageStatus.textContent = "画像メモを保存できます";

  await loadImageMemos();
});

/* ---------- events ---------- */

newImageMemoBtn.addEventListener("click", () => {
  selectedImageMemoId = null;
  selectedFile = null;
  clearForm();
  renderImageMemos();
  imageStatus.textContent = "新規画像メモ";
});

uploadModeBtn.addEventListener("click", () => {
  setInputMode("upload");
});

urlModeBtn.addEventListener("click", () => {
  setInputMode("url");
});

imageFileInput.addEventListener("change", () => {
  const file = imageFileInput.files[0];

  if (!file) {
    selectedFile = null;
    selectedFileText.textContent = "まだ画像は選択されていません。";
    updatePreview("");
    return;
  }

  const errorMessage = validateImageFile(file);

  if (errorMessage) {
    alert(errorMessage);
    imageFileInput.value = "";
    selectedFile = null;
    selectedFileText.textContent = "まだ画像は選択されていません。";
    updatePreview("");
    return;
  }

  selectedFile = file;
  selectedFileText.textContent = `${file.name} / ${formatFileSize(file.size)}`;

  const objectUrl = URL.createObjectURL(file);
  updatePreview(objectUrl);

  imageStatus.textContent = selectedImageMemoId
    ? "未保存の変更あり"
    : "新規画像メモ";
});

imageUrlInput.addEventListener("input", async () => {
  const url = imageUrlInput.value.trim();
  const safeUrl = normalizeImageUrl(url);

  if (!safeUrl) {
    updatePreview("");
    return;
  }

  updatePreview(safeUrl);

  imageStatus.textContent = selectedImageMemoId
    ? "未保存の変更あり"
    : "新規画像メモ";
});

[
  imageTitleInput,
  imageCategoryInput,
  imageTagsInput,
  imageMemoInput,
  imageFavoriteInput
].forEach((input) => {
  input.addEventListener("input", () => {
    imageStatus.textContent = selectedImageMemoId
      ? "未保存の変更あり"
      : "新規画像メモ";
  });
});

saveImageMemoBtn.addEventListener("click", async () => {
  await saveImageMemo();
});

deleteImageMemoBtn.addEventListener("click", async () => {
  await deleteImageMemo();
});

copyMarkdownBtn.addEventListener("click", async () => {
  await copyMarkdown();
});

reloadImageMemosBtn.addEventListener("click", async () => {
  await loadImageMemos();
});

imageSearchInput.addEventListener("input", () => {
  renderImageMemos();
});

imageCategoryFilter.addEventListener("change", () => {
  renderImageMemos();
});

favoriteOnlyInput.addEventListener("change", () => {
  renderImageMemos();
});

/* ---------- mode ---------- */

function setInputMode(mode) {
  inputMode = mode;

  if (mode === "upload") {
    uploadModeBtn.classList.add("active");
    urlModeBtn.classList.remove("active");
    uploadArea.classList.remove("hidden");
    urlArea.classList.add("hidden");
  } else {
    uploadModeBtn.classList.remove("active");
    urlModeBtn.classList.add("active");
    uploadArea.classList.add("hidden");
    urlArea.classList.remove("hidden");
  }
}

/* ---------- load ---------- */

async function loadImageMemos() {
  if (!currentUser) return;

  imageStatus.textContent = "読み込み中...";

  const q = query(
    collection(db, "imageMemos"),
    where("uid", "==", currentUser.uid)
  );

  const snapshot = await getDocs(q);

  imageMemos = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data()
  }));

  imageMemos.sort((a, b) => {
    const aTime = a.updatedAt?.seconds || 0;
    const bTime = b.updatedAt?.seconds || 0;
    return bTime - aTime;
  });

  updateCategoryFilter();
  renderImageMemos();

  imageStatus.textContent = "画像メモを保存できます";
}

/* ---------- save ---------- */

async function saveImageMemo() {
  if (!currentUser) {
    alert("先にログインしてください");
    return;
  }

  if (!isAdmin(currentUser)) {
    alert("このページは管理人専用です");
    location.href = "/";
    return;
  }

  const title = imageTitleInput.value.trim();
  const category = imageCategoryInput.value.trim();
  const tags = imageTagsInput.value.trim();
  const memo = imageMemoInput.value.trim();
  const favorite = imageFavoriteInput.checked;

  const selectedMemo = getSelectedMemo();

  let imageUrl = selectedMemo?.imageUrl || "";
  let storagePath = selectedMemo?.storagePath || "";
  let sourceType = selectedMemo?.sourceType || "url";
  let uploadedStoragePath = "";

  try {
    imageStatus.textContent = "保存中...";

    if (inputMode === "upload" && selectedFile) {
      const uploaded = await uploadImageFile(selectedFile);

imageUrl = uploaded.imageUrl;
storagePath = uploaded.storagePath;
uploadedStoragePath = uploaded.storagePath;
sourceType = "upload";
      if (
        selectedMemo &&
        selectedMemo.storagePath &&
        selectedMemo.storagePath !== storagePath
      ) {
        await deleteStorageImage(selectedMemo.storagePath);
      }
    }

    if (inputMode === "url") {
      const checkedUrl = normalizeImageUrl(imageUrlInput.value.trim());

      if (!checkedUrl) {
        alert("使える画像URLではありません");
        imageStatus.textContent = "画像URLが無効です";
        return;
      }

      const canLoad = await checkImageCanLoad(checkedUrl);

      if (!canLoad) {
        const ok = confirm(
          "画像として読み込めませんでした。\nURLが正しくても外部サイト側で表示を拒否している場合があります。\nそれでも保存しますか？"
        );

        if (!ok) {
          imageStatus.textContent = "保存をキャンセルしました";
          return;
        }
      }

      imageUrl = checkedUrl;
      sourceType = "url";

      if (selectedMemo?.storagePath) {
        await deleteStorageImage(selectedMemo.storagePath);
        storagePath = "";
      }
    }

    if (!imageUrl) {
      alert("画像をアップロードするか、画像URLを入力してください");
      imageStatus.textContent = "画像がありません";
      return;
    }

    const safeTitle = title || "無題の画像";

    const data = {
      title: safeTitle,
      category,
      tags,
      memo,
      favorite,
      imageUrl,
      storagePath,
      sourceType,
      updatedAt: serverTimestamp()
    };

    if (selectedImageMemoId) {
      await updateDoc(doc(db, "imageMemos", selectedImageMemoId), data);
      imageStatus.textContent = "保存しました";
    } else {
      const docRef = await addDoc(collection(db, "imageMemos"), {
        uid: currentUser.uid,
        ...data,
        createdAt: serverTimestamp()
      });

      selectedImageMemoId = docRef.id;
      imageStatus.textContent = "作成しました";
    }

    selectedFile = null;
    imageFileInput.value = "";
    selectedFileText.textContent = "まだ画像は選択されていません。";

    await loadImageMemos();

    const selected = imageMemos.find((item) => item.id === selectedImageMemoId);

    if (selected) {
      selectImageMemo(selected);
    }
} catch (error) {
  console.error(error);

  if (uploadedStoragePath) {
    await deleteStorageImage(uploadedStoragePath);
  }

  alert("画像メモの保存に失敗しました");
  imageStatus.textContent = "保存に失敗しました";
}
}

async function uploadImageFile(file) {
  const errorMessage = validateImageFile(file);

  if (errorMessage) {
    throw new Error(errorMessage);
  }

  const extension = getFileExtension(file.name);
  const fileName = `${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const storagePath = `imageMemos/${currentUser.uid}/${fileName}`;
  const imageRef = ref(storage, storagePath);

  await uploadBytes(imageRef, file, {
    contentType: file.type
  });

  const imageUrl = await getDownloadURL(imageRef);

  return {
    imageUrl,
    storagePath
  };
}

/* ---------- delete ---------- */

async function deleteImageMemo() {
  if (!currentUser) {
    alert("先にログインしてください");
    return;
  }

  if (!isAdmin(currentUser)) {
    alert("このページは管理人専用です");
    location.href = "/";
    return;
  }

  if (!selectedImageMemoId) {
    alert("削除する画像メモを選んでください");
    return;
  }

  const selectedMemo = getSelectedMemo();

  const ok = confirm("この画像メモを削除しますか？");

  if (!ok) return;

  try {
    if (selectedMemo?.storagePath) {
      await deleteStorageImage(selectedMemo.storagePath);
    }

    await deleteDoc(doc(db, "imageMemos", selectedImageMemoId));

    selectedImageMemoId = null;
    selectedFile = null;
    clearForm();

    imageStatus.textContent = "削除しました";

    await loadImageMemos();
  } catch (error) {
    console.error(error);
    alert("画像メモの削除に失敗しました");
    imageStatus.textContent = "削除に失敗しました";
  }
}

async function deleteStorageImage(storagePath) {
  if (!storagePath) return;

  try {
    const imageRef = ref(storage, storagePath);
    await deleteObject(imageRef);
  } catch (error) {
    console.warn("Storage画像の削除に失敗しました", error);
  }
}

/* ---------- markdown ---------- */

async function copyMarkdown() {
  const selectedMemo = getSelectedMemo();

  const title = imageTitleInput.value.trim() || selectedMemo?.title || "画像";
  const imageUrl = getCurrentImageUrl();

  if (!imageUrl) {
    alert("コピーする画像がありません");
    return;
  }

  const markdown = `![${escapeMarkdownText(title)}](${imageUrl})`;

  try {
    await navigator.clipboard.writeText(markdown);
    imageStatus.textContent = "Markdownをコピーしました";
  } catch (error) {
    console.error(error);
    prompt("コピーできない場合は手動でコピーしてね", markdown);
  }
}

function getCurrentImageUrl() {
  if (inputMode === "url") {
    return normalizeImageUrl(imageUrlInput.value.trim());
  }

  const selectedMemo = getSelectedMemo();
  return selectedMemo?.imageUrl || "";
}

/* ---------- render ---------- */

function renderImageMemos() {
  imageMemoList.innerHTML = "";

  const keyword = imageSearchInput.value.trim().toLowerCase();
  const categoryFilter = imageCategoryFilter.value;
  const favoriteOnly = favoriteOnlyInput.checked;

  let filtered = [...imageMemos];

  if (categoryFilter !== "all") {
    filtered = filtered.filter((item) => item.category === categoryFilter);
  }

  if (favoriteOnly) {
    filtered = filtered.filter((item) => item.favorite);
  }

  if (keyword) {
    filtered = filtered.filter((item) => {
      const searchText = [
        item.title,
        item.category,
        item.tags,
        item.memo
      ]
        .join(" ")
        .toLowerCase();

      return searchText.includes(keyword);
    });
  }

  if (filtered.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-text";
    empty.textContent = "画像メモがありません";
    imageMemoList.appendChild(empty);
    return;
  }

  filtered.forEach((item) => {
    const card = document.createElement("button");
    card.className = selectedImageMemoId === item.id
      ? "image-memo-card active"
      : "image-memo-card";

    const thumb = document.createElement("div");
    thumb.className = "image-memo-thumb";

    const img = document.createElement("img");
    img.src = item.imageUrl;
    img.alt = item.title || "画像";

    thumb.appendChild(img);

    const info = document.createElement("div");
    info.className = "image-memo-info";

    const title = document.createElement("p");
    title.className = "image-memo-title";
    title.textContent = `${item.favorite ? "★ " : ""}${item.title || "無題の画像"}`;

    const sub = document.createElement("p");
    sub.className = "image-memo-sub";
    sub.textContent = makeSubText(item);

    const tags = document.createElement("div");
    tags.className = "image-memo-tags";

    splitTags(item.tags).slice(0, 4).forEach((tag) => {
      const badge = document.createElement("span");
      badge.className = "image-memo-tag";
      badge.textContent = tag;
      tags.appendChild(badge);
    });

    info.appendChild(title);
    info.appendChild(sub);
    info.appendChild(tags);

    card.appendChild(thumb);
    card.appendChild(info);

    card.addEventListener("click", () => {
      selectImageMemo(item);
    });

    imageMemoList.appendChild(card);
  });
}

function selectImageMemo(item) {
  selectedImageMemoId = item.id;
  selectedFile = null;

  imageFormTitle.textContent = "画像メモを編集";

  imageTitleInput.value = item.title || "";
  imageCategoryInput.value = item.category || "";
  imageTagsInput.value = item.tags || "";
  imageMemoInput.value = item.memo || "";
  imageFavoriteInput.checked = Boolean(item.favorite);

  imageFileInput.value = "";
  selectedFileText.textContent = "新しい画像を選ぶと差し替えできます。";

  imageUrlInput.value = item.sourceType === "url" ? item.imageUrl || "" : "";

  if (item.sourceType === "url") {
    setInputMode("url");
  } else {
    setInputMode("upload");
  }

  updatePreview(item.imageUrl || "");

  imageStatus.textContent = "編集中";

  renderImageMemos();
}

function updateCategoryFilter() {
  const currentValue = imageCategoryFilter.value || "all";

  const categories = [...new Set(
    imageMemos
      .map((item) => item.category)
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, "ja"));

  imageCategoryFilter.innerHTML = `<option value="all">すべて</option>`;

  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    imageCategoryFilter.appendChild(option);
  });

  const exists = categories.includes(currentValue);

  imageCategoryFilter.value = exists ? currentValue : "all";
}

/* ---------- helpers ---------- */

function clearForm() {
  imageFormTitle.textContent = "画像を追加";

  imageFileInput.value = "";
  selectedFileText.textContent = "まだ画像は選択されていません。";
  imageUrlInput.value = "";

  imageTitleInput.value = "";
  imageCategoryInput.value = "";
  imageTagsInput.value = "";
  imageMemoInput.value = "";
  imageFavoriteInput.checked = false;

  setInputMode("upload");
  updatePreview("");
}

function updatePreview(src) {
  if (!src) {
    imagePreview.classList.add("hidden");
    imagePreview.removeAttribute("src");
    imagePreviewEmpty.classList.remove("hidden");
    return;
  }

  imagePreview.src = src;
  imagePreview.classList.remove("hidden");
  imagePreviewEmpty.classList.add("hidden");
}

function getSelectedMemo() {
  return imageMemos.find((item) => item.id === selectedImageMemoId);
}

function validateImageFile(file) {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return "使える画像形式は png / jpg / jpeg / webp / gif です";
  }

  if (file.size > MAX_IMAGE_SIZE) {
    return "画像サイズは5MBまでにしてください";
  }

  return "";
}

function getFileExtension(fileName) {
  const extension = fileName.split(".").pop().toLowerCase();

  if (extension === "jpg") return "jpg";
  if (extension === "jpeg") return "jpeg";
  if (extension === "png") return "png";
  if (extension === "webp") return "webp";
  if (extension === "gif") return "gif";

  return "png";
}

function normalizeImageUrl(input) {
  if (!input) return "";

  try {
    if (input.startsWith("/")) {
      const url = new URL(input, location.origin);
      return isSafeImageUrl(url) ? url.pathname + url.search : "";
    }

    const url = new URL(input);

    return isSafeImageUrl(url) ? url.toString() : "";
  } catch (error) {
    return "";
  }
}

function isSafeImageUrl(url) {
  const allowedProtocols = ["https:", "http:"];

  if (!allowedProtocols.includes(url.protocol)) {
    return false;
  }

  const path = url.pathname.toLowerCase();

  const allowedExtensions = [
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".avif"
  ];

  const hasExtension = path.includes(".");

  if (!hasExtension) {
    return true;
  }

  return allowedExtensions.some((ext) => path.endsWith(ext));
}

function checkImageCanLoad(src) {
  return new Promise((resolve) => {
    const img = new Image();

    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);

    img.referrerPolicy = "no-referrer";
    img.src = src;

    setTimeout(() => {
      resolve(false);
    }, 5000);
  });
}

function formatFileSize(size) {
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)}KB`;
  return `${(size / 1024 / 1024).toFixed(1)}MB`;
}

function splitTags(tags = "") {
  return tags
    .split(/[,\s、，]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function makeSubText(item) {
  const parts = [];

  if (item.category) parts.push(item.category);
  if (item.sourceType === "upload") parts.push("アップロード");
  if (item.sourceType === "url") parts.push("URL");

  return parts.length ? parts.join(" / ") : "補足なし";
}

function escapeMarkdownText(text) {
  return String(text)
    .replaceAll("[", "")
    .replaceAll("]", "")
    .replaceAll("(", "")
    .replaceAll(")", "");
}

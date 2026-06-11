// normal.js

import {
  auth,
  googleProvider,
  db
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

const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const userInfo = document.getElementById("userInfo");

const addFolderBtn = document.getElementById("addFolderBtn");
const addChildFolderBtn = document.getElementById("addChildFolderBtn");
const normalFolderList = document.getElementById("normalFolderList");
const normalFolderSelect = document.getElementById("normalFolderSelect");

const normalSearchInput = document.getElementById("normalSearchInput");
const newNormalMemoBtn = document.getElementById("newNormalMemoBtn");
const normalMemoList = document.getElementById("normalMemoList");

const normalTitleInput = document.getElementById("normalTitleInput");
const normalBodyEditor = document.getElementById("normalBodyEditor");
const normalPreview = document.getElementById("normalPreview");

const editModeBtn = document.getElementById("editModeBtn");
const previewModeBtn = document.getElementById("previewModeBtn");
const insertImageBtn = document.getElementById("insertImageBtn");
const exportMdBtn = document.getElementById("exportMdBtn");

const saveNormalMemoBtn = document.getElementById("saveNormalMemoBtn");
const deleteNormalMemoBtn = document.getElementById("deleteNormalMemoBtn");
const normalSaveStatus = document.getElementById("normalSaveStatus");

let currentUser = null;
let normalFolders = [];
let normalMemos = [];
let selectedFolderId = "all";
let selectedMemoId = null;
let currentMode = "edit";

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

    normalFolders = [];
    normalMemos = [];
    selectedMemoId = null;
    selectedFolderId = "all";

    normalTitleInput.value = "";
    normalBodyEditor.value = "";
    normalMemoList.innerHTML = "";
    normalSaveStatus.textContent = "ログインしてください";

    renderNormalFolders();
    renderNormalFolderSelect();
    setMode("edit");

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
  normalSaveStatus.textContent = "メモを使えます";

  await loadNormalFolders();
  await loadNormalMemos();
});

/* ---------- folders ---------- */

addFolderBtn.addEventListener("click", async () => {
  await createFolder("");
});

addChildFolderBtn.addEventListener("click", async () => {
  if (selectedFolderId === "all" || selectedFolderId === "") {
    alert("子フォルダを作る親フォルダを選んでください");
    return;
  }

  await createFolder(selectedFolderId);
});

async function createFolder(parentId) {
  if (!currentUser) {
    alert("先にログインしてください");
    return;
  }

  if (!isAdmin(currentUser)) {
    alert("このページは管理人専用です");
    location.href = "/";
    return;
  }

  const name = prompt(parentId ? "子フォルダ名を入力してね" : "フォルダ名を入力してね");

  if (!name || !name.trim()) return;

  try {
    await addDoc(collection(db, "normalFolders"), {
      uid: currentUser.uid,
      name: name.trim(),
      parentId,
      createdAt: serverTimestamp()
    });

    await loadNormalFolders();
  } catch (error) {
    console.error(error);
    alert("フォルダ作成に失敗しました");
  }
}

async function loadNormalFolders() {
  if (!currentUser) return;

  const q = query(
    collection(db, "normalFolders"),
    where("uid", "==", currentUser.uid)
  );

  const snapshot = await getDocs(q);

  normalFolders = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data()
  }));

  normalFolders.sort((a, b) => {
    const aTime = a.createdAt?.seconds || 0;
    const bTime = b.createdAt?.seconds || 0;
    return aTime - bTime;
  });

  renderNormalFolders();
  renderNormalFolderSelect();
}

function renderNormalFolders() {
  normalFolderList.innerHTML = "";

  const allBtn = createFolderButton("すべて", "all");
  normalFolderList.appendChild(allBtn);

  const noFolderBtn = createFolderButton("フォルダなし", "");
  normalFolderList.appendChild(noFolderBtn);

  const rootFolders = normalFolders.filter((folder) => !folder.parentId);

  rootFolders.forEach((folder) => {
    const wrapper = document.createElement("div");

    const parentBtn = createFolderButton(folder.name, folder.id);
    wrapper.appendChild(parentBtn);

    const children = normalFolders.filter((item) => item.parentId === folder.id);

    if (children.length > 0) {
      const childWrap = document.createElement("div");
      childWrap.className = "folder-children";

      children.forEach((child) => {
        const childBtn = createFolderButton(`└ ${child.name}`, child.id, true);
        childWrap.appendChild(childBtn);
      });

      wrapper.appendChild(childWrap);
    }

    normalFolderList.appendChild(wrapper);
  });
}

function createFolderButton(label, folderId, isChild = false) {
  const btn = document.createElement("button");
  btn.className = selectedFolderId === folderId
    ? `folder-item ${isChild ? "child " : ""}active`
    : `folder-item ${isChild ? "child" : ""}`;

  btn.textContent = label;

  btn.addEventListener("click", () => {
    selectedFolderId = folderId;
    renderNormalFolders();
    renderNormalMemos();
  });

  return btn;
}

function renderNormalFolderSelect() {
  normalFolderSelect.innerHTML = `<option value="">フォルダなし</option>`;

  const rootFolders = normalFolders.filter((folder) => !folder.parentId);

  rootFolders.forEach((folder) => {
    const option = document.createElement("option");
    option.value = folder.id;
    option.textContent = folder.name;
    normalFolderSelect.appendChild(option);

    const children = normalFolders.filter((item) => item.parentId === folder.id);

    children.forEach((child) => {
      const childOption = document.createElement("option");
      childOption.value = child.id;
      childOption.textContent = `└ ${child.name}`;
      normalFolderSelect.appendChild(childOption);
    });
  });
}

/* ---------- memos ---------- */

newNormalMemoBtn.addEventListener("click", () => {
  selectedMemoId = null;
  normalTitleInput.value = "";
  normalBodyEditor.value = "";
  normalFolderSelect.value = selectedFolderId !== "all" ? selectedFolderId : "";
  normalSaveStatus.textContent = "新規メモ";
  setMode("edit");
  renderNormalMemos();
  normalTitleInput.focus();
});

saveNormalMemoBtn.addEventListener("click", async () => {
  await saveNormalMemo();
});

deleteNormalMemoBtn.addEventListener("click", async () => {
  await deleteNormalMemo();
});

async function saveNormalMemo() {
  if (!currentUser) {
    alert("先にログインしてください");
    return;
  }

  if (!isAdmin(currentUser)) {
    alert("このページは管理人専用です");
    location.href = "/";
    return;
  }

  const title = normalTitleInput.value.trim();
  const body = normalBodyEditor.value.trim();
  const folderId = normalFolderSelect.value;

  if (!title && !body) {
    alert("タイトルか本文を入力してください");
    return;
  }

  const safeTitle = title || getTitleFromBody(body);

  try {
    if (selectedMemoId) {
      await updateDoc(doc(db, "normalMemos", selectedMemoId), {
        title: safeTitle,
        body,
        folderId,
        updatedAt: serverTimestamp()
      });

      normalSaveStatus.textContent = "保存しました";
    } else {
      const docRef = await addDoc(collection(db, "normalMemos"), {
        uid: currentUser.uid,
        type: "normal",
        title: safeTitle,
        body,
        folderId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      selectedMemoId = docRef.id;
      normalSaveStatus.textContent = "作成しました";
    }

    await loadNormalMemos();
  } catch (error) {
    console.error(error);
    alert("保存に失敗しました");
  }
}

async function deleteNormalMemo() {
  if (!currentUser) {
    alert("先にログインしてください");
    return;
  }

  if (!isAdmin(currentUser)) {
    alert("このページは管理人専用です");
    location.href = "/";
    return;
  }

  if (!selectedMemoId) {
    alert("削除するメモを選んでください");
    return;
  }

  const ok = confirm("このメモを削除しますか？");

  if (!ok) return;

  try {
    await deleteDoc(doc(db, "normalMemos", selectedMemoId));

    selectedMemoId = null;
    normalTitleInput.value = "";
    normalBodyEditor.value = "";
    normalSaveStatus.textContent = "削除しました";

    await loadNormalMemos();
  } catch (error) {
    console.error(error);
    alert("削除に失敗しました");
  }
}

async function loadNormalMemos() {
  if (!currentUser) return;

  const q = query(
    collection(db, "normalMemos"),
    where("uid", "==", currentUser.uid)
  );

  const snapshot = await getDocs(q);

  normalMemos = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data()
  }));

  normalMemos.sort((a, b) => {
    const aTime = a.updatedAt?.seconds || 0;
    const bTime = b.updatedAt?.seconds || 0;
    return bTime - aTime;
  });

  renderNormalMemos();
}

function renderNormalMemos() {
  normalMemoList.innerHTML = "";

  const keyword = normalSearchInput.value.trim().toLowerCase();

  let filtered = normalMemos;

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
    normalMemoList.appendChild(empty);
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
      normalTitleInput.value = memo.title || "";
      normalBodyEditor.value = memo.body || "";
      normalFolderSelect.value = memo.folderId || "";
      normalSaveStatus.textContent = "編集中";
      updatePreview();
      renderNormalMemos();
    });

    normalMemoList.appendChild(btn);
  });
}

normalSearchInput.addEventListener("input", () => {
  renderNormalMemos();
});

normalTitleInput.addEventListener("input", () => {
  normalSaveStatus.textContent = selectedMemoId ? "未保存の変更あり" : "新規メモ";
});

normalBodyEditor.addEventListener("input", () => {
  normalSaveStatus.textContent = selectedMemoId ? "未保存の変更あり" : "新規メモ";
  updatePreview();
});

/* ---------- preview ---------- */

editModeBtn.addEventListener("click", () => {
  setMode("edit");
});

previewModeBtn.addEventListener("click", () => {
  setMode("preview");
});

function setMode(mode) {
  currentMode = mode;

  if (mode === "edit") {
    editModeBtn.classList.add("active");
    previewModeBtn.classList.remove("active");
    normalBodyEditor.classList.remove("hidden");
    normalPreview.classList.add("hidden");
  } else {
    previewModeBtn.classList.add("active");
    editModeBtn.classList.remove("active");
    normalBodyEditor.classList.add("hidden");
    normalPreview.classList.remove("hidden");
    updatePreview();
  }
}

function updatePreview() {
  normalPreview.innerHTML = markdownToHtml(normalBodyEditor.value);
}

/* ---------- export ---------- */

insertImageBtn.addEventListener("click", async () => {
  await insertImageMarkdown();
});

async function insertImageMarkdown() {
  const url = prompt("画像URLを入力してね\n例：https://example.com/image.png");

  if (!url || !url.trim()) return;

  const checkedUrl = normalizeImageUrl(url.trim());

  if (!checkedUrl) {
    alert("使える画像URLではありません。\nhttps:// か http:// の画像URL、または /images/sample.png のようなサイト内パスを使ってください。");
    return;
  }

  const canLoad = await checkImageCanLoad(checkedUrl);

  if (!canLoad) {
    const ok = confirm(
      "画像として読み込めませんでした。\nURLが正しくても、外部サイト側で表示を拒否している場合があります。\nそれでも差し込みますか？"
    );

    if (!ok) return;
  }

  const alt = prompt("画像の説明を入力してね", "画像") || "画像";
  const markdown = `![${alt.replaceAll("[", "").replaceAll("]", "")}](${checkedUrl})`;

  insertTextAtCursor(normalBodyEditor, markdown);

  normalSaveStatus.textContent = selectedMemoId
    ? "未保存の変更あり"
    : "新規メモ";

  updatePreview();
  normalBodyEditor.focus();
}

function insertTextAtCursor(textarea, text) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;

  const before = textarea.value.slice(0, start);
  const selected = textarea.value.slice(start, end);
  const after = textarea.value.slice(end);

  const prefix = before && !before.endsWith("\n") ? "\n\n" : "";
  const suffix = after && !after.startsWith("\n") ? "\n\n" : "\n";

  textarea.value = before + prefix + text + suffix + after;

  const nextPosition = (before + prefix + text).length;
  textarea.selectionStart = nextPosition;
  textarea.selectionEnd = nextPosition;
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

exportMdBtn.addEventListener("click", () => {
  exportCurrentMemoAsMarkdown();
});

function exportCurrentMemoAsMarkdown() {
  const title = normalTitleInput.value.trim() || "無題";
  const body = normalBodyEditor.value.trim();

  if (!title && !body) {
    alert("書き出す内容がありません");
    return;
  }

  const markdown = body
    ? `# ${title}\n\n${body}`
    : `# ${title}\n`;

  const blob = new Blob([markdown], {
    type: "text/markdown;charset=utf-8"
  });

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitizeFileName(title)}.md`;

  document.body.appendChild(a);
  a.click();

  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ---------- helpers ---------- */

function getTitleFromBody(body) {
  const firstLine = body
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  return firstLine || "無題";
}

function makePreview(body = "") {
  const text = body
    .replaceAll("#", "")
    .replaceAll(">", "")
    .replaceAll("-", "")
    .replaceAll("[ ]", "")
    .replaceAll("[x]", "")
    .trim();

  return text ? text.slice(0, 70) : "本文なし";
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function markdownToHtml(markdown = "") {
  const escaped = escapeHtml(markdown);
  const lines = escaped.split("\n");

  let html = "";
  let inList = false;
  let inCode = false;
  let codeLines = [];

  const closeList = () => {
    if (inList) {
      html += "</ul>";
      inList = false;
    }
  };

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      if (!inCode) {
        closeList();
        inCode = true;
        codeLines = [];
      } else {
        html += `<pre><code>${codeLines.join("\n")}</code></pre>`;
        inCode = false;
        codeLines = [];
      }

      return;
    }

    if (inCode) {
      codeLines.push(line);
      return;
    }

    if (!trimmed) {
      closeList();
      html += "<p></p>";
      return;
    }

    if (trimmed.startsWith("### ")) {
      closeList();
      html += `<h3>${formatInline(trimmed.slice(4))}</h3>`;
      return;
    }

    if (trimmed.startsWith("## ")) {
      closeList();
      html += `<h2>${formatInline(trimmed.slice(3))}</h2>`;
      return;
    }

    if (trimmed.startsWith("# ")) {
      closeList();
      html += `<h1>${formatInline(trimmed.slice(2))}</h1>`;
      return;
    }

    if (trimmed.startsWith("> ")) {
      closeList();
      html += `<blockquote>${formatInline(trimmed.slice(2))}</blockquote>`;
      return;
    }

    const imageMatch = trimmed.match(/^!\[(.*?)\]\((.*?)\)$/);

if (imageMatch) {
  closeList();

  const alt = imageMatch[1] || "画像";
  const src = normalizeImageUrl(imageMatch[2] || "");

  if (!src) {
    html += `<p class="image-error">画像URLが無効です</p>`;
    return;
  }

  html += `
    <figure class="memo-image-block">
      <img src="${escapeAttribute(src)}" alt="${escapeAttribute(alt)}">
      ${alt ? `<figcaption>${formatInline(alt)}</figcaption>` : ""}
    </figure>
  `;

  return;
}

    const imageMatch = trimmed.match(/^!\[(.*?)\]\((.*?)\)$/);

if (imageMatch) {
  closeList();

  const alt = imageMatch[1] || "画像";
  const src = imageMatch[2] || "";

  html += `
    <figure class="memo-image-block">
      <img src="${src}" alt="${alt}">
      ${alt ? `<figcaption>${alt}</figcaption>` : ""}
    </figure>
  `;

  return;
}

    if (trimmed.startsWith("- [ ] ")) {
      closeList();
      html += `<p class="check-line">☐ <span>${formatInline(trimmed.slice(6))}</span></p>`;
      return;
    }

    if (trimmed.startsWith("- [x] ") || trimmed.startsWith("- [X] ")) {
      closeList();
      html += `<p class="check-line">☑ <span>${formatInline(trimmed.slice(6))}</span></p>`;
      return;
    }

    if (trimmed.startsWith("- ")) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }

      html += `<li>${formatInline(trimmed.slice(2))}</li>`;
      return;
    }

    closeList();
    html += `<p>${formatInline(trimmed)}</p>`;
  });

  closeList();

  if (inCode) {
    html += `<pre><code>${codeLines.join("\n")}</code></pre>`;
  }

  return html;
}

function formatInline(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.*?)`/g, "<code>$1</code>");
}

function sanitizeFileName(name) {
  return name
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 50) || "memo";
}

function escapeAttribute(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

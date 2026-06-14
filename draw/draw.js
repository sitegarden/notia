// draw.js
import { auth, googleProvider, db, storage } from "../firebase.js";
import { isAdmin } from "../admin.js";

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

const authGate = document.getElementById("authGate");
const drawApp = document.getElementById("drawApp");

const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const appLogoutBtn = document.getElementById("appLogoutBtn");
const userInfo = document.getElementById("userInfo");
const drawStatus = document.getElementById("drawStatus");

const canvas = document.getElementById("drawCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });

const titleInput = document.getElementById("drawTitle");
const penColorInput = document.getElementById("penColor");
const penSizeInput = document.getElementById("penSize");
const pressureToggle = document.getElementById("pressureToggle");
const fingerDrawToggle = document.getElementById("fingerDrawToggle");

const zoomRange = document.getElementById("zoomRange");
const zoomOutBtn = document.getElementById("zoomOutBtn");
const zoomResetBtn = document.getElementById("zoomResetBtn");
const zoomInBtn = document.getElementById("zoomInBtn");

const newDrawBtn = document.getElementById("newDrawBtn");
const exportBtn = document.getElementById("exportBtn");
const saveBtn = document.getElementById("saveBtn");
const clearBtn = document.getElementById("clearBtn");
const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");
const penBtn = document.getElementById("penBtn");
const eraserBtn = document.getElementById("eraserBtn");

const drawList = document.getElementById("drawList");
const canvasStatus = document.getElementById("canvasStatus");

const MAX_DRAW_SIZE = 5 * 1024 * 1024;

let currentUser = null;
let drawMemos = [];
let selectedDrawMemoId = null;

let currentTool = "pen";
let drawing = false;
let lastPoint = null;

let undoStack = [];
let redoStack = [];

let zoom = 1;

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
  await logout();
});

appLogoutBtn.addEventListener("click", async () => {
  await logout();
});

async function logout() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error(error);
    alert("ログアウトに失敗しました");
  }
}

onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  if (!user) {
    showGate("ログインしてください");
    drawMemos = [];
    selectedDrawMemoId = null;
    renderDrawMemos();
    return;
  }

  if (!isAdmin(user)) {
    alert("このページは管理人専用です");
    location.href = "/";
    return;
  }

  showApp(user);
  await loadDrawMemos();
});

/* ---------- gate ---------- */

function showGate(message = "") {
  authGate.classList.remove("hidden");
  drawApp.classList.add("hidden");

  loginBtn.classList.remove("hidden");
  logoutBtn.classList.add("hidden");

  userInfo.textContent = "";
  drawStatus.textContent = message || "ログインしてください";
}

function showApp(user) {
  authGate.classList.add("hidden");
  drawApp.classList.remove("hidden");

  loginBtn.classList.add("hidden");
  logoutBtn.classList.remove("hidden");

  userInfo.textContent = user.displayName || user.email || "ログイン中";
  drawStatus.textContent = "管理人としてログイン中";
  canvasStatus.textContent = "保存できます";
}

/* ---------- canvas base ---------- */

function createId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function setCanvasWhite() {
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function snapshot() {
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function restoreSnapshot(imageData) {
  ctx.putImageData(imageData, 0, 0);
}

function pushUndo() {
  undoStack.push(snapshot());

  if (undoStack.length > 30) {
    undoStack.shift();
  }

  redoStack = [];
}

function resetCanvas() {
  selectedDrawMemoId = null;
  titleInput.value = "";

  undoStack = [];
  redoStack = [];

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  setCanvasWhite();
  pushUndo();

  canvasStatus.textContent = "新規作成中";
  renderDrawMemos();
}

/* ---------- pointer ---------- */

function canDrawWithPointer(event) {
  if (event.pointerType === "mouse") {
    return true;
  }

  if (event.pointerType === "pen") {
    return true;
  }

  if (event.pointerType === "touch") {
    return fingerDrawToggle.checked;
  }

  return true;
}

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();

  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    pressure: event.pressure || 0.5
  };
}

function getLineWidth(point) {
  const baseSize = Number(penSizeInput.value);

  if (!pressureToggle.checked) {
    return baseSize;
  }

  const pressure = Math.max(0.12, point.pressure || 0.5);
  return Math.max(1, baseSize * pressure);
}

function drawLine(from, to) {
  ctx.save();

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = penColorInput.value;
  ctx.lineWidth = getLineWidth(to);

  if (currentTool === "eraser") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineWidth = getLineWidth(to) * 1.8;
  } else {
    ctx.globalCompositeOperation = "source-over";
  }

  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();

  ctx.restore();
}

function startDrawing(event) {
  if (!canDrawWithPointer(event)) {
    return;
  }

  event.preventDefault();

  drawing = true;
  lastPoint = getCanvasPoint(event);
  pushUndo();

  canvas.setPointerCapture?.(event.pointerId);

  drawLine(lastPoint, {
    ...lastPoint,
    x: lastPoint.x + 0.01,
    y: lastPoint.y + 0.01
  });

  canvasStatus.textContent = selectedDrawMemoId ? "未保存の変更あり" : "新規作成中";
}

function moveDrawing(event) {
  if (!drawing || !lastPoint) return;
  if (!canDrawWithPointer(event)) return;

  event.preventDefault();

  const point = getCanvasPoint(event);
  drawLine(lastPoint, point);
  lastPoint = point;
}

function endDrawing(event) {
  if (!drawing) return;

  drawing = false;
  lastPoint = null;

  canvas.releasePointerCapture?.(event.pointerId);
}

/* ---------- tools ---------- */

function setTool(tool) {
  currentTool = tool;

  penBtn.classList.toggle("active", tool === "pen");
  eraserBtn.classList.toggle("active", tool === "eraser");

  canvas.style.cursor = tool === "eraser" ? "cell" : "crosshair";
}

function undo() {
  if (undoStack.length <= 1) return;

  redoStack.push(snapshot());
  undoStack.pop();
  restoreSnapshot(undoStack[undoStack.length - 1]);

  canvasStatus.textContent = selectedDrawMemoId ? "未保存の変更あり" : "新規作成中";
}

function redo() {
  if (redoStack.length === 0) return;

  const imageData = redoStack.pop();
  undoStack.push(snapshot());
  restoreSnapshot(imageData);

  canvasStatus.textContent = selectedDrawMemoId ? "未保存の変更あり" : "新規作成中";
}

function clearCanvas() {
  const ok = confirm("キャンバスを全消しする？");
  if (!ok) return;

  pushUndo();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  setCanvasWhite();

  canvasStatus.textContent = selectedDrawMemoId ? "未保存の変更あり" : "新規作成中";
}

/* ---------- zoom ---------- */

function applyZoom() {
  zoom = Number(zoomRange.value) / 100;
  canvas.style.transform = `scale(${zoom})`;
  zoomResetBtn.textContent = `${Math.round(zoom * 100)}%`;
}

function setZoom(value) {
  const next = Math.min(300, Math.max(25, value));
  zoomRange.value = String(next);
  applyZoom();
}

/* ---------- firebase load ---------- */

async function loadDrawMemos() {
  if (!currentUser) return;

  canvasStatus.textContent = "読み込み中...";

  try {
    const q = query(
      collection(db, "drawMemos"),
      where("uid", "==", currentUser.uid)
    );

    const snapshot = await getDocs(q);

    drawMemos = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    drawMemos.sort((a, b) => {
      const aTime = a.updatedAt?.seconds || 0;
      const bTime = b.updatedAt?.seconds || 0;
      return bTime - aTime;
    });

    renderDrawMemos();
    canvasStatus.textContent = "保存できます";
  } catch (error) {
    console.error(error);
    canvasStatus.textContent = "読み込みに失敗しました";
    alert("らくがきメモの読み込みに失敗しました。Firestoreルールを確認してください。");
  }
}

/* ---------- firebase save ---------- */

async function saveCurrentDrawing() {
  if (!currentUser) {
    alert("先にログインしてください");
    return;
  }

  if (!isAdmin(currentUser)) {
    alert("このページは管理人専用です");
    location.href = "/";
    return;
  }

  const title = titleInput.value.trim() || "無題のらくがき";
  const selectedMemo = getSelectedMemo();

  let uploadedStoragePath = "";

  try {
    canvasStatus.textContent = "保存中...";

    const blob = await canvasToBlob();

    if (!blob) {
      alert("画像の作成に失敗しました");
      canvasStatus.textContent = "保存に失敗しました";
      return;
    }

    if (blob.size > MAX_DRAW_SIZE) {
      alert("画像サイズが大きすぎます。5MB以内にしてください。");
      canvasStatus.textContent = "画像サイズが大きすぎます";
      return;
    }

    const drawId = selectedDrawMemoId || createId();
    const storagePath = `drawMemos/${currentUser.uid}/${drawId}/merged.png`;

    const imageRef = ref(storage, storagePath);

    await uploadBytes(imageRef, blob, {
      contentType: "image/png"
    });

    uploadedStoragePath = storagePath;

    const imageUrl = await getDownloadURL(imageRef);

    const data = {
      uid: currentUser.uid,
      title,
      imageUrl,
      storagePath,
      sourceType: "canvas",
      updatedAt: serverTimestamp(),

      /*
        後でレイヤー機能を入れるための余白。
        今は統合済み画像だけ保存。
        将来的には layers を複数にして、
        drawMemos/{uid}/{drawId}/layers/layer-1.png
        みたいに増やせる。
      */
      layers: [
        {
          id: "layer-1",
          name: "Layer 1",
          visible: true,
          storagePath,
          imageUrl
        }
      ]
    };

    if (selectedDrawMemoId) {
      await updateDoc(doc(db, "drawMemos", selectedDrawMemoId), data);

      if (
        selectedMemo &&
        selectedMemo.storagePath &&
        selectedMemo.storagePath !== storagePath
      ) {
        await deleteStorageImage(selectedMemo.storagePath);
      }

      canvasStatus.textContent = "保存しました";
    } else {
      const docRef = await addDoc(collection(db, "drawMemos"), {
        ...data,
        createdAt: serverTimestamp()
      });

      selectedDrawMemoId = docRef.id;
      canvasStatus.textContent = "作成しました";
    }

    await loadDrawMemos();

    const selected = drawMemos.find((item) => item.id === selectedDrawMemoId);
    if (selected) {
      selectedDrawMemoId = selected.id;
      titleInput.value = selected.title || "";
    }
  } catch (error) {
    console.error(error);

    if (uploadedStoragePath) {
      await deleteStorageImage(uploadedStoragePath);
    }

    alert("らくがきメモの保存に失敗しました");
    canvasStatus.textContent = "保存に失敗しました";
  }
}

function canvasToBlob() {
  return new Promise((resolve) => {
    const tempCanvas = document.createElement("canvas");
    const tempCtx = tempCanvas.getContext("2d");

    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;

    tempCtx.fillStyle = "#ffffff";
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    tempCtx.drawImage(canvas, 0, 0);

    tempCanvas.toBlob((blob) => {
      resolve(blob);
    }, "image/png");
  });
}

/* ---------- open / delete ---------- */

async function openDrawMemo(id) {
  const item = drawMemos.find((memo) => memo.id === id);
  if (!item) return;

  const image = new Image();
  image.crossOrigin = "anonymous";

  image.onload = () => {
    selectedDrawMemoId = item.id;
    titleInput.value = item.title || "";

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setCanvasWhite();
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    undoStack = [];
    redoStack = [];
    pushUndo();

    canvasStatus.textContent = "編集中";
    renderDrawMemos();

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  };

  image.onerror = () => {
    alert("画像を読み込めませんでした");
  };

  image.src = item.imageUrl;
}

async function deleteDrawMemo(id) {
  if (!currentUser) {
    alert("先にログインしてください");
    return;
  }

  if (!isAdmin(currentUser)) {
    alert("このページは管理人専用です");
    location.href = "/";
    return;
  }

  const item = drawMemos.find((memo) => memo.id === id);
  if (!item) return;

  const ok = confirm("このらくがきメモを削除しますか？");
  if (!ok) return;

  try {
    canvasStatus.textContent = "削除中...";

    if (item.storagePath) {
      await deleteStorageImage(item.storagePath);
    }

    if (Array.isArray(item.layers)) {
      for (const layer of item.layers) {
        if (layer.storagePath && layer.storagePath !== item.storagePath) {
          await deleteStorageImage(layer.storagePath);
        }
      }
    }

    await deleteDoc(doc(db, "drawMemos", id));

    if (selectedDrawMemoId === id) {
      resetCanvas();
    }

    await loadDrawMemos();
    canvasStatus.textContent = "削除しました";
  } catch (error) {
    console.error(error);
    alert("らくがきメモの削除に失敗しました");
    canvasStatus.textContent = "削除に失敗しました";
  }
}

async function deleteStorageImage(storagePath) {
  if (!storagePath) return;

  try {
    await deleteObject(ref(storage, storagePath));
  } catch (error) {
    console.warn("Storage画像の削除に失敗しました", error);
  }
}

/* ---------- render ---------- */

function renderDrawMemos() {
  drawList.innerHTML = "";

  if (!currentUser) {
    const empty = document.createElement("div");
    empty.className = "draw-empty";
    empty.textContent = "ログインすると保存したらくがきが表示されます。";
    drawList.appendChild(empty);
    return;
  }

  if (drawMemos.length === 0) {
    const empty = document.createElement("div");
    empty.className = "draw-empty";
    empty.textContent = "まだ保存したらくがきはありません。";
    drawList.appendChild(empty);
    return;
  }

  drawMemos.forEach((item) => {
    const card = document.createElement("article");
    card.className = "draw-card";

    const img = document.createElement("img");
    img.className = "draw-thumb";
    img.src = item.imageUrl;
    img.alt = item.title || "らくがき";
    img.loading = "lazy";

    const body = document.createElement("div");
    body.className = "draw-card-body";

    const title = document.createElement("h3");
    title.textContent = item.title || "無題のらくがき";

    const time = document.createElement("time");
    time.textContent = formatFirebaseDate(item.updatedAt || item.createdAt);

    const actions = document.createElement("div");
    actions.className = "draw-card-actions";

    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.textContent = selectedDrawMemoId === item.id ? "編集中" : "開く";
    openBtn.addEventListener("click", () => {
      openDrawMemo(item.id);
    });

    const downloadBtn = document.createElement("button");
    downloadBtn.type = "button";
    downloadBtn.textContent = "PNG";
    downloadBtn.addEventListener("click", () => {
      downloadDrawMemo(item);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "danger";
    deleteBtn.textContent = "削除";
    deleteBtn.addEventListener("click", () => {
      deleteDrawMemo(item.id);
    });

    actions.appendChild(openBtn);
    actions.appendChild(downloadBtn);
    actions.appendChild(deleteBtn);

    body.appendChild(title);
    body.appendChild(time);
    body.appendChild(actions);

    card.appendChild(img);
    card.appendChild(body);

    if (selectedDrawMemoId === item.id) {
      card.classList.add("active");
    }

    drawList.appendChild(card);
  });
}

/* ---------- helpers ---------- */

function getSelectedMemo() {
  return drawMemos.find((item) => item.id === selectedDrawMemoId);
}

function downloadDrawMemo(item) {
  if (!item?.imageUrl) return;

  const link = document.createElement("a");
  link.href = item.imageUrl;
  link.download = `${sanitizeFileName(item.title || "notia-draw")}.png`;
  link.click();
}

function exportCurrent() {
  const link = document.createElement("a");
  const title = titleInput.value.trim() || "notia-draw";

  link.href = getCanvasDataUrl();
  link.download = `${sanitizeFileName(title)}.png`;
  link.click();
}

function getCanvasDataUrl() {
  const tempCanvas = document.createElement("canvas");
  const tempCtx = tempCanvas.getContext("2d");

  tempCanvas.width = canvas.width;
  tempCanvas.height = canvas.height;

  tempCtx.fillStyle = "#ffffff";
  tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
  tempCtx.drawImage(canvas, 0, 0);

  return tempCanvas.toDataURL("image/png");
}

function formatFirebaseDate(value) {
  if (!value) return "";

  if (value.toDate) {
    return value.toDate().toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  if (value.seconds) {
    return new Date(value.seconds * 1000).toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  return "";
}

function sanitizeFileName(text) {
  return String(text)
    .replace(/[\\/:*?"<>|]/g, "")
    .trim()
    .slice(0, 40) || "notia-draw";
}

/* ---------- events ---------- */

canvas.addEventListener("pointerdown", startDrawing);
canvas.addEventListener("pointermove", moveDrawing);
canvas.addEventListener("pointerup", endDrawing);
canvas.addEventListener("pointercancel", endDrawing);
canvas.addEventListener("pointerleave", endDrawing);

penBtn.addEventListener("click", () => {
  setTool("pen");
});

eraserBtn.addEventListener("click", () => {
  setTool("eraser");
});

undoBtn.addEventListener("click", undo);
redoBtn.addEventListener("click", redo);
clearBtn.addEventListener("click", clearCanvas);

saveBtn.addEventListener("click", async () => {
  await saveCurrentDrawing();
});

exportBtn.addEventListener("click", exportCurrent);

newDrawBtn.addEventListener("click", () => {
  const ok = confirm("新しいキャンバスにする？ 未保存の内容は消えます。");
  if (!ok) return;

  resetCanvas();
});

titleInput.addEventListener("input", () => {
  canvasStatus.textContent = selectedDrawMemoId ? "未保存の変更あり" : "新規作成中";
});

zoomRange.addEventListener("input", applyZoom);

zoomOutBtn.addEventListener("click", () => {
  setZoom(Number(zoomRange.value) - 25);
});

zoomInBtn.addEventListener("click", () => {
  setZoom(Number(zoomRange.value) + 25);
});

zoomResetBtn.addEventListener("click", () => {
  setZoom(100);
});

/* ---------- init ---------- */

resetCanvas();
renderDrawMemos();
setTool("pen");
applyZoom();

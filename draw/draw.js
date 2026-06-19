import { auth, googleProvider, db, storage } from "../firebase.js";
import { isAdmin } from "../admin.js";

import {
  signInWithPopup,
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

const CANVAS_WIDTH = 1240;
const CANVAS_HEIGHT = 1754;
const MAX_DRAW_SIZE = 5 * 1024 * 1024;

const authGate = document.getElementById("authGate");
const drawApp = document.getElementById("drawApp");

const loginBtn = document.getElementById("loginBtn");
const userInfo = document.getElementById("userInfo");
const drawStatus = document.getElementById("drawStatus");

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

const canvasStatus = document.getElementById("canvasStatus");
const canvasStack = document.getElementById("canvasStack");
const canvasWrap = document.querySelector(".draw-canvas-wrap");
const drawList = document.getElementById("drawList");

const layerList = document.getElementById("layerList");
const addLayerBtn = document.getElementById("addLayerBtn");
const moveLayerUpBtn = document.getElementById("moveLayerUpBtn");
const moveLayerDownBtn = document.getElementById("moveLayerDownBtn");
const deleteLayerBtn = document.getElementById("deleteLayerBtn");

const referenceImageInput = document.getElementById("referenceImageInput");
const referenceOpacityRange = document.getElementById("referenceOpacityRange");
const clearReferenceBtn = document.getElementById("clearReferenceBtn");

let referenceImageUrl = "";
let referenceImageVisible = false;

let currentUser = null;
let drawMemos = [];
let selectedDrawMemoId = null;

let layers = [];
let activeLayerId = null;

let currentTool = "pen";
let drawing = false;
let lastPoint = null;

let undoStack = [];
let redoStack = [];

let zoom = 0.7;
let panX = 24;
let panY = 24;

const activePointers = new Map();
let canvasGestureMode = "none";
let gestureStartDistance = 0;
let gestureStartZoom = 100;
let gestureStartCenter = null;
let gestureStartPan = { x: 0, y: 0 };

/* ---------- auth ---------- */

loginBtn.addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    console.error(error);
    alert("ログインに失敗しました");
  }
});

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

  userInfo.textContent = "";
  drawStatus.textContent = message || "ログインしてください";
}

function showApp(user) {
  authGate.classList.add("hidden");
  drawApp.classList.remove("hidden");

  loginBtn.classList.add("hidden");

  userInfo.textContent = user.displayName || user.email || "ログイン中";
  drawStatus.textContent = "管理人としてログイン中";
  canvasStatus.textContent = "保存できます";
}

/* ---------- ids ---------- */

function createId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/* ---------- layers ---------- */

function createLayer(name = "") {
  const id = createId();

  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  canvas.className = "layer-canvas";
  canvas.dataset.layerId = id;

  canvas.addEventListener("pointerdown", startDrawing);
  canvas.addEventListener("pointermove", moveDrawing);
  canvas.addEventListener("pointerup", endDrawing);
  canvas.addEventListener("pointercancel", endDrawing);
  canvas.addEventListener("pointerleave", endDrawing);

  const layer = {
    id,
    name: name || `Layer ${layers.length + 1}`,
    visible: true,
    canvas
  };

  layers.unshift(layer);
  activeLayerId = id;

  renderLayers();
  renderCanvasStack();
  pushUndo();

  return layer;
}

function getActiveLayer() {
  return layers.find((layer) => layer.id === activeLayerId) || null;
}

function getActiveCanvas() {
  return getActiveLayer()?.canvas || null;
}

function getActiveContext() {
  const canvas = getActiveCanvas();
  return canvas?.getContext("2d", { willReadFrequently: true }) || null;
}

function renderCanvasStack() {
  canvasStack.innerHTML = "";

  if (referenceImageVisible && referenceImageUrl) {
    referenceImageElement.src = referenceImageUrl;
    referenceImageElement.hidden = false;
    referenceImageElement.style.opacity = String(
      Number(referenceOpacityRange?.value || 35) / 100
    );
    canvasStack.appendChild(referenceImageElement);
  } else {
    referenceImageElement.hidden = true;
    referenceImageElement.removeAttribute("src");
  }

  [...layers].reverse().forEach((layer) => {
    layer.canvas.style.display = layer.visible ? "block" : "none";
    layer.canvas.style.pointerEvents = layer.id === activeLayerId ? "auto" : "none";
    layer.canvas.style.zIndex = "1";

    canvasStack.appendChild(layer.canvas);
  });

  applyZoom();
}

async function loadReferenceImage(file) {
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    alert("画像ファイルを選んでください");
    return;
  }

  if (referenceImageUrl) {
    URL.revokeObjectURL(referenceImageUrl);
  }

  referenceImageUrl = URL.createObjectURL(file);
  referenceImageVisible = true;

  renderCanvasStack();
}

function updateReferenceOpacity() {
  if (!referenceOpacityRange) return;

  const opacity = Number(referenceOpacityRange.value) / 100;
  referenceImageElement.style.opacity = String(opacity);
}

function clearReferenceImage() {
  if (referenceImageUrl) {
    URL.revokeObjectURL(referenceImageUrl);
  }

  referenceImageUrl = "";
  referenceImageVisible = false;

  if (referenceImageInput) {
    referenceImageInput.value = "";
  }

  renderCanvasStack();
}

function renderLayers() {
  layerList.innerHTML = "";

  layers.forEach((layer) => {
    const item = document.createElement("div");
    item.className = "layer-item";
    item.classList.toggle("active", layer.id === activeLayerId);

    const eyeBtn = document.createElement("button");
    eyeBtn.type = "button";
    eyeBtn.className = "layer-eye";
    eyeBtn.classList.toggle("off", !layer.visible);
    eyeBtn.textContent = layer.visible ? "👁" : "—";
    eyeBtn.addEventListener("click", () => {
      layer.visible = !layer.visible;
      markDirty();
      renderLayers();
      renderCanvasStack();
    });

    const selectBtn = document.createElement("button");
    selectBtn.type = "button";
    selectBtn.className = "layer-select";
    selectBtn.textContent = layer.name;
    selectBtn.addEventListener("click", () => {
      activeLayerId = layer.id;
      renderLayers();
      renderCanvasStack();
    });

    const renameBtn = document.createElement("button");
    renameBtn.type = "button";
    renameBtn.className = "layer-menu";
    renameBtn.textContent = "…";
    renameBtn.addEventListener("click", () => {
      const nextName = prompt("レイヤー名", layer.name);
      if (!nextName) return;

      layer.name = nextName.trim().slice(0, 24) || layer.name;
      markDirty();
      renderLayers();
    });

    item.appendChild(eyeBtn);
    item.appendChild(selectBtn);
    item.appendChild(renameBtn);

    layerList.appendChild(item);
  });
}

function addLayer() {
  createLayer();
  markDirty();
}

function deleteActiveLayer() {
  if (layers.length <= 1) {
    alert("レイヤーは最低1枚必要です");
    return;
  }

  const activeLayer = getActiveLayer();
  if (!activeLayer) return;

  const ok = confirm(`「${activeLayer.name}」を削除する？`);
  if (!ok) return;

  pushUndo();

  layers = layers.filter((layer) => layer.id !== activeLayer.id);
  activeLayerId = layers[0]?.id || null;

  markDirty();
  renderLayers();
  renderCanvasStack();
}

function moveActiveLayer(direction) {
  const index = layers.findIndex((layer) => layer.id === activeLayerId);
  if (index < 0) return;

  const nextIndex = index + direction;

  if (nextIndex < 0 || nextIndex >= layers.length) {
    return;
  }

  const temp = layers[index];
  layers[index] = layers[nextIndex];
  layers[nextIndex] = temp;

  markDirty();
  renderLayers();
  renderCanvasStack();
}

function clearAllLayers() {
  layers.forEach((layer) => {
    const ctx = layer.canvas.getContext("2d");
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  });
}

function resetLayers() {
  layers = [];
  activeLayerId = null;
  canvasStack.innerHTML = "";

  createLayer("Layer 1");

  undoStack = [];
  redoStack = [];
  pushUndo();
}

/* ---------- undo snapshot ---------- */

function snapshot() {
  return layers.map((layer) => ({
    id: layer.id,
    name: layer.name,
    visible: layer.visible,
    dataUrl: layer.canvas.toDataURL("image/png")
  }));
}

async function restoreSnapshot(snapshotData) {
  layers = [];
  activeLayerId = null;
  canvasStack.innerHTML = "";

  for (const item of snapshotData) {
    const layer = createLayerFromData(item.id, item.name, item.visible);
    await loadImageToCanvas(item.dataUrl, layer.canvas);
    layers.push(layer);
  }

  activeLayerId = layers[0]?.id || null;

  renderLayers();
  renderCanvasStack();
}

function createLayerFromData(id, name, visible = true) {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  canvas.className = "layer-canvas";
  canvas.dataset.layerId = id;

  canvas.addEventListener("pointerdown", startDrawing);
  canvas.addEventListener("pointermove", moveDrawing);
  canvas.addEventListener("pointerup", endDrawing);
  canvas.addEventListener("pointercancel", endDrawing);
  canvas.addEventListener("pointerleave", endDrawing);

  return {
    id,
    name,
    visible,
    canvas
  };
}

function pushUndo() {
  undoStack.push(snapshot());

  if (undoStack.length > 30) {
    undoStack.shift();
  }

  redoStack = [];
}

async function undo() {
  if (undoStack.length <= 1) return;

  redoStack.push(snapshot());
  undoStack.pop();

  await restoreSnapshot(undoStack[undoStack.length - 1]);
  markDirty();
}

async function redo() {
  if (redoStack.length === 0) return;

  const data = redoStack.pop();
  undoStack.push(snapshot());

  await restoreSnapshot(data);
  markDirty();
}

/* ---------- drawing ---------- */

function canDrawWithPointer(event) {
  if (event.pointerType === "mouse") return true;
  if (event.pointerType === "pen") return true;
  if (event.pointerType === "touch") return fingerDrawToggle.checked;
  return true;
}

function getCanvasPoint(event) {
  const canvas = getActiveCanvas();
  const rect = canvas.getBoundingClientRect();

  return {
    x: ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH,
    y: ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT,
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
  const ctx = getActiveContext();
  if (!ctx) return;

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
  if (event.pointerType === "touch" && isCanvasGesturing()) return;
  if (event.pointerType === "touch" && activePointers.size >= 2) return;
  if (!canDrawWithPointer(event)) return;

  const activeCanvas = getActiveCanvas();

  if (!activeCanvas) return;

  event.preventDefault();

  drawing = true;

  lastPoint = getCanvasPoint(event);

  pushUndo();

  activeCanvas.setPointerCapture?.(event.pointerId);

  drawLine(lastPoint, {
    ...lastPoint,
    x: lastPoint.x + 0.01,
    y: lastPoint.y + 0.01
  });

  markDirty();
}

function moveDrawing(event) {
  if (event.pointerType === "touch" && isCanvasGesturing()) return;
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

  getActiveCanvas()?.releasePointerCapture?.(event.pointerId);
}

function setTool(tool) {
  currentTool = tool;

  penBtn.classList.toggle("active", tool === "pen");
  eraserBtn.classList.toggle("active", tool === "eraser");

  layers.forEach((layer) => {
    layer.canvas.style.cursor = tool === "eraser" ? "cell" : "crosshair";
  });
}

function clearCanvas() {
  const ok = confirm("全レイヤーを消す？");
  if (!ok) return;

  pushUndo();
  clearAllLayers();
  markDirty();
}

/* ---------- zoom / gesture ---------- */

let viewAnimationFrame = null;

function applyZoom() {
  zoom = Number(zoomRange.value) / 100;
  zoomResetBtn.textContent = `${Math.round(zoom * 100)}%`;

  if (viewAnimationFrame) {
    cancelAnimationFrame(viewAnimationFrame);
  }

  viewAnimationFrame = requestAnimationFrame(() => {
    canvasStack.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${zoom})`;
    viewAnimationFrame = null;
  });
}

function setZoom(value) {
  const next = Math.min(300, Math.max(25, value));
  zoomRange.value = String(next);
  applyZoom();
}

function resetView() {
  panX = 24;
  panY = 24;
  setZoom(70);
}

function getTouchPointers() {
  return [...activePointers.values()].filter((pointer) => pointer.pointerType === "touch");
}

function getPointerDistance(pointerA, pointerB) {
  return Math.hypot(
    pointerA.clientX - pointerB.clientX,
    pointerA.clientY - pointerB.clientY
  );
}

function getPointerCenter(pointerA, pointerB) {
  return {
    x: (pointerA.clientX + pointerB.clientX) / 2,
    y: (pointerA.clientY + pointerB.clientY) / 2
  };
}

function stopCurrentDrawingForGesture() {
  drawing = false;
  lastPoint = null;
}

function beginPinchGesture(touches) {
  if (touches.length < 2) return;

  const [pointerA, pointerB] = touches;

  canvasGestureMode = "pinch";
  gestureStartDistance = getPointerDistance(pointerA, pointerB);
  gestureStartZoom = Number(zoomRange.value);
  gestureStartCenter = getPointerCenter(pointerA, pointerB);
  gestureStartPan = { x: panX, y: panY };

  stopCurrentDrawingForGesture();
}

function updatePinchGesture(touches) {
  if (touches.length < 2 || gestureStartDistance <= 0 || !gestureStartCenter) return;

  const [pointerA, pointerB] = touches;
  const center = getPointerCenter(pointerA, pointerB);
  const distance = getPointerDistance(pointerA, pointerB);

  const nextZoom = Math.min(300, Math.max(25, gestureStartZoom * (distance / gestureStartDistance)));
  const scaleRatio = nextZoom / gestureStartZoom;

  panX = center.x - (gestureStartCenter.x - gestureStartPan.x) * scaleRatio;
  panY = center.y - (gestureStartCenter.y - gestureStartPan.y) * scaleRatio;

  zoomRange.value = String(Math.round(nextZoom));
  applyZoom();
}

function beginPanGesture(touch) {
  canvasGestureMode = "pan";
  gestureStartCenter = {
    x: touch.clientX,
    y: touch.clientY
  };
  gestureStartPan = { x: panX, y: panY };
}


function updatePanGesture(touch) {
  if (!gestureStartCenter) return;

  panX = gestureStartPan.x + touch.clientX - gestureStartCenter.x;
  panY = gestureStartPan.y + touch.clientY - gestureStartCenter.y;

  applyZoom();
}

function isCanvasAreaEvent(event) {
  return event.target === canvasStack || event.target.closest?.("#canvasStack");
}


function handleCanvasPointerDown(event) {
  if (event.pointerType !== "touch") return;
  if (!isCanvasAreaEvent(event)) return;

  canvasStack.setPointerCapture?.(event.pointerId);

  activePointers.set(event.pointerId, {
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    clientX: event.clientX,
    clientY: event.clientY
  });

  const touches = getTouchPointers();

  if (touches.length >= 2) {
    event.preventDefault();
    beginPinchGesture(touches);
    return;
  }

  if (!fingerDrawToggle.checked && touches.length === 1) {
    event.preventDefault();
    beginPanGesture(touches[0]);
  }
}

function handleCanvasPointerMove(event) {
  if (event.pointerType !== "touch") return;
  if (!activePointers.has(event.pointerId)) return;

  activePointers.set(event.pointerId, {
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    clientX: event.clientX,
    clientY: event.clientY
  });

  const touches = getTouchPointers();

  if (touches.length >= 2) {
    event.preventDefault();

    if (canvasGestureMode !== "pinch") {
      beginPinchGesture(touches);
    }

    updatePinchGesture(touches);
    return;
  }

  if (canvasGestureMode === "pan" && touches.length === 1) {
    event.preventDefault();
    updatePanGesture(touches[0]);
  }
}

function handleCanvasPointerEnd(event) {
  if (event.pointerType !== "touch") return;

  canvasStack.releasePointerCapture?.(event.pointerId);

  activePointers.delete(event.pointerId);

  const touches = getTouchPointers();

  if (touches.length >= 2) {
    beginPinchGesture(touches);
    return;
  }

  if (touches.length === 1 && !fingerDrawToggle.checked) {
    beginPanGesture(touches[0]);
    return;
  }

  canvasGestureMode = "none";
  gestureStartDistance = 0;
  gestureStartCenter = null;
}

function isCanvasGesturing() {
  return canvasGestureMode !== "none" || getTouchPointers().length >= 2;
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

    const snapshotData = await getDocs(q);

    drawMemos = snapshotData.docs.map((docSnap) => ({
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
    alert("らくがきメモの読み込みに失敗しました");
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
  const drawId = selectedDrawMemoId || createId();

  const uploadedPaths = [];

  try {
    canvasStatus.textContent = "保存中...";

    const mergedBlob = await mergedCanvasToBlob();

    if (!mergedBlob) {
      alert("画像の作成に失敗しました");
      canvasStatus.textContent = "保存に失敗しました";
      return;
    }

    if (mergedBlob.size > MAX_DRAW_SIZE) {
      alert("画像サイズが大きすぎます。5MB以内にしてください。");
      canvasStatus.textContent = "画像サイズが大きすぎます";
      return;
    }

    const mergedPath = `drawMemos/${currentUser.uid}/${drawId}/merged.png`;
    const mergedRef = ref(storage, mergedPath);

    await uploadBytes(mergedRef, mergedBlob, {
      contentType: "image/png"
    });

    uploadedPaths.push(mergedPath);

    const imageUrl = await getDownloadURL(mergedRef);

    const savedLayers = [];

    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      const layerBlob = await canvasToBlob(layer.canvas);
      const layerPath = `drawMemos/${currentUser.uid}/${drawId}/layers/${layer.id}.png`;
      const layerRef = ref(storage, layerPath);

      await uploadBytes(layerRef, layerBlob, {
        contentType: "image/png"
      });

      uploadedPaths.push(layerPath);

      const layerUrl = await getDownloadURL(layerRef);

      savedLayers.push({
        id: layer.id,
        name: layer.name,
        visible: layer.visible,
        order: i,
        storagePath: layerPath,
        imageUrl: layerUrl
      });
    }

    const data = {
      uid: currentUser.uid,
      title,
      imageUrl,
      storagePath: mergedPath,
      sourceType: "canvas-layers",
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      layers: savedLayers,
      updatedAt: serverTimestamp()
    };

    if (selectedDrawMemoId) {
      await updateDoc(doc(db, "drawMemos", selectedDrawMemoId), data);

      if (selectedMemo) {
        await cleanupOldStorage(selectedMemo, uploadedPaths);
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
  } catch (error) {
    console.error(error);

    for (const path of uploadedPaths) {
      await deleteStorageImage(path);
    }

    alert("らくがきメモの保存に失敗しました");
    canvasStatus.textContent = "保存に失敗しました";
  }
}

async function cleanupOldStorage(oldMemo, keepPaths = []) {
  const keepSet = new Set(keepPaths);

  if (oldMemo.storagePath && !keepSet.has(oldMemo.storagePath)) {
    await deleteStorageImage(oldMemo.storagePath);
  }

  if (Array.isArray(oldMemo.layers)) {
    for (const layer of oldMemo.layers) {
      if (layer.storagePath && !keepSet.has(layer.storagePath)) {
        await deleteStorageImage(layer.storagePath);
      }
    }
  }
}

/* ---------- canvas export ---------- */

function createMergedCanvas() {
  const mergedCanvas = document.createElement("canvas");
  const mergedCtx = mergedCanvas.getContext("2d");

  mergedCanvas.width = CANVAS_WIDTH;
  mergedCanvas.height = CANVAS_HEIGHT;

  mergedCtx.fillStyle = "#ffffff";
  mergedCtx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  [...layers].reverse().forEach((layer) => {
    if (!layer.visible) return;
    mergedCtx.drawImage(layer.canvas, 0, 0);
  });

  return mergedCanvas;
}

function mergedCanvasToBlob() {
  return new Promise((resolve) => {
    createMergedCanvas().toBlob((blob) => {
      resolve(blob);
    }, "image/png");
  });
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob);
    }, "image/png");
  });
}

function exportCurrent() {
  const link = document.createElement("a");
  const title = titleInput.value.trim() || "notia-draw";

  link.href = createMergedCanvas().toDataURL("image/png");
  link.download = `${sanitizeFileName(title)}.png`;
  link.click();
}

/* ---------- open / delete ---------- */

async function openDrawMemo(id) {
  const item = drawMemos.find((memo) => memo.id === id);
  if (!item) return;

  try {
    canvasStatus.textContent = "読み込み中...";

    selectedDrawMemoId = item.id;
    titleInput.value = item.title || "";

    layers = [];
    activeLayerId = null;
    canvasStack.innerHTML = "";

    const sourceLayers = Array.isArray(item.layers) && item.layers.length > 0
      ? [...item.layers].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      : [
          {
            id: createId(),
            name: "Layer 1",
            visible: true,
            imageUrl: item.imageUrl
          }
        ];

    for (const sourceLayer of sourceLayers) {
      const layer = createLayerFromData(
        sourceLayer.id || createId(),
        sourceLayer.name || "Layer",
        sourceLayer.visible !== false
      );

      await loadImageToCanvas(sourceLayer.imageUrl, layer.canvas);
      layers.push(layer);
    }

    activeLayerId = layers[0]?.id || null;

    undoStack = [];
    redoStack = [];
    pushUndo();

    renderLayers();
    renderCanvasStack();
    renderDrawMemos();

    canvasStatus.textContent = "編集中";

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  } catch (error) {
    console.error(error);
    alert("画像を読み込めませんでした");
    canvasStatus.textContent = "読み込みに失敗しました";
  }
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
        if (layer.storagePath) {
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

/* ---------- render memos ---------- */

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
    card.classList.toggle("active", selectedDrawMemoId === item.id);

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

    drawList.appendChild(card);
  });
}

/* ---------- helpers ---------- */

function resetCanvas() {
  selectedDrawMemoId = null;
  titleInput.value = "";

  resetLayers();
  clearReferenceImage();

  canvasStatus.textContent = "新規作成中";
  renderDrawMemos();
}

function markDirty() {
  canvasStatus.textContent = selectedDrawMemoId ? "未保存の変更あり" : "新規作成中";
}

function getSelectedMemo() {
  return drawMemos.find((item) => item.id === selectedDrawMemoId);
}

function loadImageToCanvas(src, canvas) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";

    image.onload = () => {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.drawImage(image, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      resolve();
    };

    image.onerror = reject;
    image.src = src;
  });
}

function downloadDrawMemo(item) {
  if (!item?.imageUrl) return;

  const link = document.createElement("a");
  link.href = item.imageUrl;
  link.download = `${sanitizeFileName(item.title || "notia-draw")}.png`;
  link.click();
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

titleInput.addEventListener("input", markDirty);

zoomRange.addEventListener("input", applyZoom);

zoomOutBtn.addEventListener("click", () => {
  setZoom(Number(zoomRange.value) - 25);
});

zoomInBtn.addEventListener("click", () => {
  setZoom(Number(zoomRange.value) + 25);
});

zoomResetBtn.addEventListener("click", resetView);

canvasStack.addEventListener("pointerdown", handleCanvasPointerDown, { capture: true });
canvasStack.addEventListener("pointermove", handleCanvasPointerMove, { capture: true });
canvasStack.addEventListener("pointerup", handleCanvasPointerEnd, { capture: true });
canvasStack.addEventListener("pointercancel", handleCanvasPointerEnd, { capture: true });
canvasStack.addEventListener("pointerleave", handleCanvasPointerEnd, { capture: true });


window.addEventListener("pointerup", handleCanvasPointerEnd, { capture: true });
window.addEventListener("pointercancel", handleCanvasPointerEnd, { capture: true });

canvasWrap?.addEventListener("gesturestart", (event) => {
  event.preventDefault();
});

canvasWrap?.addEventListener("gesturechange", (event) => {
  event.preventDefault();
});

canvasWrap?.addEventListener("gestureend", (event) => {
  event.preventDefault();
});

addLayerBtn.addEventListener("click", addLayer);

deleteLayerBtn.addEventListener("click", deleteActiveLayer);

moveLayerUpBtn.addEventListener("click", () => {
  moveActiveLayer(-1);
});

moveLayerDownBtn.addEventListener("click", () => {
  moveActiveLayer(1);
});

function createReferenceImageElement() {
  const img = document.createElement("img");
  img.className = "reference-image";
  img.alt = "下絵";
  img.hidden = true;
  img.draggable = false;
  img.style.opacity = String(Number(referenceOpacityRange?.value || 35) / 100);
  return img;
}

const referenceImageElement = createReferenceImageElement();

referenceImageInput?.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  await loadReferenceImage(file);
});

referenceOpacityRange?.addEventListener("input", updateReferenceOpacity);

clearReferenceBtn?.addEventListener("click", clearReferenceImage);

/* ---------- init ---------- */

resetCanvas();
renderDrawMemos();
setTool("pen");
applyZoom();

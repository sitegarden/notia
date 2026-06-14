const STORAGE_KEY = "notia_draw_memos_v1";

const canvas = document.getElementById("drawCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });

const titleInput = document.getElementById("drawTitle");
const penColorInput = document.getElementById("penColor");
const penSizeInput = document.getElementById("penSize");
const pressureToggle = document.getElementById("pressureToggle");

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

const fingerDrawToggle = document.getElementById("fingerDrawToggle");
const zoomRange = document.getElementById("zoomRange");
const zoomOutBtn = document.getElementById("zoomOutBtn");
const zoomResetBtn = document.getElementById("zoomResetBtn");
const zoomInBtn = document.getElementById("zoomInBtn");

let zoom = 1;

let currentId = null;
let currentTool = "pen";
let drawing = false;
let lastPoint = null;

let undoStack = [];
let redoStack = [];

function createId() {
  return `draw-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadMemos() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveMemos(memos) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(memos));
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

function updateStatus(text) {
  canvasStatus.textContent = text;
}

function resetCanvas() {
  currentId = null;
  titleInput.value = "";
  undoStack = [];
  redoStack = [];

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  setCanvasWhite();
  pushUndo();

  updateStatus("新規作成中");
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
}

function redo() {
  if (redoStack.length === 0) return;

  const imageData = redoStack.pop();
  undoStack.push(snapshot());
  restoreSnapshot(imageData);
}

function clearCanvas() {
  const ok = confirm("キャンバスを全消しする？");
  if (!ok) return;

  pushUndo();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  setCanvasWhite();
}

function getDataUrl() {
  const tempCanvas = document.createElement("canvas");
  const tempCtx = tempCanvas.getContext("2d");

  tempCanvas.width = canvas.width;
  tempCanvas.height = canvas.height;

  tempCtx.fillStyle = "#ffffff";
  tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
  tempCtx.drawImage(canvas, 0, 0);

  return tempCanvas.toDataURL("image/png");
}

function saveCurrentDrawing() {
  const memos = loadMemos();
  const now = new Date().toISOString();

  const title = titleInput.value.trim() || "無題のらくがき";
  const dataUrl = getDataUrl();

  const memo = {
    id: currentId || createId(),
    title,
    image: dataUrl,
    createdAt: now,
    updatedAt: now,

    /*
      後でレイヤー化するための余白。
      今は完成画像を1枚保存。
      将来的には layers: [{ id, name, visible, image }] で増やせる。
    */
    layers: [
      {
        id: "base",
        name: "Layer 1",
        visible: true,
        image: dataUrl
      }
    ]
  };

  const index = memos.findIndex((item) => item.id === memo.id);

  if (index >= 0) {
    memo.createdAt = memos[index].createdAt || now;
    memos[index] = memo;
  } else {
    memos.unshift(memo);
  }

  currentId = memo.id;

  saveMemos(memos);
  renderList();
  updateStatus("保存済み");
}

function openMemo(id) {
  const memos = loadMemos();
  const memo = memos.find((item) => item.id === id);

  if (!memo) return;

  const image = new Image();

  image.onload = () => {
    currentId = memo.id;
    titleInput.value = memo.title || "";

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setCanvasWhite();
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    undoStack = [];
    redoStack = [];
    pushUndo();

    updateStatus("編集中");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  image.src = memo.image;
}

function deleteMemo(id) {
  const ok = confirm("このらくがきを削除する？");
  if (!ok) return;

  const memos = loadMemos().filter((item) => item.id !== id);
  saveMemos(memos);

  if (currentId === id) {
    resetCanvas();
  }

  renderList();
}

function downloadMemo(memo) {
  const link = document.createElement("a");
  link.href = memo.image;
  link.download = `${memo.title || "notia-draw"}.png`;
  link.click();
}

function exportCurrent() {
  const link = document.createElement("a");
  const title = titleInput.value.trim() || "notia-draw";

  link.href = getDataUrl();
  link.download = `${title}.png`;
  link.click();
}

function formatDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function renderList() {
  const memos = loadMemos();

  if (memos.length === 0) {
    drawList.innerHTML = `<div class="draw-empty">まだ保存したらくがきはありません。</div>`;
    return;
  }

  drawList.innerHTML = memos.map((memo) => {
    return `
      <article class="draw-card">
        <img class="draw-thumb" src="${memo.image}" alt="">
        <div class="draw-card-body">
          <h3>${escapeHtml(memo.title || "無題のらくがき")}</h3>
          <time>${formatDate(memo.updatedAt || memo.createdAt)}</time>
          <div class="draw-card-actions">
            <button type="button" data-action="open" data-id="${memo.id}">開く</button>
            <button type="button" data-action="download" data-id="${memo.id}">保存</button>
            <button type="button" class="danger" data-action="delete" data-id="${memo.id}">削除</button>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

canvas.addEventListener("pointerdown", startDrawing);
canvas.addEventListener("pointermove", moveDrawing);
canvas.addEventListener("pointerup", endDrawing);
canvas.addEventListener("pointercancel", endDrawing);
canvas.addEventListener("pointerleave", endDrawing);

penBtn.addEventListener("click", () => setTool("pen"));
eraserBtn.addEventListener("click", () => setTool("eraser"));
undoBtn.addEventListener("click", undo);
redoBtn.addEventListener("click", redo);
clearBtn.addEventListener("click", clearCanvas);
saveBtn.addEventListener("click", saveCurrentDrawing);
exportBtn.addEventListener("click", exportCurrent);
newDrawBtn.addEventListener("click", () => {
  const ok = confirm("新しいキャンバスにする？ 未保存の内容は消えます。");
  if (ok) resetCanvas();
});

drawList.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;

  const id = button.dataset.id;
  const action = button.dataset.action;
  const memo = loadMemos().find((item) => item.id === id);

  if (action === "open") {
    openMemo(id);
  }

  if (action === "delete") {
    deleteMemo(id);
  }

  if (action === "download" && memo) {
    downloadMemo(memo);
  }
});

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

resetCanvas();
renderList();
applyZoom();
setTool("pen");

import {
  db
} from "./firebase.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const sharedTitle = document.getElementById("sharedTitle");
const sharedDate = document.getElementById("sharedDate");
const sharedBody = document.getElementById("sharedBody");

const params = new URLSearchParams(location.search);
const shareId = params.get("id");

loadSharedMemo();

async function loadSharedMemo() {
  if (!shareId) {
    showError("共有IDがありません");
    return;
  }

  try {
    const snap = await getDoc(doc(db, "sharedMemos", shareId));

    if (!snap.exists()) {
      showError("共有メモが見つかりません");
      return;
    }

    const memo = snap.data();

    if (!memo.isPublic) {
      showError("このメモは現在共有されていません");
      return;
    }

    sharedTitle.textContent = memo.title || "無題のメモ";
    sharedDate.textContent = makeDateText(memo.updatedAt || memo.createdAt);
    sharedBody.textContent = memo.body || "";
  } catch (error) {
    console.error(error);
    showError("共有メモの読み込みに失敗しました");
  }
}

function showError(message) {
  sharedTitle.textContent = message;
  sharedDate.textContent = "";
  sharedBody.textContent = "URLが間違っているか、共有が解除された可能性があります。";
}

function makeDateText(date) {
  if (!date) return "";

  if (date.toDate) {
    const d = date.toDate();

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  return "";
}

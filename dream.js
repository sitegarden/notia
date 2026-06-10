// dream.js

import {
  auth,
  googleProvider,
  db
} from "./firebase.js";

import {
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  blockIfNotAdmin
} from "./admin.js";

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

const prevMonthBtn = document.getElementById("prevMonthBtn");
const nextMonthBtn = document.getElementById("nextMonthBtn");
const monthTitle = document.getElementById("monthTitle");
const calendarGrid = document.getElementById("calendarGrid");

const selectedDateTitle = document.getElementById("selectedDateTitle");
const dreamMoodSelect = document.getElementById("dreamMoodSelect");
const dreamBody = document.getElementById("dreamBody");
const dreamStatus = document.getElementById("dreamStatus");
const saveDreamBtn = document.getElementById("saveDreamBtn");
const deleteDreamBtn = document.getElementById("deleteDreamBtn");

const prevYearBtn = document.getElementById("prevYearBtn");
const nextYearBtn = document.getElementById("nextYearBtn");

let currentUser = null;
let dreams = [];
let selectedDate = toDateText(new Date());

const today = new Date();
let viewYear = today.getFullYear();
let viewMonth = today.getMonth();

/* auth */

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

  if (user) {
    blockIfNotAdmin(user);

    loginBtn.classList.add("hidden");
    logoutBtn.classList.remove("hidden");
    userInfo.textContent = user.displayName || user.email || "ログイン中";
    dreamStatus.textContent = "夢日記を書けます";

    await loadDreams();
    selectDate(selectedDate);
  } else {
    loginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
    userInfo.textContent = "";

    dreams = [];
    dreamBody.value = "";
    dreamMoodSelect.value = "mystery";
    dreamStatus.textContent = "ログインしてください";

    renderCalendar();
    updateSelectedDateTitle();
  }
});

/* calendar */

prevMonthBtn.addEventListener("click", () => {
  viewMonth--;

  if (viewMonth < 0) {
    viewMonth = 11;
    viewYear--;
  }

  renderCalendar();
});

nextMonthBtn.addEventListener("click", () => {
  viewMonth++;

  if (viewMonth > 11) {
    viewMonth = 0;
    viewYear++;
  }

  renderCalendar();
});

prevYearBtn.addEventListener("click", () => {
  viewYear--;
  renderCalendar();
});

nextYearBtn.addEventListener("click", () => {
  viewYear++;
  renderCalendar();
});

function renderCalendar() {
  calendarGrid.innerHTML = "";

  monthTitle.textContent = `${viewYear}年 ${viewMonth + 1}月`;

  const firstDay = new Date(viewYear, viewMonth, 1);
  const lastDay = new Date(viewYear, viewMonth + 1, 0);

  const startWeek = firstDay.getDay();
  const lastDate = lastDay.getDate();

  for (let i = 0; i < startWeek; i++) {
    const empty = document.createElement("button");
    empty.className = "calendar-day empty";
    empty.disabled = true;
    calendarGrid.appendChild(empty);
  }

  for (let day = 1; day <= lastDate; day++) {
    const dateText = toDateText(new Date(viewYear, viewMonth, day));

    const btn = document.createElement("button");
    btn.className = "calendar-day";
    btn.textContent = day;

    if (dateText === toDateText(new Date())) {
      btn.classList.add("today");
    }

    if (dateText === selectedDate) {
      btn.classList.add("selected");
    }

    if (getDreamByDate(dateText)) {
      btn.classList.add("has-diary");
    }

    btn.addEventListener("click", () => {
      selectDate(dateText);
    });

    calendarGrid.appendChild(btn);
  }
}

function selectDate(dateText) {
  selectedDate = dateText;

  const date = new Date(`${dateText}T00:00:00`);
  viewYear = date.getFullYear();
  viewMonth = date.getMonth();

  updateSelectedDateTitle();
  loadSelectedDreamToEditor();
  renderCalendar();
}

function updateSelectedDateTitle() {
  selectedDateTitle.textContent = formatDateTitle(selectedDate);
}

/* dream */

saveDreamBtn.addEventListener("click", async () => {
  await saveDream();
});

deleteDreamBtn.addEventListener("click", async () => {
  await deleteDream();
});

dreamBody.addEventListener("input", () => {
  dreamStatus.textContent = "未保存の変更あり";
});

dreamMoodSelect.addEventListener("change", () => {
  dreamStatus.textContent = "未保存の変更あり";
});

async function loadDreams() {
  if (!currentUser) return;

  const q = query(
    collection(db, "dreamDiaries"),
    where("uid", "==", currentUser.uid)
  );

  const snapshot = await getDocs(q);

  dreams = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data()
  }));

  renderCalendar();
}

function loadSelectedDreamToEditor() {
  const dream = getDreamByDate(selectedDate);

  if (dream) {
    dreamMoodSelect.value = dream.mood || "mystery";
    dreamBody.value = dream.body || "";
    dreamStatus.textContent = "編集中";
  } else {
    dreamMoodSelect.value = "mystery";
    dreamBody.value = "";
    dreamStatus.textContent = "新規夢日記";
  }
}

async function saveDream() {
  if (!currentUser) {
    alert("先にログインしてください");
    return;
  }

  const body = dreamBody.value.trim();
  const mood = dreamMoodSelect.value;

  if (!body) {
    alert("夢日記が空です");
    return;
  }

  const existingDream = getDreamByDate(selectedDate);

  try {
    if (existingDream) {
      await updateDoc(doc(db, "dreamDiaries", existingDream.id), {
        mood,
        body,
        updatedAt: serverTimestamp()
      });

      dreamStatus.textContent = "保存しました";
    } else {
      await addDoc(collection(db, "dreamDiaries"), {
        uid: currentUser.uid,
        date: selectedDate,
        mood,
        body,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      dreamStatus.textContent = "作成しました";
    }

    await loadDreams();
    loadSelectedDreamToEditor();
  } catch (error) {
    console.error(error);
    alert("夢日記の保存に失敗しました");
  }
}

async function deleteDream() {
  if (!currentUser) {
    alert("先にログインしてください");
    return;
  }

  const dream = getDreamByDate(selectedDate);

  if (!dream) {
    alert("削除する夢日記がありません");
    return;
  }

  const ok = confirm("この日の夢日記を削除しますか？");

  if (!ok) return;

  try {
    await deleteDoc(doc(db, "dreamDiaries", dream.id));

    dreamBody.value = "";
    dreamMoodSelect.value = "mystery";
    dreamStatus.textContent = "削除しました";

    await loadDreams();
    renderCalendar();
  } catch (error) {
    console.error(error);
    alert("夢日記の削除に失敗しました");
  }
}

/* helpers */

function getDreamByDate(dateText) {
  return dreams.find((dream) => dream.date === dateText);
}

function toDateText(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDateTitle(dateText) {
  const date = new Date(`${dateText}T00:00:00`);
  const weekNames = ["日", "月", "火", "水", "木", "金", "土"];

  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const week = weekNames[date.getDay()];

  return `${year}年${month}月${day}日（${week}）`;
}

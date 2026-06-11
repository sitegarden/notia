// diary.js

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

const prevMonthBtn = document.getElementById("prevMonthBtn");
const nextMonthBtn = document.getElementById("nextMonthBtn");
const monthTitle = document.getElementById("monthTitle");
const calendarGrid = document.getElementById("calendarGrid");

const selectedDateTitle = document.getElementById("selectedDateTitle");
const moodSelect = document.getElementById("moodSelect");
const diaryBody = document.getElementById("diaryBody");
const diaryStatus = document.getElementById("diaryStatus");
const saveDiaryBtn = document.getElementById("saveDiaryBtn");
const deleteDiaryBtn = document.getElementById("deleteDiaryBtn");

const prevYearBtn = document.getElementById("prevYearBtn");
const nextYearBtn = document.getElementById("nextYearBtn");

let currentUser = null;
let diaries = [];
let selectedDate = toDateText(new Date());

const today = new Date();
let viewYear = today.getFullYear();
let viewMonth = today.getMonth();

renderCalendar();
updateSelectedDateTitle();

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

    diaries = [];
    diaryBody.value = "";
    moodSelect.value = "normal";
    diaryStatus.textContent = "ログインしてください";

    renderCalendar();
    updateSelectedDateTitle();
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
  diaryStatus.textContent = "日記を書けます";

  await loadDiaries();
  selectDate(selectedDate);
});

/* ---------- calendar ---------- */

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

    if (getDiaryByDate(dateText)) {
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
  loadSelectedDiaryToEditor();
  renderCalendar();
}

function updateSelectedDateTitle() {
  selectedDateTitle.textContent = formatDateTitle(selectedDate);
}

/* ---------- diary ---------- */

saveDiaryBtn.addEventListener("click", async () => {
  await saveDiary();
});

deleteDiaryBtn.addEventListener("click", async () => {
  await deleteDiary();
});

diaryBody.addEventListener("input", () => {
  diaryStatus.textContent = "未保存の変更あり";
});

moodSelect.addEventListener("change", () => {
  diaryStatus.textContent = "未保存の変更あり";
});

async function loadDiaries() {
  if (!currentUser) return;

  const q = query(
    collection(db, "diaries"),
    where("uid", "==", currentUser.uid)
  );

  const snapshot = await getDocs(q);

  diaries = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data()
  }));

  renderCalendar();
}

function loadSelectedDiaryToEditor() {
  const diary = getDiaryByDate(selectedDate);

  if (diary) {
    moodSelect.value = diary.mood || "normal";
    diaryBody.value = diary.body || "";
    diaryStatus.textContent = "編集中";
  } else {
    moodSelect.value = "normal";
    diaryBody.value = "";
    diaryStatus.textContent = "新規日記";
  }
}

async function saveDiary() {
  if (!currentUser) {
    alert("先にログインしてください");
    return;
  }

  if (!isAdmin(currentUser)) {
    alert("このページは管理人専用です");
    location.href = "/";
    return;
  }

  const body = diaryBody.value.trim();
  const mood = moodSelect.value;

  if (!body) {
    alert("日記が空です");
    return;
  }

  const existingDiary = getDiaryByDate(selectedDate);

  try {
    if (existingDiary) {
      await updateDoc(doc(db, "diaries", existingDiary.id), {
        mood,
        body,
        updatedAt: serverTimestamp()
      });

      diaryStatus.textContent = "保存しました";
    } else {
      await addDoc(collection(db, "diaries"), {
        uid: currentUser.uid,
        date: selectedDate,
        mood,
        body,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      diaryStatus.textContent = "作成しました";
    }

    await loadDiaries();
    loadSelectedDiaryToEditor();
  } catch (error) {
    console.error(error);
    alert("日記の保存に失敗しました");
  }
}

async function deleteDiary() {
  if (!currentUser) {
    alert("先にログインしてください");
    return;
  }

  if (!isAdmin(currentUser)) {
    alert("このページは管理人専用です");
    location.href = "/";
    return;
  }

  const diary = getDiaryByDate(selectedDate);

  if (!diary) {
    alert("削除する日記がありません");
    return;
  }

  const ok = confirm("この日の記録を削除しますか？");

  if (!ok) return;

  try {
    await deleteDoc(doc(db, "diaries", diary.id));

    diaryBody.value = "";
    moodSelect.value = "normal";
    diaryStatus.textContent = "削除しました";

    await loadDiaries();
    renderCalendar();
  } catch (error) {
    console.error(error);
    alert("日記の削除に失敗しました");
  }
}

/* ---------- helpers ---------- */

function getDiaryByDate(dateText) {
  return diaries.find((diary) => diary.date === dateText);
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

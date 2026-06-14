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
  collection,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
  isAdmin
} from "./admin.js";

const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const reloadBtn = document.getElementById("reloadBtn");

const userName = document.getElementById("userName");
const userStatus = document.getElementById("userStatus");
const homeContent = document.getElementById("homeContent");

const recentTimeline = document.getElementById("recentTimeline");

const quickMemoList = document.getElementById("quickMemoList");
const taskList = document.getElementById("taskList");
const sharedMemoList = document.getElementById("sharedMemoList");
const normalMemoList = document.getElementById("normalMemoList");
const diaryList = document.getElementById("diaryList");
const dreamList = document.getElementById("dreamList");
const musicList = document.getElementById("musicList");
const storyList = document.getElementById("storyList");
const peopleList = document.getElementById("peopleList");
const chatMemoList = document.getElementById("chatMemoList");
const imageMemoList = document.getElementById("imageMemoList");

let currentUser = null;
let isCurrentAdmin = false;

const DISPLAY_LIMIT = 2;
const TIMELINE_LIMIT = 6;

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

reloadBtn.addEventListener("click", async () => {
  if (!currentUser) return;
  await loadHome();
});

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  isCurrentAdmin = isAdmin(user);

  if (!user) {
    userName.textContent = "未ログイン";
    userStatus.textContent = "Googleでログインすると、最近のメモを表示できます。";

    loginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
    homeContent.classList.add("hidden");

    document.querySelectorAll(".admin-only").forEach((element) => {
      element.classList.add("hidden");
    });

    clearAllLists();
    return;
  }

  userName.textContent = user.displayName || user.email || "ログイン中";
  userStatus.textContent = isCurrentAdmin
    ? "管理人モードで表示中です。"
    : "クイックメモ・タスク・共有メモを表示中です。";

  loginBtn.classList.add("hidden");
  logoutBtn.classList.remove("hidden");
  homeContent.classList.remove("hidden");

  document.querySelectorAll(".admin-only").forEach((element) => {
    element.classList.toggle("hidden", !isCurrentAdmin);
  });

  await loadHome();
});

async function loadHome() {
  clearAllLists();

  userStatus.textContent = "最近の記録を読み込んでいます...";

  try {
    const sections = [];

    const quickMemos = await fetchUserCollection("quickMemos", "uid");

    sections.push({
      type: "quick",
      label: "クイックメモ",
      url: "/quick/",
      items: quickMemos.map((item) => ({
        ...item,
        displayTitle: getQuickMemoTitle(item),
        displayText: item.body || "",
        displayDate: getDisplayDate(item)
      }))
    });

    const tasks = await fetchUserCollection("tasks", "uid");

    sections.push({
      type: "task",
      label: "タスク",
      url: "/task/",
      items: tasks.map((item) => ({
        ...item,
        displayTitle: item.title || "無題のタスク",
        displayText: item.memo || item.category || "",
        displayDate: getDisplayDate(item)
      }))
    });

    const sharedMemos = await fetchUserCollection("sharedMemos", "ownerUid");

    sections.push({
      type: "shared",
      label: "共有メモ",
      url: "/shared/",
      items: sharedMemos.map((item) => ({
        ...item,
        displayTitle: item.title || "無題の共有メモ",
        displayText: item.body || "",
        displayDate: getDisplayDate(item)
      }))
    });

    if (isCurrentAdmin) {
      const normalMemos = await fetchUserCollection("normalMemos", "uid");

      sections.push({
        type: "normal",
        label: "通常メモ",
        url: "/normal/",
        items: normalMemos.map((item) => ({
          ...item,
          displayTitle: item.title || "無題のメモ",
          displayText: item.body || "",
          displayDate: getDisplayDate(item)
        }))
      });

      const diaries = await fetchUserCollection("diaries", "uid");

      sections.push({
        type: "diary",
        label: "日記",
        url: "/diary/",
        items: diaries.map((item) => ({
          ...item,
          displayTitle: item.date ? `${item.date} の日記` : "日記",
          displayText: item.body || item.mood || "",
          displayDate: item.date || getDisplayDate(item),
          sortDate: item.updatedAt || item.createdAt
        }))
      });

      const dreams = await fetchUserCollection("dreamDiaries", "uid");

      sections.push({
        type: "dream",
        label: "夢日記",
        url: "/dream/",
        items: dreams.map((item) => ({
          ...item,
          displayTitle: item.date ? `${item.date} の夢` : "夢日記",
          displayText: item.body || item.mood || "",
          displayDate: item.date || getDisplayDate(item),
          sortDate: item.updatedAt || item.createdAt
        }))
      });

      const musicMemos = await fetchUserCollection("musicMemos", "uid");

      sections.push({
        type: "music",
        label: "曲メモ",
        url: "/music/",
        items: musicMemos.map((item) => ({
          ...item,
          displayTitle: item.title || "無題の曲",
          displayText: [item.artist, item.genre].filter(Boolean).join(" / "),
          displayDate: getDisplayDate(item)
        }))
      });

      const storyWorks = await fetchUserCollection("storyWorks", "uid");

      sections.push({
        type: "story",
        label: "ストーリー",
        url: "/story/",
        items: storyWorks.map((item) => ({
          ...item,
          displayTitle: item.title || "無題の作品",
          displayText: item.description || "",
          displayDate: getDisplayDate(item)
        }))
      });

      const people = await fetchUserCollection("people", "uid");

      sections.push({
        type: "people",
        label: "人物帳",
        url: "/people/",
        items: people.map((item) => ({
          ...item,
          displayTitle: item.name || "名前なし",
          displayText: makePeopleText(item),
          displayDate: getDisplayDate(item)
        }))
      });

const chatRooms = await fetchUserCollection("chatRooms", "uid");
sections.push({
  type: "chat",
  label: "チャットメモ",
  url: "/chat/",
  items: chatRooms.map((item) => ({
    ...item,
    displayTitle: item.title || "無題のチャット",
    displayText: "チャット部屋",
    displayDate: getDisplayDate(item)
  }))
});

const imageMemos = await fetchUserCollection("imageMemos", "uid");
sections.push({
  type: "image",
  label: "画像メモ",
  url: "/image/",
  items: imageMemos.map((item) => ({
    ...item,
    displayTitle: item.title || "無題の画像",
    displayText: item.category || item.memo || "",
    displayDate: getDisplayDate(item)
  }))
});
      
    }

    sections.forEach((section) => {
      section.items.sort(compareByDateDesc);
    });

    renderSection(
      quickMemoList,
      sections.find((section) => section.type === "quick")
    );

    renderSection(
      taskList,
      sections.find((section) => section.type === "task")
    );

    renderSection(
      sharedMemoList,
      sections.find((section) => section.type === "shared")
    );

    if (isCurrentAdmin) {
      renderSection(
        normalMemoList,
        sections.find((section) => section.type === "normal")
      );

      renderSection(
        diaryList,
        sections.find((section) => section.type === "diary")
      );

      renderSection(
        dreamList,
        sections.find((section) => section.type === "dream")
      );

      renderSection(
        musicList,
        sections.find((section) => section.type === "music")
      );

      renderSection(
        storyList,
        sections.find((section) => section.type === "story")
      );

      renderSection(
        peopleList,
        sections.find((section) => section.type === "people")
      );

      renderSection(
  chatMemoList,
  sections.find((section) => section.type === "chat")
);

renderSection(
  imageMemoList,
  sections.find((section) => section.type === "image")
);
    }

    renderTimeline(sections);

    userStatus.textContent = isCurrentAdmin
      ? "すべての最近の記録を表示しています。"
      : "最近のクイックメモ・タスク・共有メモを表示しています。";
  } catch (error) {
    console.error(error);
    userStatus.textContent = "読み込みに失敗しました。";
    alert("最近の記録の読み込みに失敗しました");
  }
}

async function fetchUserCollection(collectionName, ownerField) {
  const q = query(
    collection(db, collectionName),
    where(ownerField, "==", currentUser.uid)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((document) => ({
    id: document.id,
    ...document.data()
  }));
}

function clearAllLists() {
  recentTimeline.innerHTML = "";
  quickMemoList.innerHTML = "";
  taskList.innerHTML = "";
  sharedMemoList.innerHTML = "";
  normalMemoList.innerHTML = "";
  diaryList.innerHTML = "";
  dreamList.innerHTML = "";
  musicList.innerHTML = "";
  storyList.innerHTML = "";
  peopleList.innerHTML = "";
  chatMemoList.innerHTML = "";
  imageMemoList.innerHTML = "";
}

function renderTimeline(sections) {
  const allItems = sections.flatMap((section) => {
    return section.items.map((item) => ({
      ...item,
      sectionLabel: section.label,
      sectionUrl: section.url
    }));
  });

  allItems.sort(compareByDateDesc);

  const latestItems = allItems.slice(0, TIMELINE_LIMIT);

  if (latestItems.length === 0) {
    recentTimeline.innerHTML = `<p class="empty-text">まだ記録がありません。</p>`;
    return;
  }

  latestItems.forEach((item) => {
    const card = document.createElement("a");
    card.className = "timeline-card";
    card.href = item.sectionUrl;

    const label = document.createElement("span");
    label.className = "timeline-label";
    label.textContent = item.sectionLabel;

    const title = document.createElement("h3");
    title.textContent = item.displayTitle || "無題";

    const text = document.createElement("p");
    text.textContent = makePreview(item.displayText || "");

    const date = document.createElement("small");
    date.textContent = item.displayDate || "日付なし";

    card.appendChild(label);
    card.appendChild(title);

    if (item.displayText) {
      card.appendChild(text);
    }

    card.appendChild(date);

    recentTimeline.appendChild(card);
  });
}

function renderSection(container, section) {
  if (!section) return;

  const items = section.items.slice(0, DISPLAY_LIMIT);

  if (items.length === 0) {
    container.innerHTML = `<p class="empty-text">まだ記録がありません。</p>`;
    return;
  }

  items.forEach((item) => {
    const link = document.createElement("a");
    link.className = "home-list-item";
    link.href = section.url;

    const title = document.createElement("strong");
    title.textContent = item.displayTitle || "無題";

    const text = document.createElement("span");
    text.textContent = makePreview(item.displayText || "");

    const date = document.createElement("small");
    date.textContent = item.displayDate || "日付なし";

    link.appendChild(title);

    if (item.displayText) {
      link.appendChild(text);
    }

    link.appendChild(date);

    container.appendChild(link);
  });
}

function getQuickMemoTitle(item) {
  const body = item.body || "";
  const firstLine = body
    .split("\n")
    .find((line) => line.trim());

  return firstLine ? firstLine.trim() : "無題のメモ";
}

function getDisplayDate(item) {
  const date = item.updatedAt || item.createdAt;

  if (!date) return "";

  if (date.toDate) {
    return formatDate(date.toDate());
  }

  if (typeof date === "string") {
    return date;
  }

  return "";
}

function getSortTime(item) {
  const date = item.sortDate || item.updatedAt || item.createdAt;

  if (!date) return 0;

  if (date.toDate) {
    return date.toDate().getTime();
  }

  if (typeof date === "string") {
    const time = new Date(date).getTime();
    return Number.isNaN(time) ? 0 : time;
  }

  return 0;
}

function compareByDateDesc(a, b) {
  return getSortTime(b) - getSortTime(a);
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function makePreview(text) {
  return String(text)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 70);
}

function makePeopleText(person) {
  return [
    person.nickname,
    person.subType,
    person.relation,
    person.mbti,
    person.enneagram
  ]
    .filter(Boolean)
    .join(" / ");
}

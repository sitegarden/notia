// task.js

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

const taskTitleInput = document.getElementById("taskTitleInput");
const taskMemoInput = document.getElementById("taskMemoInput");
const taskDueInput = document.getElementById("taskDueInput");
const taskCategoryInput = document.getElementById("taskCategoryInput");
const addTaskBtn = document.getElementById("addTaskBtn");
const taskStatusText = document.getElementById("taskStatusText");

const taskSearchInput = document.getElementById("taskSearchInput");
const taskFilterSelect = document.getElementById("taskFilterSelect");
const taskList = document.getElementById("taskList");

let currentUser = null;
let tasks = [];

const TASK_LIMIT = 100;
const TASK_TITLE_LIMIT = 100;
const TASK_MEMO_LIMIT = 1000;
const TASK_CATEGORY_LIMIT = 50;

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
    loginBtn.classList.add("hidden");
    logoutBtn.classList.remove("hidden");
    userInfo.textContent = user.displayName || user.email || "ログイン中";
    taskStatusText.textContent = "タスクを追加できます";

    await loadTasks();
  } else {
    loginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
    userInfo.textContent = "";

    tasks = [];
    taskList.innerHTML = "";
    taskStatusText.textContent = "ログインしてください";
  }
});

/* add */

addTaskBtn.addEventListener("click", async () => {
  await addTask();
});

async function addTask() {
  if (!currentUser) {
    alert("先にログインしてください");
    return;
  }

  const title = taskTitleInput.value.trim();
  const memo = taskMemoInput.value.trim();
  const dueDate = taskDueInput.value;
  const category = taskCategoryInput.value.trim();

  if (!title) {
    alert("やることを入力してください");
    return;
  }

  if (!isAdmin(currentUser) && tasks.length >= TASK_LIMIT) {
  alert(`タスクは${TASK_LIMIT}件まで保存できます`);
  return;
}

if (!isAdmin(currentUser) && title.length > TASK_TITLE_LIMIT) {
  alert(`タスク名は${TASK_TITLE_LIMIT}文字までです`);
  return;
}

if (!isAdmin(currentUser) && memo.length > TASK_MEMO_LIMIT) {
  alert(`タスクメモは${TASK_MEMO_LIMIT}文字までです`);
  return;
}

if (!isAdmin(currentUser) && category.length > TASK_CATEGORY_LIMIT) {
  alert(`カテゴリは${TASK_CATEGORY_LIMIT}文字までです`);
  return;
}

  try {
    await addDoc(collection(db, "tasks"), {
      uid: currentUser.uid,
      title,
      memo,
      dueDate,
      category,
      status: "todo",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    taskTitleInput.value = "";
    taskMemoInput.value = "";
    taskDueInput.value = "";
    taskCategoryInput.value = "";

    taskStatusText.textContent = "追加しました";

    await loadTasks();
  } catch (error) {
    console.error(error);
    alert("タスク追加に失敗しました");
  }
}

/* load */

async function loadTasks() {
  if (!currentUser) return;

  const q = query(
    collection(db, "tasks"),
    where("uid", "==", currentUser.uid)
  );

  const snapshot = await getDocs(q);

  tasks = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data()
  }));

  tasks.sort((a, b) => {
    const aDone = a.status === "done" ? 1 : 0;
    const bDone = b.status === "done" ? 1 : 0;

    if (aDone !== bDone) return aDone - bDone;

    const aTime = a.updatedAt?.seconds || 0;
    const bTime = b.updatedAt?.seconds || 0;

    return bTime - aTime;
  });

  renderTasks();
}

/* render */

function renderTasks() {
  taskList.innerHTML = "";

  const keyword = taskSearchInput.value.trim().toLowerCase();
  const filter = taskFilterSelect.value;

  let filtered = tasks;

  if (filter !== "all") {
    filtered = filtered.filter((task) => task.status === filter);
  }

  if (keyword) {
    filtered = filtered.filter((task) => {
      const title = (task.title || "").toLowerCase();
      const memo = (task.memo || "").toLowerCase();
      const category = (task.category || "").toLowerCase();

      return (
        title.includes(keyword) ||
        memo.includes(keyword) ||
        category.includes(keyword)
      );
    });
  }

  if (filtered.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-text";

    if (filter === "todo") {
      empty.textContent = "未完了のタスクはありません";
    } else if (filter === "done") {
      empty.textContent = "完了済みのタスクはありません";
    } else {
      empty.textContent = "タスクがありません";
    }

    taskList.appendChild(empty);
    return;
  }

  filtered.forEach((task) => {
    const item = document.createElement("article");
    item.className = "task-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "task-check";
    checkbox.checked = task.status === "done";

    checkbox.addEventListener("change", async () => {
      await toggleTaskStatus(task);
    });

    const main = document.createElement("div");
    main.className = "task-main";

    const title = document.createElement("p");
    title.className = task.status === "done" ? "task-title done" : "task-title";
    title.textContent = task.title || "無題のタスク";

    main.appendChild(title);

    if (task.memo) {
      const memo = document.createElement("p");
      memo.className = "task-memo";
      memo.textContent = task.memo;
      main.appendChild(memo);
    }

    const meta = document.createElement("div");
    meta.className = "task-meta";

    if (task.dueDate) {
      const due = document.createElement("span");
      due.className = "task-badge";
      due.textContent = `期限：${formatDate(task.dueDate)}`;
      meta.appendChild(due);
    }

    if (task.category) {
      const category = document.createElement("span");
      category.className = "task-badge";
      category.textContent = task.category;
      meta.appendChild(category);
    }

    if (task.status === "done") {
      const done = document.createElement("span");
      done.className = "task-badge";
      done.textContent = "完了";
      meta.appendChild(done);
    }

    if (meta.children.length > 0) {
      main.appendChild(meta);
    }

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "task-delete-btn";
    deleteBtn.textContent = "削除";

    deleteBtn.addEventListener("click", async () => {
      await deleteTask(task.id);
    });

    item.appendChild(checkbox);
    item.appendChild(main);
    item.appendChild(deleteBtn);

    taskList.appendChild(item);
  });
}

/* update */

async function toggleTaskStatus(task) {
  if (!currentUser) return;

  const nextStatus = task.status === "done" ? "todo" : "done";

  try {
    await updateDoc(doc(db, "tasks", task.id), {
      status: nextStatus,
      updatedAt: serverTimestamp()
    });

    await loadTasks();
  } catch (error) {
    console.error(error);
    alert("タスク更新に失敗しました");
  }
}

/* delete */

async function deleteTask(taskId) {
  const ok = confirm("このタスクを削除しますか？");

  if (!ok) return;

  try {
    await deleteDoc(doc(db, "tasks", taskId));
    taskStatusText.textContent = "削除しました";

    await loadTasks();
  } catch (error) {
    console.error(error);
    alert("タスク削除に失敗しました");
  }
}

/* search / filter */

taskSearchInput.addEventListener("input", () => {
  renderTasks();
});

taskFilterSelect.addEventListener("change", () => {
  renderTasks();
});

/* helpers */

function formatDate(dateText) {
  if (!dateText) return "";

  const [year, month, day] = dateText.split("-");
  return `${year}/${month}/${day}`;
}

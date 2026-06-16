// task.js
import { auth, googleProvider, db } from "./firebase.js";
import { isAdmin } from "./admin.js";

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
  serverTimestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const userInfo = document.getElementById("userInfo");

const groupTitleInput = document.getElementById("groupTitleInput");
const groupDescriptionInput = document.getElementById("groupDescriptionInput");
const groupLinkInput = document.getElementById("groupLinkInput");
const addGroupBtn = document.getElementById("addGroupBtn");

const taskTitleInput = document.getElementById("taskTitleInput");
const taskMemoInput = document.getElementById("taskMemoInput");
const taskDueInput = document.getElementById("taskDueInput");
const taskCategoryInput = document.getElementById("taskCategoryInput");
const taskGroupSelect = document.getElementById("taskGroupSelect");
const addTaskBtn = document.getElementById("addTaskBtn");

const taskStatusText = document.getElementById("taskStatusText");
const taskSearchInput = document.getElementById("taskSearchInput");
const taskFilterSelect = document.getElementById("taskFilterSelect");
const taskList = document.getElementById("taskList");

let currentUser = null;
let tasks = [];
let taskGroups = [];

const TASK_LIMIT = 100;
const GROUP_LIMIT = 30;

const TASK_TITLE_LIMIT = 100;
const TASK_MEMO_LIMIT = 1000;
const TASK_CATEGORY_LIMIT = 50;

const GROUP_TITLE_LIMIT = 80;
const GROUP_DESCRIPTION_LIMIT = 1000;
const GROUP_LINK_LIMIT = 500;

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

    await loadTaskData();
  } else {
    loginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
    userInfo.textContent = "";

    tasks = [];
    taskGroups = [];
    taskList.innerHTML = "";
    renderGroupSelect();

    taskStatusText.textContent = "ログインしてください";
  }
});

/* group add */
addGroupBtn.addEventListener("click", async () => {
  await addTaskGroup();
});

async function addTaskGroup() {
  if (!currentUser) {
    alert("先にログインしてください");
    return;
  }

  const title = groupTitleInput.value.trim();
  const description = groupDescriptionInput.value.trim();
  const link = groupLinkInput.value.trim();

  if (!title) {
    alert("グループ名を入力してください");
    return;
  }

  if (!isAdmin(currentUser) && taskGroups.length >= GROUP_LIMIT) {
    alert(`グループは${GROUP_LIMIT}件まで作成できます`);
    return;
  }

  if (!isAdmin(currentUser) && title.length > GROUP_TITLE_LIMIT) {
    alert(`グループ名は${GROUP_TITLE_LIMIT}文字までです`);
    return;
  }

  if (!isAdmin(currentUser) && description.length > GROUP_DESCRIPTION_LIMIT) {
    alert(`グループ説明は${GROUP_DESCRIPTION_LIMIT}文字までです`);
    return;
  }

  if (!isAdmin(currentUser) && link.length > GROUP_LINK_LIMIT) {
    alert(`リンクは${GROUP_LINK_LIMIT}文字までです`);
    return;
  }

  if (link && !isSafeUrl(link)) {
    alert("リンクは http:// または https:// から始まるURLにしてください");
    return;
  }

  try {
    await addDoc(collection(db, "taskGroups"), {
      uid: currentUser.uid,
      title,
      description,
      link,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    groupTitleInput.value = "";
    groupDescriptionInput.value = "";
    groupLinkInput.value = "";

    taskStatusText.textContent = "グループを追加しました";
    await loadTaskData();
  } catch (error) {
    console.error(error);
    alert("グループ追加に失敗しました");
  }
}

/* task add */
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
  const groupId = taskGroupSelect.value || "";

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
  groupId,
  status: "todo",
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp()
});

    taskTitleInput.value = "";
    taskMemoInput.value = "";
    taskDueInput.value = "";
    taskCategoryInput.value = "";

    taskStatusText.textContent = "追加しました";
    await loadTaskData();
  } catch (error) {
    console.error(error);
    alert("タスク追加に失敗しました");
  }
}

/* load */
async function loadTaskData() {
  if (!currentUser) return;

  await Promise.all([
    loadGroups(),
    loadTasks()
  ]);

  renderGroupSelect();
  renderTasks();
}

async function loadGroups() {
  const q = query(
    collection(db, "taskGroups"),
    where("uid", "==", currentUser.uid)
  );

  const snapshot = await getDocs(q);

  taskGroups = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data()
  }));

  taskGroups.sort((a, b) => {
    const aTime = a.updatedAt?.seconds || a.createdAt?.seconds || 0;
    const bTime = b.updatedAt?.seconds || b.createdAt?.seconds || 0;
    return bTime - aTime;
  });
}

async function loadTasks() {
  const q = query(
    collection(db, "tasks"),
    where("uid", "==", currentUser.uid)
  );

  const snapshot = await getDocs(q);

  tasks = snapshot.docs.map((docSnap) => {
  const data = docSnap.data();

  return {
    id: docSnap.id,
    ...data,
    groupId: data.groupId || "",
    status: data.status || "todo"
  };
});

  tasks.sort((a, b) => {
    const aDone = a.status === "done" ? 1 : 0;
    const bDone = b.status === "done" ? 1 : 0;

    if (aDone !== bDone) return aDone - bDone;

    const aDue = a.dueDate || "9999-12-31";
    const bDue = b.dueDate || "9999-12-31";

    if (aDue !== bDue) return aDue.localeCompare(bDue);

    const aTime = a.updatedAt?.seconds || 0;
    const bTime = b.updatedAt?.seconds || 0;

    return bTime - aTime;
  });
}

/* render group select */
function renderGroupSelect() {
  taskGroupSelect.innerHTML = "";

  const noneOption = document.createElement("option");
  noneOption.value = "";
  noneOption.textContent = "グループなし";
  taskGroupSelect.appendChild(noneOption);

  taskGroups.forEach((group) => {
    const option = document.createElement("option");
    option.value = group.id;
    option.textContent = group.title || "無題のグループ";
    taskGroupSelect.appendChild(option);
  });
}

/* render tasks */
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
      const group = getGroupById(task.groupId);

      const title = (task.title || "").toLowerCase();
      const memo = (task.memo || "").toLowerCase();
      const category = (task.category || "").toLowerCase();
      const groupTitle = (group?.title || "").toLowerCase();
      const groupDescription = (group?.description || "").toLowerCase();
      const groupLink = (group?.link || "").toLowerCase();

      return (
        title.includes(keyword) ||
        memo.includes(keyword) ||
        category.includes(keyword) ||
        groupTitle.includes(keyword) ||
        groupDescription.includes(keyword) ||
        groupLink.includes(keyword)
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

  const groupedTasks = buildGroupedTasks(filtered);

  groupedTasks.forEach((groupBlock) => {
    const section = document.createElement("section");
    section.className = "task-group-card";

    const header = document.createElement("div");
    header.className = "task-group-header";

    const headerMain = document.createElement("div");
    headerMain.className = "task-group-header-main";

    const title = document.createElement("h2");
    title.className = "task-group-title";
    title.textContent = groupBlock.group?.title || "グループなし";
    headerMain.appendChild(title);

    if (groupBlock.group?.description) {
      const description = document.createElement("p");
      description.className = "task-group-description";
      description.textContent = groupBlock.group.description;
      headerMain.appendChild(description);
    }

    if (groupBlock.group?.link && isSafeUrl(groupBlock.group.link)) {
      const link = document.createElement("a");
      link.className = "task-group-link";
      link.href = groupBlock.group.link;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "関連リンクを開く";
      headerMain.appendChild(link);
    }

    const stats = getGroupStats(groupBlock.tasks);

const count = document.createElement("p");
count.className = "task-group-count";
count.textContent = `${stats.done}/${stats.total} 完了`;

    header.appendChild(headerMain);
    header.appendChild(count);

  if (groupBlock.group?.id) {
  const deleteGroupBtn = document.createElement("button");
  deleteGroupBtn.className = "task-group-delete-btn";
  deleteGroupBtn.textContent = "グループ削除";
  deleteGroupBtn.addEventListener("click", async () => {
    await deleteTaskGroup(groupBlock.group.id);
  });

  header.appendChild(deleteGroupBtn);
}

    section.appendChild(header);

    const progressWrap = document.createElement("div");
progressWrap.className = "task-group-progress";

const progressBar = document.createElement("div");
progressBar.className = "task-group-progress-bar";
progressBar.style.width = `${stats.percent}%`;

progressWrap.appendChild(progressBar);
section.appendChild(progressWrap);

    const list = document.createElement("div");
    list.className = "task-group-task-list";

    groupBlock.tasks.forEach((task) => {
      list.appendChild(createTaskItem(task));
    });

    section.appendChild(list);
    taskList.appendChild(section);
  });
}

function createTaskItem(task) {
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

  const editBtn = document.createElement("button");
editBtn.className = "task-edit-btn";
editBtn.textContent = "編集";
editBtn.addEventListener("click", () => {
  openTaskEditForm(task, item);
});

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "task-delete-btn";
  deleteBtn.textContent = "削除";
  deleteBtn.addEventListener("click", async () => {
    await deleteTask(task.id);
  });

  item.appendChild(checkbox);
item.appendChild(main);
item.appendChild(editBtn);
item.appendChild(deleteBtn);

  return item;
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

    await loadTaskData();
  } catch (error) {
    console.error(error);
    alert("タスク更新に失敗しました");
  }
}

function openTaskEditForm(task, item) {
  const oldForm = item.querySelector(".task-edit-form");

  if (oldForm) {
    oldForm.remove();
    return;
  }

  const form = document.createElement("div");
  form.className = "task-edit-form";

  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.value = task.title || "";
  titleInput.placeholder = "タスク名";

  const memoInput = document.createElement("textarea");
  memoInput.value = task.memo || "";
  memoInput.placeholder = "メモ";

  const dueInput = document.createElement("input");
  dueInput.type = "date";
  dueInput.value = task.dueDate || "";

  const categoryInput = document.createElement("input");
  categoryInput.type = "text";
  categoryInput.value = task.category || "";
  categoryInput.placeholder = "カテゴリ";

  const groupSelect = document.createElement("select");

  const noneOption = document.createElement("option");
  noneOption.value = "";
  noneOption.textContent = "グループなし";
  groupSelect.appendChild(noneOption);

  taskGroups.forEach((group) => {
    const option = document.createElement("option");
    option.value = group.id;
    option.textContent = group.title || "無題のグループ";
    groupSelect.appendChild(option);
  });

  groupSelect.value = task.groupId || "";

  const buttonRow = document.createElement("div");
  buttonRow.className = "task-edit-actions";

  const saveBtn = document.createElement("button");
  saveBtn.className = "task-edit-save-btn";
  saveBtn.textContent = "保存";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "task-edit-cancel-btn";
  cancelBtn.textContent = "キャンセル";

  saveBtn.addEventListener("click", async () => {
    const title = titleInput.value.trim();
    const memo = memoInput.value.trim();
    const dueDate = dueInput.value;
    const category = categoryInput.value.trim();
    const groupId = groupSelect.value || "";

    if (!title) {
      alert("タスク名は空にできません");
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
      await updateDoc(doc(db, "tasks", task.id), {
        title,
        memo,
        dueDate,
        category,
        groupId,
        updatedAt: serverTimestamp()
      });

      taskStatusText.textContent = "タスクを編集しました";
      await loadTaskData();
    } catch (error) {
      console.error(error);
      alert("タスク編集に失敗しました");
    }
  });

  cancelBtn.addEventListener("click", () => {
    form.remove();
  });

  buttonRow.appendChild(saveBtn);
  buttonRow.appendChild(cancelBtn);

  form.appendChild(titleInput);
  form.appendChild(memoInput);
  form.appendChild(dueInput);
  form.appendChild(categoryInput);
  form.appendChild(groupSelect);
  form.appendChild(buttonRow);

  item.appendChild(form);
}

/* delete task */
async function deleteTask(taskId) {
  const ok = confirm("このタスクを削除しますか？");
  if (!ok) return;

  try {
    await deleteDoc(doc(db, "tasks", taskId));
    taskStatusText.textContent = "削除しました";
    await loadTaskData();
  } catch (error) {
    console.error(error);
    alert("タスク削除に失敗しました");
  }
}

/* delete group */
async function deleteTaskGroup(groupId) {
  const ok = confirm(
    "このグループを削除しますか？\n中のタスクは削除せず、グループなしに移動します。"
  );

  if (!ok) return;

  try {
    const batch = writeBatch(db);

    const targetTasks = tasks.filter((task) => task.groupId === groupId);

    targetTasks.forEach((task) => {
      batch.update(doc(db, "tasks", task.id), {
        groupId: "",
        updatedAt: serverTimestamp()
      });
    });

    batch.delete(doc(db, "taskGroups", groupId));

    await batch.commit();

    taskStatusText.textContent = "グループを削除しました";
    await loadTaskData();
  } catch (error) {
    console.error(error);
    alert("グループ削除に失敗しました");
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
function buildGroupedTasks(targetTasks) {
  const groupMap = new Map();

  taskGroups.forEach((group) => {
    groupMap.set(group.id, {
      group,
      tasks: []
    });
  });

  const noGroupBlock = {
    group: {
      id: "",
      title: "グループなし",
      description: "",
      link: ""
    },
    tasks: []
  };

  targetTasks.forEach((task) => {
    const groupId = task.groupId || "";

    if (groupId && groupMap.has(groupId)) {
      groupMap.get(groupId).tasks.push(task);
    } else {
      noGroupBlock.tasks.push(task);
    }
  });

  const result = [];

  groupMap.forEach((block) => {
    if (block.tasks.length > 0) {
      result.push(block);
    }
  });

  if (noGroupBlock.tasks.length > 0) {
    result.push(noGroupBlock);
  }

  return result;
}

function getGroupById(groupId) {
  if (!groupId) return null;
  return taskGroups.find((group) => group.id === groupId) || null;
}

function formatDate(dateText) {
  if (!dateText) return "";

  const [year, month, day] = dateText.split("-");
  return `${year}/${month}/${day}`;
}

function isSafeUrl(url) {
  if (!url) return true;

  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function getGroupStats(groupTasks) {
  const total = groupTasks.length;
  const done = groupTasks.filter((task) => task.status === "done").length;
  const todo = total - done;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);

  return {
    total,
    done,
    todo,
    percent
  };
}

// list.js
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
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const userInfo = document.getElementById("userInfo");

const listTitleInput = document.getElementById("listTitleInput");
const listDescriptionInput = document.getElementById("listDescriptionInput");
const addListBtn = document.getElementById("addListBtn");
const listSortSelect = document.getElementById("listSortSelect");

const listStatusText = document.getElementById("listStatusText");
const listSearchInput = document.getElementById("listSearchInput");
const listMemoList = document.getElementById("listMemoList");

const listEditModal = document.getElementById("listEditModal");
const listEditModalBg = document.getElementById("listEditModalBg");

const editListTitleInput = document.getElementById("editListTitleInput");
const editListDescriptionInput = document.getElementById("editListDescriptionInput");
const editListItemInput = document.getElementById("editListItemInput");
const editListItems = document.getElementById("editListItems");

const addListItemModalBtn = document.getElementById("addListItemModalBtn");
const saveListEditBtn = document.getElementById("saveListEditBtn");
const deleteListEditBtn = document.getElementById("deleteListEditBtn");
const cancelListEditBtn = document.getElementById("cancelListEditBtn");

let editingListId = null;
let editingItems = [];

let currentUser = null;
let listMemos = [];

const LIST_LIMIT = 50;
const ITEM_LIMIT = 100;

const ITEM_TEXT_LIMIT = 80;
const ITEM_MEMO_LIMIT = 300;

const LIST_TITLE_LIMIT = 80;
const LIST_DESCRIPTION_LIMIT = 1000;
const ITEM_TEXT_LIMIT = 80;

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
    listStatusText.textContent = "リストを作成できます";

    await loadListMemos();
  } else {
    loginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
    userInfo.textContent = "";

    listMemos = [];
    listMemoList.innerHTML = "";
    listStatusText.textContent = "ログインしてください";
  }
});

/* create */

addListBtn.addEventListener("click", async () => {
  await addListMemo();
});

async function addListMemo() {
  if (!currentUser) {
    alert("先にログインしてください");
    return;
  }

  const title = listTitleInput.value.trim();
  const description = listDescriptionInput.value.trim();

  if (!title) {
    alert("お題を入力してください");
    return;
  }

  if (!isAdmin(currentUser) && listMemos.length >= LIST_LIMIT) {
    alert(`リストは${LIST_LIMIT}件まで作成できます`);
    return;
  }

  if (!isAdmin(currentUser) && title.length > LIST_TITLE_LIMIT) {
    alert(`お題は${LIST_TITLE_LIMIT}文字までです`);
    return;
  }

  if (!isAdmin(currentUser) && description.length > LIST_DESCRIPTION_LIMIT) {
    alert(`説明は${LIST_DESCRIPTION_LIMIT}文字までです`);
    return;
  }

  try {
    await addDoc(collection(db, "listMemos"), {
      uid: currentUser.uid,
      title,
      description,
      items: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    listTitleInput.value = "";
    listDescriptionInput.value = "";

    listStatusText.textContent = "リストを追加しました";
    await loadListMemos();
  } catch (error) {
    console.error(error);
    alert("リスト追加に失敗しました");
  }
}

/* load */

async function loadListMemos() {
  if (!currentUser) return;

  const q = query(
    collection(db, "listMemos"),
    where("uid", "==", currentUser.uid)
  );

  const snapshot = await getDocs(q);

  listMemos = snapshot.docs.map((docSnap) => {
    const data = docSnap.data();

    return {
      id: docSnap.id,
      ...data,
      items: Array.isArray(data.items) ? data.items.map(normalizeItem) : []
    };
  });

  listMemos.sort((a, b) => {
    const aTime = a.updatedAt?.seconds || a.createdAt?.seconds || 0;
    const bTime = b.updatedAt?.seconds || b.createdAt?.seconds || 0;
    return bTime - aTime;
  });

  renderListMemos();
}

/* render */

function renderListMemos() {
  listMemoList.innerHTML = "";

  const keyword = listSearchInput.value.trim().toLowerCase();
  const sortType = listSortSelect.value;

  let filtered = [...listMemos];

  if (keyword) {
    filtered = filtered.filter((memo) => {
      const title = (memo.title || "").toLowerCase();
      const description = (memo.description || "").toLowerCase();
      const itemsText = getSortedItems(memo.items)
  .map((item) => `${item.text} ${item.memo}`)
  .join(" ")
  .toLowerCase();

      return (
        title.includes(keyword) ||
        description.includes(keyword) ||
        itemsText.includes(keyword)
      );
    });
  }

  filtered.sort((a, b) => {
    if (sortType === "title") {
      return (a.title || "").localeCompare(b.title || "", "ja");
    }

    if (sortType === "items") {
      const aFirst = getSortedItems(a.items)[0] || "";
      const bFirst = getSortedItems(b.items)[0] || "";
      return aFirst.localeCompare(bFirst, "ja");
    }

    const aTime = a.updatedAt?.seconds || a.createdAt?.seconds || 0;
    const bTime = b.updatedAt?.seconds || b.createdAt?.seconds || 0;
    return bTime - aTime;
  });

  if (filtered.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-text";
    empty.textContent = "リストメモがありません";
    listMemoList.appendChild(empty);
    return;
  }

  filtered.forEach((memo) => {
    listMemoList.appendChild(createListMemoCard(memo));
  });
}
function createListMemoCard(memo) {
  const card = document.createElement("article");
  card.className = "listmemo-card";

  const header = document.createElement("div");
  header.className = "listmemo-card-header";

  const titleWrap = document.createElement("div");

  const title = document.createElement("h2");
  title.className = "listmemo-title";
  title.textContent = memo.title || "無題のリスト";
  titleWrap.appendChild(title);

  if (memo.description) {
    const description = document.createElement("p");
    description.className = "listmemo-description";
    description.textContent = memo.description;
    titleWrap.appendChild(description);
  }

  const headerActions = document.createElement("div");
  headerActions.className = "listmemo-card-actions";

  const count = document.createElement("span");
  count.className = "listmemo-count";
  count.textContent = `${memo.items.length}個`;

  const editBtn = document.createElement("button");
  editBtn.className = "listmemo-edit-btn";
  editBtn.type = "button";
  editBtn.textContent = "編集";
  editBtn.addEventListener("click", () => {
    openListEditModal(memo);
  });

  headerActions.appendChild(count);
  headerActions.appendChild(editBtn);

  header.appendChild(titleWrap);
  header.appendChild(headerActions);

  const items = document.createElement("div");
  items.className = "listmemo-items";

  if (memo.items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "listmemo-item-empty";
    empty.textContent = "まだ項目がありません";
    items.appendChild(empty);
  } else {
    getSortedItems(memo.items).forEach((itemData) => {
  const item = document.createElement("div");
  item.className = "listmemo-item";

  const bullet = document.createElement("span");
  bullet.className = "listmemo-item-bullet";
  bullet.textContent = "・";

  const body = document.createElement("div");
  body.className = "listmemo-item-body";

  const text = document.createElement("p");
  text.className = "listmemo-item-text";
  text.textContent = itemData.text;

  body.appendChild(text);

  if (itemData.memo) {
    const memoText = document.createElement("p");
    memoText.className = "listmemo-item-memo";
    memoText.textContent = itemData.memo;
    body.appendChild(memoText);
  }

  item.appendChild(bullet);
  item.appendChild(body);
  items.appendChild(item);
});
  }

  card.appendChild(header);
  card.appendChild(items);

  return card;
}

function openListEditModal(memo) {
  editingListId = memo.id;
  editingItems = getSortedItems(memo.items);

  editListTitleInput.value = memo.title || "";
  editListDescriptionInput.value = memo.description || "";
  editListItemInput.value = "";

  renderEditingItems();

  listEditModal.classList.remove("hidden");
}

function closeListEditModal() {
  editingListId = null;
  editingItems = [];
  listEditModal.classList.add("hidden");
}

function renderEditingItems() {
  editListItems.innerHTML = "";

  if (editingItems.length === 0) {
    const empty = document.createElement("p");
    empty.className = "listmemo-item-empty";
    empty.textContent = "まだ項目がありません";
    editListItems.appendChild(empty);
    return;
  }

  editingItems.forEach((itemData, index) => {
    const row = document.createElement("div");
    row.className = "listmemo-modal-item-row memo-mode";

    const fields = document.createElement("div");
    fields.className = "listmemo-modal-item-fields";

    const textInput = document.createElement("input");
    textInput.type = "text";
    textInput.value = itemData.text || "";
    textInput.placeholder = "プロパティ名";

    textInput.addEventListener("input", () => {
      editingItems[index].text = textInput.value;
    });

    const memoInput = document.createElement("textarea");
    memoInput.value = itemData.memo || "";
    memoInput.placeholder = "このプロパティのメモ 任意";

    memoInput.addEventListener("input", () => {
      editingItems[index].memo = memoInput.value;
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.textContent = "×";
    deleteBtn.title = "項目を削除";

    deleteBtn.addEventListener("click", () => {
      editingItems = editingItems.filter((_, itemIndex) => itemIndex !== index);
      renderEditingItems();
    });

    fields.appendChild(textInput);
    fields.appendChild(memoInput);

    row.appendChild(fields);
    row.appendChild(deleteBtn);

    editListItems.appendChild(row);
  });
}

function addEditingItem() {
  const text = editListItemInput.value.trim();

  if (!text) {
    alert("項目を入力してください");
    return;
  }

  if (!isAdmin(currentUser) && text.length > ITEM_TEXT_LIMIT) {
    alert(`項目は${ITEM_TEXT_LIMIT}文字までです`);
    return;
  }

  if (!isAdmin(currentUser) && editingItems.length >= ITEM_LIMIT) {
    alert(`項目は1リストにつき${ITEM_LIMIT}個までです`);
    return;
  }

  editingItems.push({
  text,
  memo: ""
});
  editListItemInput.value = "";
  renderEditingItems();
}

/* search */

addListItemModalBtn.addEventListener("click", () => {
  addEditingItem();
});

editListItemInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    addEditingItem();
  }
});

saveListEditBtn.addEventListener("click", async () => {
  if (!currentUser || !editingListId) return;

  const title = editListTitleInput.value.trim();
  const description = editListDescriptionInput.value.trim();

  if (!title) {
    alert("お題を入力してください");
    return;
  }

  if (!isAdmin(currentUser) && title.length > LIST_TITLE_LIMIT) {
    alert(`お題は${LIST_TITLE_LIMIT}文字までです`);
    return;
  }

  if (!isAdmin(currentUser) && description.length > LIST_DESCRIPTION_LIMIT) {
    alert(`説明は${LIST_DESCRIPTION_LIMIT}文字までです`);
    return;
  }

  try {
    await updateDoc(doc(db, "listMemos", editingListId), {
      title,
      description,
      items: cleanItems,
      updatedAt: serverTimestamp()
    });

    listStatusText.textContent = "リストを編集しました";
    closeListEditModal();
    await loadListMemos();
  } catch (error) {
    console.error(error);
    alert("リスト編集に失敗しました");
  }
});

const cleanItems = editingItems
  .map(normalizeItem)
  .filter((item) => item.text);

if (!isAdmin(currentUser)) {
  const overText = cleanItems.some((item) => item.text.length > ITEM_TEXT_LIMIT);
  const overMemo = cleanItems.some((item) => item.memo.length > ITEM_MEMO_LIMIT);

  if (overText) {
    alert(`項目は${ITEM_TEXT_LIMIT}文字までです`);
    return;
  }

  if (overMemo) {
    alert(`項目メモは${ITEM_MEMO_LIMIT}文字までです`);
    return;
  }
}

deleteListEditBtn.addEventListener("click", async () => {
  if (!currentUser || !editingListId) return;

  const ok = confirm("このリストを削除しますか？");
  if (!ok) return;

  try {
    await deleteDoc(doc(db, "listMemos", editingListId));

    listStatusText.textContent = "リストを削除しました";
    closeListEditModal();
    await loadListMemos();
  } catch (error) {
    console.error(error);
    alert("リスト削除に失敗しました");
  }
});

function normalizeItem(item) {
  if (typeof item === "string") {
    return {
      text: item.trim(),
      memo: ""
    };
  }

  return {
    text: String(item?.text || "").trim(),
    memo: String(item?.memo || "").trim()
  };
}

function getSortedItems(items = []) {
  return [...items]
    .map(normalizeItem)
    .filter((item) => item.text)
    .sort((a, b) => a.text.localeCompare(b.text, "ja"));
}


cancelListEditBtn.addEventListener("click", () => {
  closeListEditModal();
});

listEditModalBg.addEventListener("click", () => {
  closeListEditModal();
});

listSearchInput.addEventListener("input", () => {
  renderListMemos();
});

listSortSelect.addEventListener("change", () => {
  renderListMemos();
});

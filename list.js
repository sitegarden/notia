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

const listStatusText = document.getElementById("listStatusText");
const listSearchInput = document.getElementById("listSearchInput");
const listMemoList = document.getElementById("listMemoList");

let currentUser = null;
let listMemos = [];

const LIST_LIMIT = 50;
const ITEM_LIMIT = 100;

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
      items: Array.isArray(data.items) ? data.items : []
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

  let filtered = listMemos;

  if (keyword) {
    filtered = filtered.filter((memo) => {
      const title = (memo.title || "").toLowerCase();
      const description = (memo.description || "").toLowerCase();
      const itemsText = memo.items.join(" ").toLowerCase();

      return (
        title.includes(keyword) ||
        description.includes(keyword) ||
        itemsText.includes(keyword)
      );
    });
  }

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

  const count = document.createElement("span");
  count.className = "listmemo-count";
  count.textContent = `${memo.items.length}個`;

  header.appendChild(titleWrap);
  header.appendChild(count);

  const items = document.createElement("div");
  items.className = "listmemo-items";

  if (memo.items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "listmemo-item-empty";
    empty.textContent = "まだ項目がありません";
    items.appendChild(empty);
  } else {
    memo.items.forEach((itemText, index) => {
      const item = document.createElement("button");
      item.className = "listmemo-item";
      item.type = "button";
      item.textContent = itemText;
      item.title = "クリックで削除";

      item.addEventListener("click", async () => {
        await deleteListItem(memo, index);
      });

      items.appendChild(item);
    });
  }

  const addArea = document.createElement("div");
  addArea.className = "listmemo-add-area";

  const itemInput = document.createElement("input");
  itemInput.type = "text";
  itemInput.placeholder = "項目を追加";

  const itemAddBtn = document.createElement("button");
  itemAddBtn.type = "button";
  itemAddBtn.textContent = "＋";

  itemAddBtn.addEventListener("click", async () => {
    await addListItem(memo, itemInput);
  });

  itemInput.addEventListener("keydown", async (event) => {
    if (event.key === "Enter") {
      await addListItem(memo, itemInput);
    }
  });

  addArea.appendChild(itemInput);
  addArea.appendChild(itemAddBtn);

  const actions = document.createElement("div");
  actions.className = "listmemo-actions";

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "listmemo-delete-btn";
  deleteBtn.type = "button";
  deleteBtn.textContent = "リスト削除";

  deleteBtn.addEventListener("click", async () => {
    await deleteListMemo(memo.id);
  });

  actions.appendChild(deleteBtn);

  card.appendChild(header);
  card.appendChild(items);
  card.appendChild(addArea);
  card.appendChild(actions);

  return card;
}

/* item */

async function addListItem(memo, input) {
  if (!currentUser) return;

  const text = input.value.trim();

  if (!text) {
    alert("項目を入力してください");
    return;
  }

  if (!isAdmin(currentUser) && text.length > ITEM_TEXT_LIMIT) {
    alert(`項目は${ITEM_TEXT_LIMIT}文字までです`);
    return;
  }

  if (!isAdmin(currentUser) && memo.items.length >= ITEM_LIMIT) {
    alert(`項目は1リストにつき${ITEM_LIMIT}個までです`);
    return;
  }

  const nextItems = [...memo.items, text];

  try {
    await updateDoc(doc(db, "listMemos", memo.id), {
      items: nextItems,
      updatedAt: serverTimestamp()
    });

    input.value = "";
    listStatusText.textContent = "項目を追加しました";
    await loadListMemos();
  } catch (error) {
    console.error(error);
    alert("項目追加に失敗しました");
  }
}

async function deleteListItem(memo, index) {
  const ok = confirm("この項目を削除しますか？");
  if (!ok) return;

  const nextItems = memo.items.filter((_, itemIndex) => itemIndex !== index);

  try {
    await updateDoc(doc(db, "listMemos", memo.id), {
      items: nextItems,
      updatedAt: serverTimestamp()
    });

    listStatusText.textContent = "項目を削除しました";
    await loadListMemos();
  } catch (error) {
    console.error(error);
    alert("項目削除に失敗しました");
  }
}

/* delete list */

async function deleteListMemo(listId) {
  const ok = confirm("このリストを削除しますか？");
  if (!ok) return;

  try {
    await deleteDoc(doc(db, "listMemos", listId));

    listStatusText.textContent = "リストを削除しました";
    await loadListMemos();
  } catch (error) {
    console.error(error);
    alert("リスト削除に失敗しました");
  }
}

/* search */

listSearchInput.addEventListener("input", () => {
  renderListMemos();
});

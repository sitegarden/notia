// people.js

import {
  auth,
  googleProvider,
  db
} from "./firebase.js";

import {
  blockIfNotAdmin
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

const peopleSearchInput = document.getElementById("peopleSearchInput");
const peopleTypeFilter = document.getElementById("peopleTypeFilter");
const peopleList = document.getElementById("peopleList");

const peopleFormTitle = document.getElementById("peopleFormTitle");
const personNameInput = document.getElementById("personNameInput");
const personNicknameInput = document.getElementById("personNicknameInput");
const personTypeInput = document.getElementById("personTypeInput");
const personRelationInput = document.getElementById("personRelationInput");
const personMbtiInput = document.getElementById("personMbtiInput");
const personEnneagramInput = document.getElementById("personEnneagramInput");
const personTagsInput = document.getElementById("personTagsInput");
const personTraitsInput = document.getElementById("personTraitsInput");
const personMemoInput = document.getElementById("personMemoInput");
const personPropsInput = document.getElementById("personPropsInput");

const peopleStatus = document.getElementById("peopleStatus");
const newPersonBtn = document.getElementById("newPersonBtn");
const deletePersonBtn = document.getElementById("deletePersonBtn");
const savePersonBtn = document.getElementById("savePersonBtn");

const personSubTypeInput = document.getElementById("personSubTypeInput");

let currentUser = null;
let people = [];
let selectedPersonId = null;

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
    peopleStatus.textContent = "人物を保存できます";

    await loadPeople();
  } else {
    loginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
    userInfo.textContent = "";

    people = [];
    selectedPersonId = null;
    clearPersonForm();
    peopleList.innerHTML = "";
    peopleStatus.textContent = "ログインしてください";
  }
});

/* events */

newPersonBtn.addEventListener("click", () => {
  selectedPersonId = null;
  clearPersonForm();
  peopleStatus.textContent = "新規人物";
  renderPeople();
});

savePersonBtn.addEventListener("click", async () => {
  await savePerson();
});

deletePersonBtn.addEventListener("click", async () => {
  await deletePerson();
});

peopleSearchInput.addEventListener("input", () => {
  renderPeople();
});

peopleTypeFilter.addEventListener("change", () => {
  renderPeople();
});

[
  personNameInput,
  personNicknameInput,
  personTypeInput,
  personRelationInput,
  personMbtiInput,
  personEnneagramInput,
  personTagsInput,
  personTraitsInput,
  personMemoInput,
  personPropsInput,
  personSubTypeInput,
].forEach((input) => {
  input.addEventListener("input", () => {
    peopleStatus.textContent = selectedPersonId
      ? "未保存の変更あり"
      : "新規人物";
  });
});

/* load */

async function loadPeople() {
  if (!currentUser) return;

  const q = query(
    collection(db, "people"),
    where("uid", "==", currentUser.uid)
  );

  const snapshot = await getDocs(q);

  people = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data()
  }));

  people.sort((a, b) => {
    const aTime = a.updatedAt?.seconds || 0;
    const bTime = b.updatedAt?.seconds || 0;
    return bTime - aTime;
  });

  renderPeople();
}

/* save */

async function savePerson() {
  if (!currentUser) {
    alert("先にログインしてください");
    return;
  }

  const name = personNameInput.value.trim();
  const nickname = personNicknameInput.value.trim();
  const type = personTypeInput.value;
  const relation = personRelationInput.value.trim();
  const mbti = personMbtiInput.value.trim();
  const enneagram = personEnneagramInput.value.trim();
  const tags = personTagsInput.value.trim();
  const traits = personTraitsInput.value.trim();
  const memo = personMemoInput.value.trim();
  const props = personPropsInput.value.trim();
  const subType = personSubTypeInput.value.trim();

  if (!name) {
    alert("名前を入力してください");
    return;
  }

  const data = {
    name,
    nickname,
    type,
    relation,
    mbti,
    enneagram,
    tags,
    traits,
    memo,
    props,
    subType,
    updatedAt: serverTimestamp()
  };

  try {
    if (selectedPersonId) {
      await updateDoc(doc(db, "people", selectedPersonId), data);
      peopleStatus.textContent = "保存しました";
    } else {
      const docRef = await addDoc(collection(db, "people"), {
        uid: currentUser.uid,
        ...data,
        createdAt: serverTimestamp()
      });

      selectedPersonId = docRef.id;
      peopleStatus.textContent = "作成しました";
    }

    await loadPeople();
  } catch (error) {
    console.error(error);
    alert("人物の保存に失敗しました");
  }
}

/* delete */

async function deletePerson() {
  if (!currentUser) {
    alert("先にログインしてください");
    return;
  }

  if (!selectedPersonId) {
    alert("削除する人物を選んでください");
    return;
  }

  const ok = confirm("この人物を削除しますか？");

  if (!ok) return;

  try {
    await deleteDoc(doc(db, "people", selectedPersonId));

    selectedPersonId = null;
    clearPersonForm();
    peopleStatus.textContent = "削除しました";

    await loadPeople();
  } catch (error) {
    console.error(error);
    alert("人物の削除に失敗しました");
  }
}

/* render */

function renderPeople() {
  peopleList.innerHTML = "";

  const keyword = peopleSearchInput.value.trim().toLowerCase();
  const typeFilter = peopleTypeFilter.value;

  let filtered = people;

  if (typeFilter !== "all") {
    filtered = filtered.filter((person) => person.type === typeFilter);
  }

  if (keyword) {
    filtered = filtered.filter((person) => {
      const searchText = [
        person.name,
        person.nickname,
        person.type,
        person.relation,
        person.mbti,
        person.enneagram,
        person.tags,
        person.traits,
        person.memo,
        person.props,
        person.subType
      ]
        .join(" ")
        .toLowerCase();

      return searchText.includes(keyword);
    });
  }

  if (filtered.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-text";
    empty.textContent = "人物がありません";
    peopleList.appendChild(empty);
    return;
  }

  filtered.forEach((person) => {
    const card = document.createElement("button");
    card.className = selectedPersonId === person.id
      ? "person-card active"
      : "person-card";

    const name = document.createElement("p");
    name.className = "person-name";
    name.textContent = person.name || "名前なし";

    const sub = document.createElement("p");
    sub.className = "person-sub";
    sub.textContent = makeSubText(person);

    const badges = document.createElement("div");
    badges.className = "person-badges";

    const typeBadge = createBadge(getTypeLabel(person.type));
    badges.appendChild(typeBadge);

    if (person.mbti) {
      badges.appendChild(createBadge(person.mbti));
    }

    if (person.enneagram) {
      badges.appendChild(createBadge(person.enneagram));
    }

    if (person.subType) {
  badges.appendChild(createBadge(person.subType));
}

    splitTags(person.tags).slice(0, 4).forEach((tag) => {
      badges.appendChild(createBadge(tag));
    });

    card.appendChild(name);
    card.appendChild(sub);
    card.appendChild(badges);

    card.addEventListener("click", () => {
      selectPerson(person);
    });

    peopleList.appendChild(card);
  });
}

function selectPerson(person) {
  selectedPersonId = person.id;

  peopleFormTitle.textContent = "人物を編集";
  personNameInput.value = person.name || "";
  personNicknameInput.value = person.nickname || "";
  personTypeInput.value = person.type || "real";
  personRelationInput.value = person.relation || "";
  personMbtiInput.value = person.mbti || "";
  personEnneagramInput.value = person.enneagram || "";
  personTagsInput.value = person.tags || "";
  personTraitsInput.value = person.traits || "";
  personMemoInput.value = person.memo || "";
  personPropsInput.value = person.props || "";
  personSubTypeInput.value = person.subType || "";

  peopleStatus.textContent = "編集中";

  renderPeople();
}

/* helpers */

function clearPersonForm() {
  peopleFormTitle.textContent = "人物を追加";
  personNameInput.value = "";
  personNicknameInput.value = "";
  personTypeInput.value = "real";
  personRelationInput.value = "";
  personMbtiInput.value = "";
  personEnneagramInput.value = "";
  personTagsInput.value = "";
  personTraitsInput.value = "";
  personMemoInput.value = "";
  personPropsInput.value = "";
  personSubTypeInput.value = "";
}

function createBadge(text) {
  const badge = document.createElement("span");
  badge.className = "person-badge";
  badge.textContent = text;
  return badge;
}

function getTypeLabel(type) {
  const labels = {
    real: "リアル",
    character: "キャラ",
    original: "創作",
    other: "その他"
  };

  return labels[type] || "その他";
}

function makeSubText(person) {
  const parts = [];

  if (person.nickname) parts.push(person.nickname);
  if (person.subType) parts.push(person.subType);
  if (person.relation) parts.push(person.relation);

  return parts.length ? parts.join(" / ") : "補足なし";
}
function splitTags(tags = "") {
  return tags
    .split(/[,\s、，]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

// people.js
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

const peopleSearchInput = document.getElementById("peopleSearchInput");
const peopleTypeFilter = document.getElementById("peopleTypeFilter");
const peopleList = document.getElementById("peopleList");

const peopleFormTitle = document.getElementById("peopleFormTitle");

const personNameInput = document.getElementById("personNameInput");
const personNicknameInput = document.getElementById("personNicknameInput");
const personTypeInput = document.getElementById("personTypeInput");
const personSubTypeInput = document.getElementById("personSubTypeInput");
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

let personIconInput = null;
let peopleViewMode = localStorage.getItem("notiaPeopleViewMode") || "list";

let currentUser = null;
let people = [];
let imageMemos = [];
let selectedPersonId = null;

/* ---------- init ui ---------- */

createPeopleViewSwitcher();
createPersonIconInput();

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

    people = [];
    imageMemos = [];
    selectedPersonId = null;

    clearPersonForm();
    updatePersonIconOptions();
    peopleList.innerHTML = "";
    peopleStatus.textContent = "ログインしてください";

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
  peopleStatus.textContent = "人物を保存できます";

  await loadImageMemosForPeople();
  await loadPeople();
});

/* ---------- events ---------- */

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
  personSubTypeInput,
  personRelationInput,
  personMbtiInput,
  personEnneagramInput,
  personTagsInput,
  personTraitsInput,
  personMemoInput,
  personPropsInput
].forEach((input) => {
  input.addEventListener("input", () => {
    peopleStatus.textContent = selectedPersonId ? "未保存の変更あり" : "新規人物";
  });
});

/* ---------- load ---------- */

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

async function loadImageMemosForPeople() {
  if (!currentUser) return;

  try {
    const q = query(
      collection(db, "imageMemos"),
      where("uid", "==", currentUser.uid)
    );

    const snapshot = await getDocs(q);

    imageMemos = snapshot.docs
      .map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }))
      .filter((item) => item.imageUrl);

    imageMemos.sort((a, b) => {
      const aTime = a.updatedAt?.seconds || 0;
      const bTime = b.updatedAt?.seconds || 0;
      return bTime - aTime;
    });

    updatePersonIconOptions();
  } catch (error) {
    console.error(error);
    imageMemos = [];
    updatePersonIconOptions();
  }
}

/* ---------- save ---------- */

async function savePerson() {
  if (!currentUser) {
    alert("先にログインしてください");
    return;
  }

  if (!isAdmin(currentUser)) {
    alert("このページは管理人専用です");
    location.href = "/";
    return;
  }

  const name = personNameInput.value.trim();
  const nickname = personNicknameInput.value.trim();
  const type = personTypeInput.value;
  const subType = personSubTypeInput.value.trim();
  const relation = personRelationInput.value.trim();
  const mbti = personMbtiInput.value.trim();
  const enneagram = personEnneagramInput.value.trim();
  const tags = personTagsInput.value.trim();
  const traits = personTraitsInput.value.trim();
  const memo = personMemoInput.value.trim();
  const props = personPropsInput.value.trim();

  const iconImageMemoId = personIconInput?.value || "";
  const selectedIconMemo = imageMemos.find((item) => item.id === iconImageMemoId);
  const iconImageUrl = selectedIconMemo?.imageUrl || "";
  const iconImageTitle = selectedIconMemo?.title || "";

  if (!name) {
    alert("名前を入力してください");
    return;
  }

  const data = {
    name,
    nickname,
    type,
    subType,
    relation,
    mbti,
    enneagram,
    tags,
    traits,
    memo,
    props,
    iconImageMemoId,
    iconImageUrl,
    iconImageTitle,
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

/* ---------- delete ---------- */

async function deletePerson() {
  if (!currentUser) {
    alert("先にログインしてください");
    return;
  }

  if (!isAdmin(currentUser)) {
    alert("このページは管理人専用です");
    location.href = "/";
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

/* ---------- render ---------- */

function renderPeople() {
  peopleList.innerHTML = "";
  peopleList.classList.toggle("people-grid", peopleViewMode === "grid");
  peopleList.classList.toggle("people-list", peopleViewMode === "list");

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
        person.subType,
        person.relation,
        person.mbti,
        person.enneagram,
        person.tags,
        person.traits,
        person.memo,
        person.props,
        person.iconImageTitle
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
    card.type = "button";
    card.className = selectedPersonId === person.id ? "person-card active" : "person-card";

    const icon = document.createElement("div");
    icon.className = "person-icon";

    if (person.iconImageUrl) {
      const img = document.createElement("img");
      img.src = person.iconImageUrl;
      img.alt = person.name || "人物アイコン";
      img.loading = "lazy";
      icon.appendChild(img);
    } else {
      icon.textContent = getInitial(person.name);
    }

    const info = document.createElement("div");
    info.className = "person-card-info";

    const name = document.createElement("p");
    name.className = "person-name";
    name.textContent = person.name || "名前なし";

    const sub = document.createElement("p");
    sub.className = "person-sub";
    sub.textContent = makeSubText(person);

    const badges = document.createElement("div");
    badges.className = "person-badges";

    badges.appendChild(createBadge(getTypeLabel(person.type)));

    if (person.subType) {
      badges.appendChild(createBadge(person.subType));
    }

    if (person.mbti) {
      badges.appendChild(createBadge(person.mbti));
    }

    if (person.enneagram) {
      badges.appendChild(createBadge(person.enneagram));
    }

    splitTags(person.tags).slice(0, 4).forEach((tag) => {
      badges.appendChild(createBadge(tag));
    });

    info.appendChild(name);
    info.appendChild(sub);
    info.appendChild(badges);

    card.appendChild(icon);
    card.appendChild(info);

    card.addEventListener("click", () => {
      openPersonModal(person);
    });

    peopleList.appendChild(card);
  });
}

/* ---------- select ---------- */

function selectPerson(person) {
  selectedPersonId = person.id;

  peopleFormTitle.textContent = "人物を編集";

  personNameInput.value = person.name || "";
  personNicknameInput.value = person.nickname || "";
  personTypeInput.value = person.type || "real";
  personSubTypeInput.value = person.subType || "";
  personRelationInput.value = person.relation || "";
  personMbtiInput.value = person.mbti || "";
  personEnneagramInput.value = person.enneagram || "";
  personTagsInput.value = person.tags || "";
  personTraitsInput.value = person.traits || "";
  personMemoInput.value = person.memo || "";
  personPropsInput.value = person.props || "";

  if (personIconInput) {
    personIconInput.value = person.iconImageMemoId || "";
  }

  peopleStatus.textContent = "編集中";

  renderPeople();
}

/* ---------- modal ---------- */

function openPersonModal(person) {
  const modal = ensurePersonModal();

  const modalIcon = modal.querySelector(".person-modal-icon");
  modalIcon.innerHTML = "";

  if (person.iconImageUrl) {
    const img = document.createElement("img");
    img.src = person.iconImageUrl;
    img.alt = person.name || "人物アイコン";
    modalIcon.appendChild(img);
  } else {
    modalIcon.textContent = getInitial(person.name);
  }

  modal.querySelector(".person-modal-name").textContent = person.name || "名前なし";
  modal.querySelector(".person-modal-nickname").textContent = person.nickname
    ? `通称：${person.nickname}`
    : "通称なし";

  modal.querySelector(".person-modal-type").textContent = getTypeLabel(person.type);
  modal.querySelector(".person-modal-subtype").textContent = person.subType || "分類なし";
  modal.querySelector(".person-modal-relation").textContent = person.relation || "関係なし";
  modal.querySelector(".person-modal-mbti").textContent = person.mbti || "MBTIなし";
  modal.querySelector(".person-modal-enneagram").textContent = person.enneagram || "エニアなし";
  modal.querySelector(".person-modal-traits").textContent = person.traits || "特徴なし";
  modal.querySelector(".person-modal-memo").textContent = person.memo || "メモなし";
  modal.querySelector(".person-modal-props").textContent = person.props || "プロパティなし";

  const tagsWrap = modal.querySelector(".person-modal-tags");
  tagsWrap.innerHTML = "";

  const tags = splitTags(person.tags);
  if (tags.length) {
    tags.forEach((tag) => {
      tagsWrap.appendChild(createBadge(tag));
    });
  } else {
    tagsWrap.appendChild(createBadge("タグなし"));
  }

  const editBtn = modal.querySelector(".person-modal-edit-btn");
  editBtn.onclick = () => {
    closePersonModal();
    selectPerson(person);

    const editor = document.querySelector(".person-icon-field, form");
    if (editor) {
      editor.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  };

  modal.classList.add("active");
  document.body.classList.add("modal-open");
}

function closePersonModal() {
  const modal = document.querySelector(".person-modal");
  if (!modal) return;

  modal.classList.remove("active");
  document.body.classList.remove("modal-open");
}

function ensurePersonModal() {
  let modal = document.querySelector(".person-modal");

  if (modal) {
    return modal;
  }

  modal = document.createElement("div");
  modal.className = "person-modal";

  modal.innerHTML = `
    <div class="person-modal-backdrop"></div>

    <section class="person-modal-card" role="dialog" aria-modal="true" aria-label="人物プロフィール">
      <button class="person-modal-close" type="button" aria-label="閉じる">×</button>

      <div class="person-modal-head">
        <div class="person-modal-icon"></div>

        <div>
          <p class="label">PERSON PROFILE</p>
          <h2 class="person-modal-name">名前なし</h2>
          <p class="person-modal-nickname">通称なし</p>
        </div>
      </div>

      <div class="person-modal-tags"></div>

      <div class="person-modal-grid">
        <div>
          <span>種類</span>
          <strong class="person-modal-type"></strong>
        </div>
        <div>
          <span>分類</span>
          <strong class="person-modal-subtype"></strong>
        </div>
        <div>
          <span>関係</span>
          <strong class="person-modal-relation"></strong>
        </div>
        <div>
          <span>MBTI</span>
          <strong class="person-modal-mbti"></strong>
        </div>
        <div>
          <span>エニア</span>
          <strong class="person-modal-enneagram"></strong>
        </div>
      </div>

      <div class="person-modal-section">
        <h3>特徴</h3>
        <p class="person-modal-traits"></p>
      </div>

      <div class="person-modal-section">
        <h3>メモ</h3>
        <p class="person-modal-memo"></p>
      </div>

      <div class="person-modal-section">
        <h3>プロパティ</h3>
        <p class="person-modal-props"></p>
      </div>

      <div class="person-modal-actions">
        <button class="person-modal-edit-btn" type="button">編集する</button>
        <button class="person-modal-cancel-btn" type="button">閉じる</button>
      </div>
    </section>
  `;

  document.body.appendChild(modal);

  modal.querySelector(".person-modal-backdrop").addEventListener("click", closePersonModal);
  modal.querySelector(".person-modal-close").addEventListener("click", closePersonModal);
  modal.querySelector(".person-modal-cancel-btn").addEventListener("click", closePersonModal);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closePersonModal();
    }
  });

  return modal;
}

/* ---------- auto ui ---------- */

function createPeopleViewSwitcher() {
  if (!peopleList) return;

  const wrapper = document.createElement("div");
  wrapper.className = "people-view-switcher";

  const listBtn = document.createElement("button");
  listBtn.type = "button";
  listBtn.className = peopleViewMode === "list" ? "people-view-btn active" : "people-view-btn";
  listBtn.textContent = "リスト";

  const gridBtn = document.createElement("button");
  gridBtn.type = "button";
  gridBtn.className = peopleViewMode === "grid" ? "people-view-btn active" : "people-view-btn";
  gridBtn.textContent = "グリッド";

  listBtn.addEventListener("click", () => {
    peopleViewMode = "list";
    localStorage.setItem("notiaPeopleViewMode", peopleViewMode);
    listBtn.classList.add("active");
    gridBtn.classList.remove("active");
    renderPeople();
  });

  gridBtn.addEventListener("click", () => {
    peopleViewMode = "grid";
    localStorage.setItem("notiaPeopleViewMode", peopleViewMode);
    gridBtn.classList.add("active");
    listBtn.classList.remove("active");
    renderPeople();
  });

  wrapper.appendChild(listBtn);
  wrapper.appendChild(gridBtn);

  peopleList.parentNode.insertBefore(wrapper, peopleList);
}

function createPersonIconInput() {
  if (!peopleFormTitle) return;

  const field = document.createElement("label");
  field.className = "person-icon-field";

  const labelText = document.createElement("span");
  labelText.textContent = "アイコン画像";

  personIconInput = document.createElement("select");
  personIconInput.id = "personIconInput";

  field.appendChild(labelText);
  field.appendChild(personIconInput);

  peopleFormTitle.insertAdjacentElement("afterend", field);

  personIconInput.addEventListener("change", () => {
    peopleStatus.textContent = selectedPersonId ? "未保存の変更あり" : "新規人物";
  });

  updatePersonIconOptions();
}

function updatePersonIconOptions() {
  if (!personIconInput) return;

  const currentValue = personIconInput.value;

  personIconInput.innerHTML = "";

  const noneOption = document.createElement("option");
  noneOption.value = "";
  noneOption.textContent = "アイコンなし";
  personIconInput.appendChild(noneOption);

  imageMemos.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.title || "無題の画像";
    personIconInput.appendChild(option);
  });

  const exists = imageMemos.some((item) => item.id === currentValue);
  personIconInput.value = exists ? currentValue : "";
}

/* ---------- helpers ---------- */

function clearPersonForm() {
  peopleFormTitle.textContent = "人物を追加";

  personNameInput.value = "";
  personNicknameInput.value = "";
  personTypeInput.value = "real";
  personSubTypeInput.value = "";
  personRelationInput.value = "";
  personMbtiInput.value = "";
  personEnneagramInput.value = "";
  personTagsInput.value = "";
  personTraitsInput.value = "";
  personMemoInput.value = "";
  personPropsInput.value = "";

  if (personIconInput) {
    personIconInput.value = "";
  }
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

function getInitial(name = "") {
  const trimmed = String(name).trim();
  return trimmed ? trimmed.slice(0, 1) : "?";
}

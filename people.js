// people.js
import { auth, googleProvider, db, storage } from "./firebase.js";
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

import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const userInfo = document.getElementById("userInfo");

const peopleSearchInput = document.getElementById("peopleSearchInput");
const peopleTypeFilter = document.getElementById("peopleTypeFilter");
const peopleSubTypeFilter = document.getElementById("peopleSubTypeFilter");
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

const PERSON_TYPES = [
  "リアル",
  "キャラクター",
  "ネット",
  "その他"
];

const SELECT_OPTIONS = {
  subType: [
    "",
    "自立支援",
    "B型事業所",
    "家族",
    "友達",
    "絵チャ",
    "オープンチャット",
    "ゲーム",
    "その他"
  ],

  relation: [
    "",
    "本人",
    "家族",
    "父",
    "母",
    "兄弟",
    "祖父母",
    "親戚",
    "友達",
    "親友",
    "知り合い",
    "職員",
    "利用者",
    "管理人",
    "メンバー",
    "推し",
    "うちの子",
    "よその子",
    "相方",
    "ライバル",
    "その他"
  ],

  mbti: [
    "",
    "INTJ",
    "INTP",
    "ENTJ",
    "ENTP",
    "INFJ",
    "INFP",
    "ENFJ",
    "ENFP",
    "ISTJ",
    "ISFJ",
    "ESTJ",
    "ESFJ",
    "ISTP",
    "ISFP",
    "ESTP",
    "ESFP",
    "不明"
  ]
};

const MAX_ICON_FILE_SIZE = 5 * 1024 * 1024;

const ALLOWED_ICON_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif"
];

function setupSelectOptions(select, options, emptyLabel) {
  if (!select) return;

  select.innerHTML = "";

  options.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value || emptyLabel;
    select.appendChild(option);
  });
}

function setupPeopleSelects() {
  setupSelectOptions(personSubTypeInput, SELECT_OPTIONS.subType, "サブジャンルなし");
  setupSelectOptions(personRelationInput, SELECT_OPTIONS.relation, "関係性なし");
  setupSelectOptions(personMbtiInput, SELECT_OPTIONS.mbti, "MBTIなし");
}

function setupSubTypeFilterOptions() {
  if (!peopleSubTypeFilter) return;

  peopleSubTypeFilter.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "すべてのサブジャンル";
  peopleSubTypeFilter.appendChild(allOption);

  SELECT_OPTIONS.subType
    .filter(Boolean)
    .forEach((subType) => {
      const option = document.createElement("option");
      option.value = subType;
      option.textContent = subType;
      peopleSubTypeFilter.appendChild(option);
    });
}

let personReadingInput = document.getElementById("personReadingInput");

let personIconFileInput = null;
let personIconRemoveInput = null;
let personIconPreview = null;
let personIconPreviewImage = null;
let personIconPreviewText = null;

let peopleViewMode = localStorage.getItem("notiaPeopleViewMode") || "list";

let currentUser = null;
let people = [];
let selectedPersonId = null;

const PEOPLE_PAGE_SIZE = 30;
let visiblePeopleCount = PEOPLE_PAGE_SIZE;

/* ---------- init ui ---------- */

createPeopleViewSwitcher();
setupPersonTypeOptions();
setupPeopleSelects();
setupSubTypeFilterOptions();
createPersonIconInput();

function setSelectValue(select, value) {
  if (!select) return;

  const safeValue = value || "";

  const exists = Array.from(select.options).some((option) => {
    return option.value === safeValue;
  });

  if (!exists && safeValue) {
    const option = document.createElement("option");
    option.value = safeValue;
    option.textContent = safeValue;
    select.appendChild(option);
  }

  select.value = safeValue;
}

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
    selectedPersonId = null;

    clearPersonForm();
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

  await loadPeople();
});

/* ---------- events ---------- */

newPersonBtn.addEventListener("click", () => {
  selectedPersonId = null;
  visiblePeopleCount = PEOPLE_PAGE_SIZE;

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
  visiblePeopleCount = PEOPLE_PAGE_SIZE;
  renderPeople();
});

peopleTypeFilter.addEventListener("change", () => {
  visiblePeopleCount = PEOPLE_PAGE_SIZE;
  renderPeople();
});

if (peopleSubTypeFilter) {
  peopleSubTypeFilter.addEventListener("change", () => {
    visiblePeopleCount = PEOPLE_PAGE_SIZE;
    renderPeople();
  });
}

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
  if (!input) return;

  const eventName = input.tagName === "SELECT" ? "change" : "input";

  input.addEventListener(eventName, () => {
    peopleStatus.textContent = selectedPersonId
      ? "未保存の変更あり"
      : "新規人物";
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

  people.sort(comparePeopleByReading);

  renderPeople();
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
  const reading = personReadingInput?.value.trim() || "";
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

  if (!name) {
    alert("名前を入力してください");
    return;
  }

  const currentPerson = people.find((person) => {
    return person.id === selectedPersonId;
  });

  const oldIconImageUrl = currentPerson?.iconImageUrl || "";
  const oldIconStoragePath = currentPerson?.iconStoragePath || "";

  let iconImageUrl = oldIconImageUrl;
  let iconStoragePath = oldIconStoragePath;

  const selectedFile = personIconFileInput?.files?.[0] || null;
  const shouldRemoveIcon = Boolean(personIconRemoveInput?.checked);

  let uploadedNewIconPath = "";

  try {
    savePersonBtn.disabled = true;
    savePersonBtn.textContent = "保存中…";

    if (selectedFile) {
      const uploadedIcon = await uploadPersonIcon(selectedFile);

      iconImageUrl = uploadedIcon.url;
      iconStoragePath = uploadedIcon.path;
      uploadedNewIconPath = uploadedIcon.path;
    } else if (shouldRemoveIcon) {
      iconImageUrl = "";
      iconStoragePath = "";
    }

    const data = {
      name,
      reading,
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
      iconImageUrl,
      iconStoragePath,
      updatedAt: serverTimestamp()
    };

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

    const iconWasReplaced =
      uploadedNewIconPath &&
      oldIconStoragePath &&
      oldIconStoragePath !== uploadedNewIconPath;

    const iconWasRemoved =
      shouldRemoveIcon &&
      !selectedFile &&
      oldIconStoragePath;

    if (iconWasReplaced || iconWasRemoved) {
      await deletePersonIconFromStorage(oldIconStoragePath);
    }

    if (personIconFileInput) {
      personIconFileInput.value = "";
    }

    if (personIconRemoveInput) {
      personIconRemoveInput.checked = false;
    }

    await loadPeople();

    const savedPerson = people.find((person) => {
      return person.id === selectedPersonId;
    });

    updatePersonIconPreview(
      savedPerson?.iconImageUrl || "",
      savedPerson?.name || name
    );
  } catch (error) {
    console.error(error);

    if (uploadedNewIconPath) {
      await deletePersonIconFromStorage(uploadedNewIconPath);
    }

    alert("人物の保存に失敗しました");
  } finally {
    savePersonBtn.disabled = false;
    savePersonBtn.textContent = "保存";
  }
}

async function uploadPersonIcon(file) {
  if (!currentUser) {
    throw new Error("ログイン情報がありません");
  }

  if (!ALLOWED_ICON_TYPES.includes(file.type)) {
    throw new Error("PNG、JPEG、WEBP、GIF形式の画像を選んでください");
  }

  if (file.size > MAX_ICON_FILE_SIZE) {
    throw new Error("画像は5MB以下にしてください");
  }

  const extension = getFileExtension(file);
  const safeName = `icon_${Date.now()}.${extension}`;

  const iconRef = ref(
    storage,
    `people-icons/${currentUser.uid}/${safeName}`
  );

  await uploadBytes(iconRef, file, {
    contentType: file.type
  });

  const url = await getDownloadURL(iconRef);

  return {
    url,
    path: iconRef.fullPath
  };
}

async function deletePersonIconFromStorage(storagePath) {
  if (!storagePath) return;

  try {
    const iconRef = ref(storage, storagePath);
    await deleteObject(iconRef);
  } catch (error) {
    if (error?.code === "storage/object-not-found") {
      return;
    }

    console.error("アイコン画像の削除に失敗しました", error);
  }
}

function getFileExtension(file) {
  const fromName = file.name.split(".").pop()?.toLowerCase();

  if (fromName && /^[a-z0-9]+$/.test(fromName)) {
    return fromName;
  }

  if (file.type === "image/png") return "png";
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/gif") return "gif";

  return "png";
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

  const person = people.find((item) => {
    return item.id === selectedPersonId;
  });

  const ok = confirm(
    `${person?.name || "この人物"}を削除しますか？`
  );

  if (!ok) return;

  try {
    await deleteDoc(doc(db, "people", selectedPersonId));

    if (person?.iconStoragePath) {
      await deletePersonIconFromStorage(person.iconStoragePath);
    }

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
  const subTypeFilter = peopleSubTypeFilter?.value || "all";

  let filtered = [...people];

  if (typeFilter !== "all") {
    filtered = filtered.filter((person) => person.type === typeFilter);
  }

  if (subTypeFilter !== "all") {
    filtered = filtered.filter((person) => person.subType === subTypeFilter);
  }

  if (keyword) {
    filtered = filtered.filter((person) => {
      const searchText = [
        person.name,
        person.reading,
        person.nickname,
        person.type,
        person.subType,
        person.relation,
        person.mbti,
        person.enneagram,
        person.tags,
        person.traits,
        person.memo,
        person.props
      ]
        .join(" ")
        .toLowerCase();

      return searchText.includes(keyword);
    });
  }

  filtered.sort(comparePeopleByReading);

  const totalCount = filtered.length;
  const visiblePeople = filtered.slice(0, visiblePeopleCount);

  if (filtered.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-text";
    empty.textContent = "人物がありません";
    peopleList.appendChild(empty);
    return;
  }

  visiblePeople.forEach((person) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = selectedPersonId === person.id
      ? "person-card active"
      : "person-card";

    const icon = createPersonIconElement(person);

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

    if (person.mbti) {
      badges.appendChild(createBadge(person.mbti, getMbtiClass(person.mbti)));
    }

    badges.appendChild(createBadge(getTypeLabel(person.type)));

    if (person.enneagram) {
      badges.appendChild(createBadge(person.enneagram));
    }

    if (person.subType) {
      badges.appendChild(createBadge(person.subType));
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

  if (visiblePeopleCount < totalCount) {
    const moreBtn = document.createElement("button");
    moreBtn.type = "button";
    moreBtn.className = "people-more-btn";
    moreBtn.textContent = `もっと見る（${visiblePeople.length}/${totalCount}）`;

    moreBtn.addEventListener("click", () => {
      visiblePeopleCount += PEOPLE_PAGE_SIZE;
      renderPeople();
    });

    peopleList.appendChild(moreBtn);
  }
}

function createPersonIconElement(person) {
  const icon = document.createElement("div");
  icon.className = "person-icon";

  if (!person.iconImageUrl) {
    icon.textContent = getInitial(person.name);
    return icon;
  }

  const img = document.createElement("img");
  img.src = person.iconImageUrl;
  img.alt = person.name || "人物アイコン";
  img.loading = "lazy";

  img.addEventListener("error", () => {
    icon.innerHTML = "";
    icon.textContent = getInitial(person.name);
  });

  icon.appendChild(img);

  return icon;
}

/* ---------- select ---------- */

function selectPerson(person) {
  selectedPersonId = person.id;

  peopleFormTitle.textContent = "人物を編集";

  personNameInput.value = person.name || "";

  if (personReadingInput) {
    personReadingInput.value = person.reading || "";
  }

  personNicknameInput.value = person.nickname || "";
  personTypeInput.value = person.type || PERSON_TYPES[0] || "その他";

  setSelectValue(personSubTypeInput, person.subType || "");
  setSelectValue(personRelationInput, person.relation || "");
  setSelectValue(personMbtiInput, person.mbti || "");

  personEnneagramInput.value = person.enneagram || "";
  personTagsInput.value = person.tags || "";
  personTraitsInput.value = person.traits || "";
  personMemoInput.value = person.memo || "";
  personPropsInput.value = person.props || "";

  if (personIconFileInput) {
    personIconFileInput.value = "";
  }

  if (personIconRemoveInput) {
    personIconRemoveInput.checked = false;
  }

  updatePersonIconPreview(
    person.iconImageUrl || "",
    person.name || ""
  );

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

    img.addEventListener("error", () => {
      modalIcon.innerHTML = "";
      modalIcon.textContent = getInitial(person.name);
    });

    modalIcon.appendChild(img);
  } else {
    modalIcon.textContent = getInitial(person.name);
  }

  modal.querySelector(".person-modal-name").textContent =
    person.name || "名前なし";

  modal.querySelector(".person-modal-nickname").textContent =
    person.nickname
      ? `通称：${person.nickname}`
      : "通称なし";

  modal.querySelector(".person-modal-reading").textContent =
    person.reading
      ? `よみ：${person.reading}`
      : "よみ未登録";

  modal.querySelector(".person-modal-type").textContent =
    getTypeLabel(person.type);

  modal.querySelector(".person-modal-subtype").textContent =
    person.subType || "分類なし";

  modal.querySelector(".person-modal-relation").textContent =
    person.relation || "関係なし";

  modal.querySelector(".person-modal-mbti").textContent =
    person.mbti || "MBTIなし";

  modal.querySelector(".person-modal-enneagram").textContent =
    person.enneagram || "エニアなし";

  modal.querySelector(".person-modal-traits").textContent =
    person.traits || "特徴なし";

  modal.querySelector(".person-modal-memo").textContent =
    person.memo || "メモなし";

  modal.querySelector(".person-modal-props").textContent =
    person.props || "プロパティなし";

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

    const editor = document.querySelector(
      ".person-reading-field, .person-icon-field, form"
    );

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

    <section
      class="person-modal-card"
      role="dialog"
      aria-modal="true"
      aria-label="人物プロフィール"
    >
      <button
        class="person-modal-close"
        type="button"
        aria-label="閉じる"
      >×</button>

      <div class="person-modal-head">
        <div class="person-modal-icon"></div>

        <div>
          <p class="label">PERSON PROFILE</p>
          <h2 class="person-modal-name">名前なし</h2>
          <p class="person-modal-nickname">通称なし</p>
          <p class="person-modal-reading">よみ未登録</p>
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
        <button class="person-modal-edit-btn" type="button">
          編集する
        </button>

        <button class="person-modal-cancel-btn" type="button">
          閉じる
        </button>
      </div>
    </section>
  `;

  document.body.appendChild(modal);

  modal
    .querySelector(".person-modal-backdrop")
    .addEventListener("click", closePersonModal);

  modal
    .querySelector(".person-modal-close")
    .addEventListener("click", closePersonModal);

  modal
    .querySelector(".person-modal-cancel-btn")
    .addEventListener("click", closePersonModal);

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
  listBtn.className = peopleViewMode === "list"
    ? "people-view-btn active"
    : "people-view-btn";

  listBtn.textContent = "リスト";

  const gridBtn = document.createElement("button");
  gridBtn.type = "button";
  gridBtn.className = peopleViewMode === "grid"
    ? "people-view-btn active"
    : "people-view-btn";

  gridBtn.textContent = "グリッド";

  listBtn.addEventListener("click", () => {
    peopleViewMode = "list";

    localStorage.setItem(
      "notiaPeopleViewMode",
      peopleViewMode
    );

    listBtn.classList.add("active");
    gridBtn.classList.remove("active");

    renderPeople();
  });

  gridBtn.addEventListener("click", () => {
    peopleViewMode = "grid";

    localStorage.setItem(
      "notiaPeopleViewMode",
      peopleViewMode
    );

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

  const field = document.createElement("div");
  field.className = "person-icon-field";

  const labelText = document.createElement("span");
  labelText.className = "person-icon-label";
  labelText.textContent = "アイコン画像";

  personIconFileInput = document.createElement("input");
  personIconFileInput.id = "personIconFileInput";
  personIconFileInput.type = "file";
  personIconFileInput.accept = "image/png,image/jpeg,image/webp,image/gif";

  const help = document.createElement("small");
  help.className = "person-icon-help";
  help.textContent = "PNG・JPEG・WEBP・GIF対応 / 5MBまで";

  personIconPreview = document.createElement("div");
  personIconPreview.className = "person-icon-preview";

  personIconPreviewImage = document.createElement("img");
  personIconPreviewImage.alt = "アイコンのプレビュー";

  personIconPreviewText = document.createElement("span");
  personIconPreviewText.textContent = "アイコンなし";

  personIconPreview.appendChild(personIconPreviewImage);
  personIconPreview.appendChild(personIconPreviewText);

  const removeLabel = document.createElement("label");
  removeLabel.className = "person-icon-remove";

  personIconRemoveInput = document.createElement("input");
  personIconRemoveInput.type = "checkbox";
  personIconRemoveInput.id = "personIconRemoveInput";

  const removeText = document.createElement("span");
  removeText.textContent = "現在のアイコンを外す";

  removeLabel.appendChild(personIconRemoveInput);
  removeLabel.appendChild(removeText);

  field.appendChild(labelText);
  field.appendChild(personIconFileInput);
  field.appendChild(help);
  field.appendChild(personIconPreview);
  field.appendChild(removeLabel);

  peopleFormTitle.insertAdjacentElement("afterend", field);

  personIconFileInput.addEventListener("change", () => {
    const file = personIconFileInput.files?.[0];

    if (!file) {
      return;
    }

    if (!ALLOWED_ICON_TYPES.includes(file.type)) {
      alert("PNG、JPEG、WEBP、GIF形式の画像を選んでください");
      personIconFileInput.value = "";
      return;
    }

    if (file.size > MAX_ICON_FILE_SIZE) {
      alert("画像は5MB以下にしてください");
      personIconFileInput.value = "";
      return;
    }

    if (personIconRemoveInput) {
      personIconRemoveInput.checked = false;
    }

    const localUrl = URL.createObjectURL(file);

    updatePersonIconPreview(
      localUrl,
      personNameInput?.value.trim() || ""
    );

    peopleStatus.textContent = selectedPersonId
      ? "未保存の変更あり"
      : "新規人物";
  });

  personIconRemoveInput.addEventListener("change", () => {
    if (personIconRemoveInput.checked) {
      if (personIconFileInput) {
        personIconFileInput.value = "";
      }

      updatePersonIconPreview("", "");
    } else {
      const person = people.find((item) => {
        return item.id === selectedPersonId;
      });

      updatePersonIconPreview(
        person?.iconImageUrl || "",
        person?.name || ""
      );
    }

    peopleStatus.textContent = selectedPersonId
      ? "未保存の変更あり"
      : "新規人物";
  });

  updatePersonIconPreview("", "");
}

function updatePersonIconPreview(imageUrl = "", name = "") {
  if (!personIconPreview || !personIconPreviewImage || !personIconPreviewText) {
    return;
  }

  personIconPreviewImage.onload = null;
  personIconPreviewImage.onerror = null;

  if (!imageUrl) {
    personIconPreviewImage.removeAttribute("src");
    personIconPreviewImage.hidden = true;

    personIconPreviewText.hidden = false;
    personIconPreviewText.textContent = name
      ? getInitial(name)
      : "アイコンなし";

    return;
  }

  personIconPreviewImage.hidden = false;
  personIconPreviewText.hidden = true;
  personIconPreviewImage.src = imageUrl;

  personIconPreviewImage.onerror = () => {
    personIconPreviewImage.removeAttribute("src");
    personIconPreviewImage.hidden = true;

    personIconPreviewText.hidden = false;
    personIconPreviewText.textContent = name
      ? getInitial(name)
      : "アイコンなし";
  };
}

function setupPersonTypeOptions() {
  if (!personTypeInput || !peopleTypeFilter) return;

  personTypeInput.innerHTML = PERSON_TYPES
    .map((type) => {
      return `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`;
    })
    .join("");

  peopleTypeFilter.innerHTML = [
    `<option value="all">すべて</option>`,
    ...PERSON_TYPES.map((type) => {
      return `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`;
    })
  ].join("");
}

function escapeHtml(text = "") {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ---------- helpers ---------- */

function clearPersonForm() {
  peopleFormTitle.textContent = "人物を追加";

  personNameInput.value = "";

  if (personReadingInput) {
    personReadingInput.value = "";
  }

  personNicknameInput.value = "";
  personTypeInput.value = PERSON_TYPES[0] || "その他";
  personSubTypeInput.value = "";
  personRelationInput.value = "";
  personMbtiInput.value = "";
  personEnneagramInput.value = "";
  personTagsInput.value = "";
  personTraitsInput.value = "";
  personMemoInput.value = "";
  personPropsInput.value = "";

  if (personIconFileInput) {
    personIconFileInput.value = "";
  }

  if (personIconRemoveInput) {
    personIconRemoveInput.checked = false;
  }

  updatePersonIconPreview("", "");
}

function createBadge(text, type = "") {
  const badge = document.createElement("span");
  badge.className = "person-badge";

  if (type) {
    badge.classList.add(type);
  }

  badge.textContent = text;

  return badge;
}

function getMbtiClass(mbti = "") {
  const type = String(mbti).toUpperCase();

  const analysts = ["INTJ", "INTP", "ENTJ", "ENTP"];
  const diplomats = ["INFJ", "INFP", "ENFJ", "ENFP"];
  const sentinels = ["ISTJ", "ISFJ", "ESTJ", "ESFJ"];
  const explorers = ["ISTP", "ISFP", "ESTP", "ESFP"];

  if (analysts.includes(type)) return "mbti-analyst";
  if (diplomats.includes(type)) return "mbti-diplomat";
  if (sentinels.includes(type)) return "mbti-sentinel";
  if (explorers.includes(type)) return "mbti-explorer";

  return "";
}

function getTypeLabel(type) {
  return type || "その他";
}

function makeSubText(person) {
  const parts = [];

  if (person.nickname) parts.push(person.nickname);
  if (person.reading) parts.push(person.reading);
  if (person.subType) parts.push(person.subType);
  if (person.relation) parts.push(person.relation);

  return parts.length
    ? parts.join(" / ")
    : "補足なし";
}

function splitTags(tags = "") {
  return tags
    .split(/[,\s、，]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function getInitial(name = "") {
  const trimmed = String(name).trim();

  return trimmed
    ? trimmed.slice(0, 1)
    : "?";
}

function comparePeopleByReading(a, b) {
  const aKey = getPersonSortKey(a);
  const bKey = getPersonSortKey(b);

  const result = aKey.localeCompare(bKey, "ja-JP", {
    numeric: true,
    sensitivity: "base"
  });

  if (result !== 0) {
    return result;
  }

  const aTime = a.updatedAt?.seconds || 0;
  const bTime = b.updatedAt?.seconds || 0;

  return bTime - aTime;
}

function getPersonSortKey(person) {
  const key = String(
    person.reading ||
    person.nickname ||
    person.name ||
    ""
  )
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();

  return kanaToKatakana(key);
}

function kanaToKatakana(text = "") {
  return String(text).replace(/[\u3041-\u3096]/g, (char) => {
    return String.fromCharCode(char.charCodeAt(0) + 0x60);
  });
}

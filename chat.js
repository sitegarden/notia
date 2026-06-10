// chat.js

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

const addRoomBtn = document.getElementById("addRoomBtn");
const chatRoomList = document.getElementById("chatRoomList");
const currentRoomTitle = document.getElementById("currentRoomTitle");

const mainSpeakerSelect = document.getElementById("mainSpeakerSelect");
const saveMainSpeakerBtn = document.getElementById("saveMainSpeakerBtn");

const addSpeakerBtn = document.getElementById("addSpeakerBtn");
const speakerList = document.getElementById("speakerList");

const chatMessages = document.getElementById("chatMessages");
const messageSpeakerSelect = document.getElementById("messageSpeakerSelect");
const messageInput = document.getElementById("messageInput");
const sendMessageBtn = document.getElementById("sendMessageBtn");

const addChatFolderBtn = document.getElementById("addChatFolderBtn");
const chatFolderList = document.getElementById("chatFolderList");
const roomFolderSelect = document.getElementById("roomFolderSelect");

const editRoomBtn = document.getElementById("editRoomBtn");

let currentUser = null;
let rooms = [];
let speakers = [];
let messages = [];
let selectedRoomId = null;
let chatFolders = [];
let selectedChatFolderId = "all";

const defaultIcons = [
  "🐱", "🐰", "🐻", "🦊", "🐺", "🐼",
  "🌙", "⭐", "🔥", "💧", "🍀", "🎧",
  "📝", "💬", "🌸", "🦋"
];

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

    await loadChatFolders();
    await loadRooms();
    
  } else {
    loginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
    userInfo.textContent = "";

    rooms = [];
    speakers = [];
    messages = [];
    selectedRoomId = null;
    chatFolders = [];
    selectedChatFolderId = "all";
    chatFolderList.innerHTML = "";

    renderRooms();
    renderRoomEmpty();
  }
});

/* rooms */

addRoomBtn.addEventListener("click", async () => {
  if (!currentUser) {
    alert("先にログインしてください");
    return;
  }

  const title = prompt("チャット部屋の名前を入力してね");

  if (!title || !title.trim()) return;

  try {
    const docRef = await addDoc(collection(db, "chatRooms"), {
  uid: currentUser.uid,
  title: title.trim(),
  folderId: roomFolderSelect.value || "",
  mainSpeakerId: "",
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp()
});

    selectedRoomId = docRef.id;
    await loadRooms();
    await loadRoomData();
  } catch (error) {
    console.error(error);
    alert("部屋作成に失敗しました");
  }
});

async function loadRooms() {
  if (!currentUser) return;

  const q = query(
    collection(db, "chatRooms"),
    where("uid", "==", currentUser.uid)
  );

  const snapshot = await getDocs(q);

  rooms = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data()
  }));

  rooms.sort((a, b) => {
    const aTime = a.updatedAt?.seconds || 0;
    const bTime = b.updatedAt?.seconds || 0;
    return bTime - aTime;
  });

  renderRooms();

  if (!selectedRoomId && rooms.length > 0) {
    selectedRoomId = rooms[0].id;
    await loadRoomData();
  }

  if (rooms.length === 0) {
    renderRoomEmpty();
  }
}

function renderRooms() {
  chatRoomList.innerHTML = "";

  let filteredRooms = rooms;

  if (selectedChatFolderId !== "all") {
    filteredRooms = rooms.filter((room) => (room.folderId || "") === selectedChatFolderId);
  }

  if (filteredRooms.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-text";
    empty.textContent = "チャット部屋がありません";
    chatRoomList.appendChild(empty);
    return;
  }

  filteredRooms.forEach((room) => {
    const btn = document.createElement("button");
    btn.className = selectedRoomId === room.id ? "chat-room-item active" : "chat-room-item";
    btn.textContent = room.title || "無題の部屋";

    btn.addEventListener("click", async () => {
      selectedRoomId = room.id;
      renderRooms();
      await loadRoomData();
    });

    chatRoomList.appendChild(btn);
  });
}

async function loadRoomData() {
  if (!currentUser || !selectedRoomId) return;

  const room = getCurrentRoom();

  currentRoomTitle.textContent = room?.title || "無題の部屋";

  await loadSpeakers();
  await loadMessages();
}

editRoomBtn.addEventListener("click", async () => {
  await editCurrentRoom();
});

/* speakers */

addSpeakerBtn.addEventListener("click", async () => {
  if (!currentUser) {
    alert("先にログインしてください");
    return;
  }

  if (!selectedRoomId) {
    alert("先にチャット部屋を選んでください");
    return;
  }

  const name = prompt("話す人の名前を入力してね");

  if (!name || !name.trim()) return;

  const icon = prompt(
    `アイコンを入力してね\n例：${defaultIcons.join(" ")}`
  ) || "💬";

  try {
    await addDoc(collection(db, "chatSpeakers"), {
      uid: currentUser.uid,
      roomId: selectedRoomId,
      name: name.trim(),
      icon: icon.trim().slice(0, 4) || "💬",
      createdAt: serverTimestamp()
    });

    await loadSpeakers();
  } catch (error) {
    console.error(error);
    alert("話者作成に失敗しました");
  }
});

async function loadSpeakers() {
  if (!currentUser || !selectedRoomId) return;

  const q = query(
    collection(db, "chatSpeakers"),
    where("uid", "==", currentUser.uid),
    where("roomId", "==", selectedRoomId)
  );

  const snapshot = await getDocs(q);

  speakers = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data()
  }));

  speakers.sort((a, b) => {
    const aTime = a.createdAt?.seconds || 0;
    const bTime = b.createdAt?.seconds || 0;
    return aTime - bTime;
  });

  renderSpeakers();
  renderSpeakerSelects();
}

function renderSpeakers() {
  speakerList.innerHTML = "";

  const room = getCurrentRoom();

  if (speakers.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-text";
    empty.textContent = "話す人がまだいません";
    speakerList.appendChild(empty);
    return;
  }

  speakers.forEach((speaker) => {
  const chip = document.createElement("button");
  chip.className = room?.mainSpeakerId === speaker.id
    ? "speaker-chip main"
    : "speaker-chip";

  const icon = document.createElement("span");
  icon.className = "speaker-icon";
  icon.textContent = speaker.icon || "💬";

  const name = document.createElement("span");
  name.textContent = speaker.name || "名前なし";

  chip.appendChild(icon);
  chip.appendChild(name);

  chip.addEventListener("click", async () => {
    await editSpeaker(speaker);
  });

  speakerList.appendChild(chip);
});
}

function renderSpeakerSelects() {
  mainSpeakerSelect.innerHTML = `<option value="">主役を選択</option>`;
  messageSpeakerSelect.innerHTML = `<option value="">話者</option>`;

  const room = getCurrentRoom();

  speakers.forEach((speaker) => {
    const mainOption = document.createElement("option");
    mainOption.value = speaker.id;
    mainOption.textContent = `${speaker.icon || "💬"} ${speaker.name}`;
    mainSpeakerSelect.appendChild(mainOption);

    const msgOption = document.createElement("option");
    msgOption.value = speaker.id;
    msgOption.textContent = `${speaker.icon || "💬"} ${speaker.name}`;
    messageSpeakerSelect.appendChild(msgOption);
  });

  mainSpeakerSelect.value = room?.mainSpeakerId || "";

  if (speakers.length > 0) {
    messageSpeakerSelect.value = speakers[0].id;
  }
}

saveMainSpeakerBtn.addEventListener("click", async () => {
  if (!currentUser || !selectedRoomId) {
    alert("チャット部屋を選んでください");
    return;
  }

  try {
    await updateDoc(doc(db, "chatRooms", selectedRoomId), {
      mainSpeakerId: mainSpeakerSelect.value,
      updatedAt: serverTimestamp()
    });

    await loadRooms();
    renderSpeakers();
    renderMessages();
  } catch (error) {
    console.error(error);
    alert("主役保存に失敗しました");
  }
});

/* messages */

sendMessageBtn.addEventListener("click", async () => {
  await addMessage();
});

messageInput.addEventListener("keydown", async (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    await addMessage();
  }
});

async function addMessage() {
  if (!currentUser) {
    alert("先にログインしてください");
    return;
  }

  if (!selectedRoomId) {
    alert("チャット部屋を選んでください");
    return;
  }

  const speakerId = messageSpeakerSelect.value;
  const text = messageInput.value.trim();

  if (!speakerId) {
    alert("話者を選んでください");
    return;
  }

  if (!text) {
    alert("メッセージを入力してください");
    return;
  }

  try {
    await addDoc(collection(db, "chatMessages"), {
      uid: currentUser.uid,
      roomId: selectedRoomId,
      speakerId,
      text,
      createdAt: serverTimestamp()
    });

    await updateDoc(doc(db, "chatRooms", selectedRoomId), {
      updatedAt: serverTimestamp()
    });

    messageInput.value = "";

    await loadMessages();
    await loadRooms();
  } catch (error) {
    console.error(error);
    alert("メッセージ追加に失敗しました");
  }
}

async function loadMessages() {
  if (!currentUser || !selectedRoomId) return;

  const q = query(
    collection(db, "chatMessages"),
    where("uid", "==", currentUser.uid),
    where("roomId", "==", selectedRoomId)
  );

  const snapshot = await getDocs(q);

  messages = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data()
  }));

  messages.sort((a, b) => {
    const aTime = a.createdAt?.seconds || 0;
    const bTime = b.createdAt?.seconds || 0;
    return aTime - bTime;
  });

  renderMessages();
}

function renderMessages() {
  chatMessages.innerHTML = "";

  if (!selectedRoomId) {
    renderRoomEmpty();
    return;
  }

  if (messages.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-text";
    empty.textContent = "まだメッセージがありません";
    chatMessages.appendChild(empty);
    return;
  }

  const room = getCurrentRoom();

  messages.forEach((message) => {
    const speaker = speakers.find((item) => item.id === message.speakerId);

    const isMain = room?.mainSpeakerId && message.speakerId === room.mainSpeakerId;

    const messageEl = document.createElement("div");
    messageEl.className = isMain ? "chat-message right" : "chat-message left";

    const avatar = document.createElement("div");
    avatar.className = "chat-avatar";
    avatar.textContent = speaker?.icon || "💬";

    const wrap = document.createElement("div");
    wrap.className = "chat-bubble-wrap";

    const name = document.createElement("p");
    name.className = "chat-speaker-name";
    name.textContent = speaker?.name || "不明";

    const bubble = document.createElement("div");
bubble.className = "chat-bubble";
bubble.textContent = message.text || "";

wrap.appendChild(name);
wrap.appendChild(bubble);

const actions = document.createElement("div");
actions.className = "chat-message-actions";

const menuBtn = document.createElement("button");
menuBtn.className = "chat-menu-btn";
menuBtn.textContent = "…";

const menu = document.createElement("div");
menu.className = "chat-action-menu hidden";

const editBtn = document.createElement("button");
editBtn.textContent = "編集";
editBtn.addEventListener("click", async () => {
  menu.classList.add("hidden");
  await editMessage(message);
});

const deleteBtn = document.createElement("button");
deleteBtn.textContent = "削除";
deleteBtn.className = "danger-menu-btn";
deleteBtn.addEventListener("click", async () => {
  menu.classList.add("hidden");
  await deleteMessage(message.id);
});

menuBtn.addEventListener("click", () => {
  menu.classList.toggle("hidden");
});

menu.appendChild(editBtn);
menu.appendChild(deleteBtn);

actions.appendChild(menuBtn);
actions.appendChild(menu);
wrap.appendChild(actions);

    messageEl.appendChild(avatar);
    messageEl.appendChild(wrap);

    chatMessages.appendChild(messageEl);
  });

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function editSpeaker(speaker) {
  if (!currentUser) return;

  const overlay = document.createElement("div");
  overlay.className = "edit-overlay";

  const box = document.createElement("div");
  box.className = "edit-box";

  const title = document.createElement("h3");
  title.textContent = "話す人を編集";

  const nameInput = document.createElement("input");
  nameInput.className = "speaker-edit-input";
  nameInput.value = speaker.name || "";
  nameInput.placeholder = "名前";

  const iconInput = document.createElement("input");
  iconInput.className = "speaker-edit-input";
  iconInput.value = speaker.icon || "💬";
  iconInput.placeholder = "アイコン";

  const iconChoices = document.createElement("div");
  iconChoices.className = "icon-choice-list";

  defaultIcons.forEach((iconText) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = iconText === iconInput.value ? "icon-choice active" : "icon-choice";
    btn.textContent = iconText;

    btn.addEventListener("click", () => {
      iconInput.value = iconText;

      iconChoices.querySelectorAll(".icon-choice").forEach((item) => {
        item.classList.remove("active");
      });

      btn.classList.add("active");
    });

    iconChoices.appendChild(btn);
  });

  const actions = document.createElement("div");
  actions.className = "edit-box-actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "キャンセル";

  const saveBtn = document.createElement("button");
  saveBtn.textContent = "保存";

  cancelBtn.addEventListener("click", () => {
    overlay.remove();
  });

  saveBtn.addEventListener("click", async () => {
    const newName = nameInput.value.trim();
    const newIcon = iconInput.value.trim();

    if (!newName) {
      alert("名前を入力してください");
      return;
    }

    try {
      await updateDoc(doc(db, "chatSpeakers", speaker.id), {
        name: newName,
        icon: newIcon.slice(0, 4) || "💬"
      });

      overlay.remove();

      await loadSpeakers();
      await loadMessages();
    } catch (error) {
      console.error(error);
      alert("話す人の編集に失敗しました");
    }
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);

  box.appendChild(title);
  box.appendChild(nameInput);
  box.appendChild(iconInput);
  box.appendChild(iconChoices);
  box.appendChild(actions);

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  nameInput.focus();
}

/* helpers */

async function editCurrentRoom() {
  if (!currentUser) return;

  if (!selectedRoomId) {
    alert("編集するチャット部屋を選んでください");
    return;
  }

  const room = getCurrentRoom();

  const overlay = document.createElement("div");
  overlay.className = "edit-overlay";

  const box = document.createElement("div");
  box.className = "edit-box";

  const title = document.createElement("h3");
  title.textContent = "チャット部屋を編集";

  const titleInput = document.createElement("input");
  titleInput.className = "speaker-edit-input";
  titleInput.value = room?.title || "";
  titleInput.placeholder = "チャット部屋名";

  const folderSelect = document.createElement("select");
  folderSelect.className = "speaker-edit-input";

  const noFolderOption = document.createElement("option");
  noFolderOption.value = "";
  noFolderOption.textContent = "フォルダなし";
  folderSelect.appendChild(noFolderOption);

  chatFolders.forEach((folder) => {
    const option = document.createElement("option");
    option.value = folder.id;
    option.textContent = folder.name;
    folderSelect.appendChild(option);
  });

  folderSelect.value = room?.folderId || "";

  const actions = document.createElement("div");
  actions.className = "edit-box-actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "キャンセル";

  const saveBtn = document.createElement("button");
  saveBtn.textContent = "保存";

  cancelBtn.addEventListener("click", () => {
    overlay.remove();
  });

  saveBtn.addEventListener("click", async () => {
    const newTitle = titleInput.value.trim();

    if (!newTitle) {
      alert("部屋名を入力してください");
      return;
    }

    try {
      await updateDoc(doc(db, "chatRooms", selectedRoomId), {
        title: newTitle,
        folderId: folderSelect.value,
        updatedAt: serverTimestamp()
      });

      overlay.remove();

      await loadRooms();
      renderRooms();
      await loadRoomData();
    } catch (error) {
      console.error(error);
      alert("チャット部屋の編集に失敗しました");
    }
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);

  box.appendChild(title);
  box.appendChild(titleInput);
  box.appendChild(folderSelect);
  box.appendChild(actions);

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  titleInput.focus();
}

function getCurrentRoom() {
  return rooms.find((room) => room.id === selectedRoomId);
}

function renderRoomEmpty() {
  currentRoomTitle.textContent = "部屋を選択";
  speakerList.innerHTML = "";
  mainSpeakerSelect.innerHTML = `<option value="">主役を選択</option>`;
  messageSpeakerSelect.innerHTML = `<option value="">話者</option>`;
  chatMessages.innerHTML = `<p class="empty-text">チャット部屋を選んでください</p>`;
}

async function editMessage(message) {
  if (!currentUser) return;

  const oldText = message.text || "";

  const overlay = document.createElement("div");
  overlay.className = "edit-overlay";

  const box = document.createElement("div");
  box.className = "edit-box";

  const title = document.createElement("h3");
  title.textContent = "吹き出しを編集";

  const textarea = document.createElement("textarea");
  textarea.value = oldText;

  const actions = document.createElement("div");
  actions.className = "edit-box-actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "キャンセル";

  const saveBtn = document.createElement("button");
  saveBtn.textContent = "保存";

  cancelBtn.addEventListener("click", () => {
    overlay.remove();
  });

  saveBtn.addEventListener("click", async () => {
    const newText = textarea.value.trim();

    if (!newText) {
      alert("空にはできません");
      return;
    }

    try {
      await updateDoc(doc(db, "chatMessages", message.id), {
        text: newText
      });

      overlay.remove();
      await loadMessages();
    } catch (error) {
      console.error(error);
      alert("吹き出しの編集に失敗しました");
    }
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);

  box.appendChild(title);
  box.appendChild(textarea);
  box.appendChild(actions);

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  textarea.focus();
}

async function deleteMessage(messageId) {
  if (!currentUser) return;

  const ok = confirm("この吹き出しを削除しますか？");

  if (!ok) return;

  try {
    await deleteDoc(doc(db, "chatMessages", messageId));

    await loadMessages();
  } catch (error) {
    console.error(error);
    alert("吹き出しの削除に失敗しました");
  }
}

addChatFolderBtn.addEventListener("click", async () => {
  if (!currentUser) {
    alert("先にログインしてください");
    return;
  }

  const name = prompt("フォルダ名を入力してね");

  if (!name || !name.trim()) return;

  try {
    await addDoc(collection(db, "chatFolders"), {
      uid: currentUser.uid,
      name: name.trim(),
      createdAt: serverTimestamp()
    });

    await loadChatFolders();
  } catch (error) {
    console.error(error);
    alert("フォルダ作成に失敗しました");
  }
});

async function loadChatFolders() {
  if (!currentUser) return;

  const q = query(
    collection(db, "chatFolders"),
    where("uid", "==", currentUser.uid)
  );

  const snapshot = await getDocs(q);

  chatFolders = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data()
  }));

  chatFolders.sort((a, b) => {
    const aTime = a.createdAt?.seconds || 0;
    const bTime = b.createdAt?.seconds || 0;
    return aTime - bTime;
  });

  renderChatFolders();
  renderRoomFolderSelect();
}

function renderChatFolders() {
  chatFolderList.innerHTML = "";

  const allBtn = createChatFolderButton("すべて", "all");
  chatFolderList.appendChild(allBtn);

  const noFolderBtn = createChatFolderButton("フォルダなし", "");
  chatFolderList.appendChild(noFolderBtn);

  chatFolders.forEach((folder) => {
    const btn = createChatFolderButton(folder.name, folder.id);
    chatFolderList.appendChild(btn);
  });
}

function createChatFolderButton(label, folderId) {
  const btn = document.createElement("button");
  btn.className = selectedChatFolderId === folderId
    ? "chat-room-item active"
    : "chat-room-item";

  btn.textContent = label;

  btn.addEventListener("click", () => {
    selectedChatFolderId = folderId;
    selectedRoomId = null;
    renderChatFolders();
    renderRooms();
    renderRoomEmpty();
  });

  return btn;
}

function renderRoomFolderSelect() {
  roomFolderSelect.innerHTML = `<option value="">フォルダなし</option>`;

  chatFolders.forEach((folder) => {
    const option = document.createElement("option");
    option.value = folder.id;
    option.textContent = folder.name;
    roomFolderSelect.appendChild(option);
  });
}

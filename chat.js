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

let currentUser = null;
let rooms = [];
let speakers = [];
let messages = [];
let selectedRoomId = null;

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

    await loadRooms();
  } else {
    loginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
    userInfo.textContent = "";

    rooms = [];
    speakers = [];
    messages = [];
    selectedRoomId = null;

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

  if (rooms.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-text";
    empty.textContent = "チャット部屋がありません";
    chatRoomList.appendChild(empty);
    return;
  }

  rooms.forEach((room) => {
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

    bubble.addEventListener("click", async () => {
  await editMessage(message);
});

    wrap.appendChild(name);
    wrap.appendChild(bubble);

    const actions = document.createElement("div");
actions.className = "chat-message-actions";

const deleteBtn = document.createElement("button");
deleteBtn.textContent = "削除";
deleteBtn.addEventListener("click", async () => {
  await deleteMessage(message.id);
});

actions.appendChild(deleteBtn);
wrap.appendChild(actions);

    messageEl.appendChild(avatar);
    messageEl.appendChild(wrap);

    chatMessages.appendChild(messageEl);
  });

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function editSpeaker(speaker) {
  if (!currentUser) return;

  const newName = prompt("名前を編集", speaker.name || "");

  if (!newName || !newName.trim()) return;

  const newIcon = prompt("アイコンを編集", speaker.icon || "💬") || "💬";

  try {
    await updateDoc(doc(db, "chatSpeakers", speaker.id), {
      name: newName.trim(),
      icon: newIcon.trim().slice(0, 4) || "💬"
    });

    await loadSpeakers();
    await loadMessages();
  } catch (error) {
    console.error(error);
    alert("話す人の編集に失敗しました");
  }
}

/* helpers */

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

  const newText = prompt("吹き出しを編集", message.text || "");

  if (newText === null) return;

  if (!newText.trim()) {
    alert("空にはできません");
    return;
  }

  try {
    await updateDoc(doc(db, "chatMessages", message.id), {
      text: newText.trim()
    });

    await loadMessages();
  } catch (error) {
    console.error(error);
    alert("吹き出しの編集に失敗しました");
  }
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

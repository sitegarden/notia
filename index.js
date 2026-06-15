import { auth } from "./firebase.js";
import { isAdmin } from "./admin.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const ownerOnlyLinks = document.querySelectorAll(".owner-only-link");
const prepareModal = document.getElementById("prepareModal");
const closeModalButtons = document.querySelectorAll("[data-close-modal]");

function openPrepareModal() {
  prepareModal.classList.remove("hidden");
  prepareModal.setAttribute("aria-hidden", "false");
}

function closePrepareModal() {
  prepareModal.classList.add("hidden");
  prepareModal.setAttribute("aria-hidden", "true");
}

onAuthStateChanged(auth, (user) => {
  const admin = isAdmin(user);

  ownerOnlyLinks.forEach((link) => {
    link.classList.toggle("is-owner", admin);
    link.setAttribute("aria-disabled", admin ? "false" : "true");
  });
});

ownerOnlyLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    if (link.classList.contains("is-owner")) {
      return;
    }

    event.preventDefault();
    openPrepareModal();
  });
});

closeModalButtons.forEach((button) => {
  button.addEventListener("click", closePrepareModal);
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closePrepareModal();
  }
});

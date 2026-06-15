import { auth } from "./firebase.js";
import { isAdmin } from "./admin.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const ownerOnlyLinks = document.querySelectorAll(".owner-only-link");

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
    alert("この機能は準備中です");
  });
});

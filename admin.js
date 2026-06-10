// admin.js

export const ADMIN_UIDS = [
  "m08YeUgzKehdtt6GywauQjiSZZC2"
];

export function isAdmin(user) {
  return user && ADMIN_UIDS.includes(user.uid);
}

export function blockIfNotAdmin(user) {
  if (!isAdmin(user)) {
    alert("このページは管理者専用です");
    location.href = "index.html";
  }
}

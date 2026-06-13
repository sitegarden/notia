// header.js

const headerRoot = document.getElementById("commonHeader");

if (headerRoot) {
  headerRoot.innerHTML = `

  <header class="common-header">

  <div class="common-header-top">

  <a href="/" class="common-logo">notia</a>

  <button
  id="menuToggleBtn"
  class="menu-toggle-btn"
  type="button"
  aria-label="メニューを開く"
  aria-expanded="false"
  >
  ☰
  </button>

  </div>

  <nav id="commonNav" class="common-nav">

  <a href="/">トップ</a>
  <a href="/home/">Home</a>
  <a href="/quick/">クイック</a>
  <a href="/task/">タスク</a>
  <a href="/shared/">共有メモ</a>
  <a href="/account/">アカウント</a>

  <a
    href="https://docs.google.com/forms/d/e/1FAIpQLSesMw6-ymf5_sRUzs_35r_Ml-ztA3Cgh8JAai1XNQH84__SWQ/viewform?usp=header"
    target="_blank"
    rel="noopener noreferrer"
  >
    お問い合わせ
  </a>

  <a href="/terms/">利用規約</a>
  <a href="/privacy/">プライバシー</a>

  </nav>

  </header>

  `;

  const menuToggleBtn = document.getElementById("menuToggleBtn");
  const commonNav = document.getElementById("commonNav");

  menuToggleBtn.addEventListener("click", () => {
    const isOpen = commonNav.classList.toggle("open");

    menuToggleBtn.textContent = isOpen ? "×" : "☰";
    menuToggleBtn.setAttribute("aria-expanded", String(isOpen));
    menuToggleBtn.setAttribute(
      "aria-label",
      isOpen ? "メニューを閉じる" : "メニューを開く"
    );
  });
}

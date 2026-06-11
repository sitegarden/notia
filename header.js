// header.js

const headerRoot = document.getElementById("commonHeader");

if (headerRoot) {
  headerRoot.innerHTML = `
    <header class="common-header">
      <a href="/" class="common-logo">notia</a>

      <nav class="common-nav">
        <a href="/">トップ</a>
        <a href="/home/">Home</a>
        <a href="/quick/">クイック</a>
        <a href="/task/">タスク</a>
        <a href="/shared/">共有メモ</a>
        <a href="/account/">アカウント</a>
        <a href="/terms/">利用規約</a>
      </nav>
    </header>
  `;
}

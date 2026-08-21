const FIRE_MODEL = /\bKF[A-Z0-9]{2,}\b/i;
const FIRE_MARKERS = [/\bSilk\//i, /\bFire OS\b/i, /\bKindle Fire\b/i, FIRE_MODEL];
const EINK_MARKERS = [/\bKindle\/[0-9]/i, /\bKindle\b/i, /\bKPW[0-9A-Z-]*\b/i];
const TABLET_MARKERS = [/\biPad\b/i, /\bTablet\b/i, /\bNexus 7\b/i, /\bNexus 10\b/i];
const MOBILE_MARKERS = [/\bMobile\b/i, /\biPhone\b/i, /\biPod\b/i, /\bAndroid\b/i, /\bIEMobile\b/i, /\bWindows Phone\b/i];
const DESKTOP_MARKERS = [/\bWindows NT\b/i, /\bMacintosh\b/i, /\bX11\b/i, /\bCrOS\b/i, /\bLinux x86_64\b/i];

const LABELS = Object.freeze({
  "kindle-eink": "Kindle E-Ink",
  "fire-tablet": "Fire Tablet",
  mobile: "Mobile",
  tablet: "Tablet",
  desktop: "Desktop",
  unknown: "Unknown",
});

export const KINDLE_FONT_SIZES = Object.freeze([64, 56, 48]);
export const KINDLE_FALLBACK_CHARACTERS = Object.freeze({ 48: 340, 56: 275, 64: 220 });

function matchesAny(value, patterns) {
  return patterns.some((pattern) => pattern.test(value));
}

export function detectKindleDevice(request) {
  const url = new URL(request.url);
  const userAgent = request.headers.get("user-agent") || "";
  let type = "unknown";
  let matchedRule = "no-match";

  // Fire must be classified before Kindle because Fire user agents can include
  // both Kindle wording and a Silk marker.
  if (matchesAny(userAgent, FIRE_MARKERS)) {
    type = "fire-tablet";
    matchedRule = "fire-marker";
  } else if (matchesAny(userAgent, EINK_MARKERS)) {
    type = "kindle-eink";
    matchedRule = "kindle-eink-marker";
  } else if (matchesAny(userAgent, TABLET_MARKERS) || (/\bAndroid\b/i.test(userAgent) && !/\bMobile\b/i.test(userAgent))) {
    type = "tablet";
    matchedRule = "tablet-marker";
  } else if (matchesAny(userAgent, MOBILE_MARKERS)) {
    type = "mobile";
    matchedRule = "mobile-marker";
  } else if (matchesAny(userAgent, DESKTOP_MARKERS)) {
    type = "desktop";
    matchedRule = "desktop-marker";
  }

  let inkMode = type === "kindle-eink";
  let inkModeSource = inkMode ? "user-agent" : "none";
  if (url.pathname === "/k" || url.pathname.startsWith("/k/")) {
    inkMode = true;
    inkModeSource = "kindle-path";
  }
  if (url.searchParams.get("ink") === "1") {
    inkMode = true;
    inkModeSource = "query";
  } else if (url.searchParams.get("ink") === "0") {
    inkMode = false;
    inkModeSource = "query";
  }

  return { type, label: LABELS[type], inkMode, inkModeSource, userAgent, matchedRule };
}

export function escapeKindleHtml(value) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function kindleLayout({ title, body, device, description = "墨读 Kindle 阅读", script = "", bodyClass = "" }) {
  return `<!doctype html>
<html lang="zh-CN" class="${device.inkMode ? "ink-mode" : "web-mode"}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeKindleHtml(description)}">
  <meta http-equiv="Cache-Control" content="no-transform">
  <title>${escapeKindleHtml(title)}</title>
  <link rel="stylesheet" href="/kindle.css?v=20260820-1">
</head>
<body class="${escapeKindleHtml(bodyClass)}">
${body}
${script ? `<script src="${escapeKindleHtml(script)}"></script>` : ""}
</body>
</html>`;
}

export function selectedKindleSize(url, savedScale = "") {
  const requested = Number.parseInt(url.searchParams.get("size") || "", 10);
  if (KINDLE_FONT_SIZES.includes(requested)) return requested;
  if (savedScale === "standard") return 48;
  if (savedScale === "large" || savedScale === "extra_large") return 56;
  return 64;
}

export function scaleForKindleSize(size) {
  if (size === 48) return "standard";
  if (size === 56) return "large";
  return "extra_extra_large";
}

export function kindleReaderHref({ bookId, chapterId, start = 0, page = 1, size = 64, previous }) {
  const search = new URLSearchParams({ start: String(start), page: String(page), size: String(size) });
  if (previous !== undefined && previous !== null) search.set("prev", String(previous));
  return `/k/read/${encodeURIComponent(bookId)}/${encodeURIComponent(chapterId)}?${search.toString()}`;
}

function shelfRows(books) {
  const rows = [];
  for (let index = 0; index < books.length; index += 2) rows.push(books.slice(index, index + 2));
  if (!rows.length) return "";
  return rows.map((row) => `<tr>${row.map((book) => `<td class="book-cell"><a href="${escapeKindleHtml(book.href)}"><img src="/k/cover/${escapeKindleHtml(book.id)}" alt="《${escapeKindleHtml(book.title)}》封面"><strong>${escapeKindleHtml(book.title)}</strong>${book.author ? `<small>${escapeKindleHtml(book.author)}</small>` : ""}</a></td>`).join("")}${row.length === 1 ? '<td class="book-cell empty-book-cell" aria-hidden="true"></td>' : ""}</tr>`).join("");
}

export function renderKindleLibrary({ device, books, scope = "all" }) {
  const continueControl = scope === "continue"
    ? "<strong>继续阅读</strong>"
    : '<a href="/k/library?scope=continue">继续阅读</a>';
  const favoriteControl = scope === "favorites"
    ? "<strong>我的收藏</strong>"
    : '<a href="/k/library?scope=favorites">我的收藏</a>';
  const shelf = books.length
    ? `<table class="bookshelf-table bookshelf-b1 selected-bookshelf"><tbody>${shelfRows(books)}</tbody></table>`
    : `<p class="empty-message">${scope === "continue" ? "还没有阅读记录。" : scope === "favorites" ? "还没有收藏读物。" : "书架暂时为空。"}</p>`;
  const body = `<main class="page selected-library">
  <header class="page-header">
    <table class="library-header-line"><tbody><tr>
      <td class="library-header-title"><h1>书架</h1></td>
      <td class="library-header-actions"><p class="library-scopes">${continueControl}　<a href="/k/home">回到主页</a>　${favoriteControl}</p></td>
    </tr></tbody></table>
  </header>
  ${shelf}
</main>`;
  return kindleLayout({ title: "墨读书架", body, device, bodyClass: "library-page" });
}

export function renderKindleToc({ device, book, chapters, continueHref }) {
  const links = chapters.map((chapter) => `<li><a href="${escapeKindleHtml(chapter.href)}">${escapeKindleHtml(chapter.title)}</a></li>`).join("");
  const body = `<main class="page selected-book-toc">
  <header class="page-header">
    <p><a class="text-link" href="/k/library">返回书架</a></p>
    <h1>《${escapeKindleHtml(book.title)}》</h1>
    ${book.author ? `<p>${escapeKindleHtml(book.author)} 著</p>` : ""}
  </header>
  ${continueHref ? `<p><a class="block-link" href="${escapeKindleHtml(continueHref)}">继续阅读</a></p>` : ""}
  <section class="book-toc"><h2>目录</h2><ol>${links}</ol></section>
</main>`;
  return kindleLayout({ title: `${book.title} — 目录`, body, device, bodyClass: "book-toc-page" });
}

export function renderKindleReader({
  device, book, chapter, source, start, page, size, previous, previousChapterHref,
  nextChapterHref, pagesBefore, totalPages, bookLength, bookOffsetBefore,
  isFavorite = false, favoriteCsrf = "", returnHref = "",
}) {
  const fallbackCharacters = KINDLE_FALLBACK_CHARACTERS[size];
  const chunk = source.slice(start, start + 2000);
  const fallbackEnd = Math.min(start + fallbackCharacters, source.length);
  const fallbackText = source.slice(start, fallbackEnd).replace(/^\s+/, "");
  const previousHref = previous !== undefined
    ? kindleReaderHref({ bookId: book.id, chapterId: chapter.id, start: previous, page: Math.max(page - 1, 1), size })
    : previousChapterHref;
  const nextHref = fallbackEnd < source.length
    ? kindleReaderHref({ bookId: book.id, chapterId: chapter.id, start: fallbackEnd, previous: start, page: page + 1, size })
    : nextChapterHref;
  const previousControl = previousHref
    ? `<a id="book-prev" href="${escapeKindleHtml(previousHref)}">上一页</a>`
    : '<span id="book-prev" class="disabled-control">上一页</span>';
  const nextControl = nextHref
    ? `<a id="book-next" href="${escapeKindleHtml(nextHref)}">下一页</a>`
    : '<span id="book-next" class="disabled-control">末页</span>';
  const fontLabels = { 48: "小", 56: "中", 64: "大" };
  const sizeControls = KINDLE_FONT_SIZES.map((candidate) => candidate === size
    ? `<strong class="font-size-current">${fontLabels[candidate]}</strong>`
    : `<a class="font-size-control" href="${escapeKindleHtml(kindleReaderHref({ bookId: book.id, chapterId: chapter.id, start, page, size: candidate, previous }))}">${fontLabels[candidate]}</a>`).join("　");
  const absolutePage = Math.max(1, pagesBefore + page);
  const initialCompleted = bookLength > 0 ? Math.max(0, Math.min(100, Math.floor((bookOffsetBefore + start) / bookLength * 100))) : 0;
  const body = `<main class="book-reader book-size-${size}">
  <header class="book-reader-top"><table><tbody><tr>
    <td class="reader-home-cell"><a href="/k/library">回到书架</a></td>
    <td class="font-controls" aria-label="正文字号">字体大小：${sizeControls}</td>
    <td class="reader-progress-cell"><span id="book-page-count">${absolutePage}页/共${Math.max(totalPages, absolutePage)}页</span>，<span id="book-progress">已完成 ${initialCompleted}%</span></td>
  </tr></tbody></table></header>
  <article id="book-page" class="book-page-text family-sans" data-start="${start}" data-page="${page}" data-absolute-page="${absolutePage}" data-size="${size}" data-length="${source.length}" data-book-length="${bookLength}" data-book-offset="${bookOffsetBefore}" data-total-pages="${Math.max(totalPages, absolutePage)}" data-next-chapter="${escapeKindleHtml(nextChapterHref || "")}" aria-label="${escapeKindleHtml(book.title)} ${escapeKindleHtml(chapter.title)} 第 ${page} 页">${escapeKindleHtml(fallbackText)}</article>
  <textarea id="book-source" class="book-source" aria-hidden="true">${escapeKindleHtml(chunk)}</textarea>
  <nav class="book-page-nav" aria-label="阅读翻页"><table><tbody><tr>
    <td><form class="favorite-form" method="post" action="/k/books/favorite">
      <input type="hidden" name="csrf_token" value="${escapeKindleHtml(favoriteCsrf)}">
      <input type="hidden" name="book_id" value="${escapeKindleHtml(book.id)}">
      <input type="hidden" name="favorite" value="${isFavorite ? "0" : "1"}">
      <input type="hidden" name="return_to" value="${escapeKindleHtml(returnHref)}">
      <button type="submit">${isFavorite ? "取消收藏" : "收藏"}</button>
    </form></td>
    <td>${previousControl}</td>
    <td><a href="/k/book/${encodeURIComponent(book.id)}/toc">回到目录</a></td>
    <td>${nextControl}</td>
  </tr></tbody></table></nav>
  </main>`;
  return kindleLayout({
    title: `${book.title} — ${chapter.title}`,
    description: `${book.title} Kindle 阅读`,
    body,
    device,
    bodyClass: "book-reader-page",
    script: "/book-reader.js?v=20260820-1",
  });
}

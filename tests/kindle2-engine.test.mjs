import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  detectKindleDevice,
  kindleReaderHref,
  renderKindleLibrary,
  renderKindleReader,
  renderKindleToc,
} from "../src/kindle/engine.mjs";

const kindleUa = "Mozilla/5.0 (X11; U; Linux armv71 like Android; en-us) AppleWebkit/531.2+ (KHTML, like Gecko) Version/5.0 Safari/533.2+ Kindle/3.0+";

function kindleRequest(path = "/k/library", userAgent = kindleUa) {
  return new Request(`https://modu.1005205.xyz${path}`, { headers: { "user-agent": userAgent } });
}

test("Kindle E-Ink detection preserves Fire-before-Kindle ordering", () => {
  const kindle = detectKindleDevice(kindleRequest());
  assert.equal(kindle.type, "kindle-eink");
  assert.equal(kindle.inkMode, true);

  const fire = detectKindleDevice(kindleRequest("/", "Mozilla/5.0 Kindle Fire Build/JDQ39; Silk/3.13"));
  assert.equal(fire.type, "fire-tablet");
  assert.equal(fire.matchedRule, "fire-marker");
});

test("formal MODU data renders through the Kindle shelf and TOC without fixtures", () => {
  const device = detectKindleDevice(kindleRequest());
  const href = kindleReaderHref({ bookId: "book-1", chapterId: "chapter-1", size: 64 });
  const shelf = renderKindleLibrary({
    device,
    scope: "all",
    books: [{ id: "book-1", title: "正式读物", author: "作者", href }],
  });
  assert.match(shelf, /selected-bookshelf/);
  assert.match(shelf, /继续阅读/);
  assert.match(shelf, /回到主页/);
  assert.match(shelf, /我的收藏/);
  assert.match(shelf, /library-header-line/);
  assert.doesNotMatch(shelf, /全部书籍/);
  assert.match(shelf, /正式读物/);
  assert.match(shelf, /\/k\/cover\/book-1/);
  assert.doesNotMatch(shelf, /黄帝内经|MODU TEST|\/k\/lab/);

  const toc = renderKindleToc({
    device,
    book: { id: "book-1", title: "正式读物", author: "作者" },
    chapters: [{ id: "chapter-1", title: "第一章", href }],
    continueHref: href,
  });
  assert.match(toc, /第一章/);
  assert.match(toc, /\/k\/read\/book-1\/chapter-1/);
});

test("reader keeps the frozen Kindle structure and formal chapter content", () => {
  const device = detectKindleDevice(kindleRequest("/k/read/book-1/chapter-1"));
  const html = renderKindleReader({
    device,
    book: { id: "book-1", title: "正式读物" },
    chapter: { id: "chapter-1", title: "第一章" },
    source: "这是来自 MODU 正式章节表的正文。".repeat(100),
    start: 0,
    page: 1,
    size: 64,
    previous: undefined,
    previousChapterHref: null,
    nextChapterHref: "/k/read/book-1/chapter-2?start=0&page=1&size=64",
    pagesBefore: 0,
    totalPages: 8,
    bookLength: 3000,
    bookOffsetBefore: 0,
    isFavorite: false,
    favoriteCsrf: "csrf-token",
    returnHref: "/k/read/book-1/chapter-1?start=0&page=1&size=64",
  });
  assert.match(html, /book-reader book-size-64/);
  assert.match(html, /字体大小：/);
  assert.match(html, /回到目录/);
  assert.match(html, /回到书架/);
  assert.match(html, />收藏<\/button>/);
  assert.match(html, /name="return_to"/);
  assert.match(html, /book-reader\.js\?v=20260820-1/);
  assert.match(html, /这是来自 MODU 正式章节表的正文/);
});

test("book-reader.js retains adaptive binary text fitting", async () => {
  const script = await readFile(new URL("../public/book-reader.js", import.meta.url), "utf8");
  assert.match(script, /function fits\(length\)/);
  assert.match(script, /while \(low < high\)/);
  assert.match(script, /page\.scrollHeight <= page\.clientHeight/);
  assert.match(script, /localStorage\.setItem/);
  assert.doesNotMatch(script, /fixedCharactersPerPage|\/k\/lab/);

  const css = await readFile(new URL("../public/kindle.css", import.meta.url), "utf8");
  assert.match(css, /height: 1228px/);
  assert.match(css, /height: 1074px/);
  assert.match(css, /book-size-64/);
});

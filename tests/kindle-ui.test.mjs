import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import test from "node:test";
import jpeg from "jpeg-js";

import { paginateChapter, paginateChapterForScreen, parseBookChapters } from "../src/domain/reading-format.mjs";
import { createKindleJpegThumbnail } from "../src/platform/cover-thumbnail.mjs";

test("TXT 物理换行会合并，空行仍保留真正段落", () => {
  const chapters = parseBookChapters("第一章 起点\n这是第一句话。\n这是同一段第二句话。\n\n这是第二段。\n继续第二段。");
  assert.equal(chapters.length, 1);
  assert.equal(chapters[0].body, "这是第一句话。这是同一段第二句话。\n\n这是第二段。继续第二段。");
  const pages = paginateChapter(chapters[0].body, 1000);
  assert.equal(pages[0].split("\n\n").length, 2);
  assert.equal(pages[0].includes("。\n这是"), false);
});

test("长篇 TXT 的自然段逐行格式会保留段落分隔", () => {
  const paragraphLines = Array.from({ length: 16 }, (_, index) => `这是第${index + 1}个自然段，源文件使用单换行分段。`).join("\n");
  const chapters = parseBookChapters(`第一章 段落测试\n${paragraphLines}`);
  assert.equal(chapters.length, 1);
  assert.equal(chapters[0].body.split("\n\n").length, 16);
});

test("长篇 TXT 的编辑器物理折行仍会合并为自然段", () => {
  const wrappedLines = Array.from({ length: 16 }, (_, index) => index % 2
    ? "继续上一行尚未结束的内容"
    : "这是一段被编辑器按宽度自动折行的内容").join("\n");
  const chapters = parseBookChapters(`第一章 折行测试\n${wrappedLines}`);
  assert.equal(chapters.length, 1);
  assert.equal(chapters[0].body.includes("\n\n"), false);
});

test("读物只按第…章拆分，不再把数字、Markdown 或英文标题误判为章节", () => {
  const chapters = parseBookChapters(`前言内容\n\n# 这不是章节\n\n1. 这也不是章节\n\nChapter 1 Not a chapter\n\n第一章 开始\n第一章正文。\n\n第二卷 不是章节\n仍属于第一章。\n\n第十二章　继续\n第二章正文。`);
  assert.equal(chapters.length, 3);
  assert.equal(chapters[0].title, "序章");
  assert.equal(chapters[1].title, "第一章 开始");
  assert.equal(chapters[2].title, "第十二章　继续");
  assert.match(chapters[0].body, /# 这不是章节/);
  assert.match(chapters[1].body, /第二卷 不是章节/);
});

test("阅读分页保持自然段且容量接近目标", () => {
  const paragraph = "墨读让旧 Kindle 继续承担阅读与学习任务。".repeat(90);
  const pages = paginateChapter(paragraph, 460);
  assert.ok(pages.length > 3);
  assert.ok(pages.every((page) => page.length > 250));
});

test("屏幕分页把首行缩进和段间距计入一屏高度", () => {
  const paragraphs = Array.from({ length: 28 }, (_, index) => `第${index + 1}段内容用于验证 Kindle 一屏分页，不让正文被底部工具栏遮挡。`).join("\n\n");
  const pages = paginateChapterForScreen(paragraphs, { charactersPerLine: 20, linesPerPage: 16 });
  assert.ok(pages.length > 2);
  for (const page of pages) {
    const estimatedLines = page.split(/\n\s*\n/gu)
      .reduce((sum, paragraph) => sum + Math.ceil((paragraph.length + 2) / 20) + .15, 0);
    assert.ok(estimatedLines <= 16.2);
  }
});

test("长段落会使用接近整屏的正文容量", () => {
  const pages = paginateChapterForScreen("墨读阅读页面应充分使用浏览器可视高度。".repeat(180), {
    charactersPerLine: 20,
    linesPerPage: 18,
  });
  assert.ok(pages.length > 5);
  assert.ok(pages.slice(0, -1).every((page) => page.length >= 300));
});

test("Kindle 封面处理生成小尺寸灰阶 JPEG", () => {
  const source = new Uint8Array(600 * 900 * 4);
  for (let index = 0; index < source.length; index += 4) {
    source[index] = 220;
    source[index + 1] = 80;
    source[index + 2] = 30;
    source[index + 3] = 255;
  }
  const original = jpeg.encode({ data: source, width: 600, height: 900 }, 70).data;
  const thumbnail = createKindleJpegThumbnail(original);
  assert.equal(thumbnail.width, 260);
  assert.equal(thumbnail.height, 390);
  assert.ok(thumbnail.bytes.length < original.length);
  const decoded = jpeg.decode(thumbnail.bytes, { useTArray: true });
  assert.equal(decoded.data[0], decoded.data[1]);
  assert.equal(decoded.data[1], decoded.data[2]);
});

test("UI 增量迁移保留旧账户并增加个人设置和隐私友好访问统计", async (context) => {
  const db = new DatabaseSync(":memory:");
  context.after(() => db.close());
  for (const name of ["0000_initial.sql", "0003_accounts_roles_reviews.sql"]) {
    db.exec(await readFile(resolve("drizzle", name), "utf8"));
  }
  db.prepare("INSERT INTO users(id, household_id, display_name, normalized_name) VALUES (?, ?, ?, ?)")
    .run("u1", "household_default", "旧用户", "旧用户");
  db.prepare("INSERT INTO user_preferences(id, user_id) VALUES (?, ?)").run("p1", "u1");
  db.prepare("INSERT INTO accounts(id, user_id, username, normalized_username, password_salt, password_hash) VALUES (?, ?, ?, ?, ?, ?)")
    .run("a1", "u1", "旧用户", "旧用户", "salt", "hash");
  db.exec(await readFile(resolve("drizzle", "0009_kindle_ui_preferences.sql"), "utf8"));
  db.exec(await readFile(resolve("drizzle", "0010_access_events.sql"), "utf8"));
  db.exec(await readFile(resolve("drizzle", "0011_reading_pagination_v2.sql"), "utf8"));
  db.exec(await readFile(resolve("drizzle", "0012_reading_offsets.sql"), "utf8"));
  const account = db.prepare("SELECT username, last_active_at FROM accounts WHERE id = 'a1'").get();
  const pref = db.prepare("SELECT reading_font_scale, reading_line_spacing, weather_city_name FROM user_preferences WHERE user_id = 'u1'").get();
  assert.deepEqual({ ...account }, { username: "旧用户", last_active_at: null });
  assert.deepEqual({ ...pref }, { reading_font_scale: "standard", reading_line_spacing: "comfortable", weather_city_name: "昆明" });
  db.prepare("INSERT INTO users(id, household_id, display_name, normalized_name) VALUES (?, ?, ?, ?)").run("u2", "household_default", "另一个用户", "另一个用户");
  db.prepare("INSERT INTO user_preferences(id, user_id) VALUES (?, ?)").run("p2", "u2");
  db.prepare("UPDATE user_preferences SET reading_font_scale = 'extra_large', weather_city_name = '北京' WHERE user_id = 'u1'").run();
  assert.equal(db.prepare("SELECT weather_city_name FROM user_preferences WHERE user_id = 'u2'").get().weather_city_name, "昆明");
  const accessColumns = db.prepare("PRAGMA table_info(access_events)").all().map((column) => column.name);
  assert.ok(accessColumns.includes("source"));
  assert.ok(accessColumns.includes("client_type"));
  assert.equal(accessColumns.includes("ip_address"), false);
  assert.ok(db.prepare("PRAGMA table_info(reading_progress)").all().some((column) => column.name === "pagination_version"));
  assert.ok(db.prepare("PRAGMA table_info(reading_progress)").all().some((column) => column.name === "text_offset"));
  assert.ok(db.prepare("PRAGMA table_info(reading_progress)").all().some((column) => column.name === "pagination_target"));
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
});

test("管理员删除读物时数据库关系会安全级联", async (context) => {
  const db = new DatabaseSync(":memory:");
  context.after(() => db.close());
  for (const name of ["0000_initial.sql", "0003_accounts_roles_reviews.sql", "0009_kindle_ui_preferences.sql", "0010_access_events.sql", "0011_reading_pagination_v2.sql", "0012_reading_offsets.sql"]) {
    db.exec(await readFile(resolve("drizzle", name), "utf8"));
  }
  db.prepare("INSERT INTO users(id, household_id, display_name, normalized_name) VALUES ('u1', 'household_default', '孩子', '孩子')").run();
  db.prepare("INSERT INTO books(id, household_id, title, status) VALUES ('b1', 'household_default', '测试读物', 'preview')").run();
  db.prepare("INSERT INTO chapters(id, book_id, title, body, sort_order) VALUES ('c1', 'b1', '第一章', '正文', 1)").run();
  db.prepare("INSERT INTO chapter_pages(id, chapter_id, font_size, page_number, body) VALUES ('p1', 'c1', 'medium', 1, '正文')").run();
  db.prepare("INSERT INTO reading_progress(id, user_id, book_id, chapter_id) VALUES ('r1', 'u1', 'b1', 'c1')").run();
  db.prepare("INSERT INTO user_book_preferences(user_id, book_id, is_favorite) VALUES ('u1', 'b1', 1)").run();
  db.prepare("DELETE FROM books WHERE id = 'b1'").run();
  for (const table of ["books", "chapters", "chapter_pages", "reading_progress", "user_book_preferences"]) {
    assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count, 0);
  }
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
});

test("Kindle 阅读采用 kindle2 自适应分页、双列书架且默认显示全部读物", async () => {
  const source = await readFile(resolve("worker", "index.js"), "utf8");
  const engine = await readFile(resolve("src", "kindle", "engine.mjs"), "utf8");
  const reader = await readFile(resolve("public", "book-reader.js"), "utf8");
  const css = await readFile(resolve("public", "kindle.css"), "utf8");
  assert.match(source, /homeTile\(\{ href: "\/k\/library\?scope=all"/u);
  assert.match(source, /url\.searchParams\.get\("scope"\)\) \? url\.searchParams\.get\("scope"\) : "all"/u);
  assert.match(source, /renderKindleLibrary/u);
  assert.match(source, /renderKindleReader/u);
  assert.match(engine, /selected-bookshelf/u);
  assert.match(engine, /字体大小：/u);
  assert.match(reader, /page\.scrollHeight <= page\.clientHeight/u);
  assert.match(reader, /while \(low < high\)/u);
  assert.match(css, /height: 1228px/u);
  assert.match(css, /height: 1074px/u);
  assert.match(css, /book-size-64/u);
  assert.match(source, /return redirect\(returnTo\)/u);
  assert.match(source, /if \(url\.pathname === "\/k\/settings"\) return redirect\("\/k\/home"\)/u);
  assert.match(source, /modu_ui_font_size_v1/u);
  assert.match(source, /function uiFontControls/u);
  assert.match(source, /\.ui-size-medium \.tile-grid \.home-tile \{ font-size: 35px; \}/u);
  assert.match(source, /\.ui-size-medium nav a \{ font-size: 36px; \}/u);
  assert.doesNotMatch(source, /if \(!session \|\| session\.device_status !== "active"\) return createAutomaticDeviceSession/u);
  assert.match(source, /READING_PAGINATION_VERSION = 6/u);
});

test("管理端只允许删除已下架读物并使用东八区显示时间", async () => {
  const source = await readFile(resolve("worker", "index.js"), "utf8");
  assert.doesNotMatch(source, /建立原创演示读物|\/admin\/books\/sample/u);
  assert.match(source, /if \(book\.status === "published"\)/u);
  assert.match(source, /请先下架读物/u);
  assert.match(source, /function formatShanghaiTime/u);
  assert.match(source, /timeZone: "Asia\/Shanghai"/u);
  assert.match(source, /action" value="metadata"/u);
  assert.doesNotMatch(source, /<th>用户 ID<\/th>/u);
});

test("Kindle 登录在 200 页面保存账户 Cookie 后再自动跳转", async () => {
  const source = await readFile(resolve("worker", "index.js"), "utf8");
  assert.match(source, /function accountSessionBootstrapResponse\(token, target, request\)/u);
  assert.match(source, /return accountSessionBootstrapResponse\(created\.token, returnTo, request\)/u);
  assert.match(source, /return accountSessionBootstrapResponse\(created\.token, "\/k\/home\?notice=registered", request\)/u);
  assert.match(source, /<meta http-equiv="refresh" content="0;url=\$\{escapeHtml\(safeTarget\)\}">/u);
  assert.doesNotMatch(source, /return redirect\(returnTo, \{ "set-cookie": accountCookie\(created\.token\) \}\)/u);
});

test("Kindle/3.0 使用设备测试已验证的兼容 Cookie，正式流量固定到唯一域名", async () => {
  const source = await readFile(resolve("worker", "index.js"), "utf8");
  assert.match(source, /return isKindleEinkRequest\(request\) \? base : `\$\{base\}; HttpOnly; Secure`/u);
  assert.match(source, /const CANONICAL_HOST = "modu\.1005205\.xyz"/u);
  assert.match(source, /return Response\.redirect\(url\.toString\(\), 308\)/u);
});

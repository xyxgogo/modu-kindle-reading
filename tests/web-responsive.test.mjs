import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { detectKindleDevice } from "../src/kindle/engine.mjs";
import {
  WEB_SCRIPT_SRC,
  WEB_STYLESHEET_HREF,
  adaptResponseForWeb,
  isWebUiPath,
  shouldAdaptWebResponse,
} from "../src/web/response-adapter.mjs";

const FROZEN_KINDLE_HASHES = Object.freeze({
  "src/kindle/engine.mjs": "a9ac52ba2d698c9d3bb1d009e66a090c5b3efe228b243df31c7cf0bd33370391",
  "public/kindle.css": "32ee0279c84a102a804d73380899ce59bfd4c13d05acdf5d52fb6c159d720d1f",
  "public/book-reader.js": "cec6cfbffefc72958c11fbb1fc05cc75392f16954e2f9fffc34ba57c08f872ae",
});

class MockRewriter {
  constructor() {
    this.handlers = new Map();
  }

  on(selector, handler) {
    this.handlers.set(selector, handler);
    return this;
  }

  transform(response) {
    const attributes = { class: "kindle" };
    const additions = [];
    this.handlers.get("html").element({
      getAttribute: (name) => attributes[name] || null,
      setAttribute: (name, value) => { attributes[name] = value; },
    });
    this.handlers.get("head").element({
      append: (value) => additions.push(value),
    });
    return new Response(JSON.stringify({ attributes, additions }), {
      status: response.status,
      headers: response.headers,
    });
  }
}

test("Kindle 稳定文件保持与固化版本完全一致", async () => {
  for (const [path, expected] of Object.entries(FROZEN_KINDLE_HASHES)) {
    const normalized = (await readFile(path, "utf8")).replace(/\r\n/gu, "\n");
    const actual = createHash("sha256").update(normalized).digest("hex");
    assert.equal(actual, expected, path);
  }
});

test("只有用户端和家长端 HTML 进入非 Kindle 显示层", () => {
  assert.equal(isWebUiPath("/k/home"), true);
  assert.equal(isWebUiPath("/parent/children"), true);
  assert.equal(isWebUiPath("/admin"), false);
  assert.equal(shouldAdaptWebResponse({ pathname: "/k/home", deviceType: "mobile", contentType: "text/html; charset=utf-8" }), true);
  assert.equal(shouldAdaptWebResponse({ pathname: "/parent", deviceType: "tablet", contentType: "text/html" }), true);
  assert.equal(shouldAdaptWebResponse({ pathname: "/k/home", deviceType: "kindle-eink", contentType: "text/html" }), false);
  assert.equal(shouldAdaptWebResponse({ pathname: "/admin", deviceType: "mobile", contentType: "text/html" }), false);
  assert.equal(shouldAdaptWebResponse({ pathname: "/k/cover/book", deviceType: "mobile", contentType: "image/jpeg" }), false);
});

test("Kindle 响应原样返回且不加载 Web 资源", () => {
  const request = new Request("https://modu.1005205.xyz/k/home", {
    headers: { "user-agent": "Mozilla/5.0 Kindle/3.0+" },
  });
  const response = new Response("<html><head></head><body>Kindle</body></html>", {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
  const adapted = adaptResponseForWeb(request, response, detectKindleDevice(request).type, class {
    constructor() { throw new Error("Kindle must bypass the rewriter"); }
  });
  assert.equal(adapted, response);
});

test("手机 HTML 增加独立 Web 标识、样式和旋转脚本", async () => {
  const request = new Request("https://modu.1005205.xyz/k/home", {
    headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile" },
  });
  const response = new Response("<html class=\"kindle\"><head></head><body>Web</body></html>", {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
  const adapted = adaptResponseForWeb(request, response, detectKindleDevice(request).type, MockRewriter);
  const result = JSON.parse(await adapted.text());
  assert.equal(result.attributes.class, "kindle web-client");
  assert.ok(result.additions.some((value) => value.includes(WEB_STYLESHEET_HREF)));
  assert.ok(result.additions.some((value) => value.includes(WEB_SCRIPT_SRC)));
});

test("Web CSS 覆盖手机、Pad、学习页和满屏阅读器", async () => {
  const css = await readFile("public/web.css", "utf8");
  const script = await readFile("public/web-ui.js", "utf8");
  const worker = await readFile("worker/index.js", "utf8");
  assert.match(css, /@media \(max-width: 599px\)/u);
  assert.match(css, /@media \(min-width: 768px\)/u);
  assert.match(css, /\.study-screen[\s\S]*overflow: visible/u);
  assert.match(css, /height: 100dvh/u);
  assert.match(css, /\.book-size-48 \.book-page-text/u);
  assert.match(script, /orientationchange/u);
  assert.match(script, /window\.location\.reload/u);
  assert.match(worker, /adaptResponseForWeb/u);
  assert.match(worker, /"\/web\.css", "\/web-ui\.js"/u);
});

test("Web 卡片和底部导航不会从零字号父容器继承出零字号", async () => {
  const css = await readFile("public/web.css", "utf8");
  assert.match(css, /body\.ui-size-medium \.tile-grid \.home-tile \{ font-size: 18px; \}/u);
  assert.match(css, /body\.ui-size-medium nav a \{ font-size: 18px; \}/u);
  assert.doesNotMatch(css, /\.tile-grid \.home-tile[\s\S]{0,420}font-size: 1em;/u);
});

test("手机阅读顶部栏压缩字号控件并把进度拆成两行", async () => {
  const css = await readFile("public/web.css", "utf8");
  assert.match(css, /td\.font-controls \{[\s\S]*?width: 38%;[\s\S]*?font-size: 0;/u);
  assert.match(css, /\.font-controls \.font-size-current \{[\s\S]*?min-width: 32px;[\s\S]*?font-size: 14px;/u);
  assert.match(css, /\.reader-progress-cell span \{[\s\S]*?display: block;[\s\S]*?font-size: 10px;/u);
});

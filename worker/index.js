import { planSession } from "../src/domain/learning-engine.mjs";
import { pbkdf2 as nodePbkdf2 } from "node:crypto";

import { availableActivities } from "../src/domain/lexicon.mjs";
import { paginateChapter, paginateChapterForScreen, parseBookChapters } from "../src/domain/reading-format.mjs";
import { createKindleJpegThumbnail } from "../src/platform/cover-thumbnail.mjs";
import { D1Repository } from "../src/platform/d1-repository.mjs";

const COOKIE_DEVICE = "modu_device_session";
const COOKIE_ADMIN = "modu_admin_session";
const COOKIE_ACCOUNT = "modu_account_session";
const COOKIE_TEST = "modu_cookie_test";
const COOKIE_TEST_CSRF = "modu_test_csrf";
const SESSION_MAX_AGE = 60 * 60 * 24 * 180;
// Cloudflare Workers currently rejects PBKDF2 iteration counts above 100,000.
const PASSWORD_ITERATIONS = 100000;
const KINDLE_SAFE_QUESTION_TYPES = [
  "choice_en_zh", "choice_zh_en", "grammar_choice", "phrase_choice",
  "sentence_fill", "tense_choice", "true_false",
];
const NO_STORE = {
  "cache-control": "private, no-store, max-age=0",
  "content-type": "text/html; charset=utf-8",
  "referrer-policy": "same-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
};

const MODU_CORE_COLLECTION = "modu_core_500";
const MODU_BATCH_SIZES = [7, 14, 21, 28];
const WEATHER_CITIES = Object.freeze([
  { id: "kunming", name: "昆明", province: "云南", latitude: 25.0389, longitude: 102.7183 },
  { id: "beijing", name: "北京", province: "北京", latitude: 39.9042, longitude: 116.4074 },
  { id: "shanghai", name: "上海", province: "上海", latitude: 31.2304, longitude: 121.4737 },
  { id: "guangzhou", name: "广州", province: "广东", latitude: 23.1291, longitude: 113.2644 },
  { id: "shenzhen", name: "深圳", province: "广东", latitude: 22.5431, longitude: 114.0579 },
  { id: "chengdu", name: "成都", province: "四川", latitude: 30.5728, longitude: 104.0668 },
  { id: "chongqing", name: "重庆", province: "重庆", latitude: 29.563, longitude: 106.5516 },
  { id: "hangzhou", name: "杭州", province: "浙江", latitude: 30.2741, longitude: 120.1551 },
  { id: "nanjing", name: "南京", province: "江苏", latitude: 32.0603, longitude: 118.7969 },
  { id: "wuhan", name: "武汉", province: "湖北", latitude: 30.5928, longitude: 114.3055 },
  { id: "xian", name: "西安", province: "陕西", latitude: 34.3416, longitude: 108.9398 },
  { id: "changsha", name: "长沙", province: "湖南", latitude: 28.2282, longitude: 112.9388 },
  { id: "zhengzhou", name: "郑州", province: "河南", latitude: 34.7466, longitude: 113.6254 },
  { id: "qingdao", name: "青岛", province: "山东", latitude: 36.0671, longitude: 120.3826 },
  { id: "xiamen", name: "厦门", province: "福建", latitude: 24.4798, longitude: 118.0894 },
  { id: "fuzhou", name: "福州", province: "福建", latitude: 26.0745, longitude: 119.2965 },
  { id: "haikou", name: "海口", province: "海南", latitude: 20.044, longitude: 110.1999 },
  { id: "lhasa", name: "拉萨", province: "西藏", latitude: 29.652, longitude: 91.1721 },
  { id: "urumqi", name: "乌鲁木齐", province: "新疆", latitude: 43.8256, longitude: 87.6168 },
  { id: "harbin", name: "哈尔滨", province: "黑龙江", latitude: 45.8038, longitude: 126.5349 },
]);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function parseCookies(request) {
  const result = {};
  for (const pair of (request.headers.get("cookie") || "").split(";")) {
    const index = pair.indexOf("=");
    if (index < 0) continue;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (key) result[key] = decodeURIComponent(value);
  }
  return result;
}

function randomToken(bytes = 32) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function passwordDigest(password, salt, iterations = PASSWORD_ITERATIONS) {
  return new Promise((resolve, reject) => {
    nodePbkdf2(String(password), String(salt), Number(iterations), 32, "sha256", (error, derivedKey) => {
      if (error) reject(error);
      else resolve(bytesToHex(derivedKey));
    });
  });
}

function normalizeAccountName(raw) {
  const display = String(raw || "").normalize("NFKC").trim();
  if ([...display].length < 2 || [...display].length > 32) return { error: "用户名长度必须为 2 至 32 个字符。" };
  if (/\s|[<>/\\]|[\u0000-\u001f\u007f]/u.test(display)) return { error: "用户名不能包含空格、斜线或控制字符。" };
  if (display.toLocaleLowerCase("en-US") === "admin") return { error: "该用户名为系统保留名称。" };
  return { display, normalized: display.toLocaleLowerCase("en-US") };
}

function validatePassword(raw) {
  const value = String(raw || "");
  if (value.length < 6 || value.length > 72) return { error: "密码长度必须为 6 至 72 个字符。" };
  if (/[\u0000-\u001f\u007f]/u.test(value)) return { error: "密码不能包含控制字符。" };
  return { value };
}

function accountCookie(token) {
  // SameSite is intentionally omitted for the Kindle 3 browser. Its WebKit
  // cookie parser predates that attribute and may reject the entire cookie.
  return `${COOKIE_ACCOUNT}=${encodeURIComponent(token)}; Path=/; Max-Age=${60 * 60 * 24 * 30}; HttpOnly; Secure`;
}

function clearAccountCookie() {
  return `${COOKIE_ACCOUNT}=; Path=/; Max-Age=0; HttpOnly; Secure`;
}

function fontScaleConfig(value) {
  const configs = {
    standard: { label: "标准", pixels: 24 },
    large: { label: "大", pixels: 26 },
    extra_large: { label: "加大", pixels: 28 },
    extra_extra_large: { label: "最大", pixels: 30 },
  };
  return configs[value] || configs.standard;
}

const READING_PAGINATION_VERSION = 5;
const STORED_PAGE_TARGETS = Object.freeze({ small: 520, medium: 420, large: 320 });

function v2FontTarget(value) {
  return {
    standard: 150,
    large: 125,
    extra_large: 105,
    extra_extra_large: 90,
  }[value] || 150;
}

function legacyFontTarget(value) {
  return {
    standard: 720,
    large: 590,
    extra_large: 460,
    extra_extra_large: 370,
  }[value] || 460;
}

function lineSpacingConfig(value) {
  const configs = {
    compact: { label: "紧凑", value: 1.3 },
    standard: { label: "标准", value: 1.4 },
    comfortable: { label: "舒适", value: 1.48 },
  };
  return configs[value] || configs.comfortable;
}

function readingClientProfile(request) {
  const userAgent = request?.headers?.get("user-agent") || "";
  const kindle = /kindle|silk|kftt|kfjwa|kfsowi|kfmewi|kfuawi/iu.test(userAgent);
  const legacyKindle = /Kindle\/3\.0/iu.test(userAgent) || /AppleWebKit\/53[01]/iu.test(userAgent);
  const viewportParam = (() => {
    try {
      return new URL(request.url).searchParams.get("vp") || "";
    } catch {
      return "";
    }
  })();
  const viewportCookie = parseCookies(request || new Request("https://modu.invalid"))["modu_reader_viewport"] || "";
  const viewportMatch = (viewportParam || viewportCookie).match(/^(\d{3,4})x(\d{3,4})$/u);
  return {
    kind: kindle ? "kindle" : "browser",
    legacyKindle,
    shelfPageSize: 12,
    viewportWidth: viewportMatch ? Number(viewportMatch[1]) : (kindle ? 600 : 760),
    viewportHeight: viewportMatch ? Number(viewportMatch[2]) : (kindle ? 860 : 986),
    viewportValue: viewportMatch ? `${Number(viewportMatch[1])}x${Number(viewportMatch[2])}` : "",
  };
}

function readingPageLayout(scale, lineSpacing, profile) {
  const pixels = readingDisplayPixels(scale, profile);
  const lineHeight = lineSpacingConfig(lineSpacing).value;
  const usableWidth = Math.max(320, Math.min(690, Number(profile?.viewportWidth || 600) - 28));
  // 100vh already excludes the device browser chrome. Reading mode uses only
  // the fixed bottom controls on every screen size.
  const chromeHeight = 62;
  const usableHeight = Math.max(400, Number(profile?.viewportHeight || 860) - chromeHeight);
  const lines = Math.max(9, Math.floor(usableHeight / (pixels * lineHeight)));
  // Narrow Kindle columns need a small font-metric safety factor. Wider
  // screens fit one nominal CJK glyph per CSS font-size unit and can use the
  // extra column without leaving a blank line above the controls.
  const glyphWidthFactor = usableWidth < 580 ? 1.05 : 1;
  const charactersPerLine = Math.max(11, Math.floor(usableWidth / (pixels * glyphWidthFactor)));
  return {
    charactersPerLine,
    linesPerPage: lines,
    target: Math.max(145, Math.min(520, Math.floor(lines * charactersPerLine * .82))),
  };
}

function readingPageTarget(scale, lineSpacing, profile) {
  return readingPageLayout(scale, lineSpacing, profile).target;
}

function readingDisplayPixels(scale, profile) {
  return fontScaleConfig(scale).pixels;
}

function textOffsetForPage(pages, pageNumber) {
  return pages.slice(0, Math.max(0, pageNumber - 1))
    .reduce((sum, page) => sum + String(page || "").length + 2, 0);
}

function pageForTextOffset(pages, textOffset) {
  const targetOffset = Math.max(0, Number(textOffset || 0));
  let offset = 0;
  for (let index = 0; index < pages.length; index += 1) {
    const nextOffset = offset + String(pages[index] || "").length + 2;
    if (targetOffset < nextOffset) return index + 1;
    offset = nextOffset;
  }
  return Math.max(1, pages.length);
}

function viewportCalibrationScript() {
  return `<script>(function(){
    var root=document.documentElement;
    var main=document.getElementsByTagName('main')[0];
    var rawW=root.clientWidth||window.innerWidth||0;
    var rawH=root.clientHeight||window.innerHeight||0;
    if(!rawW||!rawH)return;
    var ua=navigator.userAgent||'';
    var oldKindle=/Kindle\\/3\\.0|AppleWebKit\\/53[01]/i.test(ua);
    var screenW=window.screen&&screen.width?Number(screen.width):rawW;
    var ratio=oldKindle&&screenW>0&&rawW>screenW*1.12?screenW/rawW:1;
    var physicalW=Math.round(rawW*ratio);
    var physicalH=Math.round(rawH*ratio);

    /* Kindle 3 lays pages out near 980 CSS pixels and then shrinks the whole
       document. Scale the one-screen reading surfaces back to the physical
       e-ink width using only WebKit 531-era properties. */
    if(oldKindle&&ratio<.95&&main&&(/reader-shell|shelf-shell/.test(main.className))){
      main.style.width=physicalW+'px';
      main.style.maxWidth='none';
      main.style.height=physicalH+'px';
      main.style.webkitTransform='scale('+(1/ratio)+')';
      main.style.webkitTransformOrigin='0 0';
      document.body.style.width=rawW+'px';
      document.body.style.height=rawH+'px';
      document.body.style.overflow='hidden';
    }
    var page=main&&main.querySelector?main.querySelector('.reader-page'):null;
    var readerBar=main&&main.querySelector?main.querySelector('.reader-bottom-bar'):null;
    var shelfGrid=main&&main.querySelector?main.querySelector('.book-grid'):null;
    var shelfBar=main&&main.querySelector?main.querySelector('.shelf-pager'):null;
    var barHeight=62;
    if(page)page.style.height=Math.max(300,physicalH-barHeight)+'px';
    if(readerBar){readerBar.style.position='absolute';readerBar.style.height=barHeight+'px';}
    if(shelfGrid)shelfGrid.style.height=Math.max(220,physicalH-182)+'px';
    if(shelfBar)shelfBar.style.position='absolute';

    var value=physicalW+'x'+physicalH;
    var match=window.location.search.match(/[?&]vp=(\\d{3,4}x\\d{3,4})(?:&|$)/);
    if(match&&match[1]===value)return;
    var href=window.location.href;
    if(match)href=href.replace(/([?&])vp=\\d{3,4}x\\d{3,4}(?=&|$)/,'$1vp='+value);
    else href=href+(window.location.search?'&':'?')+'vp='+value;
    window.location.replace(href);
  }());</script>`;
}

function readingHref(path, profile) {
  if (!profile?.viewportValue) return path;
  const url = new URL(path, "https://modu.invalid");
  url.searchParams.set("vp", profile.viewportValue);
  return `${url.pathname}${url.search}`;
}

function redirect(location, headers = {}) {
  return new Response(null, {
    status: 303,
    headers: { location, ...headers },
  });
}

function kunmingNow() {
  const date = new Date();
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return formatter.format(date).replace(" 24:", " 00:");
}

function kunmingDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function learningStreak(dateRows) {
  const learned = new Set((dateRows || []).map((row) => String(row.stat_date)));
  let cursor = new Date(`${kunmingDateKey()}T12:00:00+08:00`);
  let streak = 0;
  for (let index = 0; index < 366; index += 1) {
    const key = kunmingDateKey(cursor);
    if (!learned.has(key)) break;
    streak += 1;
    cursor = new Date(cursor.getTime() - 86400000);
  }
  return streak;
}

function greetingForNow(date = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai", hour: "2-digit", hour12: false,
  }).format(date));
  if (hour < 6) return "夜深了";
  if (hour < 11) return "早上好";
  if (hour < 13) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

function iconSvg(name, label = "") {
  const paths = {
    book: '<path d="M4 5c4-2 7-1 8 1v14c-1-2-4-3-8-1zM20 5c-4-2-7-1-8 1v14c1-2 4-3 8-1z"/>',
    words: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M7 16l3-8 3 8M8 13h4M15 9h4M17 9v7"/>',
    task: '<rect x="5" y="4" width="14" height="17" rx="1"/><path d="M9 4V2h6v2M8 10l2 2 4-4M8 16h7"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-5 4-7 8-7s7 2 8 7"/>',
    display: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 16l3-8 3 8M8 13h4M15 9h4M17 9v7"/>',
    family: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="10" r="2.5"/><path d="M3 20c1-5 3-7 6-7s6 2 7 7M15 14c3 0 5 2 6 6"/>',
    logout: '<path d="M10 4H4v16h6M14 8l4 4-4 4M18 12H8"/>',
    location: '<path d="M12 22s7-7 7-13a7 7 0 10-14 0c0 6 7 13 7 13z"/><circle cx="12" cy="9" r="2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3M4 4l2 2M18 18l2 2M20 4l-2 2M6 18l-2 2"/>',
    cloud: '<path d="M6 18h12a4 4 0 000-8 6 6 0 00-11-2A5 5 0 006 18z"/>',
    rain: '<path d="M6 15h12a4 4 0 000-8 6 6 0 00-11-2A5 5 0 006 15zM8 18l-1 3M13 18l-1 3M18 18l-1 3"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    next: '<path d="M9 5l7 7-7 7"/>',
    search: '<circle cx="10" cy="10" r="6"/><path d="M15 15l6 6"/>',
    settings: '<path d="M6 3v18M12 3v18M18 3v18"/><circle cx="6" cy="9" r="2"/><circle cx="12" cy="15" r="2"/><circle cx="18" cy="7" r="2"/>',
  };
  const content = paths[name] || paths.book;
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="${label ? "false" : "true"}"${label ? ` aria-label="${escapeHtml(label)}"` : ""} fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${content}</svg>`;
}

function productFooter() {
  return '<footer class="product-footer">墨读　·　让阅读与学习成为日常<br><span>© 2026 墨读项目组</span></footer>';
}

function interactionFeedbackScript() {
  return `<script>(function(){
    function markLink(link){
      if(!link||link.getAttribute('data-no-loading')==='1')return;
      link.onclick=function(){
        if(this.id==='next-page'||this.id==='prev-page')this.innerHTML='翻页中…';
        else this.innerHTML='正在跳转…';
        this.className=(this.className?this.className+' ':'')+'is-loading';
      };
    }
    var links=document.querySelectorAll('nav a,.button,.home-tile,.menu-card,.small-action,.book-cover-link,.shelf-tab,.top-link,.reader-bottom-item a,.shelf-pager a,.reader-context a');
    for(var i=0;i<links.length;i+=1)markLink(links[i]);
    var forms=document.getElementsByTagName('form');
    for(var j=0;j<forms.length;j+=1){forms[j].onsubmit=function(){
      var buttons=this.querySelectorAll('button,input[type="submit"]');
      for(var k=0;k<buttons.length;k+=1){
        if(buttons[k].tagName==='INPUT')buttons[k].value='正在提交…';else buttons[k].innerHTML='正在提交…';
        buttons[k].className=(buttons[k].className?buttons[k].className+' ':'')+'is-loading';
      }
    };}
  })();</script>`;
}

function baseStyles() {
  return `
    * { box-sizing: border-box; }
    html { background: #fff; color: #161616; font-family: Arial, "Microsoft YaHei", sans-serif; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
    body { margin: 0; background: #fff; color: #161616; font-size: 30px; line-height: 1.48; }
    main { width: 100%; max-width: 780px; margin: 0 auto; padding: 24px 24px 38px; }
    h1 { margin: 0 0 20px; font-size: 40px; line-height: 1.22; }
    h2 { margin: 26px 0 14px; font-size: 30px; line-height: 1.3; }
    h3 { margin: 24px 0 10px; font-size: 26px; }
    p { margin: 12px 0; }
    a { color: #111; text-decoration: underline; text-underline-offset: 3px; }
    .icon { width: 1.45em; height: 1.45em; vertical-align: -.34em; }
    .brand { border-bottom: 2px solid #111; margin-bottom: 22px; padding-bottom: 13px; text-align: center; }
    .brand strong { display: block; font-size: 34px; letter-spacing: .08em; }
    .brand .muted { display: block; margin-top: 3px; }
    .muted { color: #444; font-size: 24px; }
    .notice { border: 2px solid #111; margin: 15px 0; padding: 10px 12px; font-weight: bold; }
    .warning { border: 3px double #111; margin: 15px 0; padding: 10px 12px; }
    .card { border: 1px solid #777; border-radius: 9px; margin: 16px 0; padding: 18px; background: #fff; }
    .topbar { display: table; width: 100%; margin: 0 0 20px; }
    .topbar-brand, .topbar-actions { display: table-cell; vertical-align: bottom; }
    .topbar-brand strong { display: block; font-size: 42px; line-height: 1.1; letter-spacing: .04em; }
    .topbar-brand span { display: block; margin-top: 6px; color: #333; font-size: 20px; }
    .topbar-actions { text-align: right; white-space: nowrap; }
    .top-link { display: inline-block; min-height: 48px; margin-left: 20px; padding: 7px 2px; text-decoration: none; }
    .weather-strip { display: table; width: 100%; min-height: 92px; border: 1px solid #777; border-radius: 9px; margin: 0 0 24px; padding: 13px 18px; }
    .weather-cell { display: table-cell; width: 33.33%; vertical-align: middle; }
    .weather-cell:nth-child(2) { text-align: center; font-size: 28px; font-weight: bold; }
    .weather-cell:last-child { text-align: right; font-size: 19px; }
    .weather-location { display: inline-block; min-height: 48px; padding: 8px 4px; font-weight: bold; text-decoration: none; }
    .weather-note { display: block; color: #555; font-size: 16px; }
    .greeting { margin: 0 0 15px; font-size: 28px; }
    .tile-grid, .book-grid { margin: -1%; font-size: 0; }
    .home-tile, .book-card { display: inline-block; width: 48%; margin: 1%; vertical-align: top; font-size: 26px; }
    .home-tile { position: relative; min-height: 190px; border: 1px solid #777; border-radius: 9px; padding: 22px; text-decoration: none; }
    .home-tile h2 { margin: 0 0 5px; font-size: 31px; }
    .home-tile .tile-icon { display: inline-block; width: 50px; }
    .home-tile .tile-copy { display: inline-block; width: 74%; vertical-align: top; }
    .home-tile .tile-arrow { position: absolute; top: 23px; right: 18px; }
    .home-tile .tile-status { position: absolute; left: 22px; bottom: 18px; max-width: 84%; border: 1px solid #aaa; border-radius: 5px; padding: 4px 10px; font-size: 18px; }
    .today-summary { margin-top: 22px; border: 1px solid #777; border-radius: 9px; }
    .summary-head { border-bottom: 1px solid #aaa; padding: 12px 18px; }
    .summary-head strong { font-size: 25px; }
    .summary-head a { float: right; font-size: 18px; text-decoration: none; }
    .summary-row { display: table; width: 100%; padding: 14px 4px; }
    .summary-item { display: table-cell; width: 33.33%; border-right: 1px solid #ccc; text-align: center; }
    .summary-item:last-child { border-right: 0; }
    .summary-item strong { display: block; font-size: 34px; }
    .summary-item span { font-size: 18px; }
    .product-footer { border-top: 1px solid #bbb; margin-top: 24px; padding-top: 12px; color: #555; text-align: center; font-size: 16px; }
    .product-footer span { font-size: 14px; }
    .menu-card { position: relative; display: block; min-height: 108px; padding: 22px 62px 18px 92px; text-decoration: none; }
    .menu-card .menu-icon { position: absolute; left: 26px; top: 25px; font-size: 28px; }
    .menu-card .menu-arrow { position: absolute; right: 24px; top: 36px; }
    .menu-card strong { display: block; font-size: 28px; }
    .account-card { min-height: 120px; padding-left: 28px; }
    .account-card strong { font-size: 30px; }
    .shelf-head { display: table; width: 100%; margin-bottom: 16px; }
    .shelf-title, .shelf-actions { display: table-cell; vertical-align: middle; }
    .shelf-actions { text-align: right; }
    .shelf-tabs { border: 1px solid #777; border-radius: 9px; margin-bottom: 16px; white-space: nowrap; }
    .shelf-tab { display: inline-block; width: 33.33%; min-height: 54px; padding: 11px 4px; text-align: center; text-decoration: none; }
    .shelf-tab.active { border-bottom: 4px solid #111; font-weight: bold; }
    .book-card { min-height: 295px; border: 1px solid #888; border-radius: 8px; padding: 14px; }
    .book-cover-link { display: inline-block; width: 39%; min-height: 176px; vertical-align: top; text-decoration: none; }
    .book-cover { display: block; width: 100%; max-height: 190px; border: 1px solid #888; object-fit: cover; }
    .book-meta { display: inline-block; width: 58%; padding-left: 13px; vertical-align: top; font-size: 18px; }
    .book-meta h2 { margin: 1px 0 6px; font-size: 23px; }
    .book-actions { margin-top: 10px; white-space: nowrap; }
    .small-action { display: inline-block; min-height: 42px; border: 1px solid #777; border-radius: 4px; margin: 0 7px 0 0; padding: 5px 12px; background: #fff; color: #111; font: 18px/1.5 Arial, sans-serif; text-align: center; text-decoration: none; }
    form.inline-form { display: inline; margin: 0; }
    form.inline-form button { display: inline-block; width: auto; min-height: 42px; margin: 0; border-width: 1px; border-radius: 4px; padding: 5px 10px; font-size: 18px; }
    .reader-shell { position: relative; max-width: 820px; height: 100vh; overflow: hidden; padding: 0 22px 10px; }
    .reader-toolbar { display: table; width: calc(100% + 44px); margin-left: -22px; border-bottom: 1px solid #999; padding: 8px 18px; }
    .reader-tool { display: table-cell; vertical-align: middle; }
    .reader-tool:first-child { width: 40%; }
    .reader-tool:nth-child(2) { width: 35%; }
    .reader-tool:last-child { width: 25%; }
    .reader-tool:nth-child(2) { font-weight: bold; text-align: center; }
    .reader-tool:last-child { text-align: right; }
    .reader-tool a { display: inline-block; min-height: 46px; padding: 6px; text-decoration: none; }
    .reader-heading { margin: 12px 0 10px; text-align: center; }
    .reader-heading h1 { margin: 0 0 5px; font-size: 38px; }
    .reader-rule { display: inline-block; width: 54px; border-top: 2px solid #555; }
    .reader-body { max-width: 700px; height: calc(100vh - 270px); overflow: hidden; margin: 0 auto; font-family: Georgia, "Noto Serif CJK SC", "Songti SC", serif; text-align: justify; }
    .reader-body.with-heading { height: calc(100vh - 335px); }
    .reader-body p { margin: 0 0 .48em; text-indent: 2em; }
    .reader-hint { margin: 4px 0; color: #555; text-align: center; font-size: 20px; }
    .pager { display: table; width: 100%; border: 1px solid #555; border-radius: 5px; }
    .pager-cell { display: table-cell; width: 33.33%; border-right: 1px solid #777; vertical-align: middle; text-align: center; }
    .pager-cell:last-child { border-right: 0; }
    .pager-cell a, .pager-cell span { display: block; min-height: 76px; padding: 17px 6px; font-size: 26px; font-weight: bold; text-decoration: none; }
    .pager-cell a:active { background: #111; color: #fff; }
    .shelf-shell { position: relative; max-width: 760px; height: 100vh; overflow: hidden; padding: 12px 14px 64px; }
    .shelf-shell .shelf-head { height: 62px; margin-bottom: 3px; }
    .shelf-shell .shelf-title h1 { margin: 0; font-size: 30px; }
    .shelf-shell .shelf-title p { margin: 1px 0 0; font-size: 16px; }
    .shelf-shell .top-link { min-height: 40px; margin-left: 10px; padding: 3px 1px; font-size: 18px; }
    .shelf-shell .shelf-tabs { height: 38px; margin-bottom: 6px; border-width: 0 0 1px; border-radius: 0; }
    .shelf-shell .shelf-tab { min-height: 38px; padding: 4px 3px; font-size: 17px; }
    .shelf-shell .shelf-tab.active { border-bottom-width: 2px; }
    .shelf-shell .book-grid { height: calc(100vh - 182px); margin: 0 -4px; overflow: hidden; }
    .shelf-shell .book-card { width: 25%; min-height: 0; margin: 0; border: 0; border-radius: 0; padding: 5px 5px 8px; font-size: 16px; }
    .shelf-shell .book-cover-link { display: block; width: 100%; min-height: 0; }
    .shelf-shell .book-cover { height: 158px; max-height: none; background: #eee; object-fit: cover; }
    .shelf-shell .book-meta { display: block; width: 100%; min-height: 42px; padding: 5px 1px 0; line-height: 1.25; }
    .shelf-shell .book-meta h2 { height: 2.5em; margin: 0; overflow: hidden; font-size: 16px; font-weight: normal; line-height: 1.25; }
    .shelf-shell .book-meta h2 a { text-decoration: none; }
    .shelf-pager { position: fixed; z-index: 3; right: 0; bottom: 0; left: 0; display: table; width: 100%; max-width: 760px; height: 58px; margin: 0 auto; border-top: 1px solid #999; background: #fff; table-layout: fixed; }
    .shelf-pager-cell { display: table-cell; width: 50%; vertical-align: middle; text-align: center; }
    .shelf-pager-cell a, .shelf-pager-cell span { display: block; min-height: 58px; padding: 13px 6px; font-size: 20px; font-weight: normal; text-decoration: none; }
    .shelf-pager-cell a:active { background: #111; color: #fff; }
    .reader-shell { position: relative; max-width: 760px; height: 100vh; overflow: hidden; padding: 0 14px 64px; }
    .reader-context { display: none; }
    .reader-context-item { display: table-cell; overflow: hidden; padding: 7px 2px; vertical-align: middle; font-size: 17px; white-space: nowrap; text-overflow: ellipsis; }
    .reader-context-item:first-child { width: 35%; }
    .reader-context-item:nth-child(2) { width: 45%; text-align: center; }
    .reader-context-item:last-child { width: 20%; text-align: right; }
    .reader-context a { display: block; min-height: 34px; padding: 2px; text-decoration: none; }
    .reader-page { position: relative; height: calc(100vh - 62px); overflow: hidden; }
    .reader-page-heading { margin: 10px 0 8px; text-align: center; }
    .reader-page-heading h1 { margin: 0; font-size: 25px; line-height: 1.25; }
    .reader-page-heading .reader-rule { width: 38px; }
    .reader-page-body { height: 100%; overflow: hidden; margin: 0 auto; font-family: Georgia, "Songti SC", serif; text-align: justify; word-break: normal; overflow-wrap: break-word; }
    .reader-page.has-heading .reader-page-body { height: calc(100% - 51px); }
    .reader-page-body p { margin: 0 0 .22em; text-indent: 2em; }
    .reader-page-number { display: none; }
    .reader-bottom-bar { position: fixed; z-index: 5; right: 0; bottom: 0; left: 0; display: table; width: 100%; max-width: 760px; height: 62px; margin: 0 auto; border-top: 1px solid #777; background: #fff; table-layout: fixed; }
    .reader-bottom-item { display: table-cell; width: 20%; border-right: 1px solid #ddd; vertical-align: middle; text-align: center; }
    .reader-bottom-item:last-child { border-right: 0; }
    .reader-bottom-item a, .reader-bottom-item span { display: block; min-height: 62px; padding: 15px 2px; font-size: 18px; font-weight: normal; text-decoration: none; }
    .reader-bottom-item a:active { background: #111; color: #fff; }
    .reader-bottom-item.disabled span { color: #888; font-weight: normal; }
    .reader-browser { max-width: 760px; }
    .reader-browser .reader-page-body { max-width: 690px; }
    .reader-kindle .reader-page, .reader-browser .reader-page { height: calc(100vh - 62px); }
    .button, button, input[type="submit"] {
      display: block; width: 100%; min-height: 68px; margin: 15px 0;
      border: 2px solid #111; border-radius: 5px; background: #fff; color: #111;
      font: bold 24px/1.3 Arial, "Microsoft YaHei", sans-serif; text-align: center;
      text-decoration: none; padding: 16px 12px; cursor: pointer;
    }
    button:active, input[type="submit"]:active, .button:active { color: #fff; background: #111; }
    input[type="text"], input[type="password"], input[type="number"], textarea, select {
      width: 100%; min-height: 58px; border: 2px solid #222;
      border-radius: 3px; background: #fff; color: #111; font: 23px/1.45 Arial, "Microsoft YaHei", sans-serif;
      padding: 10px 12px;
    }
    label { display: block; margin-top: 16px; font-weight: bold; }
    fieldset { border: 2px solid #222; margin: 18px 0; padding: 12px; }
    legend { padding: 0 8px; font-weight: bold; }
    .radio-line { display: block; min-height: 56px; padding: 12px 2px; font-weight: normal; }
    input[type="radio"], input[type="checkbox"] { width: 32px; height: 32px; vertical-align: middle; }
    nav { border-top: 1px solid #999; margin-top: 22px; padding-top: 10px; text-align: center; font-size: 0; line-height: 1.25; }
    nav a { display: inline-block; min-width: 42%; min-height: 66px; border: 2px solid #111; border-radius: 5px; margin: 6px 2%; padding: 14px 10px; background: #fff; font-size: 26px; font-weight: bold; text-align: center; text-decoration: none; vertical-align: middle; }
    nav a:only-child { min-width: 68%; }
    .is-loading { background: #111 !important; color: #fff !important; }
    .study-screen { height: 100vh; overflow: hidden; padding-top: 14px; padding-bottom: 10px; }
    .study-screen .brand { display: none; }
    .study-screen h1 { margin: 8px 0 10px; font-size: 44px; }
    .study-screen h2 { margin: 8px 0 6px; }
    .study-screen p { margin: 6px 0; }
    .study-screen .current-user { margin: 0 0 7px; padding: 2px 0; }
    .study-screen .card { margin: 8px 0; padding: 10px 14px; }
    .study-screen fieldset { margin: 8px 0; padding: 5px 12px; }
    .study-screen .radio-line { display: block; min-height: 54px; padding: 6px 2px; }
    .study-screen .button, .study-screen button, .study-screen input[type="submit"] { min-height: 62px; margin: 8px 0; padding: 12px; }
    .study-screen nav { margin-top: 8px; padding-top: 5px; }
    .study-screen nav a { min-height: 58px; margin-top: 3px; margin-bottom: 3px; padding: 10px 8px; }
    .study-actions { display: table; width: 100%; border-spacing: 8px 0; }
    .study-actions .button, .study-actions form { display: table-cell; width: 50%; vertical-align: middle; }
    .study-actions form input[type="submit"] { margin: 0; }
    table { width: 100%; border-collapse: collapse; font-size: 22px; }
    th, td { border: 1px solid #777; padding: 9px; text-align: left; vertical-align: top; }
    th { background: #eee; }
    .line-thin { border-top: 1px solid #000; margin: 14px 0; }
    .line-thick { border-top: 5px solid #000; margin: 14px 0; }
    .gray-1 { background: #eee; padding: 8px; }
    .gray-2 { background: #bbb; padding: 8px; }
    .gray-3 { background: #777; color: #fff; padding: 8px; }
    .current-user { border-bottom: 1px solid #999; margin: 10px 0 18px; padding: 6px 0; font-weight: bold; }
    .compact-form { margin: 0; }
    .compact-form button { min-height: 64px; margin: 10px 0; font-size: 23px; padding: 14px; }
    .admin main { max-width: 1080px; font-size: 23px; }
    .admin .button, .admin button, .admin input[type="submit"] { min-height: 64px; font-size: 23px; padding: 15px; }
    .admin input[type="text"], .admin input[type="password"], .admin input[type="number"], .admin textarea, .admin select { min-height: 58px; font-size: 23px; }
    .admin-nav { border: 2px solid #111; padding: 12px 16px; line-height: 2.2; }
    .home-link { display: block; margin-top: 24px; text-align: center; font-weight: bold; }
    code { font-family: "Courier New", monospace; font-size: .9em; overflow-wrap: anywhere; }
    @media (max-width: 480px) {
      body { font-size: 28px; }
      main { padding: 18px 13px 32px; }
      h1 { font-size: 34px; }
      h2 { font-size: 28px; }
      .topbar-brand strong { font-size: 36px; }
      .top-link { margin-left: 10px; }
      .weather-strip { padding: 10px; }
      .home-tile { min-height: 180px; padding: 15px; }
      .home-tile h2 { font-size: 26px; }
      .home-tile .tile-status { left: 15px; bottom: 14px; max-width: 88%; font-size: 16px; }
      .book-card { padding: 10px; }
      .book-cover-link { min-height: 150px; }
      .book-meta { font-size: 20px; }
      .book-meta h2 { font-size: 24px; }
      .shelf-shell { padding-right: 8px; padding-left: 8px; }
      .shelf-shell .book-card { padding-right: 3px; padding-left: 3px; }
      .shelf-shell .book-cover { height: 132px; }
      .shelf-shell .book-meta { min-height: 37px; }
      .shelf-shell .book-meta h2 { font-size: 14px; }
      .reader-shell { padding-right: 11px; padding-left: 11px; }
      .reader-context-item { font-size: 15px; }
      .reader-bottom-item a, .reader-bottom-item span { font-size: 17px; }
      .admin table { font-size: 19px; }
    }
  `;
}

function layout({ title, body, nav = "", refresh = false, admin = false, extraHead = "", script = "", brand = true, pageClass = "" }) {
  const metaRefresh = refresh ? '<meta http-equiv="refresh" content="300">' : "";
  return `<!doctype html>
<html lang="zh-CN" class="${admin ? "admin" : "kindle"}">
<head>
  <meta charset="utf-8">
  <meta http-equiv="X-UA-Compatible" content="IE=Edge">
  <meta http-equiv="Cache-Control" content="no-transform">
  <meta http-equiv="Cache-Control" content="no-siteapp">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0, viewport-fit=cover">
  <meta name="format-detection" content="telephone=no,email=no,address=no,date=no">
  ${metaRefresh}
  <title>${escapeHtml(title)} · 墨读</title>
  <style>${baseStyles()}</style>
  ${extraHead}
</head>
<body>
<main class="${escapeHtml(pageClass)}">
  ${brand ? '<header class="brand"><strong>墨读</strong><span class="muted">Kindle 家庭轻量学习与阅读</span></header>' : ""}
  ${body}
  ${nav ? `<nav>${nav}</nav>` : ""}
</main>
${interactionFeedbackScript()}
${script}
</body>
</html>`;
}

function htmlResponse(page, status = 200, headers = {}) {
  return new Response(page, { status, headers: { ...NO_STORE, ...headers } });
}

function errorPage(status, title, message, nav = '<a href="/k">返回产品入口</a>') {
  return htmlResponse(layout({
    title,
    body: `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><p><a href="">重试</a></p>`,
    nav,
  }), status);
}

function adminNavigation() {
  return `<div class="admin-nav">
    <a href="/admin">总览</a> |
    <a href="/admin/reviews">注册与上架审核</a> |
    <a href="/admin/users">账户</a> |
    <a href="/admin/books">阅读内容</a> |
    <a href="/admin/assessments">单词考核库</a> |
    <a href="/admin/vocabulary">单词知识库</a> |
    <a href="/admin/plans">学习计划</a> |
    <a href="/admin/reports">学习报告</a> |
    <a href="/admin/access">访问统计</a> |
    <a href="/admin/imports">数据导入</a> |
    <a href="/admin/backup">备份</a> |
    <a href="/admin/devices">设备</a> |
    <a href="/admin/weather">天气</a> |
    <a href="/device-test">设备测试</a> |
    <a href="/admin/logout">退出登录</a>
  </div>`;
}

async function adminIdentity(request, env) {
  const secret = env.SESSION_SECRET;
  if (!secret) return null;
  const actual = parseCookies(request)[COOKIE_ADMIN] || "";
  const expected = await hmac(secret, "fixed-admin-session:v1");
  if (!safeEqual(actual, expected)) return null;
  const username = env.ADMIN_USERNAME || "admin";
  return { email: username, username };
}

async function adminCsrf(identity, env) {
  const secret = env.CSRF_SECRET || env.SESSION_SECRET;
  if (!secret) return null;
  return hmac(secret, `admin:${identity.email}`);
}

async function requireAdmin(request, env) {
  const identity = await adminIdentity(request, env);
  if (!identity) {
    const pathname = new URL(request.url).pathname;
    return {
      response: redirect(`/admin/login?return_to=${encodeURIComponent(pathname)}`),
    };
  }
  return { identity };
}

async function adminLogin(request, env, url) {
  const secret = env.CSRF_SECRET || env.SESSION_SECRET;
  const adminUsername = env.ADMIN_USERNAME;
  const adminPassword = env.ADMIN_PASSWORD;
  if (!secret || !env.SESSION_SECRET || !adminUsername || !adminPassword) {
    return errorPage(500, "系统设置未完成", "管理员账户尚未在本地环境中配置。");
  }
  const loginCsrf = await hmac(secret, "fixed-admin-login:v1");
  const returnToRaw = String(url.searchParams.get("return_to") || "/admin");
  const returnTo = returnToRaw.startsWith("/admin") && !returnToRaw.startsWith("//") ? returnToRaw : "/admin";
  if (request.method === "POST") {
    const form = await request.formData();
    if (!safeEqual(String(form.get("csrf_token") || ""), loginCsrf)) {
      return errorPage(403, "登录表单已过期", "请返回管理员登录页后重试。", '<a href="/admin/login">返回登录</a>');
    }
    const username = String(form.get("username") || "");
    const password = String(form.get("password") || "");
    if (!safeEqual(username, adminUsername) || !safeEqual(password, adminPassword)) {
      return redirect(`/admin/login?error=1&return_to=${encodeURIComponent(returnTo)}`);
    }
    const sessionToken = await hmac(env.SESSION_SECRET, "fixed-admin-session:v1");
    return redirect(returnTo, {
      "set-cookie": `${COOKIE_ADMIN}=${encodeURIComponent(sessionToken)}; Path=/admin; Max-Age=${60 * 60 * 24 * 30}; HttpOnly; Secure; SameSite=Strict`,
    });
  }
  return htmlResponse(layout({
    title: "管理员登录",
    admin: true,
    body: `<h1>管理员登录</h1>
      ${url.searchParams.get("error") === "1" ? '<div class="warning">用户名或密码错误，请重新输入。</div>' : ""}
      <form method="post" action="/admin/login?return_to=${encodeURIComponent(returnTo)}">
        <input type="hidden" name="csrf_token" value="${escapeHtml(loginCsrf)}">
        <label for="username">用户名</label>
        <input id="username" name="username" type="text" autocomplete="username" required>
        <label for="password">密码</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required>
        <input type="submit" value="登录管理员后台">
      </form>
      <p class="muted">管理员负责家长申请、读物上架和单词考核库审核。</p>`,
    nav: '<a href="/k">返回 Kindle 入口</a>',
  }));
}

function adminLogout() {
  return redirect("/admin/login", {
    "set-cookie": `${COOKIE_ADMIN}=; Path=/admin; Max-Age=0; HttpOnly; Secure; SameSite=Strict`,
  });
}

async function requireAdminPost(request, env, form) {
  const result = await requireAdmin(request, env);
  if (result.response) return result;
  const expected = await adminCsrf(result.identity, env);
  if (!expected) return { response: errorPage(500, "系统设置未完成", "管理表单密钥尚未配置。") };
  const actual = String(form.get("csrf_token") || "");
  if (!safeEqual(expected, actual)) {
    return { response: errorPage(403, "CSRF 校验失败", "表单已过期或来源不正确，请返回后重试。") };
  }
  return result;
}

async function accountAuthCsrf(env) {
  const secret = env.CSRF_SECRET || env.SESSION_SECRET;
  return secret ? hmac(secret, "account-auth:v1") : null;
}

async function getAccountIdentity(request, env) {
  const token = parseCookies(request)[COOKIE_ACCOUNT];
  if (!token) return null;
  const tokenHash = await sha256(token);
  return env.DB.prepare(`
    SELECT s.id AS account_session_id, s.csrf_token, s.expires_at,
      a.id AS account_id, a.user_id, a.username, a.normalized_username, a.role, a.status,
      u.household_id, u.display_name, u.status AS user_status
    FROM account_sessions s
    JOIN accounts a ON a.id = s.account_id
    LEFT JOIN users u ON u.id = a.user_id
    WHERE s.session_token_hash = ? AND s.expires_at > datetime('now')
      AND a.status = 'active'
    LIMIT 1
  `).bind(tokenHash).first();
}

async function createAccountSession(env, accountId) {
  const token = randomToken();
  const tokenHash = await sha256(token);
  const csrfToken = randomToken(24);
  await env.DB.prepare(`
    INSERT INTO account_sessions
      (id, account_id, session_token_hash, csrf_token, expires_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, datetime('now', '+30 days'), datetime('now'), datetime('now'))
  `).bind(crypto.randomUUID(), accountId, tokenHash, csrfToken).run();
  return { token, csrfToken };
}

async function verifyLegacyAccountPassword(env, username, password) {
  if (!env.LEGACY_AUTH_URL || !env.LEGACY_MIGRATION_SECRET) return false;
  try {
    const response = await fetch(env.LEGACY_AUTH_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-modu-migration-secret": env.LEGACY_MIGRATION_SECRET,
      },
      body: JSON.stringify({ username, password }),
    });
    return response.status === 204;
  } catch (error) {
    console.error("legacy_auth_failed", {
      name: String(error?.name || "Error").slice(0, 80),
    });
    return false;
  }
}

function safeAccountReturnTo(raw, fallback = "/k/home") {
  const value = String(raw || fallback);
  if ((value.startsWith("/k") || value.startsWith("/parent")) && !value.startsWith("//")) return value;
  return fallback;
}

async function accountEntryPage(env, url) {
  const weather = await weatherBlock(env);
  const notice = {
    logged_out: "你已安全退出。",
    registered: "注册成功，欢迎使用墨读。",
  }[url.searchParams.get("notice")] || "";
  return htmlResponse(layout({
    title: "登录或注册",
    refresh: true,
    body: `${weather}
      ${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ""}
      <h1>登录墨读</h1>
      <p>只有注册账户可以使用本产品。普通注册账户身份统一为“孩子”。</p>
      <a class="button" href="/k/login">已有账户，登录</a>
      <a class="button" href="/k/register">首次使用，注册</a>`,
    nav: '<a href="/device-test">设备测试</a>',
  }));
}

async function accountLogin(request, env, url, deviceSession) {
  const csrf = await accountAuthCsrf(env);
  if (!csrf || !env.SESSION_SECRET) return errorPage(500, "系统设置未完成", "账户登录密钥尚未配置。");
  const returnTo = safeAccountReturnTo(url.searchParams.get("return_to"));
  if (request.method === "POST") {
    const form = await request.formData();
    if (!safeEqual(String(form.get("csrf_token") || ""), csrf)) return errorPage(403, "登录表单已过期", "请返回登录页重试。");
    const name = normalizeAccountName(form.get("username"));
    const password = String(form.get("password") || "");
    const account = name.error ? null : await env.DB.prepare(`
      SELECT id, user_id, password_salt, password_hash, password_iterations, role, status
      FROM accounts WHERE normalized_username = ? LIMIT 1
    `).bind(name.normalized).first();
    let digest = "";
    let expectedDigest = account?.password_hash || "";
    if (account && Number(account.password_iterations) <= PASSWORD_ITERATIONS) {
      digest = await passwordDigest(password, account.password_salt, account.password_iterations);
    } else if (account && await verifyLegacyAccountPassword(env, name.normalized, password)) {
      const migratedSalt = randomToken(16);
      digest = await passwordDigest(password, migratedSalt, PASSWORD_ITERATIONS);
      await env.DB.prepare(`
        UPDATE accounts
           SET password_salt = ?, password_hash = ?, password_iterations = ?, updated_at = datetime('now')
         WHERE id = ? AND password_iterations > ?
      `).bind(migratedSalt, digest, PASSWORD_ITERATIONS, account.id, PASSWORD_ITERATIONS).run();
      expectedDigest = digest;
    }
    if (!account || account.status !== "active" || !safeEqual(digest, expectedDigest)) {
      return redirect(`/k/login?error=1&return_to=${encodeURIComponent(returnTo)}`);
    }
    await env.DB.prepare(`UPDATE accounts SET last_active_at = datetime('now') WHERE id = ?`).bind(account.id).run();
    const created = await createAccountSession(env, account.id);
    if (deviceSession && account.user_id) {
      await env.DB.prepare(`UPDATE device_sessions SET current_user_id = ?, updated_at = datetime('now') WHERE id = ?`)
        .bind(account.user_id, deviceSession.id).run();
    }
    return redirect(returnTo, { "set-cookie": accountCookie(created.token) });
  }
  return htmlResponse(layout({
    title: "账户登录",
    body: `<h1>账户登录</h1>
      ${url.searchParams.get("error") === "1" ? '<div class="warning">用户名或密码错误。</div>' : ""}
      <form method="post" action="/k/login?return_to=${encodeURIComponent(returnTo)}">
        <input type="hidden" name="csrf_token" value="${escapeHtml(csrf)}">
        <label for="username">用户名</label>
        <input id="username" name="username" type="text" maxlength="32" autocomplete="username" required>
        <label for="password">密码</label>
        <input id="password" name="password" type="password" maxlength="72" autocomplete="current-password" required>
        <input type="submit" value="登录">
      </form>`,
    nav: '<a href="/k/register">注册新账户</a> | <a href="/k">返回</a>',
  }));
}

async function accountRegister(request, env, url, deviceSession) {
  const csrf = await accountAuthCsrf(env);
  if (!csrf || !env.SESSION_SECRET) return errorPage(500, "系统设置未完成", "账户注册密钥尚未配置。");
  if (request.method === "GET") {
    return htmlResponse(layout({
      title: "注册孩子账户",
      body: `<h1>注册账户</h1>
        <p>注册后账户属性为“孩子”，用户名同时是家长绑定时使用的孩子/学生 ID。</p>
        <form method="post" action="/k/register">
          <input type="hidden" name="csrf_token" value="${escapeHtml(csrf)}">
          <label for="username">用户名 / 孩子学生 ID（2 至 32 个字符）</label>
          <input id="username" name="username" type="text" maxlength="32" autocomplete="username" required>
          <label for="password">密码（6 至 72 个字符）</label>
          <input id="password" name="password" type="password" maxlength="72" autocomplete="new-password" required>
          <label for="password_confirm">再次输入密码</label>
          <input id="password_confirm" name="password_confirm" type="password" maxlength="72" autocomplete="new-password" required>
          <input type="submit" value="注册并进入墨读">
        </form>`,
      nav: '<a href="/k/login">已有账户，登录</a> | <a href="/k">返回</a>',
    }));
  }
  const form = await request.formData();
  if (!safeEqual(String(form.get("csrf_token") || ""), csrf)) return errorPage(403, "注册表单已过期", "请返回注册页重试。");
  const name = normalizeAccountName(form.get("username"));
  if (name.error) return errorPage(400, "无法注册", name.error, '<a href="/k/register">返回注册</a>');
  const password = validatePassword(form.get("password"));
  if (password.error) return errorPage(400, "无法注册", password.error, '<a href="/k/register">返回注册</a>');
  if (!safeEqual(password.value, String(form.get("password_confirm") || ""))) {
    return errorPage(400, "无法注册", "两次输入的密码不一致。", '<a href="/k/register">返回注册</a>');
  }
  const household = await env.DB.prepare(`SELECT id FROM households WHERE status = 'active' ORDER BY created_at LIMIT 1`).first();
  if (!household) return errorPage(500, "家庭数据缺失", "数据库初始化尚未完成。");
  const existingAccount = await env.DB.prepare(`SELECT id FROM accounts WHERE normalized_username = ? LIMIT 1`).bind(name.normalized).first();
  if (existingAccount) return errorPage(409, "用户名已注册", "请直接登录，或更换用户名。", '<a href="/k/login">前往登录</a>');
  const legacyUser = await env.DB.prepare(`
    SELECT u.id FROM users u LEFT JOIN accounts a ON a.user_id = u.id
    WHERE u.household_id = ? AND u.normalized_name = ? AND u.status = 'active' AND a.id IS NULL
    LIMIT 1
  `).bind(household.id, name.normalized).first();
  const userId = legacyUser?.id || crypto.randomUUID();
  const accountId = crypto.randomUUID();
  const salt = randomToken(16);
  const digest = await passwordDigest(password.value, salt, PASSWORD_ITERATIONS);
  const statements = [];
  if (!legacyUser) {
    statements.push(
      env.DB.prepare(`INSERT INTO users
        (id, household_id, display_name, normalized_name, status, profile_type, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'active', 'child', datetime('now'), datetime('now'))`)
        .bind(userId, household.id, name.display, name.normalized),
      env.DB.prepare(`INSERT INTO user_preferences
        (id, user_id, reading_font_size, reading_font_scale, reading_line_spacing, created_at, updated_at)
        VALUES (?, ?, 'medium', 'standard', 'comfortable', datetime('now'), datetime('now'))`)
        .bind(crypto.randomUUID(), userId),
      env.DB.prepare(`INSERT INTO study_plans
        (id, user_id, name, daily_new_words, daily_review_words, daily_phrases, daily_grammar, status, created_at, updated_at)
        VALUES (?, ?, '系统默认计划', 10, 20, 5, 5, 'active', datetime('now'), datetime('now'))`)
        .bind(crypto.randomUUID(), userId),
    );
  }
  statements.push(
    env.DB.prepare(`INSERT INTO accounts
      (id, user_id, username, normalized_username, password_salt, password_hash, password_iterations, role, status, last_active_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'child', 'active', datetime('now'), datetime('now'), datetime('now'))`)
      .bind(accountId, userId, name.display, name.normalized, salt, digest, PASSWORD_ITERATIONS),
    env.DB.prepare(`UPDATE parent_child_bindings SET child_account_id = ? WHERE child_identifier = ? AND child_account_id IS NULL`)
      .bind(accountId, name.normalized),
  );
  if (deviceSession) {
    statements.push(env.DB.prepare(`UPDATE device_sessions SET current_user_id = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(userId, deviceSession.id));
  }
  await env.DB.batch(statements);
  const created = await createAccountSession(env, accountId);
  return redirect("/k/home?notice=registered", { "set-cookie": accountCookie(created.token) });
}

async function accountLogout(request, env) {
  const token = parseCookies(request)[COOKIE_ACCOUNT];
  if (token) await env.DB.prepare(`DELETE FROM account_sessions WHERE session_token_hash = ?`).bind(await sha256(token)).run();
  return redirect("/k?notice=logged_out", { "set-cookie": clearAccountCookie() });
}

function parentNavigation() {
  return `<div class="admin-nav">
    <a href="/parent">家长主页</a> |
    <a href="/parent/children">孩子/学生设定</a> |
    <a href="/parent/books">阅读物发布及管理</a> |
    <a href="/parent/assessments">单词模块管理</a>
  </div>`;
}

async function availableLearningCollections(env) {
  const result = await env.DB.prepare(`
    SELECT c.collection_id, c.name, c.description, c.collection_type,
      COUNT(m.word_id) AS word_count
    FROM modu_vocab_collections c
    LEFT JOIN modu_vocab_collection_members m ON m.collection_id = c.collection_id
    WHERE c.collection_id != 'modu_demo_28'
    GROUP BY c.collection_id
    HAVING COUNT(m.word_id) > 0
    ORDER BY
      CASE
        WHEN c.collection_id = 'modu_core_500' THEN 0
        WHEN c.collection_id LIKE 'modu_core_500_stage_%' THEN 1
        WHEN c.collection_id = 'pep_new_g6_s1' THEN 2
        ELSE 3
      END,
      c.collection_id
  `).all();
  return result.results || [];
}

function learningCollectionOptions(collections, selectedId) {
  return collections.map((collection) => `<option value="${escapeHtml(collection.collection_id)}" ${collection.collection_id === selectedId ? "selected" : ""}>${escapeHtml(collection.name)}（${Number(collection.word_count)} 词）</option>`).join("");
}

async function parentChildPlan(request, env, account, childIdentifier, url) {
  const binding = await env.DB.prepare(`
    SELECT pcb.child_identifier, pcb.child_account_id, a.user_id, a.username
    FROM parent_child_bindings pcb
    LEFT JOIN accounts a ON a.id = pcb.child_account_id
    WHERE pcb.parent_account_id = ? AND pcb.child_identifier = ?
    LIMIT 1
  `).bind(account.account_id, childIdentifier).first();
  if (!binding) return errorPage(404, "孩子/学生不存在", "该 ID 未与当前家长绑定。", '<a href="/parent/children">返回孩子/学生设定</a>');
  const collections = await availableLearningCollections(env);

  if (request.method === "POST") {
    const form = await request.formData();
    if (!safeEqual(String(form.get("csrf_token") || ""), account.csrf_token)) {
      return errorPage(403, "表单已过期", "请返回计划页面重新提交。");
    }
    const controlMode = form.get("control_mode") === "child" ? "child" : "parent";
    if (controlMode === "child") {
      await env.DB.prepare(`
        UPDATE modu_vocab_parent_plans SET active = 0, updated_at = datetime('now')
        WHERE parent_account_id = ? AND child_identifier = ?
      `).bind(account.account_id, childIdentifier).run();
      if (binding.user_id) {
        await env.DB.prepare(`
          UPDATE modu_vocab_user_settings
          SET plan_owner = 'child', managed_by_parent_account_id = NULL, updated_at = datetime('now')
          WHERE user_id = ? AND managed_by_parent_account_id = ?
        `).bind(binding.user_id, account.account_id).run();
      }
      return redirect(`/parent/children/${encodeURIComponent(childIdentifier)}/plan?notice=autonomy`);
    }

    const collectionId = String(form.get("collection_id") || "");
    const collection = collections.find((item) => item.collection_id === collectionId);
    const batchSize = Number(form.get("batch_size"));
    if (!collection || !MODU_BATCH_SIZES.includes(batchSize)) {
      return errorPage(400, "计划内容无效", "请选择有效的学习范围和每日学习量。", `<a href="/parent/children/${encodeURIComponent(childIdentifier)}/plan">返回计划</a>`);
    }
    const planName = String(form.get("plan_name") || "家长制定计划").trim().slice(0, 80) || "家长制定计划";
    await env.DB.prepare(`
      INSERT INTO modu_vocab_parent_plans(
        plan_id, parent_account_id, child_identifier, plan_name, batch_size,
        collection_id, active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
      ON CONFLICT(parent_account_id, child_identifier) DO UPDATE SET
        plan_name = excluded.plan_name,
        batch_size = excluded.batch_size,
        collection_id = excluded.collection_id,
        active = 1,
        updated_at = excluded.updated_at
    `).bind(crypto.randomUUID(), account.account_id, childIdentifier, planName, batchSize, collectionId).run();
    if (binding.user_id) {
      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO modu_vocab_user_settings(
            user_id, batch_size, active_collection_id, spelling_mode, plan_name,
            plan_owner, managed_by_parent_account_id, plan_configured, updated_at
          ) VALUES (?, ?, ?, 0, ?, 'parent', ?, 1, datetime('now'))
          ON CONFLICT(user_id) DO UPDATE SET
            batch_size = excluded.batch_size,
            active_collection_id = excluded.active_collection_id,
            plan_name = excluded.plan_name,
            plan_owner = 'parent',
            managed_by_parent_account_id = excluded.managed_by_parent_account_id,
            plan_configured = 1,
            updated_at = excluded.updated_at
        `).bind(binding.user_id, batchSize, collectionId, planName, account.account_id),
        env.DB.prepare(`
          UPDATE modu_vocab_sessions SET finished_at = datetime('now')
          WHERE user_id = ? AND finished_at IS NULL
        `).bind(binding.user_id),
      ]);
    }
    return redirect(`/parent/children/${encodeURIComponent(childIdentifier)}/plan?notice=saved`);
  }

  const parentPlan = await env.DB.prepare(`
    SELECT * FROM modu_vocab_parent_plans
    WHERE parent_account_id = ? AND child_identifier = ? AND active = 1 LIMIT 1
  `).bind(account.account_id, childIdentifier).first();
  const childSettings = binding.user_id ? await env.DB.prepare(`
    SELECT * FROM modu_vocab_user_settings WHERE user_id = ?
  `).bind(binding.user_id).first() : null;
  const selectedCollection = parentPlan?.collection_id || childSettings?.active_collection_id || MODU_CORE_COLLECTION;
  const selectedBatch = Number(parentPlan?.batch_size || childSettings?.batch_size || 14);
  const managedHere = childSettings?.plan_owner === "parent" && childSettings?.managed_by_parent_account_id === account.account_id;
  const notice = {
    saved: "家长学习计划已保存并立即生效。",
    autonomy: "已改为孩子自主制定学习计划。",
  }[url.searchParams.get("notice")] || "";
  return htmlResponse(layout({
    title: `${binding.username || childIdentifier}的学习计划`,
    admin: true,
    body: `${parentNavigation()}<h1>${escapeHtml(binding.username || childIdentifier)}的学习计划</h1>
      ${notice ? `<div class="notice">${notice}</div>` : ""}
      ${binding.user_id ? "" : '<div class="warning">孩子尚未注册。计划会先保存，注册后自动生效。</div>'}
      <section class="card"><p>当前管理方式：<strong>${managedHere || parentPlan ? "家长制定" : "孩子自主"}</strong><br>
      当前范围：${escapeHtml(collections.find((item) => item.collection_id === selectedCollection)?.name || "墨读核心500")}<br>
      每日学习量：${selectedBatch} 词</p></section>
      <form method="post" action="/parent/children/${encodeURIComponent(childIdentifier)}/plan">
        <input type="hidden" name="csrf_token" value="${escapeHtml(account.csrf_token)}">
        <input type="hidden" name="control_mode" value="parent">
        <label for="plan_name">计划名称</label>
        <input id="plan_name" name="plan_name" type="text" maxlength="80" value="${escapeHtml(parentPlan?.plan_name || "家长制定计划")}" required>
        <label for="collection_id">学习范围</label>
        <select id="collection_id" name="collection_id" required>${learningCollectionOptions(collections, selectedCollection)}</select>
        <fieldset><legend>每日学习量</legend>
          ${MODU_BATCH_SIZES.map((size) => `<label class="radio-line"><input type="radio" name="batch_size" value="${size}" ${size === selectedBatch ? "checked" : ""}> ${size} 词</label>`).join("")}
        </fieldset>
        <input type="submit" value="保存家长制定计划">
      </form>
      <form method="post" action="/parent/children/${encodeURIComponent(childIdentifier)}/plan">
        <input type="hidden" name="csrf_token" value="${escapeHtml(account.csrf_token)}">
        <input type="hidden" name="control_mode" value="child">
        <input type="submit" value="改为孩子自主制定">
      </form>`,
    nav: `<a href="/parent/children/${encodeURIComponent(childIdentifier)}">孩子总览</a> | <a href="/parent/children">返回孩子设定</a>`,
  }));
}

async function parentHome(request, env, account, url) {
  if (account.role === "parent") {
    const counts = await env.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM parent_child_bindings WHERE parent_account_id = ?) AS children,
        (SELECT COUNT(*) FROM books WHERE uploader_account_id = ?) AS books,
        (SELECT COUNT(*) FROM books WHERE uploader_account_id = ? AND review_status = 'pending') AS pending_books
    `).bind(account.account_id, account.account_id, account.account_id).first();
    return htmlResponse(layout({
      title: "家长功能",
      admin: true,
      body: `${parentNavigation()}<h1>家长功能</h1>
        <p>家长账户：${escapeHtml(account.username)}</p>
        <section class="card"><p>已绑定孩子/学生：${Number(counts?.children || 0)}<br>
        已上传读物：${Number(counts?.books || 0)}<br>
        待管理员审核：${Number(counts?.pending_books || 0)}</p></section>
        <a class="button" href="/parent/children">孩子/学生设定</a>
        <a class="button" href="/parent/books">阅读物发布及管理</a>
        <a class="button" href="/parent/assessments">单词模块管理</a>`,
      nav: '<a href="/k/home">返回个人主页</a>',
    }));
  }
  const existing = await env.DB.prepare(`
    SELECT status, review_notes, created_at FROM parent_applications
    WHERE account_id = ? ORDER BY created_at DESC LIMIT 1
  `).bind(account.account_id).first();
  if (request.method === "POST") {
    const form = await request.formData();
    if (!safeEqual(String(form.get("csrf_token") || ""), account.csrf_token)) {
      return errorPage(403, "表单已过期", "请返回后重新提交申请。");
    }
    if (existing?.status === "pending") return redirect("/parent?notice=pending");
    await env.DB.prepare(`
      INSERT INTO parent_applications
        (id, account_id, status, reason, created_at, updated_at)
      VALUES (?, ?, 'pending', ?, datetime('now'), datetime('now'))
    `).bind(
      crypto.randomUUID(),
      account.account_id,
      String(form.get("reason") || "").trim().slice(0, 500) || null,
    ).run();
    return redirect("/parent?notice=applied");
  }
  const notices = {
    applied: "申请已提交，请等待管理员审核。",
    pending: "你的申请仍在审核中，请勿重复提交。",
  };
  return htmlResponse(layout({
    title: "申请成为家长",
    body: `<h1>申请成为家长</h1>
      ${notices[url.searchParams.get("notice")] ? `<div class="notice">${notices[url.searchParams.get("notice")]}</div>` : ""}
      <p>当前账户属性为“孩子”。家长申请通过后，可使用阅读物管理、单词模块管理和孩子/学生设定。</p>
      ${existing ? `<section class="card"><p>最近申请状态：${escapeHtml(existing.status)}<br>提交时间：${escapeHtml(existing.created_at)}</p>
        ${existing.review_notes ? `<p>审核说明：${escapeHtml(existing.review_notes)}</p>` : ""}</section>` : ""}
      ${existing?.status === "pending" ? "" : `<form method="post" action="/parent">
        <input type="hidden" name="csrf_token" value="${escapeHtml(account.csrf_token)}">
        <label for="reason">申请说明（可选）</label>
        <textarea id="reason" name="reason" rows="4" maxlength="500"></textarea>
        <input type="submit" value="提交家长申请">
      </form>`}`,
    nav: '<a href="/k/home">返回个人主页</a>',
  }));
}

async function parentChildren(request, env, account, url) {
  if (request.method === "POST") {
    const form = await request.formData();
    if (!safeEqual(String(form.get("csrf_token") || ""), account.csrf_token)) {
      return errorPage(403, "表单已过期", "请返回后重新提交。");
    }
    const child = normalizeAccountName(form.get("child_identifier"));
    if (child.error) return errorPage(400, "孩子/学生 ID 无效", child.error, '<a href="/parent/children">返回</a>');
    if (child.normalized === account.normalized_username) {
      return errorPage(400, "不能绑定自己", "请输入孩子或学生的账户 ID。", '<a href="/parent/children">返回</a>');
    }
    const registered = await env.DB.prepare(`
      SELECT id FROM accounts WHERE normalized_username = ? AND role = 'child' AND status = 'active' LIMIT 1
    `).bind(child.normalized).first();
    try {
      await env.DB.prepare(`
        INSERT INTO parent_child_bindings
          (id, parent_account_id, child_identifier, child_account_id, bound_at, created_at)
        VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
      `).bind(crypto.randomUUID(), account.account_id, child.normalized, registered?.id || null).run();
    } catch (error) {
      if (String(error?.message || "").toLowerCase().includes("unique")) {
        return redirect("/parent/children?notice=exists");
      }
      throw error;
    }
    return redirect("/parent/children?notice=bound");
  }
  const result = await env.DB.prepare(`
    SELECT pcb.child_identifier, pcb.bound_at, a.username, a.status
    FROM parent_child_bindings pcb
    LEFT JOIN accounts a ON a.id = pcb.child_account_id
    WHERE pcb.parent_account_id = ?
    ORDER BY pcb.bound_at
  `).bind(account.account_id).all();
  const rows = (result.results || []).map((child) => `<tr>
    <td><a href="/parent/children/${encodeURIComponent(child.child_identifier)}">${escapeHtml(child.username || child.child_identifier)}</a></td>
    <td>${child.username ? "已注册" : "尚未注册"}</td>
    <td><a href="/parent/children/${encodeURIComponent(child.child_identifier)}/plan">制定学习计划</a></td>
    <td>${escapeHtml(child.bound_at)}</td>
  </tr>`).join("");
  const notice = {
    bound: "孩子/学生 ID 已绑定。绑定关系不可修改或删除。",
    exists: "该孩子/学生 ID 已经绑定，无需重复添加。",
  }[url.searchParams.get("notice")] || "";
  return htmlResponse(layout({
    title: "孩子/学生设定",
    admin: true,
    body: `${parentNavigation()}<h1>孩子/学生设定</h1>
      ${notice ? `<div class="notice">${notice}</div>` : ""}
      <div class="warning">绑定一经建立不可更改。ID 可以属于已注册用户，也可以先绑定、后注册。</div>
      <form method="post" action="/parent/children">
        <input type="hidden" name="csrf_token" value="${escapeHtml(account.csrf_token)}">
        <label for="child_identifier">孩子/学生 ID</label>
        <input id="child_identifier" name="child_identifier" type="text" maxlength="32" required>
        <input type="submit" value="确认永久绑定">
      </form>
      <table><thead><tr><th>ID</th><th>注册状态</th><th>单词计划</th><th>绑定时间</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4">尚未绑定孩子/学生。</td></tr>'}</tbody></table>`,
    nav: '<a href="/parent">返回家长主页</a>',
  }));
}

async function parentChildOverview(env, account, childIdentifier) {
  const binding = await env.DB.prepare(`
    SELECT pcb.child_identifier, pcb.child_account_id, pcb.bound_at,
      a.username, a.status AS account_status, a.user_id,
      u.display_name, u.status AS user_status
    FROM parent_child_bindings pcb
    LEFT JOIN accounts a ON a.id = pcb.child_account_id
    LEFT JOIN users u ON u.id = a.user_id
    WHERE pcb.parent_account_id = ? AND pcb.child_identifier = ?
    LIMIT 1
  `).bind(account.account_id, childIdentifier).first();
  if (!binding) {
    return errorPage(404, "孩子/学生不存在", "该孩子/学生 ID 未与当前家长绑定。", '<a href="/parent/children">返回孩子/学生设定</a>');
  }

  const libraries = await env.DB.prepare(`
    SELECT al.title, al.description, al.question_types_json
    FROM parent_child_assessment_assignments pcaa
    JOIN assessment_libraries al ON al.id = pcaa.assessment_library_id
    WHERE pcaa.parent_account_id = ? AND pcaa.child_identifier = ?
      AND pcaa.status = 'active' AND al.status = 'approved'
    ORDER BY al.title
  `).bind(account.account_id, childIdentifier).all();
  const libraryCards = (libraries.results || []).map((library) => `<section class="card">
    <h3>${escapeHtml(library.title)}</h3>
    <p>${escapeHtml(library.description || "暂无说明")}</p>
  </section>`).join("");

  if (!binding.user_id || binding.account_status !== "active" || binding.user_status !== "active") {
    return htmlResponse(layout({
      title: `${binding.username || binding.child_identifier}的学习总览`,
      admin: true,
      body: `${parentNavigation()}<h1>${escapeHtml(binding.username || binding.child_identifier)}的总览</h1>
        <section class="card"><p>孩子/学生 ID：${escapeHtml(binding.child_identifier)}<br>
        注册状态：尚未注册或账户未启用<br>
        绑定时间：${escapeHtml(binding.bound_at)}</p></section>
        <h2>阅读情况</h2><p>孩子完成注册并开始阅读后，这里会显示阅读进度。</p>
        <h2>单词学习考核情况</h2>
        ${libraryCards || '<p>尚未为该孩子选择单词考核库。</p>'}`,
      nav: '<a href="/parent/children">返回孩子/学生设定</a>',
    }));
  }

  const reading = await env.DB.prepare(`
    SELECT b.title, c.title AS chapter_title, rp.page, rp.reading_font_scale, rp.last_read_at
    FROM reading_progress rp
    JOIN books b ON b.id = rp.book_id
    LEFT JOIN chapters c ON c.id = rp.chapter_id
    WHERE rp.user_id = ?
    ORDER BY rp.last_read_at DESC
    LIMIT 100
  `).bind(binding.user_id).all();
  const wordStats = await env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM attempts WHERE user_id = ?) AS total_attempts,
      (SELECT COALESCE(SUM(is_correct), 0) FROM attempts WHERE user_id = ?) AS correct_attempts,
      (SELECT COUNT(*) FROM attempts WHERE user_id = ? AND date(created_at, '+8 hours') = date('now', '+8 hours')) AS today_attempts,
      (SELECT COUNT(*) FROM mistakes WHERE user_id = ? AND mastery_status != 'temporary_mastered') AS pending_mistakes,
      (SELECT MAX(created_at) FROM attempts WHERE user_id = ?) AS latest_attempt
  `).bind(binding.user_id, binding.user_id, binding.user_id, binding.user_id, binding.user_id).first();
  const v2Plan = await env.DB.prepare(`
    SELECT s.plan_name, s.batch_size, s.plan_owner, c.name AS collection_name,
      (SELECT COUNT(*) FROM modu_vocab_collection_members m WHERE m.collection_id = s.active_collection_id) AS collection_words,
      (SELECT COUNT(*) FROM modu_vocab_progress p WHERE p.user_id = s.user_id AND p.stage = 'initial') AS initial_words,
      (SELECT COUNT(*) FROM modu_vocab_progress p WHERE p.user_id = s.user_id AND p.stage = 'familiar') AS familiar_words,
      (SELECT COUNT(*) FROM modu_vocab_progress p WHERE p.user_id = s.user_id AND p.stage = 'mastered') AS mastered_words
    FROM modu_vocab_user_settings s
    LEFT JOIN modu_vocab_collections c ON c.collection_id = s.active_collection_id
    WHERE s.user_id = ? LIMIT 1
  `).bind(binding.user_id).first();
  const sessions = await env.DB.prepare(`
    SELECT ps.started_at, ps.completed_at, ps.status,
      COUNT(a.id) AS attempts, COALESCE(SUM(a.is_correct), 0) AS correct
    FROM practice_sessions ps
    LEFT JOIN attempts a ON a.session_id = ps.id
    WHERE ps.user_id = ?
    GROUP BY ps.id
    ORDER BY ps.started_at DESC
    LIMIT 20
  `).bind(binding.user_id).all();

  const readingRows = (reading.results || []).map((item) => `<tr>
    <td>${escapeHtml(item.title)}</td>
    <td>${escapeHtml(item.chapter_title || "正文")}</td>
    <td>${Number(item.page || 1)}</td>
    <td>${escapeHtml(fontScaleConfig(item.reading_font_scale).label)}</td>
    <td>${escapeHtml(item.last_read_at || "—")}</td>
  </tr>`).join("");
  const sessionRows = (sessions.results || []).map((item) => {
    const attempts = Number(item.attempts || 0);
    const correct = Number(item.correct || 0);
    return `<tr><td>${escapeHtml(item.started_at)}</td><td>${attempts}</td>
      <td>${attempts ? Math.round(correct / attempts * 100) : 0}%</td><td>${escapeHtml(item.status)}</td></tr>`;
  }).join("");
  const totalAttempts = Number(wordStats?.total_attempts || 0);
  const correctAttempts = Number(wordStats?.correct_attempts || 0);

  return htmlResponse(layout({
    title: `${binding.username || binding.child_identifier}的学习总览`,
    admin: true,
    body: `${parentNavigation()}<h1>${escapeHtml(binding.username || binding.child_identifier)}的总览</h1>
      <section class="card"><p>孩子/学生 ID：${escapeHtml(binding.child_identifier)}<br>
      注册状态：已注册<br>绑定时间：${escapeHtml(binding.bound_at)}</p></section>
      <h2>阅读情况</h2>
      <table><thead><tr><th>读物</th><th>章节</th><th>页</th><th>字号</th><th>最近阅读</th></tr></thead>
      <tbody>${readingRows || '<tr><td colspan="5">尚无阅读记录。</td></tr>'}</tbody></table>
      <h2>单词学习考核情况</h2>
      <section class="card"><h3>当前学习计划</h3><p>
      计划：${escapeHtml(v2Plan?.plan_name || "尚未制定")}<br>
      范围：${escapeHtml(v2Plan?.collection_name || "墨读核心500")}（${Number(v2Plan?.collection_words || 500)} 词）<br>
      每日：${Number(v2Plan?.batch_size || 14)} 词<br>
      制定者：${v2Plan?.plan_owner === "parent" ? "家长" : "孩子自主"}<br>
      初识 / 熟悉 / 掌握：${Number(v2Plan?.initial_words || 0)} / ${Number(v2Plan?.familiar_words || 0)} / ${Number(v2Plan?.mastered_words || 0)}</p>
      <a class="button" href="/parent/children/${encodeURIComponent(childIdentifier)}/plan">制定或修改学习计划</a></section>
      <h3>六年级上册旧版考核记录</h3>
      <section class="card"><p>累计答题：${totalAttempts}<br>
      累计正确率：${totalAttempts ? Math.round(correctAttempts / totalAttempts * 100) : 0}%<br>
      今日答题：${Number(wordStats?.today_attempts || 0)}<br>
      待复习错题：${Number(wordStats?.pending_mistakes || 0)}<br>
      最近考核：${escapeHtml(wordStats?.latest_attempt || "尚未开始")}</p></section>
      <h3>当前考核库</h3>${libraryCards || '<p>尚未选择单词考核库。</p>'}
      <h3>最近考核记录</h3>
      <table><thead><tr><th>开始时间</th><th>答题数</th><th>正确率</th><th>状态</th></tr></thead>
      <tbody>${sessionRows || '<tr><td colspan="4">尚无考核记录。</td></tr>'}</tbody></table>`,
    nav: '<a href="/parent/children">返回孩子/学生设定</a>',
  }));
}

async function storeParentBook(env, form, account) {
  const title = String(form.get("title") || "").trim().slice(0, 160);
  if (!title) return { response: errorPage(400, "读物标题缺失", "请填写读物标题。", '<a href="/parent/books/new">返回上传</a>') };
  let body = String(form.get("body") || "");
  let fileName = "pasted.txt";
  let mediaType = "text/plain";
  let bytes = new TextEncoder().encode(body);
  const uploaded = form.get("file");
  if (uploaded && typeof uploaded.arrayBuffer === "function" && uploaded.size > 0) {
    if (uploaded.size > 2 * 1024 * 1024) return { response: errorPage(400, "文件过大", "单个读物源文件不得超过 2MB。") };
    const extension = String(uploaded.name || "").toLowerCase().split(".").pop();
    if (!["txt", "md", "markdown"].includes(extension)) return { response: errorPage(400, "文件格式错误", "只支持 TXT、MD 和 Markdown。") };
    bytes = new Uint8Array(await uploaded.arrayBuffer());
    try { body = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch {
      return { response: errorPage(400, "文件编码错误", "请将文件另存为 UTF-8 编码后重新上传。") };
    }
    fileName = String(uploaded.name || "reading.txt").slice(0, 200);
    mediaType = extension === "txt" ? "text/plain" : "text/markdown";
  }
  if (!body.trim()) return { response: errorPage(400, "读物正文缺失", "请上传文件或粘贴正文。") };
  const chapters = parseBookChapters(body);
  if (!chapters.length) return { response: errorPage(400, "解析失败", "未能从正文中读取有效内容。") };
  const bookId = crypto.randomUUID();
  const fileId = crypto.randomUUID();
  const storageKey = `books/${bookId}/${fileId}-${fileName.replace(/[^a-zA-Z0-9._-]/gu, "_")}`;
  if (!env.BUCKET) return { response: errorPage(503, "文件存储尚未连接", "本地文件存储不可用。") };
  await env.BUCKET.put(storageKey, bytes, { httpMetadata: { contentType: mediaType } });
  let cover = null;
  try { cover = await processBookCover(env, bookId, form.get("cover")); } catch {
    return { response: errorPage(400, "封面处理失败", "封面须为 1MB 以内的 JPEG 图片，请压缩或转换后重试。") };
  }
  const statements = [
    env.DB.prepare(`
      INSERT INTO books
        (id, household_id, title, author, summary, language, recommended_grade, status, sort_order,
         total_chapters, total_pages, source_notes, rights_notes, uploader_account_id, review_status,
         submitted_at, cover_original_key, cover_thumbnail_key, cover_media_type, cover_updated_at,
         created_at, updated_at)
      VALUES (?, 'household_default', ?, ?, ?, ?, ?, 'preview', 0, ?, 0, ?, ?, ?, 'pending',
        datetime('now'), ?, ?, ?, CASE WHEN ? IS NULL THEN NULL ELSE datetime('now') END,
        datetime('now'), datetime('now'))
    `).bind(
      bookId, title,
      String(form.get("author") || "").trim().slice(0, 120) || null,
      String(form.get("summary") || "").trim().slice(0, 2000) || null,
      String(form.get("language") || "zh"),
      String(form.get("recommended_grade") || "").trim().slice(0, 80) || null,
      chapters.length,
      String(form.get("source_notes") || "").trim().slice(0, 2000) || null,
      String(form.get("rights_notes") || "").trim().slice(0, 2000) || null,
      account.account_id,
      cover?.originalKey || null,
      cover?.thumbnailKey || null,
      cover?.mediaType || null,
      cover?.thumbnailKey || null,
    ),
    env.DB.prepare(`
      INSERT INTO book_files
        (id, book_id, storage_key, original_name, media_type, byte_size, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(fileId, bookId, storageKey, fileName, mediaType, bytes.byteLength),
  ];
  let totalPages = 0;
  for (let index = 0; index < chapters.length; index += 1) {
    const chapter = chapters[index];
    const chapterId = crypto.randomUUID();
    statements.push(env.DB.prepare(`
      INSERT INTO chapters
        (id, book_id, title, body, sort_order, parsing_warnings, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(chapterId, bookId, chapter.title, chapter.body, index + 1, chapter.warning || null));
    for (const [fontSize, target] of Object.entries(STORED_PAGE_TARGETS)) {
      const pages = paginateChapter(chapter.body, target);
      if (fontSize === "medium") totalPages += pages.length;
      for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
        statements.push(env.DB.prepare(`
          INSERT INTO chapter_pages
            (id, chapter_id, font_size, page_number, body, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).bind(crypto.randomUUID(), chapterId, fontSize, pageIndex + 1, pages[pageIndex]));
      }
    }
  }
  statements.push(env.DB.prepare(`UPDATE books SET total_pages = ?, updated_at = datetime('now') WHERE id = ?`).bind(totalPages, bookId));
  await runBatches(env.DB, statements);
  return { bookId };
}

async function parentBooks(request, env, account, url) {
  if (request.method === "POST") {
    const form = await request.formData();
    if (!safeEqual(String(form.get("csrf_token") || ""), account.csrf_token)) {
      return errorPage(403, "表单已过期", "请返回后重新提交。");
    }
    const bookId = String(form.get("book_id") || "");
    const owned = await env.DB.prepare(`SELECT id FROM books WHERE id = ? AND uploader_account_id = ? LIMIT 1`)
      .bind(bookId, account.account_id).first();
    if (!owned) return errorPage(404, "读物不存在", "只能更新自己发布的读物。");
    let cover;
    try { cover = await processBookCover(env, bookId, form.get("cover")); } catch {
      return errorPage(400, "封面处理失败", "封面须为 1MB 以内的 JPEG 图片。");
    }
    if (!cover) return errorPage(400, "请选择封面", "请选择需要上传的 JPEG 封面。");
    await env.DB.prepare(`UPDATE books SET cover_original_key = ?, cover_thumbnail_key = ?, cover_media_type = ?, cover_updated_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
      .bind(cover.originalKey, cover.thumbnailKey, cover.mediaType, bookId).run();
    return redirect("/parent/books?notice=cover_saved");
  }
  const result = await env.DB.prepare(`
    SELECT id, title, author, status, review_status, review_notes, total_chapters, updated_at
    FROM books WHERE uploader_account_id = ? ORDER BY updated_at DESC
  `).bind(account.account_id).all();
  const rows = (result.results || []).map((book) => `<tr>
    <td>${escapeHtml(book.title)}</td><td>${escapeHtml(book.author || "—")}</td>
    <td>${escapeHtml(book.review_status)}</td><td>${escapeHtml(book.status)}</td>
    <td>${Number(book.total_chapters || 0)}</td>
  </tr>`).join("");
  return htmlResponse(layout({
    title: "阅读物发布及管理",
    admin: true,
    body: `${parentNavigation()}<h1>阅读物发布及管理</h1>
      ${url.searchParams.get("notice") === "submitted" ? '<div class="notice">读物已提交管理员审核；审核通过后自动上架。</div>' : ""}
      ${url.searchParams.get("notice") === "cover_saved" ? '<div class="notice">Kindle 灰阶封面已更新。</div>' : ""}
      <a class="button" href="/parent/books/new">上传新读物或资料</a>
      <table><thead><tr><th>标题</th><th>作者</th><th>审核</th><th>上架</th><th>章节</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5">尚未上传读物。</td></tr>'}</tbody></table>
      ${(result.results || []).length ? `<section class="card"><h2>更新已有读物封面</h2><form method="post" action="/parent/books" enctype="multipart/form-data">
        <input type="hidden" name="csrf_token" value="${escapeHtml(account.csrf_token)}">
        <label for="book_id">读物</label><select id="book_id" name="book_id">${(result.results || []).map((book) => `<option value="${escapeHtml(book.id)}">${escapeHtml(book.title)}</option>`).join("")}</select>
        <label for="cover">JPEG 封面</label><input id="cover" name="cover" type="file" accept=".jpg,.jpeg,image/jpeg" required>
        <input type="submit" value="生成并保存 Kindle 封面"></form></section>` : ""}`,
    nav: '<a href="/parent">返回家长主页</a>',
  }));
}

async function parentNewBook(request, env, account) {
  if (request.method === "GET") {
    return htmlResponse(layout({
      title: "上传阅读物",
      admin: true,
      body: `${parentNavigation()}<h1>上传阅读物或资料</h1>
        <p>提交后需由管理员审核；审核通过后，已绑定的孩子/学生可以阅读。</p>
        <form method="post" action="/parent/books/new" enctype="multipart/form-data">
          <input type="hidden" name="csrf_token" value="${escapeHtml(account.csrf_token)}">
          <label for="title">标题</label><input id="title" name="title" type="text" maxlength="160" required>
          <label for="author">作者</label><input id="author" name="author" type="text" maxlength="120">
          <label for="summary">简介</label><textarea id="summary" name="summary" rows="4"></textarea>
          <label for="language">语言</label><select id="language" name="language"><option value="zh">中文</option><option value="en">英文</option><option value="mixed">中英双语</option></select>
          <label for="recommended_grade">推荐年级</label><input id="recommended_grade" name="recommended_grade" type="text" maxlength="80">
          <label for="cover">书籍封面（JPEG，系统自动生成 Kindle 灰阶缩略图）</label><input id="cover" name="cover" type="file" accept=".jpg,.jpeg,image/jpeg">
          <label for="file">TXT 或 Markdown 文件</label><input id="file" name="file" type="file" accept=".txt,.md,.markdown,text/plain,text/markdown">
          <p class="muted">系统会识别章节、合并文件中的物理断行并保留自然段；实际页数由孩子的 Kindle 屏幕、字号和行距自动计算。</p>
          <label for="body">或直接粘贴正文</label><textarea id="body" name="body" rows="16"></textarea>
          <label for="source_notes">资料来源</label><textarea id="source_notes" name="source_notes" rows="3"></textarea>
          <label for="rights_notes">版权或使用权限说明</label><textarea id="rights_notes" name="rights_notes" rows="3"></textarea>
          <input type="submit" value="提交管理员审核">
        </form>`,
      nav: '<a href="/parent/books">返回阅读物管理</a>',
    }));
  }
  const form = await request.formData();
  if (!safeEqual(String(form.get("csrf_token") || ""), account.csrf_token)) {
    return errorPage(403, "表单已过期", "请返回后重新提交。");
  }
  const stored = await storeParentBook(env, form, account);
  if (stored.response) return stored.response;
  return redirect("/parent/books?notice=submitted");
}

async function parentAssessments(request, env, account, url) {
  if (request.method === "POST") {
    const form = await request.formData();
    if (!safeEqual(String(form.get("csrf_token") || ""), account.csrf_token)) {
      return errorPage(403, "表单已过期", "请返回后重新提交。");
    }
    const childIdentifier = String(form.get("child_identifier") || "").trim().toLocaleLowerCase("en-US");
    const libraryId = String(form.get("library_id") || "");
    const binding = await env.DB.prepare(`
      SELECT id FROM parent_child_bindings WHERE parent_account_id = ? AND child_identifier = ? LIMIT 1
    `).bind(account.account_id, childIdentifier).first();
    const library = await env.DB.prepare(`SELECT id FROM assessment_libraries WHERE id = ? AND status = 'approved' LIMIT 1`).bind(libraryId).first();
    if (!binding || !library) return errorPage(400, "设定无效", "孩子/学生或考核库不存在。");
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM parent_child_assessment_assignments WHERE parent_account_id = ? AND child_identifier = ?`).bind(account.account_id, childIdentifier),
      env.DB.prepare(`
        INSERT INTO parent_child_assessment_assignments
          (id, parent_account_id, child_identifier, assessment_library_id, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'active', datetime('now'), datetime('now'))
      `).bind(crypto.randomUUID(), account.account_id, childIdentifier, libraryId),
    ]);
    return redirect("/parent/assessments?notice=saved");
  }
  const children = await env.DB.prepare(`
    SELECT child_identifier FROM parent_child_bindings WHERE parent_account_id = ? ORDER BY bound_at
  `).bind(account.account_id).all();
  const libraries = await env.DB.prepare(`
    SELECT id, title, description FROM assessment_libraries WHERE status = 'approved' ORDER BY created_at
  `).all();
  const assignments = await env.DB.prepare(`
    SELECT child_identifier, assessment_library_id FROM parent_child_assessment_assignments
    WHERE parent_account_id = ? AND status = 'active'
  `).bind(account.account_id).all();
  const selected = new Map((assignments.results || []).map((item) => [item.child_identifier, item.assessment_library_id]));
  const forms = (children.results || []).map((child) => `<section class="card">
    <h2>${escapeHtml(child.child_identifier)}</h2>
    <form method="post" action="/parent/assessments">
      <input type="hidden" name="csrf_token" value="${escapeHtml(account.csrf_token)}">
      <input type="hidden" name="child_identifier" value="${escapeHtml(child.child_identifier)}">
      <label for="library_${escapeHtml(child.child_identifier)}">考核库</label>
      <select id="library_${escapeHtml(child.child_identifier)}" name="library_id" required>
        ${(libraries.results || []).map((library) => `<option value="${escapeHtml(library.id)}" ${selected.get(child.child_identifier) === library.id ? "selected" : ""}>${escapeHtml(library.title)}</option>`).join("")}
      </select>
      <input type="submit" value="保存该孩子的考核范围">
    </form>
  </section>`).join("");
  return htmlResponse(layout({
    title: "单词模块管理",
    admin: true,
    body: `${parentNavigation()}<h1>单词模块管理</h1>
      ${url.searchParams.get("notice") === "saved" ? '<div class="notice">考核范围已保存。</div>' : ""}
      <p>从管理员建立并审核通过的考核库中，为每个孩子/学生选择适合的范围和方式。</p>
      ${forms || '<div class="warning">请先绑定孩子/学生 ID。</div>'}`,
    nav: '<a href="/parent/children">孩子/学生设定</a> | <a href="/parent">返回家长主页</a>',
  }));
}

async function routeParent(request, env, url) {
  const account = await getAccountIdentity(request, env);
  if (!account) return redirect(`/k/login?return_to=${encodeURIComponent(url.pathname)}`);
  if (account.role !== "parent") {
    if (url.pathname === "/parent" && ["GET", "POST"].includes(request.method)) return parentHome(request, env, account, url);
    return errorPage(403, "尚未获得家长权限", "请先提交家长申请并等待管理员审核。", '<a href="/parent">查看申请状态</a>');
  }
  if (url.pathname === "/parent" && request.method === "GET") return parentHome(request, env, account, url);
  if (url.pathname === "/parent/children" && ["GET", "POST"].includes(request.method)) return parentChildren(request, env, account, url);
  const childPlanMatch = url.pathname.match(/^\/parent\/children\/([^/]+)\/plan$/u);
  if (childPlanMatch && ["GET", "POST"].includes(request.method)) {
    return parentChildPlan(request, env, account, decodeURIComponent(childPlanMatch[1]).toLocaleLowerCase("en-US"), url);
  }
  const childOverviewMatch = url.pathname.match(/^\/parent\/children\/([^/]+)$/u);
  if (childOverviewMatch && request.method === "GET") {
    return parentChildOverview(env, account, decodeURIComponent(childOverviewMatch[1]).toLocaleLowerCase("en-US"));
  }
  if (url.pathname === "/parent/books" && ["GET", "POST"].includes(request.method)) return parentBooks(request, env, account, url);
  if (url.pathname === "/parent/books/new" && ["GET", "POST"].includes(request.method)) return parentNewBook(request, env, account);
  if (url.pathname === "/parent/assessments" && ["GET", "POST"].includes(request.method)) return parentAssessments(request, env, account, url);
  return errorPage(404, "家长页面不存在", "请求的家长页面不存在。", '<a href="/parent">返回家长主页</a>');
}

async function getDeviceSession(request, env) {
  const token = parseCookies(request)[COOKIE_DEVICE];
  if (!token) return null;
  const tokenHash = await sha256(token);
  return env.DB.prepare(`
    SELECT ds.id, ds.device_id, ds.current_user_id, ds.csrf_token, ds.expires_at,
           d.household_id, d.name AS device_name, d.status AS device_status
    FROM device_sessions ds
    JOIN devices d ON d.id = ds.device_id
    WHERE ds.session_token_hash = ? AND ds.expires_at > datetime('now')
    LIMIT 1
  `).bind(tokenHash).first();
}

function deviceCookie(token) {
  // Older Kindle browsers can drop cookies carrying newer SameSite
  // attributes. This opaque first-party cookie only maps a device session.
  return `${COOKIE_DEVICE}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_MAX_AGE}; HttpOnly; Secure`;
}

function noticeText(code, name = "") {
  const messages = {
    created: `已创建使用者：${name}`,
    selected: `已切换到：${name}`,
    switched: "已退出当前使用者，请重新选择。",
    weather_saved: "备用天气已保存。",
    weather_tested: "自动天气接口测试成功。",
    weather_cleared: "天气缓存已清除。",
    weather_mode_saved: "自动天气设置已保存。",
    device_revoked: "设备令牌已撤销。",
    user_saved: "使用者资料已保存。",
    user_created_admin: "使用者已由家长创建。",
    plan_saved: "学习计划已保存。",
    learning_cleared: "该使用者的学习记录已清空。",
    user_deleted: "使用者及其个人记录已删除。",
    import_confirmed: "数据导入完成。",
  };
  return messages[code] || "";
}

function weatherCodeText(code) {
  const map = {
    0: "晴", 1: "大部晴朗", 2: "多云", 3: "阴",
    45: "雾", 48: "雾凇", 51: "小毛毛雨", 53: "毛毛雨", 55: "较强毛毛雨",
    61: "小雨", 63: "中雨", 65: "大雨", 71: "小雪", 73: "中雪", 75: "大雪",
    80: "阵雨", 81: "较强阵雨", 82: "强阵雨", 95: "雷雨", 96: "雷雨伴冰雹", 99: "强雷雨伴冰雹",
  };
  return map[Number(code)] || "天气情况未知";
}

function weatherSymbol(condition) {
  const text = String(condition || "");
  if (/雨|雷|雪|冰/u.test(text)) return "rain";
  if (/云|阴|雾/u.test(text)) return "cloud";
  return "sun";
}

function defaultWeatherCity() {
  return WEATHER_CITIES[0];
}

async function userWeatherCity(env, userId) {
  if (!userId) return defaultWeatherCity();
  const pref = await env.DB.prepare(`
    SELECT weather_city_name, weather_latitude, weather_longitude
    FROM user_preferences WHERE user_id = ? LIMIT 1
  `).bind(userId).first();
  if (!pref?.weather_city_name) return defaultWeatherCity();
  return {
    id: "saved",
    name: String(pref.weather_city_name),
    province: "",
    latitude: Number(pref.weather_latitude),
    longitude: Number(pref.weather_longitude),
  };
}

async function fetchAutomaticWeather(env, city = defaultWeatherCity(), force = false) {
  const enabled = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'automatic_weather_enabled'`).first();
  if (enabled?.value === "0" && !force) return null;
  if (!force) {
    const fresh = await env.DB.prepare(`
      SELECT payload_json, fetched_at FROM weather_cache
      WHERE location = ? AND status = 'success' AND expires_at > datetime('now')
      ORDER BY fetched_at DESC LIMIT 1
    `).bind(city.name).first();
    if (fresh?.payload_json) {
      try { return { ...JSON.parse(fresh.payload_json), stale: false }; } catch { /* refetch */ }
    }
  }
  const baseUrl = String(env.WEATHER_API_BASE_URL || "https://api.open-meteo.com/v1/forecast").trim();
  const endpoint = new URL(baseUrl);
  endpoint.searchParams.set("latitude", String(city.latitude));
  endpoint.searchParams.set("longitude", String(city.longitude));
  endpoint.searchParams.set("current", "temperature_2m,weather_code");
  endpoint.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_probability_max");
  endpoint.searchParams.set("timezone", "Asia/Shanghai");
  endpoint.searchParams.set("forecast_days", "1");
  try {
    const response = await fetch(endpoint.toString(), { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`weather_http_${response.status}`);
    const data = await response.json();
    const payload = {
      condition: weatherCodeText(data?.current?.weather_code),
      current: Math.round(Number(data?.current?.temperature_2m)),
      high: Math.round(Number(data?.daily?.temperature_2m_max?.[0])),
      low: Math.round(Number(data?.daily?.temperature_2m_min?.[0])),
      rain: `降雨概率 ${Math.round(Number(data?.daily?.precipitation_probability_max?.[0] || 0))}%`,
      updated: data?.current?.time ? String(data.current.time).replace("T", " ") : kunmingNow(),
      provider: "Open-Meteo",
      city: city.name,
    };
    if (![payload.current, payload.high, payload.low].every(Number.isFinite)) throw new Error("weather_invalid_payload");
    await env.DB.prepare(`
      INSERT INTO weather_cache
        (id, provider, location, payload_json, status, fetched_at, expires_at, created_at, updated_at)
      VALUES (?, 'Open-Meteo', ?, ?, 'success', datetime('now'), datetime('now', '+30 minutes'), datetime('now'), datetime('now'))
    `).bind(crypto.randomUUID(), city.name, JSON.stringify(payload)).run();
    return { ...payload, stale: false };
  } catch {
    const stale = await env.DB.prepare(`
      SELECT payload_json FROM weather_cache
      WHERE location = ? AND status = 'success'
      ORDER BY fetched_at DESC LIMIT 1
    `).bind(city.name).first();
    if (stale?.payload_json) {
      try { return { ...JSON.parse(stale.payload_json), stale: true }; } catch { /* use manual */ }
    }
    return null;
  }
}

async function weatherBlock(env, userId = null) {
  const city = await userWeatherCity(env, userId);
  const automatic = await fetchAutomaticWeather(env, city);
  const row = await env.DB.prepare(`
    SELECT value, updated_at FROM settings WHERE key = 'manual_weather' LIMIT 1
  `).first();
  let weather = {
    condition: "多云",
    current: "22",
    high: "25",
    low: "17",
    rain: "降雨概率 30%",
    updated: "备用天气",
    city: city.name,
    stale: true,
  };
  if (automatic) {
    weather = automatic;
  } else if (row?.value) {
    try {
      weather = { ...weather, ...JSON.parse(row.value), updated: row.updated_at || "手动录入", stale: false };
    } catch {
      // Keep safe fallback.
    }
  }
  const symbol = weatherSymbol(weather.condition);
  const location = userId
    ? `<a class="weather-location" href="/k/weather">${iconSvg("location")} ${escapeHtml(city.name)}　⌄</a>`
    : `<span class="weather-location">${iconSvg("location")} ${escapeHtml(city.name)}</span>`;
  return `<section class="weather-strip" aria-label="${escapeHtml(city.name)}天气">
    <div class="weather-cell">${location}</div>
    <div class="weather-cell">${iconSvg(symbol, weather.condition)} ${escapeHtml(weather.condition)} ${escapeHtml(weather.current)}℃</div>
    <div class="weather-cell">最高 ${escapeHtml(weather.high)}℃ / 最低 ${escapeHtml(weather.low)}℃<br>${escapeHtml(weather.rain)}
      ${weather.stale ? '<span class="weather-note">最近一次成功天气</span>' : ""}</div>
  </section>`;
}

async function weatherSettingsPage(request, env, session, user, url) {
  if (request.method === "POST") {
    const form = await request.formData();
    if (!safeEqual(String(form.get("csrf_token") || ""), session.csrf_token)) {
      return errorPage(403, "表单已过期", "请返回后重新选择城市。");
    }
    const city = WEATHER_CITIES.find((item) => item.id === String(form.get("city_id") || ""));
    if (!city) return errorPage(400, "城市无效", "请选择列表中的城市。", '<a href="/k/weather">返回天气地区</a>');
    await env.DB.prepare(`
      UPDATE user_preferences
      SET weather_city_name = ?, weather_latitude = ?, weather_longitude = ?, updated_at = datetime('now')
      WHERE user_id = ?
    `).bind(city.name, city.latitude, city.longitude, user.id).run();
    return redirect("/k/weather?saved=1");
  }
  const current = await userWeatherCity(env, user.id);
  const query = String(url.searchParams.get("q") || "").trim().slice(0, 30);
  const matches = WEATHER_CITIES.filter((city) => !query || `${city.name}${city.province}`.includes(query));
  const rows = matches.map((city) => `<form class="card compact-form" method="post" action="/k/weather">
    <input type="hidden" name="csrf_token" value="${escapeHtml(session.csrf_token)}">
    <input type="hidden" name="city_id" value="${escapeHtml(city.id)}">
    <button type="submit">${escapeHtml(city.name)}　<span class="muted">${escapeHtml(city.province)}</span>${current.name === city.name ? "　✓ 当前" : ""}</button>
  </form>`).join("");
  return htmlResponse(layout({
    title: "天气地区",
    body: `<h1>天气地区</h1>
      <p class="muted">天气地区属于当前账户，不会影响同一台 Kindle 上的其他家人。</p>
      ${url.searchParams.get("saved") ? '<div class="notice">默认天气城市已保存。</div>' : ""}
      <form method="get" action="/k/weather">
        <label for="q">搜索城市</label>
        <input id="q" name="q" type="text" value="${escapeHtml(query)}" placeholder="例如：昆明、云南">
        <input type="submit" value="搜索">
      </form>
      <h2>选择城市</h2>${rows || '<p class="warning">没有找到城市，请换一个关键词。</p>'}`,
    nav: '<a href="/k/home">返回主页</a>',
  }));
}

function deviceRequiredPage() {
  return htmlResponse(layout({
    title: "设备尚未初始化",
    body: `<h1>设备尚未初始化</h1>
      <p>请先在管理员后台创建设备令牌，再在这台 Kindle 上打开设备专用地址。</p>
      <p><a class="button" href="/device-test">打开设备兼容性测试</a></p>
      <p class="muted">设备令牌只用于识别 Kindle，不会赋予管理权限。</p>`,
    nav: '<a href="/admin/devices">家长设备管理</a>',
  }));
}

async function createAutomaticDeviceSession(request, env, url) {
  if (url.searchParams.get("device_setup") === "1") {
    return errorPage(
      409,
      "需要启用 Cookie",
      "浏览器没有保存登录所需的设备会话。请在 Kindle 浏览器设置中允许 Cookie，然后重试。",
      '<a href="/k">重试</a> | <a href="/device-test">设备兼容性测试</a>',
    );
  }
  const household = await env.DB.prepare(`
    SELECT id FROM households WHERE status = 'active' ORDER BY created_at LIMIT 1
  `).first();
  if (!household) return errorPage(500, "家庭数据缺失", "数据库初始化尚未完成，请稍后重试。");

  const userAgent = request.headers.get("user-agent") || "";
  const deviceId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const sessionToken = randomToken();
  const sessionHash = await sha256(sessionToken);
  const csrfToken = randomToken(24);
  const deviceName = /kindle|silk/i.test(userAgent) ? "Kindle 自动设备" : "浏览器测试设备";
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO devices
        (id, household_id, name, model, firmware_version, token_hash, token_hint, status,
         last_seen_at, created_at, updated_at)
      VALUES (?, ?, ?, NULL, NULL, NULL, NULL, 'active', datetime('now'), datetime('now'), datetime('now'))
    `).bind(deviceId, household.id, deviceName),
    env.DB.prepare(`
      INSERT INTO device_sessions
        (id, device_id, session_token_hash, csrf_token, current_user_id, expires_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, NULL, datetime('now', '+180 days'), datetime('now'), datetime('now'))
    `).bind(sessionId, deviceId, sessionHash, csrfToken),
  ]);
  // A normal 200 response is more reliable than a redirect for persisting
  // cookies in older Kindle browsers. Meta refresh keeps the entry automatic;
  // the large link is a no-JS fallback.
  const targetUrl = new URL(url.toString());
  targetUrl.searchParams.delete("session_check");
  targetUrl.searchParams.set("device_setup", "1");
  const target = `${targetUrl.pathname}${targetUrl.search}`;
  return htmlResponse(layout({
    title: "正在进入墨读",
    brand: false,
    extraHead: `<meta http-equiv="refresh" content="0;url=${escapeHtml(target)}">`,
    body: `<div class="session-bootstrap"><p>正在进入墨读……</p><a class="button" href="${escapeHtml(target)}">点击进入墨读</a></div>`,
  }), 200, { "set-cookie": deviceCookie(sessionToken) });
}

async function setupDevice(request, env, url) {
  const token = (url.searchParams.get("token") || "").trim();
  if (!token) {
    return htmlResponse(layout({
      title: "初始化 Kindle 设备",
      body: `<h1>初始化 Kindle 设备</h1>
        <p>请粘贴管理员后台生成的设备令牌。</p>
        <form method="get" action="/k/setup">
          <label for="token">设备令牌</label>
          <input id="token" name="token" type="text" autocomplete="off" required>
          <input type="submit" value="验证并进入">
        </form>`,
      nav: '<a href="/device-test">设备兼容性测试</a> | <a href="/k">返回</a>',
    }));
  }
  const tokenHash = await sha256(token);
  const device = await env.DB.prepare(`
    SELECT id, household_id, status
    FROM devices
    WHERE token_hash = ? AND status = 'active'
    LIMIT 1
  `).bind(tokenHash).first();
  if (!device) return errorPage(403, "设备令牌无效", "该令牌不存在、已撤销或输入不完整。");

  const sessionToken = randomToken();
  const sessionHash = await sha256(sessionToken);
  const sessionId = crypto.randomUUID();
  const csrfToken = randomToken(24);
  await env.DB.prepare(`
    INSERT INTO device_sessions
      (id, device_id, session_token_hash, csrf_token, current_user_id, expires_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, NULL, datetime('now', '+180 days'), datetime('now'), datetime('now'))
  `).bind(sessionId, device.id, sessionHash, csrfToken).run();
  await env.DB.prepare(`
    UPDATE devices SET last_seen_at = datetime('now'), updated_at = datetime('now') WHERE id = ?
  `).bind(device.id).run();
  return redirect("/k", { "set-cookie": deviceCookie(sessionToken) });
}

async function touchAccountActivity(env, accountId) {
  if (!accountId) return;
  await env.DB.prepare(`
    UPDATE accounts SET last_active_at = datetime('now'), updated_at = updated_at
    WHERE id = ? AND (last_active_at IS NULL OR last_active_at < datetime('now', '-15 minutes'))
  `).bind(accountId).run();
}

async function userDashboardStats(env, userId) {
  return env.DB.prepare(`
    SELECT
      (SELECT COUNT(DISTINCT word_id) FROM modu_vocab_learning_events
       WHERE user_id = ? AND success = 1 AND date(event_at, '+8 hours') = date('now', '+8 hours')) AS today_words,
      (SELECT COUNT(*) FROM modu_vocab_progress
       WHERE user_id = ? AND stage != 'new' AND due_at IS NOT NULL AND due_at <= datetime('now')) AS due_words,
      (SELECT COUNT(*) FROM reading_progress
       WHERE user_id = ? AND date(last_read_at, '+8 hours') = date('now', '+8 hours')) AS today_reading,
      (SELECT COUNT(*) FROM attempts
       WHERE user_id = ? AND date(created_at, '+8 hours') = date('now', '+8 hours')) AS today_attempts,
      (SELECT COUNT(*) FROM mistakes WHERE user_id = ? AND mastery_status != 'temporary_mastered') AS pending_mistakes,
      (SELECT batch_size FROM modu_vocab_user_settings WHERE user_id = ? LIMIT 1) AS batch_size,
      (SELECT plan_configured FROM modu_vocab_user_settings WHERE user_id = ? LIMIT 1) AS plan_configured
  `).bind(userId, userId, userId, userId, userId, userId, userId).first();
}

async function latestReading(env, userId) {
  return env.DB.prepare(`
    SELECT b.id AS book_id, b.title, c.id AS chapter_id, c.title AS chapter_title, rp.page, rp.last_read_at
    FROM reading_progress rp JOIN books b ON b.id = rp.book_id
    LEFT JOIN chapters c ON c.id = rp.chapter_id
    WHERE rp.user_id = ? ORDER BY rp.last_read_at DESC LIMIT 1
  `).bind(userId).first();
}

function homeTile({ href, icon, title, subtitle, status }) {
  return `<a class="home-tile" href="${escapeHtml(href)}">
    <span class="tile-icon">${iconSvg(icon)}</span><span class="tile-copy"><h2>${escapeHtml(title)}</h2><span>${escapeHtml(subtitle)}</span></span>
    <span class="tile-arrow">${iconSvg("next")}</span><span class="tile-status">${escapeHtml(status)}</span>
  </a>`;
}

async function homePage(env, url, session, user, account) {
  await touchAccountActivity(env, account.account_id);
  const [weather, stats, recent] = await Promise.all([
    weatherBlock(env, user.id), userDashboardStats(env, user.id), latestReading(env, user.id),
  ]);
  const notice = noticeText(url.searchParams.get("notice"), url.searchParams.get("name"));
  const isParent = account.role === "parent";
  const todayWords = Number(stats?.today_words || stats?.today_attempts || 0);
  const dueWords = Number(stats?.due_words || stats?.pending_mistakes || 0);
  const todayReading = Number(stats?.today_reading || 0);
  const completed = Number(Boolean(todayWords)) + Number(Boolean(todayReading)) + Number(Boolean(stats?.plan_configured)) + Number(dueWords === 0);
  const recentText = recent ? `《${recent.title}》 ${recent.chapter_title || "正文"}` : "尚无阅读记录";
  const tiles = [
    homeTile({ href: "/k/books?scope=all", icon: "book", title: "阅读", subtitle: "全部读物 / 继续阅读", status: recentText }),
    isParent
      ? homeTile({ href: "/parent", icon: "family", title: "家庭管理", subtitle: "孩子、读物与计划", status: "进入家长功能" })
      : homeTile({ href: "/k/words", icon: "words", title: "单词", subtitle: "学习 / 复习单词", status: dueWords ? `待复习 ${dueWords} 个` : `今日新词 ${Number(stats?.batch_size || 14)} 个` }),
    homeTile({ href: "/k/today", icon: "task", title: "今日任务", subtitle: "每日学习计划", status: `已完成 ${completed} / 4 项` }),
    homeTile({ href: isParent ? "/parent/children" : "/k/records", icon: "clock", title: "最近记录", subtitle: "阅读与学习历史", status: recent ? `上次阅读：${recent.chapter_title || recent.title}` : "尚无记录" }),
  ].join("");
  return htmlResponse(layout({
    title: "主页",
    brand: false,
    body: `<header class="topbar"><div class="topbar-brand"><strong>墨读</strong><span>Kindle 家庭轻量学习与阅读</span></div>
      <div class="topbar-actions"><a class="top-link" href="/k/me">${iconSvg("user")} 我的</a><a class="top-link" href="/k/settings">Aa 显示</a></div></header>
      ${weather}${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ""}
      <h1 class="greeting">${escapeHtml(isParent ? "尊敬的家长" : greetingForNow())}，${escapeHtml(user.display_name)}</h1>
      <section class="tile-grid">${tiles}</section>
      <section class="today-summary"><div class="summary-head"><strong>今日概况</strong><a href="/k/today">查看详情 ›</a></div>
        <div class="summary-row"><div class="summary-item"><span>新词</span><strong>${todayWords}</strong></div>
        <div class="summary-item"><span>复习</span><strong>${dueWords}</strong></div>
        <div class="summary-item"><span>阅读</span><strong>${todayReading} 篇</strong></div></div></section>
      ${productFooter()}`,
  }));
}

async function todayPage(env, user, account) {
  await touchAccountActivity(env, account.account_id);
  const [stats, recent] = await Promise.all([userDashboardStats(env, user.id), latestReading(env, user.id)]);
  const tasks = [
    ["阅读", Number(stats?.today_reading || 0) > 0, recent ? `继续《${recent.title}》` : "从书架选择读物", "/k/books"],
    ["新词", Number(stats?.today_words || 0) > 0, `今日计划 ${Number(stats?.batch_size || 14)} 词`, "/k/words"],
    ["复习", Number(stats?.due_words || 0) === 0, `待复习 ${Number(stats?.due_words || 0)} 词`, "/k/words"],
    ["学习计划", Boolean(stats?.plan_configured), stats?.plan_configured ? "计划已设置" : "尚未设置", "/k/words/setup"],
  ];
  return htmlResponse(layout({
    title: "今日任务",
    body: `<h1>今日任务</h1><p class="muted">轻量完成即可，不累计复习债务。</p>
      ${tasks.map(([title, done, detail, href]) => `<a class="card menu-card" href="${href}"><span class="menu-icon">${done ? "✓" : "○"}</span><strong>${title}</strong><span>${escapeHtml(detail)}</span><span class="menu-arrow">${iconSvg("next")}</span></a>`).join("")}`,
    nav: '<a href="/k/home">返回主页</a>',
  }));
}

async function myPage(env, user, account) {
  await touchAccountActivity(env, account.account_id);
  const [stats, recent] = await Promise.all([userDashboardStats(env, user.id), latestReading(env, user.id)]);
  const isParent = account.role === "parent";
  return htmlResponse(layout({
    title: "我的",
    brand: false,
    body: `<div class="shelf-head"><div class="shelf-title"><h1>我的</h1><p>当前账户与设置</p></div><div class="shelf-actions"><a class="top-link" href="/k/home">${iconSvg("back")} 返回主页</a></div></div>
      <section class="card account-card"><strong>${escapeHtml(user.display_name)}</strong>　<span class="small-action">${isParent ? "家长账户" : "当前账户"}</span>
        <p>今日已学习 ${Number(stats?.today_words || 0)} 词 / 阅读 ${Number(stats?.today_reading || 0)} 篇</p></section>
      <a class="card menu-card" href="/k/settings"><span class="menu-icon">${iconSvg("display")}</span><strong>显示设置</strong><span>字号、行距、阅读显示</span><span class="menu-arrow">${iconSvg("next")}</span></a>
      ${isParent ? "" : `<a class="card menu-card" href="/k/words/setup"><span class="menu-icon">${iconSvg("settings")}</span><strong>学习设置</strong><span>每日新词量 7 / 14 / 21 / 28</span><span class="menu-arrow">${iconSvg("next")}</span></a>`}
      <a class="card menu-card" href="/parent"><span class="menu-icon">${iconSvg("family")}</span><strong>账户与家庭</strong><span>${isParent ? "家庭成员、孩子与学习计划" : "当前账户、切换账户、申请成为家长"}</span><span class="menu-arrow">${iconSvg("next")}</span></a>
      <a class="card menu-card" href="${isParent ? "/parent/children" : "/k/records"}"><span class="menu-icon">${iconSvg("clock")}</span><strong>阅读记录 / 学习记录</strong><span>${recent ? `最近阅读《${escapeHtml(recent.title)}》` : "查看阅读与学习历史"}</span><span class="menu-arrow">${iconSvg("next")}</span></a>
      <a class="card menu-card" href="/k/logout"><span class="menu-icon">${iconSvg("logout")}</span><strong>退出登录</strong><span>退出当前账户，或切换到其他账户</span><span class="menu-arrow">${iconSvg("next")}</span></a>
      ${productFooter()}`,
  }));
}

async function settingsPage(request, env, session, user) {
  const pageUrl = new URL(request.url);
  const returnTo = safeAccountReturnTo(pageUrl.searchParams.get("return_to"), "/k/me");
  if (request.method === "POST") {
    const form = await request.formData();
    if (!safeEqual(String(form.get("csrf_token") || ""), session.csrf_token)) {
      return errorPage(403, "CSRF 校验失败", "表单已过期，请返回后重试。");
    }
    const fontSize = String(form.get("reading_font_scale") || "");
    if (!["standard", "large", "extra_large", "extra_extra_large"].includes(fontSize)) {
      return errorPage(400, "设置无效", "请选择标准、大、加大或特大字号。");
    }
    const lineSpacing = String(form.get("reading_line_spacing") || "");
    if (!["compact", "standard", "comfortable"].includes(lineSpacing)) {
      return errorPage(400, "设置无效", "请选择紧凑、标准或舒适行距。");
    }
    await env.DB.prepare(`
      UPDATE user_preferences SET reading_font_scale = ?, reading_line_spacing = ?, updated_at = datetime('now') WHERE user_id = ?
    `).bind(fontSize, lineSpacing, user.id).run();
    return redirect(returnTo);
  }
  const pref = await env.DB.prepare(`
    SELECT reading_font_scale, reading_line_spacing FROM user_preferences WHERE user_id = ? LIMIT 1
  `).bind(user.id).first();
  const current = pref?.reading_font_scale || "standard";
  const currentSpacing = pref?.reading_line_spacing || "comfortable";
  return htmlResponse(layout({
    title: "个人显示设置",
    body: `<h1>显示设置</h1>
      <p class="muted">设置仅属于 ${escapeHtml(user.display_name)}，并应用于所有读物。</p>
      ${urlFlag(request.url, "saved") ? '<div class="notice">阅读显示设置已保存。</div>' : ""}
      <form method="post" action="/k/settings?return_to=${encodeURIComponent(returnTo)}">
        <input type="hidden" name="csrf_token" value="${escapeHtml(session.csrf_token)}">
        <fieldset>
          <legend>阅读字号</legend>
          ${["standard", "large", "extra_large", "extra_extra_large"].map((value, index) => `
            <label class="radio-line"><input type="radio" name="reading_font_scale" value="${value}" ${current === value ? "checked" : ""}> ${["标准（微信读书参考）", "大", "加大", "最大"][index]}</label>
          `).join("")}
        </fieldset>
        <fieldset><legend>阅读行距</legend>
          ${["compact", "standard", "comfortable"].map((value, index) => `<label class="radio-line"><input type="radio" name="reading_line_spacing" value="${value}" ${currentSpacing === value ? "checked" : ""}> ${["紧凑", "标准", "舒适（默认）"][index]}</label>`).join("")}
        </fieldset>
        <input type="submit" value="保存设置">
      </form>`,
    nav: returnTo.startsWith("/k/read/")
      ? `<a href="${escapeHtml(returnTo)}">返回阅读</a>`
      : `<a href="/k/me">返回我的</a> | <a href="/k/home">返回主页</a>`,
  }));
}

function urlFlag(rawUrl, name) {
  return new URL(rawUrl).searchParams.get(name) === "1";
}

async function deviceTest(request, env, url) {
  const cookies = parseCookies(request);
  const csrf = cookies[COOKIE_TEST_CSRF] || randomToken(18);
  const cookieCheck = url.searchParams.get("cookie_check") === "1";
  const cookieWorks = cookieCheck && cookies[COOKIE_TEST] === "works";
  const postResult = url.searchParams.get("post") === "ok";
  const ua = request.headers.get("user-agent") || "未提供";
  const script = `<script>
  (function () {
    var e = document.getElementById("js-result");
    if (e) e.innerHTML = "JavaScript：可用（核心功能不依赖）";
    var v = document.getElementById("viewport-result");
    if (v) v.innerHTML = "视口：" + document.documentElement.clientWidth + " × " + document.documentElement.clientHeight + "；方向：" + (document.documentElement.clientWidth > document.documentElement.clientHeight ? "横屏" : "竖屏");
  }());
  </script>`;
  const page = layout({
    title: "设备兼容性测试",
    body: `<h1>设备兼容性测试</h1>
      <p><strong>中文显示：</strong>墨读，昆明，阅读与单词学习。</p>
      <p><strong>English:</strong> Kindle reading and English practice.</p>
      <p><strong>标点：</strong>“中文”，English; 123 — 测试。</p>
      <p><strong>粗体：</strong><b>这是一段粗体文字 Bold text.</b></p>
      <div class="line-thin">上方是细线</div>
      <div class="line-thick">上方是粗线</div>
      <div class="gray-1">浅灰</div><div class="gray-2">中灰</div><div class="gray-3">深灰</div>
      <h2>服务器识别</h2>
      <p>请求时间：${escapeHtml(kunmingNow())}<br>
      设备类型：${/kindle|silk/i.test(ua) ? "可能是 Kindle" : "普通浏览器或未知设备"}<br>
      User-Agent：<code>${escapeHtml(ua)}</code></p>
      <p id="viewport-result">视口：需要 JavaScript 才能附加检测；核心页面不依赖此结果。</p>
      <p id="js-result">JavaScript：未检测到或已关闭。</p>
      <h2>普通链接</h2>
      <p><a href="/device-test?link=ok">点击普通链接重新载入本页</a></p>
      ${url.searchParams.get("link") === "ok" ? '<div class="notice">普通链接：成功</div>' : ""}
      <h2>GET 表单</h2>
      <form method="get" action="/device-test">
        <label for="get_text">输入测试文字</label>
        <input id="get_text" name="get_text" type="text" value="${escapeHtml(url.searchParams.get("get_text") || "")}">
        <fieldset><legend>单选按钮</legend>
          <label class="radio-line"><input type="radio" name="choice" value="a" checked> 选项 A</label>
          <label class="radio-line"><input type="radio" name="choice" value="b"> 选项 B</label>
        </fieldset>
        <input type="submit" value="提交 GET 测试">
      </form>
      ${url.searchParams.has("get_text") ? `<div class="notice">GET 成功：${escapeHtml(url.searchParams.get("get_text"))}</div>` : ""}
      <h2>POST 表单</h2>
      <form method="post" action="/device-test/post">
        <input type="hidden" name="csrf_token" value="${escapeHtml(csrf)}">
        <label for="post_text">输入测试文字</label>
        <input id="post_text" name="post_text" type="text" required>
        <input type="submit" value="提交 POST 测试">
      </form>
      ${postResult ? '<div class="notice">POST 成功</div>' : ""}
      <h2>Cookie</h2>
      <p><a class="button" href="/device-test/cookie">设置 Cookie 并检查</a></p>
      ${cookieCheck ? `<div class="notice">Cookie：${cookieWorks ? "成功" : "未成功，请检查浏览器设置"}</div>` : ""}
      <h2>Meta refresh</h2>
      <p><a href="/device-test/meta">打开 5 秒自动跳转测试</a></p>
      <p class="muted">文件上传只在管理员或家长功能页测试，不要求 Kindle 上传文件。</p>`,
    nav: '<a href="/k">Kindle 入口</a> | <a href="/admin">管理员后台</a>',
    script,
  });
  const headers = { "set-cookie": `${COOKIE_TEST_CSRF}=${encodeURIComponent(csrf)}; Path=/device-test; Max-Age=3600; SameSite=Lax` };
  return htmlResponse(page, 200, headers);
}

async function deviceTestPost(request) {
  const cookies = parseCookies(request);
  const form = await request.formData();
  if (!safeEqual(cookies[COOKIE_TEST_CSRF] || "", String(form.get("csrf_token") || ""))) {
    return errorPage(403, "表单已过期", "请返回设备测试页重新提交。");
  }
  return redirect("/device-test?post=ok");
}

function deviceTestMeta() {
  return htmlResponse(layout({
    title: "Meta refresh 测试",
    extraHead: '<meta http-equiv="refresh" content="5;url=/device-test?meta=ok">',
    body: '<h1>Meta refresh 测试</h1><p>如果浏览器支持，5 秒后将返回测试页。</p><p><a href="/device-test?meta=manual">不等待，手动返回</a></p>',
  }));
}

async function adminReviews(request, env, identity, url) {
  const csrf = await adminCsrf(identity, env);
  if (request.method === "POST") {
    const form = await request.formData();
    const admin = await requireAdminPost(request, env, form);
    if (admin.response) return admin.response;
    const kind = String(form.get("kind") || "");
    const id = String(form.get("id") || "");
    const decision = String(form.get("decision") || "");
    const notes = String(form.get("review_notes") || "").trim().slice(0, 1000) || null;
    if (!["approve", "reject"].includes(decision)) return errorPage(400, "审核决定无效", "请选择通过或驳回。");
    if (kind === "parent") {
      const application = await env.DB.prepare(`SELECT account_id FROM parent_applications WHERE id = ? AND status = 'pending' LIMIT 1`).bind(id).first();
      if (!application) return errorPage(404, "申请不存在", "该申请已处理或不存在。");
      const status = decision === "approve" ? "approved" : "rejected";
      const statements = [
        env.DB.prepare(`
          UPDATE parent_applications SET status = ?, review_notes = ?, reviewed_by = ?,
            reviewed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?
        `).bind(status, notes, identity.username, id),
      ];
      if (decision === "approve") {
        statements.push(env.DB.prepare(`UPDATE accounts SET role = 'parent', updated_at = datetime('now') WHERE id = ?`).bind(application.account_id));
      }
      await env.DB.batch(statements);
    } else if (kind === "book") {
      const status = decision === "approve" ? "approved" : "rejected";
      await env.DB.prepare(`
        UPDATE books SET review_status = ?, status = ?, review_notes = ?, reviewed_by = ?,
          reviewed_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ? AND review_status = 'pending'
      `).bind(status, decision === "approve" ? "published" : "preview", notes, identity.username, id).run();
    } else {
      return errorPage(400, "审核类型无效", "无法识别该审核项目。");
    }
    return redirect("/admin/reviews?notice=reviewed");
  }
  const applications = await env.DB.prepare(`
    SELECT pa.id, pa.reason, pa.created_at, a.username
    FROM parent_applications pa JOIN accounts a ON a.id = pa.account_id
    WHERE pa.status = 'pending' ORDER BY pa.created_at
  `).all();
  const books = await env.DB.prepare(`
    SELECT b.id, b.title, b.author, b.summary, b.submitted_at, a.username
    FROM books b LEFT JOIN accounts a ON a.id = b.uploader_account_id
    WHERE b.review_status = 'pending' AND b.uploader_account_id IS NOT NULL
    ORDER BY b.submitted_at
  `).all();
  const parentCards = (applications.results || []).map((item) => `<section class="card">
    <h2>家长申请：${escapeHtml(item.username)}</h2>
    <p>申请说明：${escapeHtml(item.reason || "未填写")}<br>提交时间：${escapeHtml(item.created_at)}</p>
    <form method="post" action="/admin/reviews">
      <input type="hidden" name="csrf_token" value="${escapeHtml(csrf || "")}">
      <input type="hidden" name="kind" value="parent"><input type="hidden" name="id" value="${escapeHtml(item.id)}">
      <label for="notes_parent_${escapeHtml(item.id)}">审核说明</label>
      <textarea id="notes_parent_${escapeHtml(item.id)}" name="review_notes" rows="2"></textarea>
      <button type="submit" name="decision" value="approve">通过家长申请</button>
      <button type="submit" name="decision" value="reject">驳回家长申请</button>
    </form>
  </section>`).join("");
  const bookCards = (books.results || []).map((item) => `<section class="card">
    <h2>读物：${escapeHtml(item.title)}</h2>
    <p>上传家长：${escapeHtml(item.username || "未知")}<br>作者：${escapeHtml(item.author || "未署名")}<br>
    简介：${escapeHtml(item.summary || "未填写")}<br>提交时间：${escapeHtml(item.submitted_at || "")}</p>
    <form method="post" action="/admin/reviews">
      <input type="hidden" name="csrf_token" value="${escapeHtml(csrf || "")}">
      <input type="hidden" name="kind" value="book"><input type="hidden" name="id" value="${escapeHtml(item.id)}">
      <label for="notes_book_${escapeHtml(item.id)}">审核说明</label>
      <textarea id="notes_book_${escapeHtml(item.id)}" name="review_notes" rows="2"></textarea>
      <button type="submit" name="decision" value="approve">审核通过并上架</button>
      <button type="submit" name="decision" value="reject">驳回上架</button>
    </form>
  </section>`).join("");
  return htmlResponse(layout({
    title: "注册与上架审核",
    admin: true,
    body: `${adminNavigation()}<h1>注册与上架审核</h1>
      ${url.searchParams.get("notice") === "reviewed" ? '<div class="notice">审核结果已保存。</div>' : ""}
      <h2>家长申请</h2>${parentCards || "<p>暂无待审核家长申请。</p>"}
      <h2>读物上架</h2>${bookCards || "<p>暂无待读物审核。</p>"}`,
    nav: '<a href="/admin">返回管理员总览</a>',
  }));
}

async function adminAssessments(request, env, identity, url) {
  const csrf = await adminCsrf(identity, env);
  if (request.method === "POST") {
    const form = await request.formData();
    const admin = await requireAdminPost(request, env, form);
    if (admin.response) return admin.response;
    const title = String(form.get("title") || "").trim().slice(0, 120);
    const selected = form.getAll("question_types").map(String).filter((type) => KINDLE_SAFE_QUESTION_TYPES.includes(type));
    if (!title || !selected.length) return errorPage(400, "考核库信息不完整", "请填写标题并至少选择一种免输入题型。");
    await env.DB.prepare(`
      INSERT INTO assessment_libraries
        (id, title, description, question_types_json, status, reviewed_by, reviewed_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'approved', ?, datetime('now'), datetime('now'), datetime('now'))
    `).bind(
      crypto.randomUUID(), title,
      String(form.get("description") || "").trim().slice(0, 1000) || null,
      JSON.stringify([...new Set(selected)]), identity.username,
    ).run();
    return redirect("/admin/assessments?notice=created");
  }
  const result = await env.DB.prepare(`
    SELECT id, title, description, question_types_json, status, created_at
    FROM assessment_libraries ORDER BY created_at DESC
  `).all();
  const rows = (result.results || []).map((item) => `<tr><td>${escapeHtml(item.title)}</td>
    <td>${escapeHtml(item.description || "—")}</td><td>${escapeHtml(item.question_types_json)}</td>
    <td>${escapeHtml(item.status)}</td></tr>`).join("");
  const labels = {
    choice_en_zh: "英译中选择", choice_zh_en: "中译英选择", grammar_choice: "语法选择",
    phrase_choice: "词组选择", sentence_fill: "句子选择填空", tense_choice: "时态选择", true_false: "判断题",
  };
  return htmlResponse(layout({
    title: "单词考核库",
    admin: true,
    body: `${adminNavigation()}<h1>单词考核库</h1>
      ${url.searchParams.get("notice") === "created" ? '<div class="notice">考核库已建立，可供家长选择。</div>' : ""}
      <p>这里只建立无需 Kindle 输入法的考核范围和方式。未来新增题型也必须是选择或判断交互。</p>
      <section class="card"><h2>新增考核库</h2>
        <form method="post" action="/admin/assessments">
          <input type="hidden" name="csrf_token" value="${escapeHtml(csrf || "")}">
          <label for="title">名称</label><input id="title" name="title" type="text" maxlength="120" required>
          <label for="description">说明</label><textarea id="description" name="description" rows="3"></textarea>
          <fieldset><legend>考核方式</legend>
            ${KINDLE_SAFE_QUESTION_TYPES.map((type) => `<label class="radio-line"><input type="checkbox" name="question_types" value="${type}"> ${escapeHtml(labels[type])}</label>`).join("")}
          </fieldset>
          <input type="submit" value="建立并开放给家长">
        </form>
      </section>
      <table><thead><tr><th>名称</th><th>说明</th><th>题型</th><th>状态</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4">暂无考核库。</td></tr>'}</tbody></table>`,
    nav: '<a href="/admin">返回管理员总览</a>',
  }));
}

async function adminDashboard(request, env, identity) {
  const csrf = await adminCsrf(identity, env);
  const weather = await weatherBlock(env);
  const counts = await env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM users WHERE status = 'active') AS users,
      (SELECT COUNT(*) FROM devices WHERE status = 'active') AS devices,
      (SELECT COUNT(*) FROM books WHERE status = 'published' AND review_status = 'approved') AS books,
      (SELECT COUNT(*) FROM parent_applications WHERE status = 'pending') AS pending_parents,
      (SELECT COUNT(*) FROM books WHERE review_status = 'pending' AND uploader_account_id IS NOT NULL) AS pending_books,
      (SELECT COUNT(*) FROM vocabulary_occurrences WHERE verification_status = 'verified') AS verified_words
  `).first();
  return htmlResponse(layout({
    title: "管理员后台",
    admin: true,
    body: `${adminNavigation()}
      <h1>管理员后台</h1>
      <p class="muted">当前管理员：${escapeHtml(identity.email)}</p>
      ${weather}
      ${csrf ? "" : '<div class="warning">管理表单密钥尚未配置，写操作暂时不可用。</div>'}
      <div class="card"><h2>系统状态</h2>
        <p>活跃使用者：${Number(counts?.users || 0)}<br>
        活跃 Kindle 设备：${Number(counts?.devices || 0)}<br>
        已发布读物：${Number(counts?.books || 0)}<br>
        待审核家长申请：${Number(counts?.pending_parents || 0)}<br>
        待审核读物：${Number(counts?.pending_books || 0)}<br>
        已审核正式词汇关联：${Number(counts?.verified_words || 0)}</p>
      </div>
      <div class="card"><strong>内容审核规则</strong>
        <p>只有 <code>verified</code> 内容进入正式练习；待审核和演示内容不会混入家庭任务。</p>
      </div>`,
    nav: '<a href="/k">Kindle 入口</a>',
  }));
}

async function adminUsers(env, identity, url) {
  const result = await env.DB.prepare(`
    SELECT u.id, u.display_name, a.username, a.role, a.status, a.created_at, a.last_active_at,
      (SELECT MAX(rp.last_read_at) FROM reading_progress rp WHERE rp.user_id = u.id) AS last_read_at,
      (SELECT MAX(x.event_at) FROM modu_vocab_learning_events x WHERE x.user_id = u.id) AS last_word_at,
      (SELECT COUNT(*) FROM reading_progress rp WHERE rp.user_id = u.id) AS progress_count,
      (SELECT COUNT(*) FROM attempts atp WHERE atp.user_id = u.id) AS attempt_count,
      (SELECT COUNT(*) FROM mistakes m WHERE m.user_id = u.id) AS mistake_count
    FROM accounts a
    LEFT JOIN users u ON u.id = a.user_id
    ORDER BY a.created_at DESC
    LIMIT 100
  `).all();
  const rows = (result.results || []).map((user) => `<tr>
    <td>${user.id ? `<a href="/admin/users/${encodeURIComponent(user.id)}">${escapeHtml(user.display_name || user.username)}</a>` : escapeHtml(user.username)}</td>
    <td>${escapeHtml(user.id || "—")}</td>
    <td>${escapeHtml(user.created_at || "历史用户 / 未记录")}</td>
    <td>${escapeHtml(user.last_active_at || "未记录")}</td>
    <td>${escapeHtml(user.last_read_at || "—")}</td>
    <td>${escapeHtml(user.last_word_at || "—")}</td>
    <td>${escapeHtml(user.role === "parent" ? "家长" : user.role === "admin" ? "管理员" : "孩子")}</td>
    <td>${escapeHtml(user.status === "active" ? "正常" : user.status)}</td>
  </tr>`).join("");
  return htmlResponse(layout({
    title: "账户管理",
    admin: true,
    body: `${adminNavigation()}<h1>账户管理</h1>
      ${noticeText(url?.searchParams.get("notice")) ? `<div class="notice">${escapeHtml(noticeText(url.searchParams.get("notice")))}</div>` : ""}
      <p class="muted">管理员：${escapeHtml(identity.email)}</p>
      <p>账户只能由用户在产品入口填写用户名和密码注册，管理员不能绕过注册流程新增使用者。</p>
      <table><thead><tr><th>昵称</th><th>用户 ID</th><th>注册时间</th><th>最近使用</th><th>最近阅读</th><th>最近单词</th><th>身份</th><th>状态</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="8">暂无注册账户。</td></tr>'}</tbody></table>`,
    nav: '<a href="/admin">返回总览</a>',
  }));
}

async function adminUserDetail(request, env, identity, url, userId) {
  const csrf = await adminCsrf(identity, env);
  const user = await env.DB.prepare(`
    SELECT u.*, up.reading_font_size, up.reading_font_scale, up.reading_line_spacing,
      up.part_c_enabled, up.extension_enabled,
      a.username, a.role, a.status AS account_status, a.created_at AS registered_at, a.last_active_at
    FROM users u LEFT JOIN user_preferences up ON up.user_id = u.id
    LEFT JOIN accounts a ON a.user_id = u.id
    WHERE u.id = ? LIMIT 1
  `).bind(userId).first();
  if (!user) return errorPage(404, "使用者不存在", "该使用者不存在或已经删除。", '<a href="/admin/users">返回使用者管理</a>');
  const counts = await env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM reading_progress WHERE user_id = ?) AS progress_count,
      (SELECT COUNT(*) FROM attempts WHERE user_id = ?) AS attempt_count,
      (SELECT COUNT(*) FROM mistakes WHERE user_id = ?) AS mistake_count,
      (SELECT COUNT(*) FROM practice_sessions WHERE user_id = ?) AS session_count,
      (SELECT COUNT(*) FROM modu_vocab_progress WHERE user_id = ?) AS learned_words,
      (SELECT COUNT(*) FROM modu_vocab_progress WHERE user_id = ? AND stage = 'familiar') AS familiar_words,
      (SELECT COUNT(*) FROM modu_vocab_progress WHERE user_id = ? AND stage = 'mastered') AS mastered_words,
      (SELECT COUNT(*) FROM modu_vocab_sessions WHERE user_id = ? AND started_at >= datetime('now', '-7 days')) AS sessions_7d,
      (SELECT MAX(last_read_at) FROM reading_progress WHERE user_id = ?) AS latest_reading,
      (SELECT MAX(event_at) FROM modu_vocab_learning_events WHERE user_id = ?) AS latest_learning
  `).bind(userId, userId, userId, userId, userId, userId, userId, userId, userId, userId).first();
  const progress = await env.DB.prepare(`
    SELECT b.title, c.title AS chapter_title, rp.page, rp.font_size, rp.last_read_at
    FROM reading_progress rp JOIN books b ON b.id = rp.book_id
    LEFT JOIN chapters c ON c.id = rp.chapter_id
    WHERE rp.user_id = ? ORDER BY rp.last_read_at DESC
  `).bind(userId).all();
  const progressRows = (progress.results || []).map((row) => `<tr><td>${escapeHtml(row.title)}</td><td>${escapeHtml(row.chapter_title || "—")}</td><td>${Number(row.page)}</td><td>${escapeHtml(row.font_size)}</td><td>${escapeHtml(row.last_read_at || "—")}</td></tr>`).join("");
  const notice = noticeText(url.searchParams.get("notice"));
  return htmlResponse(layout({
    title: `${user.display_name} · 使用者详情`,
    admin: true,
    body: `${adminNavigation()}<h1>使用者详情：${escapeHtml(user.display_name)}</h1>
      ${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ""}
      <p>用户 ID：${escapeHtml(user.id)}<br>
      身份：${escapeHtml(user.role === "parent" ? "家长" : "孩子")}<br>
      注册日期：${escapeHtml(user.registered_at || "历史用户 / 未记录")}<br>
      最近登录或使用：${escapeHtml(user.last_active_at || "未记录")}<br>
      最近阅读：${escapeHtml(counts?.latest_reading || "未记录")}<br>
      最近单词学习：${escapeHtml(counts?.latest_learning || "未记录")}</p>
      <section class="card"><h2>编辑资料</h2>
        <form method="post" action="/admin/users/${escapeHtml(user.id)}">
          <input type="hidden" name="csrf_token" value="${escapeHtml(csrf || "")}">
          <label for="display_name">昵称</label><input id="display_name" name="display_name" type="text" maxlength="20" value="${escapeHtml(user.display_name)}" required>
          <label for="status">状态</label><select id="status" name="status">
            <option value="active"${user.status === "active" ? " selected" : ""}>启用</option>
            <option value="disabled"${user.status === "disabled" ? " selected" : ""}>停用</option>
          </select>
          <input type="submit" value="保存资料">
        </form>
      </section>
      <section class="card"><h2>个人数据</h2><p>阅读进度：${Number(counts?.progress_count || 0)}<br>
        练习会话：${Number(counts?.session_count || 0)}<br>答题记录：${Number(counts?.attempt_count || 0)}<br>错题：${Number(counts?.mistake_count || 0)}</p>
        <p>学习过的单词：${Number(counts?.learned_words || 0)}<br>熟悉词：${Number(counts?.familiar_words || 0)}<br>
        掌握词：${Number(counts?.mastered_words || 0)}<br>最近 7 天学习次数：${Number(counts?.sessions_7d || 0)}</p>
        <a class="button" href="/admin/users/${escapeHtml(user.id)}/export">导出个人数据</a>
        <a class="button" href="/admin/users/${escapeHtml(user.id)}/clear">清空学习记录</a>
        <a class="button" href="/admin/users/${escapeHtml(user.id)}/delete">删除使用者</a>
      </section>
      <h2>读物阅读进度</h2>
      <table><thead><tr><th>读物</th><th>章节</th><th>页</th><th>字号</th><th>最近阅读</th></tr></thead>
      <tbody>${progressRows || '<tr><td colspan="5">暂无阅读记录。</td></tr>'}</tbody></table>`,
    nav: '<a href="/admin/plans">学习计划</a> | <a href="/admin/users">返回使用者列表</a>',
  }));
}

async function adminUpdateUser(request, env, userId) {
  const form = await request.formData();
  const admin = await requireAdminPost(request, env, form);
  if (admin.response) return admin.response;
  const validation = normalizeAccountName(form.get("display_name"));
  if (validation.error) return errorPage(400, "无法保存使用者", validation.error, `<a href="/admin/users/${escapeHtml(userId)}">返回</a>`);
  const status = form.get("status") === "disabled" ? "disabled" : "active";
  try {
    await env.DB.prepare(`
      UPDATE users SET display_name = ?, normalized_name = ?, status = ?, updated_at = datetime('now')
      WHERE id = ? AND status != 'deleted'
    `).bind(validation.display, validation.normalized, status, userId).run();
  } catch {
    return errorPage(409, "无法保存使用者", "同一家庭中已有相同昵称。", `<a href="/admin/users/${escapeHtml(userId)}">返回</a>`);
  }
  return redirect(`/admin/users/${encodeURIComponent(userId)}?notice=user_saved`);
}

async function adminUserConfirm(request, env, identity, userId, action) {
  const csrf = await adminCsrf(identity, env);
  const user = await env.DB.prepare(`SELECT id, display_name, status FROM users WHERE id = ? LIMIT 1`).bind(userId).first();
  if (!user) return errorPage(404, "使用者不存在", "该使用者不存在。", '<a href="/admin/users">返回使用者列表</a>');
  const counts = await env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM reading_progress WHERE user_id = ?) AS progress_count,
      (SELECT COUNT(*) FROM attempts WHERE user_id = ?) AS attempt_count,
      (SELECT COUNT(*) FROM mistakes WHERE user_id = ?) AS mistake_count
  `).bind(userId, userId, userId).first();
  const deleting = action === "delete";
  return htmlResponse(layout({
    title: deleting ? "确认删除使用者" : "确认清空学习记录",
    admin: true,
    body: `${adminNavigation()}<h1>${deleting ? "确认删除使用者" : "确认清空学习记录"}</h1>
      <div class="warning"><p>使用者：<strong>${escapeHtml(user.display_name)}</strong></p>
        <p>阅读进度：${Number(counts?.progress_count || 0)}<br>答题记录：${Number(counts?.attempt_count || 0)}<br>错题：${Number(counts?.mistake_count || 0)}</p>
        <p>${deleting ? "删除后，该使用者的阅读进度、学习计划、练习、答题和错题将一并删除，无法恢复；其他使用者不受影响。建议优先停用。" : "清空后会删除练习、答题、错题、掌握状态和每日统计；使用者及阅读进度保留。"}</p>
      </div>
      <form method="post" action="/admin/users/${escapeHtml(user.id)}/${action}">
        <input type="hidden" name="csrf_token" value="${escapeHtml(csrf || "")}">
        <input type="submit" value="${deleting ? "确认永久删除" : "确认清空学习记录"}">
      </form>`,
    nav: `<a href="/admin/users/${escapeHtml(user.id)}">取消并返回</a>`,
  }));
}

async function adminUserDestructive(request, env, userId, action) {
  const form = await request.formData();
  const admin = await requireAdminPost(request, env, form);
  if (admin.response) return admin.response;
  if (action === "delete") {
    await env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(userId).run();
    return redirect("/admin/users?notice=user_deleted");
  }
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM attempts WHERE user_id = ?`).bind(userId),
    env.DB.prepare(`DELETE FROM mistakes WHERE user_id = ?`).bind(userId),
    env.DB.prepare(`DELETE FROM mastery_records WHERE user_id = ?`).bind(userId),
    env.DB.prepare(`DELETE FROM daily_user_stats WHERE user_id = ?`).bind(userId),
    env.DB.prepare(`DELETE FROM practice_sessions WHERE user_id = ?`).bind(userId),
  ]);
  return redirect(`/admin/users/${encodeURIComponent(userId)}?notice=learning_cleared`);
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function csvResponse(filename, rows) {
  const body = "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, no-store",
    },
  });
}

async function adminUserExport(env, userId) {
  const user = await env.DB.prepare(`SELECT * FROM users WHERE id = ? LIMIT 1`).bind(userId).first();
  if (!user) return errorPage(404, "使用者不存在", "无法导出该使用者。", '<a href="/admin/users">返回</a>');
  const attempts = await env.DB.prepare(`
    SELECT a.created_at, q.question_type, q.prompt, a.answer, q.correct_answer, a.is_correct
    FROM attempts a JOIN questions q ON q.id = a.question_id
    WHERE a.user_id = ? ORDER BY a.created_at
  `).bind(userId).all();
  const rows = [["使用者", "答题时间", "题型", "题目", "作答", "正确答案", "是否正确"]];
  for (const item of attempts.results || []) rows.push([user.display_name, item.created_at, item.question_type, item.prompt, item.answer, item.correct_answer, item.is_correct ? "正确" : "错误"]);
  return csvResponse(`modu-user-${userId}.csv`, rows);
}

async function adminPlans(request, env, identity, url) {
  const csrf = await adminCsrf(identity, env);
  if (request.method === "POST") {
    const form = await request.formData();
    const admin = await requireAdminPost(request, env, form);
    if (admin.response) return admin.response;
    const userId = String(form.get("user_id") || "");
    const user = await env.DB.prepare(`SELECT id FROM users WHERE id = ? AND status != 'deleted'`).bind(userId).first();
    if (!user) return errorPage(404, "使用者不存在", "无法为该使用者保存学习计划。", '<a href="/admin/plans">返回学习计划</a>');
    await env.DB.prepare(`UPDATE study_plans SET status = 'paused', updated_at = datetime('now') WHERE user_id = ? AND status = 'active'`).bind(userId).run();
    const status = form.get("status") === "paused" ? "paused" : "active";
    await env.DB.prepare(`
      INSERT INTO study_plans
        (id, user_id, name, start_date, end_date, include_previous, daily_new_words, daily_review_words,
         daily_phrases, daily_grammar, weekend_enabled, mistakes_only, part_c_enabled, extension_enabled,
         status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      crypto.randomUUID(), userId, String(form.get("name") || "家庭学习计划").trim().slice(0, 80),
      String(form.get("start_date") || "") || null, String(form.get("end_date") || "") || null,
      form.get("include_previous") === "1" ? 1 : 0,
      Math.max(0, Math.min(100, Number(form.get("daily_new_words") || 10))),
      Math.max(0, Math.min(200, Number(form.get("daily_review_words") || 20))),
      Math.max(0, Math.min(100, Number(form.get("daily_phrases") || 5))),
      Math.max(0, Math.min(100, Number(form.get("daily_grammar") || 5))),
      form.get("weekend_enabled") === "1" ? 1 : 0,
      form.get("mistakes_only") === "1" ? 1 : 0,
      form.get("part_c_enabled") === "1" ? 1 : 0,
      form.get("extension_enabled") === "1" ? 1 : 0,
      status,
    ).run();
    return redirect(`/admin/plans?notice=plan_saved&user_id=${encodeURIComponent(userId)}`);
  }
  const users = await env.DB.prepare(`
    SELECT u.id, u.display_name, u.status, sp.name AS plan_name, sp.status AS plan_status,
      sp.daily_new_words, sp.daily_review_words, sp.daily_phrases, sp.daily_grammar
    FROM users u LEFT JOIN study_plans sp ON sp.id = (
      SELECT id FROM study_plans x WHERE x.user_id = u.id ORDER BY x.created_at DESC LIMIT 1
    )
    WHERE u.status != 'deleted' ORDER BY u.display_name COLLATE NOCASE
  `).all();
  const selectedId = url.searchParams.get("user_id") || users.results?.[0]?.id || "";
  const selected = (users.results || []).find((item) => item.id === selectedId);
  const options = (users.results || []).map((item) => `<option value="${escapeHtml(item.id)}"${item.id === selectedId ? " selected" : ""}>${escapeHtml(item.display_name)}</option>`).join("");
  const rows = (users.results || []).map((item) => `<tr><td><a href="/admin/plans?user_id=${encodeURIComponent(item.id)}">${escapeHtml(item.display_name)}</a></td><td>${escapeHtml(item.plan_name || "未设置")}</td><td>${escapeHtml(item.plan_status || "—")}</td><td>${Number(item.daily_new_words ?? 10)} / ${Number(item.daily_review_words ?? 20)} / ${Number(item.daily_phrases ?? 5)} / ${Number(item.daily_grammar ?? 5)}</td></tr>`).join("");
  const notice = noticeText(url.searchParams.get("notice"));
  return htmlResponse(layout({
    title: "学习计划",
    admin: true,
    body: `${adminNavigation()}<h1>学习计划</h1>${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ""}
      <table><thead><tr><th>使用者</th><th>计划</th><th>状态</th><th>新词/复习/词组/语法</th></tr></thead><tbody>${rows || '<tr><td colspan="4">暂无使用者。</td></tr>'}</tbody></table>
      ${selected ? `<section class="card"><h2>为 ${escapeHtml(selected.display_name)} 建立新计划</h2>
        <form method="post" action="/admin/plans">
          <input type="hidden" name="csrf_token" value="${escapeHtml(csrf || "")}">
          <label for="user_id">使用者</label><select id="user_id" name="user_id">${options}</select>
          <label for="name">计划名称</label><input id="name" name="name" type="text" maxlength="80" value="${escapeHtml(selected.plan_name || "家庭学习计划")}" required>
          <label for="start_date">开始日期（可空）</label><input id="start_date" name="start_date" type="text" placeholder="2026-07-26">
          <label for="end_date">结束日期（可空）</label><input id="end_date" name="end_date" type="text" placeholder="2026-08-31">
          <label for="daily_new_words">每日新词</label><input id="daily_new_words" name="daily_new_words" type="number" min="0" max="100" value="${Number(selected.daily_new_words ?? 10)}">
          <label for="daily_review_words">每日复习</label><input id="daily_review_words" name="daily_review_words" type="number" min="0" max="200" value="${Number(selected.daily_review_words ?? 20)}">
          <label for="daily_phrases">每日固定搭配</label><input id="daily_phrases" name="daily_phrases" type="number" min="0" max="100" value="${Number(selected.daily_phrases ?? 5)}">
          <label for="daily_grammar">每日语法题</label><input id="daily_grammar" name="daily_grammar" type="number" min="0" max="100" value="${Number(selected.daily_grammar ?? 5)}">
          <label class="radio-line"><input type="checkbox" name="include_previous" value="1" checked> 包含以前学过的内容</label>
          <label class="radio-line"><input type="checkbox" name="weekend_enabled" value="1" checked> 启用周末任务</label>
          <label class="radio-line"><input type="checkbox" name="mistakes_only" value="1"> 只复习错题</label>
          <label class="radio-line"><input type="checkbox" name="part_c_enabled" value="1"> 启用 Part C</label>
          <label class="radio-line"><input type="checkbox" name="extension_enabled" value="1"> 启用扩展内容</label>
          <label for="status">计划状态</label><select id="status" name="status"><option value="active">启用</option><option value="paused">暂停</option></select>
          <input type="submit" value="保存为当前计划">
        </form>
      </section>` : ""}`,
    nav: '<a href="/admin">返回总览</a>',
  }));
}

function pageNumber(url) {
  return Math.max(1, Math.min(100000, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1));
}

async function adminKnowledgeList(env, identity, url, kind) {
  const config = {
    vocabulary: { title: "词汇", table: "vocabulary", columns: "v.id, v.display_form AS main, v.meaning_zh AS detail, v.part_of_speech AS extra, v.verification_status AS status", alias: "v", search: "v.display_form LIKE ? OR v.meaning_zh LIKE ?" },
    phrases: { title: "词组与固定搭配", table: "phrases", columns: "v.id, v.content_en AS main, v.meaning_zh AS detail, v.content_type AS extra, v.verification_status AS status", alias: "v", search: "v.content_en LIKE ? OR v.meaning_zh LIKE ?" },
    grammar: { title: "核心语法", table: "grammar_points", columns: "v.id, v.name AS main, v.explanation AS detail, v.structure AS extra, v.verification_status AS status", alias: "v", search: "v.name LIKE ? OR v.explanation LIKE ?" },
    questions: { title: "原创题库", table: "questions", columns: "v.id, v.prompt AS main, v.correct_answer AS detail, v.question_type AS extra, v.verification_status AS status", alias: "v", search: "v.prompt LIKE ? OR v.correct_answer LIKE ?" },
  }[kind];
  if (!config) return errorPage(404, "知识库页面不存在", "不支持该内容类型。", '<a href="/admin">返回后台</a>');
  const q = String(url.searchParams.get("q") || "").trim().slice(0, 80);
  const status = String(url.searchParams.get("status") || "").trim();
  const page = pageNumber(url);
  const where = [];
  const binds = [];
  if (q) { where.push(`(${config.search})`); binds.push(`%${q}%`, `%${q}%`); }
  if (["draft", "pending", "verified", "rejected", "disabled"].includes(status)) { where.push("v.verification_status = ?"); binds.push(status); }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const statement = env.DB.prepare(`SELECT ${config.columns} FROM ${config.table} ${config.alias} ${clause} ORDER BY v.updated_at DESC LIMIT 50 OFFSET ?`);
  const result = await statement.bind(...binds, (page - 1) * 50).all();
  const rows = (result.results || []).map((item) => `<tr><td>${kind === "vocabulary" ? `<a href="/admin/vocabulary/${encodeURIComponent(item.id)}">${escapeHtml(item.main)}</a>` : escapeHtml(item.main)}</td><td>${escapeHtml(item.detail || "—")}</td><td>${escapeHtml(item.extra || "—")}</td><td>${escapeHtml(item.status)}</td></tr>`).join("");
  const base = `/admin/${kind}?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}`;
  return htmlResponse(layout({
    title: config.title,
    admin: true,
    body: `${adminNavigation()}<h1>${config.title}</h1>
      <p><a href="/admin/vocabulary">词汇</a> | <a href="/admin/phrases">词组</a> | <a href="/admin/grammar">语法</a> | <a href="/admin/questions">题库</a> | <a href="/admin/imports">导入数据</a></p>
      <form method="get" action="/admin/${kind}">
        <label for="q">关键词</label><input id="q" name="q" type="text" value="${escapeHtml(q)}">
        <label for="status">审核状态</label><select id="status" name="status">
          <option value="">全部</option>${["verified", "pending", "draft", "rejected", "disabled"].map((item) => `<option value="${item}"${status === item ? " selected" : ""}>${item}</option>`).join("")}
        </select><input type="submit" value="筛选">
      </form>
      <table><thead><tr><th>内容</th><th>说明/答案</th><th>类型/结构</th><th>审核状态</th></tr></thead><tbody>${rows || '<tr><td colspan="4">没有符合条件的数据。</td></tr>'}</tbody></table>
      <p><a href="${base}&page=${Math.max(1, page - 1)}">上一页</a> | 第 ${page} 页 | <a href="${base}&page=${page + 1}">下一页</a></p>`,
    nav: '<a href="/admin">返回总览</a>',
  }));
}

async function adminVocabularyDetail(request, env, identity, url, vocabularyId) {
  const csrf = await adminCsrf(identity, env);
  if (request.method === "POST") {
    const form = await request.formData();
    const admin = await requireAdminPost(request, env, form);
    if (admin.response) return admin.response;
    const lemma = String(form.get("lemma") || "").trim().slice(0, 120);
    const meaning = String(form.get("meaning_zh") || "").trim().slice(0, 500);
    const status = String(form.get("verification_status") || "pending");
    if (!lemma || !meaning || !["draft", "pending", "verified", "rejected", "disabled"].includes(status)) {
      return errorPage(400, "词汇保存失败", "请填写词条、中文释义并选择有效审核状态。", `<a href="/admin/vocabulary/${escapeHtml(vocabularyId)}">返回编辑</a>`);
    }
    await env.DB.batch([
      env.DB.prepare(`
        UPDATE vocabulary SET lemma = ?, display_form = ?, meaning_zh = ?, part_of_speech = ?, phonetic = ?,
          plural_form = ?, third_person_singular = ?, present_participle = ?, past_tense = ?, past_participle = ?,
          comparative_form = ?, superlative_form = ?, synonyms = ?, antonyms = ?, usage_notes = ?,
          verification_status = ?, updated_at = datetime('now')
        WHERE id = ?
      `).bind(
        lemma, String(form.get("display_form") || lemma).trim().slice(0, 120), meaning,
        String(form.get("part_of_speech") || "").trim().slice(0, 80) || null,
        String(form.get("phonetic") || "").trim().slice(0, 120) || null,
        String(form.get("plural_form") || "").trim().slice(0, 120) || null,
        String(form.get("third_person_singular") || "").trim().slice(0, 120) || null,
        String(form.get("present_participle") || "").trim().slice(0, 120) || null,
        String(form.get("past_tense") || "").trim().slice(0, 120) || null,
        String(form.get("past_participle") || "").trim().slice(0, 120) || null,
        String(form.get("comparative_form") || "").trim().slice(0, 120) || null,
        String(form.get("superlative_form") || "").trim().slice(0, 120) || null,
        String(form.get("synonyms") || "").trim().slice(0, 300) || null,
        String(form.get("antonyms") || "").trim().slice(0, 300) || null,
        String(form.get("usage_notes") || "").trim().slice(0, 1000) || null,
        status, vocabularyId,
      ),
      env.DB.prepare(`
        INSERT INTO content_reviews (id, content_type, content_id, reviewer, status, notes, created_at, updated_at)
        VALUES (?, 'vocabulary', ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).bind(crypto.randomUUID(), vocabularyId, admin.identity.email, status, String(form.get("review_notes") || "").trim().slice(0, 1000)),
    ]);
    return redirect(`/admin/vocabulary/${encodeURIComponent(vocabularyId)}?notice=saved`);
  }
  const item = await env.DB.prepare(`SELECT * FROM vocabulary WHERE id = ? LIMIT 1`).bind(vocabularyId).first();
  if (!item) return errorPage(404, "词汇不存在", "该词汇不存在。", '<a href="/admin/vocabulary">返回词汇管理</a>');
  const occurrences = await env.DB.prepare(`
    SELECT t.grade, t.semester, u.unit_code, u.title, vo.learning_level, vo.verification_status
    FROM vocabulary_occurrences vo JOIN textbooks t ON t.id = vo.textbook_id JOIN units u ON u.id = vo.unit_id
    WHERE vo.vocabulary_id = ? ORDER BY t.grade, t.semester, u.sort_order
  `).bind(vocabularyId).all();
  const rows = (occurrences.results || []).map((row) => `<tr><td>${Number(row.grade)} 年级${Number(row.semester) === 1 ? "上册" : "下册"}</td><td>${escapeHtml(row.unit_code)} ${escapeHtml(row.title)}</td><td>${escapeHtml(row.learning_level)}</td><td>${escapeHtml(row.verification_status)}</td></tr>`).join("");
  return htmlResponse(layout({
    title: `编辑词汇 ${item.display_form}`,
    admin: true,
    body: `${adminNavigation()}<h1>编辑词汇：${escapeHtml(item.display_form)}</h1>
      ${url.searchParams.get("notice") === "saved" ? '<div class="notice">词汇和审核记录已保存。</div>' : ""}
      <form method="post" action="/admin/vocabulary/${escapeHtml(item.id)}">
        <input type="hidden" name="csrf_token" value="${escapeHtml(csrf || "")}">
        ${[
          ["lemma", "主词条", item.lemma], ["display_form", "显示形式", item.display_form],
          ["meaning_zh", "中文释义", item.meaning_zh], ["part_of_speech", "词性", item.part_of_speech],
          ["phonetic", "音标", item.phonetic], ["plural_form", "名词复数", item.plural_form],
          ["third_person_singular", "第三人称单数", item.third_person_singular], ["present_participle", "现在分词", item.present_participle],
          ["past_tense", "过去式", item.past_tense], ["past_participle", "过去分词", item.past_participle],
          ["comparative_form", "比较级", item.comparative_form], ["superlative_form", "最高级", item.superlative_form],
          ["synonyms", "同义词", item.synonyms], ["antonyms", "反义词", item.antonyms],
        ].map(([name, label, value]) => `<label for="${name}">${label}</label><input id="${name}" name="${name}" type="text" value="${escapeHtml(value || "")}"${name === "lemma" || name === "meaning_zh" ? " required" : ""}>`).join("")}
        <label for="usage_notes">使用备注</label><textarea id="usage_notes" name="usage_notes" rows="4">${escapeHtml(item.usage_notes || "")}</textarea>
        <label for="verification_status">审核状态</label><select id="verification_status" name="verification_status">${["draft", "pending", "verified", "rejected", "disabled"].map((status) => `<option value="${status}"${item.verification_status === status ? " selected" : ""}>${status}</option>`).join("")}</select>
        <label for="review_notes">本次审核备注</label><textarea id="review_notes" name="review_notes" rows="3"></textarea>
        <input type="submit" value="保存词汇">
      </form>
      <h2>教材出现位置</h2><table><thead><tr><th>册次</th><th>单元</th><th>学习层级</th><th>状态</th></tr></thead><tbody>${rows || '<tr><td colspan="4">暂无教材关联。</td></tr>'}</tbody></table>`,
    nav: '<a href="/admin/vocabulary">返回词汇列表</a>',
  }));
}

async function adminReports(env, identity, url) {
  void identity;
  const userId = String(url.searchParams.get("user_id") || "");
  const from = String(url.searchParams.get("from") || "");
  const to = String(url.searchParams.get("to") || "");
  const correctness = String(url.searchParams.get("correct") || "");
  const users = await env.DB.prepare(`SELECT id, display_name FROM users WHERE status != 'deleted' ORDER BY display_name`).all();
  const where = [];
  const binds = [];
  if (userId) { where.push("a.user_id = ?"); binds.push(userId); }
  if (/^\d{4}-\d{2}-\d{2}$/u.test(from)) { where.push("date(a.created_at) >= ?"); binds.push(from); }
  if (/^\d{4}-\d{2}-\d{2}$/u.test(to)) { where.push("date(a.created_at) <= ?"); binds.push(to); }
  if (correctness === "1" || correctness === "0") { where.push("a.is_correct = ?"); binds.push(Number(correctness)); }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const summary = await env.DB.prepare(`
    SELECT COUNT(*) AS total, COALESCE(SUM(a.is_correct), 0) AS correct,
      COUNT(DISTINCT a.user_id) AS learners, MAX(a.created_at) AS latest
    FROM attempts a ${clause}
  `).bind(...binds).first();
  const byType = await env.DB.prepare(`
    SELECT q.question_type, COUNT(*) AS total, COALESCE(SUM(a.is_correct), 0) AS correct
    FROM attempts a JOIN questions q ON q.id = a.question_id ${clause}
    GROUP BY q.question_type ORDER BY total DESC
  `).bind(...binds).all();
  const mistakes = await env.DB.prepare(`
    SELECT u.display_name, q.prompt, m.error_count, m.last_wrong_at
    FROM mistakes m JOIN users u ON u.id = m.user_id LEFT JOIN questions q ON q.id = m.question_id
    ${userId ? "WHERE m.user_id = ?" : ""}
    ORDER BY m.error_count DESC, m.last_wrong_at DESC LIMIT 20
  `).bind(...(userId ? [userId] : [])).all();
  const typeRows = (byType.results || []).map((row) => `<tr><td>${escapeHtml(row.question_type)}</td><td>${Number(row.total)}</td><td>${Number(row.total) ? Math.round(Number(row.correct) / Number(row.total) * 100) : 0}%</td></tr>`).join("");
  const mistakeRows = (mistakes.results || []).map((row) => `<tr><td>${escapeHtml(row.display_name)}</td><td>${escapeHtml(row.prompt || "—")}</td><td>${Number(row.error_count)}</td><td>${escapeHtml(row.last_wrong_at)}</td></tr>`).join("");
  const options = (users.results || []).map((item) => `<option value="${escapeHtml(item.id)}"${userId === item.id ? " selected" : ""}>${escapeHtml(item.display_name)}</option>`).join("");
  const total = Number(summary?.total || 0);
  return htmlResponse(layout({
    title: "学习报告",
    admin: true,
    body: `${adminNavigation()}<h1>学习报告</h1>
      <form method="get" action="/admin/reports">
        <label for="user_id">使用者</label><select id="user_id" name="user_id"><option value="">全部</option>${options}</select>
        <label for="from">开始日期</label><input id="from" name="from" type="text" value="${escapeHtml(from)}" placeholder="2026-07-01">
        <label for="to">结束日期</label><input id="to" name="to" type="text" value="${escapeHtml(to)}" placeholder="2026-07-31">
        <label for="correct">答题结果</label><select id="correct" name="correct"><option value="">全部</option><option value="1"${correctness === "1" ? " selected" : ""}>正确</option><option value="0"${correctness === "0" ? " selected" : ""}>错误</option></select>
        <input type="submit" value="筛选报告">
      </form>
      <section class="card"><h2>摘要</h2><p>答题：${total}<br>正确率：${total ? Math.round(Number(summary.correct || 0) / total * 100) : 0}%<br>学习者：${Number(summary?.learners || 0)}<br>最近学习：${escapeHtml(summary?.latest || "—")}</p></section>
      <h2>按题型</h2><table><thead><tr><th>题型</th><th>答题数</th><th>正确率</th></tr></thead><tbody>${typeRows || '<tr><td colspan="3">暂无数据。</td></tr>'}</tbody></table>
      <h2>高频错题</h2><table><thead><tr><th>使用者</th><th>题目</th><th>错误次数</th><th>最近错误</th></tr></thead><tbody>${mistakeRows || '<tr><td colspan="4">暂无错题。</td></tr>'}</tbody></table>
      <p><a href="/admin/backup/attempts.csv">导出全部答题 CSV</a></p>`,
    nav: '<a href="/admin">返回总览</a>',
  }));
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const source = String(text || "").replace(/^\uFEFF/u, "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field.replace(/\r$/u, "")); rows.push(row); row = []; field = ""; }
    else field += char;
  }
  if (field || row.length) { row.push(field.replace(/\r$/u, "")); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0].map((value) => value.trim());
  return rows.slice(1).filter((values) => values.some((value) => value.trim())).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function validateVocabularyImportRow(row, number) {
  const value = {
    lemma: String(row.lemma || "").trim().slice(0, 120),
    display_form: String(row.display_form || row.lemma || "").trim().slice(0, 120),
    meaning_zh: String(row.meaning_zh || row["中文释义"] || "").trim().slice(0, 500),
    part_of_speech: String(row.part_of_speech || row["词性"] || "").trim().slice(0, 80),
    phonetic: String(row.phonetic || row["音标"] || "").trim().slice(0, 120),
    source_title: String(row.source_title || row["数据来源"] || "").trim().slice(0, 300),
    verification_status: String(row.verification_status || "pending").trim(),
  };
  const errors = [];
  if (!value.lemma) errors.push("缺少 lemma");
  if (!value.meaning_zh) errors.push("缺少中文释义");
  if (!value.source_title) errors.push("缺少数据来源");
  if (!["draft", "pending", "verified", "rejected", "disabled"].includes(value.verification_status)) errors.push("审核状态无效");
  if (value.verification_status === "verified") errors.push("导入内容不能直接标记 verified，须先人工审核");
  return { row_number: number, value, errors };
}

async function adminImports(request, env, identity, url) {
  const csrf = await adminCsrf(identity, env);
  if (request.method === "POST") {
    const form = await request.formData();
    const admin = await requireAdminPost(request, env, form);
    if (admin.response) return admin.response;
    const file = form.get("file");
    if (!(file instanceof File) || file.size < 1) return errorPage(400, "文件上传失败", "请选择 CSV 或 JSON 文件。", '<a href="/admin/imports">返回数据导入</a>');
    if (file.size > 5 * 1024 * 1024) return errorPage(413, "文件过大", "第一版单次导入文件不得超过 5MB。", '<a href="/admin/imports">返回数据导入</a>');
    const format = file.name.toLowerCase().endsWith(".json") ? "json" : file.name.toLowerCase().endsWith(".csv") ? "csv" : "";
    if (!format) return errorPage(415, "文件格式错误", "只支持 UTF-8 CSV 或 JSON。", '<a href="/admin/imports">返回数据导入</a>');
    const text = await file.text();
    let rows;
    try {
      const parsed = format === "json" ? JSON.parse(text) : parseCsv(text);
      rows = Array.isArray(parsed) ? parsed : parsed?.vocabulary;
      if (!Array.isArray(rows)) throw new Error("not_array");
    } catch {
      return errorPage(400, "数据导入失败", "文件无法解析，请检查编码和格式。", '<a href="/admin/imports">返回数据导入</a>');
    }
    const validated = rows.slice(0, 10000).map((row, index) => validateVocabularyImportRow(row, index + 2));
    const validRows = validated.filter((item) => !item.errors.length).map((item) => item.value);
    const invalidRows = validated.filter((item) => item.errors.length);
    const jobId = crypto.randomUUID();
    const storageKey = `imports/${jobId}/${file.name.replace(/[^A-Za-z0-9._-]/gu, "_").slice(0, 120)}`;
    await env.BUCKET.put(storageKey, text, { httpMetadata: { contentType: file.type || "text/plain; charset=utf-8" } });
    const statements = [
      env.DB.prepare(`
        INSERT INTO import_jobs (id, file_key, format, status, summary_json, created_at, updated_at)
        VALUES (?, ?, ?, 'validated', ?, datetime('now'), datetime('now'))
      `).bind(jobId, storageKey, format, JSON.stringify({ total: validated.length, valid: validRows.length, invalid: invalidRows.length, rows: validRows })),
    ];
    for (const item of invalidRows.slice(0, 2000)) {
      statements.push(env.DB.prepare(`
        INSERT INTO import_errors (id, import_job_id, row_number, content, error_message, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).bind(crypto.randomUUID(), jobId, item.row_number, JSON.stringify(item.value), item.errors.join("；")));
    }
    await runBatches(env.DB, statements);
    return redirect(`/admin/imports/${encodeURIComponent(jobId)}`);
  }
  const jobs = await env.DB.prepare(`SELECT id, format, status, summary_json, created_at FROM import_jobs ORDER BY created_at DESC LIMIT 30`).all();
  const jobRows = (jobs.results || []).map((job) => {
    let summary = {}; try { summary = JSON.parse(job.summary_json || "{}"); } catch { /* empty */ }
    return `<tr><td><a href="/admin/imports/${encodeURIComponent(job.id)}">${escapeHtml(job.created_at)}</a></td><td>${escapeHtml(job.format)}</td><td>${escapeHtml(job.status)}</td><td>${Number(summary.total || 0)} / ${Number(summary.valid || 0)} / ${Number(summary.invalid || 0)}</td></tr>`;
  }).join("");
  const notice = noticeText(url.searchParams.get("notice"));
  return htmlResponse(layout({
    title: "数据导入",
    admin: true,
    body: `${adminNavigation()}<h1>词汇数据导入</h1>${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ""}
      <div class="warning">导入内容先保存为 <code>pending</code>。即使文件写有 <code>verified</code>，也会要求人工审核，不会直接进入正式练习。</div>
      <form method="post" action="/admin/imports" enctype="multipart/form-data">
        <input type="hidden" name="csrf_token" value="${escapeHtml(csrf || "")}">
        <label for="file">CSV 或 JSON（UTF-8，最大 5MB）</label><input id="file" name="file" type="file" accept=".csv,.json,text/csv,application/json" required>
        <input type="submit" value="上传并由服务器验证">
      </form>
      <p>CSV 必填列：<code>lemma, display_form, meaning_zh, source_title, verification_status</code>。</p>
      <h2>最近导入</h2><table><thead><tr><th>时间</th><th>格式</th><th>状态</th><th>总数/正确/错误</th></tr></thead><tbody>${jobRows || '<tr><td colspan="4">暂无导入记录。</td></tr>'}</tbody></table>`,
    nav: '<a href="/admin/vocabulary">返回词汇管理</a>',
  }));
}

async function adminImportDetail(env, identity, jobId) {
  const csrf = await adminCsrf(identity, env);
  const job = await env.DB.prepare(`SELECT * FROM import_jobs WHERE id = ? LIMIT 1`).bind(jobId).first();
  if (!job) return errorPage(404, "导入任务不存在", "该导入任务不存在。", '<a href="/admin/imports">返回数据导入</a>');
  let summary = {}; try { summary = JSON.parse(job.summary_json || "{}"); } catch { /* empty */ }
  const errors = await env.DB.prepare(`SELECT row_number, content, error_message FROM import_errors WHERE import_job_id = ? ORDER BY row_number LIMIT 200`).bind(jobId).all();
  const rows = (errors.results || []).map((item) => `<tr><td>${Number(item.row_number || 0)}</td><td><code>${escapeHtml(item.content)}</code></td><td>${escapeHtml(item.error_message)}</td></tr>`).join("");
  return htmlResponse(layout({
    title: "导入验证结果",
    admin: true,
    body: `${adminNavigation()}<h1>导入验证结果</h1>
      <p>状态：${escapeHtml(job.status)}<br>总行数：${Number(summary.total || 0)}<br>可导入：${Number(summary.valid || 0)}<br>错误：${Number(summary.invalid || 0)}</p>
      ${job.status === "validated" && Number(summary.valid || 0) > 0 ? `<form method="post" action="/admin/imports/${escapeHtml(job.id)}/confirm">
        <input type="hidden" name="csrf_token" value="${escapeHtml(csrf || "")}">
        <input type="submit" value="只导入正确数据">
      </form>` : ""}
      <p><a href="/admin/imports/${escapeHtml(job.id)}/errors.csv">下载错误报告</a></p>
      <table><thead><tr><th>行号</th><th>内容</th><th>错误说明</th></tr></thead><tbody>${rows || '<tr><td colspan="3">没有验证错误。</td></tr>'}</tbody></table>`,
    nav: '<a href="/admin/imports">返回导入列表</a>',
  }));
}

async function adminImportConfirm(request, env, jobId) {
  const form = await request.formData();
  const admin = await requireAdminPost(request, env, form);
  if (admin.response) return admin.response;
  const job = await env.DB.prepare(`SELECT status, summary_json FROM import_jobs WHERE id = ? LIMIT 1`).bind(jobId).first();
  if (!job || job.status !== "validated") return errorPage(409, "导入任务不可确认", "该任务不存在或已经处理。", '<a href="/admin/imports">返回导入列表</a>');
  let summary; try { summary = JSON.parse(job.summary_json || "{}"); } catch { summary = null; }
  if (!summary || !Array.isArray(summary.rows)) return errorPage(500, "导入数据损坏", "验证结果无法读取。", `<a href="/admin/imports/${escapeHtml(jobId)}">返回</a>`);
  let success = 0;
  let duplicates = 0;
  for (const row of summary.rows) {
    const existing = await env.DB.prepare(`SELECT id FROM vocabulary WHERE lemma = ? COLLATE NOCASE LIMIT 1`).bind(row.lemma).first();
    if (existing) { duplicates += 1; continue; }
    await env.DB.prepare(`
      INSERT INTO vocabulary
        (id, lemma, display_form, meaning_zh, part_of_speech, phonetic, verification_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))
    `).bind(crypto.randomUUID(), row.lemma, row.display_form, row.meaning_zh, row.part_of_speech || null, row.phonetic || null).run();
    success += 1;
  }
  await env.DB.prepare(`
    UPDATE import_jobs SET status = 'completed', summary_json = ?, updated_at = datetime('now') WHERE id = ?
  `).bind(JSON.stringify({ ...summary, rows: undefined, imported: success, duplicates }), jobId).run();
  return redirect("/admin/imports?notice=import_confirmed");
}

async function adminImportErrors(env, jobId) {
  const result = await env.DB.prepare(`SELECT row_number, content, error_message FROM import_errors WHERE import_job_id = ? ORDER BY row_number`).bind(jobId).all();
  const rows = [["行号", "内容", "错误说明"], ...(result.results || []).map((item) => [item.row_number, item.content, item.error_message])];
  return csvResponse(`modu-import-errors-${jobId}.csv`, rows);
}

async function adminBackup(env) {
  const counts = await env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM books) AS books,
      (SELECT COUNT(*) FROM vocabulary) AS vocabulary,
      (SELECT COUNT(*) FROM attempts) AS attempts,
      (SELECT COUNT(*) FROM mistakes) AS mistakes
  `).first();
  return htmlResponse(layout({
    title: "数据导出和备份",
    admin: true,
    body: `${adminNavigation()}<h1>数据导出和备份</h1>
      <section class="card"><p>使用者：${Number(counts?.users || 0)}<br>读物：${Number(counts?.books || 0)}<br>词汇：${Number(counts?.vocabulary || 0)}<br>答题：${Number(counts?.attempts || 0)}<br>错题：${Number(counts?.mistakes || 0)}</p></section>
      <a class="button" href="/admin/backup/attempts.csv">导出全部答题记录 CSV</a>
      <a class="button" href="/admin/backup/catalog.json">导出内容目录 JSON</a>
      <p class="muted">原始上传文件和导入文件保存在本地工作区；本页只导出结构化目录与记录，不公开原文件地址。</p>`,
    nav: '<a href="/admin">返回总览</a>',
  }));
}

async function adminBackupAttempts(env) {
  const result = await env.DB.prepare(`
    SELECT u.display_name, a.created_at, q.question_type, q.prompt, a.answer, q.correct_answer, a.is_correct
    FROM attempts a JOIN users u ON u.id = a.user_id JOIN questions q ON q.id = a.question_id
    ORDER BY a.created_at
  `).all();
  const rows = [["使用者", "答题时间", "题型", "题目", "作答", "正确答案", "是否正确"], ...(result.results || []).map((item) => [item.display_name, item.created_at, item.question_type, item.prompt, item.answer, item.correct_answer, item.is_correct ? "正确" : "错误"])];
  return csvResponse("modu-attempts.csv", rows);
}

async function adminBackupCatalog(env) {
  const [textbooks, units, books, counts] = await Promise.all([
    env.DB.prepare(`SELECT id, grade, semester, data_source, verification_status FROM textbooks ORDER BY grade, semester`).all(),
    env.DB.prepare(`SELECT textbook_id, unit_code, title, is_revision, verification_status FROM units ORDER BY textbook_id, sort_order`).all(),
    env.DB.prepare(`SELECT id, title, author, status, total_chapters, total_pages FROM books ORDER BY sort_order, created_at`).all(),
    env.DB.prepare(`SELECT (SELECT COUNT(*) FROM vocabulary) AS vocabulary, (SELECT COUNT(*) FROM phrases) AS phrases, (SELECT COUNT(*) FROM grammar_points) AS grammar, (SELECT COUNT(*) FROM phonics_points) AS phonics, (SELECT COUNT(*) FROM questions) AS questions`).first(),
  ]);
  return new Response(JSON.stringify({
    exported_at: new Date().toISOString(),
    textbooks: textbooks.results || [],
    units: units.results || [],
    books: books.results || [],
    content_counts: counts,
  }, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": 'attachment; filename="modu-catalog.json"',
      "cache-control": "private, no-store",
    },
  });
}

async function adminDevices(request, env, identity, url) {
  const csrf = await adminCsrf(identity, env);
  const result = await env.DB.prepare(`
    SELECT d.id, d.name, d.status, d.firmware_version, d.last_seen_at, d.created_at,
      (SELECT COUNT(*) FROM device_sessions ds WHERE ds.device_id = d.id AND ds.expires_at > datetime('now')) AS sessions
    FROM devices d
    ORDER BY d.created_at DESC
  `).all();
  const notice = noticeText(url.searchParams.get("notice"));
  const rows = (result.results || []).map((device) => `<tr>
    <td>${escapeHtml(device.name)}</td>
    <td>${escapeHtml(device.status)}</td>
    <td>${escapeHtml(device.firmware_version || "—")}</td>
    <td>${escapeHtml(device.last_seen_at || "尚未连接")}</td>
    <td>${Number(device.sessions || 0)}</td>
    <td>${device.status === "active" ? `<form class="compact-form" method="post" action="/admin/devices/revoke">
      <input type="hidden" name="csrf_token" value="${escapeHtml(csrf || "")}">
      <input type="hidden" name="device_id" value="${escapeHtml(device.id)}">
      <button type="submit">撤销</button></form>` : "—"}</td>
  </tr>`).join("");
  return htmlResponse(layout({
    title: "设备管理",
    admin: true,
    body: `${adminNavigation()}<h1>设备管理</h1>
      ${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ""}
      <h2>创建 Kindle 设备令牌</h2>
      <form method="post" action="/admin/devices/create">
        <input type="hidden" name="csrf_token" value="${escapeHtml(csrf || "")}">
        <label for="name">设备名称</label>
        <input id="name" name="name" type="text" maxlength="80" value="家庭 Kindle" required>
        <label for="model">Kindle 型号（可空）</label>
        <input id="model" name="model" type="text" maxlength="80" value="Kindle Paperwhite">
        <label for="firmware">固件版本（可空）</label>
        <input id="firmware" name="firmware" type="text" maxlength="40" value="5.16.2.1.1">
        <input type="submit" value="生成设备令牌">
      </form>
      <h2>已有设备</h2>
      <table><thead><tr><th>名称</th><th>状态</th><th>固件</th><th>最近连接</th><th>会话</th><th>操作</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6">暂无设备。</td></tr>'}</tbody></table>`,
    nav: '<a href="/admin">返回总览</a>',
  }));
}

async function adminCreateDevice(request, env) {
  const form = await request.formData();
  const admin = await requireAdminPost(request, env, form);
  if (admin.response) return admin.response;
  const name = String(form.get("name") || "").trim().slice(0, 80);
  if (!name) return errorPage(400, "无法创建设备", "设备名称不能为空。");
  const rawToken = randomToken();
  const tokenHash = await sha256(rawToken);
  const deviceId = crypto.randomUUID();
  const household = await env.DB.prepare(`
    SELECT id FROM households ORDER BY created_at LIMIT 1
  `).first();
  if (!household) return errorPage(500, "家庭数据缺失", "初始化迁移未正确完成。");
  const revealId = randomToken(18);
  const payload = JSON.stringify({
    token: rawToken,
    setup_url: `/k/setup?token=${encodeURIComponent(rawToken)}`,
    device_name: name,
  });
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO devices
        (id, household_id, name, model, firmware_version, token_hash, token_hint, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', datetime('now'), datetime('now'))
    `).bind(
      deviceId,
      household.id,
      name,
      String(form.get("model") || "").trim().slice(0, 80) || null,
      String(form.get("firmware") || "").trim().slice(0, 40) || null,
      tokenHash,
      rawToken.slice(-6),
    ),
    env.DB.prepare(`
      INSERT INTO admin_flashes (id, owner_email, kind, payload, expires_at, created_at)
      VALUES (?, ?, 'device_token', ?, datetime('now', '+10 minutes'), datetime('now'))
    `).bind(revealId, admin.identity.email, payload),
    env.DB.prepare(`
      INSERT INTO audit_logs (id, actor_type, actor_identifier, action, entity_type, entity_id, created_at)
      VALUES (?, 'admin', ?, 'device.create', 'device', ?, datetime('now'))
    `).bind(crypto.randomUUID(), admin.identity.email, deviceId),
  ]);
  return redirect(`/admin/devices/reveal?id=${encodeURIComponent(revealId)}`);
}

async function adminRevealDevice(env, identity, url) {
  const id = url.searchParams.get("id") || "";
  const row = await env.DB.prepare(`
    SELECT payload FROM admin_flashes
    WHERE id = ? AND owner_email = ? AND kind = 'device_token' AND expires_at > datetime('now')
    LIMIT 1
  `).bind(id, identity.email).first();
  if (!row) return errorPage(404, "设备令牌已失效", "令牌只显示一次，或已超过 10 分钟有效期。", '<a href="/admin/devices">返回设备管理</a>');
  await env.DB.prepare(`DELETE FROM admin_flashes WHERE id = ?`).bind(id).run();
  let payload;
  try { payload = JSON.parse(row.payload); } catch { payload = null; }
  if (!payload) return errorPage(500, "设备令牌读取失败", "请返回设备管理重新创建。");
  return htmlResponse(layout({
    title: "设备令牌已创建",
    admin: true,
    body: `${adminNavigation()}<h1>设备令牌已创建</h1>
      <div class="warning"><strong>请现在保存，离开本页后不会再次显示。</strong></div>
      <p>设备名称：${escapeHtml(payload.device_name)}</p>
      <label>设备专用地址</label>
      <textarea rows="4" readonly>${escapeHtml(payload.setup_url)}</textarea>
      <label>设备令牌</label>
      <textarea rows="3" readonly>${escapeHtml(payload.token)}</textarea>
      <p class="muted">在 Kindle 上打开本站域名，并在其后附加上面的设备专用地址。</p>`,
    nav: '<a href="/admin/devices">返回设备管理</a>',
  }));
}

async function adminRevokeDevice(request, env) {
  const form = await request.formData();
  const admin = await requireAdminPost(request, env, form);
  if (admin.response) return admin.response;
  const deviceId = String(form.get("device_id") || "");
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE devices SET status = 'revoked', token_hash = NULL, updated_at = datetime('now') WHERE id = ?
    `).bind(deviceId),
    env.DB.prepare(`DELETE FROM device_sessions WHERE device_id = ?`).bind(deviceId),
    env.DB.prepare(`
      INSERT INTO audit_logs (id, actor_type, actor_identifier, action, entity_type, entity_id, created_at)
      VALUES (?, 'admin', ?, 'device.revoke', 'device', ?, datetime('now'))
    `).bind(crypto.randomUUID(), admin.identity.email, deviceId),
  ]);
  return redirect("/admin/devices?notice=device_revoked");
}

async function adminWeather(request, env, identity, url) {
  const csrf = await adminCsrf(identity, env);
  const row = await env.DB.prepare(`
    SELECT value, updated_at FROM settings WHERE key = 'manual_weather' LIMIT 1
  `).first();
  const mode = await env.DB.prepare(`
    SELECT value FROM settings WHERE key = 'automatic_weather_enabled' LIMIT 1
  `).first();
  const cache = await env.DB.prepare(`
    SELECT provider, status, fetched_at, expires_at, payload_json
    FROM weather_cache ORDER BY fetched_at DESC LIMIT 1
  `).first();
  let weather = { condition: "多云", current: "22", high: "25", low: "17", rain: "降雨概率 30%" };
  if (row?.value) {
    try { weather = { ...weather, ...JSON.parse(row.value) }; } catch { /* fallback */ }
  }
  const notice = noticeText(url.searchParams.get("notice"));
  return htmlResponse(layout({
    title: "天气设置",
    admin: true,
    body: `${adminNavigation()}<h1>昆明天气设置</h1>
      ${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ""}
      <section class="card"><h2>自动天气</h2>
        <p>状态：${mode?.value === "0" ? "已停用" : "已启用"}<br>
        提供商：${escapeHtml(cache?.provider || "Open-Meteo")}<br>
        最近成功：${escapeHtml(cache?.fetched_at || "尚未获取")}<br>
        缓存到期：${escapeHtml(cache?.expires_at || "—")}</p>
        <form method="post" action="/admin/weather/action">
          <input type="hidden" name="csrf_token" value="${escapeHtml(csrf || "")}">
          <button type="submit" name="action" value="test">测试天气接口</button>
          <button type="submit" name="action" value="clear">清除天气缓存</button>
          <button type="submit" name="action" value="${mode?.value === "0" ? "enable" : "disable"}">${mode?.value === "0" ? "启用自动天气" : "停用自动天气"}</button>
        </form>
      </section>
      <h2>手动备用天气</h2>
      <form method="post" action="/admin/weather">
        <input type="hidden" name="csrf_token" value="${escapeHtml(csrf || "")}">
        <label for="condition">当前天气</label><input id="condition" name="condition" type="text" value="${escapeHtml(weather.condition)}" required>
        <label for="current">当前温度（℃）</label><input id="current" name="current" type="number" value="${escapeHtml(weather.current)}" required>
        <label for="high">最高温（℃）</label><input id="high" name="high" type="number" value="${escapeHtml(weather.high)}" required>
        <label for="low">最低温（℃）</label><input id="low" name="low" type="number" value="${escapeHtml(weather.low)}" required>
        <label for="rain">降雨提示</label><input id="rain" name="rain" type="text" value="${escapeHtml(weather.rain)}" required>
        <input type="submit" value="保存备用天气">
      </form>
      <p class="muted">最近保存：${escapeHtml(row?.updated_at || "尚未手动保存")}</p>`,
    nav: '<a href="/admin">返回总览</a>',
  }));
}

async function adminWeatherPost(request, env) {
  const form = await request.formData();
  const admin = await requireAdminPost(request, env, form);
  if (admin.response) return admin.response;
  const payload = JSON.stringify({
    condition: String(form.get("condition") || "").trim().slice(0, 30),
    current: String(form.get("current") || "").slice(0, 5),
    high: String(form.get("high") || "").slice(0, 5),
    low: String(form.get("low") || "").slice(0, 5),
    rain: String(form.get("rain") || "").trim().slice(0, 80),
  });
  await env.DB.prepare(`
    INSERT INTO settings (key, value, created_at, updated_at)
    VALUES ('manual_weather', ?, datetime('now'), datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).bind(payload).run();
  return redirect("/admin/weather?notice=weather_saved");
}

async function adminWeatherAction(request, env) {
  const form = await request.formData();
  const admin = await requireAdminPost(request, env, form);
  if (admin.response) return admin.response;
  const action = String(form.get("action") || "");
  if (action === "clear") {
    await env.DB.prepare(`DELETE FROM weather_cache`).run();
    return redirect("/admin/weather?notice=weather_cleared");
  }
  if (action === "enable" || action === "disable") {
    await env.DB.prepare(`
      INSERT INTO settings (key, value, created_at, updated_at)
      VALUES ('automatic_weather_enabled', ?, datetime('now'), datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `).bind(action === "enable" ? "1" : "0").run();
    return redirect("/admin/weather?notice=weather_mode_saved");
  }
  if (action === "test") {
    const result = await fetchAutomaticWeather(env, defaultWeatherCity(), true);
    if (!result) return errorPage(502, "天气暂时不可用", "自动天气接口未返回有效数据，备用天气仍可正常使用。", '<a href="/admin/weather">返回天气设置</a>');
    return redirect("/admin/weather?notice=weather_tested");
  }
  return errorPage(400, "天气操作无效", "没有识别到有效的天气操作。", '<a href="/admin/weather">返回天气设置</a>');
}

async function runBatches(db, statements, size = 80) {
  for (let index = 0; index < statements.length; index += size) {
    await db.batch(statements.slice(index, index + size));
  }
}

async function adminAccessStats(env, identity) {
  const summary = await env.DB.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN date(visited_at, '+8 hours') = date('now', '+8 hours') THEN 1 ELSE 0 END) AS today,
      SUM(CASE WHEN visited_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) AS seven_days,
      COUNT(DISTINCT CASE WHEN visited_at >= datetime('now', '-7 days') THEN COALESCE(account_id, client_type || ':' || source) END) AS recent_visitors,
      MAX(visited_at) AS latest
    FROM access_events
  `).first();
  const events = await env.DB.prepare(`
    SELECT datetime(ae.visited_at, '+8 hours') AS local_time, ae.path, ae.source,
      ae.client_type, ae.country, COALESCE(a.username, '未登录') AS visitor
    FROM access_events ae
    LEFT JOIN accounts a ON a.id = ae.account_id
    ORDER BY ae.visited_at DESC
    LIMIT 200
  `).all();
  const rows = (events.results || []).map((event) => `<tr>
    <td>${escapeHtml(event.local_time)}</td><td>${escapeHtml(event.visitor)}</td>
    <td><code>${escapeHtml(event.path)}</code></td><td>${escapeHtml(event.source)}</td>
    <td>${escapeHtml(event.client_type)}${event.country ? ` · ${escapeHtml(event.country)}` : ""}</td>
  </tr>`).join("");
  return htmlResponse(layout({
    title: "访问统计",
    admin: true,
    body: `${adminNavigation()}<h1>访问统计</h1>
      <p class="muted">当前管理员：${escapeHtml(identity.email)}。仅记录页面、时间、来源和设备类型，不保存 IP。</p>
      <section class="card"><h2>简单概况</h2><p>
        今日访问：<strong>${Number(summary?.today || 0)}</strong> 次<br>
        最近 7 天：<strong>${Number(summary?.seven_days || 0)}</strong> 次<br>
        最近 7 天访客来源：<strong>${Number(summary?.recent_visitors || 0)}</strong> 个<br>
        累计页面访问：${Number(summary?.total || 0)} 次<br>
        最近访问：${escapeHtml(summary?.latest || "尚无访问")}</p></section>
      <h2>最近访问</h2>
      <table><thead><tr><th>北京时间</th><th>账户</th><th>页面</th><th>来源</th><th>设备</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5">尚无访问记录。</td></tr>'}</tbody></table>`,
    nav: '<a href="/admin">返回总览</a>',
  }));
}

async function processBookCover(env, bookId, uploaded) {
  if (!uploaded || typeof uploaded.arrayBuffer !== "function" || !uploaded.size) return null;
  const name = String(uploaded.name || "cover.jpg").toLowerCase();
  if (!name.endsWith(".jpg") && !name.endsWith(".jpeg") && uploaded.type !== "image/jpeg") {
    throw new Error("cover_format_invalid");
  }
  const original = new Uint8Array(await uploaded.arrayBuffer());
  const thumbnail = createKindleJpegThumbnail(original);
  const originalKey = `covers/${bookId}/original.jpg`;
  const thumbnailKey = `covers/${bookId}/kindle.jpg`;
  await env.BUCKET.put(originalKey, original, { httpMetadata: { contentType: "image/jpeg" } });
  await env.BUCKET.put(thumbnailKey, thumbnail.bytes, { httpMetadata: { contentType: thumbnail.mediaType } });
  return { originalKey, thumbnailKey, mediaType: thumbnail.mediaType };
}

function defaultCoverSvg(title, author) {
  const cleanTitle = String(title || "墨读").trim();
  const lines = [];
  for (let index = 0; index < cleanTitle.length && lines.length < 4; index += 7) lines.push(cleanTitle.slice(index, index + 7));
  const titleSvg = lines.map((line, index) => `<text x="130" y="${112 + index * 38}" text-anchor="middle" font-size="28" font-weight="700">${escapeHtml(line)}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="390" viewBox="0 0 260 390">
    <rect width="260" height="390" fill="#eee"/><rect x="12" y="12" width="236" height="366" fill="none" stroke="#222" stroke-width="2"/>
    <path d="M44 55h172M44 326h172" stroke="#777"/>${titleSvg}
    <text x="130" y="308" text-anchor="middle" font-size="18">${escapeHtml(author || "未署名")}</text>
    <text x="130" y="354" text-anchor="middle" font-size="17" letter-spacing="5">墨读</text></svg>`;
}

async function kindleCover(env, bookId) {
  const book = await env.DB.prepare(`
    SELECT id, title, author, cover_thumbnail_key FROM books
    WHERE id = ? AND status = 'published' AND review_status = 'approved' LIMIT 1
  `).bind(bookId).first();
  if (!book) return new Response("Not found", { status: 404 });
  if (book.cover_thumbnail_key && env.BUCKET?.get) {
    const object = await env.BUCKET.get(book.cover_thumbnail_key);
    if (object) {
      const body = object.body || await object.arrayBuffer();
      return new Response(body, { headers: {
        "content-type": object.httpMetadata?.contentType || "image/jpeg",
        "cache-control": "public, max-age=86400",
        "x-content-type-options": "nosniff",
      } });
    }
  }
  return new Response(defaultCoverSvg(book.title, book.author), { headers: {
    "content-type": "image/svg+xml; charset=utf-8",
    "cache-control": "public, max-age=3600",
    "x-content-type-options": "nosniff",
  } });
}

async function adminBooks(env, identity, url) {
  const csrf = await adminCsrf(identity, env);
  const result = await env.DB.prepare(`
    SELECT b.id, b.title, b.author, b.status, b.total_chapters, b.total_pages, b.updated_at
    FROM books b
    ORDER BY b.sort_order, b.updated_at DESC
    LIMIT 100
  `).all();
  const rows = (result.results || []).map((book) => `<tr>
    <td><a href="/admin/books/${escapeHtml(book.id)}">${escapeHtml(book.title)}</a></td>
    <td>${escapeHtml(book.author || "—")}</td>
    <td>${escapeHtml(book.status)}</td>
    <td>${Number(book.total_chapters || 0)}</td>
    <td>${Number(book.total_pages || 0)}</td>
    <td>${escapeHtml(book.updated_at)}</td>
  </tr>`).join("");
  const notice = {
    uploaded: "读物已上传并完成服务器解析。",
    published: "读物已发布到 Kindle 阅读书架。",
    unpublished: "读物已下架。",
    updated: "读物信息已更新。",
    deleted: "读物、章节、阅读进度及文件已删除。",
  }[url.searchParams.get("notice")] || "";
  return htmlResponse(layout({
    title: "阅读内容管理",
    admin: true,
    body: `${adminNavigation()}<h1>阅读内容管理</h1>
      ${notice ? `<div class="notice">${notice}</div>` : ""}
      <a class="button" href="/admin/books/new">上传或粘贴读物</a>
      <table><thead><tr><th>标题</th><th>作者</th><th>状态</th><th>章节</th><th>页数</th><th>更新</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6">暂无读物。</td></tr>'}</tbody></table>
      <form method="post" action="/admin/books/sample">
        <input type="hidden" name="csrf_token" value="${escapeHtml(csrf || "")}">
        <input type="submit" value="建立原创演示读物">
      </form>`,
    nav: '<a href="/admin">返回总览</a>',
  }));
}

async function adminNewBook(request, env, identity) {
  const csrf = await adminCsrf(identity, env);
  if (request.method === "GET") {
    return htmlResponse(layout({
      title: "上传读物",
      admin: true,
      body: `${adminNavigation()}<h1>上传读物</h1>
        <form method="post" action="/admin/books/new" enctype="multipart/form-data">
          <input type="hidden" name="csrf_token" value="${escapeHtml(csrf || "")}">
          <label for="title">标题</label><input id="title" name="title" type="text" maxlength="160" required>
          <label for="author">作者</label><input id="author" name="author" type="text" maxlength="120">
          <label for="summary">简介</label><textarea id="summary" name="summary" rows="4"></textarea>
          <label for="language">语言</label>
          <select id="language" name="language"><option value="zh">中文</option><option value="en">英文</option><option value="mixed">中英双语</option></select>
          <label for="recommended_grade">推荐年级备注</label><input id="recommended_grade" name="recommended_grade" type="text" maxlength="80">
          <label for="cover">书籍封面（JPEG，系统自动生成 Kindle 灰阶缩略图）</label>
          <input id="cover" name="cover" type="file" accept=".jpg,.jpeg,image/jpeg">
          <label for="file">TXT 或 Markdown 文件（可空）</label>
          <input id="file" name="file" type="file" accept=".txt,.md,.markdown,text/plain,text/markdown">
          <p class="muted">上传只负责章节与自然段解析；阅读时会按设备视口、字号和行距动态生成一屏一页。</p>
          <label for="body">或直接粘贴正文</label><textarea id="body" name="body" rows="16"></textarea>
          <label for="source_notes">数据来源说明</label><textarea id="source_notes" name="source_notes" rows="3"></textarea>
          <label for="rights_notes">版权或使用权限备注</label><textarea id="rights_notes" name="rights_notes" rows="3"></textarea>
          <input type="submit" value="上传并解析">
        </form>`,
      nav: '<a href="/admin/books">返回读物列表</a>',
    }));
  }
  const form = await request.formData();
  const admin = await requireAdminPost(request, env, form);
  if (admin.response) return admin.response;
  const title = String(form.get("title") || "").trim().slice(0, 160);
  if (!title) return errorPage(400, "读物标题缺失", "请填写读物标题。", '<a href="/admin/books/new">返回上传</a>');
  let body = String(form.get("body") || "");
  let fileName = "pasted.txt";
  let mediaType = "text/plain";
  let bytes = new TextEncoder().encode(body);
  const uploaded = form.get("file");
  if (uploaded && typeof uploaded.arrayBuffer === "function" && uploaded.size > 0) {
    if (uploaded.size > 2 * 1024 * 1024) return errorPage(400, "文件过大", "单个读物源文件不得超过 2MB。");
    const extension = String(uploaded.name || "").toLowerCase().split(".").pop();
    if (!["txt", "md", "markdown"].includes(extension)) return errorPage(400, "文件格式错误", "只支持 TXT、MD 和 Markdown。");
    bytes = new Uint8Array(await uploaded.arrayBuffer());
    try {
      body = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return errorPage(400, "文件编码错误", "请将文件另存为 UTF-8 编码后重新上传。");
    }
    fileName = String(uploaded.name || "novel.txt").slice(0, 200);
    mediaType = extension === "txt" ? "text/plain" : "text/markdown";
  }
  if (!body.trim()) return errorPage(400, "读物正文缺失", "请上传文件或粘贴读物正文。");
  const chapters = parseBookChapters(body);
  if (!chapters.length) return errorPage(400, "解析失败", "未能从正文中读取有效内容。");
  const bookId = crypto.randomUUID();
  const fileId = crypto.randomUUID();
  const storageKey = `books/${bookId}/${fileId}-${fileName.replace(/[^a-zA-Z0-9._-]/gu, "_")}`;
  if (!env.BUCKET) return errorPage(503, "文件存储尚未连接", "本地文件存储不可用。");
  await env.BUCKET.put(storageKey, bytes, { httpMetadata: { contentType: mediaType } });
  let cover = null;
  try { cover = await processBookCover(env, bookId, form.get("cover")); } catch {
    return errorPage(400, "封面处理失败", "封面须为 1MB 以内的 JPEG 图片，请压缩或转换后重试。", '<a href="/admin/books/new">返回上传</a>');
  }
  const statements = [
    env.DB.prepare(`
      INSERT INTO books
        (id, household_id, title, author, summary, language, recommended_grade, status, sort_order,
         total_chapters, total_pages, source_notes, rights_notes, cover_original_key, cover_thumbnail_key,
         cover_media_type, cover_updated_at, created_at, updated_at)
      VALUES (?, 'household_default', ?, ?, ?, ?, ?, 'preview', 0, ?, 0, ?, ?, ?, ?, ?,
        CASE WHEN ? IS NULL THEN NULL ELSE datetime('now') END, datetime('now'), datetime('now'))
    `).bind(
      bookId,
      title,
      String(form.get("author") || "").trim().slice(0, 120) || null,
      String(form.get("summary") || "").trim().slice(0, 2000) || null,
      String(form.get("language") || "zh"),
      String(form.get("recommended_grade") || "").trim().slice(0, 80) || null,
      chapters.length,
      String(form.get("source_notes") || "").trim().slice(0, 2000) || null,
      String(form.get("rights_notes") || "").trim().slice(0, 2000) || null,
      cover?.originalKey || null,
      cover?.thumbnailKey || null,
      cover?.mediaType || null,
      cover?.thumbnailKey || null,
    ),
    env.DB.prepare(`
      INSERT INTO book_files
        (id, book_id, storage_key, original_name, media_type, byte_size, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(fileId, bookId, storageKey, fileName, mediaType, bytes.byteLength),
  ];
  let totalPages = 0;
  for (let index = 0; index < chapters.length; index += 1) {
    const chapter = chapters[index];
    const chapterId = crypto.randomUUID();
    statements.push(env.DB.prepare(`
      INSERT INTO chapters
        (id, book_id, title, body, sort_order, parsing_warnings, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(chapterId, bookId, chapter.title, chapter.body, index + 1, chapter.warning || null));
    for (const [fontSize, target] of Object.entries(STORED_PAGE_TARGETS)) {
      const pages = paginateChapter(chapter.body, target);
      if (fontSize === "medium") totalPages += pages.length;
      pages.forEach((pageBody, pageIndex) => statements.push(env.DB.prepare(`
        INSERT INTO chapter_pages
          (id, chapter_id, font_size, page_number, body, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).bind(crypto.randomUUID(), chapterId, fontSize, pageIndex + 1, pageBody)));
    }
  }
  statements.push(env.DB.prepare(`
    UPDATE books SET total_pages = ?, updated_at = datetime('now') WHERE id = ?
  `).bind(totalPages, bookId));
  await runBatches(env.DB, statements);
  return redirect(`/admin/books/${encodeURIComponent(bookId)}?notice=uploaded`);
}

async function createSampleBook(request, env) {
  const form = await request.formData();
  const admin = await requireAdminPost(request, env, form);
  if (admin.response) return admin.response;
  const exists = await env.DB.prepare(`SELECT id FROM books WHERE title = 'Kindle 墨水屏上的一天' LIMIT 1`).first();
  if (exists) return redirect(`/admin/books/${encodeURIComponent(exists.id)}`);
  const title = "Kindle 墨水屏上的一天";
  const body = `第一章 清晨\n\n清晨，窗外很安静。小满打开 Kindle，看见了今天的日期和昆明天气。\n\n他使用注册账户进入墨读。页面上只有两个大按钮：阅读和单词。\n\n第二章 独立进度\n\n妙妙也想看同一本书。她登录自己的账户，阅读从第一页开始。\n\n小满再次进入时，系统仍然记得他刚才读到的位置。两个人的进度没有混在一起。\n\n第三章 不用脚本也能读\n\nKindle 没有运行 JavaScript，上一页、目录和下一页仍然可以使用。\n\n每次翻页，服务器都会保存进度。网络慢的时候，页面仍然保持简单、清楚。`;
  const fake = new FormData();
  fake.set("csrf_token", String(form.get("csrf_token") || ""));
  fake.set("title", title);
  fake.set("author", "墨读项目组");
  fake.set("summary", "用于验证 Kindle 读物目录、翻页和多账户阅读进度的原创短篇。");
  fake.set("language", "zh");
  fake.set("recommended_grade", "家庭阅读兼容测试");
  fake.set("body", body);
  fake.set("source_notes", "系统原创演示读物，不含教材正文。");
  fake.set("rights_notes", "可用于本站测试。");
  const headers = new Headers(request.headers);
  headers.delete("content-type");
  headers.delete("content-length");
  const replacement = new Request(request.url.replace("/sample", "/new"), {
    method: "POST",
    headers,
    body: fake,
  });
  return adminNewBook(replacement, env, admin.identity);
}

async function adminBookDetail(request, env, identity, url, bookId) {
  const csrf = await adminCsrf(identity, env);
  const book = await env.DB.prepare(`SELECT * FROM books WHERE id = ? LIMIT 1`).bind(bookId).first();
  if (!book) return errorPage(404, "读物不存在", "该读物不存在或已删除。", '<a href="/admin/books">返回读物列表</a>');
  if (request.method === "POST") {
    const form = await request.formData();
    const admin = await requireAdminPost(request, env, form);
    if (admin.response) return admin.response;
    const action = String(form.get("action") || "");
    if (action === "publish" || action === "unpublish") {
      const status = action === "publish" ? "published" : "preview";
      await env.DB.prepare(`UPDATE books SET status = ?, updated_at = datetime('now') WHERE id = ?`).bind(status, bookId).run();
      return redirect(`/admin/books/${encodeURIComponent(bookId)}?notice=${action === "publish" ? "published" : "unpublished"}`);
    }
    if (action === "cover") {
      let cover;
      try { cover = await processBookCover(env, bookId, form.get("cover")); } catch {
        return errorPage(400, "封面处理失败", "封面须为 1MB 以内的 JPEG 图片。", `<a href="/admin/books/${escapeHtml(bookId)}">返回读物详情</a>`);
      }
      if (!cover) return errorPage(400, "请选择封面", "请选择 JPEG 封面后再提交。");
      await env.DB.prepare(`UPDATE books SET cover_original_key = ?, cover_thumbnail_key = ?, cover_media_type = ?, cover_updated_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
        .bind(cover.originalKey, cover.thumbnailKey, cover.mediaType, bookId).run();
      return redirect(`/admin/books/${encodeURIComponent(bookId)}?notice=cover_saved`);
    }
  }
  const chapters = await env.DB.prepare(`
    SELECT c.id, c.title, c.sort_order, c.parsing_warnings,
      (SELECT COUNT(*) FROM chapter_pages cp WHERE cp.chapter_id = c.id AND cp.font_size = 'medium') AS page_count
    FROM chapters c WHERE c.book_id = ? ORDER BY c.sort_order
  `).bind(bookId).all();
  const notice = {
    uploaded: "读物已上传并解析，请检查章节后再发布。",
    published: "读物已发布到 Kindle 阅读书架。",
    unpublished: "读物已下架。",
    chapter_updated: "章节已重新分页并保存。",
    cover_saved: "Kindle 灰阶封面已生成并保存。",
  }[url.searchParams.get("notice")] || "";
  const rows = (chapters.results || []).map((chapter) => `<tr>
    <td>${Number(chapter.sort_order)}</td>
    <td><a href="/admin/chapters/${escapeHtml(chapter.id)}/edit">${escapeHtml(chapter.title)}</a></td>
    <td>${Number(chapter.page_count || 0)}</td>
    <td>${escapeHtml(chapter.parsing_warnings || "—")}</td>
  </tr>`).join("");
  return htmlResponse(layout({
    title: book.title,
    admin: true,
    body: `${adminNavigation()}<h1>${escapeHtml(book.title)}</h1>
      ${notice ? `<div class="notice">${notice}</div>` : ""}
      <p>作者：${escapeHtml(book.author || "未填写")}<br>
      状态：${escapeHtml(book.status)}<br>
      章节：${Number(book.total_chapters)}；中字号总页数：${Number(book.total_pages)}</p>
      <p>${escapeHtml(book.summary || "")}</p>
      <form method="post" action="/admin/books/${escapeHtml(book.id)}">
        <input type="hidden" name="csrf_token" value="${escapeHtml(csrf || "")}">
        <input type="hidden" name="action" value="${book.status === "published" ? "unpublish" : "publish"}">
        <input type="submit" value="${book.status === "published" ? "下架读物" : "确认发布"}">
      </form>
      <section class="card"><h2>书籍封面</h2>
        <img class="book-cover" style="max-width:180px" src="/k/cover/${escapeHtml(book.id)}" alt="${escapeHtml(book.title)}封面">
        <form method="post" action="/admin/books/${escapeHtml(book.id)}" enctype="multipart/form-data">
          <input type="hidden" name="csrf_token" value="${escapeHtml(csrf || "")}"><input type="hidden" name="action" value="cover">
          <label for="cover">JPEG 封面（自动转为灰阶缩略图）</label><input id="cover" name="cover" type="file" accept=".jpg,.jpeg,image/jpeg" required>
          <input type="submit" value="生成并保存 Kindle 封面">
        </form></section>
      <h2>章节解析结果</h2>
      <table><thead><tr><th>顺序</th><th>章节</th><th>页数</th><th>解析提示</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <section class="card"><h2>删除读物</h2><p>删除后将同时移除章节、所有孩子的本书阅读进度、收藏以及上传文件。此操作不可撤销。</p>
        <a class="button" href="/admin/books/${escapeHtml(book.id)}/delete">进入删除确认</a></section>`,
    nav: '<a href="/admin/books">返回读物列表</a>',
  }));
}

async function adminBookDelete(request, env, identity, bookId) {
  const csrf = await adminCsrf(identity, env);
  const book = await env.DB.prepare(`
    SELECT b.id, b.title, b.author, b.cover_original_key, b.cover_thumbnail_key,
      (SELECT COUNT(*) FROM chapters c WHERE c.book_id = b.id) AS chapter_count,
      (SELECT COUNT(*) FROM reading_progress rp WHERE rp.book_id = b.id) AS progress_count,
      (SELECT COUNT(*) FROM user_book_preferences ubp WHERE ubp.book_id = b.id) AS favorite_count
    FROM books b WHERE b.id = ? LIMIT 1
  `).bind(bookId).first();
  if (!book) return errorPage(404, "读物不存在", "该读物可能已经删除。", '<a href="/admin/books">返回读物列表</a>');
  if (request.method === "GET") {
    return htmlResponse(layout({
      title: `删除《${book.title}》`,
      admin: true,
      body: `${adminNavigation()}<h1>确认删除读物</h1>
        <div class="warning"><strong>即将永久删除《${escapeHtml(book.title)}》</strong><p>
        作者：${escapeHtml(book.author || "未填写")}<br>
        章节：${Number(book.chapter_count || 0)}<br>
        阅读进度：${Number(book.progress_count || 0)} 条<br>
        收藏：${Number(book.favorite_count || 0)} 条</p></div>
        <form method="post" action="/admin/books/${escapeHtml(book.id)}/delete">
          <input type="hidden" name="csrf_token" value="${escapeHtml(csrf || "")}">
          <label class="radio-line"><input type="checkbox" name="confirm" value="delete" required> 我确认永久删除此读物和相关数据</label>
          <input type="submit" value="永久删除读物">
        </form>`,
      nav: `<a href="/admin/books/${escapeHtml(book.id)}">取消，返回读物详情</a>`,
    }));
  }
  const form = await request.formData();
  const admin = await requireAdminPost(request, env, form);
  if (admin.response) return admin.response;
  if (String(form.get("confirm") || "") !== "delete") {
    return errorPage(400, "尚未确认删除", "请勾选确认项后再删除。", `<a href="/admin/books/${escapeHtml(book.id)}/delete">返回确认</a>`);
  }
  const files = await env.DB.prepare(`SELECT storage_key FROM book_files WHERE book_id = ?`).bind(bookId).all();
  const storageKeys = [...new Set([
    ...(files.results || []).map((item) => item.storage_key),
    book.cover_original_key,
    book.cover_thumbnail_key,
  ].filter(Boolean))];
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO audit_logs
        (id, actor_type, actor_identifier, action, entity_type, entity_id, details_json, created_at, updated_at)
      VALUES (?, 'admin', ?, 'book_deleted', 'book', ?, ?, datetime('now'), datetime('now'))
    `).bind(crypto.randomUUID(), identity.username, bookId, JSON.stringify({ title: book.title, storageKeys: storageKeys.length })),
    env.DB.prepare(`DELETE FROM books WHERE id = ?`).bind(bookId),
  ]);
  if (storageKeys.length && env.BUCKET?.delete) {
    try {
      await env.BUCKET.delete(storageKeys);
    } catch (error) {
      console.error("book_storage_cleanup_failed", {
        bookId,
        count: storageKeys.length,
        name: String(error?.name || "Error").slice(0, 80),
      });
    }
  }
  return redirect("/admin/books?notice=deleted");
}

async function adminChapterEdit(request, env, identity, chapterId) {
  const csrf = await adminCsrf(identity, env);
  const chapter = await env.DB.prepare(`
    SELECT c.*, b.title AS book_title FROM chapters c JOIN books b ON b.id = c.book_id WHERE c.id = ? LIMIT 1
  `).bind(chapterId).first();
  if (!chapter) return errorPage(404, "章节不存在", "该章节不存在。", '<a href="/admin/books">返回读物列表</a>');
  if (request.method === "GET") {
    return htmlResponse(layout({
      title: "编辑章节",
      admin: true,
      body: `${adminNavigation()}<h1>编辑章节</h1><p>读物：${escapeHtml(chapter.book_title)}</p>
        <form method="post" action="/admin/chapters/${escapeHtml(chapter.id)}/edit">
          <input type="hidden" name="csrf_token" value="${escapeHtml(csrf || "")}">
          <label for="title">章节标题</label><input id="title" name="title" type="text" maxlength="160" value="${escapeHtml(chapter.title)}" required>
          <label for="sort_order">排序数字</label><input id="sort_order" name="sort_order" type="number" min="1" value="${Number(chapter.sort_order)}" required>
          <label for="body">章节正文</label><textarea id="body" name="body" rows="28" required>${escapeHtml(chapter.body)}</textarea>
          <input type="submit" value="保存正文并更新分页">
        </form>`,
      nav: `<a href="/admin/books/${escapeHtml(chapter.book_id)}">返回读物详情</a>`,
    }));
  }
  const form = await request.formData();
  const admin = await requireAdminPost(request, env, form);
  if (admin.response) return admin.response;
  const title = String(form.get("title") || "").trim().slice(0, 160);
  const body = String(form.get("body") || "").trim();
  const sortOrder = Math.max(1, Number.parseInt(String(form.get("sort_order") || "1"), 10) || 1);
  if (!title || !body) return errorPage(400, "章节内容不完整", "标题和正文都不能为空。");
  const statements = [
    env.DB.prepare(`UPDATE chapters SET title = ?, body = ?, sort_order = ?, parsing_warnings = NULL, updated_at = datetime('now') WHERE id = ?`)
      .bind(title, body, sortOrder, chapterId),
    env.DB.prepare(`DELETE FROM chapter_pages WHERE chapter_id = ?`).bind(chapterId),
  ];
  for (const [fontSize, target] of Object.entries(STORED_PAGE_TARGETS)) {
    paginateChapter(body, target).forEach((pageBody, pageIndex) => statements.push(env.DB.prepare(`
      INSERT INTO chapter_pages (id, chapter_id, font_size, page_number, body, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(crypto.randomUUID(), chapterId, fontSize, pageIndex + 1, pageBody)));
  }
  await runBatches(env.DB, statements);
  const total = await env.DB.prepare(`
    SELECT COUNT(*) AS n FROM chapter_pages cp JOIN chapters c ON c.id = cp.chapter_id
    WHERE c.book_id = ? AND cp.font_size = 'medium'
  `).bind(chapter.book_id).first();
  await env.DB.prepare(`UPDATE books SET total_pages = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(Number(total?.n || 0), chapter.book_id).run();
  return redirect(`/admin/books/${encodeURIComponent(chapter.book_id)}?notice=chapter_updated`);
}

function novelParagraphs(text) {
  return String(text || "").split(/\n\s*\n/gu).filter(Boolean).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("");
}

async function kindleBooks(request, env, user, session, account, url) {
  const profile = readingClientProfile(request);
  const scope = ["continue", "all", "favorites"].includes(url.searchParams.get("scope")) ? url.searchParams.get("scope") : "all";
  const scopeSql = scope === "continue" ? "AND rp.book_id IS NOT NULL" : scope === "favorites" ? "AND COALESCE(ubp.is_favorite, 0) = 1" : "";
  const result = await env.DB.prepare(`
    SELECT b.id, b.title, b.author, b.total_chapters, b.total_pages, b.cover_thumbnail_key,
      rp.chapter_id, rp.page, rp.reading_font_scale, rp.pagination_version,
      rp.text_offset, rp.pagination_target, rp.updated_at,
      c.title AS chapter_title, c.sort_order AS chapter_order,
      (SELECT id FROM chapters first_chapter WHERE first_chapter.book_id = b.id ORDER BY sort_order LIMIT 1) AS first_chapter_id,
      (SELECT COUNT(*) FROM chapter_pages cp WHERE cp.chapter_id = rp.chapter_id AND cp.font_size = 'medium') AS chapter_pages,
      COALESCE(ubp.is_favorite, 0) AS is_favorite
    FROM books b
    LEFT JOIN reading_progress rp ON rp.book_id = b.id AND rp.user_id = ?
    LEFT JOIN chapters c ON c.id = rp.chapter_id
    LEFT JOIN user_book_preferences ubp ON ubp.book_id = b.id AND ubp.user_id = ?
    WHERE b.status = 'published' AND b.review_status = 'approved'
      AND (
        b.uploader_account_id IS NULL OR EXISTS (
          SELECT 1 FROM parent_child_bindings pcb
          WHERE pcb.parent_account_id = b.uploader_account_id
            AND (pcb.child_account_id = ? OR pcb.child_identifier = ?)
        )
      )
      ${scopeSql}
    ORDER BY CASE WHEN rp.updated_at IS NULL THEN 1 ELSE 0 END, rp.updated_at DESC, b.sort_order, b.title
  `).bind(user.id, user.id, account.account_id, account.normalized_username).all();
  const allBooks = result.results || [];
  const pageCount = Math.max(1, Math.ceil(allBooks.length / profile.shelfPageSize));
  const requestedPage = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const shelfPage = Math.min(pageCount, requestedPage);
  const visibleBooks = allBooks.slice((shelfPage - 1) * profile.shelfPageSize, shelfPage * profile.shelfPageSize);
  const cards = visibleBooks.map((book) => {
    const chapterPart = Math.max(0, Number(book.chapter_order || 1) - 1);
    const withinChapter = Number(book.chapter_pages || 0) ? Number(book.page || 1) / Number(book.chapter_pages) : 0;
    const progress = book.chapter_id ? Math.min(100, Math.max(1, Math.round((chapterPart + withinChapter) / Math.max(1, Number(book.total_chapters || 1)) * 100))) : 0;
    // Keep the saved page number in the link. kindleRead remaps it from the
    // stored text offset when the viewport or font profile has changed.
    const continuePage = book.chapter_id ? Math.max(1, Number(book.page || 1)) : 1;
    const readChapterId = book.chapter_id || book.first_chapter_id;
    const readHref = readChapterId
      ? readingHref(`/k/read/${book.id}/${readChapterId}/${continuePage}`, profile)
      : `/k/book/${book.id}`;
    return `<section class="book-card"><a class="book-cover-link" href="${escapeHtml(readHref)}"><img class="book-cover" src="/k/cover/${escapeHtml(book.id)}" alt="${escapeHtml(book.title)}封面"></a>
      <div class="book-meta"><h2><a href="${escapeHtml(readHref)}">${escapeHtml(book.title)}${book.chapter_title ? ` · ${progress}%` : ""}</a></h2></div></section>`;
  }).join("");
  const scopeQuery = encodeURIComponent(scope);
  const previousShelf = shelfPage > 1 ? `/k/books?scope=${scopeQuery}&page=${shelfPage - 1}` : null;
  const nextShelf = shelfPage < pageCount ? `/k/books?scope=${scopeQuery}&page=${shelfPage + 1}` : null;
  return htmlResponse(layout({
    title: "阅读",
    brand: false,
    pageClass: `shelf-shell shelf-${profile.kind}`,
    body: `<div class="shelf-head"><div class="shelf-title"><h1>墨读　<span style="font-size:.55em;font-weight:normal">阅读</span></h1><p>你好，${escapeHtml(user.display_name)}</p></div>
      <div class="shelf-actions"><a class="top-link" href="/k/me">${iconSvg("user")} 我的</a></div></div>
      <div class="shelf-tabs"><a class="shelf-tab ${scope === "continue" ? "active" : ""}" href="/k/books?scope=continue">继续阅读</a><a class="shelf-tab ${scope === "all" ? "active" : ""}" href="/k/books?scope=all">全部书籍</a><a class="shelf-tab ${scope === "favorites" ? "active" : ""}" href="/k/books?scope=favorites">收藏</a></div>
      <section class="book-grid">${cards || `<p class="warning">${scope === "continue" ? '还没有阅读记录。<a href="/k/books?scope=all">查看全部书籍</a>' : scope === "favorites" ? '还没有收藏读物。' : '书架暂时为空。绑定家长上传的读物经管理员审核通过后会显示在这里。'}</p>`}</section>
      <div class="shelf-pager"><div class="shelf-pager-cell">${previousShelf ? `<a id="prev-page" href="${previousShelf}">‹ 上一页</a>` : `<span>上一页　${shelfPage}/${pageCount}</span>`}</div>
      <div class="shelf-pager-cell">${nextShelf ? `<a id="next-page" href="${nextShelf}">下一页 ›</a>` : `<span>${shelfPage}/${pageCount}　下一页</span>`}</div></div>`,
    script: viewportCalibrationScript(),
  }));
}

async function kindleBookFavorite(request, env, user, session) {
  const form = await request.formData();
  if (!safeEqual(String(form.get("csrf_token") || ""), session.csrf_token)) return errorPage(403, "表单已过期", "请返回书架重试。");
  const bookId = String(form.get("book_id") || "");
  const favorite = String(form.get("favorite") || "") === "1" ? 1 : 0;
  const book = await env.DB.prepare(`SELECT id FROM books WHERE id = ? AND status = 'published' AND review_status = 'approved' LIMIT 1`).bind(bookId).first();
  if (!book) return errorPage(404, "读物不存在", "该读物已下架或不存在。");
  await env.DB.prepare(`
    INSERT INTO user_book_preferences(user_id, book_id, is_favorite, created_at, updated_at)
    VALUES (?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(user_id, book_id) DO UPDATE SET is_favorite = excluded.is_favorite, updated_at = datetime('now')
  `).bind(user.id, bookId, favorite).run();
  return redirect(`/k/books?scope=${favorite ? "favorites" : "all"}`);
}

async function kindleBookDetail(env, user, account, bookId) {
  const book = await env.DB.prepare(`
    SELECT b.* FROM books b
    WHERE b.id = ? AND b.status = 'published' AND b.review_status = 'approved'
      AND (
        b.uploader_account_id IS NULL OR EXISTS (
          SELECT 1 FROM parent_child_bindings pcb
          WHERE pcb.parent_account_id = b.uploader_account_id
            AND (pcb.child_account_id = ? OR pcb.child_identifier = ?)
        )
      )
    LIMIT 1
  `).bind(bookId, account.account_id, account.normalized_username).first();
  if (!book) return errorPage(404, "读物不存在", "该读物不存在、尚未审核通过或未向当前孩子开放。", '<a href="/k/books">返回阅读</a>');
  const result = await env.DB.prepare(`
    SELECT id, title, sort_order FROM chapters WHERE book_id = ? ORDER BY sort_order
  `).bind(bookId).all();
  const chapters = (result.results || []).map((chapter) => `<a class="button" href="/k/read/${escapeHtml(book.id)}/${escapeHtml(chapter.id)}/1">${Number(chapter.sort_order)}. ${escapeHtml(chapter.title)}</a>`).join("");
  return htmlResponse(layout({
    title: book.title,
    body: `<div class="current-user">当前使用者：${escapeHtml(user.display_name)}</div>
      <h1>${escapeHtml(book.title)}</h1>
      <p>作者：${escapeHtml(book.author || "未署名")}</p>
      <p>${escapeHtml(book.summary || "")}</p>
      <h2>目录</h2>${chapters}`,
    nav: '<a href="/k/books">阅读</a> | <a href="/k/home">个人主页</a>',
  }));
}

async function kindleRead(request, env, user, session, account, bookId, chapterId, pageNumber) {
  await touchAccountActivity(env, account.account_id);
  const [pref, savedProgress] = await Promise.all([
    env.DB.prepare(`SELECT reading_font_scale, reading_line_spacing FROM user_preferences WHERE user_id = ? LIMIT 1`).bind(user.id).first(),
    env.DB.prepare(`SELECT chapter_id, page, reading_font_scale, pagination_version, text_offset, pagination_target FROM reading_progress WHERE user_id = ? AND book_id = ? LIMIT 1`).bind(user.id, bookId).first(),
  ]);
  const profile = readingClientProfile(request);
  const scale = pref?.reading_font_scale || "standard";
  const lineSpacing = pref?.reading_line_spacing || "comfortable";
  const spacing = lineSpacingConfig(lineSpacing);
  const pageLayout = readingPageLayout(scale, lineSpacing, profile);
  const pageTarget = pageLayout.target;
  const book = await env.DB.prepare(`
    SELECT b.id, b.title FROM books b
    WHERE b.id = ? AND b.status = 'published' AND b.review_status = 'approved'
      AND (
        b.uploader_account_id IS NULL OR EXISTS (
          SELECT 1 FROM parent_child_bindings pcb
          WHERE pcb.parent_account_id = b.uploader_account_id
            AND (pcb.child_account_id = ? OR pcb.child_identifier = ?)
        )
      )
    LIMIT 1
  `).bind(bookId, account.account_id, account.normalized_username).first();
  if (!book) return errorPage(404, "读物不可用", "该读物尚未审核通过或未向当前孩子开放。", '<a href="/k/books">返回阅读</a>');
  const chapterResult = await env.DB.prepare(`
    SELECT id, title, body, sort_order FROM chapters WHERE book_id = ? ORDER BY sort_order
  `).bind(bookId).all();
  const chapters = (chapterResult.results || []).map((chapter) => ({
    ...chapter,
    pages: paginateChapterForScreen(chapter.body, pageLayout),
  }));
  const chapterIndex = chapters.findIndex((chapter) => chapter.id === chapterId);
  const chapter = chapters[chapterIndex];
  const savedVersion = Number(savedProgress?.pagination_version || 1);
  const savedTarget = Number(savedProgress?.pagination_target || 0);
  const requiresPositionRemap = savedProgress && savedProgress.chapter_id === chapterId
    && Number(savedProgress.page) === pageNumber
    && (savedVersion < READING_PAGINATION_VERSION || savedTarget !== pageTarget || savedProgress.reading_font_scale !== scale);
  if (chapter && requiresPositionRemap) {
    const oldTarget = savedVersion < 2
      ? legacyFontTarget(savedProgress.reading_font_scale)
      : savedVersion < 3 ? v2FontTarget(savedProgress.reading_font_scale) : Math.max(1, savedTarget);
    const textOffset = savedVersion >= 3
      ? Math.max(0, Number(savedProgress.text_offset || 0))
      : Math.max(0, pageNumber - 1) * oldTarget;
    const migratedPage = pageForTextOffset(chapter.pages, textOffset);
    await env.DB.prepare(`
      UPDATE reading_progress SET page = ?, reading_font_scale = ?, pagination_version = ?, text_offset = ?, pagination_target = ?, updated_at = datetime('now')
      WHERE user_id = ? AND book_id = ?
    `).bind(migratedPage, scale, READING_PAGINATION_VERSION, textOffset, pageTarget, user.id, bookId).run();
    if (migratedPage !== pageNumber) return redirect(readingHref(`/k/read/${bookId}/${chapterId}/${migratedPage}`, profile));
  }
  const pageBody = chapter?.pages?.[pageNumber - 1];
  if (!chapter || pageBody == null) return errorPage(404, "阅读页不存在", "章节或页码不存在。", `<a href="/k/book/${escapeHtml(bookId)}">返回目录</a>`);
  const pagesBefore = chapters.slice(0, chapterIndex).reduce((sum, item) => sum + item.pages.length, 0);
  const bookPages = chapters.reduce((sum, item) => sum + item.pages.length, 0);
  await env.DB.prepare(`
    INSERT INTO reading_progress
      (id, user_id, book_id, chapter_id, page, font_size, reading_font_scale, pagination_version,
       text_offset, pagination_target, last_read_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'medium', ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
    ON CONFLICT(user_id, book_id) DO UPDATE SET
      chapter_id = excluded.chapter_id, page = excluded.page, font_size = excluded.font_size,
      reading_font_scale = excluded.reading_font_scale,
      pagination_version = excluded.pagination_version,
      text_offset = excluded.text_offset,
      pagination_target = excluded.pagination_target,
      last_read_at = datetime('now'), updated_at = datetime('now')
  `).bind(crypto.randomUUID(), user.id, bookId, chapterId, pageNumber, scale,
    READING_PAGINATION_VERSION, textOffsetForPage(chapter.pages, pageNumber), pageTarget).run();
  await recordReadingExposures(env, user.id, bookId, chapterId, pageNumber, pageBody);
  const prevPagePath = pageNumber > 1
    ? `/k/read/${bookId}/${chapterId}/${pageNumber - 1}`
    : chapterIndex > 0 ? `/k/read/${bookId}/${chapters[chapterIndex - 1].id}/${chapters[chapterIndex - 1].pages.length}` : null;
  const nextPagePath = pageNumber < chapter.pages.length
    ? `/k/read/${bookId}/${chapterId}/${pageNumber + 1}`
    : chapterIndex < chapters.length - 1 ? `/k/read/${bookId}/${chapters[chapterIndex + 1].id}/1` : null;
  const prevPage = prevPagePath ? readingHref(prevPagePath, profile) : null;
  const nextPage = nextPagePath ? readingHref(nextPagePath, profile) : null;
  const currentReadPath = readingHref(`/k/read/${bookId}/${chapterId}/${pageNumber}`, profile);
  const progress = Math.min(100, Math.max(1, Math.round((pagesBefore + pageNumber) / Math.max(1, bookPages) * 100)));
  const absolutePage = pagesBefore + pageNumber;
  return htmlResponse(layout({
    title: `${book.title} · ${chapter.title}`,
    brand: false,
    pageClass: `reader-shell reader-${profile.kind}`,
    body: `<header class="reader-context"><div class="reader-context-item"><a href="/k/books?scope=all">‹ ${escapeHtml(book.title.length > 7 ? `${book.title.slice(0, 7)}…` : book.title)}</a></div>
      <div class="reader-context-item">${escapeHtml(chapter.title)}</div><div class="reader-context-item"><a href="/k/settings?return_to=${encodeURIComponent(currentReadPath)}">Aa</a></div></header>
      <section class="reader-page"><article class="reader-page-body" style="font-size:${readingDisplayPixels(scale, profile)}px;line-height:${spacing.value}">${novelParagraphs(pageBody)}</article></section>
      <div class="reader-page-number">第 ${absolutePage} / ${bookPages} 页　·　${progress}%</div>
      <div class="reader-bottom-bar"><div class="reader-bottom-item"><a href="/k/books?scope=all">书架</a></div>
      <div class="reader-bottom-item"><a href="/k/settings?return_to=${encodeURIComponent(currentReadPath)}">字体</a></div>
      <div class="reader-bottom-item"><a href="/k/book/${escapeHtml(bookId)}">目录</a></div>
      <div class="reader-bottom-item ${prevPage ? "" : "disabled"}">${prevPage ? `<a id="prev-page" href="${escapeHtml(prevPage)}">上一页</a>` : "<span>上一页</span>"}</div>
      <div class="reader-bottom-item ${nextPage ? "" : "disabled"}">${nextPage ? `<a id="next-page" href="${escapeHtml(nextPage)}">下一页</a>` : "<span>读完</span>"}</div></div>`,
    script: viewportCalibrationScript(),
  }));
}

async function recordReadingExposures(env, userId, bookId, chapterId, pageNumber, pageBody) {
  const lemmas = [...new Set((String(pageBody).match(/[A-Za-z]+(?:['’][A-Za-z]+)?/gu) || [])
    .map((word) => word.toLocaleLowerCase("en-US").replaceAll("’", "'")))]
    .slice(0, 80);
  if (!lemmas.length) return;
  const placeholders = lemmas.map(() => "?").join(",");
  const result = await env.DB.prepare(`
    SELECT word_id FROM modu_vocab_lexemes WHERE lemma IN (${placeholders})
  `).bind(...lemmas).all();
  const readingId = `${bookId}:${chapterId}:${pageNumber}`;
  const nowIso = new Date().toISOString();
  const statements = (result.results || []).map((row) => {
    const identity = `${userId}:${readingId}:${row.word_id}`;
    return env.DB.prepare(`
      INSERT INTO modu_vocab_reading_exposures(
        exposure_id, user_id, word_id, reading_id, exposure_at, validated
      ) VALUES (?, ?, ?, ?, ?, 0)
      ON CONFLICT(exposure_id) DO NOTHING
    `).bind(identity, userId, row.word_id, readingId, nowIso);
  });
  if (statements.length) await env.DB.batch(statements);
}

async function kindleWordsHome(env, user, session) {
  const plan = await env.DB.prepare(`
    SELECT * FROM study_plans WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1
  `).bind(user.id).first();
  const counts = await env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM questions
       WHERE verification_status = 'verified' AND options_json IS NOT NULL
         AND question_type IN ('choice_en_zh','choice_zh_en','grammar_choice','phrase_choice','sentence_fill','tense_choice','true_false')) AS verified_questions,
      (SELECT COUNT(*) FROM mistakes WHERE user_id = ? AND mastery_status != 'temporary_mastered') AS pending_mistakes,
      (SELECT COUNT(*) FROM attempts WHERE user_id = ? AND date(created_at, '+8 hours') = date('now', '+8 hours')) AS today_attempts,
      (SELECT SUM(is_correct) FROM attempts WHERE user_id = ? AND date(created_at, '+8 hours') = date('now', '+8 hours')) AS today_correct
  `).bind(user.id, user.id, user.id).first();
  const today = Number(counts?.today_attempts || 0);
  const correct = Number(counts?.today_correct || 0);
  return htmlResponse(layout({
    title: `${user.display_name}的单词学习`,
    body: `<div class="current-user">当前使用者：${escapeHtml(user.display_name)}</div>
      <h1>${escapeHtml(user.display_name)}的单词学习</h1>
      <section class="card">
        <h2>今日任务</h2>
        <p>新单词：${Number(plan?.daily_new_words ?? 10)}<br>
        复习单词：${Number(plan?.daily_review_words ?? 20)}<br>
        固定搭配：${Number(plan?.daily_phrases ?? 5)}<br>
        语法题：${Number(plan?.daily_grammar ?? 5)}</p>
        <p class="muted">当前可用已审核原创题：${Number(counts?.verified_questions || 0)}</p>
      </section>
      <form method="post" action="/k/practice/start">
        <input type="hidden" name="csrf_token" value="${escapeHtml(session.csrf_token)}">
        <input type="hidden" name="mode" value="daily">
        <input type="submit" value="开始学习">
      </form>
      <form method="post" action="/k/practice/start">
        <input type="hidden" name="csrf_token" value="${escapeHtml(session.csrf_token)}">
        <input type="hidden" name="mode" value="mistakes">
        <input type="submit" value="错题复习（${Number(counts?.pending_mistakes || 0)}）">
      </form>
      <form method="post" action="/k/practice/start">
        <input type="hidden" name="csrf_token" value="${escapeHtml(session.csrf_token)}">
        <input type="hidden" name="mode" value="test">
        <input type="submit" value="综合测试">
      </form>
      <a class="button" href="/k/records">学习记录</a>
      <section class="card"><h2>今日记录</h2><p>已完成：${today} 题<br>正确率：${today ? Math.round(correct / today * 100) : 0}%</p></section>`,
    nav: '<a href="/k/home">个人主页</a>',
  }));
}

async function ensureWordsPlan(env, userId) {
  const parentPlan = await env.DB.prepare(`
    SELECT pp.parent_account_id, pp.plan_name, pp.batch_size, pp.collection_id
    FROM accounts child
    JOIN parent_child_bindings pcb ON pcb.child_account_id = child.id
    JOIN modu_vocab_parent_plans pp
      ON pp.parent_account_id = pcb.parent_account_id
      AND pp.child_identifier = pcb.child_identifier
      AND pp.active = 1
    WHERE child.user_id = ? AND child.status = 'active'
    ORDER BY pp.updated_at DESC LIMIT 1
  `).bind(userId).first();
  if (parentPlan) {
    await env.DB.prepare(`
      INSERT INTO modu_vocab_user_settings(
        user_id, batch_size, active_collection_id, spelling_mode, plan_name,
        plan_owner, managed_by_parent_account_id, plan_configured, updated_at
      ) VALUES (?, ?, ?, 0, ?, 'parent', ?, 1, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET
        batch_size = excluded.batch_size,
        active_collection_id = excluded.active_collection_id,
        plan_name = excluded.plan_name,
        plan_owner = 'parent',
        managed_by_parent_account_id = excluded.managed_by_parent_account_id,
        plan_configured = 1,
        updated_at = excluded.updated_at
    `).bind(userId, parentPlan.batch_size, parentPlan.collection_id, parentPlan.plan_name, parentPlan.parent_account_id).run();
  } else {
    await env.DB.prepare(`
      INSERT INTO modu_vocab_user_settings(
        user_id, batch_size, active_collection_id, spelling_mode, plan_name,
        plan_owner, managed_by_parent_account_id, updated_at
      ) VALUES (?, 14, ?, 0, '墨读核心500计划', 'child', NULL, datetime('now'))
      ON CONFLICT(user_id) DO NOTHING
    `).bind(userId, MODU_CORE_COLLECTION).run();
  }
}

async function kindleWordsV2Home(env, user, session, url) {
  await ensureWordsPlan(env, user.id);
  await env.DB.prepare(`
    INSERT INTO modu_vocab_user_settings(user_id, batch_size, active_collection_id, spelling_mode, updated_at)
    VALUES (?, 14, ?, 0, datetime('now'))
    ON CONFLICT(user_id) DO NOTHING
  `).bind(user.id, MODU_CORE_COLLECTION).run();
  const settings = await env.DB.prepare(`
    SELECT s.batch_size, s.active_collection_id, s.plan_name, s.plan_owner,
      s.plan_configured,
      c.name AS collection_name,
      (SELECT COUNT(*) FROM modu_vocab_collection_members m WHERE m.collection_id = s.active_collection_id) AS collection_words
    FROM modu_vocab_user_settings s
    LEFT JOIN modu_vocab_collections c ON c.collection_id = s.active_collection_id
    WHERE s.user_id = ?
  `).bind(user.id).first();
  const counts = await env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM modu_vocab_collection_members WHERE collection_id = ?) AS collection_words,
      (SELECT COUNT(*) FROM modu_vocab_progress WHERE user_id = ? AND stage = 'initial') AS initial_words,
      (SELECT COUNT(*) FROM modu_vocab_progress WHERE user_id = ? AND stage = 'familiar') AS familiar_words,
      (SELECT COUNT(*) FROM modu_vocab_progress WHERE user_id = ? AND stage = 'mastered') AS mastered_words,
      (SELECT COUNT(*) FROM modu_vocab_learning_events
       WHERE user_id = ? AND date(event_at, '+8 hours') = date('now', '+8 hours')) AS today_events,
      (SELECT COUNT(*) FROM modu_vocab_sessions
       WHERE user_id = ? AND finished_at IS NULL) AS open_sessions
  `).bind(
    settings?.active_collection_id || MODU_CORE_COLLECTION,
    user.id, user.id, user.id, user.id, user.id,
  ).first();
  const batchSize = MODU_BATCH_SIZES.includes(Number(settings?.batch_size)) ? Number(settings.batch_size) : 14;
  return htmlResponse(layout({
    title: `${user.display_name}的单词学习`,
    brand: false,
    pageClass: "study-screen",
    body: `<div class="current-user">${escapeHtml(user.display_name)}的单词学习</div>
      <h1>墨读单词</h1>
      ${["settings-saved", "plan-saved"].includes(url.searchParams.get("notice")) ? '<div class="notice">学习计划已保存。</div>' : ""}
      <a class="button" href="/k/words/setup">${Number(settings?.plan_configured || 0) ? "修改学习计划" : "制定我的学习计划"}</a>
      <section class="card">
        <h2>今日节奏</h2>
        <p>计划：<strong>${escapeHtml(settings?.plan_name || "我的学习计划")}</strong><br>
        学习范围：${escapeHtml(settings?.collection_name || "墨读核心500")}（${Number(settings?.collection_words || 0)} 词）<br>
        每日学习量：<strong>${batchSize} 词</strong><br>
        每 7 词自动保存；制定者：${settings?.plan_owner === "parent" ? "家长" : "孩子自主"}</p>
      </section>
      <div class="study-actions"><form method="post" action="/k/words/session/start">
        <input type="hidden" name="csrf_token" value="${escapeHtml(session.csrf_token)}">
        <input type="submit" value="${Number(counts?.open_sessions || 0) ? "继续学习" : "开始学习"}">
      </form><a class="button" href="/k/words/progress">学习进度</a></div>
      <section class="card"><strong>学习状态</strong><p>初识 ${Number(counts?.initial_words || 0)}　·　熟悉 ${Number(counts?.familiar_words || 0)}　·　掌握 ${Number(counts?.mastered_words || 0)}　·　今日 ${Number(counts?.today_events || 0)}</p></section>`,
    nav: '<a href="/k/records">历史记录</a> | <a href="/k/home">个人主页</a>',
  }));
}

async function kindleWordsSetup(request, env, user, session) {
  await ensureWordsPlan(env, user.id);
  const collections = await availableLearningCollections(env);
  const existing = await env.DB.prepare(`
    SELECT s.*, c.name AS collection_name
    FROM modu_vocab_user_settings s
    LEFT JOIN modu_vocab_collections c ON c.collection_id = s.active_collection_id
    WHERE s.user_id = ?
  `).bind(user.id).first();
  if (request.method === "POST") {
    const form = await request.formData();
    if (!safeEqual(String(form.get("csrf_token") || ""), session.csrf_token)) {
      return errorPage(403, "表单已过期", "请返回单词设置页重新提交。", '<a href="/k/words/setup">返回设置</a>');
    }
    if (existing?.plan_owner === "parent") {
      return errorPage(403, "计划由家长管理", "请由家长在孩子/学生设定中修改，或切换为孩子自主制定。", '<a href="/k/words/setup">查看当前计划</a>');
    }
    const batchSize = Number(form.get("batch_size"));
    const collectionId = String(form.get("collection_id") || "");
    const collection = collections.find((item) => item.collection_id === collectionId);
    if (!MODU_BATCH_SIZES.includes(batchSize) || !collection) {
      return errorPage(400, "学习计划无效", "请选择有效的学习范围和每日学习量。", '<a href="/k/words/setup">返回设置</a>');
    }
    await env.DB.batch([
      env.DB.prepare(`
        UPDATE modu_vocab_user_settings
        SET batch_size = ?, active_collection_id = ?, plan_name = ?,
          plan_owner = 'child', managed_by_parent_account_id = NULL,
          plan_configured = 1, updated_at = datetime('now')
        WHERE user_id = ?
      `).bind(batchSize, collectionId, `${collection.name}计划`, user.id),
      env.DB.prepare(`
        UPDATE modu_vocab_sessions SET finished_at = datetime('now')
        WHERE user_id = ? AND finished_at IS NULL
      `).bind(user.id),
    ]);
    return redirect("/k/words?notice=plan-saved");
  }
  const batchSize = MODU_BATCH_SIZES.includes(Number(existing?.batch_size)) ? Number(existing.batch_size) : 14;
  const parentManaged = existing?.plan_owner === "parent";
  return htmlResponse(layout({
    title: "我的学习计划",
    brand: false,
    pageClass: "study-screen",
    body: `<div class="current-user">当前使用者：${escapeHtml(user.display_name)}</div>
      <h1>我的学习计划</h1>
      ${parentManaged ? `<div class="warning">当前计划由家长制定。孩子可以查看，但不能自行修改。</div>
        <section class="card"><p>学习范围：${escapeHtml(existing.collection_name || "墨读核心500")}<br>每日学习量：${batchSize} 词<br>每 7 词保存一次</p></section>` : `<p>选择当前要学习的阶段或教材范围，再选择每日学习量。已有学习记录不会因切换范围而删除。</p>
      <form method="post" action="/k/words/setup">
        <input type="hidden" name="csrf_token" value="${escapeHtml(session.csrf_token)}">
        <label for="collection_id">学习范围</label>
        <select id="collection_id" name="collection_id" required>${learningCollectionOptions(collections, existing?.active_collection_id || MODU_CORE_COLLECTION)}</select>
        <fieldset><legend>每日新词上限</legend>
          ${MODU_BATCH_SIZES.map((size) => `<label class="radio-line"><input type="radio" name="batch_size" value="${size}" ${size === batchSize ? "checked" : ""}> ${size} 词（${size / 7} 个微单元）</label>`).join("")}
        </fieldset>
        <input type="submit" value="保存学习计划">
      </form>`}`,
    nav: '<a href="/k/words">返回单词</a> | <a href="/k/home">个人主页</a>',
  }));
}

async function kindleWordsProgress(env, user) {
  const counts = await env.DB.prepare(`
    SELECT
      COUNT(*) AS learned,
      SUM(CASE WHEN stage = 'initial' THEN 1 ELSE 0 END) AS initial_words,
      SUM(CASE WHEN stage = 'familiar' THEN 1 ELSE 0 END) AS familiar_words,
      SUM(CASE WHEN stage = 'mastered' THEN 1 ELSE 0 END) AS mastered_words
    FROM modu_vocab_progress WHERE user_id = ?
  `).bind(user.id).first();
  return htmlResponse(layout({
    title: "单词学习进度",
    brand: false,
    pageClass: "study-screen",
    body: `<div class="current-user">当前使用者：${escapeHtml(user.display_name)}</div>
      <h1>学习进度</h1>
      <section class="card"><p>
        已进入学习：${Number(counts?.learned || 0)} 词<br>
        初识：${Number(counts?.initial_words || 0)} 词<br>
        熟悉：${Number(counts?.familiar_words || 0)} 词<br>
        掌握：${Number(counts?.mastered_words || 0)} 词
      </p></section>
      <p class="muted">掌握不是当天刷题获得：需要跨会话、跨日期，并包含主动回忆与语境学习。</p>`,
    nav: '<a href="/k/words">返回单词</a> | <a href="/k/home">个人主页</a>',
  }));
}

async function kindleWordsLegacy(env, user, session) {
  const response = await kindleWordsHome(env, user, session);
  const body = await response.text();
  return new Response(body.replace(
    '<h1>',
    '<div class="notice">原六年级上册词库、题库和历史记录已完整保留。本页继续使用旧版练习系统。</div><h1>',
  ), { status: response.status, headers: response.headers });
}

function parseSessionPlan(session) {
  try {
    const metadata = JSON.parse(session?.metadata_json || "{}");
    const wordIds = Array.isArray(metadata.wordIds) ? metadata.wordIds.filter(Boolean) : [];
    return { ...metadata, wordIds };
  } catch {
    return { wordIds: [] };
  }
}

async function startWordsSession(request, env, user, session) {
  const form = await request.formData();
  if (!safeEqual(String(form.get("csrf_token") || ""), session.csrf_token)) {
    return errorPage(403, "表单已过期", "请返回单词首页重新开始。", '<a href="/k/words">返回单词</a>');
  }
  const open = await env.DB.prepare(`
    SELECT s.*, (SELECT COUNT(*) FROM modu_vocab_learning_events e WHERE e.session_id = s.session_id) AS answered
    FROM modu_vocab_sessions s
    WHERE s.user_id = ? AND s.finished_at IS NULL
    ORDER BY s.started_at DESC LIMIT 1
  `).bind(user.id).first();
  if (open) {
    const openPlan = parseSessionPlan(open);
    const next = Math.min(openPlan.wordIds.length, Number(open.answered || 0) + 1);
    if (next > 0 && next <= openPlan.wordIds.length) return redirect(`/k/words/session/${encodeURIComponent(open.session_id)}/${next}`);
    await env.DB.prepare(`UPDATE modu_vocab_sessions SET finished_at = datetime('now') WHERE session_id = ?`).bind(open.session_id).run();
  }

  const settings = await env.DB.prepare(`
    SELECT batch_size, active_collection_id FROM modu_vocab_user_settings WHERE user_id = ?
  `).bind(user.id).first();
  const batchSize = MODU_BATCH_SIZES.includes(Number(settings?.batch_size)) ? Number(settings.batch_size) : 14;
  const collectionId = settings?.active_collection_id || MODU_CORE_COLLECTION;
  const repository = new D1Repository(env.DB);
  const [words, progresses] = await Promise.all([
    repository.listLexemes(collectionId, 500),
    repository.listProgress(user.id),
  ]);
  const learned = new Set(progresses.map((progress) => progress.wordId));
  const exposureResult = await env.DB.prepare(`
    SELECT word_id, MAX(exposure_at) AS latest_exposure
    FROM modu_vocab_reading_exposures
    WHERE user_id = ?
    GROUP BY word_id
    ORDER BY latest_exposure DESC
  `).bind(user.id).all();
  const exposurePriority = new Map((exposureResult.results || []).map((row, index) => [row.word_id, index]));
  const candidateNewWordIds = words
    .filter((word) => !learned.has(word.id))
    .sort((left, right) => {
      const leftPriority = exposurePriority.get(left.id) ?? Number.MAX_SAFE_INTEGER;
      const rightPriority = exposurePriority.get(right.id) ?? Number.MAX_SAFE_INTEGER;
      return leftPriority - rightPriority;
    })
    .map((word) => word.id);
  const planned = planSession({
    batchSize,
    nowIso: new Date().toISOString(),
    progresses,
    candidateNewWordIds,
  });
  const wordIds = [...planned.reviewWordIds, ...planned.newWordIds];
  if (!wordIds.length) {
    return htmlResponse(layout({
      title: "今日单词已完成",
      brand: false,
      pageClass: "study-screen",
      body: `<h1>今天先学到这里</h1><p>当前没有需要安排的新词或复现词。明天再来，墨读会按学习状态重新安排。</p>`,
      nav: '<a href="/k/words">返回单词</a> | <a href="/k/home">个人主页</a>',
    }));
  }
  const sessionId = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO modu_vocab_sessions(session_id, user_id, collection_id, batch_size, started_at, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(sessionId, user.id, collectionId, batchSize, new Date().toISOString(), JSON.stringify({
    wordIds,
    reviewWordIds: planned.reviewWordIds,
    newWordIds: planned.newWordIds,
    microUnitSize: 7,
  })).run();
  return redirect(`/k/words/session/${encodeURIComponent(sessionId)}/1`);
}

async function wordsSessionContext(env, user, sessionId, itemNumber) {
  const session = await env.DB.prepare(`
    SELECT * FROM modu_vocab_sessions WHERE session_id = ? AND user_id = ? LIMIT 1
  `).bind(sessionId, user.id).first();
  if (!session) return null;
  const plan = parseSessionPlan(session);
  const wordId = plan.wordIds[itemNumber - 1];
  if (!wordId) return { session, plan, word: null, itemNumber };
  const repository = new D1Repository(env.DB);
  const word = await repository.getLexeme(wordId);
  return { session, plan, word, itemNumber, repository };
}

async function wordsSessionCard(request, env, user, accountSession, sessionId, itemNumber) {
  const context = await wordsSessionContext(env, user, sessionId, itemNumber);
  if (!context) return errorPage(404, "学习会话不存在", "会话可能已经结束。", '<a href="/k/words">返回单词</a>');
  if (!context.word) return redirect("/k/words");
  if (request.method === "POST") {
    const form = await request.formData();
    if (!safeEqual(String(form.get("csrf_token") || ""), accountSession.csrf_token)) {
      return errorPage(403, "表单已过期", "本题没有保存，请重新作答。", `<a href="/k/words/session/${encodeURIComponent(sessionId)}/${itemNumber}">重新作答</a>`);
    }
    const selected = String(form.get("answer") || "");
    const success = safeEqual(selected, context.word.id);
    const current = await context.repository.getProgress(user.id, context.word.id);
    const exposure = await env.DB.prepare(`
      SELECT exposure_id FROM modu_vocab_reading_exposures
      WHERE user_id = ? AND word_id = ? AND validated = 0
      ORDER BY exposure_at DESC LIMIT 1
    `).bind(user.id, context.word.id).first();
    const activities = availableActivities(context.word);
    const activity = exposure && success
      ? "reading"
      : !current
        ? "meaning"
        : current.stage === "familiar" && activities.includes("context") ? "context" : "recall";
    const eventId = `${sessionId}:${itemNumber}`;
    await context.repository.saveEvent(user.id, {
      eventId,
      wordId: context.word.id,
      sessionId,
      at: new Date().toISOString(),
      activity,
      success,
      validated: activity === "reading",
      payload: { itemNumber, selectedWordId: selected },
    });
    if (activity === "reading" && exposure) {
      await env.DB.prepare(`
        UPDATE modu_vocab_reading_exposures
        SET validated = 1, validation_event_id = ?
        WHERE exposure_id = ?
      `).bind(eventId, exposure.exposure_id).run();
    }
    if (itemNumber >= context.plan.wordIds.length) {
      await env.DB.prepare(`UPDATE modu_vocab_sessions SET finished_at = datetime('now') WHERE session_id = ? AND user_id = ?`).bind(sessionId, user.id).run();
    }
    return redirect(`/k/words/session/${encodeURIComponent(sessionId)}/${itemNumber}/result`);
  }

  const distractors = await env.DB.prepare(`
    SELECT l.word_id, l.meaning_zh
    FROM modu_vocab_collection_members m
    JOIN modu_vocab_lexemes l ON l.word_id = m.word_id
    WHERE m.collection_id = ? AND l.word_id != ?
    ORDER BY abs(m.sort_order - (SELECT sort_order FROM modu_vocab_collection_members WHERE collection_id = ? AND word_id = ?)), m.sort_order
    LIMIT 3
  `).bind(context.session.collection_id, context.word.id, context.session.collection_id, context.word.id).all();
  const choices = [{ word_id: context.word.id, meaning_zh: context.word.meaningZh }, ...(distractors.results || [])]
    .sort((left, right) => String(left.word_id).localeCompare(String(right.word_id)));
  return htmlResponse(layout({
    title: `单词 ${itemNumber} / ${context.plan.wordIds.length}`,
    brand: false,
    pageClass: "study-screen",
    body: `<div class="current-user">${escapeHtml(user.display_name)}　·　第 ${itemNumber} / ${context.plan.wordIds.length} 词</div>
      <p class="muted">每 7 词自动形成一个微单元</p>
      <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:48px">${escapeHtml(context.word.displayForm || context.word.lemma)}</h1>
      <p>请选择最合适的中文意思：</p>
      <form method="post" action="/k/words/session/${encodeURIComponent(sessionId)}/${itemNumber}">
        <input type="hidden" name="csrf_token" value="${escapeHtml(accountSession.csrf_token)}">
        ${choices.map((choice) => `<label class="radio-line"><input type="radio" name="answer" value="${escapeHtml(choice.word_id)}" required> ${escapeHtml(choice.meaning_zh)}</label>`).join("")}
        <input type="submit" value="提交答案">
      </form>`,
    nav: '<a href="/k/words">保存并停止</a>',
  }));
}

async function wordsSessionResult(env, user, sessionId, itemNumber) {
  const context = await wordsSessionContext(env, user, sessionId, itemNumber);
  if (!context?.word) return errorPage(404, "学习结果不存在", "无法找到本题。", '<a href="/k/words">返回单词</a>');
  const event = await env.DB.prepare(`
    SELECT success FROM modu_vocab_learning_events WHERE event_id = ? AND user_id = ? LIMIT 1
  `).bind(`${sessionId}:${itemNumber}`, user.id).first();
  if (!event) return redirect(`/k/words/session/${encodeURIComponent(sessionId)}/${itemNumber}`);
  const progress = await context.repository.getProgress(user.id, context.word.id);
  const nextNumber = itemNumber + 1;
  const finished = nextNumber > context.plan.wordIds.length;
  const microUnitDone = itemNumber % 7 === 0 || finished;
  const stageLabel = { new: "新词", initial: "初识", familiar: "熟悉", mastered: "掌握" }[progress?.stage] || "初识";
  return htmlResponse(layout({
    title: event.success ? "回答正确" : "再认识一次",
    brand: false,
    pageClass: "study-screen",
    body: `<div class="${event.success ? "notice" : "warning"}">${event.success ? "回答正确" : "这次没有选对，答案已经记下"}</div>
      <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:48px">${escapeHtml(context.word.displayForm || context.word.lemma)}</h1>
      <p><strong>${escapeHtml(context.word.meaningZh)}</strong></p>
      ${context.word.examples?.[0] ? `<p style="font-family:Georgia,'Times New Roman',serif">${escapeHtml(context.word.examples[0].text)}</p>${context.word.examples[0].translationZh ? `<p>${escapeHtml(context.word.examples[0].translationZh)}</p>` : ""}` : ""}
      <p class="muted">当前状态：${stageLabel}</p>
      ${microUnitDone ? `<section class="card"><strong>本组已保存</strong><p>已完成 ${itemNumber} 词。现在停下也不会丢失进度。</p></section>` : ""}
      ${finished ? '<a class="button" href="/k/words">完成今日学习</a>' : `<a class="button" href="/k/words/session/${encodeURIComponent(sessionId)}/${nextNumber}">学习下一个</a>`}
      ${microUnitDone && !finished ? '<a class="button" href="/k/words">保存并停止</a>' : ""}`,
    nav: '<a href="/k/words">返回单词</a> | <a href="/k/home">个人主页</a>',
  }));
}

async function allowedQuestionTypes(env, account) {
  const result = await env.DB.prepare(`
    SELECT al.question_types_json
    FROM parent_child_assessment_assignments pcaa
    JOIN assessment_libraries al ON al.id = pcaa.assessment_library_id
    WHERE pcaa.status = 'active' AND al.status = 'approved'
      AND pcaa.child_identifier = ?
  `).bind(account.normalized_username).all();
  const selected = new Set();
  for (const row of result.results || []) {
    try {
      for (const type of JSON.parse(row.question_types_json || "[]")) {
        if (KINDLE_SAFE_QUESTION_TYPES.includes(type)) selected.add(type);
      }
    } catch {
      // Ignore an invalid library record and retain other valid assignments.
    }
  }
  return selected.size ? [...selected] : [...KINDLE_SAFE_QUESTION_TYPES];
}

async function startPractice(request, env, user, session, account) {
  const form = await request.formData();
  if (!safeEqual(String(form.get("csrf_token") || ""), session.csrf_token)) {
    return errorPage(403, "CSRF 校验失败", "表单已过期，请返回单词主页后重试。");
  }
  const requestedMode = String(form.get("mode") || "daily");
  const mode = ["daily", "mistakes", "test"].includes(requestedMode) ? requestedMode : "daily";
  const plan = await env.DB.prepare(`
    SELECT id, daily_new_words, daily_review_words, daily_phrases, daily_grammar, mistakes_only
    FROM study_plans WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1
  `).bind(user.id).first();
  const taskSize = mode === "test" ? 30 : mode === "mistakes" || plan?.mistakes_only
    ? Math.max(1, Math.min(50, Number(plan?.daily_review_words || 20)))
    : Math.max(1, Math.min(50, Number(plan?.daily_new_words || 10) + Number(plan?.daily_review_words || 20) + Number(plan?.daily_phrases || 5) + Number(plan?.daily_grammar || 5)));
  const allowedTypes = await allowedQuestionTypes(env, account);
  const typePlaceholders = allowedTypes.map(() => "?").join(",");
  let query;
  if (mode === "mistakes" || plan?.mistakes_only) {
    query = env.DB.prepare(`
      SELECT DISTINCT q.id
      FROM questions q
      JOIN mistakes m ON m.question_id = q.id
      WHERE q.verification_status = 'verified' AND q.options_json IS NOT NULL
        AND q.question_type IN (${typePlaceholders})
        AND m.user_id = ? AND m.mastery_status != 'temporary_mastered'
      ORDER BY m.last_wrong_at DESC, m.error_count DESC
      LIMIT ?
    `).bind(...allowedTypes, user.id, taskSize);
  } else {
    query = env.DB.prepare(`
      SELECT q.id
      FROM questions q
      WHERE q.verification_status = 'verified' AND q.options_json IS NOT NULL
        AND q.question_type IN (${typePlaceholders})
      ORDER BY
        CASE WHEN EXISTS (
          SELECT 1 FROM mistakes m
          WHERE m.user_id = ? AND m.question_id = q.id AND m.mastery_status != 'temporary_mastered'
        ) THEN 0 ELSE 1 END,
        random()
      LIMIT ?
    `).bind(...allowedTypes, user.id, taskSize);
  }
  const result = await query.all();
  const questions = result.results || [];
  if (!questions.length) {
    return errorPage(
      409,
      mode === "mistakes" ? "暂无待复习错题" : "暂无可用练习题",
      mode === "mistakes" ? "当前没有尚未掌握的错题。" : "请由家长在后台审核题目后再开始练习。",
      '<a href="/k/words">返回单词模块</a>',
    );
  }
  const practiceId = crypto.randomUUID();
  const statements = [
    env.DB.prepare(`
      INSERT INTO practice_sessions
        (id, user_id, device_id, study_plan_id, scope_json, current_number, status, started_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, 'active', datetime('now'), datetime('now'), datetime('now'))
    `).bind(practiceId, user.id, session.device_id, plan?.id || null, JSON.stringify({ mode })),
  ];
  const secret = env.SESSION_SECRET;
  if (!secret) return errorPage(500, "系统设置未完成", "练习提交密钥尚未配置。");
  for (let index = 0; index < questions.length; index += 1) {
    const itemId = crypto.randomUUID();
    const rawToken = await hmac(secret, `practice:${itemId}`);
    const tokenHash = await sha256(rawToken);
    statements.push(env.DB.prepare(`
      INSERT INTO practice_session_items
        (id, session_id, question_id, sequence_number, submission_token_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(itemId, practiceId, questions[index].id, index + 1, tokenHash));
  }
  await runBatches(env.DB, statements);
  return redirect(`/k/practice/${encodeURIComponent(practiceId)}/1`);
}

async function getPracticeContext(env, user, session, practiceId, number) {
  return env.DB.prepare(`
    SELECT ps.id AS session_id, ps.user_id, ps.device_id, ps.status AS session_status, ps.scope_json,
      psi.id AS item_id, psi.sequence_number, psi.submission_token_hash, psi.answered_at,
      q.id AS question_id, q.question_type, q.prompt, q.options_json, q.correct_answer,
      q.acceptable_answers_json, q.explanation, q.content_type, q.content_id, q.unit_id,
      (SELECT COUNT(*) FROM practice_session_items x WHERE x.session_id = ps.id) AS total_items
    FROM practice_sessions ps
    JOIN practice_session_items psi ON psi.session_id = ps.id
    JOIN questions q ON q.id = psi.question_id
    WHERE ps.id = ? AND ps.user_id = ? AND ps.device_id = ? AND psi.sequence_number = ?
    LIMIT 1
  `).bind(practiceId, user.id, session.device_id, number).first();
}

function normalizeAnswer(value) {
  return String(value || "").normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}

async function practiceQuestion(request, env, user, session, practiceId, number) {
  const context = await getPracticeContext(env, user, session, practiceId, number);
  if (!context) return errorPage(404, "题目不存在", "练习会话、题号或当前使用者不匹配。", '<a href="/k/words">返回单词</a>');
  if (context.answered_at) return redirect(`/k/practice/${encodeURIComponent(practiceId)}/${number}/result`);
  if (request.method === "POST") {
    const form = await request.formData();
    if (!safeEqual(String(form.get("csrf_token") || ""), session.csrf_token)) {
      return errorPage(403, "CSRF 校验失败", "表单已过期，请返回题目页重试。");
    }
    const rawToken = String(form.get("submission_token") || "");
    if (!safeEqual(await sha256(rawToken), context.submission_token_hash)) {
      return errorPage(409, "表单已过期", "该题提交令牌无效，请返回题目页重新提交。");
    }
    const answer = String(form.get("answer") || "").trim().slice(0, 1000);
    if (!answer) return errorPage(400, "答案不能为空", "请选择或填写答案。");
    let acceptable = [context.correct_answer];
    if (context.acceptable_answers_json) {
      try { acceptable = acceptable.concat(JSON.parse(context.acceptable_answers_json)); } catch { /* keep */ }
    }
    const isCorrect = acceptable.some((item) => normalizeAnswer(item) === normalizeAnswer(answer));
    const attemptId = crypto.randomUUID();
    const statDate = kunmingDateKey();
    const statements = [
      env.DB.prepare(`
        INSERT OR IGNORE INTO attempts
          (id, user_id, session_id, question_id, session_item_id, answer, is_correct, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).bind(attemptId, user.id, practiceId, context.question_id, context.item_id, answer, isCorrect ? 1 : 0),
      env.DB.prepare(`
        UPDATE practice_session_items SET answered_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ? AND answered_at IS NULL
      `).bind(context.item_id),
      env.DB.prepare(`
        INSERT INTO mastery_records
          (id, user_id, content_type, content_id, mastery_status, consecutive_correct, last_practiced_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
        ON CONFLICT(user_id, content_type, content_id) DO UPDATE SET
          consecutive_correct = CASE WHEN ? = 1 THEN mastery_records.consecutive_correct + 1 ELSE 0 END,
          mastery_status = CASE
            WHEN ? = 0 THEN 'learning'
            WHEN mastery_records.consecutive_correct + 1 >= 3 THEN 'temporary_mastered'
            ELSE 'learning'
          END,
          last_practiced_at = datetime('now'), updated_at = datetime('now')
      `).bind(
        crypto.randomUUID(), user.id, context.content_type, context.content_id || context.question_id,
        isCorrect ? "learning" : "learning", isCorrect ? 1 : 0, isCorrect ? 1 : 0, isCorrect ? 1 : 0,
      ),
      env.DB.prepare(`
        INSERT INTO daily_user_stats
          (id, user_id, stat_date, attempts_count, correct_count, reading_pages, created_at, updated_at)
        VALUES (?, ?, ?, 1, ?, 0, datetime('now'), datetime('now'))
        ON CONFLICT(user_id, stat_date) DO UPDATE SET
          attempts_count = daily_user_stats.attempts_count + 1,
          correct_count = daily_user_stats.correct_count + ?,
          updated_at = datetime('now')
      `).bind(crypto.randomUUID(), user.id, statDate, isCorrect ? 1 : 0, isCorrect ? 1 : 0),
      env.DB.prepare(`
        UPDATE practice_sessions SET current_number = ?, updated_at = datetime('now') WHERE id = ?
      `).bind(Math.min(Number(context.total_items), number + 1), practiceId),
    ];
    if (!isCorrect) {
      statements.push(env.DB.prepare(`
        INSERT INTO mistakes
          (id, user_id, content_id, question_id, question_type, wrong_answer, correct_answer,
           first_wrong_at, last_wrong_at, error_count, consecutive_correct, mastery_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), 1, 0, 'learning', datetime('now'), datetime('now'))
        ON CONFLICT(user_id, content_id, question_type) DO UPDATE SET
          question_id = excluded.question_id, wrong_answer = excluded.wrong_answer,
          correct_answer = excluded.correct_answer, last_wrong_at = datetime('now'),
          error_count = mistakes.error_count + 1, consecutive_correct = 0,
          mastery_status = 'learning', updated_at = datetime('now')
      `).bind(
        crypto.randomUUID(), user.id, context.content_id || context.question_id, context.question_id,
        context.question_type, answer, context.correct_answer,
      ));
    } else {
      statements.push(env.DB.prepare(`
        UPDATE mistakes SET
          consecutive_correct = consecutive_correct + 1,
          mastery_status = CASE WHEN consecutive_correct + 1 >= 3 THEN 'temporary_mastered' ELSE mastery_status END,
          updated_at = datetime('now')
        WHERE user_id = ? AND content_id = ? AND question_type = ?
      `).bind(user.id, context.content_id || context.question_id, context.question_type));
    }
    if (number >= Number(context.total_items)) {
      statements.push(env.DB.prepare(`
        UPDATE practice_sessions SET status = 'completed', completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?
      `).bind(practiceId));
    }
    await env.DB.batch(statements);
    return redirect(`/k/practice/${encodeURIComponent(practiceId)}/${number}/result`);
  }
  let options = null;
  try { options = context.options_json ? JSON.parse(context.options_json) : null; } catch { options = null; }
  if (!KINDLE_SAFE_QUESTION_TYPES.includes(context.question_type) || !Array.isArray(options) || !options.length) {
    return errorPage(409, "题型已停用", "该题需要输入法或缺少可选答案，已禁止在 Kindle 上作答。请重新开始练习。", '<a href="/k/words">返回单词模块</a>');
  }
  const secret = env.SESSION_SECRET;
  if (!secret) return errorPage(500, "系统设置未完成", "练习提交密钥尚未配置。");
  const submissionToken = await hmac(secret, `practice:${context.item_id}`);
  const input = `<fieldset><legend>请选择答案</legend>${options.map((option, index) => `<label class="radio-line"><input type="radio" name="answer" value="${escapeHtml(option)}" ${index === 0 ? "required" : ""}> ${String.fromCharCode(65 + index)}. ${escapeHtml(option)}</label>`).join("")}</fieldset>`;
  return htmlResponse(layout({
    title: `第 ${number} 题`,
    brand: false,
    pageClass: "study-screen",
    body: `<div class="current-user">${escapeHtml(user.display_name)}　·　第 ${number} / ${Number(context.total_items)} 题</div>
      <h1>${escapeHtml(context.prompt)}</h1>
      <form method="post" action="/k/practice/${escapeHtml(practiceId)}/${number}">
        <input type="hidden" name="csrf_token" value="${escapeHtml(session.csrf_token)}">
        <input type="hidden" name="submission_token" value="${escapeHtml(submissionToken)}">
        ${input}
        <input type="submit" value="提交答案">
      </form>`,
    nav: '<a href="/k/words">退出练习</a> | <a href="/k/home">个人主页</a>',
  }));
}

async function practiceResult(env, user, session, practiceId, number) {
  const context = await getPracticeContext(env, user, session, practiceId, number);
  if (!context) return errorPage(404, "答题结果不存在", "练习会话或题号不存在。", '<a href="/k/words">返回单词</a>');
  const attempt = await env.DB.prepare(`
    SELECT answer, is_correct FROM attempts WHERE session_item_id = ? AND user_id = ? LIMIT 1
  `).bind(context.item_id, user.id).first();
  if (!attempt) return redirect(`/k/practice/${encodeURIComponent(practiceId)}/${number}`);
  const final = number >= Number(context.total_items);
  return htmlResponse(layout({
    title: attempt.is_correct ? "回答正确" : "回答错误",
    brand: false,
    pageClass: "study-screen",
    body: `<div class="current-user">${escapeHtml(user.display_name)}　·　第 ${number} / ${Number(context.total_items)} 题</div>
      <h1>${attempt.is_correct ? "✓ 回答正确" : "✗ 回答错误"}</h1>
      <p>你的答案：${escapeHtml(attempt.answer)}</p>
      ${attempt.is_correct ? "" : `<p>正确答案：<strong>${escapeHtml(context.correct_answer)}</strong></p>`}
      <div class="card"><h2>解析</h2><p>${escapeHtml(context.explanation || "请记住正确表达。")}</p></div>
      ${final ? '<a class="button" href="/k/records">查看本次学习记录</a>' : `<a class="button" href="/k/practice/${escapeHtml(practiceId)}/${number + 1}">下一题</a>`}`,
    nav: '<a href="/k/words">单词主页</a> | <a href="/k/home">个人主页</a>',
  }));
}

async function kindleMistakes(env, user) {
  const result = await env.DB.prepare(`
    SELECT m.question_type, m.wrong_answer, m.correct_answer, m.error_count, m.consecutive_correct,
      m.mastery_status, m.last_wrong_at, q.prompt
    FROM mistakes m LEFT JOIN questions q ON q.id = m.question_id
    WHERE m.user_id = ?
    ORDER BY CASE WHEN m.mastery_status = 'temporary_mastered' THEN 1 ELSE 0 END,
      m.last_wrong_at DESC, m.error_count DESC
    LIMIT 100
  `).bind(user.id).all();
  const rows = (result.results || []).map((item) => `<tr>
    <td>${escapeHtml(item.prompt || item.question_type)}</td>
    <td>${escapeHtml(item.wrong_answer || "—")}</td>
    <td>${escapeHtml(item.correct_answer || "—")}</td>
    <td>${Number(item.error_count)}</td>
    <td>${escapeHtml(item.mastery_status)}</td>
  </tr>`).join("");
  return htmlResponse(layout({
    title: "错题本",
    body: `<div class="current-user">当前使用者：${escapeHtml(user.display_name)}</div><h1>错题本</h1>
      <table><thead><tr><th>题目</th><th>错误答案</th><th>正确答案</th><th>错误次数</th><th>状态</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5">暂无错题。</td></tr>'}</tbody></table>`,
    nav: '<a href="/k/words">单词</a> | <a href="/k/home">个人主页</a>',
  }));
}

async function kindleRecords(env, user) {
  const summary = await env.DB.prepare(`
    SELECT
      COUNT(*) AS total,
      COALESCE(SUM(is_correct), 0) AS correct,
      SUM(CASE WHEN date(created_at, '+8 hours') = date('now', '+8 hours') THEN 1 ELSE 0 END) AS today,
      MAX(created_at) AS latest
    FROM attempts WHERE user_id = ?
  `).bind(user.id).first();
  const recent = await env.DB.prepare(`
    SELECT ps.id, ps.started_at, ps.completed_at, ps.status, COUNT(a.id) AS attempts,
      COALESCE(SUM(a.is_correct), 0) AS correct
    FROM practice_sessions ps
    LEFT JOIN attempts a ON a.session_id = ps.id
    WHERE ps.user_id = ?
    GROUP BY ps.id
    ORDER BY ps.started_at DESC LIMIT 20
  `).bind(user.id).all();
  const dateRows = await env.DB.prepare(`
    SELECT stat_date FROM daily_user_stats
    WHERE user_id = ? AND attempts_count > 0
    ORDER BY stat_date DESC LIMIT 366
  `).bind(user.id).all();
  const latestReading = await env.DB.prepare(`
    SELECT b.title, c.title AS chapter_title, rp.page, rp.last_read_at
    FROM reading_progress rp JOIN books b ON b.id = rp.book_id
    LEFT JOIN chapters c ON c.id = rp.chapter_id
    WHERE rp.user_id = ? ORDER BY rp.last_read_at DESC LIMIT 1
  `).bind(user.id).first();
  const rows = (recent.results || []).map((item) => `<tr><td>${escapeHtml(item.started_at)}</td><td>${Number(item.attempts)}</td><td>${Number(item.attempts) ? Math.round(Number(item.correct) / Number(item.attempts) * 100) : 0}%</td><td>${escapeHtml(item.status)}</td></tr>`).join("");
  const total = Number(summary?.total || 0);
  return htmlResponse(layout({
    title: "学习记录",
    body: `<div class="current-user">当前使用者：${escapeHtml(user.display_name)}</div><h1>学习记录</h1>
      <section class="card"><p>今日完成：${Number(summary?.today || 0)} 题<br>
      累计完成：${total} 题<br>
      累计正确率：${total ? Math.round(Number(summary.correct || 0) / total * 100) : 0}%<br>
      连续学习：${learningStreak(dateRows.results || [])} 天<br>
      待复习错题：${Number((await env.DB.prepare(`SELECT COUNT(*) AS count FROM mistakes WHERE user_id = ? AND mastery_status != 'temporary_mastered'`).bind(user.id).first())?.count || 0)}<br>
      最近学习：${escapeHtml(summary?.latest || "尚未开始")}<br>
      最近阅读：${latestReading ? `${escapeHtml(latestReading.title)} · ${escapeHtml(latestReading.chapter_title || "正文")} · 第 ${Number(latestReading.page)} 页` : "尚无记录"}</p></section>
      <table><thead><tr><th>开始时间</th><th>题数</th><th>正确率</th><th>状态</th></tr></thead><tbody>${rows || '<tr><td colspan="4">暂无记录。</td></tr>'}</tbody></table>`,
    nav: '<a href="/k/mistakes">错题本</a> | <a href="/k/words">单词</a> | <a href="/k/home">个人主页</a>',
  }));
}

async function routeAdmin(request, env, url) {
  if (url.pathname === "/admin/login" && ["GET", "POST"].includes(request.method)) return adminLogin(request, env, url);
  if (url.pathname === "/admin/logout" && request.method === "GET") return adminLogout();
  const admin = await requireAdmin(request, env);
  if (admin.response) return admin.response;
  const path = url.pathname;
  if (path === "/admin" && request.method === "GET") return adminDashboard(request, env, admin.identity);
  if (path === "/admin/reviews" && ["GET", "POST"].includes(request.method)) return adminReviews(request, env, admin.identity, url);
  if (path === "/admin/assessments" && ["GET", "POST"].includes(request.method)) return adminAssessments(request, env, admin.identity, url);
  if (path === "/admin/users" && request.method === "GET") return adminUsers(env, admin.identity, url);
  const userActionMatch = path.match(/^\/admin\/users\/([^/]+)\/(clear|delete)$/u);
  if (userActionMatch && request.method === "GET") return adminUserConfirm(request, env, admin.identity, decodeURIComponent(userActionMatch[1]), userActionMatch[2]);
  if (userActionMatch && request.method === "POST") return adminUserDestructive(request, env, decodeURIComponent(userActionMatch[1]), userActionMatch[2]);
  const userExportMatch = path.match(/^\/admin\/users\/([^/]+)\/export$/u);
  if (userExportMatch && request.method === "GET") return adminUserExport(env, decodeURIComponent(userExportMatch[1]));
  const userMatch = path.match(/^\/admin\/users\/([^/]+)$/u);
  if (userMatch && request.method === "GET") return adminUserDetail(request, env, admin.identity, url, decodeURIComponent(userMatch[1]));
  if (userMatch && request.method === "POST") return adminUpdateUser(request, env, decodeURIComponent(userMatch[1]));
  if (path === "/admin/books" && request.method === "GET") return adminBooks(env, admin.identity, url);
  if (path === "/admin/books/new" && ["GET", "POST"].includes(request.method)) return adminNewBook(request, env, admin.identity);
  if (path === "/admin/books/sample" && request.method === "POST") return createSampleBook(request, env);
  const bookSubpageMatch = path.match(/^\/admin\/books\/([^/]+)\/(edit|chapters)$/u);
  if (bookSubpageMatch && request.method === "GET") return redirect(`/admin/books/${encodeURIComponent(decodeURIComponent(bookSubpageMatch[1]))}`);
  const bookDeleteMatch = path.match(/^\/admin\/books\/([^/]+)\/delete$/u);
  if (bookDeleteMatch && ["GET", "POST"].includes(request.method)) return adminBookDelete(request, env, admin.identity, decodeURIComponent(bookDeleteMatch[1]));
  const bookMatch = path.match(/^\/admin\/books\/([^/]+)$/u);
  if (bookMatch && ["GET", "POST"].includes(request.method)) return adminBookDetail(request, env, admin.identity, url, decodeURIComponent(bookMatch[1]));
  const chapterMatch = path.match(/^\/admin\/chapters\/([^/]+)\/edit$/u);
  if (chapterMatch && ["GET", "POST"].includes(request.method)) return adminChapterEdit(request, env, admin.identity, decodeURIComponent(chapterMatch[1]));
  if (path === "/admin/devices" && request.method === "GET") return adminDevices(request, env, admin.identity, url);
  if (path === "/admin/devices/create" && request.method === "POST") return adminCreateDevice(request, env);
  if (path === "/admin/devices/reveal" && request.method === "GET") return adminRevealDevice(env, admin.identity, url);
  if (path === "/admin/devices/revoke" && request.method === "POST") return adminRevokeDevice(request, env);
  if (path === "/admin/plans" && ["GET", "POST"].includes(request.method)) return adminPlans(request, env, admin.identity, url);
  if (path === "/admin/reports" && request.method === "GET") return adminReports(env, admin.identity, url);
  if (path === "/admin/access" && request.method === "GET") return adminAccessStats(env, admin.identity);
  if ((path === "/admin/attempts" || path === "/admin/mistakes") && request.method === "GET") return adminReports(env, admin.identity, url);
  if (path === "/admin/vocabulary" && request.method === "GET") return adminKnowledgeList(env, admin.identity, url, "vocabulary");
  const vocabularyMatch = path.match(/^\/admin\/vocabulary\/([^/]+)$/u);
  if (vocabularyMatch && ["GET", "POST"].includes(request.method)) return adminVocabularyDetail(request, env, admin.identity, url, decodeURIComponent(vocabularyMatch[1]));
  if (path === "/admin/phrases" && request.method === "GET") return adminKnowledgeList(env, admin.identity, url, "phrases");
  if (path === "/admin/grammar" && request.method === "GET") return adminKnowledgeList(env, admin.identity, url, "grammar");
  if (path === "/admin/questions" && request.method === "GET") return adminKnowledgeList(env, admin.identity, url, "questions");
  if (path === "/admin/imports" && ["GET", "POST"].includes(request.method)) return adminImports(request, env, admin.identity, url);
  const importErrorsMatch = path.match(/^\/admin\/imports\/([^/]+)\/errors\.csv$/u);
  if (importErrorsMatch && request.method === "GET") return adminImportErrors(env, decodeURIComponent(importErrorsMatch[1]));
  const importConfirmMatch = path.match(/^\/admin\/imports\/([^/]+)\/confirm$/u);
  if (importConfirmMatch && request.method === "POST") return adminImportConfirm(request, env, decodeURIComponent(importConfirmMatch[1]));
  const importMatch = path.match(/^\/admin\/imports\/([^/]+)$/u);
  if (importMatch && request.method === "GET") return adminImportDetail(env, admin.identity, decodeURIComponent(importMatch[1]));
  if (path === "/admin/backup" && request.method === "GET") return adminBackup(env);
  if (path === "/admin/settings" && request.method === "GET") return redirect("/admin/weather");
  if (path === "/admin/backup/attempts.csv" && request.method === "GET") return adminBackupAttempts(env);
  if (path === "/admin/backup/catalog.json" && request.method === "GET") return adminBackupCatalog(env);
  if (path === "/admin/weather" && request.method === "GET") return adminWeather(request, env, admin.identity, url);
  if (path === "/admin/weather" && request.method === "POST") return adminWeatherPost(request, env);
  if (path === "/admin/weather/action" && request.method === "POST") return adminWeatherAction(request, env);
  return errorPage(404, "管理页面不存在", "该管理页面尚未建立。", '<a href="/admin">返回后台总览</a>');
}

async function routeKindle(request, env, url) {
  if (url.pathname === "/k/setup" && request.method === "GET") return setupDevice(request, env, url);
  const session = await getDeviceSession(request, env);
  if (url.pathname === "/k/login" && ["GET", "POST"].includes(request.method)) return accountLogin(request, env, url, session);
  if (url.pathname === "/k/register" && ["GET", "POST"].includes(request.method)) return accountRegister(request, env, url, session);
  if (url.pathname === "/k/logout" && request.method === "GET") return accountLogout(request, env);
  const account = await getAccountIdentity(request, env);
  if (url.pathname === "/k" && request.method === "GET") {
    return account ? redirect("/k/home") : accountEntryPage(env, url);
  }
  if (!account || !account.user_id || account.user_status !== "active") {
    return redirect(`/k/login?return_to=${encodeURIComponent(url.pathname)}`);
  }
  const user = {
    id: account.user_id,
    household_id: account.household_id,
    display_name: account.display_name || account.username,
    status: account.user_status,
  };
  // Registered accounts are the source of identity. A device session remains
  // useful for old installations, but direct Kindle access must never be
  // blocked merely because the browser dropped the optional device cookie.
  const accountSession = { ...(session || {}), csrf_token: account.csrf_token };

  if (url.pathname === "/k/home" && request.method === "GET") return homePage(env, url, accountSession, user, account);
  if (url.pathname === "/k/me" && request.method === "GET") return myPage(env, user, account);
  if (url.pathname === "/k/today" && request.method === "GET") return todayPage(env, user, account);
  if (url.pathname === "/k/weather" && ["GET", "POST"].includes(request.method)) return weatherSettingsPage(request, env, accountSession, user, url);
  if (account.role === "parent" && (
    url.pathname.startsWith("/k/words") ||
    url.pathname === "/k/mistakes" ||
    url.pathname === "/k/records" ||
    url.pathname === "/k/practice/start" ||
    url.pathname.startsWith("/k/practice/")
  )) return redirect("/parent");
  if (url.pathname === "/k/books" && request.method === "GET") return kindleBooks(request, env, user, accountSession, account, url);
  if (url.pathname === "/k/books/favorite" && request.method === "POST") return kindleBookFavorite(request, env, user, accountSession);
  const coverMatch = url.pathname.match(/^\/k\/cover\/([^/]+)$/u);
  if (coverMatch && request.method === "GET") return kindleCover(env, decodeURIComponent(coverMatch[1]));
  const bookMatch = url.pathname.match(/^\/k\/book\/([^/]+)$/u);
  if (bookMatch && request.method === "GET") return kindleBookDetail(env, user, account, decodeURIComponent(bookMatch[1]));
  const readMatch = url.pathname.match(/^\/k\/read\/([^/]+)\/([^/]+)\/([0-9]+)$/u);
  if (readMatch && request.method === "GET") return kindleRead(request, env, user, accountSession, account, decodeURIComponent(readMatch[1]), decodeURIComponent(readMatch[2]), Math.max(1, Number.parseInt(readMatch[3], 10)));
  if (url.pathname.startsWith("/k/words")) await touchAccountActivity(env, account.account_id);
  if (url.pathname === "/k/words" && request.method === "GET") return kindleWordsV2Home(env, user, accountSession, url);
  if (url.pathname === "/k/words/setup" && ["GET", "POST"].includes(request.method)) return kindleWordsSetup(request, env, user, accountSession);
  if (url.pathname === "/k/words/progress" && request.method === "GET") return kindleWordsProgress(env, user);
  if (url.pathname === "/k/words/legacy" && request.method === "GET") return kindleWordsLegacy(env, user, accountSession);
  if (url.pathname === "/k/words/session/start" && request.method === "POST") return startWordsSession(request, env, user, accountSession);
  const wordsSessionMatch = url.pathname.match(/^\/k\/words\/session\/([^/]+)\/([0-9]+)$/u);
  if (wordsSessionMatch && ["GET", "POST"].includes(request.method)) {
    return wordsSessionCard(request, env, user, accountSession, decodeURIComponent(wordsSessionMatch[1]), Math.max(1, Number.parseInt(wordsSessionMatch[2], 10)));
  }
  const wordsResultMatch = url.pathname.match(/^\/k\/words\/session\/([^/]+)\/([0-9]+)\/result$/u);
  if (wordsResultMatch && request.method === "GET") {
    return wordsSessionResult(env, user, decodeURIComponent(wordsResultMatch[1]), Math.max(1, Number.parseInt(wordsResultMatch[2], 10)));
  }
  if (url.pathname === "/k/practice/start" && request.method === "POST") return startPractice(request, env, user, accountSession, account);
  const practiceMatch = url.pathname.match(/^\/k\/practice\/([^/]+)\/([0-9]+)$/u);
  if (practiceMatch && ["GET", "POST"].includes(request.method)) {
    return practiceQuestion(request, env, user, accountSession, decodeURIComponent(practiceMatch[1]), Math.max(1, Number.parseInt(practiceMatch[2], 10)));
  }
  const practiceResultMatch = url.pathname.match(/^\/k\/practice\/([^/]+)\/([0-9]+)\/result$/u);
  if (practiceResultMatch && request.method === "GET") {
    return practiceResult(env, user, accountSession, decodeURIComponent(practiceResultMatch[1]), Math.max(1, Number.parseInt(practiceResultMatch[2], 10)));
  }
  if (url.pathname === "/k/mistakes" && request.method === "GET") return kindleMistakes(env, user);
  if (url.pathname === "/k/records" && request.method === "GET") return kindleRecords(env, user);
  if (url.pathname === "/k/settings" && ["GET", "POST"].includes(request.method)) return settingsPage(request, env, accountSession, user);
  return errorPage(404, "页面不存在", "请求的 Kindle 页面不存在。", '<a href="/k/home">个人主页</a>');
}

function accessClientType(userAgent) {
  const value = String(userAgent || "").toLocaleLowerCase("en-US");
  if (value.includes("kindle") || value.includes("silk/")) return "Kindle";
  if (value.includes("ipad") || value.includes("tablet")) return "平板";
  if (value.includes("mobile") || value.includes("android") || value.includes("iphone")) return "手机";
  if (!value) return "未知设备";
  return "电脑浏览器";
}

function accessSource(request, url) {
  const raw = String(request.headers.get("referer") || "").trim();
  if (!raw) return "直接访问";
  try {
    const referrer = new URL(raw);
    if (referrer.host === url.host) return `站内：${referrer.pathname}`.slice(0, 240);
    return referrer.hostname.slice(0, 240) || "外部来源";
  } catch {
    return "未知来源";
  }
}

function shouldRecordAccess(request, response, url) {
  if (request.method !== "GET" || response.status >= 500) return false;
  if (!(url.pathname === "/" || url.pathname === "/k" || url.pathname.startsWith("/k/") || url.pathname === "/parent" || url.pathname.startsWith("/parent/"))) return false;
  if (url.pathname.startsWith("/k/cover/")) return false;
  return String(response.headers.get("content-type") || "").includes("text/html");
}

async function recordAccessEvent(request, env, url) {
  let account = null;
  const rawAccountToken = parseCookies(request)[COOKIE_ACCOUNT];
  if (rawAccountToken) {
    const tokenHash = await sha256(rawAccountToken);
    account = await env.DB.prepare(`
      SELECT a.id AS account_id, a.user_id
      FROM account_sessions s JOIN accounts a ON a.id = s.account_id
      WHERE s.session_token_hash = ? AND s.expires_at > datetime('now')
      LIMIT 1
    `).bind(tokenHash).first();
  }
  const userAgent = String(request.headers.get("user-agent") || "").slice(0, 300) || null;
  await env.DB.prepare(`
    INSERT INTO access_events
      (id, account_id, user_id, path, source, client_type, user_agent, country, visited_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).bind(
    crypto.randomUUID(), account?.account_id || null, account?.user_id || null,
    url.pathname.slice(0, 240), accessSource(request, url), accessClientType(userAgent),
    userAgent, String(request.cf?.country || "").slice(0, 8) || null,
  ).run();
}

async function recordRequestFailure(request, env, error) {
  const url = new URL(request.url);
  await env.DB.prepare(`
    INSERT INTO audit_logs
      (id, actor_type, actor_identifier, action, entity_type, entity_id, details_json, created_at, updated_at)
    VALUES (?, 'system', NULL, 'request_failed', 'route', ?, ?, datetime('now'), datetime('now'))
  `).bind(
    crypto.randomUUID(),
    url.pathname.slice(0, 240),
    JSON.stringify({
      name: String(error?.name || "Error").slice(0, 80),
      message: String(error?.message || "").slice(0, 240),
    }),
  ).run();
}

async function handleRequest(request, env) {
  if (!env.DB) return errorPage(503, "数据库尚未连接", "本地数据库尚未准备完成，请稍后重试。");
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === "/") return redirect("/k");
  if (path === "/health") return new Response("ok", { headers: { "cache-control": "no-store" } });
  if (path === "/device-test" && request.method === "GET") return deviceTest(request, env, url);
  if (path === "/device-test/post" && request.method === "POST") return deviceTestPost(request);
  if (path === "/device-test/cookie" && request.method === "GET") {
    return redirect("/device-test?cookie_check=1", {
      "set-cookie": `${COOKIE_TEST}=works; Path=/device-test; Max-Age=3600; SameSite=Lax`,
    });
  }
  if (path === "/device-test/meta" && request.method === "GET") return deviceTestMeta();
  if (path.startsWith("/admin")) return routeAdmin(request, env, url);
  if (path === "/parent" || path.startsWith("/parent/")) return routeParent(request, env, url);
  if (path === "/k" || path.startsWith("/k/")) return routeKindle(request, env, url);
  return errorPage(404, "页面不存在", "你访问的页面不存在。");
}

export default {
  async fetch(request, env, ctx) {
    try {
      const response = await handleRequest(request, env);
      const url = new URL(request.url);
      if (shouldRecordAccess(request, response, url)) {
        ctx.waitUntil(recordAccessEvent(request, env, url).catch((error) => {
          console.error("access_event_failed", {
            path: url.pathname,
            name: String(error?.name || "Error").slice(0, 80),
            message: String(error?.message || "").slice(0, 200),
          });
        }));
      }
      return response;
    } catch (error) {
      const path = new URL(request.url).pathname;
      console.error("request_failed", {
        path,
        name: String(error?.name || "Error").slice(0, 80),
        message: String(error?.message || "").slice(0, 240),
      });
      ctx.waitUntil(recordRequestFailure(request, env, error).catch((auditError) => {
        console.error("request_failure_audit_failed", {
          path,
          name: String(auditError?.name || "Error").slice(0, 80),
          message: String(auditError?.message || "").slice(0, 200),
        });
      }));
      return errorPage(500, "系统错误", "系统暂时无法完成请求，请稍后重试。");
    }
  },
};

const COOKIE_DEVICE = "modu_device_session";
const COOKIE_TEST = "modu_cookie_test";
const COOKIE_TEST_CSRF = "modu_test_csrf";
const SESSION_MAX_AGE = 60 * 60 * 24 * 180;
const NO_STORE = {
  "cache-control": "private, no-store, max-age=0",
  "content-type": "text/html; charset=utf-8",
  "referrer-policy": "same-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
};

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

function baseStyles() {
  return `
    html { background: #fff; color: #000; font-family: Arial, "Microsoft YaHei", sans-serif; }
    body { margin: 0; background: #fff; color: #000; font-size: 23px; line-height: 1.55; }
    main { box-sizing: border-box; width: 100%; max-width: 720px; margin: 0 auto; padding: 22px 18px 36px; }
    h1 { margin: 0 0 22px; font-size: 32px; line-height: 1.25; }
    h2 { margin: 28px 0 14px; font-size: 28px; line-height: 1.3; }
    h3 { margin: 24px 0 10px; font-size: 24px; }
    p { margin: 12px 0; }
    a { color: #000; text-decoration: underline; text-underline-offset: 3px; }
    .brand { border-bottom: 4px solid #000; margin-bottom: 20px; padding-bottom: 12px; }
    .brand strong { display: block; font-size: 27px; letter-spacing: .05em; }
    .muted { color: #444; font-size: 19px; }
    .notice { border: 3px solid #000; margin: 18px 0; padding: 12px 14px; font-weight: bold; }
    .warning { border: 3px double #000; margin: 18px 0; padding: 12px 14px; }
    .card { border: 3px solid #000; margin: 16px 0; padding: 16px; background: #fff; }
    .button, button, input[type="submit"] {
      box-sizing: border-box; display: block; width: 100%; min-height: 72px; margin: 14px 0;
      border: 4px solid #000; border-radius: 0; background: #fff; color: #000;
      font: bold 24px/1.25 Arial, "Microsoft YaHei", sans-serif; text-align: center;
      text-decoration: none; padding: 18px 12px; cursor: pointer;
    }
    button:active, input[type="submit"]:active, .button:active { color: #fff; background: #000; }
    input[type="text"], input[type="password"], input[type="number"], textarea, select {
      box-sizing: border-box; width: 100%; min-height: 58px; border: 3px solid #000;
      border-radius: 0; background: #fff; color: #000; font: 23px/1.4 Arial, "Microsoft YaHei", sans-serif;
      padding: 10px 12px;
    }
    label { display: block; margin-top: 16px; font-weight: bold; }
    fieldset { border: 3px solid #000; margin: 18px 0; padding: 12px; }
    legend { padding: 0 8px; font-weight: bold; }
    .radio-line { display: block; min-height: 48px; padding: 10px 2px; font-weight: normal; }
    input[type="radio"], input[type="checkbox"] { width: 28px; height: 28px; vertical-align: middle; }
    nav { border-top: 3px solid #000; margin-top: 30px; padding-top: 18px; line-height: 2; }
    table { width: 100%; border-collapse: collapse; font-size: 19px; }
    th, td { border: 2px solid #000; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #eee; }
    .line-thin { border-top: 1px solid #000; margin: 14px 0; }
    .line-thick { border-top: 5px solid #000; margin: 14px 0; }
    .gray-1 { background: #eee; padding: 8px; }
    .gray-2 { background: #bbb; padding: 8px; }
    .gray-3 { background: #777; color: #fff; padding: 8px; }
    .current-user { border: 2px solid #000; margin: 12px 0; padding: 7px 10px; font-weight: bold; }
    .compact-form { margin: 0; }
    .compact-form button { min-height: 58px; margin: 8px 0; font-size: 21px; padding: 12px; }
    .admin main { max-width: 1000px; font-size: 18px; }
    .admin .button, .admin button, .admin input[type="submit"] { min-height: 54px; font-size: 19px; padding: 12px; }
    .admin input[type="text"], .admin textarea, .admin select { min-height: 48px; font-size: 18px; }
    .admin-nav { border: 3px solid #000; padding: 10px 14px; line-height: 2.1; }
    code { font-family: "Courier New", monospace; font-size: .9em; overflow-wrap: anywhere; }
    @media (max-width: 480px) {
      body { font-size: 22px; }
      main { padding: 18px 13px 30px; }
      h1 { font-size: 30px; }
      .admin table { font-size: 16px; }
    }
  `;
}

function layout({ title, body, nav = "", refresh = false, admin = false, extraHead = "", script = "" }) {
  const metaRefresh = refresh ? '<meta http-equiv="refresh" content="300">' : "";
  return `<!doctype html>
<html lang="zh-CN" class="${admin ? "admin" : "kindle"}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${metaRefresh}
  <title>${escapeHtml(title)} · 墨读</title>
  <style>${baseStyles()}</style>
  ${extraHead}
</head>
<body>
<main>
  <header class="brand"><strong>墨读</strong><span class="muted">Kindle 家庭阅读与英语学习站</span></header>
  ${body}
  ${nav ? `<nav>${nav}</nav>` : ""}
</main>
${script}
</body>
</html>`;
}

function htmlResponse(page, status = 200, headers = {}) {
  return new Response(page, { status, headers: { ...NO_STORE, ...headers } });
}

function errorPage(status, title, message, nav = '<a href="/k">返回使用者选择页</a>') {
  return htmlResponse(layout({
    title,
    body: `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><p><a href="">重试</a></p>`,
    nav,
  }), status);
}

function adminNavigation() {
  return `<div class="admin-nav">
    <a href="/admin">总览</a> |
    <a href="/admin/users">使用者</a> |
    <a href="/admin/devices">设备</a> |
    <a href="/admin/weather">天气</a> |
    <a href="/device-test">设备测试</a>
  </div>`;
}

async function adminIdentity(request, env) {
  const email = (request.headers.get("oai-authenticated-user-email") || "").trim().toLowerCase();
  if (!email) return null;
  const allowlist = String(env.ADMIN_EMAILS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (allowlist.length && !allowlist.includes(email)) return null;
  return { email };
}

async function adminCsrf(identity, env) {
  const secret = env.CSRF_SECRET || env.SESSION_SECRET;
  if (!secret) return null;
  return hmac(secret, `admin:${identity.email}`);
}

async function requireAdmin(request, env) {
  const identity = await adminIdentity(request, env);
  if (!identity) {
    return {
      response: redirect(`/signin-with-chatgpt?return_to=${encodeURIComponent(new URL(request.url).pathname)}`),
    };
  }
  return { identity };
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

async function getCurrentUser(session, env) {
  if (!session?.current_user_id) return null;
  return env.DB.prepare(`
    SELECT id, household_id, display_name, status
    FROM users
    WHERE id = ? AND household_id = ? AND status = 'active'
    LIMIT 1
  `).bind(session.current_user_id, session.household_id).first();
}

function deviceCookie(token) {
  return `${COOKIE_DEVICE}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
}

function noticeText(code, name = "") {
  const messages = {
    created: `已创建使用者：${name}`,
    selected: `已切换到：${name}`,
    switched: "已退出当前使用者，请重新选择。",
    weather_saved: "备用天气已保存。",
    device_revoked: "设备令牌已撤销。",
  };
  return messages[code] || "";
}

async function weatherBlock(env) {
  const row = await env.DB.prepare(`
    SELECT value, updated_at FROM settings WHERE key = 'manual_weather' LIMIT 1
  `).first();
  let weather = {
    condition: "多云",
    current: "22",
    high: "25",
    low: "17",
    rain: "降雨概率 30%",
    updated: "模拟数据",
  };
  if (row?.value) {
    try {
      weather = { ...weather, ...JSON.parse(row.value), updated: row.updated_at || "手动录入" };
    } catch {
      // Keep safe fallback.
    }
  }
  return `<section aria-label="昆明时间和天气">
    <p><strong>${escapeHtml(kunmingNow())}</strong></p>
    <p>昆明　${escapeHtml(weather.condition)}　${escapeHtml(weather.current)}℃<br>
    最高 ${escapeHtml(weather.high)}℃ / 最低 ${escapeHtml(weather.low)}℃<br>
    ${escapeHtml(weather.rain)}</p>
    <p class="muted">天气更新时间：${escapeHtml(weather.updated)}</p>
  </section>`;
}

function deviceRequiredPage() {
  return htmlResponse(layout({
    title: "设备尚未初始化",
    body: `<h1>设备尚未初始化</h1>
      <p>请先在家长后台创建设备令牌，再在这台 Kindle 上打开设备专用地址。</p>
      <p><a class="button" href="/device-test">打开设备兼容性测试</a></p>
      <p class="muted">设备令牌只用于识别 Kindle，不会赋予管理权限。</p>`,
    nav: '<a href="/admin/devices">家长设备管理</a>',
  }));
}

async function createAutomaticDeviceSession(request, env, url) {
  if (url.searchParams.get("session_check") === "1") {
    return errorPage(
      409,
      "需要启用 Cookie",
      "浏览器没有保存设备会话。请在 Kindle 浏览器设置中允许 Cookie，然后重试。",
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
  return redirect("/k?session_check=1", { "set-cookie": deviceCookie(sessionToken) });
}

async function setupDevice(request, env, url) {
  const token = (url.searchParams.get("token") || "").trim();
  if (!token) {
    return htmlResponse(layout({
      title: "初始化 Kindle 设备",
      body: `<h1>初始化 Kindle 设备</h1>
        <p>请粘贴家长后台生成的设备令牌。</p>
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

async function usersPage(request, env, url, session) {
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const pageSize = 6;
  const offset = (page - 1) * pageSize;
  const result = await env.DB.prepare(`
    SELECT id, display_name
    FROM users
    WHERE household_id = ? AND status = 'active'
    ORDER BY display_name COLLATE NOCASE, created_at
    LIMIT ? OFFSET ?
  `).bind(session.household_id, pageSize + 1, offset).all();
  const rows = result.results || [];
  const hasNext = rows.length > pageSize;
  const weather = await weatherBlock(env);
  const notice = noticeText(url.searchParams.get("notice"), url.searchParams.get("name"));
  const userButtons = rows.slice(0, pageSize).map((user) => `
    <form method="post" action="/k/select-user">
      <input type="hidden" name="csrf_token" value="${escapeHtml(session.csrf_token)}">
      <input type="hidden" name="user_id" value="${escapeHtml(user.id)}">
      <button type="submit">${escapeHtml(user.display_name)}</button>
    </form>`).join("");
  const paging = `${page > 1 ? `<a href="/k?page=${page - 1}">上一页</a>` : ""}
    ${page > 1 && hasNext ? " | " : ""}
    ${hasNext ? `<a href="/k?page=${page + 1}">下一页</a>` : ""}`;
  return htmlResponse(layout({
    title: "请选择使用者",
    refresh: true,
    body: `${weather}
      ${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ""}
      <h1>请选择使用者</h1>
      ${userButtons || '<p>第一次使用，请在下面输入一个昵称。</p>'}
      ${paging ? `<p>${paging}</p>` : ""}
      <h2>${userButtons ? "新增使用者" : "输入昵称，开始使用"}</h2>
      <form method="post" action="/k/users/new">
        <input type="hidden" name="csrf_token" value="${escapeHtml(session.csrf_token)}">
        <label for="display_name">昵称（1 至 20 个字符）</label>
        <input id="display_name" name="display_name" type="text" maxlength="20" autocomplete="off" required>
        <input type="submit" value="进入墨读">
      </form>`,
    nav: '<a href="/device-test">设备测试</a> | <a href="/admin">家长后台</a>',
  }));
}

function normalizeUserName(raw) {
  const display = String(raw || "").trim().replace(/\s+/gu, " ");
  if (!display || [...display].length > 20) return { error: "名称长度必须为 1 至 20 个字符。" };
  if (/[\u0000-\u001f\u007f]/u.test(display)) return { error: "名称中不能包含控制字符。" };
  if (/[<>]/u.test(display) || /(?:script|javascript\s*:)/iu.test(display)) {
    return { error: "名称中不能包含 HTML 或脚本内容。" };
  }
  return { display, normalized: display.toLocaleLowerCase("en-US") };
}

async function createUser(request, env, session) {
  const form = await request.formData();
  if (!safeEqual(String(form.get("csrf_token") || ""), session.csrf_token)) {
    return errorPage(403, "CSRF 校验失败", "表单已过期，请返回使用者选择页后重试。");
  }
  const name = normalizeUserName(form.get("display_name"));
  if (name.error) return errorPage(400, "无法创建使用者", name.error);
  const id = crypto.randomUUID();
  try {
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO users
          (id, household_id, display_name, normalized_name, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'active', datetime('now'), datetime('now'))
      `).bind(id, session.household_id, name.display, name.normalized),
      env.DB.prepare(`
        INSERT INTO user_preferences
          (id, user_id, reading_font_size, created_at, updated_at)
        VALUES (?, ?, 'medium', datetime('now'), datetime('now'))
      `).bind(crypto.randomUUID(), id),
      env.DB.prepare(`
        INSERT INTO study_plans
          (id, user_id, name, daily_new_words, daily_review_words, daily_phrases, daily_grammar,
           status, created_at, updated_at)
        VALUES (?, ?, '系统默认计划', 10, 20, 5, 5, 'active', datetime('now'), datetime('now'))
      `).bind(crypto.randomUUID(), id),
      env.DB.prepare(`
        UPDATE device_sessions
        SET current_user_id = ?, updated_at = datetime('now')
        WHERE id = ? AND device_id = ?
      `).bind(id, session.id, session.device_id),
    ]);
  } catch (error) {
    if (String(error?.message || "").toLowerCase().includes("unique")) {
      return errorPage(400, "名称已存在", "同一家庭中不能创建完全相同或仅大小写不同的英文名称。");
    }
    throw error;
  }
  return redirect(`/k/home?notice=created&name=${encodeURIComponent(name.display)}`);
}

async function selectUser(request, env, session) {
  const form = await request.formData();
  if (!safeEqual(String(form.get("csrf_token") || ""), session.csrf_token)) {
    return errorPage(403, "CSRF 校验失败", "表单已过期，请返回后重新选择。");
  }
  const userId = String(form.get("user_id") || "");
  const user = await env.DB.prepare(`
    SELECT id, display_name
    FROM users
    WHERE id = ? AND household_id = ? AND status = 'active'
    LIMIT 1
  `).bind(userId, session.household_id).first();
  if (!user) return errorPage(404, "当前使用者失效", "该使用者不存在、已停用或不属于当前家庭。");
  await env.DB.prepare(`
    UPDATE device_sessions
    SET current_user_id = ?, updated_at = datetime('now')
    WHERE id = ? AND device_id = ?
  `).bind(user.id, session.id, session.device_id).run();
  return redirect(`/k/home?notice=selected&name=${encodeURIComponent(user.display_name)}`);
}

async function homePage(env, url, session, user) {
  const weather = await weatherBlock(env);
  const stats = await env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM attempts WHERE user_id = ? AND date(created_at) = date('now')) AS today_attempts,
      (SELECT COUNT(*) FROM mistakes WHERE user_id = ? AND mastery_status != 'temporary_mastered') AS pending_mistakes
  `).bind(user.id, user.id).first();
  const notice = noticeText(url.searchParams.get("notice"), url.searchParams.get("name"));
  return htmlResponse(layout({
    title: `${user.display_name}的个人主页`,
    refresh: true,
    body: `${weather}
      ${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ""}
      <div class="current-user">当前使用者：${escapeHtml(user.display_name)}</div>
      <h1>你好，${escapeHtml(user.display_name)}</h1>
      <a class="button" href="/k/books">小说</a>
      <a class="button" href="/k/words">单词</a>
      <section class="card">
        <h2>今日概况</h2>
        <p>今日完成题数：${Number(stats?.today_attempts || 0)}<br>
        待复习错题：${Number(stats?.pending_mistakes || 0)}</p>
      </section>`,
    nav: `<a href="/k/home">个人主页</a> | <a href="/k/settings">显示设置</a> | <a href="/k/switch-user">切换使用者</a>`,
  }));
}

function placeholderPage(user, kind) {
  const isBooks = kind === "books";
  return htmlResponse(layout({
    title: isBooks ? "小说书架" : "英语学习",
    body: `<div class="current-user">当前使用者：${escapeHtml(user.display_name)}</div>
      <h1>${isBooks ? "小说书架" : `${escapeHtml(user.display_name)}的英语学习`}</h1>
      <div class="warning">
        <strong>${isBooks ? "书架目前是空的。" : "正式教材内容正在按审核状态预装。"}</strong>
        <p>${isBooks ? "家长上传并发布小说后，就会显示在这里。" : "不会使用少量演示词汇冒充七册正式知识库。"}</p>
      </div>
      ${isBooks ? "" : `<div class="card"><h2>默认学习计划</h2><p>新单词：10<br>复习单词：20<br>固定搭配：5<br>语法题：5</p></div>`}`,
    nav: `<a href="/k/home">个人主页</a> | <a href="/k/switch-user">切换使用者</a>`,
  }));
}

async function switchUserPage(request, env, session, user) {
  if (request.method === "POST") {
    const form = await request.formData();
    if (!safeEqual(String(form.get("csrf_token") || ""), session.csrf_token)) {
      return errorPage(403, "CSRF 校验失败", "表单已过期，请返回后重试。");
    }
    await env.DB.prepare(`
      UPDATE device_sessions SET current_user_id = NULL, updated_at = datetime('now') WHERE id = ?
    `).bind(session.id).run();
    return redirect("/k?notice=switched");
  }
  return htmlResponse(layout({
    title: "切换使用者",
    body: `<div class="current-user">当前使用者：${escapeHtml(user.display_name)}</div>
      <h1>切换使用者</h1>
      <p>切换后不会删除或合并任何阅读进度和学习记录。</p>
      <form method="post" action="/k/switch-user">
        <input type="hidden" name="csrf_token" value="${escapeHtml(session.csrf_token)}">
        <input type="submit" value="确认切换使用者">
      </form>`,
    nav: '<a href="/k/home">取消，返回个人主页</a>',
  }));
}

async function settingsPage(request, env, session, user) {
  if (request.method === "POST") {
    const form = await request.formData();
    if (!safeEqual(String(form.get("csrf_token") || ""), session.csrf_token)) {
      return errorPage(403, "CSRF 校验失败", "表单已过期，请返回后重试。");
    }
    const fontSize = String(form.get("reading_font_size") || "");
    if (!["small", "medium", "large"].includes(fontSize)) return errorPage(400, "设置无效", "请选择小、中或大字号。");
    await env.DB.prepare(`
      UPDATE user_preferences SET reading_font_size = ?, updated_at = datetime('now') WHERE user_id = ?
    `).bind(fontSize, user.id).run();
    return redirect("/k/settings?saved=1");
  }
  const pref = await env.DB.prepare(`
    SELECT reading_font_size FROM user_preferences WHERE user_id = ? LIMIT 1
  `).bind(user.id).first();
  const current = pref?.reading_font_size || "medium";
  return htmlResponse(layout({
    title: "个人显示设置",
    body: `<div class="current-user">当前使用者：${escapeHtml(user.display_name)}</div>
      <h1>个人显示设置</h1>
      ${urlFlag(request.url, "saved") ? '<div class="notice">字号设置已保存。</div>' : ""}
      <form method="post" action="/k/settings">
        <input type="hidden" name="csrf_token" value="${escapeHtml(session.csrf_token)}">
        <fieldset>
          <legend>小说字号</legend>
          ${["small", "medium", "large"].map((value, index) => `
            <label class="radio-line"><input type="radio" name="reading_font_size" value="${value}" ${current === value ? "checked" : ""}> ${["小", "中", "大"][index]}</label>
          `).join("")}
        </fieldset>
        <input type="submit" value="保存设置">
      </form>`,
    nav: `<a href="/k/home">个人主页</a> | <a href="/k/switch-user">切换使用者</a>`,
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
      <p><strong>中文显示：</strong>墨读，昆明，阅读与英语学习。</p>
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
      <p class="muted">文件上传只在家长后台测试，不要求 Kindle 上传文件。</p>`,
    nav: '<a href="/k">Kindle 入口</a> | <a href="/admin">家长后台</a>',
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

async function adminDashboard(request, env, identity) {
  const csrf = await adminCsrf(identity, env);
  const counts = await env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM users WHERE status = 'active') AS users,
      (SELECT COUNT(*) FROM devices WHERE status = 'active') AS devices,
      (SELECT COUNT(*) FROM books WHERE status = 'published') AS books,
      (SELECT COUNT(*) FROM vocabulary_occurrences WHERE verification_status = 'verified') AS verified_words
  `).first();
  return htmlResponse(layout({
    title: "家长管理后台",
    admin: true,
    body: `${adminNavigation()}
      <h1>家长管理后台</h1>
      <p class="muted">当前管理员：${escapeHtml(identity.email)}</p>
      ${csrf ? "" : '<div class="warning">管理表单密钥尚未配置，写操作暂时不可用。</div>'}
      <div class="card"><h2>第一阶段状态</h2>
        <p>活跃使用者：${Number(counts?.users || 0)}<br>
        活跃 Kindle 设备：${Number(counts?.devices || 0)}<br>
        已发布小说：${Number(counts?.books || 0)}<br>
        已审核正式词汇关联：${Number(counts?.verified_words || 0)}</p>
      </div>
      <div class="warning"><strong>当前为最小兼容验证版。</strong>
        <p>小说与正式教材数据尚未导入，因此不会显示未经审核的正式内容。</p>
      </div>`,
    nav: '<a href="/k">Kindle 入口</a>',
  }));
}

async function adminUsers(env, identity) {
  const result = await env.DB.prepare(`
    SELECT u.id, u.display_name, u.status, u.created_at,
      (SELECT COUNT(*) FROM reading_progress rp WHERE rp.user_id = u.id) AS progress_count,
      (SELECT COUNT(*) FROM attempts a WHERE a.user_id = u.id) AS attempt_count,
      (SELECT COUNT(*) FROM mistakes m WHERE m.user_id = u.id) AS mistake_count
    FROM users u
    ORDER BY u.created_at DESC
    LIMIT 100
  `).all();
  const rows = (result.results || []).map((user) => `<tr>
    <td>${escapeHtml(user.display_name)}</td>
    <td>${escapeHtml(user.status)}</td>
    <td>${Number(user.progress_count || 0)}</td>
    <td>${Number(user.attempt_count || 0)}</td>
    <td>${Number(user.mistake_count || 0)}</td>
  </tr>`).join("");
  return htmlResponse(layout({
    title: "使用者管理",
    admin: true,
    body: `${adminNavigation()}<h1>使用者管理</h1>
      <p class="muted">管理员：${escapeHtml(identity.email)}</p>
      <table><thead><tr><th>名称</th><th>状态</th><th>阅读进度</th><th>答题</th><th>错题</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5">暂无使用者。请先初始化设备并从 Kindle 入口创建。</td></tr>'}</tbody></table>`,
    nav: '<a href="/admin">返回总览</a>',
  }));
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
      <p class="warning">第一阶段使用手动备用天气。自动天气接口将在真实设备兼容确认后接入。</p>
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

async function routeAdmin(request, env, url) {
  const admin = await requireAdmin(request, env);
  if (admin.response) return admin.response;
  const path = url.pathname;
  if (path === "/admin" && request.method === "GET") return adminDashboard(request, env, admin.identity);
  if (path === "/admin/users" && request.method === "GET") return adminUsers(env, admin.identity);
  if (path === "/admin/devices" && request.method === "GET") return adminDevices(request, env, admin.identity, url);
  if (path === "/admin/devices/create" && request.method === "POST") return adminCreateDevice(request, env);
  if (path === "/admin/devices/reveal" && request.method === "GET") return adminRevealDevice(env, admin.identity, url);
  if (path === "/admin/devices/revoke" && request.method === "POST") return adminRevokeDevice(request, env);
  if (path === "/admin/weather" && request.method === "GET") return adminWeather(request, env, admin.identity, url);
  if (path === "/admin/weather" && request.method === "POST") return adminWeatherPost(request, env);
  return errorPage(404, "管理页面不存在", "该管理页面尚未建立。", '<a href="/admin">返回后台总览</a>');
}

async function routeKindle(request, env, url) {
  if (url.pathname === "/k/setup" && request.method === "GET") return setupDevice(request, env, url);
  const session = await getDeviceSession(request, env);
  if (!session || session.device_status !== "active") return createAutomaticDeviceSession(request, env, url);
  const user = await getCurrentUser(session, env);

  if (url.pathname === "/k" && request.method === "GET") return usersPage(request, env, url, session);
  if (url.pathname === "/k/users/new" && request.method === "GET") {
    return redirect("/k");
  }
  if (url.pathname === "/k/users/new" && request.method === "POST") return createUser(request, env, session);
  if (url.pathname === "/k/select-user" && request.method === "POST") return selectUser(request, env, session);

  if (!user) return errorPage(409, "请先选择使用者", "当前设备尚未选择有效使用者。", '<a href="/k">返回使用者选择页</a>');
  if (url.pathname === "/k/home" && request.method === "GET") return homePage(env, url, session, user);
  if (url.pathname === "/k/books" && request.method === "GET") return placeholderPage(user, "books");
  if (url.pathname === "/k/words" && request.method === "GET") return placeholderPage(user, "words");
  if (url.pathname === "/k/settings" && ["GET", "POST"].includes(request.method)) return settingsPage(request, env, session, user);
  if (url.pathname === "/k/switch-user" && ["GET", "POST"].includes(request.method)) return switchUserPage(request, env, session, user);
  return errorPage(404, "页面不存在", "请求的 Kindle 页面不存在。", '<a href="/k/home">个人主页</a> | <a href="/k">使用者选择</a>');
}

async function handleRequest(request, env) {
  if (!env.DB) return errorPage(503, "数据库尚未连接", "站点的 D1 数据库绑定尚未完成，请稍后重试。");
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
  if (path === "/k" || path.startsWith("/k/")) return routeKindle(request, env, url);
  return errorPage(404, "页面不存在", "你访问的页面不存在。");
}

export default {
  async fetch(request, env, ctx) {
    void ctx;
    try {
      return await handleRequest(request, env);
    } catch (error) {
      console.error("request_failed", {
        path: new URL(request.url).pathname,
        name: String(error?.name || "Error").slice(0, 80),
      });
      return errorPage(500, "系统错误", "系统暂时无法完成请求，请稍后重试。");
    }
  },
};

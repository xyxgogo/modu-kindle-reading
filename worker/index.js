const COOKIE_DEVICE = "modu_device_session";
const COOKIE_ADMIN = "modu_admin_session";
const COOKIE_TEST = "modu_cookie_test";
const COOKIE_TEST_CSRF = "modu_test_csrf";
const SESSION_MAX_AGE = 60 * 60 * 24 * 180;
const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "090709";
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

function baseStyles() {
  return `
    html { background: #fff; color: #000; font-family: Arial, "Microsoft YaHei", sans-serif; }
    body { margin: 0; background: #fff; color: #000; font-size: 28px; line-height: 1.62; }
    main { box-sizing: border-box; width: 100%; max-width: 760px; margin: 0 auto; padding: 26px 20px 44px; }
    h1 { margin: 0 0 26px; font-size: 38px; line-height: 1.28; }
    h2 { margin: 32px 0 16px; font-size: 33px; line-height: 1.34; }
    h3 { margin: 28px 0 12px; font-size: 29px; }
    p { margin: 15px 0; }
    a { color: #000; text-decoration: underline; text-underline-offset: 3px; }
    .brand { border-bottom: 5px solid #000; margin-bottom: 26px; padding-bottom: 16px; text-align: center; }
    .brand strong { display: block; font-size: 36px; letter-spacing: .08em; }
    .brand .muted { display: block; margin-top: 5px; }
    .muted { color: #333; font-size: 23px; }
    .notice { border: 3px solid #000; margin: 18px 0; padding: 12px 14px; font-weight: bold; }
    .warning { border: 3px double #000; margin: 18px 0; padding: 12px 14px; }
    .card { border: 4px solid #000; margin: 20px 0; padding: 20px; background: #fff; }
    .weather-panel { border: 4px solid #000; margin: 0 0 30px; padding: 20px 16px; text-align: center; font-size: 31px; line-height: 1.48; }
    .weather-time { display: block; margin: 0 0 12px; font-size: 36px; line-height: 1.35; }
    .weather-icon { font-family: Arial, "Microsoft YaHei", sans-serif; font-size: 62px; line-height: 1; margin: 6px 0 12px; }
    .weather-place { font-size: 33px; font-weight: bold; }
    .button, button, input[type="submit"] {
      box-sizing: border-box; display: block; width: 100%; min-height: 82px; margin: 17px 0;
      border: 4px solid #000; border-radius: 0; background: #fff; color: #000;
      font: bold 28px/1.3 Arial, "Microsoft YaHei", sans-serif; text-align: center;
      text-decoration: none; padding: 20px 14px; cursor: pointer;
    }
    button:active, input[type="submit"]:active, .button:active { color: #fff; background: #000; }
    input[type="text"], input[type="password"], input[type="number"], textarea, select {
      box-sizing: border-box; width: 100%; min-height: 66px; border: 3px solid #000;
      border-radius: 0; background: #fff; color: #000; font: 27px/1.45 Arial, "Microsoft YaHei", sans-serif;
      padding: 12px 14px;
    }
    label { display: block; margin-top: 16px; font-weight: bold; }
    fieldset { border: 3px solid #000; margin: 18px 0; padding: 12px; }
    legend { padding: 0 8px; font-weight: bold; }
    .radio-line { display: block; min-height: 56px; padding: 12px 2px; font-weight: normal; }
    input[type="radio"], input[type="checkbox"] { width: 32px; height: 32px; vertical-align: middle; }
    nav { border-top: 3px solid #000; margin-top: 30px; padding-top: 18px; line-height: 2; }
    table { width: 100%; border-collapse: collapse; font-size: 22px; }
    th, td { border: 2px solid #000; padding: 10px; text-align: left; vertical-align: top; }
    th { background: #eee; }
    .line-thin { border-top: 1px solid #000; margin: 14px 0; }
    .line-thick { border-top: 5px solid #000; margin: 14px 0; }
    .gray-1 { background: #eee; padding: 8px; }
    .gray-2 { background: #bbb; padding: 8px; }
    .gray-3 { background: #777; color: #fff; padding: 8px; }
    .current-user { border: 2px solid #000; margin: 12px 0; padding: 7px 10px; font-weight: bold; }
    .compact-form { margin: 0; }
    .compact-form button { min-height: 64px; margin: 10px 0; font-size: 23px; padding: 14px; }
    .admin main { max-width: 1080px; font-size: 23px; }
    .admin .button, .admin button, .admin input[type="submit"] { min-height: 64px; font-size: 23px; padding: 15px; }
    .admin input[type="text"], .admin input[type="password"], .admin input[type="number"], .admin textarea, .admin select { min-height: 58px; font-size: 23px; }
    .admin-nav { border: 3px solid #000; padding: 12px 16px; line-height: 2.2; }
    code { font-family: "Courier New", monospace; font-size: .9em; overflow-wrap: anywhere; }
    @media (max-width: 480px) {
      body { font-size: 27px; }
      main { padding: 20px 14px 36px; }
      h1 { font-size: 36px; }
      h2 { font-size: 31px; }
      .weather-time { font-size: 34px; }
      .weather-place { font-size: 31px; }
      .admin table { font-size: 19px; }
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
    <a href="/admin/books">小说</a> |
    <a href="/admin/vocabulary">英语知识库</a> |
    <a href="/admin/plans">学习计划</a> |
    <a href="/admin/reports">学习报告</a> |
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
  return { email: ADMIN_USERNAME, username: ADMIN_USERNAME };
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
  if (!secret || !env.SESSION_SECRET) return errorPage(500, "系统设置未完成", "管理员登录密钥尚未配置。");
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
    if (!safeEqual(username, ADMIN_USERNAME) || !safeEqual(password, ADMIN_PASSWORD)) {
      return redirect(`/admin/login?error=1&return_to=${encodeURIComponent(returnTo)}`);
    }
    const sessionToken = await hmac(env.SESSION_SECRET, "fixed-admin-session:v1");
    return redirect(returnTo, {
      "set-cookie": `${COOKIE_ADMIN}=${encodeURIComponent(sessionToken)}; Path=/admin; Max-Age=${60 * 60 * 24 * 30}; HttpOnly; Secure; SameSite=Strict`,
    });
  }
  return htmlResponse(layout({
    title: "家长后台登录",
    admin: true,
    body: `<h1>家长后台登录</h1>
      ${url.searchParams.get("error") === "1" ? '<div class="warning">用户名或密码错误，请重新输入。</div>' : ""}
      <form method="post" action="/admin/login?return_to=${encodeURIComponent(returnTo)}">
        <input type="hidden" name="csrf_token" value="${escapeHtml(loginCsrf)}">
        <label for="username">用户名</label>
        <input id="username" name="username" type="text" value="admin" autocomplete="username" required>
        <label for="password">密码</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required>
        <input type="submit" value="登录家长后台">
      </form>
      <p class="muted">家长后台与 Kindle 使用者昵称相互独立。</p>`,
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
  if (/雷/u.test(text)) return "⚡";
  if (/雪|冰/u.test(text)) return "❄";
  if (/雨/u.test(text)) return "☂";
  if (/雾/u.test(text)) return "≋";
  if (/晴/u.test(text) && !/云/u.test(text)) return "☀";
  if (/云|阴/u.test(text)) return "☁";
  return "◯";
}

async function fetchAutomaticWeather(env, force = false) {
  const enabled = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'automatic_weather_enabled'`).first();
  if (enabled?.value === "0" && !force) return null;
  if (!force) {
    const fresh = await env.DB.prepare(`
      SELECT payload_json, fetched_at FROM weather_cache
      WHERE location = '云南省昆明市' AND status = 'success' AND expires_at > datetime('now')
      ORDER BY fetched_at DESC LIMIT 1
    `).first();
    if (fresh?.payload_json) {
      try { return { ...JSON.parse(fresh.payload_json), stale: false }; } catch { /* refetch */ }
    }
  }
  const baseUrl = String(env.WEATHER_API_BASE_URL || "https://api.open-meteo.com/v1/forecast").trim();
  const endpoint = new URL(baseUrl);
  endpoint.searchParams.set("latitude", "25.0389");
  endpoint.searchParams.set("longitude", "102.7183");
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
    };
    if (![payload.current, payload.high, payload.low].every(Number.isFinite)) throw new Error("weather_invalid_payload");
    await env.DB.prepare(`
      INSERT INTO weather_cache
        (id, provider, location, payload_json, status, fetched_at, expires_at, created_at, updated_at)
      VALUES (?, 'Open-Meteo', '云南省昆明市', ?, 'success', datetime('now'), datetime('now', '+30 minutes'), datetime('now'), datetime('now'))
    `).bind(crypto.randomUUID(), JSON.stringify(payload)).run();
    return { ...payload, stale: false };
  } catch {
    const stale = await env.DB.prepare(`
      SELECT payload_json FROM weather_cache
      WHERE location = '云南省昆明市' AND status = 'success'
      ORDER BY fetched_at DESC LIMIT 1
    `).first();
    if (stale?.payload_json) {
      try { return { ...JSON.parse(stale.payload_json), stale: true }; } catch { /* use manual */ }
    }
    return null;
  }
}

async function weatherBlock(env) {
  const automatic = await fetchAutomaticWeather(env);
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
  return `<section class="weather-panel" aria-label="昆明时间和天气">
    <strong class="weather-time">${escapeHtml(kunmingNow())}</strong>
    <div class="weather-icon" role="img" aria-label="${escapeHtml(weather.condition)}">${escapeHtml(symbol)}</div>
    <p class="weather-place">昆明　${escapeHtml(weather.condition)}　${escapeHtml(weather.current)}℃</p>
    <p>
    最高 ${escapeHtml(weather.high)}℃ / 最低 ${escapeHtml(weather.low)}℃<br>
    ${escapeHtml(weather.rain)}</p>
    <p class="muted">天气更新时间：${escapeHtml(weather.updated)}${weather.stale ? "（天气数据暂未更新，显示最近成功数据）" : ""}</p>
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
    nav: '<a href="/device-test">设备测试</a>',
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
      (SELECT COUNT(*) FROM attempts WHERE user_id = ? AND date(created_at, '+8 hours') = date('now', '+8 hours')) AS today_attempts,
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
  const weather = await weatherBlock(env);
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
      ${weather}
      ${csrf ? "" : '<div class="warning">管理表单密钥尚未配置，写操作暂时不可用。</div>'}
      <div class="card"><h2>系统状态</h2>
        <p>活跃使用者：${Number(counts?.users || 0)}<br>
        活跃 Kindle 设备：${Number(counts?.devices || 0)}<br>
        已发布小说：${Number(counts?.books || 0)}<br>
        已审核正式词汇关联：${Number(counts?.verified_words || 0)}</p>
      </div>
      <div class="card"><strong>内容审核规则</strong>
        <p>只有 <code>verified</code> 内容进入正式练习；待审核和演示内容不会混入家庭任务。</p>
      </div>`,
    nav: '<a href="/k">Kindle 入口</a>',
  }));
}

async function adminUsers(env, identity, url) {
  const csrf = await adminCsrf(identity, env);
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
    <td><a href="/admin/users/${encodeURIComponent(user.id)}">${escapeHtml(user.display_name)}</a></td>
    <td>${escapeHtml(user.status)}</td>
    <td>${Number(user.progress_count || 0)}</td>
    <td>${Number(user.attempt_count || 0)}</td>
    <td>${Number(user.mistake_count || 0)}</td>
  </tr>`).join("");
  return htmlResponse(layout({
    title: "使用者管理",
    admin: true,
    body: `${adminNavigation()}<h1>使用者管理</h1>
      ${noticeText(url?.searchParams.get("notice")) ? `<div class="notice">${escapeHtml(noticeText(url.searchParams.get("notice")))}</div>` : ""}
      <p class="muted">管理员：${escapeHtml(identity.email)}</p>
      <section class="card"><h2>新增使用者</h2>
        <form method="post" action="/admin/users/create">
          <input type="hidden" name="csrf_token" value="${escapeHtml(csrf || "")}">
          <label for="display_name">昵称（1 至 20 个字符）</label>
          <input id="display_name" name="display_name" type="text" maxlength="20" required>
          <label class="radio-line"><input type="checkbox" name="default_plan" value="1" checked> 使用系统默认学习计划</label>
          <input type="submit" value="新增使用者">
        </form>
      </section>
      <table><thead><tr><th>名称</th><th>状态</th><th>阅读进度</th><th>答题</th><th>错题</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5">暂无使用者。请先初始化设备并从 Kindle 入口创建。</td></tr>'}</tbody></table>`,
    nav: '<a href="/admin">返回总览</a>',
  }));
}

async function adminCreateUser(request, env) {
  const form = await request.formData();
  const admin = await requireAdminPost(request, env, form);
  if (admin.response) return admin.response;
  const validation = normalizeUserName(form.get("display_name"));
  if (validation.error) return errorPage(400, "无法创建使用者", validation.error, '<a href="/admin/users">返回使用者管理</a>');
  const household = await env.DB.prepare(`SELECT id FROM households WHERE status = 'active' ORDER BY created_at LIMIT 1`).first();
  if (!household) return errorPage(500, "家庭数据缺失", "数据库初始化尚未完成。");
  const userId = crypto.randomUUID();
  const statements = [
    env.DB.prepare(`
      INSERT INTO users (id, household_id, display_name, normalized_name, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', datetime('now'), datetime('now'))
    `).bind(userId, household.id, validation.display, validation.normalized),
    env.DB.prepare(`
      INSERT INTO user_preferences (id, user_id, reading_font_size, created_at, updated_at)
      VALUES (?, ?, 'medium', datetime('now'), datetime('now'))
    `).bind(crypto.randomUUID(), userId),
  ];
  if (form.get("default_plan") === "1") {
    statements.push(env.DB.prepare(`
      INSERT INTO study_plans
        (id, user_id, name, daily_new_words, daily_review_words, daily_phrases, daily_grammar,
         weekend_enabled, status, created_at, updated_at)
      VALUES (?, ?, '系统默认计划', 10, 20, 5, 5, 1, 'active', datetime('now'), datetime('now'))
    `).bind(crypto.randomUUID(), userId));
  }
  try {
    await env.DB.batch(statements);
  } catch {
    return errorPage(409, "无法创建使用者", "同一家庭中已有相同昵称，请换一个名称。", '<a href="/admin/users">返回使用者管理</a>');
  }
  return redirect(`/admin/users/${encodeURIComponent(userId)}?notice=user_created_admin`);
}

async function adminUserDetail(request, env, identity, url, userId) {
  const csrf = await adminCsrf(identity, env);
  const user = await env.DB.prepare(`
    SELECT u.*, up.reading_font_size, up.part_c_enabled, up.extension_enabled
    FROM users u LEFT JOIN user_preferences up ON up.user_id = u.id
    WHERE u.id = ? LIMIT 1
  `).bind(userId).first();
  if (!user) return errorPage(404, "使用者不存在", "该使用者不存在或已经删除。", '<a href="/admin/users">返回使用者管理</a>');
  const counts = await env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM reading_progress WHERE user_id = ?) AS progress_count,
      (SELECT COUNT(*) FROM attempts WHERE user_id = ?) AS attempt_count,
      (SELECT COUNT(*) FROM mistakes WHERE user_id = ?) AS mistake_count,
      (SELECT COUNT(*) FROM practice_sessions WHERE user_id = ?) AS session_count
  `).bind(userId, userId, userId, userId).first();
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
      <p>状态：${escapeHtml(user.status)}<br>创建时间：${escapeHtml(user.created_at)}</p>
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
      <section class="card"><h2>个人数据</h2><p>小说进度：${Number(counts?.progress_count || 0)}<br>
        练习会话：${Number(counts?.session_count || 0)}<br>答题记录：${Number(counts?.attempt_count || 0)}<br>错题：${Number(counts?.mistake_count || 0)}</p>
        <a class="button" href="/admin/users/${escapeHtml(user.id)}/export">导出个人数据</a>
        <a class="button" href="/admin/users/${escapeHtml(user.id)}/clear">清空学习记录</a>
        <a class="button" href="/admin/users/${escapeHtml(user.id)}/delete">删除使用者</a>
      </section>
      <h2>小说阅读进度</h2>
      <table><thead><tr><th>小说</th><th>章节</th><th>页</th><th>字号</th><th>最近阅读</th></tr></thead>
      <tbody>${progressRows || '<tr><td colspan="5">暂无阅读记录。</td></tr>'}</tbody></table>`,
    nav: '<a href="/admin/plans">学习计划</a> | <a href="/admin/users">返回使用者列表</a>',
  }));
}

async function adminUpdateUser(request, env, userId) {
  const form = await request.formData();
  const admin = await requireAdminPost(request, env, form);
  if (admin.response) return admin.response;
  const validation = normalizeUserName(form.get("display_name"));
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
        <p>小说进度：${Number(counts?.progress_count || 0)}<br>答题记录：${Number(counts?.attempt_count || 0)}<br>错题：${Number(counts?.mistake_count || 0)}</p>
        <p>${deleting ? "删除后，该使用者的阅读进度、学习计划、练习、答题和错题将一并删除，无法恢复；其他使用者不受影响。建议优先停用。" : "清空后会删除练习、答题、错题、掌握状态和每日统计；使用者及小说进度保留。"}</p>
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
      <section class="card"><p>使用者：${Number(counts?.users || 0)}<br>小说：${Number(counts?.books || 0)}<br>词汇：${Number(counts?.vocabulary || 0)}<br>答题：${Number(counts?.attempts || 0)}<br>错题：${Number(counts?.mistakes || 0)}</p></section>
      <a class="button" href="/admin/backup/attempts.csv">导出全部答题记录 CSV</a>
      <a class="button" href="/admin/backup/catalog.json">导出内容目录 JSON</a>
      <p class="muted">原始上传文件和导入文件保存在 R2；本页导出结构化目录与记录，不公开原文件地址。</p>`,
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
    const result = await fetchAutomaticWeather(env, true);
    if (!result) return errorPage(502, "天气暂时不可用", "自动天气接口未返回有效数据，备用天气仍可正常使用。", '<a href="/admin/weather">返回天气设置</a>');
    return redirect("/admin/weather?notice=weather_tested");
  }
  return errorPage(400, "天气操作无效", "没有识别到有效的天气操作。", '<a href="/admin/weather">返回天气设置</a>');
}

function chapterHeading(line) {
  const text = line.trim();
  if (!text) return null;
  const markdown = text.match(/^#{1,2}\s+(.{1,120})$/u);
  if (markdown) return markdown[1].trim();
  if (/^第\s*[0-9一二三四五六七八九十百零〇]+\s*章(?:\s+|[:：]?).{0,100}$/u.test(text)) return text;
  if (/^Chapter\s+(?:[0-9]+|One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten)\b.{0,100}$/iu.test(text)) return text;
  if (/^[一二三四五六七八九十]+、.{1,100}$/u.test(text)) return text;
  if (/^[0-9]{1,3}\.\s+.{1,100}$/u.test(text)) return text;
  return null;
}

function parseBookChapters(rawText) {
  const clean = String(rawText || "")
    .replace(/^\uFEFF/u, "")
    .replace(/\r\n?/gu, "\n")
    .replace(/\u0000/gu, "")
    .trim();
  if (!clean) return [];
  const chapters = [];
  let current = null;
  let preface = [];
  for (const line of clean.split("\n")) {
    const heading = chapterHeading(line);
    if (heading) {
      if (current) {
        current.body = current.lines.join("\n").trim();
        chapters.push(current);
      } else if (preface.join("").trim()) {
        chapters.push({ title: "序章", body: preface.join("\n").trim(), warning: "标题前文字已作为序章保存。" });
      }
      current = { title: heading, lines: [], warning: "" };
      preface = [];
    } else if (current) {
      current.lines.push(line);
    } else {
      preface.push(line);
    }
  }
  if (current) {
    current.body = current.lines.join("\n").trim();
    chapters.push(current);
  } else if (preface.join("").trim()) {
    chapters.push({ title: "正文", body: preface.join("\n").trim(), warning: "未识别到章节标题，已作为单章保存。" });
  }
  return chapters
    .map((chapter) => ({
      title: chapter.title.trim().slice(0, 160),
      body: chapter.body.trim(),
      warning: chapter.warning || (chapter.body.trim() ? "" : "空章节"),
    }))
    .filter((chapter) => chapter.body || chapter.title);
}

function splitLongPiece(text, limit) {
  const pieces = [];
  let rest = text.trim();
  while (rest.length > limit) {
    let cut = -1;
    const window = rest.slice(0, limit + 1);
    const punctuation = Math.max(
      window.lastIndexOf("。"),
      window.lastIndexOf("！"),
      window.lastIndexOf("？"),
      window.lastIndexOf(". "),
      window.lastIndexOf("! "),
      window.lastIndexOf("? "),
      window.lastIndexOf("; "),
      window.lastIndexOf("；"),
    );
    if (punctuation > limit * 0.55) cut = punctuation + 1;
    if (cut < 0) {
      const space = window.lastIndexOf(" ");
      cut = space > limit * 0.55 ? space : limit;
    }
    pieces.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) pieces.push(rest);
  return pieces;
}

function paginateChapter(body, target) {
  const paragraphs = String(body || "")
    .replace(/\r\n?/gu, "\n")
    .split(/\n\s*\n/gu)
    .map((item) => item.replace(/\s*\n\s*/gu, " ").trim())
    .filter(Boolean)
    .flatMap((item) => splitLongPiece(item, target));
  if (!paragraphs.length) return [""];
  const pages = [];
  let current = [];
  let length = 0;
  for (const paragraph of paragraphs) {
    const nextLength = length + paragraph.length + (current.length ? 2 : 0);
    if (current.length && nextLength > target && length >= target * 0.58) {
      pages.push(current.join("\n\n"));
      current = [paragraph];
      length = paragraph.length;
    } else {
      current.push(paragraph);
      length = nextLength;
    }
  }
  if (current.length) {
    const last = current.join("\n\n");
    if (pages.length && last.length < target * 0.18) {
      pages[pages.length - 1] += `\n\n${last}`;
    } else {
      pages.push(last);
    }
  }
  return pages;
}

async function runBatches(db, statements, size = 80) {
  for (let index = 0; index < statements.length; index += size) {
    await db.batch(statements.slice(index, index + size));
  }
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
    uploaded: "小说已上传并完成服务器解析。",
    published: "小说已发布到 Kindle 书架。",
    unpublished: "小说已下架。",
    updated: "小说信息已更新。",
  }[url.searchParams.get("notice")] || "";
  return htmlResponse(layout({
    title: "小说管理",
    admin: true,
    body: `${adminNavigation()}<h1>小说管理</h1>
      ${notice ? `<div class="notice">${notice}</div>` : ""}
      <a class="button" href="/admin/books/new">上传或粘贴小说</a>
      <table><thead><tr><th>标题</th><th>作者</th><th>状态</th><th>章节</th><th>页数</th><th>更新</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6">暂无小说。</td></tr>'}</tbody></table>
      <form method="post" action="/admin/books/sample">
        <input type="hidden" name="csrf_token" value="${escapeHtml(csrf || "")}">
        <input type="submit" value="建立原创演示小说">
      </form>`,
    nav: '<a href="/admin">返回总览</a>',
  }));
}

async function adminNewBook(request, env, identity) {
  const csrf = await adminCsrf(identity, env);
  if (request.method === "GET") {
    return htmlResponse(layout({
      title: "上传小说",
      admin: true,
      body: `${adminNavigation()}<h1>上传小说</h1>
        <form method="post" action="/admin/books/new" enctype="multipart/form-data">
          <input type="hidden" name="csrf_token" value="${escapeHtml(csrf || "")}">
          <label for="title">标题</label><input id="title" name="title" type="text" maxlength="160" required>
          <label for="author">作者</label><input id="author" name="author" type="text" maxlength="120">
          <label for="summary">简介</label><textarea id="summary" name="summary" rows="4"></textarea>
          <label for="language">语言</label>
          <select id="language" name="language"><option value="zh">中文</option><option value="en">英文</option><option value="mixed">中英双语</option></select>
          <label for="recommended_grade">推荐年级备注</label><input id="recommended_grade" name="recommended_grade" type="text" maxlength="80">
          <label for="file">TXT 或 Markdown 文件（可空）</label>
          <input id="file" name="file" type="file" accept=".txt,.md,.markdown,text/plain,text/markdown">
          <label for="body">或直接粘贴正文</label><textarea id="body" name="body" rows="16"></textarea>
          <label for="source_notes">数据来源说明</label><textarea id="source_notes" name="source_notes" rows="3"></textarea>
          <label for="rights_notes">版权或使用权限备注</label><textarea id="rights_notes" name="rights_notes" rows="3"></textarea>
          <input type="submit" value="上传并解析">
        </form>`,
      nav: '<a href="/admin/books">返回小说列表</a>',
    }));
  }
  const form = await request.formData();
  const admin = await requireAdminPost(request, env, form);
  if (admin.response) return admin.response;
  const title = String(form.get("title") || "").trim().slice(0, 160);
  if (!title) return errorPage(400, "小说标题缺失", "请填写小说标题。", '<a href="/admin/books/new">返回上传</a>');
  let body = String(form.get("body") || "");
  let fileName = "pasted.txt";
  let mediaType = "text/plain";
  let bytes = new TextEncoder().encode(body);
  const uploaded = form.get("file");
  if (uploaded && typeof uploaded.arrayBuffer === "function" && uploaded.size > 0) {
    if (uploaded.size > 2 * 1024 * 1024) return errorPage(400, "文件过大", "第一版单个小说源文件不得超过 2MB。");
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
  if (!body.trim()) return errorPage(400, "小说正文缺失", "请上传文件或粘贴小说正文。");
  const chapters = parseBookChapters(body);
  if (!chapters.length) return errorPage(400, "解析失败", "未能从正文中读取有效内容。");
  const bookId = crypto.randomUUID();
  const fileId = crypto.randomUUID();
  const storageKey = `books/${bookId}/${fileId}-${fileName.replace(/[^a-zA-Z0-9._-]/gu, "_")}`;
  if (!env.BUCKET) return errorPage(503, "文件存储尚未连接", "R2 文件存储绑定不可用。");
  await env.BUCKET.put(storageKey, bytes, { httpMetadata: { contentType: mediaType } });
  const statements = [
    env.DB.prepare(`
      INSERT INTO books
        (id, household_id, title, author, summary, language, recommended_grade, status, sort_order,
         total_chapters, total_pages, source_notes, rights_notes, created_at, updated_at)
      VALUES (?, 'household_default', ?, ?, ?, ?, ?, 'preview', 0, ?, 0, ?, ?, datetime('now'), datetime('now'))
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
    for (const [fontSize, target] of [["small", 760], ["medium", 560], ["large", 400]]) {
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
  const body = `第一章 清晨\n\n清晨，窗外很安静。小满打开 Kindle，看见了今天的日期和昆明天气。\n\n他输入自己的昵称，进入墨读。页面上只有两个大按钮：小说和单词。\n\n第二章 两个使用者\n\n妙妙也想看同一本书。她选择自己的名字，阅读从第一页开始。\n\n小满再次进入时，系统仍然记得他刚才读到的位置。两个人的进度没有混在一起。\n\n第三章 不用脚本也能读\n\nKindle 没有运行 JavaScript，上一页、目录和下一页仍然可以使用。\n\n每次翻页，服务器都会保存进度。网络慢的时候，页面仍然保持简单、清楚。`;
  const fake = new FormData();
  fake.set("csrf_token", String(form.get("csrf_token") || ""));
  fake.set("title", title);
  fake.set("author", "墨读项目组");
  fake.set("summary", "用于验证 Kindle 小说目录、翻页和多使用者阅读进度的原创短篇。");
  fake.set("language", "zh");
  fake.set("recommended_grade", "家庭阅读兼容测试");
  fake.set("body", body);
  fake.set("source_notes", "系统原创演示小说，不含教材正文。");
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
  if (!book) return errorPage(404, "小说不存在", "该小说不存在或已删除。", '<a href="/admin/books">返回小说列表</a>');
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
  }
  const chapters = await env.DB.prepare(`
    SELECT c.id, c.title, c.sort_order, c.parsing_warnings,
      (SELECT COUNT(*) FROM chapter_pages cp WHERE cp.chapter_id = c.id AND cp.font_size = 'medium') AS page_count
    FROM chapters c WHERE c.book_id = ? ORDER BY c.sort_order
  `).bind(bookId).all();
  const notice = {
    uploaded: "小说已上传并解析，请检查章节后再发布。",
    published: "小说已发布到 Kindle 书架。",
    unpublished: "小说已下架。",
    chapter_updated: "章节已重新分页并保存。",
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
        <input type="submit" value="${book.status === "published" ? "下架小说" : "确认发布"}">
      </form>
      <h2>章节解析结果</h2>
      <table><thead><tr><th>顺序</th><th>章节</th><th>页数</th><th>解析提示</th></tr></thead>
      <tbody>${rows}</tbody></table>`,
    nav: '<a href="/admin/books">返回小说列表</a>',
  }));
}

async function adminChapterEdit(request, env, identity, chapterId) {
  const csrf = await adminCsrf(identity, env);
  const chapter = await env.DB.prepare(`
    SELECT c.*, b.title AS book_title FROM chapters c JOIN books b ON b.id = c.book_id WHERE c.id = ? LIMIT 1
  `).bind(chapterId).first();
  if (!chapter) return errorPage(404, "章节不存在", "该章节不存在。", '<a href="/admin/books">返回小说列表</a>');
  if (request.method === "GET") {
    return htmlResponse(layout({
      title: "编辑章节",
      admin: true,
      body: `${adminNavigation()}<h1>编辑章节</h1><p>小说：${escapeHtml(chapter.book_title)}</p>
        <form method="post" action="/admin/chapters/${escapeHtml(chapter.id)}/edit">
          <input type="hidden" name="csrf_token" value="${escapeHtml(csrf || "")}">
          <label for="title">章节标题</label><input id="title" name="title" type="text" maxlength="160" value="${escapeHtml(chapter.title)}" required>
          <label for="sort_order">排序数字</label><input id="sort_order" name="sort_order" type="number" min="1" value="${Number(chapter.sort_order)}" required>
          <label for="body">章节正文</label><textarea id="body" name="body" rows="28" required>${escapeHtml(chapter.body)}</textarea>
          <input type="submit" value="保存并重新分页">
        </form>`,
      nav: `<a href="/admin/books/${escapeHtml(chapter.book_id)}">返回小说详情</a>`,
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
  for (const [fontSize, target] of [["small", 760], ["medium", 560], ["large", 400]]) {
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

async function kindleBooks(env, user) {
  const result = await env.DB.prepare(`
    SELECT b.id, b.title, b.author,
      rp.chapter_id, rp.page, rp.updated_at,
      c.title AS chapter_title
    FROM books b
    LEFT JOIN reading_progress rp ON rp.book_id = b.id AND rp.user_id = ?
    LEFT JOIN chapters c ON c.id = rp.chapter_id
    WHERE b.status = 'published'
    ORDER BY b.sort_order, b.title
  `).bind(user.id).all();
  const cards = (result.results || []).map((book) => `<section class="card">
    <h2>${escapeHtml(book.title)}</h2>
    <p>作者：${escapeHtml(book.author || "未署名")}<br>
    ${book.chapter_title ? `上次读到：${escapeHtml(book.chapter_title)}，第 ${Number(book.page || 1)} 页` : "尚未开始阅读"}</p>
    <a class="button" href="${book.chapter_id ? `/k/read/${escapeHtml(book.id)}/${escapeHtml(book.chapter_id)}/${Number(book.page || 1)}` : `/k/book/${escapeHtml(book.id)}`}">${book.chapter_id ? "继续阅读" : "查看目录"}</a>
  </section>`).join("");
  return htmlResponse(layout({
    title: "小说书架",
    body: `<div class="current-user">当前使用者：${escapeHtml(user.display_name)}</div>
      <h1>小说书架</h1>${cards || '<p class="warning">书架暂时为空。家长上传并发布小说后会显示在这里。</p>'}`,
    nav: '<a href="/k/home">个人主页</a> | <a href="/k/switch-user">切换使用者</a>',
  }));
}

async function kindleBookDetail(env, user, bookId) {
  const book = await env.DB.prepare(`
    SELECT * FROM books WHERE id = ? AND status = 'published' LIMIT 1
  `).bind(bookId).first();
  if (!book) return errorPage(404, "小说不存在", "该小说不存在或尚未发布。", '<a href="/k/books">返回书架</a>');
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
    nav: '<a href="/k/books">书架</a> | <a href="/k/home">个人主页</a> | <a href="/k/switch-user">切换使用者</a>',
  }));
}

async function kindleRead(env, user, session, bookId, chapterId, pageNumber) {
  const pref = await env.DB.prepare(`SELECT reading_font_size FROM user_preferences WHERE user_id = ? LIMIT 1`).bind(user.id).first();
  const fontSize = pref?.reading_font_size || "medium";
  const row = await env.DB.prepare(`
    SELECT cp.body, cp.page_number, c.id AS chapter_id, c.title AS chapter_title, c.sort_order,
      b.id AS book_id, b.title AS book_title,
      (SELECT COUNT(*) FROM chapter_pages x WHERE x.chapter_id = c.id AND x.font_size = ?) AS chapter_pages,
      (SELECT COUNT(*) FROM chapter_pages x JOIN chapters y ON y.id = x.chapter_id WHERE y.book_id = b.id AND x.font_size = ?) AS book_pages,
      (SELECT COUNT(*) FROM chapter_pages x JOIN chapters y ON y.id = x.chapter_id
       WHERE y.book_id = b.id AND y.sort_order < c.sort_order AND x.font_size = ?) AS pages_before
    FROM chapter_pages cp
    JOIN chapters c ON c.id = cp.chapter_id
    JOIN books b ON b.id = c.book_id
    WHERE b.id = ? AND b.status = 'published' AND c.id = ? AND cp.font_size = ? AND cp.page_number = ?
    LIMIT 1
  `).bind(fontSize, fontSize, fontSize, bookId, chapterId, fontSize, pageNumber).first();
  if (!row) return errorPage(404, "阅读页不存在", "小说、章节或页码不存在。", `<a href="/k/book/${escapeHtml(bookId)}">返回目录</a>`);
  await env.DB.prepare(`
    INSERT INTO reading_progress
      (id, user_id, book_id, chapter_id, page, font_size, last_read_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
    ON CONFLICT(user_id, book_id) DO UPDATE SET
      chapter_id = excluded.chapter_id, page = excluded.page, font_size = excluded.font_size,
      last_read_at = datetime('now'), updated_at = datetime('now')
  `).bind(crypto.randomUUID(), user.id, bookId, chapterId, pageNumber, fontSize).run();
  const prevPage = pageNumber > 1
    ? `/k/read/${bookId}/${chapterId}/${pageNumber - 1}`
    : await adjacentChapterUrl(env, bookId, Number(row.sort_order), -1, fontSize);
  const nextPage = pageNumber < Number(row.chapter_pages)
    ? `/k/read/${bookId}/${chapterId}/${pageNumber + 1}`
    : await adjacentChapterUrl(env, bookId, Number(row.sort_order), 1, fontSize);
  const progress = Math.min(100, Math.max(1, Math.round((Number(row.pages_before) + pageNumber) / Math.max(1, Number(row.book_pages)) * 100)));
  return htmlResponse(layout({
    title: `${row.book_title} · ${row.chapter_title}`,
    body: `<div class="current-user">当前使用者：${escapeHtml(user.display_name)}</div>
      <p class="muted">${escapeHtml(row.book_title)}</p>
      <h1>${escapeHtml(row.chapter_title)}</h1>
      <article style="font-family:Georgia,'Times New Roman',serif;font-size:${fontSize === "small" ? "28" : fontSize === "large" ? "36" : "32"}px;line-height:1.72">${novelParagraphs(row.body)}</article>
      <p class="muted">本章第 ${Number(row.page_number)} / ${Number(row.chapter_pages)} 页　全书约 ${progress}%</p>`,
    nav: `${prevPage ? `<a href="${escapeHtml(prevPage)}">上一页</a>` : "上一页"} | <a href="/k/book/${escapeHtml(bookId)}">目录</a> | ${nextPage ? `<a href="${escapeHtml(nextPage)}">下一页</a>` : "下一页"} | <a href="/k/home">个人主页</a> | <a href="/k/switch-user">切换使用者</a>`,
  }));
}

async function adjacentChapterUrl(env, bookId, sortOrder, direction, fontSize) {
  const op = direction > 0 ? ">" : "<";
  const order = direction > 0 ? "ASC" : "DESC";
  const chapter = await env.DB.prepare(`
    SELECT id FROM chapters WHERE book_id = ? AND sort_order ${op} ? ORDER BY sort_order ${order} LIMIT 1
  `).bind(bookId, sortOrder).first();
  if (!chapter) return null;
  if (direction > 0) return `/k/read/${bookId}/${chapter.id}/1`;
  const last = await env.DB.prepare(`
    SELECT MAX(page_number) AS n FROM chapter_pages WHERE chapter_id = ? AND font_size = ?
  `).bind(chapter.id, fontSize).first();
  return `/k/read/${bookId}/${chapter.id}/${Number(last?.n || 1)}`;
}

async function kindleWordsHome(env, user, session) {
  const plan = await env.DB.prepare(`
    SELECT * FROM study_plans WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1
  `).bind(user.id).first();
  const counts = await env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM questions WHERE verification_status = 'verified') AS verified_questions,
      (SELECT COUNT(*) FROM mistakes WHERE user_id = ? AND mastery_status != 'temporary_mastered') AS pending_mistakes,
      (SELECT COUNT(*) FROM attempts WHERE user_id = ? AND date(created_at, '+8 hours') = date('now', '+8 hours')) AS today_attempts,
      (SELECT SUM(is_correct) FROM attempts WHERE user_id = ? AND date(created_at, '+8 hours') = date('now', '+8 hours')) AS today_correct
  `).bind(user.id, user.id, user.id).first();
  const today = Number(counts?.today_attempts || 0);
  const correct = Number(counts?.today_correct || 0);
  return htmlResponse(layout({
    title: `${user.display_name}的英语学习`,
    body: `<div class="current-user">当前使用者：${escapeHtml(user.display_name)}</div>
      <h1>${escapeHtml(user.display_name)}的英语学习</h1>
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
    nav: '<a href="/k/home">个人主页</a> | <a href="/k/switch-user">切换使用者</a>',
  }));
}

async function startPractice(request, env, user, session) {
  const form = await request.formData();
  if (!safeEqual(String(form.get("csrf_token") || ""), session.csrf_token)) {
    return errorPage(403, "CSRF 校验失败", "表单已过期，请返回英语学习主页后重试。");
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
  let query;
  if (mode === "mistakes" || plan?.mistakes_only) {
    query = env.DB.prepare(`
      SELECT DISTINCT q.id
      FROM questions q
      JOIN mistakes m ON m.question_id = q.id
      WHERE q.verification_status = 'verified' AND m.user_id = ? AND m.mastery_status != 'temporary_mastered'
      ORDER BY m.last_wrong_at DESC, m.error_count DESC
      LIMIT ?
    `).bind(user.id, taskSize);
  } else {
    query = env.DB.prepare(`
      SELECT q.id
      FROM questions q
      WHERE q.verification_status = 'verified'
      ORDER BY
        CASE WHEN EXISTS (
          SELECT 1 FROM mistakes m
          WHERE m.user_id = ? AND m.question_id = q.id AND m.mastery_status != 'temporary_mastered'
        ) THEN 0 ELSE 1 END,
        random()
      LIMIT ?
    `).bind(user.id, taskSize);
  }
  const result = await query.all();
  const questions = result.results || [];
  if (!questions.length) {
    return errorPage(
      409,
      mode === "mistakes" ? "暂无待复习错题" : "暂无可用练习题",
      mode === "mistakes" ? "当前没有尚未掌握的错题。" : "请由家长在后台审核题目后再开始练习。",
      '<a href="/k/words">返回英语学习</a>',
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
  if (!context) return errorPage(404, "题目不存在", "练习会话、题号或当前使用者不匹配。", '<a href="/k/words">返回英语学习</a>');
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
  const options = context.options_json ? JSON.parse(context.options_json) : null;
  const secret = env.SESSION_SECRET;
  if (!secret) return errorPage(500, "系统设置未完成", "练习提交密钥尚未配置。");
  const submissionToken = await hmac(secret, `practice:${context.item_id}`);
  const input = Array.isArray(options) && options.length
    ? `<fieldset><legend>请选择答案</legend>${options.map((option, index) => `<label class="radio-line"><input type="radio" name="answer" value="${escapeHtml(option)}" ${index === 0 ? "required" : ""}> ${String.fromCharCode(65 + index)}. ${escapeHtml(option)}</label>`).join("")}</fieldset>`
    : `<label for="answer">请完整填写答案</label><input id="answer" name="answer" type="text" autocomplete="off" required>`;
  return htmlResponse(layout({
    title: `第 ${number} 题`,
    body: `<div class="current-user">当前使用者：${escapeHtml(user.display_name)}</div>
      <p class="muted">第 ${number} / ${Number(context.total_items)} 题</p>
      <h1>${escapeHtml(context.prompt)}</h1>
      <form method="post" action="/k/practice/${escapeHtml(practiceId)}/${number}">
        <input type="hidden" name="csrf_token" value="${escapeHtml(session.csrf_token)}">
        <input type="hidden" name="submission_token" value="${escapeHtml(submissionToken)}">
        ${input}
        <input type="submit" value="提交答案">
      </form>`,
    nav: '<a href="/k/words">退出练习</a> | <a href="/k/home">个人主页</a> | <a href="/k/switch-user">切换使用者</a>',
  }));
}

async function practiceResult(env, user, session, practiceId, number) {
  const context = await getPracticeContext(env, user, session, practiceId, number);
  if (!context) return errorPage(404, "答题结果不存在", "练习会话或题号不存在。", '<a href="/k/words">返回英语学习</a>');
  const attempt = await env.DB.prepare(`
    SELECT answer, is_correct FROM attempts WHERE session_item_id = ? AND user_id = ? LIMIT 1
  `).bind(context.item_id, user.id).first();
  if (!attempt) return redirect(`/k/practice/${encodeURIComponent(practiceId)}/${number}`);
  const final = number >= Number(context.total_items);
  return htmlResponse(layout({
    title: attempt.is_correct ? "回答正确" : "回答错误",
    body: `<div class="current-user">当前使用者：${escapeHtml(user.display_name)}</div>
      <h1>${attempt.is_correct ? "✓ 回答正确" : "✗ 回答错误"}</h1>
      <p>你的答案：${escapeHtml(attempt.answer)}</p>
      ${attempt.is_correct ? "" : `<p>正确答案：<strong>${escapeHtml(context.correct_answer)}</strong></p>`}
      <div class="card"><h2>解析</h2><p>${escapeHtml(context.explanation || "请记住正确表达。")}</p></div>
      ${final ? '<a class="button" href="/k/records">查看本次学习记录</a>' : `<a class="button" href="/k/practice/${escapeHtml(practiceId)}/${number + 1}">下一题</a>`}`,
    nav: '<a href="/k/words">英语学习主页</a> | <a href="/k/home">个人主页</a> | <a href="/k/switch-user">切换使用者</a>',
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
    nav: '<a href="/k/words">英语学习</a> | <a href="/k/home">个人主页</a> | <a href="/k/switch-user">切换使用者</a>',
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
    nav: '<a href="/k/mistakes">错题本</a> | <a href="/k/words">英语学习</a> | <a href="/k/home">个人主页</a> | <a href="/k/switch-user">切换使用者</a>',
  }));
}

async function routeAdmin(request, env, url) {
  if (url.pathname === "/admin/login" && ["GET", "POST"].includes(request.method)) return adminLogin(request, env, url);
  if (url.pathname === "/admin/logout" && request.method === "GET") return adminLogout();
  const admin = await requireAdmin(request, env);
  if (admin.response) return admin.response;
  const path = url.pathname;
  if (path === "/admin" && request.method === "GET") return adminDashboard(request, env, admin.identity);
  if (path === "/admin/users" && request.method === "GET") return adminUsers(env, admin.identity, url);
  if (path === "/admin/users/create" && request.method === "POST") return adminCreateUser(request, env);
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
  if (url.pathname === "/k/books" && request.method === "GET") return kindleBooks(env, user);
  const bookMatch = url.pathname.match(/^\/k\/book\/([^/]+)$/u);
  if (bookMatch && request.method === "GET") return kindleBookDetail(env, user, decodeURIComponent(bookMatch[1]));
  const readMatch = url.pathname.match(/^\/k\/read\/([^/]+)\/([^/]+)\/([0-9]+)$/u);
  if (readMatch && request.method === "GET") return kindleRead(env, user, session, decodeURIComponent(readMatch[1]), decodeURIComponent(readMatch[2]), Math.max(1, Number.parseInt(readMatch[3], 10)));
  if (url.pathname === "/k/words" && request.method === "GET") return kindleWordsHome(env, user, session);
  if (url.pathname === "/k/practice/start" && request.method === "POST") return startPractice(request, env, user, session);
  const practiceMatch = url.pathname.match(/^\/k\/practice\/([^/]+)\/([0-9]+)$/u);
  if (practiceMatch && ["GET", "POST"].includes(request.method)) {
    return practiceQuestion(request, env, user, session, decodeURIComponent(practiceMatch[1]), Math.max(1, Number.parseInt(practiceMatch[2], 10)));
  }
  const practiceResultMatch = url.pathname.match(/^\/k\/practice\/([^/]+)\/([0-9]+)\/result$/u);
  if (practiceResultMatch && request.method === "GET") {
    return practiceResult(env, user, session, decodeURIComponent(practiceResultMatch[1]), Math.max(1, Number.parseInt(practiceResultMatch[2], 10)));
  }
  if (url.pathname === "/k/mistakes" && request.method === "GET") return kindleMistakes(env, user);
  if (url.pathname === "/k/records" && request.method === "GET") return kindleRecords(env, user);
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

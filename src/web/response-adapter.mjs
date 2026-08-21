export const WEB_STYLESHEET_HREF = "/web.css?v=20260821-1";
export const WEB_SCRIPT_SRC = "/web-ui.js?v=20260821-1";

export function isWebUiPath(pathname) {
  return pathname === "/k" || pathname.startsWith("/k/")
    || pathname === "/parent" || pathname.startsWith("/parent/");
}

export function shouldAdaptWebResponse({ pathname, deviceType, contentType }) {
  return deviceType !== "kindle-eink"
    && isWebUiPath(pathname)
    && String(contentType || "").toLowerCase().includes("text/html");
}

class WebHtmlElementHandler {
  element(element) {
    const current = String(element.getAttribute("class") || "").trim();
    element.setAttribute("class", `${current ? `${current} ` : ""}web-client`);
  }
}

class WebHeadElementHandler {
  element(element) {
    element.append(`<link rel="stylesheet" href="${WEB_STYLESHEET_HREF}">`, { html: true });
    element.append(`<script src="${WEB_SCRIPT_SRC}" defer></script>`, { html: true });
  }
}

export function adaptResponseForWeb(request, response, deviceType, Rewriter = globalThis.HTMLRewriter) {
  const url = new URL(request.url);
  if (!shouldAdaptWebResponse({
    pathname: url.pathname,
    deviceType,
    contentType: response.headers.get("content-type"),
  })) return response;
  if (typeof Rewriter !== "function") throw new Error("HTMLRewriter is unavailable");
  return new Rewriter()
    .on("html", new WebHtmlElementHandler())
    .on("head", new WebHeadElementHandler())
    .transform(response);
}

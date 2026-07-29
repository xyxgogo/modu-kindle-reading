import assert from "node:assert/strict";

import application from "../worker/index.js";

assert.equal(
  typeof application?.fetch,
  "function",
  "worker/index.js 必须导出 default.fetch",
);

console.log("本地应用入口检查通过。");

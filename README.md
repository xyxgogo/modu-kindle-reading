# 墨读 v2

墨读是一套 Kindle 优先的家庭轻量学习与阅读产品。它让闲置 Kindle 重新成为安静、护眼的家庭阅读器和英语学习终端。

正式站点：[https://modu.1005205.xyz](https://modu.1005205.xyz)

## 产品能力

- Kindle 优先的服务端渲染页面，不依赖 SPA 或复杂 JavaScript。
- 双列家庭学习首页：阅读、单词、今日任务、最近记录。
- Kindle 风格双列书架、收藏、阅读进度和灰阶缩略封面。
- 接近一屏的分页阅读、自然段修复、四档字号、三档行距和大面积翻页按钮。
- 每个账户独立保存天气城市、阅读显示、学习计划与历史记录。
- 墨读核心 500 词、7 词微单元、7/14/21/28 学习量、初识/熟悉/掌握、动态复现与无复习债务。
- 家长绑定孩子、配置学习计划、发布读物；管理员审核并查看用户使用概况。

## 技术结构

- `worker/index.js`：Cloudflare Worker 入口、服务端页面、路由与会话。
- `drizzle/`：Cloudflare D1/SQLite 顺序增量迁移。
- `src/domain/`：平台无关的学习引擎与阅读文本整理。
- `src/platform/`：D1 仓储与 Kindle 封面缩略图处理。
- `runtime/`、`scripts/dev-server.mjs`：本地 SQLite 与 R2 文件模拟。
- `tests/`：学习引擎、迁移、阅读排版和封面回归测试。
- `local-data/`：本地数据库、上传文件和备份；不会提交 Git。

生产架构只面向 Cloudflare Workers + D1 + R2。历史 `netlify/` 与 `netlify.toml` 仅保留旧账户首次登录验证桥，不作为新功能目标，也不参与常规构建。

## 本地运行

要求 Node.js 22.5 或更高版本、pnpm。

```powershell
pnpm install
Copy-Item .env.example .env
pnpm run dev
```

本地入口：

- 产品：<http://localhost:8787/k>
- 管理员：<http://localhost:8787/admin>
- 设备检查：<http://localhost:8787/device-test>

`.env` 中仅设置本地所需的管理员账户或密钥，禁止提交生产密码、Token 或其他秘密。

## 检查与构建

```powershell
pnpm run check
pnpm run build
```

`pnpm run build` 只执行 Cloudflare Worker dry-run 构建，不会发布。

## 数据安全与部署

- 所有数据库升级必须通过 `drizzle/` 中新的向前兼容迁移完成。
- 禁止在生产数据库执行 `DROP TABLE`、重建数据库或覆盖旧数据。
- 正式部署前先检查 D1、导出备份、验证待应用 migration，再发布 Worker。
- 只有在明确收到部署指令后，才执行生产 migration 与 `wrangler deploy`。
- R2 中保留读物源文件和封面原图，Kindle 页面只读取经过压缩的灰阶 JPEG 缩略图。

## 作者说明

墨读是作者为自己和家人开发的自用项目，不保证永久在线或永久可用。项目会根据作者的时间、兴趣与心情维护；心情好时，会持续更新功能、修复问题并补充学习内容。

## License

项目代码使用 [MIT License](LICENSE)。词库数据的具体来源与许可说明见 `data/modu-core-lexicon/README.md`。

# 墨读 · Kindle 家庭阅读与英语学习站

这是从 ChatGPT Sites 项目完整拉取到本地的源码仓库，面向 Kindle Paperwhite 旧版浏览器。核心流程为服务器端多页面 HTML，不依赖 JavaScript；数据由 Cloudflare D1 保存，原始上传文件由 R2 保存。

## 在线入口

- Kindle：[https://modu-kindle-reading.netlify.app/k](https://modu-kindle-reading.netlify.app/k)
- 家长后台：[https://modu-kindle-reading.netlify.app/admin](https://modu-kindle-reading.netlify.app/admin)
- 设备测试：[https://modu-kindle-reading.netlify.app/device-test](https://modu-kindle-reading.netlify.app/device-test)
- Sites 主服务：[https://modu-kindle-reading.fangtuomashi990218.chatgpt.site](https://modu-kindle-reading.fangtuomashi990218.chatgpt.site)

Netlify 站点是面向用户的代理入口；完整应用、D1 数据库和 R2 文件仍运行在 Sites 主服务中。

## 本地查看与验证

要求 Node.js 18 或更高版本。仓库无第三方 npm 依赖。

```powershell
npm run dev
npm run build
npm run validate
```

本地开发地址默认为 `http://localhost:8787/k`。首次运行会在 `local-data/` 创建独立的 SQLite 数据库和本地 R2 文件目录，不会连接或修改线上生产数据。

构建会把 Worker 和 Sites 清单复制到 `dist/`，验证脚本会检查生成文件是有效 ESM，并确认导出了 `fetch` 处理器。完整本地运行仍需要 D1、R2 和 Sites 运行时绑定；仅克隆仓库不会复制生产密钥或远程存储。

## 主要目录

- `worker/index.js`：完整应用、页面、路由、会话、后台和业务逻辑
- `db/schema.ts`：数据库结构说明
- `drizzle/`：D1 建库和种子迁移
- `data/pep-new/`：PEP 教材目录、词汇、词组、拼读、语法及题库数据
- `.openai/hosting.json`：Sites 项目标识和 D1/R2 绑定
- `archive/chatgpt-share.html`：原始分享页快照
- `archive/conversation.json`：完整解码后的会话数据
- `archive/conversation.md`：按当前分支展开的可读会话
- `archive/live-data/`：迁移时从线上后台导出的目录、答题和使用者记录
- `docs/HANDOFF.md`：架构、部署与迁移交接说明

## 已实现功能

- Kindle 首次打开自动建立设备会话，输入昵称即可使用
- 小说上传、章节识别、服务器分页、书架与独立阅读进度
- 新版 PEP 教材结构、13 种题型、错题与掌握状态
- 家长端使用者、计划、知识库、报告、导入导出、设备和天气管理
- 昆明时间、自动天气与备用天气
- 多使用者数据隔离、普通 HTML 表单、Cookie 与 CSRF 防护

只允许 `verified` 内容进入正式练习；自动生成问题保持 `pending`，六年级下册仅保留未审核结构。

## 配置

环境变量模板见 `.env.example`。生产环境至少需要：

- `SESSION_SECRET`
- `CSRF_SECRET`
- `DEVICE_TOKEN_SECRET`
- 可选的 `WEATHER_API_BASE_URL` 和 `WEATHER_API_KEY`

生产密钥没有写入仓库。当前后台固定账号逻辑位于 `worker/index.js`；若仓库将对外公开，应先改为环境变量并轮换现有凭据。

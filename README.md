# 墨读 · Kindle 家庭阅读与单词学习站

墨读是面向 Kindle 旧版浏览器的家庭阅读与单词学习应用。页面由服务端生成，不依赖前端 JavaScript，兼顾墨水屏设备的操作与阅读体验。

正式站点：<https://modu-kindle-reading.netlify.app>

## 功能

- 孩子：注册后使用“阅读”和“单词”模块。
- 家长：申请并经管理员审核后，可发布读物、管理单词范围、绑定孩子或学生。
- 管理员：审核家长申请和读物上架，并管理考核内容。
- 阅读页：支持四档字体大小、分页阅读和 Kindle 友好的导航。
- 单词考核：采用选择类题型，不要求使用 Kindle 输入法作答。

家长与孩子/学生 ID 一旦绑定不可更改。孩子只能访问已绑定家长发布且经管理员审核通过的读物和考核内容。

## 技术结构

- Node.js 服务端渲染
- SQLite 数据库
- Netlify Functions
- Netlify Blobs 持久化数据库快照和上传文件

## 本地运行

需要 Node.js 22.5 或更高版本，以及 pnpm。

```powershell
pnpm install
Copy-Item .env.example .env
pnpm run dev
```

如需使用管理员后台，请在 `.env` 中设置 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD`。会话、CSRF 和设备密钥未设置时，本地服务器会在每次启动时生成临时随机值。



本项目使用 [MIT License](LICENSE)。

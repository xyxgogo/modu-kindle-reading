# 墨读项目迁移交接

## 迁移结果

本仓库在 2026-07-29 从 ChatGPT 分享对话和对应的 Sites 源码仓库恢复。源码保留了原 Sites Git 历史；当前工作分支为 `codex/import-chatgpt-share`，只读上游远程名为 `sites-origin`。

分享来源：<https://chatgpt.com/share/6a69bf94-13dc-83ec-9c81-2b73f4a17e48>

归档包括：

- 原始 HTML 分享页
- 解码后的完整会话 JSON（293 个节点）
- 包含用户、助手、工具调用及原页面中已脱敏输出的 Markdown 记录
- Sites 项目完整源码与 Git 历史
- 线上后台导出的内容目录、全部答题记录和逐用户记录

## 部署关系

### ChatGPT Sites 主服务

- 项目：`墨读 · Kindle 家庭阅读与英语学习站`
- Slug：`modu-kindle-reading`
- Project ID：`appgprj_6a6581ad53b88191bd5554b64bee66bd`
- 迁移时版本：5
- 地址：<https://modu-kindle-reading.fangtuomashi990218.chatgpt.site>
- 访问模式：public

Sites 承载 Worker、D1 数据库和 R2 文件，并且是实际业务后端。

### Netlify 用户入口

- 项目名：`modu-kindle-reading`
- Site ID：`c4548af9-9c9d-42c6-b934-97cd6aa4d4d7`
- 迁移时当前 Deploy ID：`6a6594ea2fb19f035bfe3bae`
- 状态：`ready`
- 地址：<https://modu-kindle-reading.netlify.app>

Netlify 部署由原对话中的 Netlify MCP 代理流程生成，不是第二套独立业务后端。昵称、阅读进度、题库和上传文件最终仍由 Sites 的 D1/R2 保存。

## 应用结构

`worker/index.js` 是单文件 Cloudflare Worker ESM 应用，包含：

- `/k` Kindle 入口和用户选择
- `/books`、`/read/...` 小说与阅读进度
- `/english`、`/practice/...` 英语学习与练习
- `/admin` 家长后台
- `/device-test` Kindle 兼容检测
- `/health` 健康检查

数据资源：

- D1 绑定名：`DB`
- R2 绑定名：`BUCKET`
- 数据库迁移：`drizzle/0000_initial.sql` 至 `0002_verified_question_types.sql`
- 生产密钥：只存放于托管环境，未导出到 Git

## 迁移时的数据快照

线上目录导出时间为 `2026-07-29T09:16:03Z`：

- 8 册教材记录
- 54 个单元
- 144 个词汇
- 57 个词组
- 44 个拼读点
- 6 个语法点
- 377 道问题（30 道人工核对，347 道待审核生成题）
- 2 本已发布小说目录记录
- 1 位使用者数据导出
- 2 条答题记录

文件位于 `archive/live-data/`。

## 未能从现有接口导出的内容

以下内容仍在线上资源中，不在源码仓库或后台批量导出结果内：

- R2 中的原始小说上传文件和历史导入文件正文
- D1 的逐表完整 SQL dump（后台只提供目录、答题和逐用户导出）
- Sites 与 Netlify 的生产密钥

这些限制来自现有产品的导出接口，而非本次迁移遗漏。继续开发源码不受影响；若要完全离线复刻生产数据，需要另行增加 D1 全库导出与 R2 管理员下载功能，或从托管平台取得数据库/对象存储备份权限。

## 安全提示

原需求把家长账号写成固定值，因此当前账号验证常量位于 `worker/index.js`。仓库若要推送到公开 Git 服务器，应先改为环境变量并轮换凭据。会话归档也含部署标识、邮箱和历史操作记录，建议保持私有。

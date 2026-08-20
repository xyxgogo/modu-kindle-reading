# 墨读 v2 现有项目审计

审计日期：2026-08-13  
审计范围：当前工作区中的墨读 v1、`modu-v2-upgrade-pack`、本地 SQLite 数据、Netlify 配置。

## 结论

墨读 v2 可以在现有项目上增量升级，不需要重建站点，也不需要替换现有用户或阅读数据。升级包的 D1/SQLite 迁移、500 词正式种子库和学习引擎 v1 与当前项目兼容；未发现阻断性问题。

本次升级继续使用现有 Web Standards `Request` / `Response` 应用入口，不引入新的整站框架。核心领域代码与数据库适配器分离，Cloudflare Workers + D1 作为优先目标，现有 Netlify Functions + SQLite/Blobs 保留为可运行备用方案，Postgres 通过独立适配器预留。

## 当前架构

- 应用主体：`worker/index.js`，服务端渲染 HTML，核心流程不依赖复杂 JavaScript。
- 本地运行：`scripts/dev-server.mjs` + Node SQLite，数据库接口模拟 D1 的 `prepare/bind/first/all/run/batch`。
- Netlify：`netlify/functions/app.mjs`，通过 Netlify Blobs 保存 SQLite 快照；`netlify.toml` 将请求转发到函数。
- 数据库迁移：`drizzle/0000` 至 `0003`，均为增量迁移，未发现 `DROP`、`TRUNCATE` 或覆盖旧表的逻辑。
- 当前 Git 状态：工作区存在上一轮开发遗留的未提交内容；后续不得使用 reset、checkout 等方式覆盖它们。

## 必须保留的现有能力

### 用户与权限

- `users.id` 为文本主键，是 v2 所有 `user_id` 的唯一权威来源。
- `accounts` 保存用户名、PBKDF2 密码摘要和 child/parent/admin 角色；不迁移明文密码。
- `account_sessions`、`device_sessions` 与现有 Cookie 会话继续有效。
- 现有家长申请、家长—孩子绑定、管理员审核和角色隔离必须保留。

现有 Cookie：

- `modu_account_session`
- `modu_device_session`
- `modu_admin_session`

### Kindle 与阅读

- Kindle 登录、注册、首页、书架、目录、分页阅读、字号设置、阅读进度和个人设置保留。
- 阅读进度继续写入 `reading_progress`，不移动、不重命名。
- 已审核读物、家长发布内容、孩子访问规则和家长端孩子总览保留。
- 首页逐步收敛为“单词 / 阅读”两个入口，但阅读路由和数据模型不改写。

主要路由：

- Kindle：`/k/login`、`/k/register`、`/k/home`、`/k/books`、`/k/book/:id`、`/k/read/:book/:chapter/:page`、`/k/settings`
- 旧单词：`/k/words`、`/k/practice/*`、`/k/mistakes`、`/k/records`
- 家长：`/parent/*`
- 管理员：`/admin/*`

## 当前数据基线

迁移前本地数据库的关键计数如下；它们作为回归测试基线，不代表需要公开或重新导入的数据。

| 数据 | 数量 |
| --- | ---: |
| 用户 / 账户 | 2 / 2 |
| 图书 / 章节 / 阅读页 | 2 / 12 / 120 |
| 阅读进度 | 1 |
| 用户设置 / 学习计划 | 2 / 2 |
| 旧词汇 / 词汇出现记录 | 144 / 145 |
| 旧题目 | 377 |
| 练习会话 / 会话题目 | 3 / 70 |
| 作答 / 错题 / 掌握记录 | 5 / 1 / 5 |

需要保护的旧表包括但不限于：`users`、`accounts`、`account_sessions`、`devices`、`device_sessions`、`books`、`chapters`、`chapter_pages`、`reading_progress`、`user_preferences`、`study_plans`、`vocabulary`、`questions`、`practice_sessions`、`attempts`、`mistakes`、`mastery_records`、家长绑定表和审核表。

## v2 兼容性检查

### 数据结构

升级包只新增 `modu_vocab_` 前缀表：来源、词条、词集、词集成员、例句、关系、字段证据、用户设置、学习会话、学习进度、学习事件和阅读曝光。它不会删除、改名或覆盖旧表。

新表的 `user_id` 使用文本类型，与现有 `users.id TEXT` 一致。为保持 D1/Postgres 可移植性和安全增量接入，第一阶段不对旧 `users` 表施加新的跨表外键。

### 正式种子库

- 正式词集 ID：`modu_core_500`
- 词条：500
- 例句：141
- 词间关系：38
- 词集顺序：1–500，连续且无重复
- 来源登记：8
- 缺失核心释义：0

升级包文件清单 SHA-256 校验全部通过。D1/SQLite schema 与种子已在空库通过烟雾测试。

### 旧库试迁移

在本地数据库的临时副本上连续执行两次 v2 schema 和种子迁移：

- 旧关键表计数全部不变；
- v2 得到 500 个词条与 500 个词集成员；
- 外键检查为 0 个错误；
- 第二次执行无重复数据，证明迁移可重入。

旧 `vocabulary` 与核心 500 仅有 40 个可按规范化 lemma 精确匹配。旧掌握度数据不能批量猜测迁移；后续只迁移有可靠映射的记录，其余旧记录继续只读保留。

### 学习引擎

学习引擎已验证：

- 每日学习量只接受 7 / 14 / 21 / 28；
- 按 7 词形成微单元；
- 初识、熟悉、掌握的门槛和跨日条件生效；
- 到期复现受每日上限约束，不产生“复习债务”；
- 复习压力高时自动减少新词；
- Kindle 核心学习可以使用 GET、POST 和服务端渲染完成。

## 部署与配置边界

- Netlify 现有方案可继续运行，第一阶段不会替换或断开它。
- 当前仓库没有正式 Cloudflare Wrangler 配置或 D1 数据库；它们将在部署阶段通过独立平台入口接入。
- 核心学习引擎不读取 `env`，数据库、会话和静态资源均通过平台适配层注入。
- 代码中只允许记录环境变量名称，不得把值写入仓库。现有敏感项包括会话、CSRF、设备令牌和管理员凭据。

## 风险与处理方式

1. 当前工作树较脏：先做数据库一致性备份，所有更改保持增量，禁止清理用户已有改动。
2. Netlify SQLite/Blobs 是单实例友好的既有实现，不作为 D1 的抽象基础；两者共享业务层和仓储契约。
3. 旧词汇模型和 v2 学习事件模型含义不同：不覆盖旧表，不把旧得分直接等同于 v2 掌握度。
4. 词库数据含 CC BY-SA 4.0 来源：代码仍可使用 MIT，但数据必须单独保留来源与署名说明。
5. Kindle 性能是发布门槛：无 JavaScript、低刷新、少输入、大字号和 7 词保存点都要进入手工验收。

## Phase 0 验收

- 已完成项目结构、路由、数据、身份体系、部署和升级包审计。
- 已建立旧数据计数基线。
- 已确认增量迁移可重复执行且不改变旧数据。
- 未发现需要推翻架构、付费服务或删除旧数据的问题。
- 允许进入 Phase 1：数据层与仓储契约。

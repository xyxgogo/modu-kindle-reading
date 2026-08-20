# 本地工作区规范

## 唯一工作区

项目源码、迁移、测试数据、需求归档和本地运行数据只保存在当前项目工作区内。

- 产品源码：`worker/`
- 运行适配器：`runtime/`
- 本地与发布脚本：`scripts/`
- SQLite 迁移：`drizzle/`
- 教材和题库源数据：`data/`
- 本地运行数据：`local-data/`（不提交）
- 原始需求与迁移归档：`archive/`

不从旧在线站点同步代码或数据，不推送远程代码仓库。`archive/` 和 `data/` 不参与 Netlify Function 打包。

## 本地命令

```powershell
pnpm run dev
pnpm run check
pnpm run build
```

本地入口为 <http://localhost:8787/k>。

## 发布边界

只有用户明确发出“发布到 Netlify”的指令后，才允许：

1. 检查并调整 `netlify.toml`；
2. 生成去除会话和设备令牌的发布种子；
3. 设置 Netlify 运行环境变量；
4. 执行预览发布、验证并覆盖正式站点。

发布必须以届时的工作区文件为唯一代码来源。生产密钥、会话、设备令牌和上传内容不得写入仓库。后续日常修改仍先在本地完成，只有再次收到发布指令后才能部署。

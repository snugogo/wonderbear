# Git 初始化 — wonderbear monorepo 首次 push

> 仓库:https://github.com/snugogo/wonderbear
> 结构:monorepo,`server-v7/` + 后续 `h5/` + `tv-html/` + `docs/` 平级

## 一次性初始化(只做一次)

在你本地解压 `wonderbear-server-v7-batch0.zip` 之后,**不要**直接进 `server-v7/` 跑 `git init`。
应该在 server-v7 的**父目录**初始化 monorepo:

```bash
# 创建 monorepo 根目录
mkdir -p ~/code/wonderbear
cd ~/code/wonderbear

# 把 server-v7 解压到这里
unzip ~/Downloads/wonderbear-server-v7-batch0.zip
# 现在结构:~/code/wonderbear/server-v7/

# 初始化 git
git init
git branch -M main

# 加一个 monorepo 顶层 .gitignore(覆盖所有子项目都该忽略的)
cat > .gitignore <<'EOF'
# OS / editor
.DS_Store
Thumbs.db
.idea/
.vscode/
*.swp

# 各子项目自己的 .gitignore 会处理 node_modules / .env 等
EOF

# 加一个顶层 README 占位
cat > README.md <<'EOF'
# WonderBear

AI 儿童故事投影仪。Monorepo 包含三条开发线 + 文档。

| 目录 | 内容 | 状态 |
|---|---|---|
| `server-v7/` | Node.js 服务端 (Fastify + Prisma + PG + Redis) | 批次 0 完成 |
| `h5/`        | 家长 Vue 3 + Vant 4 H5 | 待开工 |
| `tv-html/`   | TV 端 Vue 3(GP15 WebView) | 待开工 |
| `docs/`      | 跨窗口文档(API_CONTRACT 等) | — |

每个子项目有自己的 README、package.json、依赖和部署流程。
EOF

# 关联远端 + 首次 push
git remote add origin https://github.com/snugogo/wonderbear.git
git add .
git commit -m "chore: init monorepo with server-v7 batch 0"
git push -u origin main
```

## 验证 .env 没被推上去

push 完去 https://github.com/snugogo/wonderbear/tree/main/server-v7 看一眼,**确保没有 `.env` 文件**(应该只有 `.env.example`)。
`server-v7/.gitignore` 里已经写了 `.env` 排除,但 push 前自己肉眼确认一下更稳。

## 后续日常工作流

```bash
cd ~/code/wonderbear
# 改 server 代码
cd server-v7
# 编辑 ...
npm run smoke    # 本地验证
cd ..
git add server-v7/
git commit -m "feat(server): 批次 1 - 响应格式全局 hook"
git push
```

服务器上对应的拉取(假设服务器已 clone 到 `/srv/wonderbear`):

```bash
cd /srv/wonderbear
git pull
cd server-v7
npm install        # 如果 package.json 变了
npx prisma migrate deploy   # 如果有新 migration
pm2 reload wonderbear-server
```

## 推荐的 commit 消息前缀(按子项目区分)

```
feat(server): ...     # server-v7 改动
feat(h5): ...         # h5 改动
feat(tv): ...         # tv-html 改动
chore(docs): ...      # docs/ 改动
chore: ...            # monorepo 级别
```

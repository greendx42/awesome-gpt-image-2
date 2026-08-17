# IP 服务器部署 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 awesome-gpt-image-2 的可浏览图库前端部署到 `http://47.116.40.121/gpt-image-2/`，通过 IP 直接访问且不影响服务器现有服务。

**Architecture:** 在本地执行测试，并以 `/gpt-image-2/` 为 Vite base 生成生产构建；将 `dist` 上传到服务器版本化 release 目录，再用原子符号链接切换 `current`。由于阿里云安全组未开放 8088 且实例无安全组管理凭据，使用已开放的 80 端口，在现有默认站点中新增隔离的 `/gpt-image-2/` location；该前缀下未配置的 `/api` 明确返回 503。

**Tech Stack:** React 19、Vite 7、Nginx、OpenSSH、systemd。

## Global Constraints

- 目标服务器固定为 `47.116.40.121`，通过 IP 访问。
- 使用已开放的 `80` 端口和 `/gpt-image-2/` 路径，不覆盖现有 IP 首页、`/api`、443 或 8010 服务。
- 不向服务器写入生产密钥；本次仅部署无密钥的图库前端。
- 使用版本化 release 目录和 `current` 符号链接，保留上一版本以便回滚。
- 部署前后均验证 Nginx 配置与外网 HTTP 响应。

---

### Task 1: 本地验证并生成生产产物

**Files:**
- Read: `package.json`
- Read: `vite.config.js`
- Generated: `dist/`

**Interfaces:**
- Consumes: 仓库源码、`package-lock.json` 和现有 `node_modules`。
- Produces: 可由 Nginx 直接托管的 `dist/index.html` 与静态资源。

- [x] **Step 1: 运行 API 单元测试**

Run: `npm.cmd test`

Expected: Node test runner 退出码为 0，失败数为 0。

- [x] **Step 2: 生成生产构建**

Run: `npm.cmd run build -- --base=/gpt-image-2/`

Expected: Vite 构建退出码为 0，生成 `dist/index.html`。

- [x] **Step 3: 检查产物入口和大小**

Run: `Get-Item dist/index.html; (Get-ChildItem dist -Recurse -File | Measure-Object Length -Sum)`

Expected: `dist/index.html` 存在且产物总大小大于 0。

### Task 2: 上传子路径构建并配置 Nginx

**Files:**
- Create on server: `/opt/awesome-gpt-image-2/releases/<timestamp>/`
- Modify on server: `/etc/nginx/conf.d/ecommerce-bi-ip.conf`
- Create on server: `/opt/ecommerce-bi/dist/gpt-image-2` symlink
- Update on server: `/opt/awesome-gpt-image-2/current` symlink

**Interfaces:**
- Consumes: Task 1 生成的 `dist` 压缩包。
- Produces: Nginx 可通过现有 80 端口读取的隔离子路径。

- [x] **Step 1: 打包并上传生产产物**

Run: `tar -czf $env:TEMP/awesome-gpt-image-2-<timestamp>.tar.gz -C dist .`，随后通过 `scp` 上传到服务器 `/tmp/`。

Expected: 服务器临时压缩包存在且大小大于 0。

- [x] **Step 2: 创建 release 并原子切换 current**

Run: 在服务器创建 `/opt/awesome-gpt-image-2/releases/<timestamp>`，解压产物，设置目录为 `root:root`、目录权限 `755`、文件权限 `644`，再用 `ln -sfn` 更新 `current`。

Expected: `/opt/awesome-gpt-image-2/current/index.html` 存在，符号链接指向本次 release。

- [x] **Step 3: 向默认站点增加隔离路径**

```nginx
location = /gpt-image-2 {
    return 301 /gpt-image-2/;
}

location ^~ /gpt-image-2/api/ {
    default_type application/json;
    return 503 '{"error":"API_NOT_CONFIGURED"}';
}

location ^~ /gpt-image-2/ {
    try_files $uri $uri/ /gpt-image-2/index.html;
}
```

Expected: 原默认站点首页和 `/api` 配置保持不变，只新增 `/gpt-image-2` 三个 location；`/opt/ecommerce-bi/dist/gpt-image-2` 指向当前 release。

- [x] **Step 4: 校验并平滑加载 Nginx**

Run: `nginx -t && systemctl reload nginx`

Expected: `syntax is ok`、`test is successful`，Nginx 仍为 active。

### Task 3: 部署验收与文档同步

**Files:**
- Modify: `doc/项目纪要-Kami.md`
- Modify: `docs/superpowers/plans/2026-08-17-deploy-ip-server.md`

**Interfaces:**
- Consumes: Task 2 的 Nginx 服务。
- Produces: 可复核的部署地址、HTTP 证据和回滚位置。

- [x] **Step 1: 验证服务器本机响应**

Run: `curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1/gpt-image-2/`

Expected: `200`。

- [x] **Step 2: 验证外网 IP 响应和页面标题**

Run: `Invoke-WebRequest http://47.116.40.121/gpt-image-2/`

Expected: HTTP 200，HTML 包含 `<title>GPT-Image2 Prompt Gallery</title>`。

- [x] **Step 3: 验证 SPA 与 API 失败边界**

Run: 请求 `/gpt-image-2/community` 和 `/gpt-image-2/api/me`。

Expected: `/gpt-image-2/community` 返回 200；`/gpt-image-2/api/me` 返回 503 和 `API_NOT_CONFIGURED`。

- [ ] **Step 3a: 验证子路径运行时资源与原站隔离**

Run: 请求 `/gpt-image-2/cases.json` 与 `/gpt-image-2/style-library.json`，检查响应 `Content-Type` 为 JSON；在浏览器检查案例和模板图片请求均以 `/gpt-image-2/images/` 为前缀；访问 `/gpt-image-2/community` 并确认页面实际进入社区路由；再请求 IP 根首页。

Expected: 两份 JSON 均以 JSON Content-Type 返回，图片不落到 `/images/*` 根路径，社区页面不会被图库路由接管，IP 根首页仍显示原电商 BI 站点。

- [x] **Step 4: 更新纪要并提交文档**

Run: 将部署时间、端口、release 路径、验证结果和 API 限制写入项目纪要，执行 `git diff --check` 后仅提交相关文档。

Expected: 工作区无未提交的本轮文档改动；若远端推送受权限或网络限制，保留本地提交并报告。

## Self-Review

- Spec coverage: 覆盖指定 IP、使用已开放 80 端口、IP 子路径直访、既有服务隔离、构建、部署、验证与回滚。
- Placeholder scan: 无 `TBD`、`TODO` 或未定义步骤。
- Interface consistency: `dist` → release → `current` → Nginx `root` 路径一致。

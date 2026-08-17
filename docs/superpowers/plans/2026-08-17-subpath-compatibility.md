# 子路径兼容修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让图库前端在 `/` 与 `/gpt-image-2/` 部署下都使用正确的静态资源、API 和页面路由，并将修复后的构建重新部署到 `47.116.40.121`。

**Architecture:** 新增纯函数模块集中处理 Vite base URL 的拼接与 pathname 去前缀，`main.jsx` 和 `community.jsx` 不再直接构造根路径 URL。用 Node 原生测试覆盖路径规则，再以版本化 release 原子切换生产静态文件，保留现有 Nginx 隔离规则和旧 release。

**Tech Stack:** React 19、Vite 7、Node.js test runner、Nginx、OpenSSH。

## Global Constraints

- 同一份代码必须兼容站点根路径 `/` 与子路径 `/gpt-image-2/`。
- 外部 `http:`、`https:`、`blob:` 和 `data:` URL 必须保持不变。
- IP 静态部署不启用生产 API、Supabase、支付宝或图片生成能力。
- 不修改现有电商站点的根路径资源、API、443 或 8010 服务。
- 使用版本化 release 和原子符号链接，部署前执行 `nginx -t`，部署后验证原 IP 首页。

---

### Task 1: 基础路径纯函数与回归测试

**Files:**
- Create: `src/base-path.test.js`
- Create: `src/base-path.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: Vite 注入的 `import.meta.env.BASE_URL`，或测试显式传入的 base URL。
- Produces: `withBasePath(path, baseUrl)` 和 `stripBasePath(pathname, baseUrl)` 两个纯函数。

- [x] **Step 1: 写失败测试并纳入默认测试命令**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { stripBasePath, withBasePath } from './base-path.js';

test('withBasePath keeps root deployment paths unchanged', () => {
  assert.equal(withBasePath('/cases.json', '/'), '/cases.json');
});

test('withBasePath prefixes subpath deployment URLs', () => {
  assert.equal(withBasePath('/cases.json', '/gpt-image-2/'), '/gpt-image-2/cases.json');
  assert.equal(withBasePath('/api/me?fresh=1', '/gpt-image-2/'), '/gpt-image-2/api/me?fresh=1');
});

test('withBasePath keeps external and browser URLs unchanged', () => {
  for (const url of ['https://example.com/a', 'http://example.com/a', 'blob:test', 'data:image/png;base64,AA']) {
    assert.equal(withBasePath(url, '/gpt-image-2/'), url);
  }
});

test('stripBasePath exposes app-relative routes', () => {
  assert.equal(stripBasePath('/gpt-image-2/community/result', '/gpt-image-2/'), '/community/result');
  assert.equal(stripBasePath('/community', '/'), '/community');
});
```

将 `package.json` 的测试脚本改为：

```json
"test": "node --test api/_lib/*.test.js src/*.test.js"
```

- [x] **Step 2: 运行测试并确认 RED**

Run: `npm.cmd test`

Expected: 因 `src/base-path.js` 不存在而失败，错误包含 `ERR_MODULE_NOT_FOUND`。

- [x] **Step 3: 实现最小路径模块**

```js
const PASSTHROUGH_PROTOCOL = /^(?:https?:|blob:|data:)/i;

function normalizeBase(baseUrl) {
  const base = `/${String(baseUrl || '/').replace(/^\/+|\/+$/g, '')}`;
  return base === '/' ? '/' : `${base}/`;
}

export function withBasePath(path, baseUrl = import.meta.env.BASE_URL) {
  if (!path || PASSTHROUGH_PROTOCOL.test(path)) return path;
  const base = normalizeBase(baseUrl);
  return base === '/' ? `/${path.replace(/^\/+/, '')}` : `${base}${path.replace(/^\/+/, '')}`;
}

export function stripBasePath(pathname, baseUrl = import.meta.env.BASE_URL) {
  const base = normalizeBase(baseUrl);
  if (base === '/') return pathname || '/';
  const prefix = base.slice(0, -1);
  if (pathname === prefix) return '/';
  return pathname?.startsWith(`${prefix}/`) ? pathname.slice(prefix.length) : pathname;
}
```

- [x] **Step 4: 运行完整测试并确认 GREEN**

Run: `npm.cmd test`

Expected: 基础路径测试与现有 API 测试全部通过，失败数为 0。

- [x] **Step 5: 提交基础路径模块**

```powershell
git add -- package.json src/base-path.js src/base-path.test.js
git commit -m "新增子路径基础路径工具"
git push
```

### Task 2: 迁移前端运行时路径并同步产品文档

**Files:**
- Modify: `src/main.jsx`
- Modify: `src/community.jsx`
- Modify: `docs/paid-community.md`
- Modify: `docs/superpowers/plans/2026-08-17-deploy-ip-server.md`

**Interfaces:**
- Consumes: Task 1 的 `withBasePath()` 和 `stripBasePath()`。
- Produces: 不会逃逸到 IP 根站点的静态数据、图片、API 和社区页面请求。

- [x] **Step 1: 写源码约束测试并确认 RED**

在 `src/base-path.test.js` 增加读取 `main.jsx` 与 `community.jsx` 的测试，要求两文件不存在运行时 `fetch('/`，并要求社区 href 通过 `withBasePath('/community')` 生成：

```js
import { readFile } from 'node:fs/promises';

test('runtime requests and community links use the base path helper', async () => {
  const main = await readFile(new URL('./main.jsx', import.meta.url), 'utf8');
  const community = await readFile(new URL('./community.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /fetch\(\s*[`'"]\/api\//);
  assert.doesNotMatch(main, /fetch\(\s*['"]\/(?:cases|style-library)\.json/);
  assert.doesNotMatch(community, /fetch\(\s*[`'"]\/api\//);
  assert.match(main, /withBasePath\(['"]\/community['"]\)/);
  assert.match(community, /withBasePath\(['"]\/community['"]\)/);
});
```

Run: `node --test src/base-path.test.js`

Expected: FAIL，输出指出现有根路径请求或社区链接仍存在。

- [x] **Step 2: 迁移 `src/main.jsx`**

- 导入 `withBasePath` 与 `stripBasePath`。
- 将 `/cases.json`、`/style-library.json` 和全部 `/api/*` 请求传入 `withBasePath()`。
- 将社区 href 改为 `withBasePath('/community')`。
- 对加载后的 case 图片和站内二维码路径使用 `withBasePath()`，外部 URL 由纯函数原样返回。
- 将路由判断输入改为 `stripBasePath(window.location.pathname)`。

- [x] **Step 3: 迁移 `src/community.jsx`**

- 导入 `withBasePath` 与 `stripBasePath`。
- 将全部社区和管理员 `/api/*` 请求传入 `withBasePath()`。
- 将品牌链接改为 `withBasePath('/community')`。
- 将结果页判断改为对 `stripBasePath(window.location.pathname)` 的结果判断。

- [x] **Step 4: 同步文档**

在 `docs/paid-community.md` 说明页面与 API 路径通过 Vite base 派生；在原部署计划的验收部分补充 JSON Content-Type、图片前缀、社区实际路由识别与原首页回归检查。

- [x] **Step 5: 验证源码、测试和构建**

Run:

```powershell
npm.cmd test
rg -n "fetch\(\s*['\"`]\/|href=\"/community\"" src
npm.cmd run build -- --base=/gpt-image-2/
```

Expected: 测试失败数为 0；扫描无未处理的运行时根路径；构建退出码为 0。

- [x] **Step 6: 提交前端与文档同步**

```powershell
git add -- src/main.jsx src/community.jsx src/base-path.test.js docs/paid-community.md docs/superpowers/plans/2026-08-17-deploy-ip-server.md
git commit -m "修复前端子路径运行时地址"
git push
```

### Task 3: 版本化重新部署与公网验收

**Files:**
- Generated: `dist/`
- Create on server: `/opt/awesome-gpt-image-2/releases/<timestamp>/`
- Update on server: `/opt/awesome-gpt-image-2/current`
- Modify: `doc/项目纪要-Kami.md`
- Modify: `docs/superpowers/plans/2026-08-17-deploy-ip-server.md`

**Interfaces:**
- Consumes: Task 2 通过测试的 `/gpt-image-2/` 生产构建。
- Produces: 公网可访问的新 release 与可复核的验收记录。

- [x] **Step 1: 打包并上传构建产物**

使用 `yyyyMMdd-HHmm` 生成 release ID，在本地临时目录创建 tar.gz，通过现有 SSH 密钥上传到服务器 `/tmp/awesome-gpt-image-2-<release>.tar.gz`。

Expected: 服务器压缩包存在且大小大于 0。

- [x] **Step 2: 创建 release 并执行切换前检查**

在 `/opt/awesome-gpt-image-2/releases/<release>` 解压，设置 `root:root`、目录 `755`、文件 `644`。执行 `nginx -t`，只有成功后才用 `ln -sfn` 更新 `current`。

Expected: Nginx 输出 `syntax is ok` 和 `test is successful`；新 release 的 `index.html` 存在。

- [x] **Step 3: 原子切换并验证服务**

更新 `current` 后无需修改 Nginx location；确认 `/opt/ecommerce-bi/dist/gpt-image-2` 仍指向 `current`，并验证 Nginx active。

- [x] **Step 4: 执行公网回归验收**

验证以下结果：

```text
/gpt-image-2/                         200 text/html，DOM 出现图库卡片
/gpt-image-2/cases.json              200 application/json
/gpt-image-2/style-library.json      200 application/json
/gpt-image-2/images/<实际图片>       200 image/*
/gpt-image-2/community               200 text/html，前端识别社区页面
/gpt-image-2/api/me                  503 application/json API_NOT_CONFIGURED
/                                     200，仍为电商 BI 首页
```

同时检查 Nginx access log，新的浏览器会话不得请求根路径 `/cases.json`、`/style-library.json`、`/images/*` 或 `/api/me`。

- [x] **Step 5: 更新部署文档与纪要**

在部署计划和项目纪要写入 release ID、提交号、测试数量、构建结果、公网响应、旧 release 回滚位置和文档同步状态。

- [x] **Step 6: 提交并推送验收记录**

```powershell
git add -- doc/项目纪要-Kami.md docs/superpowers/plans/2026-08-17-deploy-ip-server.md
git commit -m "记录子路径修复重新部署结果"
git push
```

## Self-Review

- Spec coverage: Task 1 覆盖根路径/子路径/外部 URL/路由纯函数；Task 2 覆盖静态数据、图片、API、导航、路由与文档；Task 3 覆盖版本化部署、API 隔离、浏览器资源与原站点回归。
- Placeholder scan: 无未定义步骤或延后实现项。
- Interface consistency: Task 1 输出的 `withBasePath`、`stripBasePath` 名称与 Task 2 的导入及测试一致；Task 2 的 `dist` 是 Task 3 唯一部署输入。

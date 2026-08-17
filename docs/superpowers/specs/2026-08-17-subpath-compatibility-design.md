# `/gpt-image-2/` 子路径兼容设计

## 目标

让同一份前端代码同时支持站点根路径 `/` 与 Vite 配置的子路径 `/gpt-image-2/`。部署到 `http://47.116.40.121/gpt-image-2/` 后，图库数据、图片、社区路由和 API 请求都必须留在该前缀内，不能落到现有电商站点的根路径。

## 当前问题

Vite 的构建参数 `--base=/gpt-image-2/` 只自动改写入口 JS/CSS。运行时代码仍直接使用 `/cases.json`、`/style-library.json`、`/images/*`、`/api/*` 和 `/community`。浏览器因此请求 IP 根路径；其中数据请求得到电商站点的 HTML，前端按 JSON 解析后初始化失败。

## 方案

新增一个无框架依赖的基础路径模块，集中提供以下能力：

- 将站内绝对路径拼接到 `import.meta.env.BASE_URL`，并规范化重复斜杠。
- 从 `window.location.pathname` 中移除部署前缀，以便现有路由继续按 `/community` 和 `/community/result` 判断。
- 保持 `http:`、`https:`、`blob:`、`data:` 等外部或浏览器生成 URL 不变。
- 根路径部署时保持原有 `/cases.json`、`/api/*` 和 `/community` 行为。

`src/main.jsx` 与 `src/community.jsx` 只通过该模块生成站内运行时 URL。加载图库 JSON 后，对数据中的站内图片路径执行同一转换；所有社区、认证、收藏、计费、生成图片和管理 API 请求也使用该转换。

## 数据流

```text
Vite BASE_URL (/ 或 /gpt-image-2/)
        │
        ▼
基础路径模块
  ├─ 静态数据与图片 URL
  ├─ API URL
  ├─ 页面导航 URL
  └─ pathname 去前缀后的路由判断
```

在 IP 静态部署中，`/gpt-image-2/api/*` 仍由 Nginx 明确返回 `503 API_NOT_CONFIGURED`。本次修复不配置密钥、不伪造后端能力，只保证请求不会误入原电商站点的 `/api/*`。

## 文件影响

- 新增 `src/base-path.js`：基础路径拼接、去前缀与数据资源 URL 转换。
- 新增 `src/base-path.test.js`：覆盖根路径、子路径、查询参数、外部 URL 和路由去前缀。
- 修改 `src/main.jsx`：替换根路径静态数据、图片、API、社区导航及路由判断。
- 修改 `src/community.jsx`：替换社区页面的 API、导航及结果页判断。
- 修改 `package.json`：把基础路径测试纳入默认测试命令。
- 更新 `docs/paid-community.md`：说明页面和 API 路径遵循 Vite base。
- 更新 `docs/superpowers/plans/2026-08-17-deploy-ip-server.md`：补充子路径运行时验收。

## 测试与验收

1. 先写基础路径单元测试并确认在模块不存在时失败。
2. 实现最小模块并确认新增测试与现有 API 测试全部通过。
3. 以 `/gpt-image-2/` 构建，检查产物不再包含会落到根站点的数据与导航请求。
4. 部署新的版本化 release，原子切换 `current`。
5. 公网验证：
   - `/gpt-image-2/` 可见图库内容，不是空白页。
   - `/gpt-image-2/cases.json` 与 `/gpt-image-2/style-library.json` 返回 JSON。
   - 页面图片从 `/gpt-image-2/images/*` 加载。
   - 社区入口指向 `/gpt-image-2/community`，该页面能被正确识别。
   - API 请求只进入 `/gpt-image-2/api/*` 并得到预期的 `503 API_NOT_CONFIGURED`。
   - IP 根首页仍为原电商站点。

## 风险与缓解

- 遗漏某个硬编码根路径会造成局部功能继续跨站。缓解：源码扫描全部 `fetch('/`、`href="/` 和数据图片路径，并在构建后检查产物及浏览器资源列表。
- 基础路径拼接若处理查询参数或尾斜杠错误，会形成双斜杠或错误路由。缓解：用纯函数单元测试覆盖 `/`、`/gpt-image-2/`、查询参数和结果页。
- 生产切换可能影响现有 Nginx 服务。缓解：不改既有根站点 location；部署前执行 `nginx -t`，使用版本化 release 和原子符号链接，并在切换后验证原首页。

## 非目标

- 不启用生产 API、Supabase、支付宝或图片生成能力。
- 不修改现有电商站点的根路径资源和 API。
- 不开放新的阿里云安全组端口。

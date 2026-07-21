# 仓库指南

## 项目结构与模块组织

- `src/widgets/` 存放可编辑的 Scriptable 组件入口，文件使用 `work-helper.js` 这类 kebab-case 命名。
- `src/lib/` 存放构建期共享模块，包括统一自动更新器。
- `dist/` 存放供 Scriptable 安装及 GitHub Raw 分发的独立产物。不要手动编辑。
- `scripts/build.mjs` 维护组件入口、元数据和版本；`scripts/test-updater.mjs` 使用 Scriptable API mock 验证更新、备份与覆盖流程。
- `image/` 存放静态资源，`.github/workflows/build.yml` 负责 CI 构建校验。

## 构建、测试与开发命令

使用 Node.js 22 或更高版本。

```powershell
npm ci                 # 按 lockfile 安装依赖
npm run build          # 将 src/widgets 打包为 dist 单文件
npm run test:updater   # 运行更新器模拟测试
npm run check          # 测试、重新构建并检查全部产物语法
```

修改组件、共享模块、元数据或版本后，必须执行 `npm run check`，并提交对应的 `dist/` 变更。CI 会拒绝过期的生成产物。

## 编码风格与命名约定

JavaScript 目标为 ES2022。新增代码使用两空格缩进、分号、单引号，优先使用 `const`，变量和函数采用 `camelCase`。明确使用 `ListWidget`、`Request`、`Keychain` 等 Scriptable 全局 API。重复的运行逻辑应提取到小型共享模块。

组件 ID、源码文件名及 `scripts/build.mjs` 中的条目必须一致，并采用 kebab-case。分发脚本发生变化时，递增对应的语义化版本。

## 测试要求

本项目没有浏览器测试框架；测试使用 Node.js 内置断言和 Scriptable API mock。共享基础设施应添加聚焦的 `scripts/test-*.mjs` 测试。组件界面变化需在 Scriptable 中运行生成产物，并检查所有支持的组件尺寸。验证说明中应包含 `npm run check`。

## 提交与 Pull Request 规范

提交遵循带 emoji 的 Conventional Commits，例如 `feat: 🎸 添加组件更新检查` 或 `fix(updater): 🐛 修复 iCloud 文件定位`。

Pull Request 应说明行为变化、列出验证命令；可见界面变更需附截图。源码与生成产物必须一并提交。有对应 issue 时应关联，并将无关重构拆分处理。

## 安全与配置

禁止提交 Admin Token、路由器凭据、私有地址或缓存文件。敏感信息必须通过 Scriptable `Keychain` 保存，确保 `dist/` 产物可以安全公开。

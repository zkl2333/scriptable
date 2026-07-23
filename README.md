# Scriptable Widgets

[![Build](https://github.com/zkl2333/scriptable/actions/workflows/build.yml/badge.svg)](https://github.com/zkl2333/scriptable/actions/workflows/build.yml)

一组为 iPhone 与 iPad 主屏幕设计的 [Scriptable](https://scriptable.app/) 小组件：把常用状态、时间进度、工作安排和轻量提醒放到抬眼就能看到的地方。每个脚本都是可独立安装的单文件，首次安装后可从 GitHub 自动更新。

## 组件

| 组件 | 适用场景 | 支持尺寸 |
| --- | --- | --- |
| [`xlyra.js`](./dist/xlyra.js) | xLyra AI 网关看板：请求、成本、站点健康、Key、模型 TOP 3 与 Codex OAuth 配额；首次运行需配置 Admin Token | 小 / 中 / 大 / 锁屏 |
| [`ikuai.js`](./dist/ikuai.js) | iKuai 软路由状态：在线设备与实时流量 | 小 / 中 / 大 / 锁屏 |
| [`work-helper.js`](./dist/work-helper.js) | 工作日历：上下班倒计时、工作进度与下一假期 | 小 / 中 / 大 / 锁屏 |
| [`time-progress.js`](./dist/time-progress.js) | 时间进度：今日、本周、本月与今年的可视化进度 | 小 / 中 / 大 / 锁屏 |
| [`today-dashboard.js`](./dist/today-dashboard.js) | 今日面板：聚合今日日程、到期提醒与下一项安排；首次运行需授权日历和提醒事项 | 小 / 中 / 大 / 锁屏 |
| [`hitokoto.js`](./dist/hitokoto.js) | 一言：每日一句，失败时仍有本地文案兜底 | 小 / 中 / 大 / 锁屏 |
| [`milk-tea-reminder.js`](./dist/milk-tea-reminder.js) | 奶茶提醒：按时段变化的轻量提醒，可在 App 内发送通知 | 小 / 中 / 大 / 锁屏 |

> 锁屏组件包含行内、圆形和矩形三种样式；具体展示内容会随尺寸自动调整。

## 安装

1. 在 iPhone 或 iPad 安装 [Scriptable](https://apps.apple.com/app/scriptable/id1405459188)。
2. 打开所需组件的 [`dist/`](./dist) 文件，将全部内容复制到 Scriptable 新建脚本中；脚本名建议与文件名一致。
3. 在 Scriptable 中运行一次。需要凭证的组件会引导完成配置。
4. 长按主屏幕，添加 Scriptable 小组件，在 **Edit Widget** 中选择对应脚本。

首次安装必须手动完成；此后组件会每 24 小时检查 GitHub Raw 上的新版。也可以在 Scriptable App 内运行脚本，使用菜单预览尺寸、检查更新，或进入该组件的配置操作。

## 设计与安全

- 所有发布脚本均为单文件，不依赖运行时 `import`，可直接在 Scriptable 使用。
- 组件提供深浅色适配，并支持主屏幕和锁屏组件尺寸。
- iKuai 与 xLyra 等敏感配置保存于 iOS Keychain，不会写入仓库或随脚本源码公开；xLyra 仅在凭证验证成功后保存配置。
- 更新前会将当前脚本备份到 Scriptable 本地 Library；网络或更新异常不会影响已有组件运行。

## 开发

需要 Node.js 22 或更高版本。

### 浏览器预览

[在线预览全部组件](https://zkl2333.github.io/scriptable/preview/)

![Scriptable 组件总览](./image/preview/overview.png)

本地运行 `npm run preview`，再访问 `http://127.0.0.1:4175`。页面支持总览与单组件模式、7 种主屏及锁屏尺寸和明暗外观。`preview/core.js` 是不依赖页面 DOM 和具体组件的独立预览核心；`preview/runtime.js` 提供浏览器版 Scriptable API，直接执行 `dist/*.js` 并把真实 `ListWidget` 树转换成 DOM。`preview/widgets.js` 只保留组件目录元数据，不再重复维护组件布局。

```powershell
npm ci
npm run check
npm run preview
npm run dev:web
```

- `src/widgets/`：组件入口。
- `src/lib/`：自动更新器与 App 内菜单等共享模块。
- `dist/`：可直接安装的生成产物，提交时必须与源码一并更新。
- `preview/`：直接执行 `dist/*.js` 的完整组件预览页，核心与浏览器运行时相互独立。
- `web/`：独立构建的浏览器预览器；产物位于被忽略的 `web/.preview-assets/`，不会进入 `dist/`。
- [`docs/web-widget-preview-plan.md`](./docs/web-widget-preview-plan.md)：Scriptable Web 小组件布局与预览实施计划。

`npm run dev:web` 会启动本地工作台，默认使用 `http://localhost:4173`（端口被占用时顺延）。目前它用于验证 Scriptable 布局 API、Canvas 输出和六种 family；真实组件源码的受限 bundle 与业务 fixture 尚未接入。

`npm run check` 会执行更新器、菜单和 Web 运行时测试，构建 Web 预览器、重新构建全部组件，并校验生成脚本语法。GitHub Actions 也会验证 `dist/` 是否仍与源码一致。

## 贡献

欢迎提交 issue 或 Pull Request。修改组件、共享模块、元数据或版本后，请执行 `npm run check` 并提交相应的 `dist/` 文件；请勿提交 Token、路由器凭证、私有地址或缓存数据。

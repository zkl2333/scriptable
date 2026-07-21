# Scriptable Widgets

我自用的 [Scriptable](https://scriptable.app/) 桌面小组件脚本集合。

| 脚本 | 用途 |
| --- | --- |
| [`xlyra.js`](./dist/xlyra.js) | xLyra AI 网关看板(Admin Token:请求/成本/站点健康/Key/模型 TOP3) |
| [`ikuai.js`](./dist/ikuai.js) | iKuai 软路由状态(在线设备、流量) |
| [`time-progress.js`](./dist/time-progress.js) | 今日时间进度条 |
| [`work-helper.js`](./dist/work-helper.js) | 工作日历助手(上下班与下一假期倒计时) |
| [`hitokoto.js`](./dist/hitokoto.js) | 一言(每日一句) |
| [`milk-tea-reminder.js`](./dist/milk-tea-reminder.js) | 提醒喝奶茶小助手 |

---

## xlyra.js

xLyra 桌面看板(**Admin Token 版**),风格为「彭博终端 × 点阵 LED × 粗野主义」:点阵网格底纹、四角刻度线、LED 点阵发光大数字(5×7 自绘字库,灭灯位保留暗点)、`SITES // 站点健康` 式双语标题、直角硬边框,深浅色自适应。
支持 **Small / Medium / Large** 三种尺寸,内容自适应:没有 Codex OAuth 账号就完全不显示 OAuth 区块。

数据来源(均需 `xlyra-admin-…` 前缀的 Admin Token):

`dashboard/epaper-summary` · `health/sites` · `api-keys` · `requests`(今日失败数) · `dashboard/usage`(按站点今日成本)

### 展示内容

| 尺寸 | 内容 |
| --- | --- |
| Small  | 品牌行 `XLYRA // 控制台` · LED 点阵今日费用 · 累计费用/今日 tokens · 请求数 · 成功率 · 站点健康 · Key 数 · TOP1 模型成本 |
| Medium | 左列:品牌行 + LED 点阵今日费用 + 累计/今日 tokens;右列 2×2 指标格:请求 · 成功率 · 站点 · KEY |
| Large  | 品牌行 + 状态芯片(站点/KEY/RPM)· LED 点阵今日费用 + 累计注记<br>4 指标格:请求 · 成功率 · RPM · TPM<br>`SITES // 站点健康`(在线/停用/离线 + 延迟 + 今日成本)<br>`COST TOP3 // 今日模型`<br>`OAUTH // 账号`(仅当存在 Codex OAuth 账号:5h/周剩余额度 + 重置时间) |

自适应规则:Codex OAuth 账号数为 0 时,OAuth 区块整体不渲染;无站点健康数据或无模型成本时,对应区块同样隐藏。

> 数据层已实测对齐 xLyra(2026-07):`epaper-summary` 为扁平结构(`kpis.*` / `model_top3_today` / `codex_quota`),成功率 = 今日成功 ÷ (成功+失败),失败数单独查 `requests?success=false`;usage 失败不影响核心数据渲染。

### 安装与配置

1. 将 `dist/xlyra.js` 复制到 iCloud Drive 的 `Scriptable/` 目录(或在 Scriptable App 内新建脚本粘贴内容)。
2. 在 Scriptable App 内**运行一次**脚本:依次输入后端地址(如 `https://ai-api.example.com`)和 Admin Token,脚本会发起一次真实请求验证,验证通过才写入 iOS Keychain。
3. 在桌面添加 Scriptable 小组件,长按选择 **Edit Widget**,**Script** 选 `xlyra` 即可,无需填 Parameter。
4. 之后**在 App 内运行脚本会弹出菜单**:预览组件 / 重新配置凭证 / 检查更新;桌面组件后台刷新只渲染,不弹菜单。

> Admin Token 在 xLyra 控制台的 **个人资料 → Access Token** 中创建。

### 自动更新

`dist/` 中的全部组件都内置同一套自动更新逻辑:

1. 每 24 小时从 GitHub Raw 检查对应的 `dist/*.js`。
2. 校验 `@script-id` 和 `@version` 后覆盖当前脚本,新版本在下次刷新时生效。
3. 更新前会在本地 Library 的 `widget-update-backups/` 保存最近一份备份。
4. 网络或更新失败不会影响组件继续使用当前版本。
5. xLyra 仍可在 App 内通过「检查更新」手动检查。

- 更新目标使用 Scriptable 官方的 `module.filename`,可准确覆盖当前本地或 iCloud 脚本。
- 更新只覆盖当前 `.js` 文件,Keychain 里的凭证不受影响。
- 版本、脚本 ID 和 Raw URL 统一维护在 `scripts/build.mjs`。
- 首次安装仍需手动把脚本放进 Scriptable,之后就可以全自动了。
- 注意 GitHub Raw 有 CDN 缓存,push 后几分钟内手机可能还拉到旧版,属正常现象。

### App 内菜单

桌面组件点击后会重新运行当前脚本，在 Scriptable App 内打开菜单；后台刷新仍只渲染，不弹窗。全部组件都有“预览组件”和“检查更新”；选择预览后可选小、中、大或全部尺寸。爱快额外提供路由器配置，奶茶提醒额外提供发送通知，xLyra 保留凭证配置。

### 开发与发布

```powershell
npm ci
npm run check
```

- `src/widgets/`:组件源码。
- `src/lib/`:构建期共享模块，包含 updater 和 App 内菜单。
- `dist/`:可直接安装到 Scriptable 的单文件产物,需要提交到 Git。
- GitHub Raw 直接使用主分支的 `dist/`,日常更新不需要 GitHub Release。
- Release 仅用于需要按版本下载整包或长期归档时,可从已提交的 `dist/` 附加生成。
- GitHub Actions 会重新构建并检查 `dist/` 是否与源码一致。

### 安全说明

- 真实 `baseURL` 和 `adminToken` 只存在于 **iOS Keychain**,不会随 iCloud Drive 的 `.js` 文件同步出去。
- 脚本源码可以放心 `git push` 到公开仓库。

---

## ikuai.js

iKuai 软路由的桌面监控,首次运行会弹框输入 `用户名:密码@host:port`,凭证存 Keychain。

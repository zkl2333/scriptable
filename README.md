# Scriptable Widgets

我自用的 [Scriptable](https://scriptable.app/) 桌面小组件脚本集合。

| 脚本 | 用途 |
| --- | --- |
| [`xlyra.js`](./xlyra.js) | xLyra AI 网关看板(Admin Token:请求/成本/站点健康/Key/模型 TOP3) |
| [`ikuai.js`](./ikuai.js) | iKuai 软路由状态(在线设备、流量) |

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

1. 将 `xlyra.js` 复制到 iCloud Drive 的 `Scriptable/` 目录(或在 Scriptable App 内新建脚本粘贴内容)。
2. 在 Scriptable App 内**运行一次**脚本:依次输入后端地址(如 `https://ai-api.example.com`)和 Admin Token,脚本会发起一次真实请求验证,验证通过才写入 iOS Keychain。
3. 在桌面添加 Scriptable 小组件,长按选择 **Edit Widget**,**Script** 选 `xlyra` 即可,无需填 Parameter。
4. 之后**在 App 内运行脚本会弹出菜单**:刷新预览 / 重新配置凭证 / 检查更新;桌面组件后台刷新只渲染,不弹菜单。

> Admin Token 在 xLyra 控制台的 **个人资料 → Access Token** 中创建。

### 自我更新(可选)

脚本可以从远程地址更新自己(原理参考 [Honye/scriptable-scripts](https://github.com/Honye/scriptable-scripts) 的 `updateCode`):

1. 脚本已配置 GitHub Raw 地址(`zkl2333/scriptable`)。
2. **桌面组件后台刷新时会静默自更新**(默认开启,每 6 小时节流一次),覆盖后下次刷新生效,全程无需打开 App。
3. App 内通过配置菜单手动「检查更新」时会弹窗确认版本号。

```js
version: "1.4.0",       // 当前版本,与头部 @version 保持一致
autoUpdate: true,       // 组件后台静默自更新
updateURL: "https://raw.githubusercontent.com/zkl2333/scriptable/main/xlyra.js",
updateCheckInterval: 6 * 3600, // 检查节流(秒)
```

- 更新只覆盖 `.js` 文件,Keychain 里的凭证不受影响。
- 每次改脚本记得同步递增 `@version` 和 `CONFIG.version` 再 push。
- 首次安装仍需手动把脚本放进 Scriptable,之后就可以全自动了。
- 注意 GitHub Raw 有 CDN 缓存,push 后几分钟内手机可能还拉到旧版,属正常现象。

### 安全说明

- 真实 `baseURL` 和 `adminToken` 只存在于 **iOS Keychain**,不会随 iCloud Drive 的 `.js` 文件同步出去。
- 脚本源码可以放心 `git push` 到公开仓库。

---

## ikuai.js

iKuai 软路由的桌面监控,首次运行会弹框输入 `用户名:密码@host:port`,凭证存 Keychain。

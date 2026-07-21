# Scriptable Widgets

我自用的 [Scriptable](https://scriptable.app/) 桌面小组件脚本集合。

| 脚本 | 用途 |
| --- | --- |
| [`xlyra.js`](./xlyra.js) | xLyra AI 网关看板(双模式:Gateway Key 看模型/额度,Admin Token 看请求/成本/站点健康) |
| [`ikuai.js`](./ikuai.js) | iKuai 软路由状态(在线设备、流量) |

---

## xlyra.js

xLyra 桌面看板(**Admin Token 版**),深浅色自适应(状态胶囊、5h/7d 配额面板、分段进度条、摘要格)。
支持 **Small / Medium / Large** 三种尺寸,内容自适应:没有 OAuth 账号就完全不显示 OAuth 区块,空间让给站点健康和模型成本。

数据来源(均需 `xlyra-admin-…` 前缀的 Admin Token):

`dashboard/usage` · `dashboard/epaper-summary` · `health/sites` · `api-keys` · `oauth/connections` · `dashboard/cooldowns`

### 展示内容

| 尺寸 | 内容 |
| --- | --- |
| Small  | 健康状态胶囊 · 今日费用 · 请求数 · 成功率进度条 · 站点健康数 |
| Medium | 更新时间与「请求/成功率/失败」摘要 + 状态胶囊<br>**有 OAuth**:5h/7d 配额面板(5h 连续条、7d 七段分段条)<br>**无 OAuth**:站点健康列表(停用灰显)<br>底部 3 格:今日 Token · 今日费用 · RPM |
| Large  | 状态头 + 4 摘要格(有 OAuth 显示 OAuth 格,无则显示 API Key 格)<br>**有 OAuth**:5h/7d 配额面板 + OAuth 账号卡片(套餐徽章、剩余百分比、迷你条)<br>**无 OAuth**:站点健康列表 + 今日模型成本 TOP3<br>底部:TOP1 模型成本 / 冷却·RPM · 累计费用/tokens |

自适应规则:OAuth 账号数为 0 时,配额面板、账号卡片、OAuth 摘要格全部不渲染;站点为 0 或当日无模型成本时,对应区块同样隐藏。

健康等级(状态胶囊):站点全健康且无冷却、成功率 ≥95% 为「正常」,有降级/冷却/成功率 <95% 为「注意」,成功率 <80% 或无健康站点为「故障」。

> 数据源已实测对齐新版 xLyra(2026-07):`dashboard/usage` 的 KPI 位于 `kpis.*`,`epaper-summary` 的 TOP3 为 `model_top3_today`,均做了宽容解析。

### 安装与配置

1. 将 `xlyra.js` 复制到 iCloud Drive 的 `Scriptable/` 目录(或在 Scriptable App 内新建脚本粘贴内容)。
2. 在桌面添加 Scriptable 小组件,长按选择 **Edit Widget**。
3. **Script** 选 `xlyra`。
4. **Parameter** 填:
   ```
   https://ai-api.example.com@xlyra-admin-xxxxxxxxxxxxxxxx
   ```
   格式为 `<baseURL>@<adminToken>`,token 里若含 `@`,改用 `|` 分隔也可以。baseURL 末尾带不带 `/v1` 都行,脚本会自动归一化。
5. 完成。脚本会把凭证写入 iOS Keychain,后续 Parameter 留空也能正常运行。

> Admin Token 在 xLyra 控制台的 **个人资料 → Access Token** 中创建。

### 三种尺寸用同一份脚本

桌面上可以同时放 Small / Medium / Large 三个 widget,Parameter 各填一次即可(或只填一次后,其他留空靠 Keychain)。

### 自我更新(可选)

脚本可以从远程地址更新自己(原理参考 [Honye/scriptable-scripts](https://github.com/Honye/scriptable-scripts) 的 `updateCode`):

1. 把 `xlyra.js` 发布到可直链访问的位置(如 GitHub Raw)。
2. 把直链填入脚本顶部 `CONFIG.updateURL`。
3. 之后在 **App 内运行**脚本时,会自动比对远程代码头部的 `@version`,发现新版本弹窗确认后覆盖自身。桌面组件刷新时**不会**触发更新检查,不拖慢组件。

```js
version: "1.1.0",      // 当前版本,与头部 @version 保持一致
updateURL: "https://raw.githubusercontent.com/zkl2333/scriptable/main/xlyra.js",
```

- 更新只覆盖 `.js` 文件,Keychain 里的凭证不受影响。
- 覆盖在下次运行时生效;若脚本正在编辑页打开,需关闭后重开。
- 每次改脚本记得同步递增 `@version` 和 `CONFIG.version`。

### 修改配置 / 重置

- 改 baseURL 或 token:重新长按 widget → Edit Widget → Parameter 填新值。
- 清空 Keychain:在 Scriptable App 内新建一次性脚本运行:
  ```js
  Keychain.remove("xlyra_base_url");
  Keychain.remove("xlyra_access_token");
  ```

### 可调参数(脚本顶部 `CONFIG`)

非敏感,可按需改:

```js
const CONFIG = {
  refreshMinutes: 10,    // 刷新间隔(分钟)
  mediumSiteLimit: 4,    // Medium 站点列表行数上限(无 OAuth 时)
  largeSiteLimit: 5,     // Large 站点列表行数上限
  largeOAuthLimit: 2,    // Large OAuth 账号卡片上限
};
```

### 安全说明

- 真实 `baseURL` 和 `accessToken` 只存在于 **iOS Keychain**,不会随 iCloud Drive 的 `.js` 文件同步出去。
- 脚本源码可以放心 `git push` 到公开仓库。
- Widget Parameter 字段保存在 iOS 系统的小组件配置数据库,也不在脚本文件里。

---

## ikuai.js

iKuai 软路由的桌面监控,首次运行会弹框输入 `用户名:密码@host:port`,凭证存 Keychain。

# Web 渲染器实施规划

> 目标：把 `preview/` 打磨成一个可独立使用的 Scriptable 小组件 Web 渲染器——
> 喂给它一段 Scriptable 脚本（或一棵 IR），得到与真机视觉一致的 DOM 渲染结果。
>
> 本文只覆盖 Web 平台。架构上 IR 是平台中立的，将来若有其它平台需求，
> 只需再写一个 IR 消费端，本文档不受影响。

---

## 1. 现状盘点（已完成）

```
Scriptable 脚本 (dist/*.js)
   ↓  沙箱执行（preview/runtime.js 的 JS API 层：纯方法壳 + 属性收集）
   ↓  toIR()
纯 JSON IR（preview/ir.js，字段对齐 Scriptable 组件序列化 Schema）
   ↓  validateIR() 保证可 JSON 往返
DOM 渲染器（preview/runtime.js，只消费 IR）
```

已完成：

- IR 三层架构拆分，渲染器不接触 JS API 活对象
- 官方文档默认值的六处对齐（stack 默认 top 对齐、纵向 stack 对齐映射主轴、
  Spacer 最小长度语义、lineLimit ≤ 0 禁用、固定尺寸图片不收缩）
- 测试基建设施：`scripts/test-preview.mjs` 对 10 个真实组件 × 全部尺寸族
  做 HTML 钉板断言 + 行为 fixture 断言

## 2. 布局语义参考模型

渲染器的权威语义是 SwiftUI 的**提议-应答**模型，与 flexbox 有本质差异：

| 规则 | SwiftUI 语义 | 当前 Web 实现 | 状态 |
|---|---|---|---|
| R1 | 主轴分配：最不灵活优先、组内均分提议、按需取用、余量下传 | 布局引擎 `preview/layout.js`（提议-应答两趟协商） | ✅ |
| R2 | 主轴无约束时全部取理想尺寸 | 自然成立 | ✅ |
| R3 | `spacing` 统一间距 | `gap` | ✅ |
| R4 | 交叉轴 child 自决 + guide 对齐，无强制拉伸 | 默认 top/显式三档对齐 | ✅ |
| R5 | Spacer：优先级 -∞，最小长度 = minLength ?? 8pt | `flex: 1 0 {n\|8}px`；布局引擎中区间 [minLength, ∞) | ✅ |
| R6 | 固定 frame：固定尺寸 + 可溢出 + 不收缩 | `width/height + flex-shrink: 0` | ✅ |
| R7 | 图片 fit：布局尺寸 = 适配后实际显示尺寸 | `imageExtent` 单边按固有纵横比推导；remote 加载后修正未实现 | ✅（残留近似） |
| R8 | 背景层 = ZStack 底层 | absolute 铺满 | ✅ 近似足够 |
| R9 | 文本截断最小宽度依赖字体度量 | `preview/measure.js`（canvas / 近似兜底） | ✅ |
| R10 | `minimumScaleFactor`：先缩字号后截断 | 布局引擎二分字号（M3） | ✅ |
| R11 | 视图可拒绝提议（fixedSize 机制） | 靠 R1/R4 组合覆盖 | ⚠️ 边角 |

## 3. 路线图

> **进度（2026-07-27）**：M1–M5 已全部落地（`preview/measure.js`、`preview/layout.js`、
> Color.dynamic 渲染期解析、WidgetDate tick 自动刷新、minimumScaleFactor 二分缩放、
> 图片纵横比推导）。M4 的 remote 图片加载后布局修正未实现；M6 待真机。

### M1 — 文本测量基础设施（R9 的地基）✅ 已完成

- 用离屏 `<canvas>` 的 `measureText` 实现 `measureTextWidth(text, font)`：
  输入 IR 的 font 五元组（design/weight/size/style/name），输出 CSS px 宽度
- 建立 pt → px 与字族映射表（SF Pro → system-ui 回退链已存在于
  `fontStyles`，测量时须用同一链）
- Node 测试环境无 canvas：抽象 `TextMeasurer` 接口，浏览器用 canvas 实现，
  测试用等宽近似实现（按字号 × 字符宽度表）
- 产出：`preview/measure.js`（新模块），含缓存（text+font 为 key）

### M2 — 主轴分配算法（R1，核心攻坚）

替换 flexbox 比例收缩为真正的提议-应答：

1. IR 树自底向上计算每个节点的"长度区间"：
   `lengthThatFits(0)`（最小）与 `lengthThatFits(∞)`（理想）
   - 文本：最小 = 截断宽度（≈ 一个省略号宽度，可用 M1 测量）；
     理想 = 单行测量宽度
   - 图片/stack 固定 size：两值相等（不灵活）
   - Spacer：[minLength, ∞)，且优先级 -∞ 永远垫底
2. 自顶向下分配：父级给出主轴可用长度 → 按灵活性升序排序 →
   组内均分提议 → 各 child 按需取用 → 余量下传
3. 分配结果作为显式 `width/height`（或 flex-basis + grow 0）写到 DOM 节点，
   flexbox 退化为纯排版工具而非分配工具
- 测试矩阵重点：长文本 + 短文本 + Spacer 混合溢出的水平 stack
  （flexbox 直译唯一系统性偏离的场景）
- 前提：需要宿主容器尺寸 → 预览器已有各尺寸族宽高，直接注入

### M3 — minimumScaleFactor（R10）

- 依赖 M1 测量：文本溢出时按比例二分缩小 font-size，
  下限 `font.size × minimumScaleFactor`，仍溢出再截断
- 纯 JS，无 CSS 对应；在 M2 的分配流程里顺带完成（先缩后截）

### M4 — 图片纵横比（R7）

- fit 模式：布局尺寸 = 适配后实际显示尺寸，而非固定框
  - `imageSize` 只设一边或未设时，用图片固有纵横比计算另一边
  - remote 图片：HTMLImageElement 加载后读 naturalWidth/Height，
    加载前按 `imageSize` 或 1:1 占位
- 产出：`aspect-ratio` CSS + 加载后修正布局

### M5 — 动态值与自动刷新

- **Color.dynamic 渲染期解析**：IR 已携带 `dark` 备用值，渲染器按宿主
  `prefers-color-scheme`（或预览器主题开关）取色，不再在 build 期定死
- **WidgetDate 自动刷新样式**：relative / offset / timer 三种样式是
  系统级自动刷新文本。Web 端用 `Intl.RelativeTimeFormat` + `setInterval`
  tick 更新 DOM 文本，无需重跑脚本（timer 1s 级，relative/offset 30s 级足够）
- 渲染器从"一次性输出 HTML 字符串"演进为"挂载后可更新的 DOM 节点"，
  保留现有的字符串渲染路径供测试钉板

### M6 — 真机差异校验（兜底）

纯推理无法闭合的项目，需真机对照实验后回填规则：

- Text 截断最小宽度的确切定义
- widget 环境下系统默认间距的确切值（当前取 8px）
- 默认 padding 的各尺寸族取值表
- `verticalTextAlignment`（text 元素特有字段）的实际作用

## 4. 工程约束（不变量）

- IR 永远是纯 JSON：任何新能力先扩展 `preview/ir.js` 的 Schema，再改渲染器
- 渲染器只读 IR；JS API 层只负责收集，不做布局决策
- 每次行为变更必须带 `scripts/test-preview.mjs` 断言；
  `npm run check` 全绿才提交
- `dist/` 产物由 `npm run build` 生成，不手改

## 5. 里程碑依赖

```
M1 测量 ──→ M2 主轴分配 ──→ M3 缩放因子
               ↓
             M4 图片纵横比（可并行）
M5 动态值（独立，可任何时间做）
M6 真机校验（贯穿，最后收口）
```

建议顺序：M5（小而独立，先拿确定性收益）→ M1 → M2 → M3 → M4 → M6。

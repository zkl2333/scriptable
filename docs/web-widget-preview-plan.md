# Scriptable Web 小组件预览实施计划

状态：P0 基础实现已落地，真实组件接入待办
日期：2026-07-23

## 当前实现

仓库内已提供独立的 `web/` 预览工作台，作为主仓库内的隔离前端，而不是另开 Git 仓库。它与 `src/widgets/`、`dist/` 的 Scriptable 单文件分发流程完全分开。

- `web/src/runtime/`：`ListWidget`、Stack、Text、Date、Image、Spacer、颜色、字体、渐变、几何值对象，以及受限运行器。
- `web/src/renderer/`：基于 DOM/CSS 的 Stack 和文本渲染；`DrawContext`/`Path` 命令以 Canvas 2D 回填为图片节点。
- `web/src/fixtures/layout-lab.js`：不访问网络、不读取凭据的可信布局 fixture，覆盖六种 family、动态色、嵌套 Stack、固定与弹性 Spacer、渐变和 Canvas 进度条。
- `web/tests/runtime.mjs`：Node 运行时单元测试；`npm run build:web` 生成临时浏览器资源，`npm run dev:web` 启动工作台。

当前 fixture 不是任意 Scriptable 源码执行器，也没有直接运行本仓库六个业务组件。下一阶段须为可信源码构建预览专用 bundle，并向其中注入稳定业务数据；在此之前不能以浏览器内 `eval` 或真实网络请求替代该隔离层。

## 目标

在浏览器中运行一组受支持的 Scriptable 小组件 API，生成可切换尺寸与明暗模式的布局预览，优先覆盖本仓库六个组件实际使用的界面能力。

首个可用版本需要做到：

- 使用与 Scriptable 相同的调用方式构建 `ListWidget`。
- 支持 small、medium、large、accessoryInline、accessoryCircular 和 accessoryRectangular。
- 使用确定性的本地数据预览，不依赖真实 Token、路由器或私有服务。
- 对未实现或行为不确定的 API 给出明确诊断，不静默忽略。
- 预览结果足以发现溢出、截断、间距、尺寸和明暗模式问题。

## 非目标

- 不承诺像素级复刻所有 iOS、设备和显示缩放组合。
- 不模拟通知、相册、定位、日历等与布局无关的完整 Scriptable 平台。
- 首版不执行来源不可信的任意脚本，也不向任意地址代理网络请求。
- 不把 Web 预览作为真机验收的替代品，尤其是锁屏 accessory 组件。
- 不在浏览器中存储 Admin Token、路由器凭据或其他生产凭证。

## 技术决策

### 使用节点树作为运行时中间表示

模拟 API 只记录组件节点、样式和布局属性，不直接操作 DOM。脚本执行结束后，再由渲染器统一处理布局。这能保留 Scriptable 的对象修改方式，也便于测试尺寸为零、文本压缩和 accessory 过滤等规则。

```text
Scriptable 脚本
      ↓
模拟全局 API
      ↓
Widget 节点树
      ↓
DOM/CSS 渲染器 ── Canvas DrawContext
      ↓
设备、family、主题预览
```

### DOM/CSS 与 Canvas 分工

- `ListWidget`、`WidgetStack`、文本、日期、图片和 Spacer 使用 DOM/CSS。
- `DrawContext` 与 `Path` 使用 Canvas 2D，实现后返回模拟 `Image`。
- 不用单个 Canvas 绘制整个组件，避免重新实现文本换行、Flex 布局、链接区域和调试检查。

### 文本渲染后端

- P0 使用浏览器原生文本能力：`WidgetText` 由 DOM 排版，`DrawContext.drawText()` 由 Canvas 2D 绘制。
- 为文本测量与栅格化保留内部后端接口，但首版不要求暴露为公共 API。
- [`freetype-wasm`](https://github.com/zkl2333/freetype-wasm) 仅作为 P2 可选后端，用于固定开源字体的确定性截图、Node 测试或自定义字体渲染。
- FreeType 只提供字形度量与栅格化，不负责 shaping、换行、行数限制和文本缩放；复杂文字需要额外组合 HarfBuzz 与行布局器。
- 浏览器无法从 Scriptable 读取 iOS 的 SF 系统字体文件，Web 预览也不分发 Apple 字体，因此真机截图仍是系统字体校准标准。

### 使用逻辑点布局

组件内部尺寸以 Scriptable 的逻辑点为单位。预览区域需要缩放时，只缩放组件外层，不按浏览器宽度重新计算字体和间距。

设备尺寸由显式 preset 提供。首版选取一个参考 iPhone 尺寸，后续根据真机截图增加其他设备，不把一组固定尺寸声明为所有设备的标准值。

### 使用确定性数据

预览默认拦截更新检查和业务请求，通过 fixture 返回稳定响应。Keychain 使用仅存在于当前预览会话的内存实现。任何未匹配的请求默认失败，并在界面中显示诊断信息。

## API 覆盖

### P0：首版必须支持

| API | Web 映射 | 关键语义 |
| --- | --- | --- |
| `ListWidget` | 纵向 Flex 根容器 | 背景、padding、spacing、URL |
| `WidgetStack` | 横向或纵向 Flex | 默认横向，支持嵌套 |
| `addText()` | DOM 文本节点 | 字体、颜色、行数、缩放、对齐 |
| `addDate()` | DOM 时间节点 | 日期、时间和相对时间样式 |
| `addImage()` | `<img>` 或 Canvas 输出 | 尺寸、透明度、圆角、tint |
| `addSpacer(n)` | 固定主轴长度 | 不影响交叉轴尺寸 |
| `addSpacer()` | `flex: 1 1 0` | 多个弹性 Spacer 分配剩余空间 |
| `setPadding()` | CSS `padding` | 参数顺序为 top、leading、bottom、trailing |
| `spacing` | CSS `gap` | 与显式 Spacer 同时生效 |
| `Size` | CSS 尺寸约束 | 小于等于 0 的维度是自动尺寸，不是 `0px` |
| Stack 对齐方法 | Flex 对齐 | 按方向映射 top、center、bottom |
| Stack 背景与边框 | CSS | 颜色、图片、渐变、圆角、边框 |
| `Color` / `Color.dynamic()` | CSS 色值与主题分支 | 支持显式切换 light/dark |
| `Font` | `system-ui`、`ui-rounded`、`ui-monospace` | 支持仓库现有字重与字号 |
| `LinearGradient` | CSS `linear-gradient()` | 使用归一化起止点和 locations |
| `Point` / `Rect` | JavaScript 值对象 | 保持 Scriptable 属性名 |
| `DrawContext` | Canvas 2D | DPR、透明背景、图形、文本、图片 |
| `Path` | `Path2D` 或命令列表 | 矩形、椭圆、圆角矩形和曲线 |
| `SFSymbol` | 名称映射和占位降级 | 先覆盖仓库实际使用的符号 |
| `config.widgetFamily` | 预览状态 | 每个 family 重新执行脚本 |
| `Script.setWidget()` | 捕获根节点 | 作为一次预览执行的输出 |

当前 `ikuai.js` 使用了非官方的 `WidgetImage.imageColor`。运行时可暂时将其作为 `tintColor` 的兼容别名并产生警告，源码应单独改为官方属性。

### P1：核心稳定后补齐

- `useDefaultPadding()` 及不同 family 的默认 padding 校准。
- `WidgetText` 和 `WidgetDate` 的阴影、透明度及全部对齐方法。
- `WidgetImage` 的 border、`containerRelativeShape`、resizable 和两种 content mode。
- `WidgetDate` 的 time、date、relative、offset 和 timer 全部样式。
- `ListWidget.backgroundImage`、Stack background image 和图片裁切规则。
- `presentExtraLarge()` 与 iPad preset。
- Widget、Stack、Text、Date 和 Image 的 URL 点击区域可视化。

### P2：暂不纳入布局 MVP

- 完整 `Request`、`FileManager`、`Keychain` 兼容层。
- Alert、Notification、Safari、Photos、Calendar、Location 等宿主能力。
- 全量 SF Symbols 数据库。
- 与 WidgetKit 完全一致的动态字体和系统无障碍字号。
- 基于 `freetype-wasm` 的固定字体确定性后端，以及配套的 HarfBuzz shaping 和行布局器。

P2 中与现有组件启动流程有关的少量 API，可以先提供受限 mock，但不扩展为通用平台模拟器。

## 布局规则

### Widget 与 Stack

- `ListWidget` 固定为纵向主轴。
- `WidgetStack` 默认横向，调用 `layoutVertically()` 后改为纵向。
- 未指定尺寸时使用内容固有尺寸和父级约束。
- `new Size(width, height)` 中任一维度小于等于 0 时，该维度保持自动布局。
- 固定尺寸只约束大于 0 的维度，不能因为另一维为 0 而生成 `0px`。
- 需要通过真机基准确认嵌套 Stack 在剩余空间中的 hugging 和 compression 行为。

### Spacer

- 固定 Spacer 只占当前 Stack 主轴上的指定长度。
- 弹性 Spacer 消耗主轴剩余空间，多个弹性 Spacer 使用相同 grow 权重。
- 固定 Spacer 与 `spacing` 可以叠加。
- Spacer 不生成可见背景，也不能扩大交叉轴最小尺寸。

### 文本

- `lineLimit <= 0` 表示不限行；正数使用 line clamp。
- 先按声明字号和行数布局，再在发生溢出时缩小字号。
- 缩小下限为 `fontSize * minimumScaleFactor`。
- 文本缩放使用 DOM 实测和二分查找，不能只依赖 `canvas.measureText()`，因为后者无法完整反映换行高度。
- 字体加载完成后必须重新测量。
- Stack 内文本对齐遵循 Scriptable 规则；主轴位置优先由 Spacer 决定。
- 可选 FreeType 后端返回的 advance 和 glyph metrics 为 26.6 定点数，转换为逻辑像素时除以 64；Face 的 ascender、descender 等元数据仍需按 `unitsPerEM` 缩放。
- FreeType 后端只接受显式提供的字体字节，不作为 `Font.systemFont()` 的实现或 SF 字体替代品。

### 图片与渐变

- fitting mode 映射为 `object-fit: contain`，filling mode 映射为 `cover`。
- SF Symbol 优先使用单色 mask，以便正确响应 `tintColor`。
- 普通位图 tint 作为近似能力处理，并在无法等价实现时标记差异。
- 渐变起止点不能只保存为固定角度，需要根据容器尺寸换算 CSS 方向。

### DrawContext

- Canvas backing store 使用 `logicalSize * scale`，CSS 尺寸保持逻辑点大小。
- `respectScreenScale` 开启时使用选定设备 scale，否则 scale 为 1。
- 所有绘图坐标在缩放后的 context 上继续使用逻辑点。
- `getImage()` 返回包含逻辑尺寸和 Canvas 来源的模拟 `Image`。
- 动态色在调用绘图命令时解析为当前预览主题；同时记录这与 Scriptable 官方“不支持 DrawContext 动态色”的差异。

## 目录规划

实现阶段建议使用以下结构，避免与 Scriptable 单文件构建混在一起：

```text
web/
  index.html
  src/
    app/                    # 预览工作台和控制项
    runtime/                # Scriptable 类、节点树、脚本运行器
    renderer/               # DOM 渲染、文本适配、主题处理
    canvas/                 # DrawContext、Path、Image
    fixtures/               # 组件业务响应和安全配置
    device-presets.js
  tests/
    runtime.mjs              # 已实现
    renderer/                # 待补充
    screenshots/             # 待补充
scripts/
  build-web.mjs              # 已实现
  dev-web.mjs                # 已实现
```

Web 构建产物不写入现有 `dist/`，该目录继续只存放 Scriptable 单文件分发产物。是否发布到 GitHub Pages 在 MVP 完成后另行决定。

## 实施阶段

### 阶段 1：运行时模型与单元测试

- 实现 geometry、Color、Font、LinearGradient 和 Image 值对象。
- 实现 ListWidget、WidgetStack、WidgetText、WidgetDate、WidgetImage、WidgetSpacer。
- 实现节点树序列化和未知属性、未知方法诊断。
- 为默认值、调用顺序、Size 自动维度和 Spacer 分配编写测试。

完成标准：受控示例脚本可以生成稳定、可快照测试的节点树。

### 阶段 2：DOM/CSS 渲染器

- 渲染 Widget 和嵌套 Stack。
- 支持 padding、spacing、尺寸、背景、边框、圆角和渐变。
- 支持文本行数、对齐和 `minimumScaleFactor`。
- 增加 family、设备 preset、light/dark 切换。
- 显示溢出边界和未支持 API 诊断。

完成标准：纯文本、嵌套布局、固定/弹性 Spacer 和固定/自动尺寸 fixture 均可正确预览。

### 阶段 3：Canvas 与图片

- 实现仓库当前使用的 DrawContext 和 Path 方法。
- 实现 DPR、透明 Canvas、图片输出和 Canvas 图片回填 Widget。
- 增加图片 content mode、tint 和背景图片。
- 建立仓库所用 SF Symbol 名称映射和缺失占位。

完成标准：时间进度条、iKuai 圆环、工作助手圆形图和 xLyra 点阵背景可以渲染。

### 阶段 4：现有组件接入

- 为预览执行注入 `config`、`args` 和 `Script`。
- 在预览模式禁用自动更新写入和真实凭证读取。
- 为六个组件建立安全 fixture；未匹配请求禁止访问网络。
- 对每个 family 独立执行组件，避免跨预览共享节点状态。
- 处理源码模块打包，使 Web runner 执行的代码与发布逻辑保持可追踪关系。

完成标准：六个组件均能在不使用生产凭证的情况下生成所有已声明 family。

### 阶段 5：真机校准与回归测试

- 编写专用布局探针脚本，在 Scriptable 和 Web 中运行相同 API 调用。
- 采集参考设备的 family、系统版本、主题、显示缩放和截图。
- 校准默认 padding、组件尺寸、圆角、Stack 对齐、文本行高和压缩行为。
- 使用浏览器截图测试覆盖桌面和窄屏工作台视口。
- 使用固定开源字体建立跨平台文本度量 fixture；是否接入 FreeType 后端由浏览器截图稳定性决定。
- 对字体和 SF Symbols 等不可控差异设置区域豁免，不放宽布局边界检查。

完成标准：核心 fixture 无重叠、无意外截断，截图差异可解释且有记录。

### 阶段 6：开发流程集成

- 增加 `dev:web`、`build:web` 和 `test:web` 命令。
- 将 Web runtime 单元测试和生产构建纳入 `npm run check`。
- 在 CI 中检查未支持 API、测试和 Web 构建。
- 补充本地使用、fixture 编写和真机校准文档。

## 测试策略

### 单元测试

- API 默认值和 setter 行为。
- 节点插入顺序及嵌套关系。
- 固定与弹性 Spacer。
- `Size(0, n)`、`Size(n, 0)` 和全自动尺寸。
- Color alpha、动态色和渐变位置。
- DrawContext 坐标、DPR 和透明度。
- WidgetDate 相对时间的固定时钟输出。
- 固定开源字体的单行、多行、CJK 和最小缩放测量；默认使用浏览器后端，FreeType 后端启用后共享同一组语义用例。

### 布局 fixture

- 横向、纵向和三层嵌套 Stack。
- 固定 Spacer、多个弹性 Spacer 和 spacing 组合。
- 单行、多行、长英文、中文和超长不可断词文本。
- 小于容器的图片、填充图片、透明图片和 SF Symbol。
- 背景图、动态渐变、边框和圆角裁切。
- accessory inline 的单图单文本过滤规则。

### 端到端验证

- 六个现有组件的全部支持尺寸。
- light/dark 两种模式。
- 普通屏幕和高 DPR Canvas。
- 桌面和移动浏览器工作台视口。
- 浏览器控制台无未处理异常，未知 API 在诊断面板中可见。

## MVP 验收标准

- 六个组件使用的布局 API 均有实现或明确的兼容处理。
- 六个组件可以使用 fixture 渲染 small、medium、large 和三个 accessory family。
- `DrawContext` 生成内容清晰且逻辑尺寸正确。
- `Size` 自动维度、Spacer、文本 line limit 和最小缩放有独立回归测试。
- 明暗模式可以手动切换，不依赖宿主浏览器主题。
- 预览过程不读取或持久化生产凭证，不访问私有地址。
- 未实现 API 会指出脚本位置和 API 名称。
- `npm run check` 包含 Web runtime 测试与 Web 生产构建。

## 已知风险

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| 非 Apple 系统字体指标不同 | 换行和宽度有偏差 | 使用系统字体族，真机截图作为最终标准 |
| 可选字体后端无法复刻 iOS 排版 | shaping、换行或 Emoji 与真机不同 | P0 使用浏览器排版；FreeType 仅处理显式字体，并按需组合 HarfBuzz |
| WASM 与字体资源增加体积 | 首屏加载和内存占用上升 | FreeType 后端延迟加载，不纳入 MVP 默认包 |
| 字体与 FreeType 分发有授权要求 | 公开部署存在合规风险 | 只使用可分发字体；固定构建 commit SHA，并保留 FreeType attribution |
| SF Symbols 无法完整分发 | 图标外观或尺寸不同 | 仓库符号白名单、mask、占位诊断 |
| Widget 尺寸随设备和系统变化 | 固定 preset 不适用于全部设备 | preset 带设备和系统元数据，逐步扩充 |
| SwiftUI 布局优先级与 Flex 不完全相同 | 极端拥挤布局有差异 | 布局探针、文本实测和真机校准 |
| accessory 受壁纸和 tint 影响 | 锁屏预览无法精确 | 提供多种背景场景并标记为近似预览 |
| 浏览器执行脚本的安全性 | 任意代码或网络访问 | fixture 优先、隔离 runner、默认禁网 |
| 现有组件依赖更新器和宿主 API | 脚本在布局前失败 | 预览专用受限 mock，并记录所有调用 |

## 后续决策点

以下事项在阶段 1 原型完成后决定：

- 使用原生模块还是引入轻量前端构建工具。
- 脚本 runner 使用隔离 iframe、Worker，还是只允许仓库内可信 bundle。
- SF Symbol 使用手工映射、构建期导出资源，还是第三方近似图标。
- Web 预览是否部署到 GitHub Pages，或只作为本地开发工具。
- 真机截图采用人工基线，还是增加 Scriptable 端导出元数据的辅助脚本。
- 浏览器截图是否已足够稳定，还是需要引入固定 commit SHA 的 `freetype-wasm` 和 HarfBuzz 作为可选确定性后端。

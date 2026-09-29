# Full Editor

以「项目(虚拟目录)」为组织结构的桌面编辑器。一个项目可以挂载磁盘上任意多个目录,统一在文件树中浏览;覆盖工程中常见的绝大多数文件类型 —— markdown、shell、log、yaml、json、ts/js、python、sql、Dockerfile、ini/env 等的语法高亮编辑,markdown 渲染预览,图片预览,二进制/超大文件友好兜底。

技术栈:Electron + electron-vite + React 19 + TypeScript + Tailwind CSS v4 + HeroUI v3 + CodeMirror 6 + zustand。

## 开发

```bash
pnpm install
pnpm dev            # 开发模式(--watch 可让主进程改动热重启)
pnpm typecheck      # 类型检查
pnpm build          # 生产构建到 out/
pnpm start          # 预览生产构建
pnpm dist           # 打包 dmg + zip 到 dist/(未签名)
pnpm test           # 保存、冲突、恢复与项目操作回归测试
pnpm test:smoke     # 构建并启动隔离 Electron 窗口进行交互测试
pnpm test:export    # 验证真实 PNG/PDF 导出和导出菜单
```

## 发布与更新

- 发布:改 `package.json` 的 `version` → 提交 → `git tag v0.3.0 && git push origin v0.3.0`。`.github/workflows/release.yml` 会校验 tag 与版本号一致,跑类型检查和测试,再用 `pnpm release` 构建 dmg/zip 并发布到 GitHub Release。也可以本地 `GH_TOKEN=... pnpm release` 手动发布。
- 更新源:GitHub Releases(`aches/full-editor`)。应用启动 8 秒后每 24 小时静默检查一次,菜单「Full Editor → Check for Updates…」可手动检查;发现新版本会弹窗(下载 / 稍后 / 跳过此版本),「下载」直接打开对应架构的 dmg。应用未签名,macOS 无法静默自动安装,所以采用下载后手动替换的方式。
- Markdown 关联:打包后 `.md/.markdown/.mdown/.mkd/.mkdn` 可在 Finder「打开方式」或「显示简介 → 更改全部」中选择 Full Editor;双击/命令行打开的文件会在已运行的窗口新开标签(单实例),并仅授予该文件的访问权限。

## 图片 / PDF 导出

- 当前文件工具栏的 **Export** 或 **File → Export** 可导出 PNG 图片、PDF 文档；mini 模式也有导出按钮。
- **优先预览**：Markdown、SVG 即使处于 Edit 模式，也按预览内容导出；其余文件使用默认内容视图，代码保留语法高亮和行号。
- 导出整个文档，包括尚未保存的编辑，不改变当前查看模式。只包含文档内容，不包含侧栏、标签栏或工具栏；颜色沿用当前主题。
- PNG 按 1000 px 的文档宽度排版，以 2 倍像素密度直接渲染，输出宽度 2000 px 的高清长图；最大输出高度 32000 px，超出时提示改用 PDF，避免截断或降低清晰度。查看长图时可放大阅读。PDF 使用 A4 自动分页。
- 本地图片沿用项目访问权限；资源加载失败会明确提示，不生成缺图文件。导出不能覆盖源文件或其他已打开文件。

## 功能（第三期：保存保护与恢复）

- **统一未保存保护**：关闭标签、关闭窗口、退出、刷新、新建/切换/删除项目和移除目录时，根据受影响文档提供 Save All / Discard / Cancel；保存或备份失败时保留当前工作。
- **草稿自动备份**：持续输入时按约 1 秒节流保存工作现场，失去焦点时也会备份。备份不会写入原文件；底部显示最近成功时间或可重试的失败状态。异常退出恢复到最近一次成功备份，尚未备份的最新输入可能丢失。
- **项目会话恢复**：恢复标签顺序、活动文件、光标/选区、滚动位置、目录展开状态、侧栏宽度和 Markdown/SVG 查看模式。原文件缺失时，仍可恢复草稿并另存为；损坏会话优先使用有效备份，无法恢复时保留文件并显示错误。
- **外部修改冲突**：未修改文档自动重载；存在本地修改时保留内容并提示冲突，可双栏比较、重新加载、明确覆盖或另存为。覆盖时再次校验所比较的磁盘版本。文件删除后可以重建或另存为。
- **可靠保存**：同路径写入串行化，使用同目录临时文件、同步落盘和重命名替换，保留文件权限；保存期间新增编辑仍显示未保存。
- **全部保存与另存为**：File 菜单新增 Save All 和 Save As；另存为支持用户明确选择的项目外文件，并保留再次打开所需的单文件访问授权。

会话与草稿存储在应用数据目录下的 `sessions/<项目 ID>.json`，另存为授权存储在 `file-grants.json`。macOS 默认应用数据目录为 `~/Library/Application Support/full-editor/`。

测试使用独立临时目录，不读取或修改日常使用的项目配置。交互测试需要桌面环境和本机监听端口权限。

## 功能(第二期新增)

- **文件变更监听**:项目根目录递归监听(FSEvents),外部新建/删除自动刷新树;打开中的未修改文件被外部改动时自动重载(内容一致时跳过,不打扰光标)
- **文件操作**:树上右键菜单 —— 新建文件/文件夹、重命名(已打开的标签页路径自动跟随)、删除(移入废纸篓,可恢复)、Reveal in Finder;根目录支持从项目移除
- **每日速记**:侧栏日历按钮一键新建 `今天日期.md` / `今天日期.txt`(建在树中选中的目录,未选中时用第一个根目录;当天文件已存在则直接打开)
- **全局搜索**(`⌘⇧F`):跨全部根目录内容搜索,支持大小写敏感与正则;自动跳过 node_modules/.git 等目录、二进制与超大文件;点击结果精确跳转到行列
- **Markdown 分屏**:Edit / Split / Preview 三态,分屏模式边输入边渲染(250ms 防抖);预览中的外链经系统浏览器打开
- **SVG 预览**:svg 默认按 XML 编辑,一键切换渲染预览
- **打包分发**:`pnpm dist` 产出 dmg/zip(electron-builder,自绘应用图标)

## 功能(第一期)

- **项目管理**:创建/重命名/删除/切换项目;向项目添加任意多个目录作为文件树根;数据持久化在 `~/Library/Application Support/full-editor/projects.json`
- **文件树**:懒加载展开、目录优先排序、按类型着色的文件图标、无权限目录内联错误 + 重试、键盘导航(↑↓←→/Enter)
- **编辑器**:单 EditorView 多文档架构,切换标签页零开销且光标/滚动位置各自保留;语言包按需动态加载;log 文件的 ERROR/WARN/DEBUG 行级高亮 + 时间戳弱化(仅可视区域计算,大文件不卡)
- **Markdown**:编辑/预览一键切换,DOMPurify 消毒
- **安全边界**:所有文件访问限定在项目根目录内(realpath 校验);>5MB 文本不打开,1.5–5MB 只读;二进制自动识别
- **窗口**:透明度滑杆(30–100%)、置顶图钉、mini 模式(无边框小窗吸附屏幕右上角,只显示当前文件,可拖动,退出精确还原窗口位置与置顶状态)
- **主题**:5 套配色 —— Paper(暖纸白)、Solarized Light、Graphite(石墨)、One Dark、Dracula,或跟随系统(浅色用 Paper、深色用 Graphite);语法高亮按主题各配一组完整 token 色

## 快捷键

| 快捷键 | 功能 |
|---|---|
| `⌘S` | 保存当前文件 |
| `⌘⌥S` | 保存全部已修改文件 |
| `⌘⇧S` | 当前文件另存为 |
| `⌘W` | 关闭当前标签页(有未保存改动时弹出确认) |
| `⌘⇧M` | 进入/退出 mini 模式 |
| `⌘P` | 按文件名快速打开(全项目模糊匹配) |
| `⌘⇧F` | 项目内全局内容搜索 |
| `⌘1..9` | 切换到第 N 个标签页 |

## 结构

```
src/shared/    三端共用的 IPC 契约与类型(ipc.ts 是唯一契约源)
src/main/      窗口管理、mini 状态机、原子 JSON 存储、fs 服务、editor-file:// 协议
src/preload/   contextBridge 类型化 API(sandbox 下构建为 CJS)
src/renderer/  React UI:stores(zustand)、editor(CodeMirror 内核)、components
```

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
```

## 功能(第二期新增)

- **文件变更监听**:项目根目录递归监听(FSEvents),外部新建/删除自动刷新树;打开中的未修改文件被外部改动时自动重载(内容一致时跳过,不打扰光标)
- **文件操作**:树上右键菜单 —— 新建文件/文件夹、重命名(已打开的标签页路径自动跟随)、删除(移入废纸篓,可恢复)、Reveal in Finder;根目录支持从项目移除
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
| `⌘W` | 关闭当前标签页(有未保存改动时弹出确认) |
| `⌘⇧M` | 进入/退出 mini 模式 |
| `⌘⇧F` | 项目内全局搜索 |
| `⌘1..9` | 切换到第 N 个标签页 |

## 结构

```
src/shared/    三端共用的 IPC 契约与类型(ipc.ts 是唯一契约源)
src/main/      窗口管理、mini 状态机、原子 JSON 存储、fs 服务、editor-file:// 协议
src/preload/   contextBridge 类型化 API(sandbox 下构建为 CJS)
src/renderer/  React UI:stores(zustand)、editor(CodeMirror 内核)、components
```

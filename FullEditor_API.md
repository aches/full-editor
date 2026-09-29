# 第三期 IPC 契约

唯一类型源为 `src/shared/ipc.ts` 和 `src/shared/types.ts`。

- `fs:openFile(path)`：文本结果带原始磁盘内容的 SHA-256 revision。
- `fs:writeFile(path, content, {expectedRevision})`：版本不符返回 CONFLICT；null 表示预期文件不存在。成功返回路径和新版本。
- `fs:saveAs(sourcePath, content, forbiddenPaths?)`：系统对话框选择目标；禁止覆盖其他已打开标签；返回 CANCELLED 不作为异常通知。
- `sessions:load(projectId)`：返回项目会话或 null；损坏且无法恢复时拒绝，避免覆盖。
- `sessions:save(projectId, session)`：落盘完成后返回 WriteResult。
- `sessions:remove(projectId)`：移除已删除项目的会话。
- `dialog:confirmUnsaved(names, action)`：返回 save / discard / cancel。
- `evt:requestClose({id, reason})` 与 `window:respondClose(id, allow)`：关闭、退出、重载的握手，拒绝过期回应，respondClose 返回该回应是否被接受。

错误应保留内存文档；冲突需要显式决策；备份失败应可见且可重试。

## 导出 IPC

- `export:document({format, sourcePath, html, css, forbiddenPaths})`：format 为 png / pdf，渲染端传入完整、已消毒的文档快照和主题样式。主进程通过独立沙箱窗口渲染，等待字体/图片完成后生成二进制，再由系统保存对话框选择目标并原子写入。
- `evt:exportActiveTab(format)`：File 菜单触发，渲染端与工具栏共用导出流程。
- 返回 `{ok:true,path}` 或 `{ok:false,code,message}`；CANCELLED 静默取消，USE_PDF 表示无法完整生成单张 PNG，ASSET_LOAD_FAILED 表示资源未能完整加载，PROTECTED_PATH / CONFLICT 阻止覆盖受保护或已变化的文件。
- 文档 HTML + CSS 上限 32 MiB；PNG 排版宽度 1000 CSS px，以 2 倍密度渲染，输出最大 2000 × 32000 px（6400 万像素），校验实际像素尺寸，超限不降采样；渲染超时 45 秒。窗口在成功、失败、取消时均销毁；导出不授予额外文件访问权限。

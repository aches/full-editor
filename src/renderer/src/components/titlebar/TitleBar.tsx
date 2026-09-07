import ProjectSwitcher from './ProjectSwitcher'
import WindowControls from './WindowControls'

export default function TitleBar(): React.ReactElement {
  return (
    <div className="app-drag flex h-12 shrink-0 items-center justify-between border-b border-(--separator) pr-3 pl-[84px]">
      <ProjectSwitcher />
      <WindowControls />
    </div>
  )
}

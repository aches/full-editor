import { useStore } from '@/stores'
import TabItem from './TabItem'

export default function TabStrip(): React.ReactElement {
  const tabs = useStore((s) => s.tabs)
  const activeTabId = useStore((s) => s.activeTabId)

  return (
    <div className="flex h-[34px] shrink-0 items-stretch overflow-x-auto border-b border-(--separator) [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((tab) => (
        <TabItem key={tab.id} active={tab.id === activeTabId} tab={tab} />
      ))}
    </div>
  )
}

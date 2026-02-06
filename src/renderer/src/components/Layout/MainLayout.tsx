import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { ChatInterface } from '@/components/ChatInterface/ChatInterface'
import { KnowledgeGraph } from '@/components/KnowledgeGraph/KnowledgeGraph'
import { SessionHistory } from '@/components/SessionHistory/SessionHistory'
import { useUIStore } from '@/store/ui'

export function MainLayout() {
  const { currentView } = useUIStore()

  const renderView = () => {
    switch (currentView) {
      case 'chat':
        return <ChatInterface />
      case 'graph':
        return <KnowledgeGraph />
      case 'sessions':
        return <SessionHistory />
      default:
        return <ChatInterface />
    }
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />

        <main
          className="flex-1 overflow-hidden"
          role="main"
          aria-labelledby="page-title"
        >
          {renderView()}
        </main>
      </div>
    </div>
  )
}

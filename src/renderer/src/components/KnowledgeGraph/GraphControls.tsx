import { useState } from 'react'
import { Network, Table, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { useGraphStore } from '@/store/graph'
import { useIPC } from '@/hooks/useIPC'
import { useToast } from '@/components/ui/use-toast'

export function GraphControls() {
  const { viewMode, setViewMode, graphData, setSelectedNode } = useGraphStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const electron = useIPC()
  const { toast } = useToast()

  const handleSearch = async () => {
    if (!searchQuery.trim()) return

    setIsSearching(true)
    try {
      const results = await electron.searchGraph(searchQuery) as { nodes?: any[]; message?: string }

      if (results.nodes && results.nodes.length > 0) {
        setSearchResults(results.nodes)
        // Select the first result
        setSelectedNode(results.nodes[0])

        toast({
          title: 'Search Results',
          description: `Found ${results.nodes.length} matching node${results.nodes.length !== 1 ? 's' : ''}`
        })
      } else {
        // Fallback to local search if backend search fails
        const localResults = graphData?.nodes.filter(node =>
          node.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          node.type.toLowerCase().includes(searchQuery.toLowerCase())
        ) || []

        setSearchResults(localResults)

        if (localResults.length > 0) {
          setSelectedNode(localResults[0])
          toast({
            title: 'Search Results',
            description: `Found ${localResults.length} matching node${localResults.length !== 1 ? 's' : ''}`
          })
        } else {
          toast({
            title: 'No Results',
            description: `No nodes found matching "${searchQuery}"`
          })
        }
      }
    } catch (error) {
      console.error('Search failed:', error)
      toast({
        variant: 'destructive',
        title: 'Search Error',
        description: 'Failed to search knowledge graph'
      })
    } finally {
      setIsSearching(false)
    }
  }

  const clearSearch = () => {
    setSearchQuery('')
    setSearchResults([])
    setSelectedNode(null)
  }

  return (
    <div className="flex items-center justify-between border-b bg-background px-4 py-3 gap-4">
      <div className="flex items-center space-x-2" role="toolbar" aria-label="Graph controls">
        <Button
          variant={viewMode === 'graph' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setViewMode('graph')}
          aria-label="Graph visualization view"
          aria-pressed={viewMode === 'graph'}
        >
          <Network className="h-4 w-4 mr-2" />
          Graph View
        </Button>

        <Button
          variant={viewMode === 'table' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setViewMode('table')}
          aria-label="Accessible table view"
          aria-pressed={viewMode === 'table'}
        >
          <Table className="h-4 w-4 mr-2" />
          Table View
        </Button>
      </div>

      <Separator orientation="vertical" className="h-6" />

      {/* Search Bar */}
      <div className="flex-1 max-w-md">
        <div className="relative flex items-center">
          <Search className="absolute left-3 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search nodes by label or type..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSearch()
              } else if (e.key === 'Escape') {
                clearSearch()
              }
            }}
            className="pl-10 pr-20"
            aria-label="Search knowledge graph"
          />
          <div className="absolute right-2 flex items-center gap-1">
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={clearSearch}
                aria-label="Clear search"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleSearch}
              disabled={!searchQuery.trim() || isSearching}
              className="h-7"
            >
              {isSearching ? 'Searching...' : 'Search'}
            </Button>
          </div>
        </div>

        {searchResults.length > 0 && (
          <div className="mt-2 text-xs text-muted-foreground">
            Found {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
            {searchResults.length > 1 && ' - Click nodes in the graph to view details'}
          </div>
        )}
      </div>
    </div>
  )
}

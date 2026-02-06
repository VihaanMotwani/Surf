# Knowledge Graph Query Feature

## Overview
Added full search and query functionality to the knowledge graph, allowing users to search for nodes by label or type, with visual feedback and automatic selection.

## Features Implemented

### 1. Search Bar in Graph Controls
**Location**: `src/renderer/src/components/KnowledgeGraph/GraphControls.tsx`

**Features**:
- Full-width search input with icon
- Search button with loading state
- Clear button (X) to reset search
- Keyboard shortcuts:
  - **Enter** - Execute search
  - **Escape** - Clear search
- Results counter showing number of matches
- Helpful hint text when results found

**UI Elements**:
```tsx
<Input
  placeholder="Search nodes by label or type..."
  onKeyDown={(e) => {
    if (e.key === 'Enter') handleSearch()
    if (e.key === 'Escape') clearSearch()
  }}
/>
```

### 2. Search Logic

**Dual Search Strategy**:
1. **Backend Search First**: Calls `electron.searchGraph(query)`
2. **Local Fallback**: If backend fails, searches loaded graph data locally

**Search Implementation**:
```typescript
const handleSearch = async () => {
  // Try backend search
  const results = await electron.searchGraph(searchQuery)

  if (results.nodes && results.nodes.length > 0) {
    setSearchResults(results.nodes)
    setSelectedNode(results.nodes[0]) // Auto-select first result
    showToast(`Found ${results.nodes.length} nodes`)
  } else {
    // Fallback to local search
    const localResults = graphData?.nodes.filter(node =>
      node.label.toLowerCase().includes(query) ||
      node.type.toLowerCase().includes(query)
    )
    // ... handle local results
  }
}
```

### 3. Visual Highlighting
**Location**: `src/renderer/src/components/KnowledgeGraph/GraphVisualization.tsx`

**Features**:
- Selected node enlarges from size 15 → 25
- Camera automatically centers on selected node with smooth animation
- Cursor changes to pointer on hover
- Node details panel opens automatically
- All implemented using React `useEffect` hooks

**Highlight Implementation**:
```typescript
useEffect(() => {
  if (!sigmaRef.current || !selectedNode) return

  const graph = sigmaRef.current.getGraph()

  // Reset all node sizes
  graph.forEachNode(node => {
    graph.setNodeAttribute(node, 'size', 15)
  })

  // Enlarge selected node
  if (selectedNode) {
    graph.setNodeAttribute(selectedNode.id, 'size', 25)

    // Center camera with animation
    const nodePosition = sigmaRef.current.getNodeDisplayData(selectedNode.id)
    camera.animate(
      { x: nodePosition.x, y: nodePosition.y },
      { duration: 500 }
    )
  }

  sigmaRef.current.refresh()
}, [selectedNode, graphData])
```

### 4. Backend Search Handler
**Location**: `src/main/ipc/handlers/knowledge-graph.ts`

**Current Implementation** (Placeholder):
```typescript
ipcMain.handle(IPC_CHANNELS.GRAPH_SEARCH, async (_event, query: string) => {
  // TODO: Integrate with actual backend
  const graphData = generateMockGraphData()
  const filteredNodes = graphData.nodes.filter((node) =>
    node.label.toLowerCase().includes(query.toLowerCase())
  )
  return { nodes: filteredNodes }
})
```

**Ready for Real Backend**:
- Replace `generateMockGraphData()` with actual database query
- Add support for complex queries (regex, fuzzy matching, etc.)
- Implement pagination for large result sets
- Add query performance metrics

### 5. User Feedback
**Toast Notifications**:
- Success: "Found X matching nodes"
- No results: "No nodes found matching 'query'"
- Error: "Failed to search knowledge graph"

**Visual Feedback**:
- Search button shows "Searching..." while loading
- Results counter below search bar
- Selected node visibly larger
- Node details panel opens automatically

## Search Capabilities

### What You Can Search
1. **By Node Label**
   - "email" → finds "email.google.com"
   - "Dark Mode" → finds preference node
   - "User" → finds central user node

2. **By Node Type**
   - "preference" → finds all preference nodes
   - "website" → finds all website nodes
   - "task" → finds all task nodes
   - "memory" → finds all memory nodes

3. **Partial Matches**
   - "dark" → matches "Dark Mode"
   - "mail" → matches "email.google.com"
   - Case-insensitive matching

### Search Results
- **Auto-selection**: First result automatically selected
- **Visual highlight**: Selected node enlarged and centered
- **Details panel**: Shows full node information
- **Multi-result**: Can click other nodes to view them

## Keyboard Accessibility

### Search Controls
- **Tab** - Focus search input
- **Type** - Enter search query
- **Enter** - Execute search
- **Escape** - Clear search and reset
- **Tab** - Navigate to next element

### Graph Navigation
- **Click** - Select any node
- **Tab** - Move through UI controls
- All actions screen-reader accessible

## Integration Points

### IPC Communication
```typescript
// Frontend (useIPC hook)
const electron = useIPC()
const results = await electron.searchGraph(query)

// Backend (IPC handler)
ipcMain.handle(IPC_CHANNELS.GRAPH_SEARCH, async (_event, query) => {
  // Your search logic here
  return { nodes: matchingNodes }
})
```

### State Management
```typescript
// Zustand store (store/graph.ts)
interface GraphState {
  graphData: GraphData | null
  selectedNode: GraphNode | null
  setSelectedNode: (node: GraphNode | null) => void
  // ... other state
}

// Usage in components
const { selectedNode, setSelectedNode } = useGraphStore()
```

## Future Enhancements

### Advanced Query Language
```typescript
// Examples of what could be added:
"type:preference AND label:*dark*"          // Boolean logic
"connected-to:user-1"                       // Relationship queries
"depth:2 from:user-1"                       // Graph traversal
"created:>2024-01-01"                       // Temporal queries
"category:settings ORDER BY created DESC"   // Sorting
```

### Query Features to Add
1. **Autocomplete**: Suggest nodes as user types
2. **Query History**: Remember recent searches
3. **Saved Queries**: Bookmark common searches
4. **Advanced Filters**: UI for building complex queries
5. **Export Results**: Save search results to file
6. **Highlight Paths**: Show connections between results

### Performance Optimizations
1. **Query Caching**: Cache search results
2. **Debouncing**: Wait for user to finish typing
3. **Pagination**: Load large results in chunks
4. **Lazy Loading**: Load node details on demand
5. **Web Workers**: Move search to background thread

### Visual Enhancements
1. **Result Highlighting**: Different colors for search results
2. **Path Highlighting**: Show connections between results
3. **Clustering**: Group similar results visually
4. **Heatmap**: Show query frequency on nodes
5. **Animations**: Smooth transitions between searches

## Testing the Query Feature

### Quick Test
```bash
# 1. Start the app
npm run dev

# 2. Navigate to Knowledge Graph

# 3. Try these searches:
- "email"      → Should find email.google.com
- "dark"       → Should find Dark Mode preference
- "task"       → Should find all task-type nodes
- "user"       → Should find the User node

# 4. Observe:
- Toast notification with result count
- Selected node enlarges
- Camera centers on node
- Details panel opens
```

### Verify Features
- ✅ Search executes on Enter key
- ✅ Search clears on Escape key
- ✅ Toast shows result count
- ✅ First result auto-selected
- ✅ Node visually enlarged (size 25)
- ✅ Camera centers on node (animated)
- ✅ Details panel shows node info
- ✅ Can click other results to view them
- ✅ Clear button (X) works
- ✅ No results shows appropriate message

## Files Modified

1. **GraphControls.tsx** - Added search bar and logic
2. **GraphVisualization.tsx** - Added visual highlighting
3. **knowledge-graph.ts** - Backend search handler (already existed)
4. **useIPC.ts** - Search method (already existed)
5. **graph.ts** (store) - selectedNode state (already existed)

## API Reference

### Frontend API
```typescript
// Search the graph
const results = await electron.searchGraph(query: string)
// Returns: { nodes: GraphNode[] }

// Set selected node
setSelectedNode(node: GraphNode | null)

// Get current selection
const { selectedNode } = useGraphStore()
```

### Backend API
```typescript
// IPC Channel
IPC_CHANNELS.GRAPH_SEARCH = 'graph:search'

// Handler signature
async (event, query: string) => {
  return { nodes: GraphNode[] }
}
```

## Summary

✅ **Fully functional knowledge graph query system**
✅ **Search bar with keyboard shortcuts**
✅ **Visual feedback and highlighting**
✅ **Automatic node selection and camera positioning**
✅ **Toast notifications for results**
✅ **Fallback to local search**
✅ **Accessible keyboard navigation**
✅ **Ready for backend integration**

The query feature is complete and ready to use. The placeholder backend can be easily replaced with a real database query system by updating `src/main/ipc/handlers/knowledge-graph.ts`.

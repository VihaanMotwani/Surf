# Surf - Quick Start Guide

## Running the Application

### Development Mode
```bash
npm run dev
```

This will:
1. Start the Vite dev server for the renderer process
2. Launch Electron with hot reload enabled
3. Open the application window

## Testing Knowledge Graph Query

The knowledge graph now has full search/query functionality:

### How to Query the Knowledge Graph

1. **Navigate to Knowledge Graph View**
   - Click "Knowledge Graph" in the sidebar (or press Tab to navigate)

2. **Use the Search Bar**
   - Type in the search box at the top: "email", "dark", "news", etc.
   - Press Enter or click "Search"

3. **Search Features**
   - **Backend Search**: Queries the IPC handler (placeholder implementation)
   - **Local Fallback**: Searches loaded graph data if backend fails
   - **Auto-select**: First result is automatically selected
   - **Visual Highlight**: Selected nodes are enlarged and camera centers on them
   - **Results Count**: Shows how many nodes match

4. **Search Examples**
   - Search for "email" - finds "email.google.com" and "Check Email" task
   - Search for "dark" - finds "Dark Mode" preference
   - Search for "user" - finds the main "User" node
   - Search for "preference" - finds all preference nodes by type

### Keyboard Shortcuts for Search

- **Enter** - Execute search
- **Escape** - Clear search and reset selection
- **Tab** - Navigate through UI elements

### Visual Feedback

When you search:
1. **Toast notification** shows number of results found
2. **Selected node** appears larger (size 25 vs 15)
3. **Camera animates** to center on the selected node
4. **Node details panel** opens on the right showing:
   - Node ID
   - Node type (with color coding)
   - Metadata (if any)
   - All connections to other nodes

### Current Mock Data

The knowledge graph includes:
- 1 User node (central hub)
- 3 Preference nodes (Dark Mode, Large Text, Voice Speed)
- 3 Website nodes (email.google.com, weather.com, news.ycombinator.com)
- 2 Task nodes (Check Email, Read News)
- 2 Memory nodes (user behavior patterns)
- 12 Edges connecting them

## Additional Features

### Theme Toggle
- Click the sun/moon/contrast icon in the header
- Cycles through: Light → Dark → High Contrast

### Text Scaling
- Click the "A" icon in the header
- Adjust slider from 80% to 200%
- Supports WCAG 2.2 text scaling requirements

### Speech Controls
- Click the volume icon in the header
- Adjust speech rate, pitch, and volume
- Toggle auto-speak for chat responses

### Chat Interface
1. Type a message in the chat input
2. Watch it stream in real-time (mock response)
3. Click the speaker icon on any message to hear TTS
4. Try "hello", "search for news", or "check weather"

### Session History
1. Navigate to "Session History" in sidebar
2. View 4 mock browsing sessions
3. Click any session to see details
4. Search sessions by title or description

### Table View (Accessible)
1. In Knowledge Graph view, click "Table View"
2. See all nodes in an accessible data table
3. Search the table with the search box
4. Shows: Label, Type, Connections, ID

## Testing Accessibility

### Keyboard Navigation
```bash
# Navigate the entire app using only Tab and Enter
Tab      - Move between interactive elements
Enter    - Activate buttons and select items
Escape   - Close modals, clear search
Arrow    - Navigate within lists
```

### Screen Reader Testing (macOS)
```bash
# Enable VoiceOver
Cmd + F5

# Navigate with VoiceOver
VO + Right Arrow  - Next element
VO + Left Arrow   - Previous element
VO + Space        - Activate element
```

### Screen Reader Testing (Windows)
Download NVDA (free) and test with:
- Insert + Down Arrow - Read next line
- Insert + Up Arrow - Read previous line
- Insert + Space - Activate element

## Build for Production

```bash
# Build all processes
npm run build

# Package for your platform
npm run dist

# Output will be in dist/ folder
```

## Troubleshooting

### Graph Not Showing
If the knowledge graph appears blank:
1. Check browser console for Sigma.js errors
2. Try switching to Table View to verify data loaded
3. Refresh the page (Cmd+R or Ctrl+R)

### Search Not Working
1. Check that graph data loaded (switch to Table View)
2. Try searching for "user" (should always exist)
3. Check browser console for errors

### TypeScript Errors
```bash
npm run typecheck
```

### Rebuild Everything
```bash
rm -rf node_modules dist dist-electron
npm install --legacy-peer-deps
npm run build
```

## Project Structure Reference

```
src/
├── main/                    # Electron main process
│   ├── index.ts            # App entry point
│   └── ipc/handlers/       # Backend placeholders
│       ├── chat.ts         # Mock streaming chat
│       ├── knowledge-graph.ts  # Graph data & search
│       ├── session.ts      # Session history
│       └── speech.ts       # TTS coordination
│
├── preload/                # IPC bridge
│   └── index.ts           # window.electron API
│
└── renderer/              # React UI
    ├── components/
    │   ├── ChatInterface/
    │   ├── KnowledgeGraph/  # Graph viz & query
    │   │   ├── GraphControls.tsx    # NEW: Search UI
    │   │   ├── GraphVisualization.tsx  # NEW: Highlight
    │   │   └── NodeDetails.tsx
    │   ├── SessionHistory/
    │   └── Layout/
    ├── hooks/
    │   ├── useIPC.ts      # electron.searchGraph()
    │   └── useSpeech.ts   # TTS functionality
    └── store/             # Zustand state
        └── graph.ts       # selectedNode state
```

## Query Implementation Details

### Frontend (GraphControls.tsx)
```typescript
// Search with backend + local fallback
const results = await electron.searchGraph(query)
if (results.nodes) {
  setSelectedNode(results.nodes[0])  // Select first result
}
```

### Backend (knowledge-graph.ts)
```typescript
// IPC handler filters nodes by label/type
GRAPH_SEARCH: async (_event, query: string) => {
  const filteredNodes = graphData.nodes.filter(node =>
    node.label.toLowerCase().includes(query.toLowerCase())
  )
  return { nodes: filteredNodes }
}
```

### Visualization (GraphVisualization.tsx)
```typescript
// Highlights selected node and centers camera
useEffect(() => {
  if (selectedNode) {
    graph.setNodeAttribute(selectedNode.id, 'size', 25)
    camera.animate({ x: nodeX, y: nodeY })
  }
}, [selectedNode])
```

## Next Steps

1. **Test the Query Feature**
   - Run `npm run dev`
   - Go to Knowledge Graph
   - Try searching for different terms
   - Observe visual feedback

2. **Customize Mock Data**
   - Edit `src/main/ipc/handlers/knowledge-graph.ts`
   - Add more nodes and edges
   - Restart the app to see changes

3. **Integrate Real Backend**
   - Replace mock data with actual memory system
   - Connect to your knowledge graph database
   - Update search logic for complex queries

4. **Add Advanced Queries**
   - Relationship traversal ("find all connected to X")
   - Attribute filtering ("show all websites visited today")
   - Graph algorithms (shortest path, clustering)

## Support

- Check IMPLEMENTATION.md for full feature documentation
- Check README.md for general information
- Review PRD.md for product requirements

---

**Note**: This is a UI prototype with placeholder backend. All data is mocked for demonstration purposes. The search functionality is ready to connect to a real backend by updating the IPC handlers.

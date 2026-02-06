# # Surf - Speech-Driven Web Assistant

A modern, accessibility-focused Electron application designed to help users with disabilities browse the web using voice commands.

## Features

- **Chat Interface**: Conversational UI with streaming responses and voice narration
- **Knowledge Graph**: Visual representation of user preferences, browsing history, and learned behaviors
- **Session History**: Track and resume previous browsing sessions
- **Full Accessibility Support**: WCAG 2.2 AA compliant with screen reader support
- **Speech Integration**: Text-to-speech for all responses with customizable voice settings
- **Multiple Themes**: Light, dark, and high-contrast modes
- **Text Scaling**: Support for text sizes up to 200%
- **Reduced Motion**: Respects user preferences for animations

## Tech Stack

- **Electron 30+** with **electron-vite**
- **React 19** with TypeScript
- **Tailwind CSS** for styling
- **shadcn/ui** components (Radix UI primitives)
- **Sigma.js** for knowledge graph visualization
- **Zustand** for state management
- **Web Speech API** for text-to-speech

## Getting Started

### Prerequisites

- Node.js 20+ and npm 10+

### Installation

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Package for distribution
npm run dist
```

## Project Structure

```
surf-app/
├── src/
│   ├── main/           # Electron main process
│   ├── preload/        # IPC bridge (security)
│   └── renderer/       # React UI application
│       ├── components/
│       ├── hooks/
│       ├── store/
│       └── lib/
├── resources/          # App icons and resources
└── dist/              # Built application
```

## Keyboard Shortcuts

- **Tab**: Navigate between interactive elements
- **Enter**: Send message in chat
- **Shift+Enter**: New line in message input
- **Escape**: Cancel/close dialogs

## Accessibility Features

### Screen Reader Support
- Semantic HTML with proper ARIA labels
- Live regions for dynamic content updates
- Descriptive labels for all interactive elements

### Keyboard Navigation
- Full keyboard support for all features
- Visible focus indicators (4.5:1 contrast)
- Skip links for efficient navigation

### Visual Accessibility
- High contrast mode option
- Text scaling up to 200%
- Respects system color scheme preferences

### Speech Features
- Automatic text-to-speech for responses
- Adjustable speech rate, pitch, and volume
- Visual feedback during speech playback

## Backend Integration

**Note**: This is currently a UI-only implementation with placeholder backend services. All data is mocked for demonstration purposes.

### Placeholder Services:
- Chat streaming responses
- Knowledge graph data
- Session history
- Browser automation (not implemented)
- Speech-to-text (not implemented)

## Development

```bash
# Type checking
npm run typecheck

# Linting
npm run lint

# Run tests
npm run test

# Run accessibility tests
npm run test:a11y
```

## Testing

### Manual Testing Checklist
1. Navigate using Tab key only
2. Toggle between light/dark/high-contrast themes
3. Test text scaling from 80% to 200%
4. Verify voice narration for chat messages
5. Navigate knowledge graph with keyboard
6. Switch to accessible table view
7. Test with screen reader (VoiceOver/NVDA)

## License

MIT

## Support

For issues and feature requests, please visit the project repository.

# Surf: Accessibility-Focused Web Assistant

## 1. Overview

### 1.1 Product Summary

Surf is an accessibility-focused web assistant that empowers users with physical disabilities, visual impairments, or cognitive challenges (e.g., dementia) to interact seamlessly with the web using natural speech.

Through speech-driven browser automation, a personalized memory and preference system, and a multimodal chat interface, Surf redefines independence and usability for those who face barriers in traditional web navigation.

---

## 2. Target Users

### 2.1 Primary Target Group: Physically Disabled & Hard of Seeing Users

People who cannot easily use mouse or keyboard input or struggle with small visual cues. Surf allows them to browse via spoken commands, receive real-time feedback, and visualize context in accessible formats including audio narration, magnified text, and graph layouts.

### 2.2 Secondary Target Group: Neurodivergent Users

Users who benefit from structured, memory-assisted UI experiences (e.g., those with dementia, ADHD, or autism). Surf helps by remembering preferences, routine tasks, and previous browsing journeys, presented as an easy-to-understand knowledge graph.

---

## 3. Product Goals & Objectives

**Goal 1:** Enable fully agentic browser interaction using only speech or minimal manual input.

**Goal 2:** Build a persistent memory system that understands user habits and context across sessions.

**Goal 3:** Provide a transparent, assistive chat interface that supports multimodal visualization and progress tracking.

**Goal 4:** Ensure compliance with web accessibility standards (WCAG 2.2) and minimize cognitive load.

---

## 4. Core Modules and Features

### 4.1 Agentic Browser Automation Module

**Purpose:** Allow users to navigate and control the web entirely through voice commands via the BrowserUse framework.

#### Key Features

- **Speech-to-intent translation:** Convert voice commands (e.g., "Open my email," "Search recipes without nuts") into structured browser agents.
- **Task execution:** Support multi-step browsing actions such as logging in, filling forms, or summarizing pages.
- **Real-time visualization:** Display live automation progress (e.g., "Visiting site → Searching → Extracting result").
- **Accessibility aid:** Read out steps audibly for visually impaired users or provide haptic/audio feedback for confirmation.

#### Technical Notes

- Built on browser-use agents with speech layer for command ingestion.
- Ensure fallback for manual correction via text input.

---

### 4.2 Memory Bank & Knowledge Graph Module

**Purpose:** Build a dynamic, persistent layer that captures user preferences, browsing habits, and contextual data.

#### Key Features

- **Session extraction:** Log structured data from prior browsing (e.g., sites, tasks, preferences).
- **Knowledge graph view:** Visualize relationships between interests, tasks, and preferences using Sigma.js.
- **Semantic querying:** Users can ask, "Show my past searches about travel," or "What news topics did I read last week?"
- **Profile adaptation:** Automatically tailor browsing automation based on user behavior (e.g., prefer larger text sites, summarize articles vs. open them).

#### Technical Notes

- Graph backend powered by embedded database (e.g., Neo4j, or graph-like schema in Supabase/Postgres).
- Retrieval layer via vector search for contextual memory recall.
- Export/import mechanism for memory portability.

---

### 4.3 User Interface Module

**Purpose:** Provide a chat-first and visual experience with accessibility layers.

#### Key Features

**Chat Interface**
- Central hub for user-agent dialogue.
- Streams intermediate chain-of-thought (without exposing sensitive reasoning) and automation progress from browseruse runs.
- Allows mixed input: speech, text, or audio controls.

**Knowledge Graph Rendering**
- Built using Sigma.js with zoom and filter options.
- Clickable nodes for quick reactivation ("Resume session about banking forms").

**Session History**
- List view of past browsing missions with timestamps, notes, and outcomes.
- Replay or continue from prior state.

**Accessibility Considerations**
- High-contrast themes and voice narration.
- Option for simplified layout (for users with cognitive or visual strain).
- WCAG-compliant font scaling and ARIA annotations.

---

## 5. User Journey Example

**User:** A visually impaired user named Surf.

1. Surf says, "Open the local grocery site and find discounts on fruits."
2. The agent interprets, opens the site, searches for offers, and narrates actions aloud.
3. During execution, the UI shows a live progress stream: "Visiting fairprice.com → Searching 'fruit discounts' → Extracting deals."
4. Surf stores this interaction in the Memory Bank.
5. Later, Surf asks, "What sites did I use last week to find fruit offers?" Surf retrieves and visualizes them on the knowledge graph.

---
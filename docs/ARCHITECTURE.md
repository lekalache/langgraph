# Architecture Documentation

## System Overview

This is an optimized agentic AI system built with LangGraph that uses the ReACT (Reasoning + Acting) pattern for autonomous task execution with real-time web search and browser automation capabilities.

## Core Architecture

### 1. WebSocket Server (`src/server/web-server.ts`)

**Purpose**: Real-time bidirectional communication between client and agent

**Key Features**:
- WebSocket-based communication for streaming responses
- Session management with conversation history (max 50 messages per session)
- Request classification system
- Planning and execution orchestration
- Tool execution with timeout protection

**Flow**:
```
Client → WebSocket Connection → Server
  ↓
Classification → Planning → Execution → Response
  ↓
Streaming back to client in chunks
```

### 2. ReACT Agent (`src/core/react-agent.ts`)

**Purpose**: Enable tool use with models that don't support native function calling

**Key Concept**: ReACT = Reasoning + Acting

**Pattern**:
```
Thought: [Agent reasons about what to do]
Action: [Tool name]
Action Input: [Tool parameters as JSON]
PAUSE

[System executes tool]

Observation: [Tool result]

[Repeat until done]

Final Answer: [Agent's response to user]
```

**Implementation**:
```typescript
// Create ReACT system prompt
createReACTPrompt(): string

// Parse model's text response
parseReACTResponse(response: string): ReACTResult

// Execute the requested tool
executeReACTAction(action: ReACTAction): Promise<string>
```

**Example Flow**:
```
User: "What's the latest news about AI?"

Iteration 1:
  Thought: I need to search the web for latest AI news
  Action: web_search
  Action Input: {"query": "latest AI news 2024"}
  → Observation: [10 search results from Tavily]

Iteration 2:
  Thought: I have good information, I can provide an answer
  Final Answer: Based on recent news, here are the latest AI developments...
```

### 3. Tools System (`src/core/tools.ts`)

**Purpose**: Extend agent capabilities with specific functions

**Available Tools**:

#### Web Search (Tavily API)
```typescript
webSearchTool({query: string})
```
- Returns 10 search results with AI summary
- Relevance scores for each result
- Optimized for agent consumption
- ~3-5 seconds execution time

#### Browser Navigation (Playwright)
```typescript
browserNavigateTool({url: string})
```
- Navigate to any URL
- Extract page content (title + text)
- Removes scripts, styles, nav, footer, header
- Returns up to 5000 chars
- Browser instance reused for performance

#### Browser Extract (Playwright)
```typescript
browserExtractTool({
  url: string,
  selector?: string,
  searchText?: string
})
```
- Extract specific content using CSS selectors
- Search for text on page
- Flexible data extraction

#### Calculator
```typescript
calculatorTool({expression: string})
```
- Evaluate mathematical expressions
- Instant execution

#### Date/Time
```typescript
datetimeTool({format: "full" | "date" | "time"})
```
- Current date and time
- Multiple format options

#### Notes
```typescript
noteTool({key: string, content: string})
getNoteTool({key: string})
listNotesTool({})
```
- In-memory note storage
- Persistent within session

### 4. Request Classification

**Purpose**: Categorize user queries for appropriate handling

**Categories**:
1. **code** - Programming questions, debugging, frameworks
2. **calculation** - Math problems, arithmetic
3. **research** - Web searches, fact-finding
4. **creative** - Writing, content creation
5. **general** - Casual conversation

**Process**:
```typescript
const classification = await classifyRequest(userMessage);
// Uses separate model without tools to ensure clean JSON
```

**Example**:
```json
{
  "type": "research",
  "reasoning": "User asking about factual information requiring web search"
}
```

### 5. Planning System

**Purpose**: Break down complex tasks into steps

**Triggered For**: code, research, creative tasks

**Process**:
```typescript
const plan = await createPlan(message, classificationType);
// Returns: ["Step 1", "Step 2", "Step 3"]
```

**Auto-Approval**: Plans are automatically approved and executed immediately. The plan is displayed to the user for transparency, but no confirmation is required. This provides a seamless, uninterrupted flow.

## Agent Flow

### Complete Request Flow

```
┌─────────────────────────────────────────────────────────┐
│                   User Message                           │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
            ┌────────────────────┐
            │  Classification    │
            │                    │
            │  • Analyzes query  │
            │  • Determines type │
            │  • No delays ✓     │
            └─────────┬──────────┘
                      │
                      ▼
            ┌────────────────────┐
            │   Planning         │  (if code/research/creative)
            │                    │
            │  • Creates steps   │
            │  • Auto-approved ✓ │
            │  • No delays ✓     │
            └─────────┬──────────┘
                      │
                      ▼
            ┌────────────────────┐
            │  ReACT Loop        │
            │  (Max 10 iter)     │
            │                    │
            │  ┌──────────────┐  │
            │  │ Model        │  │
            │  │ Invocation   │  │
            │  └──────┬───────┘  │
            │         │           │
            │    ┌────┴─────┐    │
            │    │          │    │
            │    ▼          ▼    │
            │ ┌──────┐  ┌──────┐│
            │ │Final │  │Tool  ││
            │ │Answer│  │Call  ││
            │ └──┬───┘  └───┬──┘│
            │    │          │    │
            │    │      ┌───▼───┐│
            │    │      │Execute││
            │    │      │Tool   ││
            │    │      │(30s   ││
            │    │      │timeout)││
            │    │      └───┬───┘│
            │    │          │    │
            │    │   ┌──────▼──┐ │
            │    │   │Add Obs  │ │
            │    │   │to       │ │
            │    │   │History  │ │
            │    │   └──────┬──┘ │
            │    │          │    │
            │    │    ┌─────▼──┐ │
            │    │    │Continue│ │
            │    │    │Loop    │ │
            │    │    └────────┘ │
            └────┼─────────────────┘
                 │
                 ▼
        ┌────────────────┐
        │ Stream Response│
        │                │
        │ • 10 words/    │
        │   chunk        │
        │ • 20ms delay   │
        │ • 60% faster ✓ │
        └────────────────┘
```

### WebSocket Message Types

**Client → Server**:
```typescript
// User sends message
{type: "chat", content: "user message"}

// Clear conversation
{type: "clear"}

// Legacy (kept for backwards compatibility, no longer used)
{type: "confirm", action: "proceed"}
```

**Server → Client**:
```typescript
// Agent step notification
{type: "agent-step", step: "classification|planning|thinking", content: "..."}

// Classification result
{type: "classification", classification: {type, reasoning}}

// Plan created (auto-approved, no confirmation needed)
{type: "plan", plan: ["step1", "step2"]}

// Tool being called
{type: "tool-call", toolName: "...", toolArgs: {...}, toolId: "..."}

// Tool result (2000 chars max, 4x more than before)
{type: "tool-result", toolName: "...", result: "...", toolId: "..."}

// Streaming response
{type: "stream-start"}
{type: "stream-chunk", content: "chunk of text"}
{type: "stream-end"}

// Error
{type: "error", content: "error message"}
```

## Performance Optimizations

### Implemented Optimizations

1. **Removed Artificial Delays** ✅
   - Classification: 0ms (was 800ms)
   - Planning: 0ms (was 300ms)
   - Thinking: 0ms (was 300ms)

2. **Streaming Optimization** ✅
   - Before: 1 word per 50ms = 5s for 100 words
   - After: 10 words per 20ms = 0.2s for 100 words
   - **60% faster**

3. **Tool Result Display** ✅
   - Before: 500 characters
   - After: 2000 characters
   - **4x more context**

4. **Tool Timeout Protection** ✅
   ```typescript
   const toolPromise = executeReACTAction(action);
   const timeoutPromise = new Promise((_, reject) =>
     setTimeout(() => reject(new Error("timeout")), 30000)
   );
   const result = await Promise.race([toolPromise, timeoutPromise]);
   ```

5. **Browser Optimization** ✅
   - Singleton browser instance (reused across requests)
   - Smart page loading: `waitForLoadState("networkidle")` vs fixed 2000ms
   - **25-75% faster** depending on page

### Performance Results

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Classification | 800ms delays | 0ms | **100% faster** |
| Streaming | 50ms/word | 20ms/10 words | **60% faster** |
| Browser load | 2000ms fixed | 500-1500ms smart | **25-75% faster** |
| Tool context | 500 chars | 2000 chars | **4x more** |
| Simple query | 2-3s | 1-1.5s | **50% faster** |
| Research query | 8-12s | 5-8s | **40% faster** |

See [FLOW_ANALYSIS.md](../FLOW_ANALYSIS.md) for detailed analysis.

## Data Flow

### Message History Management

```typescript
// Session storage
const sessions = new Map<string, BaseMessage[]>();

// Add user message
history.push(new HumanMessage(content));

// Cap history to prevent memory issues
if (history.length > MAX_HISTORY_LENGTH) {
  history.splice(0, history.length - MAX_HISTORY_LENGTH);
}

// ReACT system prompt added for new conversations
if (history.length === 1) {
  const reactPrompt = createReACTPrompt();
  history.unshift(new SystemMessage(reactPrompt));
}
```

### State Updates

Each ReACT iteration updates history:

```typescript
// After tool execution
const interactionText = `${modelResponse}\n\nObservation: ${toolResult}\n\n`;
history.push(new AIMessage(interactionText));

// Model sees full context in next iteration
const response = await model.invoke(history);
```

## Browser Management

### Singleton Pattern

```typescript
let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserInstance) {
    browserInstance = await chromium.launch({ headless: true });
  }
  return browserInstance;
}

export async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}
```

### Page Lifecycle

```typescript
async function browserNavigate({ url }) {
  let page: Page | null = null;
  try {
    const browser = await getBrowser();  // Reuse instance
    page = await browser.newPage();

    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 5000 })
      .catch(() => {}); // Continue if doesn't idle

    // Extract content...

  } finally {
    if (page) await page.close();  // Always cleanup page
  }
}
```

## Security Considerations

### Input Validation
- Calculator uses `Function()` constructor (⚠️ replace in production)
- Browser URLs should be validated
- Tool parameters validated by Zod schemas

### API Keys
- Stored in `.env` file
- Never committed to version control
- Loaded via `dotenv/config`

### Tool Safety
- 30-second timeout prevents infinite hangs
- Browser instances properly cleaned up
- Error handling in all tool executions

## Testing Strategy

### Manual Testing
```bash
# Start server
npm start

# Test in browser at http://localhost:3000

# Test queries:
# 1. Simple: "What's 2+2?"
# 2. Research: "What are the latest AI trends?"
# 3. Browser: "Read content from https://example.com"
# 4. Code: "How do I use async/await in TypeScript?"
```

### Performance Testing
See optimizations in `FLOW_ANALYSIS.md`:
- Measure classification time
- Measure total response time
- Track tool execution times
- Monitor streaming speed

## Extensibility

### Adding a New Tool

```typescript
// 1. Define the tool in src/core/tools.ts
export const myNewTool = new DynamicStructuredTool({
  name: "my_new_tool",
  description: "Clear description for AI to understand when to use this",
  schema: z.object({
    param1: z.string().describe("Description of parameter"),
    param2: z.number().describe("Another parameter"),
  }),
  func: async ({ param1, param2 }) => {
    // Implementation
    return "Tool result";
  },
});

// 2. Add to allTools array
export const allTools = [
  calculatorTool,
  webSearchTool,
  // ...
  myNewTool,  // Add here
];

// 3. Agent automatically learns to use it via ReACT prompt
```

### Adding a New Message Type

```typescript
// In web-server.ts WebSocket handler
ws.on("message", async (data) => {
  const { type, ...payload } = JSON.parse(data.toString());

  if (type === "my_new_type") {
    // Handle new message type
  }
});
```

## Future Enhancements

1. **Parallel Tool Execution**
   - Detect multiple tool requests
   - Execute with `Promise.all()`
   - Combine results

2. **LRU Cache for Search Results**
   - Cache Tavily results for 5 minutes
   - Avoid duplicate searches
   - Faster responses

3. **Persistent Storage**
   - SQLite for conversation history
   - Note persistence across sessions
   - Search result caching

4. **Multi-Agent System**
   - Specialized agents for different tasks
   - Agent coordination
   - Task delegation

## Resources

- [LangGraph Docs](https://langchain-ai.github.io/langgraph/)
- [LangChain TypeScript](https://js.langchain.com/)
- [Tavily API](https://docs.tavily.com/)
- [Playwright Docs](https://playwright.dev/)
- [OpenRouter](https://openrouter.ai/docs)

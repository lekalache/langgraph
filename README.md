# LangGraph TypeScript Agent

An optimized agentic AI system built with LangGraph in TypeScript, featuring ReACT reasoning, real-time web search, browser automation, and intelligent planning.

## Quick Start

### 1. Install Dependencies
```bash
npm install
npm install playwright
npx playwright install chromium
```

### 2. Configure API Keys
```bash
cp .env.example .env
```

Edit `.env` and add your API keys:
```env
OPENROUTER_API_KEY=sk-or-v1-...     # Get from https://openrouter.ai/keys
TAVILY_API_KEY=tvly-dev-...         # Get from https://tavily.com
```

### 3. Run the Web Interface
```bash
npm start
# Open http://localhost:3000 in your browser
```

**Note**: This project uses [OpenRouter](https://openrouter.ai/) for free LLM access and [Tavily](https://tavily.com) for AI-optimized web search.

## Available Commands

| Command | Description |
|---------|-------------|
| `npm start` | Launch web interface with WebSocket server |
| `npm run build` | Compile TypeScript |
| `npm test` | Run quick API test |

## Features

- **ReACT Agent**: Thought → Action → Observation reasoning loop
- **Web Search**: Real-time search powered by Tavily API (10 results + AI summaries)
- **Browser Automation**: Navigate and extract content from any webpage with Playwright
- **Request Classification**: Automatically categorizes queries (code, research, calculation, creative, general)
- **Planning System**: Creates execution plans for complex tasks (auto-approved for seamless flow)
- **Conversation Memory**: Session-based chat history (max 50 messages)
- **Real-time Streaming**: WebSocket-based chunked response streaming (60% faster)
- **Tool Timeout Protection**: 30-second max execution time prevents hanging
- **Performance Optimized**: Removed all artificial delays, smart page loading

## Project Structure

```
.
├── src/
│   ├── core/
│   │   ├── config.ts         # Model & API configuration
│   │   ├── tools.ts          # All agent tools (search, browser, calculator, etc.)
│   │   └── react-agent.ts    # ReACT prompting & execution
│   ├── server/
│   │   └── web-server.ts     # WebSocket server & agent orchestration
│   └── ...
├── public/                   # Web interface static files
├── docs/                     # Documentation
│   ├── getting-started.md
│   ├── configuration.md
│   └── ARCHITECTURE.md
├── FLOW_ANALYSIS.md         # Performance analysis & optimizations
└── README.md                # This file
```

## Available Tools

| Tool | Description | Example |
|------|-------------|---------|
| `web_search` | Search the web using Tavily API (10 results + AI summary) | "What are the latest AI trends?" |
| `browser_navigate` | Navigate to URL and extract page content | "Read https://example.com" |
| `browser_extract` | Extract specific content using CSS selectors | "Get all links from example.com" |
| `calculator` | Evaluate mathematical expressions | "Calculate 15% of 850" |
| `get_datetime` | Get current date/time | "What's today's date?" |
| `take_note` | Save information for later | "Remember: meeting at 2pm" |
| `get_note` | Retrieve saved notes | "What did I save?" |
| `list_notes` | List all saved notes | "Show my notes" |

## Documentation

- **[Getting Started](docs/getting-started.md)** - Detailed setup and first steps
- **[Configuration](docs/configuration.md)** - API keys and model setup
- **[Architecture](docs/ARCHITECTURE.md)** - System design and ReACT implementation
- **[Flow Analysis](FLOW_ANALYSIS.md)** - Performance optimizations and benchmarks

## Example Usage

### Research Query
```
User: Is it true that Lecornu lied on his resume in France?

Classification: RESEARCH
Planning: Creating execution plan...
Tool: web_search("Sébastien Lecornu resume CV France controversy")
Result: 10 search results with AI summary

Agent analyzes results and provides answer with sources
```

### Code Help
```
User: How do I implement async/await in TypeScript?

Classification: CODE
Planning: Breaking down explanation...
Response: Detailed explanation with examples
```

### Calculator
```
User: What's 234 * 567?

Classification: CALCULATION
Tool: calculator("234 * 567")
Result: 132,678
```

## Customization

### Change Model
Edit `src/core/config.ts`:
```typescript
export const config = {
  models: {
    agent: "google/gemini-flash-1.5-8b:free",  // Or any OpenRouter model
  },
};
```

See [docs/configuration.md](docs/configuration.md) for available free models.

### Add Custom Tools
Edit `src/core/tools.ts`:
```typescript
export const myTool = new DynamicStructuredTool({
  name: "my_tool",
  description: "Clear description for the AI to understand when to use this",
  schema: z.object({
    param: z.string().describe("Description of parameter"),
  }),
  func: async ({ param }) => {
    // Your tool logic here
    return "Tool result";
  },
});

// Add to allTools array
export const allTools = [
  calculatorTool,
  webSearchTool,
  // ... other tools
  myTool,  // Add here
];
```

## Performance Metrics

After optimization (see [FLOW_ANALYSIS.md](FLOW_ANALYSIS.md)):

| Metric | Improvement |
|--------|-------------|
| Classification flow | 100% faster (removed 800ms delays) |
| Response streaming | 60% faster (chunk-based vs word-by-word) |
| Browser navigation | 25-75% faster (smart loading) |
| Tool result display | 4x more context (2000 vs 500 chars) |
| Overall simple query | ~50% faster (2-3s → 1-1.5s) |
| Overall research query | ~40% faster (8-12s → 5-8s) |

## Tech Stack

- **LangChain** - AI framework
- **LangGraph** - Agent orchestration (ReACT pattern)
- **OpenRouter** - Free LLM access (DeepSeek R1T2 Chimera)
- **Tavily** - AI-optimized web search API
- **Playwright** - Browser automation
- **WebSocket** - Real-time bidirectional communication
- **Express** - Web server
- **TypeScript** - Type-safe development

## Next Steps

- Read the [Getting Started Guide](docs/getting-started.md)
- Check the [Configuration Guide](docs/configuration.md) for API setup
- Explore the [Architecture Documentation](docs/ARCHITECTURE.md) for ReACT details
- Review [FLOW_ANALYSIS.md](FLOW_ANALYSIS.md) for performance insights

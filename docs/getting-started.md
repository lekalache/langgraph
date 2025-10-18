# Getting Started with Your Agentic AI

Welcome! You now have a fully functional agentic AI system with advanced capabilities.

## What You've Got

A production-ready LangGraph agent featuring:

- **Memory**: Remembers all conversations
- **Planning**: Breaks down complex tasks
- **Reasoning**: Deep analysis and decision-making
- **Tools**: Calculator, notes, search, and more
- **Human-in-the-Loop**: Interactive approvals
- **Non-streaming**: Complete, thoughtful responses

## Installation (3 steps)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure API Key
```bash
cp .env.example .env
```

Then edit `.env` and add your OpenAI API key:
```
OPENAI_API_KEY=sk-your-key-here
```

### 3. Run the Agent
```bash
npm run agent
```

## Your First Interaction

```bash
npm run agent
```

Try these:
```
You: Hi! My name is Sarah and I love coding.
Agent: Hello Sarah! ...

You: What's my name?
Agent: Your name is Sarah.

You: Calculate 15% of 850
Agent: [Uses calculator] The result is 127.5

You: exit
```

## Commands Available

| Command | What it does |
|---------|-------------|
| `npm run agent` | Interactive agent (start here!) |
| `npm run dev` | Run automated examples |
| `npm run simple` | Simple chatbot example |
| `npm run build` | Compile to JavaScript |

## Project Files

```
langgraph/
├── src/
│   ├── agent.ts         ⭐ Main agent (start here)
│   ├── memory.ts        💾 Conversation persistence
│   ├── human-input.ts   👤 Interactive input
│   ├── reasoning.ts     🧠 Planning & analysis
│   ├── tools.ts         🔧 Agent capabilities
│   ├── examples.ts      📚 Example code
│   └── index.ts         🎯 Simple example
├── README.md            📖 Full documentation
├── USAGE.md            📘 Usage guide
├── ARCHITECTURE.md     🏗️  System architecture
└── GETTING_STARTED.md  👈 You are here
```

## Try These Examples

### Example 1: Memory
```
You: Take a note: Project deadline is Friday
Agent: Note saved

You: Take a note: Team meeting at 2pm
Agent: Note saved

You: List my notes
Agent: [Shows both notes]
```

### Example 2: Planning
```
You: Help me plan a step-by-step approach to learning Python
Agent: [Creates detailed plan]
1. Install Python and set up environment
2. Learn basic syntax...
3. Practice with projects...
```

### Example 3: Tools
```
You: What's the date? Also calculate 234 * 567
Agent: [Uses both tools and responds]
```

### Example 4: Reasoning
```
You: Why should I use TypeScript instead of JavaScript?
Agent: [Provides detailed analysis with reasoning]
```

## Understanding the Agent

### How It Works

```
Your Message
    ↓
Planning (breaks down complex tasks)
    ↓
Reasoning (analyzes the situation)
    ↓
Agent (makes decisions, uses tools)
    ↓
Response
```

### When It Uses Tools

The agent automatically decides when to use tools:
- Math question? → Uses calculator
- Needs to remember? → Uses notes
- Needs time? → Uses datetime

### When It Asks for Input

The agent asks for human input when:
- It needs clarification
- It wants approval
- A decision is required

## Next Steps

### 1. Explore the Examples
```bash
npm run dev
```
This runs automated examples showing all features.

### 2. Read the Docs
- `README.md` - Overview and features
- `USAGE.md` - Detailed usage guide
- `ARCHITECTURE.md` - How it works

### 3. Customize It

**Add a new tool** (src/tools.ts):
```typescript
export const weatherTool = new DynamicStructuredTool({
  name: "get_weather",
  description: "Get weather for a location",
  schema: z.object({
    location: z.string(),
  }),
  func: async ({ location }) => {
    return `Weather in ${location}: Sunny, 72°F`;
  },
});

// Add to allTools array
export const allTools = [..., weatherTool];
```

**Change agent behavior** (src/agent.ts):
- Modify system prompts
- Adjust planning logic
- Change routing decisions

**Add reasoning capabilities** (src/reasoning.ts):
- New analysis methods
- Different planning strategies
- Custom decision-making

## Tips for Best Results

1. **Be Specific**: "Calculate 15% of 850" is better than "do some math"
2. **Use Tools**: Ask it to calculate, take notes, etc.
3. **Complex Tasks**: Let it create a plan for multi-step tasks
4. **Memory**: It remembers - reference previous conversations
5. **Clear Memory**: Type `clear` if starting a new topic

## Common Issues

### "Cannot find module"
```bash
npm install
```

### "Invalid API key"
Check your `.env` file has the correct `OPENAI_API_KEY`

### Agent seems confused
```
Type: clear
```
This resets the conversation memory.

### TypeScript errors
```bash
npm run build
```
Fix any errors shown, then try again.

## What's Next?

### Level 1: Use It
- Run the agent
- Try different queries
- Test all features

### Level 2: Customize It
- Add your own tools
- Modify agent prompts
- Adjust planning logic

### Level 3: Extend It
- Add persistent storage (SQLite/Postgres)
- Integrate external APIs
- Add more reasoning capabilities
- Build multi-agent systems

## Resources

- **LangGraph Docs**: https://langchain-ai.github.io/langgraph/
- **LangChain TypeScript**: https://js.langchain.com/
- **OpenAI API**: https://platform.openai.com/

## Support

Found a bug or have a question?
1. Check the documentation files
2. Review the code comments
3. Look at the examples

## Architecture at a Glance

```
┌─────────────────────────────────────┐
│         Your Message                │
└──────────────┬──────────────────────┘
               │
               ▼
        ┌──────────────┐
        │  Planning    │  Creates step-by-step plans
        └──────┬───────┘
               │
               ▼
        ┌──────────────┐
        │  Reasoning   │  Analyzes deeply
        └──────┬───────┘
               │
               ▼
        ┌──────────────┐
        │    Agent     │  Decides & acts
        └──────┬───────┘
               │
         ┌─────┴─────┐
         ▼           ▼
     ┌────────┐  ┌──────────┐
     │ Tools  │  │  Human   │
     └────────┘  │  Input   │
                 └──────────┘
```

## Key Features Explained

### 🧠 Planning
- Automatically detects complex tasks
- Creates numbered step-by-step plans
- Tracks progress through the plan

### 💭 Reasoning
- Deep analysis of situations
- Considers context and history
- Makes informed decisions

### 🔧 Tools
- Calculator for math
- Notes for memory
- Date/time for temporal info
- Extensible - add your own!

### 💾 Memory
- Remembers entire conversations
- Thread-based isolation
- Persistent across interactions

### 👤 Human-in-the-Loop
- Requests approval when needed
- Interactive decision-making
- Real-time clarifications

---

**Ready to start?**
```bash
npm run agent
```

Enjoy your agentic AI! 🚀

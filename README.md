# LangGraph TypeScript Agent

A comprehensive agentic AI system built with LangGraph in TypeScript, featuring memory, planning, reasoning, and tool use.

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure API Key
```bash
cp .env.example .env
# Edit .env and add your OpenRouter API key
```

### 3. Run the Agent
```bash
npm run agent
```

**Note**: This project uses [OpenRouter](https://openrouter.ai/) with free models. See [docs/configuration.md](docs/configuration.md) for details.

## Available Commands

| Command | Description |
|---------|-------------|
| `npm start` | Launch web interface (PRIMARY) |
| `npm run terminal` | Enhanced terminal demo with visual UI |
| `npm run build` | Compile TypeScript |
| `npm test` | Run quick API test |

## Features

- **Memory**: Conversation history with checkpointing
- **Planning**: Step-by-step task breakdown
- **Reasoning**: Deep analysis and decision-making
- **Tools**: Calculator, notes, date/time, and more
- **Visual UI**: Beautiful CLI with spinners and progress indicators

## Project Structure

```
.
├── src/
│   ├── demo-wow.ts       # Enhanced demo with visual UI
│   ├── chat.ts           # Simple chatbot
│   ├── config.ts         # Model configuration
│   ├── tools.ts          # Agent tools
│   └── ...
├── docs/                 # Documentation
│   ├── getting-started.md
│   ├── configuration.md
│   └── ARCHITECTURE.md
└── README.md            # This file
```

## Documentation

- **[Getting Started](docs/getting-started.md)** - Detailed setup and first steps
- **[Configuration](docs/configuration.md)** - Model setup and OpenRouter guide
- **[Architecture](docs/ARCHITECTURE.md)** - System design and technical details

## Quick Examples

### Web Interface (Primary)
```bash
npm start

# Opens http://localhost:3000
# Features:
# - Modern chat interface in your browser
# - Launch terminal demo from web
# - Real-time AI responses
# - Clean, intuitive UI
```

### Terminal Demo
```bash
npm run terminal

# Features:
# - LLM-based request classification
# - Visual processing indicators
# - Performance metrics
# - Beautiful CLI output
```

## Customization

### Change Model
Edit `src/config.ts`:
```typescript
export const config = {
  models: {
    agent: "google/gemini-flash-1.5-8b:free",
  },
};
```

See [docs/configuration.md](docs/configuration.md) for available models.

### Add Tools
Edit `src/tools.ts`:
```typescript
export const myTool = new DynamicStructuredTool({
  name: "my_tool",
  description: "What it does",
  schema: z.object({ /* params */ }),
  func: async (params) => { /* logic */ },
});
```

## Next Steps

- Read the [Getting Started Guide](docs/getting-started.md)
- Check the [Configuration Guide](docs/configuration.md)
- Explore the [Architecture Documentation](docs/ARCHITECTURE.md)

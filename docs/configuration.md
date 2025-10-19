# Configuration Guide

This project uses two main services:
1. **OpenRouter** - For LLM access (free models available)
2. **Tavily** - For AI-optimized web search

## Required API Keys

Create a `.env` file in the project root with:

```env
# OpenRouter API (for LLM access)
OPENAI_API_KEY=sk-or-v1-...
OPENROUTER_API_KEY=sk-or-v1-...

# Tavily API (for web search)
TAVILY_API_KEY=tvly-dev-...
```

## 1. OpenRouter Setup (LLM)

### Why OpenRouter?

1. **Free Models**: Access to powerful free AI models
2. **Multiple Providers**: Switch between models without code changes
3. **Unified API**: Compatible with OpenAI SDK
4. **No Vendor Lock-in**: Easy to switch providers

### Getting Your OpenRouter API Key

1. Visit [OpenRouter](https://openrouter.ai/)
2. Sign up for a free account
3. Go to [Keys](https://openrouter.ai/keys)
4. Generate a new API key
5. Copy the key (starts with `sk-or-v1-...`)
6. Add to `.env` file

### Current Model

- **Model**: `tngtech/deepseek-r1t2-chimera:free`
- **API Endpoint**: `https://openrouter.ai/api/v1`
- **Configured in**: `src/core/config.ts`

## 2. Tavily Setup (Web Search)

### Why Tavily?

1. **AI-Optimized**: Built specifically for AI agents
2. **High-Quality Results**: Better than generic search APIs
3. **AI Summaries**: Includes AI-generated answer summaries
4. **Fast**: Optimized for agent use cases
5. **Free Tier**: 1,000 searches/month free

### Getting Your Tavily API Key

1. Visit [Tavily](https://tavily.com)
2. Sign up for a free account
3. Go to dashboard
4. Copy your API key (starts with `tvly-dev-...` or `tvly-...`)
5. Add to `.env` file

### Tavily Configuration

```typescript
// src/core/tools.ts
const tavilyClient = tavily({ apiKey: process.env.TAVILY_API_KEY });

const response = await tavilyClient.search(query, {
  maxResults: 10,           // Number of results
  includeAnswer: true,      // Include AI summary
  includeRawContent: false, // Don't include full HTML
  searchDepth: "advanced",  // Deep search mode
});
```

## Changing Models

All model configuration is centralized in `src/config.ts`:

```typescript
export const config = {
  models: {
    agent: "tngtech/deepseek-r1t2-chimera:free",      // Main agent
    reasoning: "tngtech/deepseek-r1t2-chimera:free",  // Planning/analysis
    simple: "tngtech/deepseek-r1t2-chimera:free",     // Simple examples
  },
};
```

### Available Free Models

| Model | Provider | Best For |
|-------|----------|----------|
| `tngtech/deepseek-r1t2-chimera:free` | TNG Tech | Reasoning, complex tasks (current) |
| `meta-llama/llama-3.2-3b-instruct:free` | Meta | General purpose, fast |
| `google/gemini-flash-1.5-8b:free` | Google | Fast responses, good reasoning |
| `qwen/qwen-2.5-7b-instruct:free` | Alibaba | Multilingual, coding |
| `microsoft/phi-3-mini-128k-instruct:free` | Microsoft | Long context, efficiency |
| `mistralai/mistral-7b-instruct:free` | Mistral | Balanced performance |

### Switching Models

#### Option 1: Edit config.ts (Recommended)
```typescript
// src/config.ts
export const config = {
  models: {
    agent: "google/gemini-flash-1.5-8b:free",
    reasoning: "google/gemini-flash-1.5-8b:free",
    simple: "google/gemini-flash-1.5-8b:free",
  },
};
```

#### Option 2: Use Different Models for Different Tasks
```typescript
// src/config.ts
export const config = {
  models: {
    agent: "tngtech/deepseek-r1t2-chimera:free",     // Complex reasoning
    reasoning: "google/gemini-flash-1.5-8b:free",    // Fast planning
    simple: "meta-llama/llama-3.2-3b-instruct:free", // Quick responses
  },
};
```

## Paid Models

OpenRouter also supports paid models for better performance:

```typescript
// src/config.ts
export const config = {
  models: {
    agent: "openai/gpt-4-turbo",           // OpenAI GPT-4 Turbo
    reasoning: "anthropic/claude-3-opus",  // Anthropic Claude 3
    simple: "openai/gpt-3.5-turbo",        // Fast and cheap
  },
};
```

Check [OpenRouter Pricing](https://openrouter.ai/models) for costs.

## Model Capabilities

### DeepSeek R1T2 Chimera (Current)
- ✅ Excellent reasoning
- ✅ Good at planning
- ✅ Strong tool use
- ✅ Free tier
- ⚠️ May be slower

### Gemini Flash 1.5 8B
- ✅ Very fast
- ✅ Good reasoning
- ✅ Strong multimodal
- ✅ Free tier
- ⚠️ Rate limits apply

### Llama 3.2 3B
- ✅ Fast responses
- ✅ Good general performance
- ✅ Free tier
- ⚠️ Smaller context window

## Testing Different Models

You can test models quickly:

```typescript
// src/config.ts
export const config = {
  models: {
    agent: process.env.MODEL_NAME || "tngtech/deepseek-r1t2-chimera:free",
    reasoning: process.env.REASONING_MODEL || "tngtech/deepseek-r1t2-chimera:free",
    simple: process.env.SIMPLE_MODEL || "tngtech/deepseek-r1t2-chimera:free",
  },
};
```

Then run:
```bash
MODEL_NAME="google/gemini-flash-1.5-8b:free" npm run agent
```

## Rate Limits

Free models on OpenRouter have rate limits:
- Typically: 10-20 requests per minute
- May queue during high usage
- Consider paid tiers for production

## Best Practices

1. **Development**: Use free models
2. **Production**: Consider paid models for reliability
3. **Testing**: Try different models to find the best fit
4. **Fallbacks**: Implement error handling for rate limits

## Troubleshooting

### "Rate limit exceeded"
- Wait a minute and try again
- Switch to a different free model
- Consider upgrading to paid tier

### "Invalid API key"
- Check your `.env` file
- Verify key is active on OpenRouter
- Ensure no extra spaces

### "Model not found"
- Check model name spelling
- Visit [OpenRouter Models](https://openrouter.ai/models)
- Some models may be temporarily unavailable

## Advanced Configuration

### Custom Headers
```typescript
// src/config.ts
export const config = {
  api: {
    baseURL: "https://openrouter.ai/api/v1",
    headers: {
      "HTTP-Referer": "https://yourapp.com",
      "X-Title": "Your App Name",
    },
  },
};
```

### Per-Request Configuration
```typescript
const model = new ChatOpenAI({
  modelName: config.models.agent,
  temperature: 0.5,  // Lower for more deterministic
  maxTokens: 1000,   // Limit response length
  configuration: {
    baseURL: config.api.baseURL,
  },
});
```

## Resources

- [OpenRouter Documentation](https://openrouter.ai/docs)
- [Available Models](https://openrouter.ai/models)
- [Pricing](https://openrouter.ai/models)
- [API Status](https://status.openrouter.ai/)

## Migration from OpenAI

If you want to switch back to OpenAI:

```typescript
// src/config.ts
export const config = {
  api: {
    baseURL: undefined,  // Use default OpenAI endpoint
  },
  models: {
    agent: "gpt-4o",
    reasoning: "gpt-4o",
    simple: "gpt-4o-mini",
  },
};
```

And update `.env`:
```
OPENAI_API_KEY=sk-...  # Your OpenAI key
```

---

**Current Configuration Summary:**
- ✅ Using OpenRouter
- ✅ Free model: `tngtech/deepseek-r1t2-chimera:free`
- ✅ Centralized in `src/config.ts`
- ✅ Easy to change anytime

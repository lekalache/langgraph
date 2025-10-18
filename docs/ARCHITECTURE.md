# Architecture Documentation

## System Overview

This is a comprehensive agentic AI system built with LangGraph that combines multiple advanced features into a cohesive agent architecture.

## Core Components

### 1. Memory System (`src/memory.ts`)

**Purpose**: Provides conversation persistence across interactions

**Key Features**:
- In-memory checkpointing
- Thread-based conversation tracking
- State persistence between invocations

**Implementation**:
```typescript
class MemoryCheckpointSaver extends BaseCheckpointSaver
```

**Usage**:
- Each conversation has a unique `thread_id`
- State is automatically saved after each agent invocation
- Can clear individual threads or all memory

### 2. Human-in-the-Loop (`src/human-input.ts`)

**Purpose**: Enable interactive input during agent execution

**Key Features**:
- Synchronous input requests
- Yes/no confirmations
- Free-form text input

**When Triggered**:
- Agent needs clarification
- Approval required for actions
- User confirmation needed

### 3. Reasoning Engine (`src/reasoning.ts`)

**Purpose**: Provide strategic thinking and planning capabilities

**Methods**:
- `createPlan()`: Break down tasks into steps
- `analyze()`: Deep analysis of situations
- `reflect()`: Learn from actions
- `decide()`: Make informed choices

**Model**: Uses GPT-4o for complex reasoning

### 4. Tools (`src/tools.ts`)

**Purpose**: Extend agent capabilities with specific functions

**Available Tools**:
1. **Calculator**: Mathematical operations
2. **Web Search**: Information retrieval (mock)
3. **Note Taking**: Save/retrieve information
4. **Date/Time**: Current temporal information

**Tool Interface**:
```typescript
DynamicStructuredTool({
  name: string,
  description: string,
  schema: ZodSchema,
  func: async (params) => string
})
```

### 5. Main Agent (`src/agent.ts`)

**Purpose**: Orchestrate all components into a cohesive agent

**State Definition**:
```typescript
{
  messages: BaseMessage[],      // Conversation history
  plan: string[],                // Current execution plan
  currentStep: number,           // Progress through plan
  needsHumanInput: boolean,      // Flag for human interaction
  reasoning: string              // Analysis/reasoning cache
}
```

## Agent Flow

### Graph Structure

```
┌─────────────────────────────────────────────────────────┐
│                     START                                │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
            ┌────────────────┐
            │   Planning     │
            │  Node          │
            │                │
            │ • Analyzes     │
            │   complexity   │
            │ • Creates      │
            │   step plan    │
            └────────┬───────┘
                     │
                     ▼
            ┌────────────────┐
            │   Reasoning    │
            │  Node          │
            │                │
            │ • Deep         │
            │   analysis     │
            │ • Context      │
            │   building     │
            └────────┬───────┘
                     │
                     ▼
            ┌────────────────┐
            │   Agent        │
            │  Node          │
            │                │
            │ • LLM with     │
            │   tools        │
            │ • Decision     │
            │   making       │
            └────────┬───────┘
                     │
         ┌───────────┼───────────┐
         │           │           │
         ▼           ▼           ▼
    ┌────────┐  ┌────────┐  ┌──────┐
    │ Tools  │  │ Human  │  │ END  │
    │ Node   │  │ Input  │  │      │
    │        │  │ Node   │  └──────┘
    └───┬────┘  └───┬────┘
        │           │
        └─────┬─────┘
              │
              ▼
       [Back to Agent]
```

### Node Descriptions

#### Planning Node
- **Input**: User message
- **Process**:
  - Checks query complexity
  - Creates numbered step plan
  - Updates state with plan
- **Output**: Plan array and status message

#### Reasoning Node
- **Input**: Current state
- **Process**:
  - Analyzes situation
  - Considers context and plan
  - Generates insights
- **Output**: Reasoning/analysis string

#### Agent Node
- **Input**: Messages + context
- **Process**:
  - Invokes LLM with tools
  - Considers plan progress
  - Makes decisions
- **Output**: AI message (may include tool calls)

#### Tools Node
- **Input**: Tool calls from agent
- **Process**:
  - Executes requested tools
  - Gathers results
- **Output**: Tool result messages

#### Human Input Node
- **Input**: Request from agent
- **Process**:
  - Prompts user for input
  - Waits for response
- **Output**: Human message

### Routing Logic

The `routeAgent()` function determines the next node:

```typescript
function routeAgent(state) {
  if (needsHumanApproval) return "human_input";
  if (hasToolCalls) return "tools";
  if (taskComplete) return "end";
  return "end";
}
```

## Data Flow

### Message Flow
```
User Input
    ↓
[HumanMessage added to state]
    ↓
Planning Node (creates plan)
    ↓
Reasoning Node (analyzes)
    ↓
Agent Node (generates response)
    ↓
[AIMessage with possible tool_calls]
    ↓
Tools Node (if tool_calls exist)
    ↓
[ToolMessages added]
    ↓
Back to Agent Node
    ↓
[Final AIMessage]
    ↓
User sees response
```

### State Updates

Each node can update the state:

```typescript
// Planning Node
return {
  plan: ["step1", "step2"],
  currentStep: 0,
  messages: [new AIMessage("Created plan")]
}

// Reasoning Node
return {
  reasoning: "analysis...",
  messages: []
}

// Agent Node
return {
  messages: [response]
}
```

## Memory & Persistence

### Checkpointing Flow

```
1. User sends message
2. Agent processes → State updated
3. Checkpointer saves state
4. User sends another message
5. Checkpointer loads previous state
6. Agent has full context
```

### Thread Management

```typescript
// Each conversation thread is isolated
const config = {
  configurable: {
    thread_id: "unique_session_id"
  }
};

// Different threads = different conversations
thread_1: "User discussing project A"
thread_2: "User discussing project B"
```

## Extensibility

### Adding a New Node

```typescript
// 1. Define the node function
async function myCustomNode(state) {
  // Process state
  return { /* updates */ };
}

// 2. Add to workflow
workflow.addNode("my_node", myCustomNode);

// 3. Add edges
workflow.addEdge("previous_node", "my_node");
workflow.addEdge("my_node", "next_node");
```

### Adding State Fields

```typescript
const AgentState = Annotation.Root({
  // ... existing fields
  myNewField: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "",
  }),
});
```

### Creating Custom Tools

```typescript
export const customTool = new DynamicStructuredTool({
  name: "custom_tool",
  description: "What it does",
  schema: z.object({
    param: z.string(),
  }),
  func: async ({ param }) => {
    // Implementation
    return "result";
  },
});
```

## Performance Considerations

### Non-Streaming Design

This agent uses **non-streaming responses**:
- Complete responses generated before returning
- Full context available for decision making
- Easier debugging and state management
- Better for complex multi-step operations

### Memory Management

- Checkpoints stored in memory (RAM)
- For production: Use persistent checkpointer (SQLite, Postgres)
- Clear old threads periodically

### LLM Calls

The system makes multiple LLM calls per interaction:
1. Planning (if complex query)
2. Reasoning (if needed)
3. Agent decision making
4. Tool results processing

**Optimization**: Adjust conditions to reduce unnecessary calls

## Security Considerations

### Tool Safety

- Calculator uses `Function()` - replace in production
- Web search is mocked - integrate real API carefully
- Always validate tool inputs

### User Input

- Human input is trusted by default
- Add validation for production use
- Sanitize inputs before processing

### API Keys

- Store in `.env` file
- Never commit to version control
- Rotate keys periodically

## Testing Strategy

### Unit Tests
- Test individual nodes
- Mock LLM responses
- Validate state updates

### Integration Tests
- Test full graph execution
- Verify tool integration
- Check memory persistence

### Example Tests
```typescript
// Test planning node
const result = await planningNode({
  messages: [new HumanMessage("complex task")]
});
assert(result.plan.length > 0);
```

## Future Enhancements

1. **Streaming Support**: Add streaming for real-time responses
2. **Persistent Storage**: SQLite/Postgres checkpointer
3. **Advanced Tools**: Web scraping, API integration, file operations
4. **Multi-Agent**: Coordinate multiple specialized agents
5. **Reflection**: Learn from past interactions
6. **Evaluation**: Track performance metrics
7. **Error Recovery**: Graceful handling of failures
8. **Rate Limiting**: Manage API costs

## Debugging

### Enable Verbose Logging

Add console.log statements in nodes:
```typescript
async function agentNode(state) {
  console.log("Agent state:", JSON.stringify(state, null, 2));
  // ... rest of function
}
```

### Inspect State

```typescript
const result = await app.invoke(input, config);
console.log("Final state:", result);
```

### Check Checkpoints

```typescript
console.log("Threads:", memoryCheckpointer.getThreadIds());
```

## Resources

- [LangGraph Docs](https://langchain-ai.github.io/langgraph/)
- [LangChain TypeScript](https://js.langchain.com/)
- [OpenAI API](https://platform.openai.com/)

# API Documentation

## REST API Endpoints

### Health Check

```http
GET /api/health
```

Returns server status and current model.

**Response**:
```json
{
  "status": "ok",
  "model": "tngtech/deepseek-r1t2-chimera:free"
}
```

---

### Model Management

#### Get Available Models

```http
GET /api/models
```

Returns list of available models from OpenRouter.

**Response**:
```json
{
  "current": "tngtech/deepseek-r1t2-chimera:free",
  "available": [
    {
      "id": "tngtech/deepseek-r1t2-chimera:free",
      "name": "DeepSeek R1T2 Chimera (Free)"
    },
    {
      "id": "google/gemini-flash-1.5-8b:free",
      "name": "Gemini Flash 1.5 8B (Free)"
    }
  ],
  "supportsTools": false
}
```

#### Switch Model

```http
POST /api/models
Content-Type: application/json

{
  "modelId": "google/gemini-flash-1.5-8b:free"
}
```

**Response**:
```json
{
  "success": true,
  "model": "google/gemini-flash-1.5-8b:free",
  "supportsTools": false
}
```

---

### Conversation Export

#### Export as Markdown

```http
GET /api/export/:sessionId/markdown
```

Downloads conversation as Markdown file.

**Example**: `GET /api/export/abc123/markdown`

**Response**: Markdown file download
```markdown
# Conversation Export

**Date**: 10/19/2025, 9:30:00 PM
**Session ID**: abc123
**Model**: tngtech/deepseek-r1t2-chimera:free

---

### 👤 User

What is 2+2?

### 🤖 Assistant

The result is 4.
```

#### Export as JSON

```http
GET /api/export/:sessionId/json
```

Downloads conversation as JSON file.

**Response**: JSON file download
```json
{
  "sessionId": "abc123",
  "exportDate": "2025-10-19T21:30:00.000Z",
  "model": "tngtech/deepseek-r1t2-chimera:free",
  "messageCount": 2,
  "messages": [
    {
      "index": 0,
      "role": "human",
      "content": "What is 2+2?",
      "timestamp": "2025-10-19T21:30:00.000Z"
    },
    {
      "index": 1,
      "role": "ai",
      "content": "The result is 4.",
      "timestamp": "2025-10-19T21:30:00.000Z"
    }
  ]
}
```

#### Get Session Stats

```http
GET /api/sessions/:sessionId/stats
```

Returns statistics about a conversation session.

**Response**:
```json
{
  "sessionId": "abc123",
  "messageCount": 10,
  "userMessages": 5,
  "aiMessages": 5,
  "model": "tngtech/deepseek-r1t2-chimera:free"
}
```

---

## WebSocket API

### Connection

```javascript
const ws = new WebSocket('ws://localhost:3000');
```

### Message Types

#### Client → Server

**Send Chat Message**:
```json
{
  "type": "chat",
  "content": "What is the weather today?"
}
```

**Clear Conversation**:
```json
{
  "type": "clear"
}
```

#### Server → Client

**Agent Step Notification**:
```json
{
  "type": "agent-step",
  "step": "classification|planning|thinking|executing",
  "content": "Analyzing request type..."
}
```

**Classification Result**:
```json
{
  "type": "classification",
  "classification": {
    "type": "research|code|calculation|creative|general",
    "reasoning": "User is asking about..."
  }
}
```

**Plan Created** (auto-approved):
```json
{
  "type": "plan",
  "plan": [
    "Step 1: Search for weather data",
    "Step 2: Extract current temperature",
    "Step 3: Provide formatted response"
  ]
}
```

**Tool Call**:
```json
{
  "type": "tool-call",
  "toolName": "web_search",
  "toolArgs": {"query": "weather today"},
  "toolId": "react-1"
}
```

**Tool Result**:
```json
{
  "type": "tool-result",
  "toolName": "web_search",
  "result": "Search results for 'weather today'...",
  "toolId": "react-1"
}
```

**Streaming Response**:
```json
{"type": "stream-start"}
{"type": "stream-chunk", "content": "The weather today "}
{"type": "stream-chunk", "content": "is sunny with "}
{"type": "stream-chunk", "content": "a high of 75°F."}
{"type": "stream-end"}
```

**Error**:
```json
{
  "type": "error",
  "content": "Error message here"
}
```

---

## Available Tools

The agent has access to 11 tools:

### 1. web_search
Search the web using Tavily API
```json
{"query": "search term"}
```

### 2. browser_navigate
Navigate to a URL and extract content
```json
{"url": "https://example.com"}
```

### 3. browser_extract
Extract specific content from a webpage
```json
{
  "url": "https://example.com",
  "selector": ".article-body",  // optional
  "searchText": "keyword"       // optional
}
```

### 4. calculator
Evaluate mathematical expressions
```json
{"expression": "2 + 2 * 3"}
```

### 5. get_datetime
Get current date and time
```json
{"format": "full|date|time"}
```

### 6. execute_code
Execute JavaScript code in a sandbox
```json
{
  "code": "return [1,2,3].map(x => x * 2);",
  "timeout": 5000  // optional, max 30000
}
```

### 7. read_file
Read file contents (project directory only)
```json
{
  "filePath": "./data/config.json",
  "encoding": "utf8"  // optional: "utf8" or "base64"
}
```

### 8. write_file
Write content to a file (project directory only)
```json
{
  "filePath": "./output/result.txt",
  "content": "Hello, world!",
  "encoding": "utf8"  // optional
}
```

### 9. take_note
Save a note for later
```json
{
  "key": "meeting_notes",
  "content": "Discussed Q4 goals"
}
```

### 10. get_note
Retrieve a saved note
```json
{"key": "meeting_notes"}
```

### 11. list_notes
List all saved notes
```json
{}
```

---

## Security

### File Operations
- Limited to project directory only (prevents directory traversal)
- Cannot overwrite sensitive files (.env, package.json, etc.)
- File read size limited to 1MB
- All paths are resolved and validated

### Code Execution
- Sandboxed JavaScript execution
- No access to filesystem, network, or system APIs
- Maximum 30-second timeout
- Limited scope (no global access)

### Rate Limiting
- Not currently implemented
- Recommended for production deployments

---

## Example Usage

### Using cURL

**Get available models**:
```bash
curl http://localhost:3000/api/models
```

**Switch model**:
```bash
curl -X POST http://localhost:3000/api/models \
  -H "Content-Type: application/json" \
  -d '{"modelId": "google/gemini-flash-1.5-8b:free"}'
```

**Export conversation**:
```bash
curl http://localhost:3000/api/export/abc123/markdown -o conversation.md
curl http://localhost:3000/api/export/abc123/json -o conversation.json
```

### Using JavaScript

**WebSocket Connection**:
```javascript
const ws = new WebSocket('ws://localhost:3000');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'chat',
    content: 'What is the weather today?'
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log(message.type, message);
};
```

**HTTP API**:
```javascript
// Get models
const models = await fetch('http://localhost:3000/api/models').then(r => r.json());

// Switch model
await fetch('http://localhost:3000/api/models', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({modelId: 'google/gemini-flash-1.5-8b:free'})
});

// Export conversation
const markdown = await fetch('http://localhost:3000/api/export/abc123/markdown').then(r => r.text());
```

---

## Performance

- **Classification**: <100ms (no delays)
- **Planning**: <500ms (no delays, auto-approved)
- **Web Search**: 3-5s (cached: <100ms)
- **Browser Navigation**: 2-5s (smart loading)
- **Code Execution**: <100ms (simple scripts)
- **File Operations**: <50ms (small files)
- **Streaming**: 60% faster (chunk-based)
- **Tool Timeout**: 30s max

---

## Error Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad Request (missing parameters) |
| 404 | Not Found (session/file not found) |
| 500 | Internal Server Error |

---

## Support

For issues or questions:
- Check logs in terminal
- Review FLOW_ANALYSIS.md for performance insights
- Review ARCHITECTURE.md for system design
- Check docs/configuration.md for API key setup

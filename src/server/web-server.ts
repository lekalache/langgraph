import "dotenv/config";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import path from "path";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import config from "../core/config";
import { spawn } from "child_process";
import { allTools } from "../core/tools";

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Store chat sessions
const sessions = new Map<string, BaseMessage[]>();
const MAX_HISTORY_LENGTH = 50; // cap messages per session to prevent unbounded growth

// Determine if a model supports tool use via OpenRouter
function modelSupportsTools(modelId: string): boolean {
  // Many free OpenRouter routes do not support OpenAI tool calling.
  // Default to false here; mark true only for known tool-capable, OpenAI-compatible routes.
  const unsupported = [
    "tngtech/deepseek-r1t2-chimera:free",
    "google/gemini-flash-1.5-8b:free",
    "meta-llama/llama-3.2-3b-instruct:free",
    "meta-llama/llama-3.1-8b-instruct:free",
    "microsoft/phi-3-mini-128k-instruct:free",
    "qwen/qwen-2-7b-instruct:free",
  ];
  if (unsupported.includes(modelId)) return false;
  // Add known tool-capable routes here if you enable them in the future.
  return false;
}

function createChatModel(modelId: string) {
  const base = new ChatOpenAI({
    modelName: modelId,
    temperature: 0.7,
    configuration: {
      baseURL: config.api.baseURL,
    },
  });
  return modelSupportsTools(modelId) ? base.bindTools(allTools) : base;
}

// Initialize AI model (tools only bound if supported)
let model = createChatModel(config.models.agent);

/**
 * Classify request type using AI
 */
async function classifyRequest(message: string): Promise<{ type: string; emoji: string; reasoning: string }> {
  const classificationPrompt = `You are a request classifier. Analyze the user's message and classify it into ONE of these categories:

Categories:
1. "code" - Questions about code, debugging, programming concepts, frameworks, libraries, memory leaks, performance issues
2. "calculation" - Math problems, arithmetic, computations
3. "research" - Looking up information, finding facts, searching for data
4. "creative" - Writing stories, poems, creative content
5. "general" - Casual conversation, greetings, general questions

User message: "${message}"

Respond in this EXACT JSON format (no markdown, no extra text):
{"type": "category_name", "reasoning": "brief explanation why"}`;

  try {
    const response = await model.invoke([new HumanMessage(classificationPrompt)]);
    const content = response.content.toString().trim();

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);

      return {
        type: parsed.type,
        emoji: "",
        reasoning: parsed.reasoning
      };
    }
  } catch (error) {
    console.log('Classification fallback');
  }

  // Fallback
  const lower = message.toLowerCase();
  if (lower.includes("code") || lower.includes("debug") || lower.includes("memory") || lower.includes("langgraph")) {
    return { type: "code", emoji: "", reasoning: "Contains programming-related keywords" };
  } else if (lower.includes("calculate") || lower.includes("math") || /\d+\s*[\+\-\*\/]\s*\d+/.test(lower)) {
    return { type: "calculation", emoji: "", reasoning: "Contains math-related keywords" };
  } else if (lower.includes("research") || lower.includes("find") || lower.includes("search")) {
    return { type: "research", emoji: "", reasoning: "Contains research-related keywords" };
  } else if (lower.includes("write") || lower.includes("create") || lower.includes("poem") || lower.includes("story")) {
    return { type: "creative", emoji: "", reasoning: "Contains creative-related keywords" };
  }

  return { type: "general", emoji: "", reasoning: "Default classification" };
}

/**
 * Create a plan for complex requests
 */
async function createPlan(message: string, type: string): Promise<string[]> {
  // Only create plans for code, research, and creative tasks
  if (!['code', 'research', 'creative'].includes(type)) {
    return [];
  }

  const planningPrompt = `You are a task planner. Break down this request into 3-5 simple, actionable steps.

User request: "${message}"
Request type: ${type}

Respond with ONLY a JSON array of steps (no markdown, no extra text):
["Step 1", "Step 2", "Step 3"]`;

  try {
    const response = await model.invoke([new HumanMessage(planningPrompt)]);
    const content = response.content.toString().trim();

    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const steps = JSON.parse(jsonMatch[0]);
      return steps.slice(0, 5); // Max 5 steps
    }
  } catch (error) {
    console.log('Planning fallback');
  }

  return [];
}

// Serve static files
app.use(express.static(path.join(__dirname, "../../public")));
app.use(express.json());

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", model: config.models.agent });
});

// Get available models
app.get("/api/models", async (req, res) => {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
    // Optional but recommended by OpenRouter
    headers["HTTP-Referer"] = process.env.SITE_URL || `http://localhost:${process.env.PORT || 3000}`;
    headers["X-Title"] = process.env.APP_NAME || "LangGraph AI";

    const resp = await fetch(`${config.api.baseURL}/models`, { headers });
    if (!resp.ok) throw new Error(`OpenRouter /models failed: ${resp.status}`);
    const json = await resp.json();

    // Normalize: OpenRouter returns { data: Model[] }
    const models: any[] = Array.isArray(json?.data) ? json.data : [];

    // Filter for free routes (suffix :free)
    const free = models.filter((m) => typeof m?.id === "string" && m.id.includes(":free"));

    // Map to dropdown items
    let availableModels = free.map((m) => ({ id: m.id, name: m.name || m.id }));

    // Ensure current model is present in the list (to avoid UI mismatch)
    if (!availableModels.find((m) => m.id === config.models.agent)) {
      availableModels = [{ id: config.models.agent, name: config.models.agent }, ...availableModels];
    }

    // Deduplicate by id
    const seen = new Set<string>();
    availableModels = availableModels.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));

    res.json({
      current: config.models.agent,
      available: availableModels,
      supportsTools: modelSupportsTools(config.models.agent),
    });
  } catch (err: any) {
    // Fallback to a minimal static list
    const fallback = [
      { id: "tngtech/deepseek-r1t2-chimera:free", name: "DeepSeek R1T2 Chimera (Free)" },
    ];
    res.json({ current: config.models.agent, available: fallback, supportsTools: modelSupportsTools(config.models.agent), warning: err?.message });
  }
});

// Update model
app.post("/api/models", express.json(), (req, res) => {
  const { modelId } = req.body;
  if (!modelId) {
    return res.status(400).json({ error: "modelId is required" });
  }

  // Update the model configuration
  config.models.agent = modelId;

  // Recreate the model instance with new config (bind tools only if supported)
  model = createChatModel(config.models.agent);

  res.json({ success: true, model: config.models.agent, supportsTools: modelSupportsTools(config.models.agent) });
});

// Launch terminal demo endpoint
app.post("/api/launch-terminal", (req, res) => {
  try {
    const platform = process.platform;

    if (platform === "darwin") {
      spawn("osascript", [
        "-e",
        `tell application "Terminal" to do script "cd ${process.cwd()} && npm run terminal"`,
      ]);
    } else if (platform === "win32") {
      spawn("cmd", ["/c", "start", "cmd", "/k", "npm run terminal"]);
    } else {
      spawn("x-terminal-emulator", ["-e", "bash", "-c", "npm run terminal; exec bash"]);
    }

    res.json({ success: true, message: "Terminal demo launched!" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// WebSocket connection for real-time agentic chat
wss.on("connection", (ws: WebSocket) => {
  const sessionId = Math.random().toString(36).substring(7);
  sessions.set(sessionId, []);

  console.log(`New chat session: ${sessionId}`);

  ws.on("message", async (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());
      const { type: msgType, content, action } = message;

      if (msgType === "chat") {
        const history = sessions.get(sessionId) || [];
        history.push(new HumanMessage(content));
        // Cap history length
        if (history.length > MAX_HISTORY_LENGTH) {
          history.splice(0, history.length - MAX_HISTORY_LENGTH);
        }

        // STEP 1: Classification
        ws.send(JSON.stringify({
          type: "agent-step",
          step: "classification",
          content: "Analyzing request type..."
        }));

        await new Promise(resolve => setTimeout(resolve, 300)); // Visual delay

        const classification = await classifyRequest(content);

        ws.send(JSON.stringify({
          type: "classification",
          classification: classification
        }));

        await new Promise(resolve => setTimeout(resolve, 500));

        // STEP 2: Planning (for complex requests)
        const needsPlan = ['code', 'research', 'creative'].includes(classification.type);
        let plan: string[] = [];

        if (needsPlan) {
          ws.send(JSON.stringify({
            type: "agent-step",
            step: "planning",
            content: "Creating execution plan..."
          }));

          await new Promise(resolve => setTimeout(resolve, 300));

          plan = await createPlan(content, classification.type);

          if (plan.length > 0) {
            ws.send(JSON.stringify({
              type: "plan",
              plan: plan
            }));

            // Ask for confirmation
            ws.send(JSON.stringify({
              type: "confirmation-request",
              message: "I've created a plan. Should I proceed?"
            }));

            // Wait for user confirmation (we'll handle this with a response)
            return; // Wait for user to confirm
          }
        }

        // STEP 3: Execution
        await executeResponse(ws, history, sessionId, classification, plan);

      } else if (msgType === "confirm") {
        // User confirmed the plan, proceed with execution
  const history = sessions.get(sessionId) || [];

        ws.send(JSON.stringify({
          type: "agent-step",
          step: "execution",
          content: "Executing plan..."
        }));

        await executeResponse(ws, history, sessionId, null, []);

      } else if (msgType === "clear") {
        sessions.set(sessionId, []);
        ws.send(JSON.stringify({ type: "cleared", content: true }));
      }
    } catch (error: any) {
      ws.send(JSON.stringify({
        type: "error",
        content: `Error: ${error.message}`,
      }));
    }
  });

  ws.on("close", () => {
    console.log(`Session ended: ${sessionId}`);
    sessions.delete(sessionId);
  });
});

/**
 * Execute the actual response with streaming and tool calls
 */
async function executeResponse(
  ws: WebSocket,
  history: BaseMessage[],
  sessionId: string,
  classification: any,
  plan: string[]
) {
  try {
    ws.send(JSON.stringify({
      type: "agent-step",
      step: "thinking",
      content: "Formulating response..."
    }));

    await new Promise(resolve => setTimeout(resolve, 300));

    // Get AI response
    const response = await model.invoke(history);

  // If the current route supports tools and the model produced tool calls, handle them
  if (modelSupportsTools(config.models.agent) && response.tool_calls && response.tool_calls.length > 0) {
      // Add AI message with tool calls to history
      history.push(response);

      // Execute each tool call
      for (const toolCall of response.tool_calls) {
        ws.send(JSON.stringify({
          type: "tool-call",
          toolName: toolCall.name,
          toolArgs: toolCall.args,
          toolId: toolCall.id
        }));

        // Find and execute the tool
        const tool = allTools.find(t => t.name === toolCall.name);
        if (tool) {
          try {
            const toolResult = await tool.invoke(toolCall.args);

            ws.send(JSON.stringify({
              type: "tool-result",
              toolName: toolCall.name,
              result: toolResult,
              toolId: toolCall.id
            }));

            // Add tool result to history
            history.push({
              role: "tool",
              content: toolResult,
              tool_call_id: toolCall.id,
            } as any);

          } catch (toolError: any) {
            ws.send(JSON.stringify({
              type: "tool-error",
              toolName: toolCall.name,
              error: toolError.message,
              toolId: toolCall.id
            }));
          }
        }
      }

      // Get final response after tool execution
      ws.send(JSON.stringify({ type: "stream-start" }));

      const stream = await model.stream(history);
      let fullResponse = "";

      for await (const chunk of stream) {
        const content = chunk.content.toString();
        fullResponse += content;

        ws.send(JSON.stringify({
          type: "stream-chunk",
          content: content
        }));
      }

      ws.send(JSON.stringify({ type: "stream-end" }));

      history.push(new AIMessage(fullResponse));
      sessions.set(sessionId, history);

    } else {
      // No tool calls, stream the response directly
      ws.send(JSON.stringify({ type: "stream-start" }));

      const stream = await model.stream(history);
      let fullResponse = "";

      for await (const chunk of stream) {
        const content = chunk.content.toString();
        fullResponse += content;

        ws.send(JSON.stringify({
          type: "stream-chunk",
          content: content
        }));
      }

      ws.send(JSON.stringify({ type: "stream-end" }));

      history.push(new AIMessage(fullResponse));
      sessions.set(sessionId, history);
    }

  } catch (error: any) {
    ws.send(JSON.stringify({
      type: "error",
      content: `Error: ${error.message}`,
    }));
  }
}

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════╗
║                                                ║
║   🚀 LangGraph Agentic Web Interface          ║
║                                                ║
║   📡 Server running on:                       ║
║   🌐 http://localhost:${PORT}                      ║
║                                                ║
║   Features:                                    ║
║   ✓ Request classification                    ║
║   ✓ Planning & reasoning                      ║
║   ✓ Streaming responses                       ║
║   ✓ User confirmation                         ║
║                                                ║
║   Press Ctrl+C to stop                         ║
║                                                ║
╚════════════════════════════════════════════════╝
  `);
});

export default app;

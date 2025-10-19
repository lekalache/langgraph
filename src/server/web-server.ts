import "dotenv/config";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import path from "path";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage, BaseMessage, SystemMessage } from "@langchain/core/messages";
import config from "../core/config";
import { spawn } from "child_process";
import { allTools } from "../core/tools";
import {
  createReACTPrompt,
  parseReACTResponse,
  executeReACTAction,
  buildReACTHistory,
} from "../core/react-agent";

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Store chat sessions
const sessions = new Map<string, BaseMessage[]>();
const MAX_HISTORY_LENGTH = 50; // cap messages per session to prevent unbounded growth

// Determine if a model supports tool use via OpenRouter
function modelSupportsTools(modelId: string): boolean {
  // IMPORTANT: OpenRouter free models generally do NOT support tool calling
  // Even if the underlying model supports it, OpenRouter's free tier doesn't enable it

  // Explicitly unsupported models (free tier on OpenRouter)
  const unsupported = [
    "tngtech/deepseek-r1t2-chimera:free",
    "google/gemini-flash-1.5-8b:free",
    "meta-llama/llama-3.2-3b-instruct:free",
    "meta-llama/llama-3.1-8b-instruct:free",
    "microsoft/phi-3-mini-128k-instruct:free",
    "qwen/qwen-2-7b-instruct:free",
  ];

  if (unsupported.includes(modelId)) return false;

  // List of models known to support OpenAI-compatible tool calling on OpenRouter
  const supported = [
    // OpenAI models (paid, support tools)
    "openai/gpt-4-turbo-preview",
    "openai/gpt-4",
    "openai/gpt-4o",
    "openai/gpt-3.5-turbo",

    // Anthropic Claude models (paid, support tools)
    "anthropic/claude-3-opus",
    "anthropic/claude-3-sonnet",
    "anthropic/claude-3-haiku",
    "anthropic/claude-3.5-sonnet",

    // Google Gemini (paid, support tools)
    "google/gemini-pro-1.5",
    "google/gemini-pro",

    // Mistral models (paid, support tools)
    "mistralai/mistral-large",
    "mistralai/mistral-medium",

    // DeepSeek paid models (support tools via OpenRouter)
    "deepseek/deepseek-chat",
  ];

  // Check if the model is in the supported list
  if (supported.includes(modelId)) return true;

  // Default to false for unknown models to avoid 404 errors
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

// Separate model for classification (without tools) to ensure clean JSON responses
const classificationModel = new ChatOpenAI({
  modelName: config.models.agent,
  temperature: 0.7,
  configuration: {
    baseURL: config.api.baseURL,
  },
});

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
    const response = await classificationModel.invoke([new HumanMessage(classificationPrompt)]);
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
    const response = await classificationModel.invoke([new HumanMessage(planningPrompt)]);
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

// Export conversation as Markdown
app.get("/api/export/:sessionId/markdown", (req, res) => {
  const { sessionId } = req.params;
  const history = sessions.get(sessionId);

  if (!history || history.length === 0) {
    return res.status(404).json({ error: "Session not found or empty" });
  }

  // Convert conversation to Markdown
  let markdown = `# Conversation Export\n\n`;
  markdown += `**Date**: ${new Date().toLocaleString()}\n`;
  markdown += `**Session ID**: ${sessionId}\n`;
  markdown += `**Model**: ${config.models.agent}\n\n`;
  markdown += `---\n\n`;

  history.forEach((msg, index) => {
    const role = msg._getType();
    const content = msg.content.toString();

    if (role === "human") {
      markdown += `### 👤 User\n\n${content}\n\n`;
    } else if (role === "ai") {
      markdown += `### 🤖 Assistant\n\n${content}\n\n`;
    } else if (role === "system") {
      // Skip system messages in export
      return;
    }
  });

  res.setHeader("Content-Type", "text/markdown");
  res.setHeader("Content-Disposition", `attachment; filename="conversation-${sessionId}.md"`);
  res.send(markdown);
});

// Export conversation as JSON
app.get("/api/export/:sessionId/json", (req, res) => {
  const { sessionId } = req.params;
  const history = sessions.get(sessionId);

  if (!history || history.length === 0) {
    return res.status(404).json({ error: "Session not found or empty" });
  }

  const exportData = {
    sessionId,
    exportDate: new Date().toISOString(),
    model: config.models.agent,
    messageCount: history.length,
    messages: history.map((msg, index) => ({
      index,
      role: msg._getType(),
      content: msg.content.toString(),
      timestamp: new Date().toISOString(), // Could be enhanced with actual timestamps
    })).filter(msg => msg.role !== "system"), // Filter out system messages
  };

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="conversation-${sessionId}.json"`);
  res.json(exportData);
});

// Get session stats
app.get("/api/sessions/:sessionId/stats", (req, res) => {
  const { sessionId } = req.params;
  const history = sessions.get(sessionId);

  if (!history) {
    return res.status(404).json({ error: "Session not found" });
  }

  const stats = {
    sessionId,
    messageCount: history.length,
    userMessages: history.filter(m => m._getType() === "human").length,
    aiMessages: history.filter(m => m._getType() === "ai").length,
    model: config.models.agent,
  };

  res.json(stats);
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

        const classification = await classifyRequest(content);

        ws.send(JSON.stringify({
          type: "classification",
          classification: classification
        }));

        // STEP 2: Planning (for complex requests)
        const needsPlan = ['code', 'research', 'creative'].includes(classification.type);
        let plan: string[] = [];

        if (needsPlan) {
          ws.send(JSON.stringify({
            type: "agent-step",
            step: "planning",
            content: "Creating execution plan..."
          }));

          plan = await createPlan(content, classification.type);

          if (plan.length > 0) {
            // Display the plan to user (for transparency)
            ws.send(JSON.stringify({
              type: "plan",
              plan: plan
            }));

            // Auto-proceed with execution (no confirmation needed)
            ws.send(JSON.stringify({
              type: "agent-step",
              step: "execution",
              content: "Executing plan..."
            }));
          }
        }

        // STEP 3: Execution (auto-approved)
        await executeResponse(ws, history, sessionId, classification, plan);

      } else if (msgType === "confirm") {
        // Legacy confirmation handler (no longer used with auto-approval)
        // Kept for backwards compatibility
        const history = sessions.get(sessionId) || [];
        ws.send(JSON.stringify({
          type: "info",
          content: "Plans are now automatically approved. No confirmation needed."
        }));

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
 * Get detailed progress message for tool execution
 */
function getToolProgressMessage(toolName: string, args: any): string {
  switch (toolName) {
    case "web_search":
      return `Searching the web for: "${args.query}"...`;
    case "browser_navigate":
      return `Navigating to ${args.url}...`;
    case "browser_extract":
      return `Extracting content from ${args.url}...`;
    case "calculator":
      return `Calculating: ${args.expression}...`;
    case "get_datetime":
      return `Getting current date and time...`;
    case "take_note":
      return `Saving note: "${args.key}"...`;
    case "get_note":
      return `Retrieving note: "${args.key}"...`;
    case "list_notes":
      return `Listing all saved notes...`;
    case "execute_code":
      return `Executing JavaScript code...`;
    case "read_file":
      return `Reading file: "${args.filePath}"...`;
    case "write_file":
      return `Writing to file: "${args.filePath}"...`;
    default:
      return `Executing ${toolName}...`;
  }
}

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
    // Add ReACT system prompt if this is a new conversation
    if (history.length === 1) {
      const reactPrompt = createReACTPrompt();
      history.unshift(new SystemMessage(reactPrompt));
    }

    ws.send(JSON.stringify({
      type: "agent-step",
      step: "thinking",
      content: "Analyzing request..."
    }));

    const MAX_ITERATIONS = 10;
    let iteration = 0;

    // ReACT loop: continue until we get a Final Answer or hit max iterations
    while (iteration < MAX_ITERATIONS) {
      iteration++;
      console.log(`\n=== ReACT Iteration ${iteration} ===`);

      // Get AI response
      const response = await model.invoke(history);
      const responseText = response.content.toString();

      console.log("Model response:", responseText.substring(0, 300));

      // Parse the ReACT response
      const parsed = parseReACTResponse(responseText);

      if (parsed.isDone && parsed.finalAnswer) {
        // Model has provided final answer, stream it to user
        console.log("Final answer received");

        ws.send(JSON.stringify({ type: "stream-start" }));

        // Stream the final answer in chunks (10 words at a time for better UX)
        const words = parsed.finalAnswer.split(" ");
        for (let i = 0; i < words.length; i += 10) {
          const chunk = words.slice(i, i + 10).join(" ") + " ";
          ws.send(JSON.stringify({
            type: "stream-chunk",
            content: chunk
          }));
          await new Promise(resolve => setTimeout(resolve, 20));
        }

        ws.send(JSON.stringify({ type: "stream-end" }));

        // Save to history
        history.push(new AIMessage(responseText));
        sessions.set(sessionId, history);
        break;
      }

      if (parsed.action) {
        // Model wants to use a tool
        const { thought, action, actionInput } = parsed.action;

        console.log(`Thought: ${thought}`);
        console.log(`Action: ${action}`);
        console.log(`Action Input:`, actionInput);

        // Notify user of the tool call with detailed progress message
        const progressMessage = getToolProgressMessage(action, actionInput);
        ws.send(JSON.stringify({
          type: "tool-call",
          toolName: action,
          toolArgs: actionInput,
          toolId: `react-${iteration}`
        }));

        // Send progress indicator for long-running tools
        ws.send(JSON.stringify({
          type: "agent-step",
          step: "executing",
          content: progressMessage
        }));

        // Execute the tool with timeout (30 seconds max)
        try {
          const toolPromise = executeReACTAction(parsed.action);
          const timeoutPromise = new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error(`Tool ${action} timed out after 30 seconds`)), 30000)
          );

          const observation = await Promise.race([toolPromise, timeoutPromise]);

          console.log(`Observation (${observation.length} chars):`, observation.substring(0, 200));

          // Send tool result to user (increased from 500 to 2000 chars for better context)
          ws.send(JSON.stringify({
            type: "tool-result",
            toolName: action,
            result: observation.substring(0, 2000) + (observation.length > 2000 ? "..." : ""),
            toolId: `react-${iteration}`
          }));

          // Add the interaction to history
          const interactionText = `${responseText}\n\nObservation: ${observation}\n\n`;
          history.push(new AIMessage(interactionText));

          // Continue to next iteration
          ws.send(JSON.stringify({
            type: "agent-step",
            step: "thinking",
            content: "Processing results..."
          }));

        } catch (toolError: any) {
          console.error(`Tool error:`, toolError.message);

          const errorObs = `Error: ${toolError.message}`;

          ws.send(JSON.stringify({
            type: "tool-error",
            toolName: action,
            error: errorObs,
            toolId: `react-${iteration}`
          }));

          // Add error to history so model can recover
          const interactionText = `${responseText}\n\nObservation: ${errorObs}\n\n`;
          history.push(new AIMessage(interactionText));
        }

      } else {
        // Model didn't provide valid ReACT format, stream response as-is
        console.log("No valid action found, streaming response");

        ws.send(JSON.stringify({ type: "stream-start" }));

        const words = responseText.split(" ");
        for (let i = 0; i < words.length; i += 10) {
          const chunk = words.slice(i, i + 10).join(" ") + " ";
          ws.send(JSON.stringify({
            type: "stream-chunk",
            content: chunk
          }));
          await new Promise(resolve => setTimeout(resolve, 20));
        }

        ws.send(JSON.stringify({ type: "stream-end" }));

        history.push(new AIMessage(responseText));
        sessions.set(sessionId, history);
        break;
      }
    }

    if (iteration >= MAX_ITERATIONS) {
      ws.send(JSON.stringify({
        type: "error",
        content: "Maximum iteration limit reached. Please try rephrasing your question."
      }));
    }

  } catch (error: any) {
    console.error("executeResponse error:", error);
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
║   ✓ Auto-approved planning                    ║
║   ✓ ReACT agent with tools                    ║
║   ✓ Optimized streaming                       ║
║   ✓ LRU search caching                        ║
║                                                ║
║   Press Ctrl+C to stop                         ║
║                                                ║
╚════════════════════════════════════════════════╝
  `);
});

export default app;

import "dotenv/config";
import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { allTools } from "../core/tools";
import config from "../core/config";
import * as readline from "readline";

/**
 * Define the agent state
 */
const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
  }),
});

/**
 * Agent node - the main LLM agent with tool calling
 */
async function agentNode(state: typeof AgentState.State) {
  console.log("\n🤖 Agent thinking...");

  const model = new ChatOpenAI({
    modelName: config.models.agent,
    temperature: config.temperature,
    configuration: {
      baseURL: config.api.baseURL,
    },
  }).bindTools(allTools);

  const systemMessage = new SystemMessage(
    "You are a helpful AI assistant with access to tools. Use them when needed. Be concise and clear."
  );

  const response = await model.invoke([systemMessage, ...state.messages]);

  return {
    messages: [response],
  };
}

/**
 * Router function to decide the next step
 */
function routeAgent(state: typeof AgentState.State): string {
  const lastMessage = state.messages[state.messages.length - 1];

  // Check if the agent wants to use tools
  if (lastMessage.additional_kwargs?.tool_calls && lastMessage.additional_kwargs.tool_calls.length > 0) {
    return "tools";
  }

  return "end";
}

/**
 * Build the agent graph
 */
function createAgentGraph() {
  const workflow = new StateGraph(AgentState)
    .addNode("agent", agentNode)
    .addNode("tools", new ToolNode(allTools));

  // Define the flow
  workflow.addEdge(START, "agent");

  // Conditional routing from agent
  workflow.addConditionalEdges("agent", routeAgent, {
    tools: "tools",
    end: END,
  });

  // After tools, go back to agent
  workflow.addEdge("tools", "agent");

  // Compile without checkpointing for simplicity
  return workflow.compile();
}

/**
 * Main execution function
 */
async function main() {
  console.log("╔════════════════════════════════════════════╗");
  console.log("║   Simple LangGraph Agent                  ║");
  console.log("║   ✓ Tool Use                              ║");
  console.log("║   ✓ Non-streaming Responses               ║");
  console.log("╚════════════════════════════════════════════╝\n");

  const app = createAgentGraph();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (question: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        resolve(answer.trim());
      });
    });
  };

  try {
    let conversationHistory: BaseMessage[] = [];

    while (true) {
      const userInput = await ask("\n💬 You: ");

      if (userInput.toLowerCase() === "exit" || userInput.toLowerCase() === "quit") {
        console.log("\n👋 Goodbye!");
        break;
      }

      if (userInput.toLowerCase() === "clear") {
        conversationHistory = [];
        console.log("🗑️  Conversation cleared!");
        continue;
      }

      // Add user message to history
      conversationHistory.push(new HumanMessage(userInput));

      // Invoke the agent
      const result = await app.invoke({
        messages: conversationHistory,
      });

      // Update conversation history
      conversationHistory = result.messages;

      // Display the final response
      const lastMessage = result.messages[result.messages.length - 1];
      console.log(`\n🤖 Assistant: ${lastMessage.content}`);
    }
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
  } finally {
    rl.close();
  }
}

// Run if this is the main module
if (require.main === module) {
  main().catch(console.error);
}

export { createAgentGraph, AgentState };

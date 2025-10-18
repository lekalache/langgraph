import "dotenv/config";
import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import config from "../core/config";
import * as readline from "readline";

/**
 * Define the agent state
 */
const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
  }),
  requiresApproval: Annotation<boolean>({
    reducer: (x, y) => y ?? x,
    default: () => false,
  }),
});

// Readline interface for human input
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

/**
 * Agent node - checks if it needs approval for actions
 */
async function agentNode(state: typeof AgentState.State) {
  console.log("\n🤖 Agent analyzing request...");

  const model = new ChatOpenAI({
    modelName: config.models.agent,
    temperature: config.temperature,
    configuration: {
      baseURL: config.api.baseURL,
    },
  });

  const systemMessage = new SystemMessage(`You are a helpful AI assistant.

When the user asks you to perform any of these actions, you MUST ask for approval first:
- Deleting files or data
- Making purchases or transactions
- Sending emails or messages
- Making important decisions
- Any potentially risky action

To ask for approval, respond with: "REQUIRES_APPROVAL: [describe what you want to do]"

For regular questions and safe actions, respond normally.`);

  const response = await model.invoke([systemMessage, ...state.messages]);

  const content = response.content.toString();

  // Check if response requires approval
  if (content.includes("REQUIRES_APPROVAL:")) {
    return {
      messages: [response],
      requiresApproval: true,
    };
  }

  return {
    messages: [response],
    requiresApproval: false,
  };
}

/**
 * Human approval node
 */
async function humanApprovalNode(state: typeof AgentState.State) {
  const lastMessage = state.messages[state.messages.length - 1];
  const content = lastMessage.content.toString();

  // Extract the action that needs approval
  const match = content.match(/REQUIRES_APPROVAL:\s*(.+)/);
  const action = match ? match[1] : "this action";

  console.log(`\n⚠️  The agent wants to: ${action}`);
  const approval = await ask("\n❓ Do you approve? (yes/no): ");

  if (approval.toLowerCase() === "yes" || approval.toLowerCase() === "y") {
    console.log("✅ Approved! Proceeding...");
    return {
      messages: [new HumanMessage("Yes, you have my approval to proceed.")],
      requiresApproval: false,
    };
  } else {
    console.log("❌ Denied. Action cancelled.");
    return {
      messages: [new HumanMessage("No, I don't approve. Please don't do that.")],
      requiresApproval: false,
    };
  }
}

/**
 * Final response node - cleans up approval markers
 */
async function finalResponseNode(state: typeof AgentState.State) {
  const lastMessage = state.messages[state.messages.length - 1];

  // If last message was approval-related, get a clean response
  if (lastMessage.content.toString().includes("approval")) {
    const model = new ChatOpenAI({
      modelName: config.models.agent,
      temperature: config.temperature,
      configuration: {
        baseURL: config.api.baseURL,
      },
    });

    const response = await model.invoke([
      new SystemMessage("Provide a brief acknowledgment of the user's decision."),
      ...state.messages,
    ]);

    return {
      messages: [response],
    };
  }

  return { messages: [] };
}

/**
 * Router function
 */
function routeAgent(state: typeof AgentState.State): string {
  if (state.requiresApproval) {
    return "human_approval";
  }
  return "final_response";
}

/**
 * Build the agent graph
 */
function createAgentGraph() {
  const workflow = new StateGraph(AgentState)
    .addNode("agent", agentNode)
    .addNode("human_approval", humanApprovalNode)
    .addNode("final_response", finalResponseNode);

  workflow.addEdge(START, "agent");

  workflow.addConditionalEdges("agent", routeAgent, {
    human_approval: "human_approval",
    final_response: "final_response",
  });

  workflow.addEdge("human_approval", "agent");
  workflow.addEdge("final_response", END);

  return workflow.compile();
}

/**
 * Main execution
 */
async function main() {
  console.log("╔════════════════════════════════════════════╗");
  console.log("║   Agent with Human-in-the-Loop            ║");
  console.log("║   ✓ Asks for approval on risky actions   ║");
  console.log("║   ✓ Interactive decision making           ║");
  console.log("╚════════════════════════════════════════════╝\n");

  console.log("💡 Try asking the agent to:");
  console.log("   - Delete a file");
  console.log("   - Send an email");
  console.log("   - Make a purchase");
  console.log("   - Or ask a normal question\n");

  const app = createAgentGraph();

  try {
    while (true) {
      const userInput = await ask("\n💬 You: ");

      if (userInput.toLowerCase() === "exit" || userInput.toLowerCase() === "quit") {
        console.log("\n👋 Goodbye!");
        break;
      }

      if (!userInput) continue;

      // Invoke the agent
      const result = await app.invoke({
        messages: [new HumanMessage(userInput)],
      });

      // Display the final response
      const lastMessage = result.messages[result.messages.length - 1];
      const content = lastMessage.content.toString();

      // Don't show approval markers to user
      if (!content.includes("REQUIRES_APPROVAL:")) {
        console.log(`\n🤖 Assistant: ${content}`);
      }
    }
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
  } finally {
    rl.close();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { createAgentGraph };

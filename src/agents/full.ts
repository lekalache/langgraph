import "dotenv/config";
import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { memoryCheckpointer } from "../core/memory";
import { getHumanInput, closeHumanInput } from "../utils/human-input";
import { reasoningEngine } from "../core/reasoning";
import { allTools } from "../core/tools";
import config from "../core/config";

/**
 * Define the agent state
 */
const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
  }),
  plan: Annotation<string[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
  currentStep: Annotation<number>({
    reducer: (x, y) => y ?? x,
    default: () => 0,
  }),
  needsHumanInput: Annotation<boolean>({
    reducer: (x, y) => y ?? x,
    default: () => false,
  }),
  reasoning: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "",
  }),
});

/**
 * Planning node - creates a plan for complex tasks
 */
async function planningNode(state: typeof AgentState.State) {
  console.log("\n🧠 Planning Phase...");

  const lastMessage = state.messages[state.messages.length - 1];
  const userQuery = lastMessage.content.toString();

  // Only create a plan for complex queries
  if (userQuery.length > 50 || userQuery.includes("step") || userQuery.includes("plan")) {
    const plan = await reasoningEngine.createPlan(userQuery);

    if (plan.length > 0) {
      console.log("\n📋 Plan created:");
      plan.forEach((step, idx) => {
        console.log(`   ${idx + 1}. ${step}`);
      });

      return {
        plan,
        currentStep: 0,
        messages: [new AIMessage(`I've created a plan with ${plan.length} steps. Let me execute it.`)],
      };
    }
  }

  return { plan: [], messages: [] };
}

/**
 * Reasoning node - analyzes the current situation
 */
async function reasoningNode(state: typeof AgentState.State) {
  console.log("\n💭 Reasoning Phase...");

  const lastMessage = state.messages[state.messages.length - 1];

  // Only do deep reasoning for complex questions
  if (lastMessage.content.toString().includes("why") || lastMessage.content.toString().includes("analyze")) {
    const analysis = await reasoningEngine.analyze(
      lastMessage.content.toString(),
      state.plan.length > 0 ? `Current plan: ${state.plan.join(", ")}` : undefined
    );

    console.log(`   Analysis: ${analysis.substring(0, 100)}...`);

    return {
      reasoning: analysis,
      messages: [],
    };
  }

  return { messages: [] };
}

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

  // Build context from state
  const systemMessages = [];

  if (state.plan.length > 0) {
    systemMessages.push(
      new SystemMessage(`You are following this plan:\n${state.plan.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\nYou are currently on step ${state.currentStep + 1}.`)
    );
  }

  if (state.reasoning) {
    systemMessages.push(new SystemMessage(`Your reasoning: ${state.reasoning}`));
  }

  systemMessages.push(
    new SystemMessage(
      "You are a helpful AI assistant with access to tools. Use them when needed. Be concise and clear."
    )
  );

  const response = await model.invoke([...systemMessages, ...state.messages]);

  return {
    messages: [response],
  };
}

/**
 * Human input node - requests input from the user
 */
async function humanInputNode(state: typeof AgentState.State) {
  console.log("\n👤 Requesting human input...");

  const lastMessage = state.messages[state.messages.length - 1];

  // Check if the agent is asking for input
  if (lastMessage.content.toString().toLowerCase().includes("need") ||
      lastMessage.content.toString().toLowerCase().includes("approve") ||
      lastMessage.content.toString().toLowerCase().includes("confirm")) {

    const humanInput = getHumanInput();
    const userResponse = await humanInput.ask("\n> Your input: ");

    console.log(`\n   User responded: ${userResponse}`);

    return {
      messages: [new HumanMessage(userResponse)],
      needsHumanInput: false,
    };
  }

  return { messages: [], needsHumanInput: false };
}

/**
 * Router function to decide the next step
 */
function routeAgent(state: typeof AgentState.State): string {
  const lastMessage = state.messages[state.messages.length - 1];

  // Check if we need human input
  const content = lastMessage.content.toString().toLowerCase();
  if (
    content.includes("do you want") ||
    content.includes("should i") ||
    content.includes("approve") ||
    content.includes("confirm")
  ) {
    return "human_input";
  }

  // Check if the agent wants to use tools
  if (lastMessage.additional_kwargs?.tool_calls && lastMessage.additional_kwargs.tool_calls.length > 0) {
    return "tools";
  }

  // Check if the task is complete
  if (
    content.includes("done") ||
    content.includes("complete") ||
    content.includes("finished") ||
    state.currentStep >= state.plan.length
  ) {
    return "end";
  }

  return "end";
}

/**
 * Build the agent graph
 */
function createAgentGraph() {
  const workflow = new StateGraph(AgentState)
    .addNode("planning", planningNode)
    .addNode("reasoning", reasoningNode)
    .addNode("agent", agentNode)
    .addNode("tools", new ToolNode(allTools))
    .addNode("human_input", humanInputNode);

  // Define the flow
  workflow.addEdge(START, "planning");
  workflow.addEdge("planning", "reasoning");
  workflow.addEdge("reasoning", "agent");

  // Conditional routing from agent
  workflow.addConditionalEdges("agent", routeAgent, {
    tools: "tools",
    human_input: "human_input",
    end: END,
  });

  // After tools, go back to agent
  workflow.addEdge("tools", "agent");

  // After human input, go back to agent
  workflow.addEdge("human_input", "agent");

  // Compile with checkpointing for memory
  return workflow.compile({
    checkpointer: memoryCheckpointer,
  });
}

/**
 * Main execution function
 */
async function main() {
  console.log("╔════════════════════════════════════════════╗");
  console.log("║   Advanced LangGraph Agent with:          ║");
  console.log("║   ✓ Memory (Checkpointing)                ║");
  console.log("║   ✓ Human-in-the-Loop                     ║");
  console.log("║   ✓ Reasoning & Planning                  ║");
  console.log("║   ✓ Tool Use                              ║");
  console.log("║   ✓ Non-streaming Responses               ║");
  console.log("╚════════════════════════════════════════════╝\n");

  const app = createAgentGraph();

  // Configuration for memory persistence
  const config = {
    configurable: {
      thread_id: "session_1",
    },
  };

  try {
    const humanInput = getHumanInput();

    // Interactive loop
    while (true) {
      const userInput = await humanInput.ask("\n💬 You: ");

      if (userInput.toLowerCase() === "exit" || userInput.toLowerCase() === "quit") {
        console.log("\n👋 Goodbye!");
        break;
      }

      if (userInput.toLowerCase() === "clear") {
        memoryCheckpointer.clearThread("session_1");
        console.log("🗑️  Memory cleared!");
        continue;
      }

      // Invoke the agent
      const result = await app.invoke(
        {
          messages: [new HumanMessage(userInput)],
        },
        config
      );

      // Display the final response
      const lastMessage = result.messages[result.messages.length - 1];
      console.log(`\n🤖 Assistant: ${lastMessage.content}`);
    }
  } catch (error) {
    console.error("\n❌ Error:", error);
  } finally {
    closeHumanInput();
  }
}

// Run if this is the main module
if (require.main === module) {
  main().catch(console.error);
}

export { createAgentGraph, AgentState };

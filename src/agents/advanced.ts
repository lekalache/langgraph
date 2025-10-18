import "dotenv/config";
import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { allTools } from "../core/tools";
import config from "../core/config";
import * as readline from "readline";

/**
 * Advanced Agent State with multiple fields
 */
const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
  }),
  // Track current step in workflow
  currentStep: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "start",
  }),
  // Store intermediate results
  scratchpad: Annotation<string[]>({
    reducer: (x, y) => [...x, ...y],
    default: () => [],
  }),
  // Track iterations for loops
  iteration: Annotation<number>({
    reducer: (x, y) => y ?? x,
    default: () => 0,
  }),
  // Max iterations to prevent infinite loops
  maxIterations: Annotation<number>({
    reducer: (x, y) => y ?? x,
    default: () => 3,
  }),
  // Quality check result
  qualityScore: Annotation<number>({
    reducer: (x, y) => y ?? x,
    default: () => 0,
  }),
});

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
 * 1. CLASSIFIER NODE - Routes to appropriate workflow
 */
async function classifierNode(state: typeof AgentState.State) {
  console.log("\n📊 Classifying request...");

  const lastMessage = state.messages[state.messages.length - 1];
  const content = lastMessage.content.toString().toLowerCase();

  let step = "simple";

  if (content.includes("write") || content.includes("create") || content.includes("draft")) {
    step = "creative";
    console.log("   → Detected: Creative writing task");
  } else if (content.includes("calculate") || content.includes("math") || content.includes("compute")) {
    step = "calculation";
    console.log("   → Detected: Calculation task");
  } else if (content.includes("analyze") || content.includes("review") || content.includes("check")) {
    step = "analysis";
    console.log("   → Detected: Analysis task");
  } else {
    console.log("   → Detected: Simple query");
  }

  return {
    currentStep: step,
    scratchpad: [`Classified as: ${step}`],
  };
}

/**
 * 2. AGENT NODE - Main reasoning
 */
async function agentNode(state: typeof AgentState.State) {
  console.log("\n🤖 Agent working...");

  const model = new ChatOpenAI({
    modelName: config.models.agent,
    temperature: 0.7,
    configuration: {
      baseURL: config.api.baseURL,
    },
  }).bindTools(allTools);

  const systemMessage = new SystemMessage(
    `You are a helpful assistant. Current workflow step: ${state.currentStep}.
     Iteration: ${state.iteration + 1}/${state.maxIterations}`
  );

  const response = await model.invoke([systemMessage, ...state.messages]);

  return {
    messages: [response],
    iteration: state.iteration + 1,
  };
}

/**
 * 3. QUALITY CHECKER NODE - Self-critique and improvement loop
 */
async function qualityCheckerNode(state: typeof AgentState.State) {
  console.log("\n✅ Quality checking response...");

  const model = new ChatOpenAI({
    modelName: config.models.agent,
    temperature: 0.3,
    configuration: {
      baseURL: config.api.baseURL,
    },
  });

  const lastMessage = state.messages[state.messages.length - 1];

  const qualityPrompt = `Rate this response on a scale of 1-10 for quality, accuracy, and completeness:

Response: ${lastMessage.content}

Reply with ONLY a number from 1-10.`;

  const scoreResponse = await model.invoke([new HumanMessage(qualityPrompt)]);
  const score = parseInt(scoreResponse.content.toString().match(/\d+/)?.[0] || "5");

  console.log(`   Quality score: ${score}/10`);

  return {
    qualityScore: score,
    scratchpad: [...state.scratchpad, `Quality: ${score}/10`],
  };
}

/**
 * 4. REFLECTION NODE - Improve the response
 */
async function reflectionNode(state: typeof AgentState.State) {
  console.log("\n🔄 Reflecting and improving...");

  const model = new ChatOpenAI({
    modelName: config.models.agent,
    temperature: 0.7,
    configuration: {
      baseURL: config.api.baseURL,
    },
  });

  const lastMessage = state.messages[state.messages.length - 1];

  const reflectionPrompt = `The previous response scored ${state.qualityScore}/10.
Provide an improved version that is more complete, accurate, and helpful.

Previous response: ${lastMessage.content}

Improved response:`;

  const improvedResponse = await model.invoke([new HumanMessage(reflectionPrompt)]);

  return {
    messages: [improvedResponse],
    scratchpad: [...state.scratchpad, `Improved (iteration ${state.iteration})`],
  };
}

/**
 * 5. SUMMARIZER NODE - Final polishing
 */
async function summarizerNode(state: typeof AgentState.State) {
  console.log("\n📝 Finalizing response...");

  return {
    scratchpad: [...state.scratchpad, "Finalized"],
  };
}

/**
 * ROUTERS - Conditional edges
 */

// Route after classification
function routeAfterClassification(state: typeof AgentState.State): string {
  return state.currentStep;
}

// Route after agent - to tools or quality check
function routeAfterAgent(state: typeof AgentState.State): string {
  const lastMessage = state.messages[state.messages.length - 1];

  // Check for tool calls
  if (lastMessage.additional_kwargs?.tool_calls && lastMessage.additional_kwargs.tool_calls.length > 0) {
    return "tools";
  }

  return "quality_check";
}

// Route after quality check - improve or finalize
function routeAfterQualityCheck(state: typeof AgentState.State): string {
  // If quality is low and we haven't hit max iterations, improve
  if (state.qualityScore < 7 && state.iteration < state.maxIterations) {
    console.log("   → Quality below threshold, improving...");
    return "reflect";
  }

  console.log("   → Quality acceptable or max iterations reached");
  return "summarize";
}

/**
 * Build the graph with all features
 */
function createAdvancedGraph() {
  const workflow = new StateGraph(AgentState);

  // Add all nodes
  workflow.addNode("classifier", classifierNode);
  workflow.addNode("simple", agentNode);
  workflow.addNode("creative", agentNode);
  workflow.addNode("calculation", agentNode);
  workflow.addNode("analysis", agentNode);
  workflow.addNode("tools", new ToolNode(allTools));
  workflow.addNode("quality_check", qualityCheckerNode);
  workflow.addNode("reflect", reflectionNode);
  workflow.addNode("summarize", summarizerNode);

  // Entry point
  workflow.addEdge(START, "classifier");

  // Route based on classification
  workflow.addConditionalEdges("classifier", routeAfterClassification, {
    simple: "simple",
    creative: "creative",
    calculation: "calculation",
    analysis: "analysis",
  });

  // All workflow types go to quality check or tools
  workflow.addConditionalEdges("simple", routeAfterAgent, {
    tools: "tools",
    quality_check: "quality_check",
  });
  workflow.addConditionalEdges("creative", routeAfterAgent, {
    tools: "tools",
    quality_check: "quality_check",
  });
  workflow.addConditionalEdges("calculation", routeAfterAgent, {
    tools: "tools",
    quality_check: "quality_check",
  });
  workflow.addConditionalEdges("analysis", routeAfterAgent, {
    tools: "tools",
    quality_check: "quality_check",
  });

  // Tools go back to quality check
  workflow.addEdge("tools", "quality_check");

  // Quality check decides: reflect or finalize
  workflow.addConditionalEdges("quality_check", routeAfterQualityCheck, {
    reflect: "reflect",
    summarize: "summarize",
  });

  // Reflection loops back to quality check
  workflow.addEdge("reflect", "quality_check");

  // Summarize ends
  workflow.addEdge("summarize", END);

  return workflow.compile();
}

/**
 * Main execution
 */
async function main() {
  console.log("╔════════════════════════════════════════════╗");
  console.log("║   Advanced LangGraph Agent                ║");
  console.log("║   ✓ Request Classification                ║");
  console.log("║   ✓ Multi-path Workflows                  ║");
  console.log("║   ✓ Quality Checking                      ║");
  console.log("║   ✓ Self-Reflection Loop                  ║");
  console.log("║   ✓ Tool Integration                      ║");
  console.log("╚════════════════════════════════════════════╝\n");

  console.log("💡 Try different types of requests:");
  console.log("   📝 Creative: 'Write a poem about AI'");
  console.log("   🔢 Calculation: 'Calculate 234 * 567'");
  console.log("   🔍 Analysis: 'Analyze the benefits of TypeScript'");
  console.log("   💬 Simple: 'What is LangGraph?'\n");

  const app = createAdvancedGraph();

  try {
    while (true) {
      const userInput = await ask("\n💬 You: ");

      if (userInput.toLowerCase() === "exit" || userInput.toLowerCase() === "quit") {
        console.log("\n👋 Goodbye!");
        break;
      }

      if (!userInput) continue;

      console.log("\n" + "═".repeat(50));

      // Invoke the graph
      const result = await app.invoke({
        messages: [new HumanMessage(userInput)],
      });

      console.log("\n" + "═".repeat(50));

      // Display workflow trace
      console.log("\n📋 Workflow trace:");
      result.scratchpad.forEach((note: string, i: number) => {
        console.log(`   ${i + 1}. ${note}`);
      });

      // Display final response
      const lastMessage = result.messages[result.messages.length - 1];
      console.log(`\n🤖 Final Answer:\n${lastMessage.content}\n`);
    }
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    console.error(error.stack);
  } finally {
    rl.close();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { createAdvancedGraph };

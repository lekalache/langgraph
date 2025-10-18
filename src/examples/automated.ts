import "dotenv/config";
import { createAgentGraph } from "../agents/full";
import { HumanMessage } from "@langchain/core/messages";
import { memoryCheckpointer } from "../core/memory";

/**
 * Example 1: Simple question-answer with memory
 */
async function example1_SimpleMemory() {
  console.log("\n=== Example 1: Simple Q&A with Memory ===\n");

  const app = createAgentGraph();
  const config = { configurable: { thread_id: "example1" } };

  // First interaction
  let result = await app.invoke(
    { messages: [new HumanMessage("Hi! My name is Alice.")] },
    config
  );
  console.log("Assistant:", result.messages[result.messages.length - 1].content);

  // Second interaction - testing memory
  result = await app.invoke(
    { messages: [new HumanMessage("What's my name?")] },
    config
  );
  console.log("Assistant:", result.messages[result.messages.length - 1].content);

  memoryCheckpointer.clearThread("example1");
}

/**
 * Example 2: Using tools
 */
async function example2_ToolUse() {
  console.log("\n=== Example 2: Tool Use ===\n");

  const app = createAgentGraph();
  const config = { configurable: { thread_id: "example2" } };

  const result = await app.invoke(
    {
      messages: [
        new HumanMessage(
          "What's the current date and time? Also, can you calculate 125 * 47 for me?"
        ),
      ],
    },
    config
  );

  console.log("Assistant:", result.messages[result.messages.length - 1].content);

  memoryCheckpointer.clearThread("example2");
}

/**
 * Example 3: Planning and reasoning
 */
async function example3_PlanningReasoning() {
  console.log("\n=== Example 3: Planning & Reasoning ===\n");

  const app = createAgentGraph();
  const config = { configurable: { thread_id: "example3" } };

  const result = await app.invoke(
    {
      messages: [
        new HumanMessage(
          "Help me plan a step-by-step approach to learning TypeScript as a complete beginner."
        ),
      ],
    },
    config
  );

  console.log("\nFinal Plan:");
  if (result.plan && result.plan.length > 0) {
    result.plan.forEach((step: string, idx: number) => {
      console.log(`${idx + 1}. ${step}`);
    });
  }

  console.log("\nAssistant:", result.messages[result.messages.length - 1].content);

  memoryCheckpointer.clearThread("example3");
}

/**
 * Example 4: Multiple interactions with context
 */
async function example4_ContextualConversation() {
  console.log("\n=== Example 4: Contextual Conversation ===\n");

  const app = createAgentGraph();
  const config = { configurable: { thread_id: "example4" } };

  // Build up context
  let result = await app.invoke(
    { messages: [new HumanMessage("Take a note: My favorite color is blue")] },
    config
  );
  console.log("1.", result.messages[result.messages.length - 1].content);

  result = await app.invoke(
    { messages: [new HumanMessage("Take another note: I'm learning LangGraph")] },
    config
  );
  console.log("2.", result.messages[result.messages.length - 1].content);

  result = await app.invoke(
    { messages: [new HumanMessage("List all the notes you've taken")] },
    config
  );
  console.log("3.", result.messages[result.messages.length - 1].content);

  memoryCheckpointer.clearThread("example4");
}

/**
 * Run all examples
 */
async function runAllExamples() {
  try {
    await example1_SimpleMemory();
    await example2_ToolUse();
    await example3_PlanningReasoning();
    await example4_ContextualConversation();

    console.log("\n✅ All examples completed!");
  } catch (error) {
    console.error("❌ Error running examples:", error);
  }
}

// Run if this is the main module
if (require.main === module) {
  runAllExamples().catch(console.error);
}

export { runAllExamples };

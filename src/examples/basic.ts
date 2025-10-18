import "dotenv/config";
import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { BaseMessage, HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import config from "../core/config";

// Define the state using Annotation
const GraphState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
});

// Create a simple chatbot node
async function callModel(state: typeof GraphState.State) {
  const model = new ChatOpenAI({
    modelName: config.models.simple,
    temperature: config.temperature,
    configuration: {
      baseURL: config.api.baseURL,
    },
  });

  const response = await model.invoke(state.messages);

  return {
    messages: [response],
  };
}

// Create the graph
const workflow = new StateGraph(GraphState)
  .addNode("agent", callModel)
  .addEdge(START, "agent")
  .addEdge("agent", END);

// Compile the graph
const app = workflow.compile();

// Example usage
async function main() {
  console.log("LangGraph TypeScript Example");
  console.log("----------------------------\n");

  const inputs = {
    messages: [new HumanMessage("Hello! What is LangGraph?")],
  };

  console.log("User: Hello! What is LangGraph?\n");

  const result = await app.invoke(inputs);

  const lastMessage = result.messages[result.messages.length - 1];
  console.log(`Assistant: ${lastMessage.content}\n`);

  console.log("\n✓ Graph executed successfully!");
}

// Run the example
if (require.main === module) {
  main().catch((error) => {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  });
}

export { app };

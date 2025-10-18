import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import config from "../core/config";
import * as readline from "readline";

console.log("╔════════════════════════════════════════════╗");
console.log("║   LangGraph Chat Agent                    ║");
console.log("║   ✓ Powered by OpenRouter                 ║");
console.log("║   ✓ Model: DeepSeek R1T2 Chimera          ║");
console.log("╚════════════════════════════════════════════╝\n");

const model = new ChatOpenAI({
  modelName: config.models.agent,
  temperature: config.temperature,
  configuration: {
    baseURL: config.api.baseURL,
  },
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

let messages: BaseMessage[] = [];

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function chat() {
  while (true) {
    const userInput = await ask("\n💬 You: ");

    if (userInput.toLowerCase() === "exit" || userInput.toLowerCase() === "quit") {
      console.log("\n👋 Goodbye!");
      rl.close();
      process.exit(0);
    }

    if (userInput.toLowerCase() === "clear") {
      messages = [];
      console.log("🗑️  Conversation cleared!");
      continue;
    }

    if (!userInput) continue;

    // Add user message
    messages.push(new HumanMessage(userInput));

    console.log("\n🤖 Agent thinking...");

    try {
      // Get response
      const response = await model.invoke(messages);

      // Add AI message - response is already an AIMessage
      messages.push(response);

      console.log(`\n🤖 Assistant: ${response.content}`);
    } catch (error: any) {
      console.error("\n❌ Error:", error.message);
    }
  }
}

chat().catch((error) => {
  console.error("\n❌ Fatal error:", error);
  rl.close();
  process.exit(1);
});

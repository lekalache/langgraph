import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import config from "../core/config";
import * as readline from "readline";

// Try to load packages, fallback if not available
let chalk: any, ora: any, boxen: any;
try {
  chalk = require("chalk");
  ora = require("ora");
  boxen = require("boxen");
  console.log("✓ Loaded CLI enhancement packages");
} catch (e) {
  console.log("⚠️  Running in basic mode (install chalk, ora, boxen for enhanced visuals)");
  // Fallback implementations
  chalk = {
    bold: { cyan: (s: string) => s, white: (s: string) => s, green: (s: string) => s },
    cyan: (s: string) => s,
    green: (s: string) => s,
    yellow: (s: string) => s,
    gray: (s: string) => s,
    white: (s: string) => s,
    dim: (s: string) => s,
  };
  ora = (opts: any) => ({
    start: () => ({ succeed: (s: string) => console.log(s), text: "" }),
    text: ""
  });
  boxen = (text: string) => `\n${text}\n`;
}

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

async function main() {
  console.clear();

  console.log(boxen(
    chalk.bold.cyan('🚀 LangGraph Demo\n') +
    chalk.green('✓ Real-time responses\n') +
    chalk.green('✓ Conversation memory\n') +
    chalk.green('✓ OpenRouter + DeepSeek'),
    { padding: 1, margin: 1, borderColor: 'cyan' }
  ));

  const model = new ChatOpenAI({
    modelName: config.models.agent,
    temperature: 0.7,
    configuration: {
      baseURL: config.api.baseURL,
    },
  });

  console.log(chalk.green('\n✓ Model initialized successfully!\n'));

  const messages: any[] = [];

  try {
    while (true) {
      const userInput = await ask(chalk.bold.white('\n💬 You: '));

      if (userInput.toLowerCase() === "exit" || userInput.toLowerCase() === "quit") {
        console.log(chalk.green('\n👋 Goodbye!'));
        break;
      }

      if (userInput.toLowerCase() === "clear") {
        messages.length = 0;
        console.log(chalk.yellow('🗑️  Conversation cleared!'));
        continue;
      }

      if (!userInput) continue;

      // Add user message
      messages.push(new HumanMessage(userInput));

      // Show thinking indicator
      const spinner = ora({
        text: chalk.cyan('🤖 Thinking...'),
        spinner: 'dots'
      }).start();

      const startTime = Date.now();

      try {
        // Get response
        const response = await model.invoke(messages);
        messages.push(response);

        const duration = Date.now() - startTime;

        spinner.succeed(chalk.green(`✓ Response ready (${duration}ms)`));

        // Display response
        console.log(boxen(
          chalk.white(response.content.toString()),
          { padding: 1, borderColor: 'green', title: '🤖 Assistant' }
        ));

      } catch (error: any) {
        spinner.text = '';
        spinner.stop();
        console.error(chalk.red(`\n❌ Error: ${error.message}`));
      }
    }
  } finally {
    rl.close();
  }
}

console.log("Starting demo...");
main().catch((error) => {
  console.error("Fatal error:", error.message);
  process.exit(1);
});

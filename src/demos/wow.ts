import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, BaseMessage } from "@langchain/core/messages";
import config from "../core/config";
import * as readline from "readline";

// Load CLI packages
const chalk = require("chalk");
const ora = require("ora");
const boxen = require("boxen");
const Table = require("cli-table3");

/**
 * Execution Metrics Tracker
 */
class MetricsTracker {
  private startTime: number = 0;
  private steps: Array<{ name: string; duration: number }> = [];

  start() {
    this.startTime = Date.now();
    this.steps = [];
  }

  addStep(name: string, duration: number) {
    this.steps.push({ name, duration });
  }

  getTotalTime(): number {
    return Date.now() - this.startTime;
  }

  displaySummary() {
    const table = new Table({
      head: [chalk.cyan('Step'), chalk.cyan('Time'), chalk.cyan('% of Total')],
      style: { head: [], border: [] }
    });

    const total = this.getTotalTime();

    this.steps.forEach(({ name, duration }) => {
      const percentage = ((duration / total) * 100).toFixed(1);
      table.push([name, `${duration}ms`, `${percentage}%`]);
    });

    console.log(chalk.bold('\n📊 Execution Metrics:'));
    console.log(table.toString());
    console.log(chalk.green(`\n⏱️  Total Time: ${total}ms`));
  }
}

const metrics = new MetricsTracker();

/**
 * LLM-Based Intelligent Classifier - Determines request type using AI
 */
async function classifyRequest(message: string, model: ChatOpenAI): Promise<{ type: string; emoji: string; reasoning: string }> {
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

    // Try to parse JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);

      const emojiMap: Record<string, string> = {
        code: "💻",
        calculation: "🔢",
        research: "🔍",
        creative: "✍️",
        general: "💬"
      };

      return {
        type: parsed.type,
        emoji: emojiMap[parsed.type] || "💬",
        reasoning: parsed.reasoning
      };
    }
  } catch (error) {
    console.log(chalk.yellow('⚠️  Classification fallback to keyword-based'));
  }

  // Fallback to keyword-based classification
  const lower = message.toLowerCase();

  if (lower.includes("code") || lower.includes("debug") || lower.includes("memory") || lower.includes("langgraph")) {
    return { type: "code", emoji: "💻", reasoning: "Contains programming-related keywords" };
  } else if (lower.includes("calculate") || lower.includes("math") || /\d+\s*[\+\-\*\/]\s*\d+/.test(lower)) {
    return { type: "calculation", emoji: "🔢", reasoning: "Contains math-related keywords" };
  } else if (lower.includes("research") || lower.includes("find") || lower.includes("search")) {
    return { type: "research", emoji: "🔍", reasoning: "Contains research-related keywords" };
  } else if (lower.includes("write") || lower.includes("create") || lower.includes("poem") || lower.includes("story")) {
    return { type: "creative", emoji: "✍️", reasoning: "Contains creative-related keywords" };
  }

  return { type: "general", emoji: "💬", reasoning: "Default classification" };
}

/**
 * Main Demo Function
 */
async function main() {
  console.clear();

  console.log(boxen(
    chalk.bold.cyan('🚀 LangGraph POC - WOW Demo\n') +
    chalk.gray('Featuring:\n') +
    chalk.green('✓ Request classification\n') +
    chalk.green('✓ Streaming thinking process\n') +
    chalk.green('✓ Performance metrics\n') +
    chalk.green('✓ Beautiful CLI output'),
    { padding: 1, margin: 1, borderColor: 'cyan', borderStyle: 'double' }
  ));

  const model = new ChatOpenAI({
    modelName: config.models.agent,
    temperature: 0.7,
    configuration: {
      baseURL: config.api.baseURL,
    },
  });

  console.log(chalk.green('✓ Model initialized successfully!\n'));

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

  const messages: BaseMessage[] = [];

  try {
    while (true) {
      console.log(chalk.dim('\n' + '─'.repeat(60)));
      const userInput = await ask(chalk.bold.white('\n💬 You: '));

      if (userInput.toLowerCase() === "exit" || userInput.toLowerCase() === "quit") {
        console.log(boxen(
          chalk.green('👋 Thanks for trying the demo!\n') +
          chalk.gray('Built with LangGraph + OpenRouter'),
          { padding: 1, borderColor: 'green' }
        ));
        break;
      }

      if (userInput.toLowerCase() === "clear") {
        messages.length = 0;
        console.log(chalk.yellow('🗑️  Conversation cleared!'));
        continue;
      }

      if (!userInput) continue;

      console.log(chalk.dim('\n' + '═'.repeat(60)));

      metrics.start();

      // Step 1: Classification
      const classifyStart = Date.now();
      const spinner1 = ora({
        text: chalk.yellow('🧠 Analyzing request type...'),
        spinner: 'dots'
      }).start();

      const { type, emoji, reasoning } = await classifyRequest(userInput, model);
      const classifyTime = Date.now() - classifyStart;

      spinner1.succeed(chalk.green(`${emoji} Classified as: ${chalk.bold(type.toUpperCase())} ${chalk.dim(`(${reasoning})`)}`));
      metrics.addStep("classification", classifyTime);

      // Step 2: Thinking
      console.log(boxen(
        chalk.blue.bold('🤖 Agent Processing\n') +
        chalk.gray(`Category: ${chalk.white(type)}\n`) +
        chalk.gray(`Reasoning: ${chalk.white(reasoning)}`),
        { padding: 1, borderColor: 'blue', borderStyle: 'round', title: '⚡ Processing Pipeline' }
      ));

      const thinkingSteps = [
        { icon: "🔍", text: "Analyzing query components..." },
        { icon: "🧩", text: "Planning response strategy..." },
        { icon: "✨", text: "Formulating answer..." }
      ];

      const thinkingSpinner = ora({
        text: chalk.cyan('💭 Thinking...'),
        spinner: 'dots12'
      }).start();

      for (let i = 0; i < thinkingSteps.length; i++) {
        const step = thinkingSteps[i];
        const progress = chalk.dim(`[${i + 1}/${thinkingSteps.length}]`);
        thinkingSpinner.text = chalk.cyan(`${step.icon} ${step.text} ${progress}`);
        await new Promise(resolve => setTimeout(resolve, 400));
      }

      // Step 3: Generate Response
      const responseStart = Date.now();

      messages.push(new HumanMessage(userInput));

      try {
        const response = await model.invoke(messages);
        messages.push(response);

        const responseTime = Date.now() - responseStart;

        thinkingSpinner.succeed(chalk.green('✓ Response generated'));
        metrics.addStep("generation", responseTime);

        // Display response
        console.log(boxen(
          chalk.white(response.content.toString()),
          { padding: 1, borderColor: 'green', borderStyle: 'round', title: '🤖 Assistant' }
        ));

        // Display metrics
        metrics.displaySummary();

      } catch (error: any) {
        thinkingSpinner.fail(chalk.red('✗ Error generating response'));
        console.error(boxen(
          chalk.red.bold('❌ Error\n\n') +
          chalk.white(error.message),
          { padding: 1, borderColor: 'red' }
        ));
      }
    }
  } finally {
    rl.close();
  }
}

console.log(chalk.cyan("Starting WOW demo..."));
main().catch((error) => {
  console.error(chalk.red("Fatal error:"), error.message);
  process.exit(1);
});

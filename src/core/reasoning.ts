import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import config from "./config";

/**
 * Reasoning engine that helps the agent think through problems step by step
 */
export class ReasoningEngine {
  private model: ChatOpenAI;

  constructor() {
    this.model = new ChatOpenAI({
      modelName: config.models.reasoning,
      temperature: config.temperature,
      configuration: {
        baseURL: config.api.baseURL,
      },
    });
  }

  /**
   * Generate a step-by-step plan for solving a problem
   */
  async createPlan(task: string): Promise<string[]> {
    const systemPrompt = `You are a strategic planning assistant. Given a task, break it down into clear, actionable steps.
Return ONLY a numbered list of steps, one per line, without any additional explanation.
Each step should be concrete and actionable.`;

    const response = await this.model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(`Task: ${task}\n\nCreate a step-by-step plan:`),
    ]);

    const content = response.content.toString();

    // Parse the numbered list into an array of steps
    const steps = content
      .split("\n")
      .filter((line) => line.trim().match(/^\d+\./))
      .map((line) => line.replace(/^\d+\.\s*/, "").trim());

    return steps;
  }

  /**
   * Analyze a situation and provide reasoning
   */
  async analyze(situation: string, context?: string): Promise<string> {
    const systemPrompt = `You are an analytical reasoning assistant. Analyze the given situation carefully and provide clear reasoning.`;

    const messages = [new SystemMessage(systemPrompt)];

    if (context) {
      messages.push(new HumanMessage(`Context: ${context}`));
    }

    messages.push(new HumanMessage(`Situation: ${situation}\n\nProvide your analysis:`));

    const response = await this.model.invoke(messages);
    return response.content.toString();
  }

  /**
   * Reflect on an action and its outcome
   */
  async reflect(action: string, outcome: string): Promise<string> {
    const systemPrompt = `You are a reflective reasoning assistant. Given an action and its outcome, analyze what worked, what didn't, and what could be improved.`;

    const response = await this.model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(`Action taken: ${action}\nOutcome: ${outcome}\n\nProvide your reflection:`),
    ]);

    return response.content.toString();
  }

  /**
   * Make a decision based on options and criteria
   */
  async decide(options: string[], criteria: string): Promise<{ choice: string; reasoning: string }> {
    const systemPrompt = `You are a decision-making assistant. Given options and criteria, choose the best option and explain why.
Format your response as:
CHOICE: [your choice]
REASONING: [your reasoning]`;

    const optionsList = options.map((opt, idx) => `${idx + 1}. ${opt}`).join("\n");

    const response = await this.model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(`Options:\n${optionsList}\n\nCriteria: ${criteria}\n\nMake your decision:`),
    ]);

    const content = response.content.toString();
    const choiceMatch = content.match(/CHOICE:\s*(.+?)(?:\n|$)/);
    const reasoningMatch = content.match(/REASONING:\s*(.+)/s);

    return {
      choice: choiceMatch ? choiceMatch[1].trim() : options[0],
      reasoning: reasoningMatch ? reasoningMatch[1].trim() : content,
    };
  }
}

// Export a singleton instance
export const reasoningEngine = new ReasoningEngine();

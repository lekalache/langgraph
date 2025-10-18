import * as readline from "readline";

/**
 * Human-in-the-loop utility for getting user input during agent execution
 */
export class HumanInputHandler {
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  /**
   * Ask the user a question and wait for their response
   */
  async ask(question: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(question, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  /**
   * Ask for confirmation (yes/no)
   */
  async confirm(question: string): Promise<boolean> {
    const answer = await this.ask(`${question} (yes/no): `);
    return answer.toLowerCase() === "yes" || answer.toLowerCase() === "y";
  }

  /**
   * Close the readline interface
   */
  close(): void {
    this.rl.close();
  }
}

// Create a singleton instance
let humanInputInstance: HumanInputHandler | null = null;

export function getHumanInput(): HumanInputHandler {
  if (!humanInputInstance) {
    humanInputInstance = new HumanInputHandler();
  }
  return humanInputInstance;
}

export function closeHumanInput(): void {
  if (humanInputInstance) {
    humanInputInstance.close();
    humanInputInstance = null;
  }
}

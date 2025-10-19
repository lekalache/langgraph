import { allTools } from "./tools";

/**
 * ReACT-style agent for models that don't support native tool calling
 * Uses text-based prompting to simulate tool use
 */

export interface ReACTAction {
  thought: string;
  action: string;
  actionInput: any;
}

export interface ReACTResult {
  isDone: boolean;
  finalAnswer?: string;
  action?: ReACTAction;
}

/**
 * Create a ReACT system prompt that instructs the model on how to use tools
 */
export function createReACTPrompt(): string {
  const toolDescriptions = allTools
    .map(
      (tool) => `- ${tool.name}: ${tool.description}
   Input format: ${JSON.stringify(tool.schema.shape, null, 2)}`
    )
    .join("\n\n");

  // Get current date for context
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentDateStr = currentDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return `You are an AI assistant that can use tools to help answer questions. You have access to the following tools:

${toolDescriptions}

IMPORTANT CONTEXT:
- Current date: ${currentDateStr}
- Current year: ${currentYear}
- When searching for recent information, use ${currentYear} in your queries, NOT previous years
- Use get_datetime tool if you need precise time information

To use a tool, you must follow this EXACT format:

Thought: [Your reasoning about what to do next]
Action: [tool_name]
Action Input: [JSON object with tool parameters]
PAUSE

After each Action, you will receive:
Observation: [result from the tool]

You can then continue with another Thought/Action/Action Input, or if you have enough information, provide your final answer:

Thought: I now have enough information to answer the question
Final Answer: [Your complete answer to the user's question]

IMPORTANT RULES:
1. Always start with a Thought
2. Use Action and Action Input when you need to use a tool
3. Always write "PAUSE" after Action Input to wait for the observation
4. Use valid JSON for Action Input (use double quotes, proper formatting)
5. After getting an Observation, think about what to do next
6. When you have enough information, provide a Final Answer
7. Do NOT make up information - use tools to get real data

Example:
User: What is the weather in Paris?

Thought: I need to search for current weather information in Paris
Action: web_search
Action Input: {"query": "Paris weather today"}
PAUSE

[You will receive an Observation with search results]

Thought: Based on the search results, I have the weather information
Final Answer: According to current reports, the weather in Paris is...

Now, let's begin!`;
}

/**
 * Parse the model's ReACT-style response
 */
export function parseReACTResponse(response: string): ReACTResult {
  console.log("Parsing ReACT response:", response.substring(0, 200));

  // Check if this is a final answer
  const finalAnswerMatch = response.match(/Final Answer:\s*(.+)/is);
  if (finalAnswerMatch) {
    return {
      isDone: true,
      finalAnswer: finalAnswerMatch[1].trim(),
    };
  }

  // Extract Thought, Action, and Action Input
  const thoughtMatch = response.match(/Thought:\s*(.+?)(?=\n|$)/is);
  const actionMatch = response.match(/Action:\s*(\w+)/i);
  const actionInputMatch = response.match(/Action Input:\s*(\{[\s\S]*?\})/i);

  if (!actionMatch) {
    console.log("No action found in response");
    return { isDone: false };
  }

  const thought = thoughtMatch ? thoughtMatch[1].trim() : "";
  const action = actionMatch[1].trim();

  let actionInput: any = {};
  if (actionInputMatch) {
    try {
      // Clean up the JSON - remove any trailing text after }
      const jsonStr = actionInputMatch[1].trim();
      const cleanJson = jsonStr.substring(0, jsonStr.indexOf("}") + 1);
      actionInput = JSON.parse(cleanJson);
    } catch (error) {
      console.error("Failed to parse action input:", actionInputMatch[1]);
      // Try to extract a simple query parameter
      const simpleMatch = actionInputMatch[1].match(/"query":\s*"([^"]+)"/);
      if (simpleMatch) {
        actionInput = { query: simpleMatch[1] };
      }
    }
  }

  return {
    isDone: false,
    action: {
      thought,
      action,
      actionInput,
    },
  };
}

/**
 * Execute a ReACT action by calling the appropriate tool
 */
export async function executeReACTAction(
  action: ReACTAction
): Promise<string> {
  const tool = allTools.find((t) => t.name === action.action);

  if (!tool) {
    return `Error: Unknown tool "${action.action}". Available tools: ${allTools
      .map((t) => t.name)
      .join(", ")}`;
  }

  try {
    console.log(`Executing ReACT action: ${action.action}`, action.actionInput);
    const result = await tool.invoke(action.actionInput);
    console.log(`ReACT action completed. Result length: ${result.length}`);
    return result;
  } catch (error: any) {
    console.error(`ReACT action error:`, error.message);
    return `Error executing ${action.action}: ${error.message}`;
  }
}

/**
 * Build the conversation history for ReACT agent
 */
export function buildReACTHistory(
  userMessage: string,
  interactions: Array<{ thought: string; action: string; input: any; observation: string }>
): string {
  let history = `User: ${userMessage}\n\n`;

  for (const interaction of interactions) {
    history += `Thought: ${interaction.thought}\n`;
    history += `Action: ${interaction.action}\n`;
    history += `Action Input: ${JSON.stringify(interaction.input)}\n`;
    history += `Observation: ${interaction.observation}\n\n`;
  }

  return history;
}

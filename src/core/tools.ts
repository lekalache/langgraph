import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * Calculator tool for mathematical operations
 */
export const calculatorTool = new DynamicStructuredTool({
  name: "calculator",
  description: "Perform mathematical calculations. Supports basic operations (+, -, *, /) and more complex expressions.",
  schema: z.object({
    expression: z.string().describe("The mathematical expression to evaluate (e.g., '2 + 2', '10 * 5 - 3')"),
  }),
  func: async ({ expression }) => {
    try {
      // Simple evaluation using Function constructor (be careful in production!)
      // In production, use a proper math parser library
      const result = Function(`"use strict"; return (${expression})`)();
      return `The result of ${expression} is ${result}`;
    } catch (error) {
      return `Error evaluating expression: ${error}`;
    }
  },
});

/**
 * Web search tool (mock implementation - replace with actual API in production)
 */
export const webSearchTool = new DynamicStructuredTool({
  name: "web_search",
  description: "Search the web for information. Use this when you need current information or facts.",
  schema: z.object({
    query: z.string().describe("The search query"),
  }),
  func: async ({ query }) => {
    // Mock implementation - in production, integrate with a real search API
    return `[Mock] Search results for "${query}":\n1. Recent information about ${query}\n2. Latest developments in ${query}\n3. Expert opinions on ${query}\n\nNote: This is a mock implementation. Replace with actual search API.`;
  },
});

/**
 * Note-taking tool for maintaining context
 */
const notes: Map<string, string> = new Map();

export const noteTool = new DynamicStructuredTool({
  name: "take_note",
  description: "Save important information for later reference. Use this to remember key facts, decisions, or context.",
  schema: z.object({
    key: z.string().describe("A unique identifier for this note"),
    content: z.string().describe("The content to save"),
  }),
  func: async ({ key, content }) => {
    notes.set(key, content);
    return `Note saved with key "${key}"`;
  },
});

export const getNoteTool = new DynamicStructuredTool({
  name: "get_note",
  description: "Retrieve a previously saved note by its key.",
  schema: z.object({
    key: z.string().describe("The key of the note to retrieve"),
  }),
  func: async ({ key }) => {
    const note = notes.get(key);
    if (note) {
      return `Note "${key}": ${note}`;
    }
    return `No note found with key "${key}"`;
  },
});

export const listNotesTool = new DynamicStructuredTool({
  name: "list_notes",
  description: "List all saved notes and their keys.",
  schema: z.object({}),
  func: async () => {
    if (notes.size === 0) {
      return "No notes saved yet.";
    }
    const noteList = Array.from(notes.entries())
      .map(([key, content]) => `- ${key}: ${content.substring(0, 50)}${content.length > 50 ? "..." : ""}`)
      .join("\n");
    return `Saved notes:\n${noteList}`;
  },
});

/**
 * Date and time tool
 */
export const datetimeTool = new DynamicStructuredTool({
  name: "get_datetime",
  description: "Get the current date and time information.",
  schema: z.object({
    format: z
      .enum(["full", "date", "time"]) // Required by API; we provide a default
      .default("full")
      .describe("What information to return: full, date, or time"),
  }),
  func: async ({ format = "full" }) => {
    const now = new Date();
    switch (format) {
      case "date":
        return now.toLocaleDateString();
      case "time":
        return now.toLocaleTimeString();
      default:
        return now.toLocaleString();
    }
  },
});

/**
 * All available tools
 */
export const allTools = [
  calculatorTool,
  webSearchTool,
  noteTool,
  getNoteTool,
  listNotesTool,
  datetimeTool,
];

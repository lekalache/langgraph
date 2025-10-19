import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { chromium, Browser, Page } from "playwright";
import { tavily } from "@tavily/core";

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
 * Browser management - singleton pattern for reusing browser instance
 */
let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserInstance) {
    browserInstance = await chromium.launch({ headless: true });
  }
  return browserInstance;
}

export async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

/**
 * Browser navigation tool - Navigate to a URL and extract page content
 */
export const browserNavigateTool = new DynamicStructuredTool({
  name: "browser_navigate",
  description: "Navigate to a specific URL and extract the page content. Use this to visit websites and gather information from specific pages.",
  schema: z.object({
    url: z.string().describe("The URL to navigate to (must start with http:// or https://)"),
  }),
  func: async ({ url }) => {
    let page: Page | null = null;
    try {
      const browser = await getBrowser();
      page = await browser.newPage();

      // Set a reasonable timeout and user agent
      await page.setViewportSize({ width: 1280, height: 720 });

      // Navigate to the URL and wait for network to be idle (smarter than fixed timeout)
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

      // Wait for network to be mostly idle (faster than 2000ms fixed wait)
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {
        // If network doesn't idle within 5s, continue anyway
      });

      // Extract page title and text content
      const title = await page.title();
      const textContent = await page.evaluate(() => {
        // Remove script and style elements
        const body = document.body.cloneNode(true) as HTMLElement;
        body.querySelectorAll('script, style, nav, footer, header').forEach(el => el.remove());
        return body.innerText;
      });

      // Limit text content to reasonable length
      const truncatedContent = textContent.substring(0, 5000);

      return `Page Title: ${title}\n\nURL: ${url}\n\nContent:\n${truncatedContent}${textContent.length > 5000 ? '\n\n[Content truncated...]' : ''}`;
    } catch (error) {
      return `Error navigating to ${url}: ${error}`;
    } finally {
      if (page) await page.close();
    }
  },
});

// Initialize Tavily client
const tavilyApiKey = process.env.TAVILY_API_KEY || "";
const tavilyClient = tavily({ apiKey: tavilyApiKey });

/**
 * LRU Cache for search results
 * Caches search results for 5 minutes to avoid duplicate API calls
 */
interface CacheEntry {
  result: string;
  timestamp: number;
}

const searchCache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds
const MAX_CACHE_SIZE = 100; // Maximum number of cached queries

function getCachedSearch(query: string): string | null {
  const normalized = query.toLowerCase().trim();
  const entry = searchCache.get(normalized);

  if (!entry) return null;

  // Check if cache entry is still valid
  const age = Date.now() - entry.timestamp;
  if (age > CACHE_TTL) {
    searchCache.delete(normalized);
    return null;
  }

  console.log(`  Cache hit! (${Math.round(age / 1000)}s old)`);
  return entry.result;
}

function setCachedSearch(query: string, result: string): void {
  const normalized = query.toLowerCase().trim();

  // Implement LRU eviction if cache is full
  if (searchCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = searchCache.keys().next().value;
    searchCache.delete(oldestKey);
    console.log(`  Cache full, evicted oldest entry`);
  }

  searchCache.set(normalized, {
    result,
    timestamp: Date.now(),
  });
}

/**
 * Web search tool using Tavily API
 * Tavily is built specifically for AI agents and provides high-quality search results
 * Now with LRU caching (5 minute TTL) to avoid duplicate API calls
 */
export const webSearchTool = new DynamicStructuredTool({
  name: "web_search",
  description: "Search the web for information using Tavily. Returns high-quality search results with titles, URLs, and content. Use this when you need current information or facts about any topic.",
  schema: z.object({
    query: z.string().describe("The search query"),
  }),
  func: async ({ query }) => {
    try {
      console.log(`Searching Tavily for: "${query}"`);

      // Check cache first
      const cached = getCachedSearch(query);
      if (cached) {
        return cached;
      }

      const response = await tavilyClient.search(query, {
        maxResults: 10,
        includeAnswer: true,
        includeRawContent: false,
        searchDepth: "advanced",
      });

      if (!response.results || response.results.length === 0) {
        return `No search results found for "${query}". Try rephrasing your query or using browser_navigate to visit specific websites.`;
      }

      console.log(`  Found ${response.results.length} results from Tavily`);

      // Format results
      let output = `Web search results for "${query}":\n\n`;

      // Include Tavily's AI-generated answer if available
      if (response.answer) {
        output += `📝 AI Summary: ${response.answer}\n\n`;
        output += `---\n\n`;
      }

      // Add search results
      response.results.forEach((result: any, index: number) => {
        output += `${index + 1}. ${result.title}\n`;
        output += `   URL: ${result.url}\n`;
        if (result.content) {
          const snippet = result.content.substring(0, 200);
          output += `   ${snippet}${result.content.length > 200 ? "..." : ""}\n`;
        }
        if (result.score) {
          output += `   Relevance: ${(result.score * 100).toFixed(0)}%\n`;
        }
        output += `\n`;
      });

      output += `\nFound ${response.results.length} results. Use browser_navigate to read full articles.`;

      // Cache the result
      setCachedSearch(query, output);

      return output;
    } catch (error: any) {
      console.error("Tavily search error:", error);
      return `Error searching with Tavily for "${query}": ${error.message || error}. Make sure TAVILY_API_KEY is set in .env file.`;
    }
  },
});

/**
 * Browser extract tool - Extract specific information from a webpage
 */
export const browserExtractTool = new DynamicStructuredTool({
  name: "browser_extract",
  description: "Extract specific information from a webpage using a CSS selector or by searching for text. Use this to get targeted data from a page.",
  schema: z.object({
    url: z.string().describe("The URL to extract information from"),
    selector: z.string().optional().nullable().describe("CSS selector to target specific elements (optional)"),
    searchText: z.string().optional().nullable().describe("Text to search for on the page (optional)"),
  }),
  func: async ({ url, selector, searchText }) => {
    let page: Page | null = null;
    try {
      const browser = await getBrowser();
      page = await browser.newPage();

      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

      // Wait for network to be mostly idle (faster than 2000ms fixed wait)
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {
        // If network doesn't idle within 5s, continue anyway
      });

      if (selector) {
        // Extract content using CSS selector
        const elements = await page.$$(selector);
        const texts = await Promise.all(
          elements.map(el => el.textContent())
        );
        return `Extracted content from selector "${selector}":\n${texts.join('\n\n')}`;
      }

      if (searchText) {
        // Search for specific text
        const content = await page.content();
        const match = content.includes(searchText);
        return match
          ? `Found "${searchText}" on the page at ${url}`
          : `Text "${searchText}" not found on the page at ${url}`;
      }

      // Default: extract all text
      const text = await page.evaluate(() => document.body.innerText);
      return `Page content from ${url}:\n${text.substring(0, 5000)}`;
    } catch (error) {
      return `Error extracting from ${url}: ${error}`;
    } finally {
      if (page) await page.close();
    }
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
 * Code execution tool - Execute JavaScript code in a safe sandbox
 */
export const codeExecutionTool = new DynamicStructuredTool({
  name: "execute_code",
  description: "Execute JavaScript code in a sandboxed environment. Use this to run calculations, data processing, or test code snippets. Returns the result or any console output.",
  schema: z.object({
    code: z.string().describe("The JavaScript code to execute"),
    timeout: z.number().optional().describe("Timeout in milliseconds (default 5000, max 30000)"),
  }),
  func: async ({ code, timeout = 5000 }) => {
    try {
      const maxTimeout = Math.min(timeout, 30000); // Cap at 30 seconds

      // Capture console output
      const logs: string[] = [];
      const mockConsole = {
        log: (...args: any[]) => logs.push(args.map(String).join(' ')),
        error: (...args: any[]) => logs.push('ERROR: ' + args.map(String).join(' ')),
        warn: (...args: any[]) => logs.push('WARN: ' + args.map(String).join(' ')),
      };

      // Execute with timeout
      const executeWithTimeout = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`Code execution timed out after ${maxTimeout}ms`));
        }, maxTimeout);

        try {
          // Create a function that executes the code with limited scope
          const wrappedCode = `
            (function() {
              const console = mockConsole;
              ${code}
            })()
          `;

          const result = Function('mockConsole', `"use strict"; return ${wrappedCode}`)(mockConsole);
          clearTimeout(timer);
          resolve(result);
        } catch (error) {
          clearTimeout(timer);
          reject(error);
        }
      });

      const result = await executeWithTimeout;

      let output = '';
      if (logs.length > 0) {
        output += `Console Output:\n${logs.join('\n')}\n\n`;
      }
      if (result !== undefined) {
        output += `Result: ${JSON.stringify(result, null, 2)}`;
      } else if (logs.length === 0) {
        output += 'Code executed successfully (no output)';
      }

      return output;
    } catch (error: any) {
      return `Error executing code: ${error.message}`;
    }
  },
});

/**
 * File read tool - Read file contents (with safety checks)
 */
export const fileReadTool = new DynamicStructuredTool({
  name: "read_file",
  description: "Read the contents of a file from the filesystem. Use this to access file data, configuration files, or code files.",
  schema: z.object({
    filePath: z.string().describe("The path to the file to read"),
    encoding: z.enum(['utf8', 'base64']).optional().describe("File encoding (default: utf8)"),
  }),
  func: async ({ filePath, encoding = 'utf8' }) => {
    try {
      const fs = require('fs').promises;
      const path = require('path');

      // Security: Prevent directory traversal
      const resolvedPath = path.resolve(filePath);
      const allowedDir = path.resolve(process.cwd());

      if (!resolvedPath.startsWith(allowedDir)) {
        return `Error: Access denied. Can only read files within project directory.`;
      }

      // Check if file exists
      const stats = await fs.stat(resolvedPath);
      if (!stats.isFile()) {
        return `Error: ${filePath} is not a file`;
      }

      // Check file size (max 1MB)
      if (stats.size > 1024 * 1024) {
        return `Error: File too large (${Math.round(stats.size / 1024)}KB). Maximum size is 1MB.`;
      }

      const content = await fs.readFile(resolvedPath, encoding);

      return `File: ${filePath}\nSize: ${stats.size} bytes\n\nContent:\n${content}`;
    } catch (error: any) {
      return `Error reading file: ${error.message}`;
    }
  },
});

/**
 * File write tool - Write content to a file (with safety checks)
 */
export const fileWriteTool = new DynamicStructuredTool({
  name: "write_file",
  description: "Write content to a file. Use this to save data, create configuration files, or generate output files.",
  schema: z.object({
    filePath: z.string().describe("The path where the file should be written"),
    content: z.string().describe("The content to write to the file"),
    encoding: z.enum(['utf8', 'base64']).optional().describe("File encoding (default: utf8)"),
  }),
  func: async ({ filePath, content, encoding = 'utf8' }) => {
    try {
      const fs = require('fs').promises;
      const path = require('path');

      // Security: Prevent directory traversal
      const resolvedPath = path.resolve(filePath);
      const allowedDir = path.resolve(process.cwd());

      if (!resolvedPath.startsWith(allowedDir)) {
        return `Error: Access denied. Can only write files within project directory.`;
      }

      // Security: Prevent overwriting sensitive files
      const filename = path.basename(resolvedPath).toLowerCase();
      const sensitiveFiles = ['.env', 'package.json', 'package-lock.json', '.git'];
      if (sensitiveFiles.some(sf => filename.includes(sf))) {
        return `Error: Cannot overwrite sensitive file: ${filename}`;
      }

      // Create directory if it doesn't exist
      const dir = path.dirname(resolvedPath);
      await fs.mkdir(dir, { recursive: true });

      // Write the file
      await fs.writeFile(resolvedPath, content, encoding);

      const stats = await fs.stat(resolvedPath);
      return `Successfully wrote ${stats.size} bytes to ${filePath}`;
    } catch (error: any) {
      return `Error writing file: ${error.message}`;
    }
  },
});

/**
 * All available tools
 */
export const allTools = [
  calculatorTool,
  webSearchTool,
  browserNavigateTool,
  browserExtractTool,
  codeExecutionTool,
  fileReadTool,
  fileWriteTool,
  noteTool,
  getNoteTool,
  listNotesTool,
  datetimeTool,
];

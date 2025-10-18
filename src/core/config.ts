/**
 * Configuration for the LangGraph Agent
 * Centralized settings for easy customization
 */

export const config = {
  // OpenRouter API Configuration
  api: {
    baseURL: "https://openrouter.ai/api/v1",
  },

  // Model Configuration
  // You can change the model here to use different models from OpenRouter
  models: {
    // Main agent model (used for decision making and tool calls)
    agent: "tngtech/deepseek-r1t2-chimera:free",

    // Reasoning model (used for planning and analysis)
    reasoning: "tngtech/deepseek-r1t2-chimera:free",

    // Simple tasks model (for basic examples)
    simple: "tngtech/deepseek-r1t2-chimera:free",
  },

  // Model Parameters
  temperature: 0.7,

  // Other popular free models on OpenRouter you can try:
  // - "meta-llama/llama-3.2-3b-instruct:free"
  // - "google/gemini-flash-1.5-8b:free"
  // - "qwen/qwen-2.5-7b-instruct:free"
  // - "microsoft/phi-3-mini-128k-instruct:free"
  // - "mistralai/mistral-7b-instruct:free"
};

export default config;

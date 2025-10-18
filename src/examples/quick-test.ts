import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";
import config from "../core/config";

async function test() {
  console.log("Starting quick test...");
  console.log("Config:", config);

  const model = new ChatOpenAI({
    modelName: config.models.agent,
    temperature: config.temperature,
    configuration: {
      baseURL: config.api.baseURL,
    },
  });

  console.log("Model created, sending test message...");

  const response = await model.invoke("Say 'Hello World' in one sentence.");

  console.log("\n✅ Response:", response.content);
}

test().catch(console.error);

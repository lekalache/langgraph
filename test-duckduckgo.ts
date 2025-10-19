import "dotenv/config";
import { webSearchTool } from "./src/core/tools";

async function testSearch() {
  console.log("🔍 Testing Tavily web search...\n");

  const result = await webSearchTool.invoke({
    query: "Sébastien Lecornu resume CV France controversy"
  });

  console.log("Search Results:");
  console.log("=".repeat(80));
  console.log(result);
  console.log("=".repeat(80));
}

testSearch().catch(console.error);

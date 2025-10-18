import "dotenv/config";
import { createAdvancedGraph } from "../agents/advanced";
import * as fs from "fs";
import * as path from "path";

/**
 * Generate visualization of the LangGraph
 */
async function visualizeGraph() {
  console.log("🎨 Generating graph visualization...\n");

  try {
    const graph = createAdvancedGraph();

    // Get the Mermaid diagram representation
    const mermaidCode = graph.getGraph().drawMermaid();

    // Save to file
    const outputPath = path.join(process.cwd(), "graph-visualization.md");
    const content = `# LangGraph Visualization

## Graph Structure

\`\`\`mermaid
${mermaidCode}
\`\`\`

## How to View

1. **GitHub**: Push this file to GitHub - it will render automatically
2. **VS Code**: Install "Markdown Preview Mermaid Support" extension
3. **Online**: Copy the mermaid code to https://mermaid.live
4. **Obsidian**: Open in Obsidian - it supports Mermaid natively

## Graph Explanation

### Nodes:
- **START**: Entry point
- **classifier**: Analyzes request type
- **simple/creative/calculation/analysis**: Different workflow paths
- **tools**: Executes agent tools (calculator, notes, etc.)
- **quality_check**: Self-evaluates response quality
- **reflect**: Improves low-quality responses
- **summarize**: Final polish
- **END**: Exit point

### Edges:
- **Solid arrows**: Direct transitions
- **Conditional edges**: Routes based on state (request type, quality score, etc.)
- **Loops**: reflection → quality_check (self-improvement cycle)

### Key Features Demonstrated:
1. **Conditional Routing**: classifier → different paths
2. **Cycles**: reflect ↔ quality_check (can loop up to 3 times)
3. **Tool Integration**: Any path can use tools
4. **State Management**: Tracks iteration, quality score, workflow trace
`;

    fs.writeFileSync(outputPath, content);

    console.log("✅ Visualization saved to: graph-visualization.md\n");
    console.log("📊 Mermaid Diagram:");
    console.log("─".repeat(60));
    console.log(mermaidCode);
    console.log("─".repeat(60));
    console.log("\n🌐 View online at: https://mermaid.live");
    console.log("📝 Copy the code above and paste it there!\n");

    // Also create ASCII art version
    console.log("📐 ASCII Flow Diagram:");
    console.log(`
┌────────────────────────────────────────────────────────────┐
│                          START                              │
└──────────────────────┬─────────────────────────────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │   CLASSIFIER    │
              │  (Route based   │
              │   on request)   │
              └────┬────┬───┬───┘
                   │    │   │
       ┌───────────┼────┼───┼──────────┐
       │           │    │   │          │
       ▼           ▼    ▼   ▼          ▼
   ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
   │ SIMPLE │ │CREATIVE│ │  CALC  │ │ANALYSIS│
   └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘
       │          │          │          │
       └──────────┼──────────┼──────────┘
                  │          │
                  ▼          ▼
            ┌──────────────────┐
            │   TOOLS (opt)    │
            └─────────┬────────┘
                      │
                      ▼
            ┌──────────────────┐
            │  QUALITY CHECK   │◄─────────┐
            │ (Score 1-10)     │          │
            └─────┬────────────┘          │
                  │                       │
          ┌───────┴────────┐             │
          │                │             │
     Score < 7        Score ≥ 7          │
     & iter < 3       or max iter        │
          │                │             │
          ▼                │             │
    ┌──────────┐           │             │
    │ REFLECT  │           │             │
    │ (Improve)│───────────┘             │
    └──────────┘                         │
          │                              │
          └──────────────────────────────┘
                                         │
                                         ▼
                              ┌──────────────────┐
                              │    SUMMARIZE     │
                              └─────────┬────────┘
                                        │
                                        ▼
                              ┌──────────────────┐
                              │       END        │
                              └──────────────────┘
`);

    // Create a simple HTML viewer
    const htmlPath = path.join(process.cwd(), "graph-viewer.html");
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LangGraph Visualization</title>
    <script type="module">
        import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
        mermaid.initialize({ startOnLoad: true, theme: 'dark' });
    </script>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
            background: #1e1e1e;
            color: #ffffff;
        }
        h1 { color: #61dafb; }
        .mermaid {
            background: white;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
        }
        .info {
            background: #2d2d2d;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
        }
        code {
            background: #3d3d3d;
            padding: 2px 6px;
            border-radius: 4px;
        }
    </style>
</head>
<body>
    <h1>🎨 LangGraph Advanced Agent Visualization</h1>

    <div class="info">
        <h2>Graph Features</h2>
        <ul>
            <li><strong>Conditional Routing:</strong> Classifier routes to different workflows</li>
            <li><strong>Cycles:</strong> Quality check → Reflect loop (self-improvement)</li>
            <li><strong>Tool Integration:</strong> Any workflow can use tools</li>
            <li><strong>State Management:</strong> Tracks iteration, quality, workflow trace</li>
            <li><strong>Max Iterations:</strong> Prevents infinite loops (3 max)</li>
        </ul>
    </div>

    <h2>Interactive Graph</h2>
    <pre class="mermaid">
${mermaidCode}
    </pre>

    <div class="info">
        <h2>How to Run</h2>
        <pre><code>npm run agent:advanced</code></pre>

        <h3>Example Queries:</h3>
        <ul>
            <li><code>Write a poem about AI</code> → Creative workflow → Quality loop</li>
            <li><code>Calculate 234 * 567</code> → Calculation workflow → Tools</li>
            <li><code>Analyze TypeScript vs JavaScript</code> → Analysis workflow</li>
            <li><code>What is LangGraph?</code> → Simple workflow</li>
        </ul>
    </div>
</body>
</html>`;

    fs.writeFileSync(htmlPath, htmlContent);
    console.log("✅ HTML viewer saved to: graph-viewer.html");
    console.log("🌐 Open in browser to see interactive diagram!\n");

  } catch (error: any) {
    console.error("❌ Error generating visualization:", error.message);
  }
}

if (require.main === module) {
  visualizeGraph().catch(console.error);
}

export { visualizeGraph };

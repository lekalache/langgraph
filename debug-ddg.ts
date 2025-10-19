import { chromium } from "playwright";

async function debugDuckDuckGo() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  const searchUrl = "https://html.duckduckgo.com/html/?q=Lecornu+France";
  console.log("Navigating to:", searchUrl);

  await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(3000);

  // Get the HTML content
  const html = await page.content();

  // Save HTML for inspection
  const fs = require("fs");
  fs.writeFileSync("ddg-debug.html", html);
  console.log("✅ Saved HTML to ddg-debug.html");

  // Try to find results with various selectors
  const selectors = [
    ".result",
    ".results_links",
    ".result__a",
    "a.result__a",
    ".web-result",
    "[data-testid='result']",
    ".nrn-react-div"
  ];

  for (const selector of selectors) {
    const count = await page.$$eval(selector, (els) => els.length);
    console.log(`${selector}: ${count} elements`);
  }

  // Get all links
  const links = await page.$$eval("a", (els) =>
    els.slice(0, 20).map((el) => ({
      href: el.getAttribute("href"),
      text: el.textContent?.substring(0, 50),
      classes: el.className
    }))
  );

  console.log("\nFirst 20 links found:");
  links.forEach((link, i) => {
    console.log(`${i + 1}. [${link.classes}] ${link.text}`);
    console.log(`   ${link.href}\n`);
  });

  await context.close();
  await browser.close();
}

debugDuckDuckGo();

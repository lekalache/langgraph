import { chromium } from "playwright";

async function testGoogleSearch() {
  console.log("🔍 Testing Google search with Playwright...");

  const browser = await chromium.launch({ headless: false }); // Non-headless to see what happens
  const page = await browser.newPage();

  // Set realistic user agent
  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
  );

  const query = "Lecornu resume France";
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;

  console.log("Navigating to:", searchUrl);

  try {
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    await page.waitForTimeout(3000);

    // Take a screenshot to see what we get
    await page.screenshot({ path: "google-search-test.png" });
    console.log("Screenshot saved to google-search-test.png");

    // Try to extract results
    const results = await page.evaluate(() => {
      const searchResults: { title: string; url: string }[] = [];

      // Multiple selectors to try
      const selectors = [
        'div.g',           // Standard Google result
        'div[data-sokoban-container]',
        '.tF2Cxc',
        'div.MjjYud'
      ];

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        console.log(`Selector ${selector}: found ${elements.length} elements`);

        elements.forEach((element, index) => {
          if (index >= 5) return; // Limit to 5 results

          const titleEl = element.querySelector('h3');
          const linkEl = element.querySelector('a');

          if (titleEl && linkEl) {
            searchResults.push({
              title: titleEl.textContent || '',
              url: linkEl.getAttribute('href') || ''
            });
          }
        });

        if (searchResults.length > 0) break;
      }

      return searchResults;
    });

    console.log("\n📊 Results found:", results.length);
    results.forEach((r, i) => {
      console.log(`${i + 1}. ${r.title}`);
      console.log(`   ${r.url}\n`);
    });

  } catch (error) {
    console.error("❌ Error:", error);
  }

  await page.waitForTimeout(5000);
  await browser.close();
}

testGoogleSearch();

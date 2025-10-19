import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

// Add stealth plugin
chromium.use(StealthPlugin());

async function testGoogleStealth() {
  console.log("🔍 Testing Google with Playwright stealth...\n");

  const browser = await chromium.launch({
    headless: false, // Non-headless so we can see what happens
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });

  const page = await browser.newPage();

  const query = "Lecornu resume France";
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en`;

  console.log(`Navigating to: ${searchUrl}`);

  await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

  // Wait to see the page
  await page.waitForTimeout(5000);

  // Take screenshot
  await page.screenshot({ path: "google-stealth-test.png", fullPage: true });
  console.log("Screenshot saved to google-stealth-test.png");

  // Check what selectors exist
  const selectorCounts = await page.evaluate(() => {
    const selectors = ['div.g', 'div[data-sokoban-container]', '.tF2Cxc', 'div.MjjYud', 'h3', 'a'];
    const counts: Record<string, number> = {};

    selectors.forEach(sel => {
      counts[sel] = document.querySelectorAll(sel).length;
    });

    return counts;
  });

  console.log("\nSelector counts:");
  Object.entries(selectorCounts).forEach(([sel, count]) => {
    console.log(`  ${sel}: ${count} elements`);
  });

  // Try to extract any results
  const anyResults = await page.evaluate(() => {
    const results: any[] = [];
    const h3Elements = document.querySelectorAll('h3');

    h3Elements.forEach((h3, idx) => {
      if (idx < 5) { // First 5
        const parent = h3.closest('div');
        const link = parent?.querySelector('a');

        results.push({
          h3Text: h3.textContent,
          linkHref: link?.getAttribute('href'),
          parentHTML: parent?.outerHTML.substring(0, 200)
        });
      }
    });

    return results;
  });

  console.log("\nFirst 5 H3 elements found:");
  anyResults.forEach((r, i) => {
    console.log(`\n${i + 1}. ${r.h3Text}`);
    console.log(`   Link: ${r.linkHref}`);
  });

  await page.waitForTimeout(5000);
  await browser.close();
}

testGoogleStealth().catch(console.error);

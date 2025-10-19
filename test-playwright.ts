import { chromium } from "playwright";

async function testPlaywright() {
  console.log("🔍 Testing Playwright browser launch...");

  try {
    const browser = await chromium.launch({ headless: true });
    console.log("✅ Browser launched successfully");

    const page = await browser.newPage();
    console.log("✅ Page created");

    await page.goto("https://www.google.com", { timeout: 10000 });
    console.log("✅ Navigated to Google");

    const title = await page.title();
    console.log(`✅ Page title: ${title}`);

    await browser.close();
    console.log("✅ Browser closed");

    console.log("\n🎉 Playwright test PASSED!");
  } catch (error) {
    console.error("❌ Playwright test FAILED:");
    console.error(error);
    process.exit(1);
  }
}

testPlaywright();

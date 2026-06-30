const puppeteer = require("puppeteer");

async function fetchShorts(limit = 50) {
  const browser = await puppeteer.launch({
    headless: false, // Set to true once working
    defaultViewport: null,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
    ],
  });

  try {
    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
    );

    console.log("Opening YouTube Shorts...");

    await page.goto("https://www.youtube.com/shorts", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    // Give YouTube time to render
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Scroll through several shorts
    for (let i = 0; i < 20; i++) {
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight);
      });

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    const shorts = await page.evaluate(() => {
      const ids = new Set();

      document.querySelectorAll('a[href*="/shorts/"]').forEach((link) => {
        const href = link.href || link.getAttribute("href");

        if (!href) return;

        const match = href.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);

        if (match) {
          ids.add(match[1]);
        }
      });

      return [...ids];
    });

    return shorts.slice(0, limit);
  } finally {
    await browser.close();
  }
}

(async () => {
  try {
    const shorts = await fetchShorts();

    console.log(`Found ${shorts.length} shorts:\n`);

    shorts.forEach((id, index) => {
      console.log(
        `${index + 1}. ${id} - https://www.youtube.com/watch?v=${id}`,
      );
    });
  } catch (err) {
    console.error("Error:", err);
  }
})();

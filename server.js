import express from "express";
import puppeteer from "puppeteer";

const app = express();
app.use(express.json());

// Random human-like delay
const waitRandom = async () => {
  const delay = 500 + Math.random() * 1200; // 0.5s–1.7s
  return new Promise(resolve => setTimeout(resolve, delay));
};

app.get("/omic/:number", async (req, res) => {
  const omic = req.params.number;

  let browser;
  try {
 browser = await puppeteer.launch({
  headless: "new",
  executablePath: "/usr/bin/google-chrome-stable",
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-blink-features=AutomationControlled",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--window-size=1920,1080"
  ]
});

    const page = await browser.newPage();

    // Rotate Chrome user-agents
    const userAgents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    ];
    await page.setUserAgent(userAgents[Math.floor(Math.random() * userAgents.length)]);

    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9"
    });

    // Load CFIA OMIC page
    await page.goto(
      "https://shipmenttracker-suividesenvois.inspection.canada.ca/service/english/common/shipmenttracker.aspx",
      {
        waitUntil: "networkidle2",
        timeout: 60000
      }
    );

    await waitRandom();

    // Type OMIC number
    await page.type("#ctl00_MainBody_uxOMIC", omic, {
      delay: 120 + Math.random() * 80
    });

    await waitRandom();

    // Click Search button
    await page.click("#ctl00_MainBody_uxSearch");

    // Wait for results table
    await page.waitForSelector("table", { timeout: 30000 });

    // Extract data from table
    const result = await page.evaluate(() => {
      const getCell = (headerId) =>
        document.querySelector(`td[headers="${headerId}"]`)?.innerText?.trim() || null;

      return {
        omic: getCell("ctl00_MainBody_uxTableHeaderCell1"),
        controlNumber: getCell("ctl00_MainBody_uxTableHeaderCell2"),
        inspectionRequired: getCell("ctl00_MainBody_uxTableHeaderCell3"),
        establishmentNumber: getCell("ctl00_MainBody_uxTableHeaderCell4")
      };
    });

    res.json({
      success: true,
      omic,
      ...result
    });

  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch OMIC data",
      message: error.message
    });
  } finally {
    if (browser) await browser.close();
  }
});

// Health check
app.get("/ping", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

app.listen(3000, () => console.log("Server running on port 3000"));

const http = require("http");
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const rootDir = path.resolve(__dirname, "..");
const port = 5201;
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const startServer = () =>
  new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const requestPath = decodeURIComponent((req.url || "/").split("?")[0]);
      const safePath = requestPath === "/" ? "/index.html" : requestPath;
      const filePath = path.join(rootDir, safePath);
      fs.readFile(filePath, (error, data) => {
        if (error) {
          res.writeHead(404);
          res.end("Not Found");
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
        res.end(data);
      });
    });
    server.listen(port, () => resolve(server));
  });

(async () => {
  const server = await startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  try {
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#listings-grid .card", { timeout: 20000 });
    await page.waitForTimeout(2000);

    const before = await page.$$eval("#listings-grid .card", (nodes) => nodes.length);
    const canLoad = await page.$("#load-more:not(.hidden)");

    if (canLoad) {
      await page.click("#load-more");
      await page.waitForTimeout(3500);
    }

    const after = await page.$$eval("#listings-grid .card", (nodes) => nodes.length);
    console.log(JSON.stringify({ before, after, canLoad: Boolean(canLoad), consoleErrors }, null, 2));
  } finally {
    await browser.close();
    server.close();
  }
})();

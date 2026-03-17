const http = require('http');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const rootDir = 'D:/VS Code/EasyRent';
const port = 5199;
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

const startServer = () =>
  new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rawPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const safePath = rawPath === '/' ? '/index.html' : rawPath;
      const filePath = path.join(rootDir, safePath);
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not Found');
          return;
        }
        res.writeHead(200, { 'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(port, () => resolve(server));
  });

(async () => {
  const server = await startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const logs = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') logs.push(msg.text());
  });
  page.on('pageerror', (err) => logs.push(`pageerror:${err.message}`));

  try {
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#search-input');

    await page.fill('#search-input', 'студия центр');
    await page.waitForTimeout(500);
    await page.selectOption('#sort-by', 'price:asc');
    await page.waitForTimeout(2500);

    await page.fill('#filter-price-min', '50');
    await page.dispatchEvent('#filter-price-min', 'change');
    await page.waitForTimeout(1000);
    await page.fill('#filter-price-max', '250');
    await page.dispatchEvent('#filter-price-max', 'change');
    await page.waitForTimeout(2200);

    await page.selectOption('#sort-by', 'createdAt:desc');
    await page.waitForTimeout(1800);

    const failedIndex = logs.filter((x) => x.includes('failed-precondition') || x.includes('requires an index'));
    console.log(JSON.stringify({ totalConsoleErrors: logs.length, failedIndexErrors: failedIndex }, null, 2));
  } finally {
    await browser.close();
    server.close();
  }
})();

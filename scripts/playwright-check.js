const http = require("http");
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const rootDir = path.resolve(__dirname, "..");
const port = 5173;
const authEmail = process.env.EASYRENT_EMAIL || "";
const authPassword = process.env.EASYRENT_PASSWORD || "";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2"
};

const startServer = () =>
  new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      const safePath = urlPath === "/" ? "/index.html" : urlPath;
      const filePath = path.join(rootDir, safePath);
      if (!filePath.startsWith(rootDir)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
      fs.readFile(filePath, (err, data) => {
        if (err) {
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

const run = async () => {
  const server = await startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  const requestFailures = [];
  const responseErrors = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("requestfailed", (req) => {
    requestFailures.push(`${req.url()} :: ${req.failure()?.errorText || "failed"}`);
  });
  page.on("response", (res) => {
    if (res.status() >= 400) {
      const url = res.url();
      if (!url.includes("favicon.ico")) responseErrors.push(`${res.status()} ${url}`);
    }
  });

  const report = {
    index: {},
    listing: {},
    profile: {},
    cart: {},
    admin: {},
    auth: {},
    consoleErrors,
    pageErrors,
    requestFailures,
    responseErrors
  };

  const gotoSafe = async (url, waitSelector) => {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    if (waitSelector) await page.waitForSelector(waitSelector, { timeout: 15000 });
  };

  try {
    await gotoSafe(`http://127.0.0.1:${port}/index.html`, "#listings-grid");
    await page.waitForTimeout(2500);
    const cards = await page.$$("#listings-grid .card");
    report.index.cards = cards.length;
    report.index.hasLoadMore = Boolean(await page.$("#load-more"));
    report.index.hasFilters = Boolean(await page.$("#filter-form"));
  } catch (error) {
    report.index.error = error.message;
  }

  const loginIfNeeded = async () => {
    if (!authEmail || !authPassword) {
      report.auth = { attempted: false, reason: "missing_env" };
      return false;
    }

    try {
      await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "domcontentloaded" });

      const alreadySignedIn = await page.$("body[data-auth='signed-in']");
      if (alreadySignedIn) {
        report.auth = { attempted: true, success: true, alreadySignedIn: true };
        return true;
      }

      const openBtn = await page.$("#open-auth");
      if (openBtn) await openBtn.click();

      await page.waitForSelector("#login-form", { state: "visible", timeout: 10000 });
      await page.fill('#login-form input[name="email"]', authEmail);
      await page.fill('#login-form input[name="password"]', authPassword);

      await Promise.all([
        page.waitForSelector("body[data-auth='signed-in']", { timeout: 15000 }),
        page.click('#login-form button[type="submit"]')
      ]);

      report.auth = { attempted: true, success: true };
      return true;
    } catch (error) {
      report.auth = { attempted: true, success: false, error: error.message };
      return false;
    }
  };

  const signedIn = await loginIfNeeded();

  let listingId = null;
  try {
    const firstCard = await page.$("#listings-grid .card");
    listingId = firstCard ? await firstCard.getAttribute("data-id") : null;
  } catch (error) {
    // ignore
  }

  try {
    const target = listingId
      ? `http://127.0.0.1:${port}/listing.html?id=${listingId}`
      : `http://127.0.0.1:${port}/listing.html`;
    await gotoSafe(target, "#listing-detail");
    await page.waitForTimeout(1500);
    report.listing.hasDetail = Boolean(await page.$("#listing-detail h1"));
    report.listing.hasGallery = Boolean(await page.$("#listing-gallery"));
    report.listing.hasReviews = Boolean(await page.$("#reviews-list"));
    report.listing.hasMessages = Boolean(await page.$("#messages-list"));
    report.listing.hasBookButton = Boolean(await page.$("#book-now"));
  } catch (error) {
    report.listing.error = error.message;
  }

  try {
    await gotoSafe(`http://127.0.0.1:${port}/profile.html`, "#profile-form");
    report.profile.hasProfileForm = Boolean(await page.$("#profile-form:not(.hidden)"));
    report.profile.hasFavorites = Boolean(await page.$("#favorites-list"));
    report.profile.hasHistory = Boolean(await page.$("#booking-history"));
    report.profile.hasReviews = Boolean(await page.$("#my-reviews"));
    report.profile.signedIn = signedIn;
  } catch (error) {
    report.profile.error = error.message;
  }

  try {
    await gotoSafe(`http://127.0.0.1:${port}/cart.html`, "#active-bookings");
    report.cart.hasActive = Boolean(await page.$("#active-bookings"));
    report.cart.hasCompleted = Boolean(await page.$("#completed-bookings"));
    report.cart.signedIn = signedIn;
  } catch (error) {
    report.cart.error = error.message;
  }

  try {
    await gotoSafe(`http://127.0.0.1:${port}/admin.html`, "#admin-guard");
    report.admin.hasGuard = Boolean(await page.$("#admin-guard"));
    report.admin.hasListings = Boolean(await page.$("#admin-listings"));
    report.admin.signedIn = signedIn;
  } catch (error) {
    report.admin.error = error.message;
  }

  await browser.close();
  server.close();

  console.log(JSON.stringify(report, null, 2));
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

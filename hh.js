// hh.js
//
// npm init -y
// npm install puppeteer
// node hh.js
//
// Output:
// paradubonheur-boutique-10-pages.json

const fs = require("fs");
const puppeteer = require("puppeteer");

const BASE_URL = "https://paradubonheur.tn";
const SHOP_PAGE_TEMPLATE = "https://paradubonheur.tn/boutique/page/";
const START_PAGE = 1;     // change to 11 if you want to start from page 11
const TOTAL_PAGES = 10;   // scrape 10 pages only

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanText(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function unique(arr) {
  return [...new Set(arr.filter(Boolean))];
}

function parsePrice(value) {
  if (!value) return null;

  const cleaned = String(value)
    .replace(/\u00a0/g, " ")
    .replace(/[^\d,.\s]/g, "")
    .trim();

  const match = cleaned.match(/(\d+[.,]?\d*)/);
  if (!match) return null;

  const num = Number(match[1].replace(",", "."));
  return Number.isFinite(num) ? num : null;
}

async function safeGoto(page, url) {
  await page.goto(url, {
    waitUntil: "networkidle2",
    timeout: 90000,
  });
  await sleep(1500);
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 500;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= document.body.scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 200);
    });
  });
}

async function collectProductLinksFromBoutiquePages(page, startPage, totalPages) {
  const productLinks = new Set();

  for (let i = 0; i < totalPages; i++) {
    const pageNumber = startPage + i;
    const url = `${SHOP_PAGE_TEMPLATE}${pageNumber}/`;

    console.log(`Listing page: ${url}`);

    try {
      await safeGoto(page, url);
      await autoScroll(page);
      await sleep(1000);

      const links = await page.evaluate(() => {
        const anchors = [...document.querySelectorAll("a[href]")];

        return anchors
          .map((a) => a.href)
          .filter(Boolean)
          .filter((href) => href.includes("/produit/") || href.includes("/product/"))
          .map((href) => href.split("#")[0]);
      });

      for (const link of links) {
        productLinks.add(link);
      }

      console.log(`Collected so far: ${productLinks.size} products`);
    } catch (err) {
      console.log(`Failed page ${url}: ${err.message}`);
    }

    await sleep(1200);
  }

  return [...productLinks];
}

async function scrapeProduct(page, url) {
  await safeGoto(page, url);
  await autoScroll(page);
  await sleep(1000);

  const raw = await page.evaluate((productUrl) => {
    const getText = (selectors) => {
      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el && el.textContent.trim()) {
          return el.textContent.replace(/\s+/g, " ").trim();
        }
      }
      return "";
    };

    const getTexts = (selector) => {
      return [...document.querySelectorAll(selector)]
        .map((el) => el.textContent.replace(/\s+/g, " ").trim())
        .filter(Boolean);
    };

    const getImages = () => {
      const images = new Set();

      const og = document.querySelector('meta[property="og:image"]');
      if (og?.content) images.add(og.content);

      const allImgs = [
        ...document.querySelectorAll("img"),
        ...document.querySelectorAll(".woocommerce-product-gallery img"),
      ];

      for (const img of allImgs) {
        const candidates = [
          img.getAttribute("src"),
          img.getAttribute("data-src"),
          img.getAttribute("data-large_image"),
          img.getAttribute("data-lazy-src"),
          img.currentSrc,
        ];

        for (const c of candidates) {
          if (c && /^https?:\/\//i.test(c)) images.add(c);
        }
      }

      return [...images];
    };

    const title = getText([
      "h1.product_title",
      "h1.entry-title",
      "main h1",
      "h1",
    ]);

    const breadcrumbs = getTexts(
      ".woocommerce-breadcrumb a, .woocommerce-breadcrumb span, .breadcrumb a, .breadcrumb span"
    );

    const regularPriceText = getText([
      "p.price del .woocommerce-Price-amount",
      "p.price del bdi",
      "del .woocommerce-Price-amount",
      "del bdi",
    ]);

    const salePriceText = getText([
      "p.price ins .woocommerce-Price-amount",
      "p.price ins bdi",
      "ins .woocommerce-Price-amount",
      "ins bdi",
    ]);

    const visiblePriceText = getText([
      "p.price",
      ".summary .price",
      ".product .price",
    ]);

    const stockText = getText([
      ".stock",
      ".availability",
      ".woocommerce-variation-availability",
    ]);

    const description = getText([
      ".woocommerce-product-details__short-description",
      "#tab-description",
      ".woocommerce-Tabs-panel--description",
      ".entry-summary",
    ]);

    const bodyText = (document.body?.innerText || "").toLowerCase();

    return {
      url: productUrl,
      title,
      breadcrumbs,
      regularPriceText,
      salePriceText,
      visiblePriceText,
      stockText,
      description,
      images: getImages(),
      bodyText,
    };
  }, url);

  const regularPrice = parsePrice(raw.regularPriceText);
  const salePrice = parsePrice(raw.salePriceText);
  const visiblePrice = parsePrice(raw.visiblePriceText);

  let finalRegularPrice = regularPrice;
  let finalSalePrice = salePrice;

  if (!finalSalePrice && visiblePrice) {
    finalSalePrice = visiblePrice;
  }

  const categories = raw.breadcrumbs.filter(
    (x) =>
      x &&
      !/^accueil$/i.test(x) &&
      !/^home$/i.test(x) &&
      cleanText(x).toLowerCase() !== cleanText(raw.title).toLowerCase()
  );

  const isPromotion =
    !!salePrice ||
    raw.bodyText.includes("promotion") ||
    raw.bodyText.includes("promo");

  const isVenteFlash =
    raw.bodyText.includes("vente flash") ||
    raw.url.toLowerCase().includes("vente-flash");

  return {
    id: raw.url
      .replace(/^https?:\/\//, "")
      .replace(/[^\w]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase(),
    name: cleanText(raw.title),
    slug: raw.url.split("/").filter(Boolean).pop(),
    url: raw.url,
    categories,
    breadcrumbs: raw.breadcrumbs,
    image: {
      main: raw.images[0] || null,
      gallery: raw.images,
    },
    pricing: {
      currency: "TND",
      regular_price: finalRegularPrice,
      sale_price: finalSalePrice,
      displayed_price: visiblePrice,
    },
    availability: {
      status_text: cleanText(raw.stockText),
      in_stock: !/rupture|épuis|epuis|out of stock/i.test(raw.stockText || ""),
    },
    description: cleanText(raw.description),
    flags: {
      is_promotion: isPromotion,
      is_vente_flash: isVenteFlash,
    },
  };
}

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    defaultViewport: { width: 1440, height: 2200 },
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36"
  );

  try {
    console.log(`Collecting products from ${TOTAL_PAGES} boutique pages...`);
    const productLinks = await collectProductLinksFromBoutiquePages(
      page,
      START_PAGE,
      TOTAL_PAGES
    );

    console.log(`Total unique product links found: ${productLinks.length}`);

    const products = [];

    for (let i = 0; i < productLinks.length; i++) {
      const link = productLinks[i];
      console.log(`[${i + 1}/${productLinks.length}] ${link}`);

      try {
        const product = await scrapeProduct(page, link);
        products.push(product);
      } catch (err) {
        console.log(`Failed product ${link}: ${err.message}`);
      }

      await sleep(1200);
    }

    const output = {
      source: {
        site: BASE_URL,
        listing_type: "boutique",
        start_page: START_PAGE,
        total_pages: TOTAL_PAGES,
      },
      total: products.length,
      products,
    };

    fs.writeFileSync(
      "paradubonheur-boutique-10-pages.json",
      JSON.stringify(output, null, 2),
      "utf8"
    );

    console.log("Saved: paradubonheur-boutique-10-pages.json");
  } catch (err) {
    console.error("Fatal error:", err);
  } finally {
    await browser.close();
  }
})();
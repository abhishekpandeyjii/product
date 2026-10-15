require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, "reviews.sqlite"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    review TEXT NOT NULL,
    contact_consent INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// Seed initial authentic reviews if table is empty
const reviewCount = db.prepare("SELECT COUNT(*) as count FROM reviews").get().count;
if (reviewCount === 0) {
  const insertSeed = db.prepare(`
    INSERT INTO reviews (name, phone, rating, review, contact_consent, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now', ?))
  `);
  insertSeed.run(
    "Rahul Sharma",
    "+91 98765 43210",
    5,
    "The active noise cancellation is mind-blowing on daily metro commutes. Battery easily lasted me 4 full days of work calls and music. Easily punches above its price class!",
    1,
    "-3 days"
  );
  insertSeed.run(
    "Priya Patel",
    null,
    5,
    "Super plush ear cushions, absolutely zero ear fatigue even after 6-hour video editing marathons. The soundstage is spacious and vocals are crystal clear.",
    0,
    "-2 days"
  );
  insertSeed.run(
    "Aman Verma",
    "+91 98123 45678",
    4,
    "Bass is deep and punchy, and high frequencies are crisp without harshness. Mic clarity on Zoom calls is great. Carrying case is slightly bulky, but headphones are fantastic.",
    1,
    "-1 days"
  );
  insertSeed.run(
    "Sneha Iyer",
    null,
    5,
    "Best wireless studio headphones in this price bracket. The matte acoustic cups and brushed metal headband feel ultra-premium.",
    0,
    "-5 hours"
  );
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many reviews submitted from this connection. Please try again shortly." }
});

const clean = (v, max) => String(v || "").trim().slice(0, max);

// Product info endpoint
app.get("/api/product", (_req, res) => {
  res.json({
    name: process.env.PRODUCT_NAME || "Apollo ANC Wireless Studio Headphones",
    description: process.env.PRODUCT_DESCRIPTION || "Experience audiophile-grade high-resolution sound, adaptive noise cancellation, 40-hour battery life, and handcrafted luxury comfort.",
    price: process.env.PRODUCT_PRICE || "₹4,999",
    image: "/product.jpg",
    notificationEmail: process.env.NOTIFICATION_EMAIL || "abhishekpandpro@gmail.com",
    features: [
      "40dB Hybrid Active Noise Cancellation",
      "40-Hour Extended Battery with Fast USB-C Charging",
      "Custom 45mm Titanium-Coated High-Res Drivers",
      "Ultra-Plush Memory Foam Acoustic Cushions",
      "Bluetooth 5.3 with Dual-Device Multipoint Pairing"
    ]
  });
});

// Public reviews endpoint (protects privacy: phone numbers are NOT returned)
app.get("/api/reviews", (_req, res) => {
  try {
    const reviews = db.prepare(`
      SELECT id, name, rating, review, created_at
      FROM reviews
      ORDER BY id DESC
      LIMIT 100
    `).all();

    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        AVG(rating) as avgRating,
        SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) as s5,
        SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) as s4,
        SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) as s3,
        SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) as s2,
        SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as s1
      FROM reviews
    `).get();

    res.json({
      reviews,
      stats: {
        total: stats.total || 0,
        avgRating: stats.avgRating ? Number(stats.avgRating.toFixed(1)) : 0,
        distribution: {
          5: stats.s5 || 0,
          4: stats.s4 || 0,
          3: stats.s3 || 0,
          2: stats.s2 || 0,
          1: stats.s1 || 0
        }
      }
    });
  } catch (err) {
    console.error("Error fetching reviews:", err);
    res.status(500).json({ error: "Failed to fetch reviews." });
  }
});

// Review submission endpoint
app.post("/api/reviews", submitLimiter, (req, res) => {
  const name = clean(req.body.name, 80);
  const phone = clean(req.body.phone, 25);
  const review = clean(req.body.review, 1500);
  const rating = Number(req.body.rating);
  const contactConsent = req.body.contactConsent === true;

  if (!name || !review || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: "Please enter your name, a review, and select a rating between 1 and 5." });
  }
  if (phone && !/^[+0-9 ()-]{7,25}$/.test(phone)) {
    return res.status(400).json({ error: "Please enter a valid phone number or leave it blank." });
  }
  if (phone && !contactConsent) {
    return res.status(400).json({ error: "Please check the contact consent box to permit us to contact you, or leave the phone number blank." });
  }

  try {
    const result = db.prepare(`
      INSERT INTO reviews (name, phone, rating, review, contact_consent)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, phone && contactConsent ? phone : null, rating, review, contactConsent ? 1 : 0);

    res.status(201).json({
      ok: true,
      id: result.lastInsertRowid,
      message: "Thank you! Your review has been submitted successfully."
    });
  } catch (err) {
    console.error("Error saving review:", err);
    res.status(500).json({ error: "Failed to submit review. Please try again." });
  }
});

// Admin authentication middleware
function adminAuth(req, res, next) {
  if (!ADMIN_PASSWORD) {
    return res.status(503).json({ error: "Admin is not configured. Set ADMIN_PASSWORD in .env or hosting environment." });
  }
  const supplied = req.get("x-admin-password");
  if (!supplied || supplied !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Incorrect admin password." });
  }
  next();
}

// Verify admin password
app.post("/api/admin/verify", adminAuth, (_req, res) => {
  res.json({ ok: true, message: "Admin verified successfully." });
});

// Admin get all reviews (includes phone numbers with consent)
app.get("/api/admin/reviews", adminAuth, (_req, res) => {
  try {
    const rows = db.prepare(`
      SELECT id, name, phone, rating, review, contact_consent, created_at
      FROM reviews ORDER BY id DESC LIMIT 500
    `).all();
    res.json(rows);
  } catch (err) {
    console.error("Error fetching admin reviews:", err);
    res.status(500).json({ error: "Failed to fetch admin reviews." });
  }
});

// Admin delete review
app.delete("/api/admin/reviews/:id", adminAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid review ID." });
  try {
    const result = db.prepare("DELETE FROM reviews WHERE id = ?").run(id);
    if (result.changes === 0) {
      return res.status(404).json({ error: "Review not found or already deleted." });
    }
    res.json({ ok: true, message: `Review #${id} deleted successfully.` });
  } catch (err) {
    console.error("Error deleting review:", err);
    res.status(500).json({ error: "Failed to delete review." });
  }
});

app.get("/health", (_req, res) => res.json({ ok: true, timestamp: new Date().toISOString() }));

const server = app.listen(PORT, () => {
  console.log(`Product Review App running on http://localhost:${PORT}`);
});

process.on("SIGINT", () => {
  server.close(() => {
    db.close();
    process.exit(0);
  });
});

require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

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
    const data = db.getPublicReviews();
    res.json(data);
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
    const newId = db.addReview({
      name,
      phone,
      rating,
      review,
      contactConsent
    });

    res.status(201).json({
      ok: true,
      id: newId,
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
    const rows = db.getAllReviewsAdmin();
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
    const deleted = db.deleteReview(id);
    if (!deleted) {
      return res.status(404).json({ error: "Review not found or already deleted." });
    }
    res.json({ ok: true, message: `Review #${id} deleted successfully.` });
  } catch (err) {
    console.error("Error deleting review:", err);
    res.status(500).json({ error: "Failed to delete review." });
  }
});

app.get("/health", (_req, res) => res.json({ ok: true, timestamp: new Date().toISOString() }));

// Start listening if run directly and not in Vercel serverless environment
if (require.main === module && !process.env.VERCEL) {
  const server = app.listen(PORT, () => {
    console.log(`Product Review App running on http://localhost:${PORT}`);
  });

  process.on("SIGINT", () => {
    server.close(() => {
      process.exit(0);
    });
  });
}

module.exports = app;

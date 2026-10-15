const path = require("path");
const fs = require("fs");

const SEED_REVIEWS = [
  {
    id: 1,
    name: "Rahul Sharma",
    phone: "+91 98765 43210",
    rating: 5,
    review: "The active noise cancellation is mind-blowing on daily metro commutes. Battery easily lasted me 4 full days of work calls and music. Easily punches above its price class!",
    contact_consent: 1,
    created_at: new Date(Date.now() - 3 * 86400000).toISOString().replace("T", " ").slice(0, 19)
  },
  {
    id: 2,
    name: "Priya Patel",
    phone: null,
    rating: 5,
    review: "Super plush ear cushions, absolutely zero ear fatigue even after 6-hour video editing marathons. The soundstage is spacious and vocals are crystal clear.",
    contact_consent: 0,
    created_at: new Date(Date.now() - 2 * 86400000).toISOString().replace("T", " ").slice(0, 19)
  },
  {
    id: 3,
    name: "Aman Verma",
    phone: "+91 98123 45678",
    rating: 4,
    review: "Bass is deep and punchy, and high frequencies are crisp without harshness. Mic clarity on Zoom calls is great. Carrying case is slightly bulky, but headphones are fantastic.",
    contact_consent: 1,
    created_at: new Date(Date.now() - 1 * 86400000).toISOString().replace("T", " ").slice(0, 19)
  },
  {
    id: 4,
    name: "Sneha Iyer",
    phone: null,
    rating: 5,
    review: "Best wireless studio headphones in this price bracket. The matte acoustic cups and brushed metal headband feel ultra-premium.",
    contact_consent: 0,
    created_at: new Date(Date.now() - 5 * 3600000).toISOString().replace("T", " ").slice(0, 19)
  }
];

let sqliteDb = null;
let useSqlite = false;

// 1. Try initializing SQLite if not running on Vercel
if (!process.env.VERCEL) {
  try {
    const Database = require("better-sqlite3");
    const dataDir = path.join(__dirname, "data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    sqliteDb = new Database(path.join(dataDir, "reviews.sqlite"));
    sqliteDb.pragma("journal_mode = WAL");
    sqliteDb.exec(`
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

    const count = sqliteDb.prepare("SELECT COUNT(*) as count FROM reviews").get().count;
    if (count === 0) {
      const insertSeed = sqliteDb.prepare(`
        INSERT INTO reviews (name, phone, rating, review, contact_consent, created_at)
        VALUES (?, ?, ?, ?, ?, datetime('now', ?))
      `);
      insertSeed.run("Rahul Sharma", "+91 98765 43210", 5, "The active noise cancellation is mind-blowing on daily metro commutes. Battery easily lasted me 4 full days of work calls and music. Easily punches above its price class!", 1, "-3 days");
      insertSeed.run("Priya Patel", null, 5, "Super plush ear cushions, absolutely zero ear fatigue even after 6-hour video editing marathons. The soundstage is spacious and vocals are crystal clear.", 0, "-2 days");
      insertSeed.run("Aman Verma", "+91 98123 45678", 4, "Bass is deep and punchy, and high frequencies are crisp without harshness. Mic clarity on Zoom calls is great. Carrying case is slightly bulky, but headphones are fantastic.", 1, "-1 days");
      insertSeed.run("Sneha Iyer", null, 5, "Best wireless studio headphones in this price bracket. The matte acoustic cups and brushed metal headband feel ultra-premium.", 0, "-5 hours");
    }
    useSqlite = true;
  } catch (err) {
    console.warn("SQLite not available or read-only, falling back to JSON storage:", err.message);
    useSqlite = false;
  }
}

// 2. Fallback JSON / In-Memory storage (ideal for Vercel Serverless environment)
const jsonStorePath = process.env.VERCEL ? path.join("/tmp", "reviews.json") : path.join(__dirname, "data", "reviews.json");
let inMemoryReviews = [...SEED_REVIEWS];

function loadJsonStore() {
  try {
    if (fs.existsSync(jsonStorePath)) {
      const data = JSON.parse(fs.readFileSync(jsonStorePath, "utf-8"));
      if (Array.isArray(data) && data.length > 0) {
        inMemoryReviews = data;
      }
    }
  } catch (e) {
    // Keep inMemoryReviews
  }
}

function saveJsonStore() {
  try {
    const dir = path.dirname(jsonStorePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(jsonStorePath, JSON.stringify(inMemoryReviews, null, 2));
  } catch (e) {
    // Ignore write errors in read-only setups
  }
}

if (!useSqlite) {
  loadJsonStore();
}

module.exports = {
  getPublicReviews() {
    if (useSqlite && sqliteDb) {
      const reviews = sqliteDb.prepare(`
        SELECT id, name, rating, review, created_at
        FROM reviews
        ORDER BY id DESC
        LIMIT 100
      `).all();

      const stats = sqliteDb.prepare(`
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

      return {
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
      };
    }

    loadJsonStore();
    const publicList = inMemoryReviews.map(r => ({
      id: r.id,
      name: r.name,
      rating: r.rating,
      review: r.review,
      created_at: r.created_at
    })).sort((a, b) => b.id - a.id).slice(0, 100);

    const total = inMemoryReviews.length;
    const sum = inMemoryReviews.reduce((acc, r) => acc + r.rating, 0);
    const avgRating = total > 0 ? Number((sum / total).toFixed(1)) : 0;
    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    inMemoryReviews.forEach(r => {
      if (distribution[r.rating] !== undefined) distribution[r.rating]++;
    });

    return {
      reviews: publicList,
      stats: {
        total,
        avgRating,
        distribution
      }
    };
  },

  getAllReviewsAdmin() {
    if (useSqlite && sqliteDb) {
      return sqliteDb.prepare(`
        SELECT id, name, phone, rating, review, contact_consent, created_at
        FROM reviews ORDER BY id DESC LIMIT 500
      `).all();
    }
    loadJsonStore();
    return [...inMemoryReviews].sort((a, b) => b.id - a.id).slice(0, 500);
  },

  addReview({ name, phone, rating, review, contactConsent }) {
    const nowStr = new Date().toISOString().replace("T", " ").slice(0, 19);
    if (useSqlite && sqliteDb) {
      const result = sqliteDb.prepare(`
        INSERT INTO reviews (name, phone, rating, review, contact_consent, created_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `).run(name, phone && contactConsent ? phone : null, rating, review, contactConsent ? 1 : 0);
      return result.lastInsertRowid;
    }

    loadJsonStore();
    const nextId = inMemoryReviews.length > 0 ? Math.max(...inMemoryReviews.map(r => r.id)) + 1 : 1;
    const newEntry = {
      id: nextId,
      name,
      phone: phone && contactConsent ? phone : null,
      rating,
      review,
      contact_consent: contactConsent ? 1 : 0,
      created_at: nowStr
    };
    inMemoryReviews.push(newEntry);
    saveJsonStore();
    return nextId;
  },

  deleteReview(id) {
    if (useSqlite && sqliteDb) {
      const result = sqliteDb.prepare("DELETE FROM reviews WHERE id = ?").run(id);
      return result.changes > 0;
    }

    loadJsonStore();
    const initialLen = inMemoryReviews.length;
    inMemoryReviews = inMemoryReviews.filter(r => r.id !== id);
    if (inMemoryReviews.length < initialLen) {
      saveJsonStore();
      return true;
    }
    return false;
  }
};

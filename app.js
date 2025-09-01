require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto"); // Import crypto module

// Import routes
const apiRoutes = require("./routes/api");

// Import utilities
const { initTelegramBot } = require("./utils/telegram");
const { initDatabase } = require("./database/mysql-database");

const app = express();
const PORT = process.env.PORT || 3000;

// Function to generate a secure random string
function generateSecureRandomString(length) {
  return crypto
    .randomBytes(Math.ceil(length / 2))
    .toString("hex")
    .slice(0, length);
}

// Initialize Telegram Bot
initTelegramBot();

// Security middleware
if (process.env.NODE_ENV === "production") {
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            "'unsafe-inline'",
            "'unsafe-eval'",
            "cdn.jsdelivr.net",
            "cdn.tailwindcss.com",
          ],
          scriptSrcAttr: ["'self'", "'unsafe-inline'"],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            "fonts.googleapis.com",
            "cdn.jsdelivr.net",
            "cdn.tailwindcss.com",
          ],
          fontSrc: ["'self'", "fonts.gstatic.com", "fonts.googleapis.com"],
          imgSrc: ["'self'", "data:", "blob:"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
    })
  );
} else {
  // Development mode - disable CSP for easier development
  app.use(
    helmet({
      contentSecurityPolicy: false,
    })
  );
}
app.use(cors());

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Static files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/public", express.static(path.join(__dirname, "public")));

// Ensure upload directories exist
const uploadDirs = ["uploads/certificates", "uploads/qr-codes"];
uploadDirs.forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Routes
app.use("/api", apiRoutes);

// Serve static HTML pages
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "register.html"));
});

app.get("/register", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "register.html"));
});

app.get("/hasil", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "hasil.html"));
});

app.get("/check", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "hasil.html"));
});

// Serve static files
app.use(express.static("public"));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: "Terjadi kesalahan server internal",
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Endpoint tidak ditemukan",
  });
});

// Start server
async function startServer() {
  try {
    // Initialize database first
    await initDatabase();
    console.log("Database initialized successfully");

    app.listen(PORT, () => {
      const baseUrl = process.env.CUSTOM_DOMAIN || `http://localhost:${PORT}`;
      console.log(`Server running on ${baseUrl}`);
      console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
      if (process.env.CUSTOM_DOMAIN) {
        console.log(
          `🌐 Custom domain configured: ${process.env.CUSTOM_DOMAIN}`
        );
      }
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();

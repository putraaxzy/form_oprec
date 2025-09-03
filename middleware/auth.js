const rateLimit = require("express-rate-limit");
const { getConnection } = require("../database/mysql-database");

// Rate limiting untuk registrasi (dibuat tidak terbatas)
const registrationLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 1000, // 1000 requests per minute per IP
  message: {
    success: false,
    message:
      "Terlalu banyak percobaan pendaftaran. Silakan coba lagi dalam 1 jam.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting untuk cek status (dibuat tidak terbatas)
const statusCheckLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 1000, // 1000 requests per minute per IP
  message: {
    success: false,
    message: "Terlalu banyak permintaan cek status. Silakan tunggu sebentar.",
  },
});

// Rate limiting umum (dibuat tidak terbatas)
const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 1000, // 1000 requests per minute per IP
});

// Middleware untuk logging request
const requestLogger = (req, res, next) => {
  const timestamp = new Date().toISOString();
  const ip = req.ip || req.connection.remoteAddress;
  const userAgent = req.get("User-Agent") || "Unknown";

  console.log(
    `[${timestamp}] ${req.method} ${req.url} - IP: ${ip} - User-Agent: ${userAgent}`
  );

  next();
};

// Error handler middleware
const errorHandler = (err, req, res, next) => {
  console.error("Error:", err);

  // Multer error handling
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      success: false,
      message: "File terlalu besar",
    });
  }

  if (err.code === "LIMIT_UNEXPECTED_FILE") {
    return res.status(400).json({
      success: false,
      message: "Terlalu banyak file atau field tidak valid",
    });
  }

  // Database error handling for MySQL
  // Check for duplicate entry error code (ER_DUP_ENTRY for MySQL)
  if (err.code === "ER_DUP_ENTRY") {
    return res.status(400).json({
      success: false,
      message: "Data sudah ada (email/HP sudah terdaftar)",
    });
  }

  // Default error
  res.status(500).json({
    success: false,
    message: "Terjadi kesalahan server internal",
  });
};

module.exports = {
  registrationLimiter,
  statusCheckLimiter,
  generalLimiter,
  requestLogger,
  errorHandler,
};

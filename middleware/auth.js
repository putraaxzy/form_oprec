const rateLimit = require("express-rate-limit");
const { db } = require("../database/database");

// Rate limiting untuk registrasi
const registrationLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 3600000, // 1 hour
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 3, // 3 requests per hour per IP
  message: {
    success: false,
    message:
      "Terlalu banyak percobaan pendaftaran. Silakan coba lagi dalam 1 jam.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting untuk cek status
const statusCheckLimiter = rateLimit({
  windowMs: 60000, // 1 minute
  max: 10, // 10 requests per minute per IP
  message: {
    success: false,
    message: "Terlalu banyak permintaan cek status. Silakan tunggu sebentar.",
  },
});

// Rate limiting umum
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes per IP
});

// Middleware untuk validasi file upload
const validateFileUpload = (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Minimal satu sertifikat harus diupload",
    });
  }

  const maxSize = parseInt(process.env.MAX_FILE_SIZE) || 5242880; // 5MB default
  const allowedTypes = (
    process.env.ALLOWED_FILE_TYPES || "jpg,jpeg,png,pdf"
  ).split(",");

  for (const file of req.files) {
    if (file.size > maxSize) {
      return res.status(400).json({
        success: false,
        message: `File ${
          file.originalname
        } terlalu besar. Maksimal ${Math.round(maxSize / 1024 / 1024)}MB`,
      });
    }

    const fileExtension = file.originalname.split(".").pop().toLowerCase();
    if (!allowedTypes.includes(fileExtension)) {
      return res.status(400).json({
        success: false,
        message: `Format file ${
          file.originalname
        } tidak didukung. Format yang diizinkan: ${allowedTypes.join(", ")}`,
      });
    }
  }

  next();
};

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

  // Database error handling
  if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
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
  validateFileUpload,
  requestLogger,
  errorHandler,
};

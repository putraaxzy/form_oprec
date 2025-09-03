const { body, param, validationResult } = require("express-validator");

/**
 * MINIMAL VALIDATION MIDDLEWARE
 * Admin manual approval system - no strict validation
 */

// NO VALIDATION - Just pass through for admin manual approval
const handleValidationErrors = (req, res, next) => {
  // No validation errors - admin decides manually
  next();
};

// NO VALIDATION - Admin decides manually in Telegram
const validateRegistration = [
  (req, res, next) => next(), // Just pass through
];

// NO VALIDATION - Just pass through
const validateTicketCheck = [
  (req, res, next) => next(), // Just pass through
];

// NO VALIDATION - Just pass through  
const validateQRCheck = [
  (req, res, next) => next(), // Just pass through
];

// Rate limiting - minimal
const validateRateLimit = (req, res, next) => {
  // Skip rate limiting untuk development
  if (process.env.NODE_ENV === "development") {
    return next();
  }
  
  // Simple rate limiting
  const ip = req.ip;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxRequests = 50;
  
  if (!global.rateLimitStore) {
    global.rateLimitStore = new Map();
  }
  
  const userRequests = global.rateLimitStore.get(ip) || [];
  const recentRequests = userRequests.filter(time => now - time < windowMs);
  
  if (recentRequests.length >= maxRequests) {
    return res.status(429).json({
      success: false,
      message: "Terlalu banyak request, coba lagi nanti"
    });
  }
  
  recentRequests.push(now);
  global.rateLimitStore.set(ip, recentRequests);
  next();
};

// Input sanitization - minimal
const sanitizeInput = (req, res, next) => {
  // Basic XSS protection
  function basicSanitize(str) {
    if (typeof str !== 'string') return str;
    return str
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<[\/\!]*?[^<>]*?>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+=/gi, '');
  }
  
  // Sanitize body
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = basicSanitize(req.body[key]);
      }
    });
  }
  
  next();
};

// Export all functions
module.exports = {
  validateRegistration,
  validateTicketCheck,
  validateQRCheck,
  handleValidationErrors,
  validateRateLimit,
  sanitizeInput
};

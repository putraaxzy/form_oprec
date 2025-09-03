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

// Export all functions
module.exports = {
  validateRegistration,
  validateTicketCheck,
  validateQRCheck,
  handleValidationErrors,
};

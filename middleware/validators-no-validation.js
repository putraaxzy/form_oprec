/**
 * NO VALIDATION MIDDLEWARE
 * Admin akan validasi manual di Telegram Bot
 */

// Dummy middleware yang tidak melakukan validasi apapun
const noValidation = (req, res, next) => {
  // Langsung lanjut tanpa validasi
  next();
};

// Semua validator adalah dummy function
const validateRegistration = [noValidation];
const validateTicketCheck = [noValidation];
const validateQRCheck = [noValidation];

// Handle validation errors - dummy (tidak ada error yang akan di-handle)
const handleValidationErrors = (req, res, next) => {
  next();
};

module.exports = {
  validateRegistration,
  validateTicketCheck, 
  validateQRCheck,
  handleValidationErrors
};

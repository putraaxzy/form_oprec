/**
 * 🛡️ Database Error Handler
 * Handle database errors gracefully in production
 */
class DatabaseErrorHandler {
  constructor() {
    this.errorCounts = {};
    this.criticalErrors = ['ER_DUP_FIELDNAME', 'WARN_DATA_TRUNCATED', 'ER_BAD_FIELD_ERROR'];
  }

  /**
   * Handle database errors with specific strategies
   * @param {Error} error - Database error
   * @param {string} operation - Operation that failed
   * @param {*} data - Data that caused the error
   */
  handleError(error, operation = 'unknown', data = null) {
    const errorCode = error.code || 'UNKNOWN_ERROR';
    const errorType = this.categorizeError(error);
    
    // Log error details
    console.error(`\n❌ Database Error [${errorType}]:`);
    console.error(`   Code: ${errorCode}`);
    console.error(`   Operation: ${operation}`);
    console.error(`   SQL: ${error.sql || 'N/A'}`);
    console.error(`   Message: ${error.message}`);
    
    if (data) {
      console.error(`   Data: ${JSON.stringify(data, null, 2)}`);
    }

    // Track error frequency
    this.errorCounts[errorCode] = (this.errorCounts[errorCode] || 0) + 1;

    // Handle specific error types
    switch (errorCode) {
      case 'WARN_DATA_TRUNCATED':
        return this.handleDataTruncation(error, data);
      
      case 'ER_DUP_FIELDNAME':
        return this.handleDuplicateField(error);
      
      case 'ER_BAD_FIELD_ERROR':
        return this.handleBadField(error);
      
      case 'ER_NO_SUCH_TABLE':
        return this.handleMissingTable(error);
      
      default:
        return this.handleGenericError(error);
    }
  }

  /**
   * Handle data truncation errors (like nama_divisi ENUM issue)
   */
  handleDataTruncation(error, data) {
    console.log("🔧 Handling data truncation error...");
    
    // Extract column and table from SQL
    const sqlMatch = error.sql?.match(/INSERT INTO (\w+).*\(([^)]+)\)/);
    const table = sqlMatch?.[1];
    const columns = sqlMatch?.[2]?.split(',').map(c => c.trim());
    
    const response = {
      success: false,
      error: 'DATA_VALIDATION_ERROR',
      message: 'Data tidak sesuai dengan format yang diizinkan',
      details: {
        table: table,
        issue: 'Nilai yang dimasukkan tidak valid untuk field ini',
        suggestion: 'Silakan pilih nilai dari opsi yang tersedia'
      },
      userMessage: 'Terjadi kesalahan pada data yang dimasukkan. Silakan periksa kembali pilihan Anda.',
      action: 'SHOW_VALIDATION_ERROR'
    };

    // Special handling for divisi table
    if (table === 'divisi') {
      response.details.field = 'nama_divisi';
      response.details.allowed_values = [
        'sekretaris', 'bendahara', 'keagamaan', 'media_jaringan',
        'bakat_minat', 'jurnalistik', 'kedisiplinan'
      ];
      response.userMessage = 'Pilihan bidang/divisi tidak valid. Silakan pilih dari opsi yang tersedia.';
    }

    return response;
  }

  /**
   * Handle duplicate field errors
   */
  handleDuplicateField(error) {
    console.log("🔧 Handling duplicate field error...");
    
    return {
      success: false,
      error: 'DUPLICATE_FIELD',
      message: 'Field sudah ada dalam database',
      userMessage: 'Terjadi kesalahan konfigurasi database. Tim teknis akan segera memperbaiki.',
      action: 'CONTACT_ADMIN'
    };
  }

  /**
   * Handle bad field errors
   */
  handleBadField(error) {
    console.log("🔧 Handling bad field error...");
    
    return {
      success: false,
      error: 'INVALID_FIELD',
      message: 'Field tidak ditemukan dalam database',
      userMessage: 'Terjadi kesalahan sistem. Silakan coba lagi atau hubungi admin.',
      action: 'RETRY_OR_CONTACT_ADMIN'
    };
  }

  /**
   * Handle missing table errors
   */
  handleMissingTable(error) {
    console.log("🔧 Handling missing table error...");
    
    return {
      success: false,
      error: 'MISSING_TABLE',
      message: 'Tabel database tidak ditemukan',
      userMessage: 'Sistem sedang dalam maintenance. Silakan coba lagi nanti.',
      action: 'SYSTEM_MAINTENANCE'
    };
  }

  /**
   * Handle generic errors
   */
  handleGenericError(error) {
    console.log("🔧 Handling generic database error...");
    
    return {
      success: false,
      error: 'DATABASE_ERROR',
      message: error.message || 'Database operation failed',
      userMessage: 'Terjadi kesalahan sistem. Silakan coba lagi.',
      action: 'RETRY'
    };
  }

  /**
   * Categorize error type
   */
  categorizeError(error) {
    const code = error.code;
    
    if (['WARN_DATA_TRUNCATED', 'ER_DATA_TOO_LONG'].includes(code)) {
      return 'DATA_VALIDATION';
    }
    
    if (['ER_DUP_ENTRY', 'ER_DUP_FIELDNAME'].includes(code)) {
      return 'DUPLICATE';
    }
    
    if (['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(code)) {
      return 'SCHEMA';
    }
    
    if (['ECONNREFUSED', 'ETIMEDOUT'].includes(code)) {
      return 'CONNECTION';
    }
    
    return 'UNKNOWN';
  }

  /**
   * Get error statistics
   */
  getErrorStats() {
    return {
      totalErrors: Object.values(this.errorCounts).reduce((a, b) => a + b, 0),
      errorBreakdown: this.errorCounts,
      criticalErrors: Object.keys(this.errorCounts).filter(code => 
        this.criticalErrors.includes(code)
      )
    };
  }

  /**
   * Reset error counters
   */
  resetStats() {
    this.errorCounts = {};
  }
}

/**
 * Enhanced registration error wrapper
 * Use this in your registration API route
 */
class RegistrationErrorWrapper {
  constructor() {
    this.dbErrorHandler = new DatabaseErrorHandler();
  }

  /**
   * Wrap database operations with error handling
   */
  async wrapDatabaseOperation(operation, operationName = 'database_operation', data = null) {
    try {
      return await operation();
    } catch (error) {
      const errorResponse = this.dbErrorHandler.handleError(error, operationName, data);
      
      // Add timestamp and operation context
      errorResponse.timestamp = new Date().toISOString();
      errorResponse.operation = operationName;
      
      // Log for monitoring
      console.error(`\n🚨 Registration Error [${operationName}]:`, {
        error: error.message,
        code: error.code,
        sql: error.sql,
        data: data
      });
      
      return errorResponse;
    }
  }

  /**
   * Handle registration-specific errors
   */
  async handleRegistrationError(error, registrationData) {
    // Special handling for common registration errors
    if (error.code === 'WARN_DATA_TRUNCATED') {
      // Check if it's the divisi issue
      if (error.sql?.includes('INSERT INTO divisi')) {
        return {
          success: false,
          error: 'INVALID_DIVISION',
          message: 'Pilihan bidang/divisi tidak valid',
          userMessage: 'Silakan pilih bidang/divisi dari opsi yang tersedia pada form.',
          field: 'divisi',
          action: 'VALIDATE_FORM_INPUT',
          timestamp: new Date().toISOString()
        };
      }
    }

    // Use general error handler
    return this.dbErrorHandler.handleError(error, 'registration', registrationData);
  }
}

// Export for use in other modules
module.exports = {
  DatabaseErrorHandler,
  RegistrationErrorWrapper
};

// Usage example in registration route:
/*
const { RegistrationErrorWrapper } = require('./database-error-handler');
const errorWrapper = new RegistrationErrorWrapper();

// In your registration API route:
app.post('/api/register', async (req, res) => {
  const result = await errorWrapper.wrapDatabaseOperation(
    () => processRegistration(req.body),
    'user_registration',
    req.body
  );
  
  if (!result.success) {
    return res.status(400).json(result);
  }
  
  res.json(result);
});
*/

/**
 * 🛡️ Response Error Handler
 * Mengatasi error "Failed to execute 'text' on 'Response': body stream already read"
 * dan error response handling lainnya
 */

class ResponseErrorHandler {
  /**
   * Safe fetch with proper error handling
   * @param {string} url - Request URL
   * @param {object} options - Fetch options
   * @returns {Promise} - Promise with response data
   */
  static async safeFetch(url, options = {}) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      });

      // Clone response to avoid "body stream already read" error
      const responseClone = response.clone();
      
      // Check if response is ok
      if (!response.ok) {
        let errorData;
        try {
          errorData = await responseClone.json();
        } catch (parseError) {
          try {
            errorData = await responseClone.text();
          } catch (textError) {
            errorData = { message: `HTTP ${response.status}: ${response.statusText}` };
          }
        }
        
        throw new Error(errorData.message || errorData.userMessage || `Request failed: ${response.status}`);
      }

      // Try to parse JSON, fallback to text
      try {
        return await response.json();
      } catch (jsonError) {
        try {
          return await response.text();
        } catch (textError) {
          return { success: true, message: 'Request completed' };
        }
      }

    } catch (error) {
      console.error('Fetch error:', error);
      throw error;
    }
  }

  /**
   * Handle registration form submission with proper error handling
   * @param {FormData} formData - Form data to submit
   * @returns {Promise} - Promise with result
   */
  static async submitRegistration(formData) {
    try {
      const result = await this.safeFetch('/api/register', {
        method: 'POST',
        body: formData,
        // Don't set Content-Type header for FormData, let browser set it
        headers: {} // Remove Content-Type to let browser handle FormData
      });

      return {
        success: true,
        data: result,
        message: result.message || 'Registrasi berhasil!'
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        userMessage: this.getUserFriendlyMessage(error.message)
      };
    }
  }

  /**
   * Handle ticket check with proper error handling
   * @param {string} ticket - Ticket number
   * @returns {Promise} - Promise with result
   */
  static async checkTicket(ticket) {
    try {
      const result = await this.safeFetch(`/api/ticket/${ticket}`, {
        method: 'GET'
      });

      return {
        success: true,
        data: result
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        userMessage: this.getUserFriendlyMessage(error.message)
      };
    }
  }

  /**
   * Convert technical errors to user-friendly messages
   * @param {string} errorMessage - Technical error message
   * @returns {string} - User-friendly message
   */
  static getUserFriendlyMessage(errorMessage) {
    const errorMap = {
      'INVALID_DIVISION': 'Pilihan bidang/divisi tidak valid. Silakan pilih dari opsi yang tersedia.',
      'DATA_VALIDATION_ERROR': 'Data yang dimasukkan tidak valid. Silakan periksa kembali.',
      'DUPLICATE_PHONE': 'Nomor telepon sudah terdaftar. Gunakan nomor lain.',
      'DUPLICATE_ENTRY': 'Data sudah pernah didaftarkan sebelumnya.',
      'FILE_TOO_LARGE': 'Ukuran file terlalu besar. Maksimal 5MB per file.',
      'INVALID_FILE_TYPE': 'Jenis file tidak didukung. Gunakan JPG, PNG, atau PDF.',
      'NETWORK_ERROR': 'Koneksi internet bermasalah. Silakan coba lagi.',
      'SERVER_ERROR': 'Server sedang mengalami gangguan. Silakan coba lagi nanti.'
    };

    // Check for specific error patterns
    for (const [key, message] of Object.entries(errorMap)) {
      if (errorMessage.includes(key) || errorMessage.toLowerCase().includes(key.toLowerCase())) {
        return message;
      }
    }

    // Default user-friendly messages based on common error patterns
    if (errorMessage.includes('truncated')) {
      return 'Data yang dimasukkan tidak sesuai format. Silakan periksa kembali pilihan Anda.';
    }
    
    if (errorMessage.includes('duplicate')) {
      return 'Data sudah pernah didaftarkan. Silakan gunakan data yang berbeda.';
    }
    
    if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
      return 'Koneksi bermasalah. Periksa internet Anda dan coba lagi.';
    }
    
    if (errorMessage.includes('500')) {
      return 'Server sedang bermasalah. Tim teknis sedang memperbaiki.';
    }
    
    if (errorMessage.includes('404')) {
      return 'Halaman atau data tidak ditemukan.';
    }
    
    // Fallback generic message
    return 'Terjadi kesalahan. Silakan coba lagi atau hubungi admin jika masalah berlanjut.';
  }

  /**
   * Show user-friendly error message
   * @param {string} message - Error message to show
   * @param {string} type - Alert type (error, warning, info)
   */
  static showError(message, type = 'error') {
    // Try to use existing alert system first
    if (typeof showAlert === 'function') {
      showAlert(message, type);
      return;
    }
    
    // Fallback to browser alert
    alert(`❌ Error: ${message}`);
    
    // Log to console for debugging
    console.error('User Error:', message);
  }

  /**
   * Show success message
   * @param {string} message - Success message to show
   */
  static showSuccess(message) {
    if (typeof showAlert === 'function') {
      showAlert(message, 'success');
      return;
    }
    
    alert(`✅ ${message}`);
    console.log('Success:', message);
  }
}

// --- ENHANCED FORM HANDLERS ---

/**
 * Enhanced registration form handler
 */
function setupEnhancedRegistrationForm() {
  const form = document.querySelector('#registrationForm');
  if (!form) return;

  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    // Show loading state
    const submitButton = form.querySelector('button[type="submit"]');
    const originalText = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = 'Mengirim...';

    try {
      const formData = new FormData(form);
      
      // Validate form data before sending
      const validation = validateRegistrationData(formData);
      if (!validation.isValid) {
        throw new Error(validation.message);
      }

      const result = await ResponseErrorHandler.submitRegistration(formData);

      if (result.success) {
        ResponseErrorHandler.showSuccess(result.message);
        form.reset(); // Reset form on success
      } else {
        ResponseErrorHandler.showError(result.userMessage);
      }

    } catch (error) {
      ResponseErrorHandler.showError(ResponseErrorHandler.getUserFriendlyMessage(error.message));
    } finally {
      // Restore button state
      submitButton.disabled = false;
      submitButton.textContent = originalText;
    }
  });
}

/**
 * Enhanced ticket check handler
 */
function setupEnhancedTicketCheck() {
  const checkButton = document.querySelector('#checkButton');
  const ticketInput = document.querySelector('#ticketNumber');
  
  if (!checkButton || !ticketInput) return;

  checkButton.addEventListener('click', async function(e) {
    e.preventDefault();
    
    const ticket = ticketInput.value.trim();
    if (!ticket) {
      ResponseErrorHandler.showError('Silakan masukkan nomor tiket.');
      return;
    }

    // Show loading state
    const originalText = checkButton.textContent;
    checkButton.disabled = true;
    checkButton.textContent = 'Memeriksa...';

    try {
      const result = await ResponseErrorHandler.checkTicket(ticket);

      if (result.success) {
        displayResult(result.data); // Call existing display function
      } else {
        ResponseErrorHandler.showError(result.userMessage);
      }

    } catch (error) {
      ResponseErrorHandler.showError(ResponseErrorHandler.getUserFriendlyMessage(error.message));
    } finally {
      // Restore button state
      checkButton.disabled = false;
      checkButton.textContent = originalText;
    }
  });
}

/**
 * Validate registration form data
 * @param {FormData} formData - Form data to validate
 * @returns {object} - Validation result
 */
function validateRegistrationData(formData) {
  const required = ['nama_lengkap', 'kelas', 'jurusan', 'nomor_telepon'];
  
  for (const field of required) {
    if (!formData.get(field)) {
      return {
        isValid: false,
        message: `Field ${field.replace('_', ' ')} wajib diisi.`
      };
    }
  }

  // Validate phone number format
  const phone = formData.get('nomor_telepon');
  if (phone && !/^[0-9+\-\s()]{10,15}$/.test(phone)) {
    return {
      isValid: false,
      message: 'Format nomor telepon tidak valid.'
    };
  }

  // Check file sizes
  const files = ['foto', 'sertifikat_prestasi_1', 'sertifikat_organisasi_1'];
  for (const field of files) {
    const file = formData.get(field);
    if (file && file.size > 5 * 1024 * 1024) { // 5MB limit
      return {
        isValid: false,
        message: `File ${field} terlalu besar. Maksimal 5MB.`
      };
    }
  }

  return { isValid: true };
}

// --- AUTO SETUP ---
document.addEventListener('DOMContentLoaded', function() {
  setupEnhancedRegistrationForm();
  setupEnhancedTicketCheck();
});

// --- EXPORT FOR MODULE USAGE ---
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ResponseErrorHandler,
    setupEnhancedRegistrationForm,
    setupEnhancedTicketCheck,
    validateRegistrationData
  };
}

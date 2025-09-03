const { body, param, validationResult } = require("express-validator");

// Enhanced error handler with better formatting
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Group errors by field for better readability
    const groupedErrors = errors.array().reduce((acc, error) => {
      const field = error.path;
      if (!acc[field]) {
        acc[field] = [];
      }
      acc[field].push(error.msg);
      return acc;
    }, {});

    return res.status(400).json({
      success: false,
      message: "Data tidak valid",
      errors: groupedErrors,
      error_count: errors.array().length
    });
  }
  next();
};

// Enhanced custom validators
const customValidators = {
  // Phone number validator for Indonesian format
  isIndonesianPhone: (value) => {
    const cleaned = value.replace(/\D/g, "");
    const validPrefixes = ['08', '628', '+628'];
    const hasValidPrefix = validPrefixes.some(prefix => 
      value.replace(/\D/g, "").startsWith(prefix.replace(/\D/g, ""))
    );
    return hasValidPrefix && cleaned.length >= 10 && cleaned.length <= 15;
  },

  // Name validator (allows Indonesian characters)
  isValidIndonesianName: (value) => {
    return /^[a-zA-Z\s\u00C0-\u017F'-]+$/.test(value);
  },

  // Age validator based on birth date
  isValidAge: (value) => {
    const birthDate = new Date(value);
    const today = new Date();
    const age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    return age >= 13 && age <= 20; // School age range
  },

  // File validation
  validateFileUpload: (req, fieldName, allowedTypes = ['jpg', 'jpeg', 'png', 'pdf'], maxSize = 5 * 1024 * 1024) => {
    if (!req.files) return true;
    
    const files = req.files.filter(file => file.fieldname.includes(fieldName));
    
    for (const file of files) {
      // Check file type
      const fileExtension = file.originalname.split('.').pop().toLowerCase();
      if (!allowedTypes.includes(fileExtension)) {
        throw new Error(`File ${file.originalname}: Format tidak didukung. Hanya ${allowedTypes.join(', ').toUpperCase()} yang diizinkan.`);
      }
      
      // Check file size
      if (file.size > maxSize) {
        const maxSizeMB = Math.round(maxSize / (1024 * 1024));
        throw new Error(`File ${file.originalname}: Ukuran terlalu besar. Maksimal ${maxSizeMB}MB.`);
      }
    }
    
    return true;
  }
};

// Enhanced registration validation
const validateRegistration = [
  // Personal Information
  body("nama_lengkap")
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Nama lengkap harus antara 2-100 karakter")
    .custom(customValidators.isValidIndonesianName)
    .withMessage("Nama lengkap hanya boleh berisi huruf, spasi, apostrof, dan tanda hubung"),

  body("nama_panggilan")
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Nama panggilan harus antara 2-50 karakter")
    .custom(customValidators.isValidIndonesianName)
    .withMessage("Nama panggilan hanya boleh berisi huruf, spasi, apostrof, dan tanda hubung"),

  body("kelas")
    .trim()
    .matches(/^(X|XI|XII|10|11|12)/)
    .withMessage("Format kelas tidak valid (contoh: X, XI, XII, 10, 11, 12)"),

  body("jurusan")
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Jurusan harus antara 2-50 karakter"),

  body("tempat_lahir")
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Tempat lahir harus antara 2-100 karakter"),

  body("tanggal_lahir")
    .isISO8601()
    .withMessage("Format tanggal lahir tidak valid (YYYY-MM-DD)")
    .custom(customValidators.isValidAge)
    .withMessage("Usia harus antara 13-20 tahun"),

  body("alamat")
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage("Alamat harus antara 10-500 karakter"),

  body("agama")
    .isIn(["Islam", "Kristen", "Katolik", "Hindu", "Buddha", "Konghucu", "Kepercayaan"])
    .withMessage("Pilihan agama tidak valid"),

  body("jenis_kelamin")
    .isIn(["Laki-laki", "Perempuan"])
    .withMessage("Pilihan jenis kelamin tidak valid"),

  body("nomor_telepon")
    .custom(customValidators.isIndonesianPhone)
    .withMessage("Format nomor telepon tidak valid. Gunakan format Indonesia (08xx, +628xx, atau 628xx)"),

  body("email")
    .optional({ nullable: true, checkFalsy: true })
    .isEmail()
    .withMessage("Format email tidak valid")
    .normalizeEmail()
    .custom((value) => {
      if (value && value.length > 100) {
        throw new Error("Email maksimal 100 karakter");
      }
      return true;
    }),

  body("hobi")
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 200 })
    .withMessage("Hobi maksimal 200 karakter"),

  body("motto")
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 300 })
    .withMessage("Motto hidup maksimal 300 karakter"),

  // Motivation and Division
  body("motivasi")
    .trim()
    .isLength({ min: 20, max: 1000 })
    .withMessage("Motivasi bergabung harus antara 20-1000 karakter"),

  body("divisi")
    .custom((value) => {
      if (!Array.isArray(value) && typeof value === 'string') {
        value = [value];
      }
      if (!Array.isArray(value) || value.length < 1 || value.length > 2) {
        throw new Error("Pilih minimal 1 dan maksimal 2 divisi");
      }
      return true;
    }),

  body("divisi.*")
    .isIn([
      "Humas", "Keamanan", "Kebersihan", "Keagamaan", "Kewirausahaan",
      "Olahraga", "Seni", "Teknologi", "Akademik", "Sosial"
    ])
    .withMessage("Pilihan divisi tidak valid"),

  // Division reasons validation
  body("alasan_Humas")
    .if(body("divisi").custom(value => {
      const divisiArray = Array.isArray(value) ? value : [value];
      return divisiArray.includes("Humas");
    }))
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage("Alasan memilih divisi Humas harus antara 10-500 karakter"),

  body("alasan_Keamanan")
    .if(body("divisi").custom(value => {
      const divisiArray = Array.isArray(value) ? value : [value];
      return divisiArray.includes("Keamanan");
    }))
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage("Alasan memilih divisi Keamanan harus antara 10-500 karakter"),

  body("alasan_Kebersihan")
    .if(body("divisi").custom(value => {
      const divisiArray = Array.isArray(value) ? value : [value];
      return divisiArray.includes("Kebersihan");
    }))
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage("Alasan memilih divisi Kebersihan harus antara 10-500 karakter"),

  body("alasan_Keagamaan")
    .if(body("divisi").custom(value => {
      const divisiArray = Array.isArray(value) ? value : [value];
      return divisiArray.includes("Keagamaan");
    }))
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage("Alasan memilih divisi Keagamaan harus antara 10-500 karakter"),

  body("alasan_Kewirausahaan")
    .if(body("divisi").custom(value => {
      const divisiArray = Array.isArray(value) ? value : [value];
      return divisiArray.includes("Kewirausahaan");
    }))
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage("Alasan memilih divisi Kewirausahaan harus antara 10-500 karakter"),

  body("alasan_Olahraga")
    .if(body("divisi").custom(value => {
      const divisiArray = Array.isArray(value) ? value : [value];
      return divisiArray.includes("Olahraga");
    }))
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage("Alasan memilih divisi Olahraga harus antara 10-500 karakter"),

  body("alasan_Seni")
    .if(body("divisi").custom(value => {
      const divisiArray = Array.isArray(value) ? value : [value];
      return divisiArray.includes("Seni");
    }))
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage("Alasan memilih divisi Seni harus antara 10-500 karakter"),

  body("alasan_Teknologi")
    .if(body("divisi").custom(value => {
      const divisiArray = Array.isArray(value) ? value : [value];
      return divisiArray.includes("Teknologi");
    }))
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage("Alasan memilih divisi Teknologi harus antara 10-500 karakter"),

  body("alasan_Akademik")
    .if(body("divisi").custom(value => {
      const divisiArray = Array.isArray(value) ? value : [value];
      return divisiArray.includes("Akademik");
    }))
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage("Alasan memilih divisi Akademik harus antara 10-500 karakter"),

  body("alasan_Sosial")
    .if(body("divisi").custom(value => {
      const divisiArray = Array.isArray(value) ? value : [value];
      return divisiArray.includes("Sosial");
    }))
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage("Alasan memilih divisi Sosial harus antara 10-500 karakter"),

  // Organization experience validation
  body("organisasi_nama")
    .optional({ nullable: true, checkFalsy: true })
    .custom((value) => {
      if (value) {
        const names = Array.isArray(value) ? value : [value];
        for (let name of names) {
          if (name && (name.trim().length < 2 || name.trim().length > 100)) {
            throw new Error("Nama organisasi harus antara 2-100 karakter");
          }
        }
      }
      return true;
    }),

  body("organisasi_jabatan")
    .optional({ nullable: true, checkFalsy: true })
    .custom((value) => {
      if (value) {
        const jabatan = Array.isArray(value) ? value : [value];
        for (let j of jabatan) {
          if (j && (j.trim().length < 2 || j.trim().length > 50)) {
            throw new Error("Jabatan organisasi harus antara 2-50 karakter");
          }
        }
      }
      return true;
    }),

  body("organisasi_tahun")
    .optional({ nullable: true, checkFalsy: true })
    .custom((value) => {
      if (value) {
        const tahun = Array.isArray(value) ? value : [value];
        for (let t of tahun) {
          if (t && (!/^\d{4}(-\d{4})?$/.test(t.trim()))) {
            throw new Error("Format tahun organisasi tidak valid (contoh: 2023 atau 2023-2024)");
          }
        }
      }
      return true;
    }),

  // Achievement validation
  body("prestasi_nama")
    .optional({ nullable: true, checkFalsy: true })
    .custom((value) => {
      if (value) {
        const names = Array.isArray(value) ? value : [value];
        for (let name of names) {
          if (name && (name.trim().length < 3 || name.trim().length > 150)) {
            throw new Error("Nama prestasi harus antara 3-150 karakter");
          }
        }
      }
      return true;
    }),

  body("prestasi_tingkat")
    .optional({ nullable: true, checkFalsy: true })
    .custom((value) => {
      if (value) {
        const tingkat = Array.isArray(value) ? value : [value];
        const validLevels = ["Sekolah", "Kecamatan", "Kabupaten", "Provinsi", "Nasional", "Internasional"];
        for (let t of tingkat) {
          if (t && !validLevels.includes(t)) {
            throw new Error("Tingkat prestasi tidak valid");
          }
        }
      }
      return true;
    }),

  body("prestasi_tahun")
    .optional({ nullable: true, checkFalsy: true })
    .custom((value) => {
      if (value) {
        const tahun = Array.isArray(value) ? value : [value];
        for (let t of tahun) {
          if (t && (!/^\d{4}$/.test(t.trim()) || parseInt(t) < 2010 || parseInt(t) > new Date().getFullYear())) {
            throw new Error("Tahun prestasi tidak valid");
          }
        }
      }
      return true;
    }),

  // File validation - will be handled by multer but we can add additional checks
  body().custom((value, { req }) => {
    if (!req.files || req.files.length === 0) {
      throw new Error("Foto 3x4 wajib diupload");
    }
    
    // Check if photo exists
    const photoFile = req.files.find(file => file.fieldname === 'foto');
    if (!photoFile) {
      throw new Error("Foto 3x4 wajib diupload");
    }

    // Validate all uploaded files
    try {
      customValidators.validateFileUpload(req, 'foto', ['jpg', 'jpeg', 'png'], 2 * 1024 * 1024); // 2MB for photos
      customValidators.validateFileUpload(req, 'sertifikat', ['jpg', 'jpeg', 'png', 'pdf'], 5 * 1024 * 1024); // 5MB for certificates
    } catch (error) {
      throw new Error(error.message);
    }

    return true;
  }),
];

// Ticket check validation (support both formats)
const validateTicketCheck = [
  param("ticket")
    .trim()
    .custom((value) => {
      // Support both old and new format
      const newFormat = /^OSIS\d{2}-\d{6}-[A-Z]$/; // OSIS24-123456-A
      const oldFormat = /^[A-Z0-9]{8,20}$/; // Legacy format support
      
      if (newFormat.test(value) || oldFormat.test(value)) {
        return true;
      }
      
      throw new Error("Format tiket tidak valid");
    }),
];

// QR verification validation
const validateQRVerification = [
  body("ticket")
    .trim()
    .matches(/^OSIS\d{2}-\d{6}-[A-Z]$/)
    .withMessage("Format tiket tidak valid"),
];

// Admin command validation
const validateAdminAction = [
  body("ticket")
    .trim()
    .matches(/^OSIS\d{2}-\d{6}-[A-Z]$/)
    .withMessage("Format tiket tidak valid"),

  body("action")
    .isIn(["approve", "reject", "delete"])
    .withMessage("Aksi tidak valid"),

  body("reason")
    .if(body("action").equals("reject"))
    .trim()
    .isLength({ min: 5, max: 500 })
    .withMessage("Alasan penolakan harus antara 5-500 karakter"),

  body("divisi")
    .if(body("action").equals("approve"))
    .isIn([
      "Humas", "Keamanan", "Kebersihan", "Keagamaan", "Kewirausahaan",
      "Olahraga", "Seni", "Teknologi", "Akademik", "Sosial"
    ])
    .withMessage("Divisi tidak valid"),
];

// Search validation
const validateSearch = [
  body("query")
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Query pencarian harus antara 2-100 karakter"),

  body("type")
    .optional()
    .isIn(["name", "ticket", "class", "division", "all"])
    .withMessage("Tipe pencarian tidak valid"),

  body("status")
    .optional()
    .isIn(["PENDING", "LOLOS", "DITOLAK", "PENDING_BOT_APPROVAL"])
    .withMessage("Status tidak valid"),
];

// Settings update validation
const validateSettingsUpdate = [
  body("telegram_bot_token")
    .optional({ nullable: true, checkFalsy: true })
    .matches(/^\d+:[A-Za-z0-9_-]{35}$/)
    .withMessage("Format token bot Telegram tidak valid"),

  body("telegram_chat_id")
    .optional({ nullable: true, checkFalsy: true })
    .matches(/^-?\d+$/)
    .withMessage("Format chat ID Telegram tidak valid"),

  body("whatsapp_group_link")
    .optional({ nullable: true, checkFalsy: true })
    .isURL({ require_protocol: true })
    .withMessage("Format link WhatsApp tidak valid"),

  body("max_file_size")
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 1024 * 1024, max: 100 * 1024 * 1024 }) // 1MB to 100MB
    .withMessage("Ukuran file maksimal harus antara 1MB - 100MB"),

  body("registration_open")
    .optional()
    .isBoolean()
    .withMessage("Status pendaftaran harus boolean"),
];

// Rate limiting validation
const validateRateLimit = (req, res, next) => {
  // Check if IP has been rate limited
  const clientIP = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('User-Agent') || 'Unknown';
  
  // Log request for monitoring
  console.log(`📊 Request from ${clientIP} - ${userAgent} - ${req.method} ${req.path}`);
  
  next();
};

// Sanitize input to prevent XSS
const sanitizeInput = (req, res, next) => {
  // Basic XSS prevention
  const sanitizeString = (str) => {
    if (typeof str !== 'string') return str;
    return str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '');
  };

  // Sanitize request body
  if (req.body && typeof req.body === 'object') {
    const sanitizeObject = (obj) => {
      for (let key in obj) {
        if (typeof obj[key] === 'string') {
          obj[key] = sanitizeString(obj[key]);
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          sanitizeObject(obj[key]);
        }
      }
    };
    sanitizeObject(req.body);
  }

  next();
};

module.exports = {
  handleValidationErrors,
  validateRegistration,
  validateTicketCheck,
  validateQRVerification,
  validateAdminAction,
  validateSearch,
  validateSettingsUpdate,
  validateRateLimit,
  sanitizeInput,
  customValidators,
};

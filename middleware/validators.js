const { body, param, validationResult } = require("express-validator");

// Helper function untuk handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Data tidak valid",
      errors: errors.array().map((error) => ({
        field: error.path,
        message: error.msg,
      })),
    });
  }
  next();
};

// Validasi untuk registrasi
const validateRegistration = [
  body("nama_lengkap")
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Nama Lengkap harus antara 2-100 karakter")
    .matches(/^[a-zA-Z\s\u00C0-\u017F]+$/)
    .withMessage("Nama Lengkap hanya boleh berisi huruf dan spasi"),

  body("nama_panggilan")
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Nama Panggilan harus antara 2-50 karakter")
    .matches(/^[a-zA-Z\s\u00C0-\u017F]+$/)
    .withMessage("Nama Panggilan hanya boleh berisi huruf dan spasi"),

  body("tempat_lahir")
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Tempat Lahir harus antara 2-50 karakter"),

  body("tanggal_lahir")
    .isISO8601()
    .withMessage("Format Tanggal Lahir tidak valid (YYYY-MM-DD)"),

  body("alamat_asal")
    .trim()
    .isLength({ min: 5, max: 255 })
    .withMessage("Alamat Asal harus antara 5-255 karakter"),

  body("alamat_sekarang")
    .trim()
    .isLength({ min: 5, max: 255 })
    .withMessage("Alamat Sekarang harus antara 5-255 karakter"),

  body("agama")
    .isIn(["Islam", "Kristen", "Katolik", "Hindu", "Buddha", "Konghucu"])
    .withMessage("Pilihan Agama tidak valid"),

  body("jenis_kelamin")
    .isIn(["Laki-laki", "Perempuan"])
    .withMessage("Pilihan Jenis Kelamin tidak valid"),

  body("nomor_telepon")
    .isMobilePhone("id-ID")
    .withMessage("Format Nomor Telepon tidak valid")
    .custom((value) => {
      const cleaned = value.replace(/\D/g, "");
      if (cleaned.length < 10 || cleaned.length > 15) {
        throw new Error("Nomor Telepon harus antara 10-15 digit");
      }
      return true;
    }),

  body("email")
    .optional({ nullable: true, checkFalsy: true })
    .isEmail()
    .withMessage("Format Email tidak valid")
    .normalizeEmail(),

  body("hobi")
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage("Hobi maksimal 100 karakter"),

  body("motto")
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 255 })
    .withMessage("Motto Hidup maksimal 255 karakter"),

  body("motivasi")
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage("Motivasi harus antara 10-1000 karakter"),

  body("divisi")
    .isArray({ min: 1, max: 2 })
    .withMessage("Pilih minimal 1 dan maksimal 2 divisi"),

  body("divisi.*")
    .isIn([
      "sekretaris",
      "bendahara",
      "keagamaan",
      "media_jaringan",
      "bakat_minat",
      "jurnalistik",
      "kedisiplinan",
    ])
    .withMessage("Divisi yang dipilih tidak valid"),

  body("alasan_sekretaris")
    .if(body("divisi").contains("sekretaris"))
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage("Alasan memilih Sekretaris harus antara 10-500 karakter"),

  body("alasan_bendahara")
    .if(body("divisi").contains("bendahara"))
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage("Alasan memilih Bendahara harus antara 10-500 karakter"),

  body("alasan_keagamaan")
    .if(body("divisi").contains("keagamaan"))
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage(
      "Alasan memilih Divisi Keagamaan harus antara 10-500 karakter"
    ),

  body("alasan_media_jaringan")
    .if(body("divisi").contains("media_jaringan"))
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage(
      "Alasan memilih Divisi Media & Jaringan harus antara 10-500 karakter"
    ),

  body("alasan_bakat_minat")
    .if(body("divisi").contains("bakat_minat"))
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage(
      "Alasan memilih Divisi Bakat & Minat harus antara 10-500 karakter"
    ),

  body("alasan_jurnalistik")
    .if(body("divisi").contains("jurnalistik"))
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage(
      "Alasan memilih Divisi Jurnalistik harus antara 10-500 karakter"
    ),

  body("alasan_kedisiplinan")
    .if(body("divisi").contains("kedisiplinan"))
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage(
      "Alasan memilih Divisi Kedisiplinan harus antara 10-500 karakter"
    ),

  // Organisasi
  body("organisasi_nama.*")
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Nama Organisasi harus antara 2-100 karakter"),
  body("organisasi_jabatan.*")
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Jabatan Organisasi harus antara 2-100 karakter"),
  body("organisasi_tahun.*")
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .matches(/^\d{4}(-\d{4})?$/)
    .withMessage(
      "Format Tahun Organisasi tidak valid (contoh: 2023 atau 2023-2024)"
    ),

  // Prestasi
  body("prestasi_nama.*")
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Nama Prestasi harus antara 2-100 karakter"),
  body("prestasi_tingkat.*")
    .optional({ nullable: true, checkFalsy: true })
    .isIn(["Sekolah", "Kabupaten", "Provinsi", "Nasional", "Internasional"])
    .withMessage("Tingkat Prestasi tidak valid"),
  body("prestasi_tahun.*")
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ min: 4, max: 4 })
    .isNumeric()
    .withMessage("Tahun Prestasi harus 4 digit angka"),

  // File uploads
  body("foto").custom((value, { req }) => {
    if (!req.files || !req.files.foto || req.files.foto.length === 0) {
      throw new Error("Foto 3x4 wajib diupload");
    }
    const file = req.files.foto[0];
    const allowedMimes = ["image/jpeg", "image/png"];
    if (!allowedMimes.includes(file.mimetype)) {
      throw new Error("Format foto tidak didukung. Hanya JPG/PNG.");
    }
    if (file.size > 2 * 1024 * 1024) {
      // 2MB
      throw new Error("Ukuran foto maksimal 2MB");
    }
    return true;
  }),

  body("prestasi_sertifikat")
    .optional()
    .custom((value, { req }) => {
      if (req.files && req.files.prestasi_sertifikat) {
        for (const file of req.files.prestasi_sertifikat) {
          const allowedMimes = ["image/jpeg", "image/png", "application/pdf"];
          if (!allowedMimes.includes(file.mimetype)) {
            throw new Error(
              `Format sertifikat tidak didukung: ${file.originalname}. Hanya JPG/PNG/PDF.`
            );
          }
          if (file.size > 5 * 1024 * 1024) {
            // 5MB
            throw new Error(
              `Ukuran sertifikat maksimal 5MB: ${file.originalname}`
            );
          }
        }
      }
      return true;
    }),

  handleValidationErrors,
];

// Validasi untuk login admin
const validateAdminLogin = [
  body("username")
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage("Username harus antara 3-50 karakter")
    .isAlphanumeric()
    .withMessage("Username hanya boleh berisi huruf dan angka"),

  body("password")
    .isLength({ min: 6 })
    .withMessage("Password minimal 6 karakter"),

  handleValidationErrors,
];

// Validasi untuk cek status tiket
const validateTicketCheck = [
  param("ticket")
    .trim()
    .matches(/^OSIS\d{2}-\d{6}-[A-Z]$/)
    .withMessage("Format tiket tidak valid (contoh: OSIS25-000123-A)"),

  handleValidationErrors,
];

// Validasi untuk admin action
const validateAdminAction = [
  body("action")
    .isIn(["approve", "reject"])
    .withMessage("Action harus berupa approve atau reject"),

  body("note")
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 255 })
    .withMessage("Catatan maksimal 255 karakter"),

  handleValidationErrors,
];

// Validasi untuk verifikasi QR
const validateQRVerification = [
  body("qrData")
    .notEmpty()
    .withMessage("Data QR code diperlukan")
    .isJSON()
    .withMessage("Format QR data tidak valid (harus JSON)"),

  handleValidationErrors,
];

// Validasi untuk update admin profile
const validateAdminProfileUpdate = [
  body("username")
    .optional()
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage("Username harus antara 3-50 karakter")
    .isAlphanumeric()
    .withMessage("Username hanya boleh berisi huruf dan angka"),

  body("currentPassword")
    .if(body("newPassword").exists())
    .notEmpty()
    .withMessage("Password lama diperlukan untuk mengubah password"),

  body("newPassword")
    .optional({ nullable: true, checkFalsy: true })
    .isLength({ min: 6 })
    .withMessage("Password baru minimal 6 karakter"),

  body("confirmPassword")
    .if(body("newPassword").exists())
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error("Konfirmasi password tidak sama");
      }
      return true;
    }),

  body("telegramId")
    .optional({ nullable: true, checkFalsy: true })
    .isNumeric()
    .withMessage("Telegram ID harus berupa angka"),

  handleValidationErrors,
];

// Custom validator untuk file upload
const validateFileTypes = (allowedTypes = ["jpg", "jpeg", "png", "pdf"]) => {
  return (req, res, next) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Minimal satu file sertifikat harus diupload",
      });
    }

    for (const file of req.files) {
      const fileExtension = file.originalname.split(".").pop().toLowerCase();
      if (!allowedTypes.includes(fileExtension)) {
        return res.status(400).json({
          success: false,
          message: `Format file tidak didukung: ${
            file.originalname
          }. Format yang diizinkan: ${allowedTypes.join(", ")}`,
        });
      }
    }

    next();
  };
};

// Sanitizer untuk membersihkan input
const sanitizeInput = (req, res, next) => {
  // Sanitize text fields
  if (req.body.nama) req.body.nama = req.body.nama.trim();
  if (req.body.kelas) req.body.kelas = req.body.kelas.trim().toUpperCase();
  if (req.body.jurusan) req.body.jurusan = req.body.jurusan.trim();
  if (req.body.motivasi) req.body.motivasi = req.body.motivasi.trim();

  // Normalize phone number
  if (req.body.hp) {
    req.body.hp = req.body.hp.replace(/\D/g, ""); // Remove non-digits
    if (req.body.hp.startsWith("0")) {
      req.body.hp = "62" + req.body.hp.substring(1); // Convert to international format
    }
  }

  next();
};

module.exports = {
  validateRegistration,
  validateAdminLogin,
  validateTicketCheck,
  validateAdminAction,
  validateQRVerification,
  validateAdminProfileUpdate,
  validateFileTypes,
  sanitizeInput,
  handleValidationErrors,
};

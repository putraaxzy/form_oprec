const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs-extra");
const { validationResult } = require("express-validator");
const QRCode = require("qrcode");
const { getConnection } = require("../database/mysql-database-refactored");
const { sendTelegramNotification } = require("../utils/telegram-refactored");
const {
  validateRegistration,
  validateTicketCheck,
  validateQRCheck,
  handleValidationErrors,
} = require("../middleware/validators-minimal");

const router = express.Router();

// Define allowed division names to match database ENUM values
const ALLOWED_DIVISIONS = [
  "Keagamaan",
  "Kedisiplinan", 
  "Bakat Minat",
  "Jurnalistik",
  "Media Jaringan",
  "Sekretaris",
];

// Mapping from form values to database values
const DIVISION_MAPPING = {
  'keagamaan': 'Keagamaan',
  'kedisiplinan': 'Kedisiplinan',
  'bakat_minat': 'Bakat Minat',
  'jurnalistik': 'Jurnalistik',
  'media_jaringan': 'Media Jaringan',
  'sekretaris': 'Sekretaris',
  'bendahara': 'Sekretaris', // Map bendahara to Sekretaris since bendahara is not in DB
  // Add proper case versions as well for backwards compatibility
  'Keagamaan': 'Keagamaan',
  'Kedisiplinan': 'Kedisiplinan',
  'Bakat Minat': 'Bakat Minat',
  'Jurnalistik': 'Jurnalistik',
  'Media Jaringan': 'Media Jaringan',
  'Sekretaris': 'Sekretaris',
};

// Enhanced file upload configuration
class FileUploadManager {
  constructor() {
    this.storage = this.createStorage();
    this.upload = this.createUploadHandler();
  }

  createStorage() {
    return multer.diskStorage({
      destination: async (req, file, cb) => {
        let uploadDir;

        // Determine upload directory based on fieldname
        if (file.fieldname === "foto") {
          uploadDir = path.join(__dirname, "..", "uploads", "photos");
        } else if (file.fieldname.includes("sertifikat")) {
          uploadDir = path.join(__dirname, "..", "uploads", "certificates");
        } else {
          uploadDir = path.join(__dirname, "..", "uploads", "others");
        }

        // Ensure directory exists
        try {
          await fs.ensureDir(uploadDir);
          cb(null, uploadDir);
        } catch (error) {
          console.error(`Error creating directory ${uploadDir}:`, error);
          cb(error);
        }
      },

      filename: (req, file, cb) => {
        // Create descriptive filename with type prefix
        let prefix = "file";
        if (file.fieldname === "foto") {
          prefix = "photo";
        } else if (file.fieldname.includes("prestasi_sertifikat")) {
          prefix = "cert-prestasi";
        } else if (file.fieldname.includes("organisasi_sertifikat")) {
          prefix = "cert-organisasi";
        }

        // Generate unique filename with timestamp and random number
        const timestamp = Date.now();
        const randomNum = Math.round(Math.random() * 1e9);
        const extension = path.extname(file.originalname);
        const uniqueName = `${prefix}-${timestamp}-${randomNum}${extension}`;

        console.log(
          `📁 Generated filename: ${uniqueName} for field: ${file.fieldname}`
        );
        cb(null, uniqueName);
      },
    });
  }

  createUploadHandler() {
    return multer({
      storage: this.storage,
      limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE_MB || "50") * 1024 * 1024, // Configurable max file size, default 50MB
        files: parseInt(process.env.MAX_FILES_PER_REQUEST || "20"), // Configurable max files per request, default 20
        fieldSize:
          parseInt(process.env.MAX_FIELD_SIZE_MB || "10") * 1024 * 1024, // Configurable max field size, default 10MB
        fieldNameSize: 100, // 100 bytes max field name
        fields: 100, // max 100 fields
      },
      fileFilter: (req, file, cb) => {
        console.log(
          `📤 File upload attempt - Field: ${file.fieldname}, Name: ${file.originalname}, Type: ${file.mimetype}`
        );

        // Photo validation (stricter for photos)
        if (file.fieldname === "foto") {
          const allowedTypes = /jpeg|jpg|png|webp/;
          const extname = allowedTypes.test(
            path.extname(file.originalname).toLowerCase()
          );
          const mimetype = /image\/(jpeg|jpg|png|webp)/.test(file.mimetype);

          if (mimetype && extname) {
            return cb(null, true);
          } else {
            console.error(
              `❌ Invalid photo file: ${file.originalname} (${file.mimetype})`
            );
            return cb(
              new Error(
                "Hanya file gambar (JPG, JPEG, PNG, WEBP) yang diizinkan untuk foto"
              )
            );
          }
        }

        // Certificate validation (allow PDF and images)
        else if (file.fieldname.includes("sertifikat")) {
          const allowedTypes = /pdf|jpeg|jpg|png|webp/;
          const extname = allowedTypes.test(
            path.extname(file.originalname).toLowerCase()
          );
          const mimetype = /application\/pdf|image\/(jpeg|jpg|png|webp)/.test(
            file.mimetype
          );

          if (mimetype && extname) {
            return cb(null, true);
          } else {
            console.error(
              `❌ Invalid certificate file: ${file.originalname} (${file.mimetype})`
            );
            return cb(
              new Error(
                "Hanya file PDF, JPG, JPEG, PNG, WEBP yang diizinkan untuk sertifikat"
              )
            );
          }
        }

        // Allow other fields to pass through
        console.log(`✅ Allowing field: ${file.fieldname}`);
        cb(null, true);
      },
    });
  }
}

// Enhanced registration processor
class RegistrationProcessor {
  constructor() {
    this.fileManager = new FileUploadManager();
  }

  // Generate unique ticket
  generateTicket() {
    const year = new Date().getFullYear().toString().substr(-2);
    const id = Math.floor(Math.random() * 900000) + 100000; // 6 digit number
    const suffix = String.fromCharCode(65 + Math.floor(Math.random() * 26)); // Random letter
    return `OSIS${year}-${id.toString().padStart(6, "0")}-${suffix}`;
  }

  // Generate QR code for WhatsApp group
  async generateQRCode(data) {
    try {
      const whatsappLink =
        data.whatsapp_link || process.env.DEFAULT_WHATSAPP_GROUP_LINK;
      if (!whatsappLink) {
        throw new Error("WhatsApp link is missing for QR code generation.");
      }

      return await QRCode.toDataURL(whatsappLink, {
        errorCorrectionLevel: "M",
        type: "image/png",
        quality: 0.92,
        margin: 1,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
      });
    } catch (error) {
      console.error("QR Code generation error:", error);
      throw error;
    }
  }

  // Enhanced file processing with better error handling
  processUploadedFiles(files) {
    console.log(`📁 Processing ${files ? files.length : 0} uploaded files...`);

    const uploadedFiles = {
      foto: null,
      organisasi_sertifikat: {},
      prestasi_sertifikat: {},
    };

    if (!files || files.length === 0) {
      console.warn("⚠️ No files uploaded");
      return uploadedFiles;
    }

    for (const file of files) {
      console.log(`📄 Processing file: ${file.fieldname} -> ${file.filename}`);

      if (file.fieldname === "foto") {
        uploadedFiles.foto = file.filename;
        console.log(`✅ Photo processed: ${file.filename}`);
      } else if (file.fieldname.includes("organisasi_sertifikat")) {
        const match = file.fieldname.match(/\[(\d+)\]/);
        const index = match
          ? parseInt(match[1])
          : Object.keys(uploadedFiles.organisasi_sertifikat).length;
        uploadedFiles.organisasi_sertifikat[index] = file.filename;
        console.log(`✅ Organization certificate ${index}: ${file.filename}`);
      } else if (file.fieldname.includes("prestasi_sertifikat")) {
        const match = file.fieldname.match(/\[(\d+)\]/);
        const index = match
          ? parseInt(match[1])
          : Object.keys(uploadedFiles.prestasi_sertifikat).length;
        uploadedFiles.prestasi_sertifikat[index] = file.filename;
        console.log(`✅ Achievement certificate ${index}: ${file.filename}`);
      }
    }

    return uploadedFiles;
  }

  // Ensure array fields are properly formatted
  ensureArray(value) {
    if (Array.isArray(value)) return value;
    if (value === undefined || value === null || value === "") return [];
    return [value];
  }

  // Process form data with validation
  processFormData(body) {
    const processed = { ...body };

    // Process array fields
    processed.organisasi_nama = this.ensureArray(body.organisasi_nama);
    processed.organisasi_jabatan = this.ensureArray(body.organisasi_jabatan);
    processed.organisasi_tahun = this.ensureArray(body.organisasi_tahun);
    processed.prestasi_nama = this.ensureArray(body.prestasi_nama);
    processed.prestasi_tingkat = this.ensureArray(body.prestasi_tingkat);
    processed.prestasi_tahun = this.ensureArray(body.prestasi_tahun);

    // Process divisi with validation and mapping
    const rawDivisi = this.ensureArray(body.divisi);
    
    // Map form values to database values
    processed.divisi = rawDivisi.map(div => {
      const mappedDiv = DIVISION_MAPPING[div];
      if (!mappedDiv) {
        console.warn(`⚠️ Unknown division value from form: ${div}`);
        return div; // Return original if no mapping found
      }
      return mappedDiv;
    });
    
    // Validate mapped division names against allowed values
    const invalidDivisions = processed.divisi.filter(div => !ALLOWED_DIVISIONS.includes(div));
    if (invalidDivisions.length > 0) {
      console.error(`❌ Invalid divisions after mapping: ${invalidDivisions.join(', ')}`);
      console.error(`📝 Original form values: ${rawDivisi.join(', ')}`);
      throw new Error(`Divisi tidak valid: ${invalidDivisions.join(', ')}. Pilihan yang tersedia: ${ALLOWED_DIVISIONS.join(', ')}`);
    }

    return processed;
  }

  // Original duplicate check logic is commented out as per user's request for more lenient logic.
  // If a specific duplicate check is needed, please specify the fields.
  /*
  async checkDuplicateRegistration(nama_lengkap, tanggal_lahir) {
    const connection = await getConnection();
    try {
      const [existingUsers] = await connection.execute(
        "SELECT id, nama_lengkap, tanggal_lahir FROM users WHERE LOWER(nama_lengkap) = LOWER(?) AND tanggal_lahir = ?",
        [nama_lengkap, tanggal_lahir]
      );

      if (existingUsers.length > 0) {
        throw new Error(
          "Nama dan tanggal lahir sudah terdaftar dalam sistem. Harap menghubungi narahubung untuk informasi lebih lanjut."
        );
      }
    } finally {
      connection.release();
    }
  }
  */

  // Save user data to database
  async saveUserData(userData, uploadedFiles, ticket) {
    const connection = await getConnection();

    try {
      await connection.beginTransaction();

      // Helper function to convert undefined to null
      const safeValue = (value) => (value === undefined ? null : value);

      // Insert main user data
      const [userResult] = await connection.execute(
        `INSERT INTO users (
          ticket, nama_lengkap, nama_panggilan, kelas, jurusan, 
          tempat_lahir, tanggal_lahir, alamat, agama, jenis_kelamin,
          nomor_telepon, hobi, motto, foto_path, motivasi
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ticket,
          safeValue(userData.nama_lengkap),
          safeValue(userData.nama_panggilan),
          safeValue(userData.kelas),
          safeValue(userData.jurusan),
          safeValue(userData.tempat_lahir),
          safeValue(userData.tanggal_lahir),
          safeValue(userData.alamat),
          safeValue(userData.agama),
          safeValue(userData.jenis_kelamin),
          safeValue(userData.nomor_telepon),
          safeValue(userData.hobi),
          safeValue(userData.motto),
          safeValue(uploadedFiles.foto),
          safeValue(userData.motivasi),
        ]
      );

      const userId = userResult.insertId;
      console.log(`✅ User created with ID: ${userId}`);

      // Insert organization data
      if (userData.organisasi_nama && userData.organisasi_nama.length > 0) {
        for (let i = 0; i < userData.organisasi_nama.length; i++) {
          if (
            userData.organisasi_nama[i] &&
            userData.organisasi_nama[i].trim()
          ) {
            const sertifikatPath =
              uploadedFiles.organisasi_sertifikat[i] || null;
            console.log(
              `DEBUG: Organisasi Sertifikat Path for index ${i}: ${sertifikatPath}`
            );
            await connection.execute(
              "INSERT INTO organisasi (user_id, nama_organisasi, jabatan, tahun, sertifikat_path) VALUES (?, ?, ?, ?, ?)",
              [
                userId,
                safeValue(userData.organisasi_nama[i]),
                safeValue(userData.organisasi_jabatan[i] || ""),
                safeValue(userData.organisasi_tahun[i] || ""),
                safeValue(sertifikatPath),
              ]
            );
            console.log(
              `✅ Organization ${i + 1} saved with certificate: ${
                sertifikatPath || "none"
              }`
            );
          }
        }
      }

      // Insert achievement data
      if (userData.prestasi_nama && userData.prestasi_nama.length > 0) {
        for (let i = 0; i < userData.prestasi_nama.length; i++) {
          if (userData.prestasi_nama[i] && userData.prestasi_nama[i].trim()) {
            const sertifikatPath = uploadedFiles.prestasi_sertifikat[i] || null;
            console.log(
              `DEBUG: Prestasi Sertifikat Path for index ${i}: ${sertifikatPath}`
            );
            await connection.execute(
              "INSERT INTO prestasi (user_id, nama_prestasi, tingkat, tahun, sertifikat_path) VALUES (?, ?, ?, ?, ?)",
              [
                userId,
                safeValue(userData.prestasi_nama[i]),
                safeValue(userData.prestasi_tingkat[i] || ""),
                safeValue(userData.prestasi_tahun[i] || ""),
                safeValue(sertifikatPath),
              ]
            );
            console.log(
              `✅ Achievement ${i + 1} saved with certificate: ${
                sertifikatPath || "none"
              }`
            );
          }
        }
      }

      // Insert division data with validation
      if (userData.divisi && userData.divisi.length > 0) {
        // Create reverse mapping to find original form field names
        const reverseDivisionMapping = {};
        for (const [formValue, dbValue] of Object.entries(DIVISION_MAPPING)) {
          reverseDivisionMapping[dbValue] = formValue;
        }
        
        for (const div of userData.divisi) {
          // Double-check division validity before database insert
          if (!ALLOWED_DIVISIONS.includes(div)) {
            console.warn(`⚠️ Skipping invalid division: ${div}`);
            continue;
          }
          
          // Use original form field name for reason field
          const originalFieldName = reverseDivisionMapping[div] || div.toLowerCase().replace(/\s+/g, '_');
          const alasanField = `alasan_${originalFieldName}`;
          const alasan = userData[alasanField];
          if (alasan && alasan.trim()) {
            try {
              await connection.execute(
                "INSERT INTO divisi (user_id, nama_divisi, alasan) VALUES (?, ?, ?)",
                [userId, safeValue(div), safeValue(alasan)]
              );
              console.log(`✅ Division ${div} saved with reason`);
            } catch (divError) {
              console.error(`❌ Error saving division ${div}:`, divError);
              // Continue with other divisions instead of failing completely
              if (divError.code === 'WARN_DATA_TRUNCATED') {
                console.warn(`⚠️ Division ${div} truncated, skipping...`);
              } else {
                throw divError; // Re-throw other types of errors
              }
            }
          }
        }
      }

      await connection.commit();
      console.log("✅ All data committed successfully");

      return userId;
    } catch (error) {
      await connection.rollback();
      console.error("❌ Database error, rolling back:", error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // Prepare data for Telegram notification
  prepareTelegramData(userData, uploadedFiles, ticket) {
    // Convert object indices to arrays for compatibility
    const organisasiSertArray = Object.keys(uploadedFiles.organisasi_sertifikat)
      .sort((a, b) => parseInt(a) - parseInt(b))
      .map((key) => uploadedFiles.organisasi_sertifikat[key]);

    const prestasiSertArray = Object.keys(uploadedFiles.prestasi_sertifikat)
      .sort((a, b) => parseInt(a) - parseInt(b))
      .map((key) => uploadedFiles.prestasi_sertifikat[key]);

    const telegramData = {
      // Basic info
      nama_lengkap: userData.nama_lengkap,
      nama_panggilan: userData.nama_panggilan,
      kelas: userData.kelas,
      jurusan: userData.jurusan,
      tempat_lahir: userData.tempat_lahir,
      tanggal_lahir: userData.tanggal_lahir,
      alamat: userData.alamat,
      agama: userData.agama,
      jenis_kelamin: userData.jenis_kelamin,
      nomor_telepon: userData.nomor_telepon,
      email: userData.email,
      hobi: userData.hobi,
      motto: userData.motto,
      motivasi: userData.motivasi,

      // Experience arrays
      organisasi_nama: userData.organisasi_nama,
      organisasi_jabatan: userData.organisasi_jabatan,
      organisasi_tahun: userData.organisasi_tahun,
      prestasi_nama: userData.prestasi_nama,
      prestasi_tingkat: userData.prestasi_tingkat,
      prestasi_tahun: userData.prestasi_tahun,

      // Division info
      divisi: userData.divisi,

      // Files
      foto_path: uploadedFiles.foto,
      organisasi_sertifikat: organisasiSertArray,
      prestasi_sertifikat: prestasiSertArray,

      // Metadata
      ticket: ticket,
      status: "PENDING",
      created_at: new Date(),
    };

    // Add division reasons
    if (userData.divisi) {
      // Create reverse mapping to find original form field names
      const reverseDivisionMapping = {};
      for (const [formValue, dbValue] of Object.entries(DIVISION_MAPPING)) {
        reverseDivisionMapping[dbValue] = formValue;
      }
      
      userData.divisi.forEach((div) => {
        // Use original form field name for reason field
        const originalFieldName = reverseDivisionMapping[div] || div.toLowerCase().replace(/\s+/g, '_');
        const alasanField = `alasan_${originalFieldName}`;
        if (userData[alasanField]) {
          telegramData[alasanField] = userData[alasanField];
        }
      });
    }

    return telegramData;
  }
}

// Initialize processor
const processor = new RegistrationProcessor();

// API Routes
router.get("/", (req, res) => {
  res.json({
    success: true,
    message: "OSIS Recruitment API is working",
    version: "2.0.0",
    timestamp: new Date().toISOString(),
  });
});

// Enhanced registration endpoint
router.post(
  "/register",
  processor.fileManager.upload.any(),

  // Enhanced multer error handling with Busboy stream errors
  (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      console.error("❌ Multer error:", err);
      let message = "Error upload file";

      switch (err.code) {
        case "LIMIT_FILE_SIZE":
          message = `File terlalu besar. Maksimal ${
            process.env.MAX_FILE_SIZE_MB || "50"
          }MB per file.`;
          break;
        case "LIMIT_FILE_COUNT":
          message = `Terlalu banyak file. Maksimal ${
            process.env.MAX_FILES_PER_REQUEST || "20"
          } file.`;
          break;
        case "LIMIT_UNEXPECTED_FILE":
          message = "Format file tidak didukung atau field tidak valid.";
          break;
        case "LIMIT_FIELD_COUNT":
          message = "Terlalu banyak field dalam form.";
          break;
        case "LIMIT_FIELD_KEY":
          message = "Nama field terlalu panjang.";
          break;
        case "LIMIT_FIELD_VALUE":
          message = "Nilai field terlalu panjang.";
          break;
        default:
          message = `Upload error: ${err.code}`;
      }

      return res.status(400).json({
        success: false,
        message: message,
        error: err.code,
      });
    }
    // Handle Busboy stream errors
    else if (
      err &&
      (err.message?.includes("storageErrors") || err.name === "Error")
    ) {
      console.error("❌ Busboy/Stream error:", err);
      return res.status(400).json({
        success: false,
        message:
          "Terjadi kesalahan dalam pemrosesan file. Pastikan file tidak rusak dan format didukung.",
        error: "STREAM_ERROR",
      });
    } else if (err) {
      console.error("❌ File upload error:", err);
      return res.status(400).json({
        success: false,
        message: err.message || "Terjadi kesalahan saat upload file",
        error: "UPLOAD_ERROR",
      });
    }
    next();
  },

  validateRegistration,
  handleValidationErrors,

  async (req, res) => {
    console.log("=== ENHANCED REGISTRATION REQUEST ===");
    console.log("📝 Body keys:", Object.keys(req.body));
    console.log(
      "📁 Files:",
      req.files
        ? req.files.map((f) => `${f.fieldname}: ${f.originalname}`)
        : "No files"
    );

    try {
      // Process form data
      const userData = processor.processFormData(req.body);
      console.log("✅ Form data processed");

      // Duplicate check removed as per user's request for more lenient logic.
      // If a specific duplicate check is needed, please specify the fields.
      console.log("⚠️ Duplicate registration check skipped.");

      // Process uploaded files
      const uploadedFiles = processor.processUploadedFiles(req.files);
      console.log("✅ Files processed:", {
        foto: uploadedFiles.foto ? "Yes" : "No",
        org_certs: Object.keys(uploadedFiles.organisasi_sertifikat).length,
        prestasi_certs: Object.keys(uploadedFiles.prestasi_sertifikat).length,
      });

      // Validate required photo
      if (!uploadedFiles.foto) {
        return res.status(400).json({
          success: false,
          message: "Foto 3x4 wajib diupload",
          error: "MISSING_PHOTO",
        });
      }

      // Validate divisions
      if (!userData.divisi || userData.divisi.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Minimal pilih satu bidang/divisi",
          error: "NO_DIVISION_SELECTED",
        });
      }

      // Generate ticket
      const ticket = processor.generateTicket();
      console.log(`🎫 Generated ticket: ${ticket}`);

      // Save to database
      const userId = await processor.saveUserData(
        userData,
        uploadedFiles,
        ticket
      );
      console.log(`✅ User saved with ID: ${userId}`);

      // Send Telegram notification (non-blocking)
      setImmediate(async () => {
        try {
          console.log("📤 Preparing Telegram notification...");
          const telegramData = processor.prepareTelegramData(
            userData,
            uploadedFiles,
            ticket
          );
          console.log("📱 Calling sendTelegramNotification with data:", {
            nama_lengkap: telegramData.nama_lengkap,
            ticket: telegramData.ticket,
            hasPhoto: !!telegramData.foto_path,
            organisasi: telegramData.organisasi
              ? telegramData.organisasi.length
              : 0,
            prestasi: telegramData.prestasi ? telegramData.prestasi.length : 0,
          });

          const result = await sendTelegramNotification(telegramData);

          if (result.success) {
            console.log("✅ Telegram notification sent successfully");
          } else {
            console.error("❌ Telegram notification failed:", result.error);
          }
        } catch (telegramError) {
          console.error(
            "❌ Telegram notification error:",
            telegramError.message
          );
          console.error("📊 Error details:", telegramError);
          // Don't fail the registration
        }
      });

      // Success response
      res.json({
        success: true,
        message: "Pendaftaran berhasil! Nomor tiket Anda telah dibuat.",
        ticket: ticket,
        user_id: userId,
        files_uploaded: {
          photo: !!uploadedFiles.foto,
          organization_certificates: Object.keys(
            uploadedFiles.organisasi_sertifikat
          ).length,
          achievement_certificates: Object.keys(
            uploadedFiles.prestasi_sertifikat
          ).length,
        },
      });
    } catch (error) {
      console.error("❌ Registration error:", error);

      // Handle specific errors
      if (error.message.includes("sudah terdaftar")) {
        return res.status(400).json({
          success: false,
          message: error.message,
          error: "DUPLICATE_NAME",
        });
      }

      // Handle division validation errors
      if (error.message.includes("Divisi tidak valid")) {
        return res.status(400).json({
          success: false,
          message: error.message,
          error: "INVALID_DIVISION",
        });
      }

      // Handle database truncation errors
      if (error.code === 'WARN_DATA_TRUNCATED' && error.message.includes('nama_divisi')) {
        return res.status(400).json({
          success: false,
          message: `Nama divisi tidak valid. Pilihan yang tersedia: ${ALLOWED_DIVISIONS.join(', ')}`,
          error: "INVALID_DIVISION_ENUM",
        });
      }

      // Generic error
      res.status(500).json({
        success: false,
        message: "Terjadi kesalahan server internal",
        error: "INTERNAL_SERVER_ERROR",
      });
    }
  }
);

// Enhanced ticket check endpoint (compatible with hasil.html)
router.get(
  "/ticket/:ticket",
  validateTicketCheck,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { ticket } = req.params;
      console.log(`🔍 Checking ticket: ${ticket}`);

      const connection = await getConnection();
      try {
        // Get user with related data
        const [users] = await connection.execute(
          `
          SELECT u.*, 
                 GROUP_CONCAT(DISTINCT o.nama_organisasi) as organisasi_list,
                 GROUP_CONCAT(DISTINCT p.nama_prestasi) as prestasi_list,
                 GROUP_CONCAT(DISTINCT d.nama_divisi) as divisi_list
          FROM users u
          LEFT JOIN organisasi o ON u.id = o.user_id
          LEFT JOIN prestasi p ON u.id = p.user_id  
          LEFT JOIN divisi d ON u.id = d.user_id
          WHERE u.ticket = ?
          GROUP BY u.id
        `,
          [ticket]
        );

        if (users.length === 0) {
          return res.status(404).json({
            success: false,
            message: "Nomor tiket tidak ditemukan",
          });
        }

        const user = users[0];

        // Format response compatible dengan hasil.html
        const responseData = {
          success: true,
          ticket: user.ticket,
          raw_status: user.status, // Status asli dari database
          // Map status values for frontend compatibility (lowercase)
          status:
            user.status === "LOLOS"
              ? "approved"
              : user.status === "DITOLAK" || user.status === "PENDING_TOLAK"
              ? "rejected"
              : "pending",
          // Map field names for frontend compatibility
          nama: user.nama_lengkap, // Frontend expects 'nama'
          nama_lengkap: user.nama_lengkap,
          nama_panggilan: user.nama_panggilan,
          kelas: user.kelas,
          jurusan: user.jurusan,
          tempat_lahir: user.tempat_lahir,
          tanggal_lahir: user.tanggal_lahir,
          jenis_kelamin: user.jenis_kelamin,
          agama: user.agama,
          nomor_telepon: user.nomor_telepon,
          email: user.email,
          alamat: user.alamat,
          hobi: user.hobi,
          motto: user.motto,
          motivasi: user.motivasi,
          // Format divisi for frontend compatibility
          divisi: user.divisi_list
            ? user.divisi_list.split(",").map((nama) => ({
                nama_divisi: nama.trim(),
              }))
            : [],
          created_at: user.created_at,
          updated_at: user.updated_at,
        };

        // Add status-specific data
        if (user.status === "LOLOS") {
          // Generate QR code for WhatsApp group if needed
          try {
            const qrCode = await processor.generateQRCode({
              whatsapp_link: process.env.DEFAULT_WHATSAPP_GROUP_LINK,
            });
            responseData.barcode_base64 = qrCode; // Frontend expects 'barcode_base64'
            responseData.whatsapp_link =
              process.env.DEFAULT_WHATSAPP_GROUP_LINK;
          } catch (qrError) {
            console.warn("⚠️ Could not generate QR code:", qrError.message);
          }
        }

        console.log(`✅ Ticket check successful: ${ticket} -> ${user.status}`);
        res.json(responseData);
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error("❌ Ticket check error:", error);
      res.status(500).json({
        success: false,
        message: "Terjadi kesalahan server internal",
      });
    }
  }
);

// Alternative endpoint for compatibility (both /check/:ticket and /ticket/:ticket)
router.get("/check/:ticket", (req, res, next) => {
  // Redirect to /ticket/:ticket for consistency
  req.url = `/api/ticket/${req.params.ticket}`;
  next("route");
});

// QR verification endpoint
router.post("/verify-qr", handleValidationErrors, async (req, res) => {
  try {
    const { ticket } = req.body;
    console.log(`🔍 QR verification for ticket: ${ticket}`);

    const connection = await getConnection();
    try {
      const [users] = await connection.execute(
        "SELECT ticket, status, nama_lengkap FROM users WHERE ticket = ?",
        [ticket]
      );

      if (users.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Tiket tidak valid",
          error: "INVALID_TICKET",
        });
      }

      const user = users[0];

      if (user.status !== "LOLOS") {
        return res.status(403).json({
          success: false,
          message: "Akses ditolak. Status belum disetujui.",
          error: "ACCESS_DENIED",
          status: user.status,
        });
      }

      // Successful verification
      res.json({
        success: true,
        message: `Selamat datang ${user.nama_lengkap}! Akses berhasil diverifikasi.`,
        data: {
          ticket: user.ticket,
          nama_lengkap: user.nama_lengkap,
          status: user.status,
          verified_at: new Date().toISOString(),
        },
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("❌ QR verification error:", error);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan server internal",
      error: "INTERNAL_SERVER_ERROR",
    });
  }
});

// Health check endpoint
router.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "API is healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: "2.0.0",
  });
});

const { backupManager } = require("../utils/db-backup-fixed"); // Import backupManager

// Endpoint to download database backups
// This endpoint now expects a path like /api/v1/backup/[daily_folder]/[user_backup.zip]
router.get("/v1/backup/:backupPath", async (req, res) => {
  const backupPath = req.params.backupPath; // Get the full path after /v1/backup/
  const backupDir = path.join(__dirname, "..", "backups");
  const filePath = path.join(backupDir, backupPath);

  // Security check: Ensure the requested path does not escape the backup directory
  if (!filePath.startsWith(backupDir)) {
    console.warn(`❌ Attempted directory traversal: ${backupPath}`);
    return res.status(403).json({
      success: false,
      message: "Akses ditolak: Jalur file tidak valid.",
    });
  }

  try {
    // Check if file exists
    const fileExists = await fs.pathExists(filePath);
    if (!fileExists) {
      console.warn(`❌ Backup file not found: ${backupPath}`);
      return res.status(404).json({
        success: false,
        message: "File backup tidak ditemukan.",
      });
    }

    // Determine the filename for download (the last part of the path)
    const filename = path.basename(filePath);

    // Serve the file for download
    res.download(filePath, filename, (err) => {
      if (err) {
        console.error(`❌ Error downloading file ${backupPath}:`, err);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: "Terjadi kesalahan saat mengunduh file.",
            error: err.message,
          });
        }
      } else {
        console.log(`✅ Backup file downloaded: ${backupPath}`);
      }
    });
  } catch (error) {
    console.error(
      `❌ Server error during backup download for ${backupPath}:`,
      error
    );
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan server internal.",
      error: error.message,
    });
  }
});

// Temporary endpoint to trigger individual user backups
router.post("/v1/trigger-user-backup", async (req, res) => {
  try {
    console.log("🔄 Triggering individual user backup...");
    const result = await backupManager.createIndividualUserBackups();
    res.json({
      success: true,
      message: "Individual user backup triggered successfully.",
      details: result,
    });
  } catch (error) {
    console.error("❌ Error triggering individual user backup:", error);
    res.status(500).json({
      success: false,
      message: "Failed to trigger individual user backup.",
      error: error.message,
    });
  }
});

// Temporary endpoint to list available backups
router.get("/v1/list-backups", async (req, res) => {
  try {
    console.log("🔍 Listing available backups...");
    const backups = await backupManager.listBackups();
    res.json({
      success: true,
      message: "Available backups listed.",
      data: backups,
    });
  } catch (error) {
    console.error("❌ Error listing backups:", error);
    res.status(500).json({
      success: false,
      message: "Failed to list backups.",
      error: error.message,
    });
  }
});

module.exports = router;

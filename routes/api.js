const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { body, validationResult } = require("express-validator");
const QRCode = require("qrcode");
const { getConnection } = require("../database/mysql-database");
const { sendTelegramNotification } = require("../utils/telegram");

const router = express.Router();

// Helper function to generate ticket
function generateTicket() {
  const year = new Date().getFullYear().toString().substr(-2);
  const id = Math.floor(Math.random() * 900000) + 100000; // 6 digit number
  const suffix = String.fromCharCode(65 + Math.floor(Math.random() * 26)); // Random letter
  return `OSIS${year}-${id.toString().padStart(6, "0")}-${suffix}`;
}

// Helper function to generate QR code
async function generateQRCode(data) {
  try {
    // QR code hanya berisi link WhatsApp saja
    const qrString = data.whatsapp_link;

    return await QRCode.toDataURL(qrString, {
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

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadDir;

    // Determine upload directory based on fieldname
    if (file.fieldname === "foto") {
      uploadDir = path.join(__dirname, "..", "uploads", "photos");
    } else if (file.fieldname.includes("sertifikat")) {
      uploadDir = path.join(__dirname, "..", "uploads", "certificates");
    } else {
      uploadDir = path.join(__dirname, "..", "uploads", "others");
    }

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Create more descriptive filename with type prefix
    let prefix = "file";
    if (file.fieldname === "foto") {
      prefix = "photo";
    } else if (file.fieldname.includes("prestasi_sertifikat")) {
      prefix = "cert-prestasi";
    } else if (file.fieldname.includes("organisasi_sertifikat")) {
      prefix = "cert-organisasi";
    }

    const uniqueName = `${prefix}-${Date.now()}-${Math.round(
      Math.random() * 1e9
    )}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // Increased to 50MB to allow larger files
    files: 50, // Increased maximum files to 50 per request
  },
  fileFilter: (req, file, cb) => {
    console.log(
      "File upload attempt:",
      file.fieldname,
      file.originalname,
      file.mimetype
    );

    if (file.fieldname === "foto") {
      // Photo validation - stricter for photos
      const allowedTypes = /jpeg|jpg|png/;
      const extname = allowedTypes.test(
        path.extname(file.originalname).toLowerCase()
      );
      const mimetype = allowedTypes.test(file.mimetype);

      if (mimetype && extname) {
        return cb(null, true);
      } else {
        return cb(
          new Error(
            "Hanya file gambar (JPG, JPEG, PNG) yang diizinkan untuk foto"
          )
        );
      }
    } else if (file.fieldname.includes("sertifikat")) {
      // Certificate validation - allow PDF and images
      const allowedTypes = /pdf|jpeg|jpg|png/;
      const extname = allowedTypes.test(
        path.extname(file.originalname).toLowerCase()
      );
      const mimetype = /application\/pdf|image\/(jpeg|jpg|png)/.test(
        file.mimetype
      );

      if (mimetype && extname) {
        return cb(null, true);
      } else {
        return cb(
          new Error(
            "Hanya file PDF, JPG, JPEG, PNG yang diizinkan untuk sertifikat"
          )
        );
      }
    }

    // Allow unknown field names to pass through (might be form fields)
    console.log("Unknown field name, allowing:", file.fieldname);
    cb(null, true);
  },
});

// Validation middleware
const validateRegistration = [
  body("nama_lengkap")
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Nama lengkap harus 2-100 karakter"),
  body("nama_panggilan")
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage("Nama panggilan harus 1-50 karakter"),
  body("kelas").notEmpty().withMessage("Kelas harus diisi"),
  body("jurusan").notEmpty().withMessage("Jurusan harus diisi"),
  body("tempat_lahir")
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Tempat lahir harus 2-50 karakter"),
  body("tanggal_lahir")
    .isISO8601()
    .withMessage("Format tanggal lahir tidak valid"),
  body("alamat")
    .trim()
    .isLength({ min: 5, max: 500 })
    .withMessage("Alamat harus 5-500 karakter"),
  body("agama")
    .isIn(["Islam", "Kristen", "Katolik", "Hindu", "Buddha", "Konghucu"])
    .withMessage("Agama tidak valid"),
  body("jenis_kelamin")
    .isIn(["Laki-laki", "Perempuan"])
    .withMessage("Jenis kelamin tidak valid"),
  body("nomor_telepon")
    .matches(/^(\+62|62|0)?[8-9][0-9]{6,12}$/)
    .withMessage("Nomor telepon tidak valid (contoh: 08123456789)"),
  body("email")
    .optional({ nullable: true, checkFalsy: true })
    .isEmail()
    .withMessage("Format email tidak valid"),
  body("motivasi")
    .trim()
    .isLength({ min: 10, max: 2000 })
    .withMessage("Motivasi harus 10-2000 karakter"),
];

// Test endpoint
router.get("/", (req, res) => {
  res.json({
    success: true,
    message: "OSIS Recruitment API is working",
    version: "1.0.0",
  });
});

// POST /api/register - Submit registration
router.post(
  "/register",
  upload.any(), // Multer middleware for file uploads
  (err, req, res, next) => {
    // Multer error handler
    if (err instanceof multer.MulterError) {
      console.error("Multer error:", err.message);
      return res.status(400).json({ success: false, message: err.message });
    } else if (err) {
      // Other errors from fileFilter, etc.
      console.error("File upload error:", err.message);
      return res.status(400).json({ success: false, message: err.message });
    }
    next();
  },
  validateRegistration, // Validation middleware
  async (req, res) => {
    try {
      console.log("=== REGISTRATION REQUEST ===");
      console.log("Body keys:", Object.keys(req.body));
      console.log(
        "Files:",
        req.files ? req.files.map((f) => f.fieldname) : "No files"
      );

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        console.log("Validation errors:", errors.array());
        return res.status(400).json({
          success: false,
          message: "Data tidak valid",
          errors: errors.array(),
        });
      }

      // Check for duplicate name
      let duplicateCheckConnection = await getConnection();

      try {
        const [existingUsers] = await duplicateCheckConnection.execute(
          "SELECT id, nama_lengkap FROM users WHERE LOWER(nama_lengkap) = LOWER(?)",
          [req.body.nama_lengkap]
        );

        if (existingUsers.length > 0) {
          return res.status(400).json({
            success: false,
            message: "Nama sudah terdaftar",
            error:
              "Nama yang Anda masukkan sudah terdaftar dalam sistem. Harap menghubungi narahubung untuk informasi lebih lanjut.",
            duplicate_name: req.body.nama_lengkap,
          });
        }
      } finally {
        duplicateCheckConnection.release();
      }

      const {
        nama_lengkap,
        nama_panggilan,
        kelas,
        jurusan,
        tempat_lahir,
        tanggal_lahir,
        alamat,
        agama,
        jenis_kelamin,
        nomor_telepon,
        email,
        hobi,
        motto,
        motivasi,
        divisi,
        organisasi_nama,
        organisasi_jabatan,
        organisasi_tahun,
        prestasi_nama,
        prestasi_tingkat,
        prestasi_tahun,
      } = req.body;

      // Ensure array fields are always arrays, even if only one item is sent (which comes as a string)
      const ensureArray = (value) =>
        Array.isArray(value) ? value : value ? [value] : [];

      const processedOrganisasiNama = ensureArray(organisasi_nama);
      const processedOrganisasiJabatan = ensureArray(organisasi_jabatan);
      const processedOrganisasiTahun = ensureArray(organisasi_tahun);
      const processedPrestasiNama = ensureArray(prestasi_nama);
      const processedPrestasiTingkat = ensureArray(prestasi_tingkat);
      const processedPrestasiTahun = ensureArray(prestasi_tahun);

      // Process uploaded files
      const uploadedFiles = {
        foto: null,
        organisasi_sertifikat: [],
        prestasi_sertifikat: [],
      };

      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          if (file.fieldname === "foto") {
            uploadedFiles.foto = file.filename;
          } else if (file.fieldname.includes("organisasi_sertifikat")) {
            const index = file.fieldname.match(/\[(\d+)\]/);
            const idx = index
              ? parseInt(index[1])
              : uploadedFiles.organisasi_sertifikat.length;
            uploadedFiles.organisasi_sertifikat[idx] = file.filename;
          } else if (file.fieldname.includes("prestasi_sertifikat")) {
            const index = file.fieldname.match(/\[(\d+)\]/);
            const idx = index
              ? parseInt(index[1])
              : uploadedFiles.prestasi_sertifikat.length;
            uploadedFiles.prestasi_sertifikat[idx] = file.filename;
          }
        }
      }

      // Check if photo was uploaded
      if (!uploadedFiles.foto) {
        return res.status(400).json({
          success: false,
          message: "Foto 3x4 wajib diupload",
        });
      }

      // Validate divisi
      if (!divisi || (Array.isArray(divisi) && divisi.length === 0)) {
        return res.status(400).json({
          success: false,
          message: "Pilih minimal 1 divisi yang diminati",
        });
      }

      const divisiArray = Array.isArray(divisi) ? divisi : [divisi];
      if (divisiArray.length > 2) {
        return res.status(400).json({
          success: false,
          message: "Maksimal 2 divisi yang dapat dipilih",
        });
      }

      const validDivisi = [
        "sekretaris",
        "bendahara",
        "keagamaan",
        "media_jaringan",
        "bakat_minat",
        "jurnalistik",
        "kedisiplinan",
      ];
      const invalidDivisi = divisiArray.filter((d) => !validDivisi.includes(d));
      if (invalidDivisi.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Divisi yang dipilih tidak valid",
        });
      }

      // Generate ticket
      const ticket = generateTicket();

      // Check for duplicate phone number
      const connection = await getConnection();

      try {
        const [existingUsers] = await connection.execute(
          "SELECT id FROM users WHERE nomor_telepon = ?",
          [nomor_telepon]
        );

        if (existingUsers.length > 0) {
          return res.status(400).json({
            success: false,
            message: "Nomor telepon sudah terdaftar",
          });
        }

        // Insert user data
        const [userResult] = await connection.execute(
          `INSERT INTO users (
            nama_lengkap, nama_panggilan, kelas, jurusan, tempat_lahir, tanggal_lahir,
            alamat, agama, jenis_kelamin,
            nomor_telepon, email, hobi, motto, foto_path, motivasi, ticket
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            nama_lengkap,
            nama_panggilan,
            kelas,
            jurusan,
            tempat_lahir,
            tanggal_lahir,
            alamat,
            agama,
            jenis_kelamin,
            nomor_telepon,
            email || null,
            hobi || null,
            motto || null,
            uploadedFiles.foto,
            motivasi,
            ticket,
          ]
        );

        const userId = userResult.insertId;

        // Insert organisasi data
        if (organisasi_nama && Array.isArray(organisasi_nama)) {
          for (let i = 0; i < organisasi_nama.length; i++) {
            if (organisasi_nama[i] && organisasi_nama[i].trim()) {
              const sertifikatPath =
                uploadedFiles.organisasi_sertifikat[i] || null;
              await connection.execute(
                "INSERT INTO organisasi (user_id, nama_organisasi, jabatan, tahun, sertifikat_path) VALUES (?, ?, ?, ?, ?)",
                [
                  userId,
                  organisasi_nama[i],
                  organisasi_jabatan[i] || "",
                  organisasi_tahun[i] || "",
                  sertifikatPath,
                ]
              );
            }
          }
        }

        // Insert prestasi data
        if (prestasi_nama && Array.isArray(prestasi_nama)) {
          for (let i = 0; i < prestasi_nama.length; i++) {
            if (prestasi_nama[i] && prestasi_nama[i].trim()) {
              const sertifikatPath =
                uploadedFiles.prestasi_sertifikat[i] || null;
              await connection.execute(
                "INSERT INTO prestasi (user_id, nama_prestasi, tingkat, tahun, sertifikat_path) VALUES (?, ?, ?, ?, ?)",
                [
                  userId,
                  prestasi_nama[i],
                  prestasi_tingkat[i] || "",
                  prestasi_tahun[i] || "",
                  sertifikatPath,
                ]
              );
            }
          }
        }

        // Insert divisi data
        for (const div of divisiArray) {
          const alasanField = `alasan_${div}`;
          const alasan = req.body[alasanField];
          if (alasan && alasan.trim()) {
            await connection.execute(
              "INSERT INTO divisi (user_id, nama_divisi, alasan) VALUES (?, ?, ?)",
              [userId, div, alasan]
            );
          }
        }
      } finally {
        connection.release();
      }

      // Send Telegram notification
      try {
        const telegramData = {
          // Basic info
          nama_lengkap,
          nama_panggilan,
          kelas,
          jurusan,
          tempat_lahir,
          tanggal_lahir,
          alamat,
          agama,
          jenis_kelamin,
          nomor_telepon,
          email,
          hobi,
          motto,
          // Experience
          organisasi_nama: processedOrganisasiNama,
          organisasi_jabatan: processedOrganisasiJabatan,
          organisasi_tahun: processedOrganisasiTahun,
          prestasi_nama: processedPrestasiNama,
          prestasi_tingkat: processedPrestasiTingkat,
          prestasi_tahun: processedPrestasiTahun,
          // Division & motivation
          divisi,
          motivasi,
          // Files
          foto_path: uploadedFiles.foto,
          organisasi_sertifikat: uploadedFiles.organisasi_sertifikat,
          prestasi_sertifikat: uploadedFiles.prestasi_sertifikat,
          // Ticket
          ticket,
        };

        // Add division reasons dynamically
        divisiArray.forEach((div) => {
          const alasanField = `alasan_${div}`;
          telegramData[alasanField] = req.body[alasanField];
        });

        await sendTelegramNotification(telegramData);
        console.log("Telegram notification sent successfully");
      } catch (telegramError) {
        console.error("Failed to send Telegram notification:", telegramError);
        // Don't fail registration if Telegram fails
      }

      res.json({
        success: true,
        message: "Pendaftaran berhasil! Nomor tiket Anda telah dibuat.",
        ticket: ticket,
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({
        success: false,
        message: "Terjadi kesalahan server internal",
      });
    }
  }
);

// GET /api/ticket/:ticket - Check ticket status
router.get("/ticket/:ticket", async (req, res) => {
  try {
    const { ticket } = req.params;

    if (!ticket || ticket.length < 5) {
      return res.status(400).json({
        success: false,
        message: "Format tiket tidak valid",
      });
    }

    const connection = await getConnection();

    try {
      // Get user data
      const [users] = await connection.execute(
        "SELECT * FROM users WHERE ticket = ?",
        [ticket]
      );

      if (users.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Tiket tidak ditemukan",
        });
      }

      const user = users[0];

      // Get related data
      const [organisasi] = await connection.execute(
        "SELECT nama_organisasi, jabatan, tahun FROM organisasi WHERE user_id = ?",
        [user.id]
      );

      const [prestasi] = await connection.execute(
        "SELECT nama_prestasi, tingkat, tahun FROM prestasi WHERE user_id = ?",
        [user.id]
      );

      const [divisi] = await connection.execute(
        "SELECT nama_divisi, alasan FROM divisi WHERE user_id = ?",
        [user.id]
      );

      // Map status dari database ke status yang diharapkan frontend
      let mappedStatus = "pending"; // Default
      if (user.status === "LOLOS" || user.status === "approved") {
        mappedStatus = "approved";
      } else if (user.status === "DITOLAK" || user.status === "rejected") {
        mappedStatus = "rejected";
      }

      const response = {
        success: true,
        ticket: user.ticket,
        status: mappedStatus,
        nama: user.nama_lengkap,
        email: user.email,
        kelas: user.kelas,
        jurusan: user.jurusan,
        nomor_telepon: user.nomor_telepon,
        created_at: user.created_at,
        // Data diri minimal
        tempat_lahir: user.tempat_lahir,
        tanggal_lahir: user.tanggal_lahir,
        jenis_kelamin: user.jenis_kelamin,
        alamat: user.alamat,
        divisi: divisi,
      };

      // If LOLOS/approved, generate QR code with WhatsApp group link
      if (mappedStatus === "approved") {
        const qrData = {
          ticket: user.ticket,
          nama: user.nama_lengkap,
          whatsapp_link:
            "https://chat.whatsapp.com/LkdeOZ5GYaVBh7keVEpZOE?mode=ac_t",
          ts: Date.now(),
        };

        const qrBase64 = await generateQRCode(qrData);
        response.barcode_base64 = qrBase64;
        response.whatsapp_link = qrData.whatsapp_link;
      }

      return res.json(response);
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("Ticket check error:", error);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan server internal",
    });
  }
});

// POST /api/verify - Verify QR code
router.post("/verify", async (req, res) => {
  try {
    const { qr_data } = req.body;

    if (!qr_data) {
      return res.status(400).json({
        success: false,
        message: "Data QR tidak valid",
      });
    }

    // Parse QR data
    let parsedData;
    try {
      parsedData = typeof qr_data === "string" ? JSON.parse(qr_data) : qr_data;
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: "Format QR tidak valid",
      });
    }

    const { ticket, ts, whatsapp_link } = parsedData;

    if (!ticket || !ts) {
      return res.status(400).json({
        success: false,
        message: "Data QR tidak lengkap",
      });
    }

    // Check user status
    const connection = await getConnection();

    try {
      const [users] = await connection.execute(
        "SELECT nama_lengkap, status FROM users WHERE ticket = ?",
        [ticket]
      );

      if (users.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Tiket tidak ditemukan",
        });
      }

      const user = users[0];

      if (user.status !== "LOLOS" && user.status !== "approved") {
        return res.status(400).json({
          success: false,
          message: "QR code tidak valid - status belum disetujui",
        });
      }

      res.json({
        success: true,
        message: "QR code valid",
        nama: user.nama_lengkap,
        whatsapp_link:
          whatsapp_link ||
          "https://chat.whatsapp.com/LkdeOZ5GYaVBh7keVEpZOE?mode=ac_t",
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("Verify error:", error);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan server internal",
    });
  }
});

module.exports = router;

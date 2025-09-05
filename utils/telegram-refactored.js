// Telegram bot utilities - Refactored & Enhanced version
const TelegramBot = require("node-telegram-bot-api");
const path = require("path");
const fs = require("fs-extra");
const { v4: uuidv4 } = require("uuid"); // Added for unique filenames
const { getConnection } = require("../database/mysql-database-refactored");

// Bot configuration
class TelegramBotManager {
  constructor() {
    this.bot = null;
    this.isInitialized = false;
    this.retryCount = 0;
    this.maxRetries = 3;
  }

  // Initialize bot with error handling and retry logic
  async initialize() {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      console.log(
        "⚠️ Telegram bot token not found, skipping bot initialization"
      );
      return;
    }

    try {
      this.bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
        polling: {
          interval: 500, // Reduced from 1000ms to 500ms for faster response
          autoStart: true,
          params: {
            timeout: 5, // Reduced from 10 to 5 for faster timeout
            limit: 100, // Process up to 100 messages per request
          },
        },
        // Optimizations for high load
        request: {
          family: 4, // Force IPv4
          timeout: 30000, // 30 second timeout
          agent: false, // No keep-alive agent
        },
      });

      // Enhanced error handling
      this.bot.on("polling_error", (error) => {
        console.error("❌ Telegram polling error:", error.message);
        this.handlePollingError(error);
      });

      this.bot.on("error", (error) => {
        console.error("❌ Telegram bot error:", error.message);
      });

      // Setup command handlers
      this.setupCommands();

      this.isInitialized = true;
      console.log("🤖 Telegram bot initialized successfully");
    } catch (error) {
      console.error("❌ Error initializing Telegram bot:", error.message);
      await this.retryInitialization();
    }
  }

  async retryInitialization() {
    if (this.retryCount < this.maxRetries) {
      this.retryCount++;
      console.log(
        `🔄 Retrying bot initialization... (${this.retryCount}/${this.maxRetries})`
      );
      setTimeout(() => this.initialize(), 5000);
    } else {
      console.error(
        "❌ Max retry attempts reached. Bot initialization failed."
      );
    }
  }

  handlePollingError(error) {
    // Don't restart on certain errors
    const nonCriticalErrors = ["ETELEGRAM", "ECONNRESET", "ECONNREFUSED"];
    const isNonCritical = nonCriticalErrors.some((err) =>
      error.message.includes(err)
    );

    if (!isNonCritical && this.retryCount < this.maxRetries) {
      console.log("🔄 Attempting to restart polling...");
      setTimeout(() => {
        try {
          this.bot.startPolling();
        } catch (restartError) {
          console.error("❌ Failed to restart polling:", restartError.message);
        }
      }, 5000);
    }
  }

  // Enhanced notification system with better file handling
  async sendRegistrationNotification(data) {
    if (!this.isInitialized || !this.bot || !process.env.TELEGRAM_CHAT_ID) {
      console.log("⚠️ Telegram bot or chat ID not configured");
      return { success: false, error: "Bot not configured" };
    }

    let mediaFiles = []; // Initialize mediaFiles here
    try {
      console.log("📤 Preparing enhanced Telegram notification...");

      // Create message with improved formatting, passing mediaFiles
      const message = await this.createFormattedMessage(data, mediaFiles); // Pass mediaFiles

      // Collect and validate other media files
      const collectedMediaFiles = await this.collectAndValidateFiles(data);
      mediaFiles = mediaFiles.concat(collectedMediaFiles); // Combine

      // Send notification with retry logic
      await this.sendWithRetry(message, mediaFiles, data);

      console.log("✅ Telegram notification sent successfully");
      return { success: true };
    } catch (error) {
      console.error("❌ Error sending telegram notification:", error.message);
      return { success: false, error: error.message };
    } finally {
      // Ensure temporary files are cleaned up
      await this.cleanupTemporaryFiles(mediaFiles);
    }
  }

  // Improved file collection with proper path resolution
  async collectAndValidateFiles(data) {
    const mediaFiles = [];
    const baseUploadPath = path.join(__dirname, "..", "uploads");

    try {
      // Main photo handling with multiple fallback paths
      if (data.foto_path) {
        const photoPaths = [
          path.join(baseUploadPath, "photos", data.foto_path),
          path.join(baseUploadPath, data.foto_path), // fallback
          path.join(__dirname, "..", data.foto_path), // another fallback
        ];

        for (const photoPath of photoPaths) {
          if (await fs.pathExists(photoPath)) {
            const stats = await fs.stat(photoPath);
            mediaFiles.push({
              type: "photo",
              path: photoPath,
              caption: `📷 <b>Foto 3x4</b> - ${data.nama_lengkap}`,
              size: stats.size,
              isMain: true,
            });
            console.log(
              `✅ Found photo: ${photoPath} (${this.formatFileSize(
                stats.size
              )})`
            );
            break;
          }
        }

        if (mediaFiles.length === 0) {
          console.warn(
            `⚠️ Photo not found for ticket ${data.ticket}: ${data.foto_path}`
          );
        }
      } else {
        console.log(`ℹ️ No foto_path provided for ticket ${data.ticket}`);
      }

      // Organization certificates with improved handling
      await this.collectCertificates(
        data,
        "organisasi",
        baseUploadPath,
        mediaFiles,
        (org, index) =>
          `📜 <b>Sertifikat Organisasi ${index + 1}</b> - ${
            org.nama || org.nama_organisasi || "Organisasi"
          }`
      );

      // Achievement certificates with improved handling
      await this.collectCertificates(
        data,
        "prestasi",
        baseUploadPath,
        mediaFiles,
        (prestasi, index) =>
          `🏆 <b>Sertifikat Prestasi ${index + 1}</b> - ${
            prestasi.nama || prestasi.nama_prestasi || "Prestasi"
          }`
      );

      console.log(`📁 Collected ${mediaFiles.length} valid media files`);
      return mediaFiles;
    } catch (error) {
      console.error("❌ Error collecting media files:", error.message);
      return [];
    }
  }

  // Generic certificate collection method
  async collectCertificates(
    data,
    type,
    baseUploadPath,
    mediaFiles,
    getCaptionFn
  ) {
    const typeKey = type === "organisasi" ? "organisasi" : "prestasi";
    const sertifikatKey = `${type}_sertifikat`;
    const namaKey = `${type}_nama`;

    // Handle array of objects from database
    if (data[typeKey] && Array.isArray(data[typeKey])) {
      for (let i = 0; i < data[typeKey].length; i++) {
        const item = data[typeKey][i];
        const filename = item.sertifikat_path || item.sertifikat;
        if (filename) {
          await this.addCertificateFile(
            filename,
            baseUploadPath,
            mediaFiles,
            getCaptionFn(item, i)
          );
        }
      }
    }

    // Handle array of filenames (from registration form)
    else if (data[sertifikatKey] && Array.isArray(data[sertifikatKey])) {
      for (let i = 0; i < data[sertifikatKey].length; i++) {
        const filename = data[sertifikatKey][i];
        if (filename) {
          const item = {
            nama: data[namaKey] && data[namaKey][i] ? data[namaKey][i] : null,
          };
          await this.addCertificateFile(
            filename,
            baseUploadPath,
            mediaFiles,
            getCaptionFn(item, i)
          );
        }
      }
    }
  }

  // Add certificate file with validation
  async addCertificateFile(filename, baseUploadPath, mediaFiles, caption) {
    const certPaths = [
      path.join(baseUploadPath, "certificates", filename),
      path.join(baseUploadPath, filename), // fallback
      path.join(__dirname, "..", filename), // another fallback
    ];

    for (const certPath of certPaths) {
      if (await fs.pathExists(certPath)) {
        const stats = await fs.stat(certPath);
        mediaFiles.push({
          type: "document",
          path: certPath,
          caption: caption,
          size: stats.size,
        });
        console.log(
          `✅ Found certificate: ${certPath} (${this.formatFileSize(
            stats.size
          )})`
        );
        return;
      }
    }

    console.warn(
      `⚠️ Certificate not found for ticket ${data.ticket}: ${filename}`
    );
  }

  // Enhanced message formatting
  async createFormattedMessage(data, mediaFiles) {
    // Made async and accepts mediaFiles
    const year = new Date().getFullYear();
    const statusIcon = this.getStatusIcon(data.status || "PENDING");

    let message = `🎉 <b>PENDAFTAR BARU OSIS ${year}/${year + 1}</b>\n\n`;

    // Personal Information
    message += `👤 <b>IDENTITAS LENGKAP</b>\n`;
    message += `┣ 📝 Nama: <b>${data.nama_lengkap || "N/A"}</b>\n`;
    message += `┣ 🏷 Panggilan: ${data.nama_panggilan || "N/A"}\n`;
    message += `┣ 🏫 Kelas: ${data.kelas || "N/A"} - ${
      data.jurusan || "N/A"
    }\n`;

    // Format birth date properly
    const birthDate = data.tanggal_lahir
      ? new Date(data.tanggal_lahir).toLocaleDateString("id-ID", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "N/A";
    message += `┣ 📍 TTL: ${data.tempat_lahir || "N/A"}, ${birthDate}\n`;
    message += `┣ ⚧ Gender: ${data.jenis_kelamin || "N/A"} | 🕌 ${
      data.agama || "N/A"
    }\n`;
    message += `┣ 📱 HP: ${
      data.nomor_telepon ? `<code>${data.nomor_telepon}</code>` : "N/A"
    }\n`;
    message += `┣ 🏠 Alamat: ${data.alamat || "N/A"}\n`;
    message += `┣ 🎨 Hobi: ${data.hobi || "N/A"}\n`;
    message += `┗ 💭 Motto: ${data.motto || "N/A"}\n\n`;

    // Organization experience
    message += this.formatExperience(
      data,
      "organisasi",
      "🏛 <b>PENGALAMAN ORGANISASI</b>"
    );

    // Achievements
    message += this.formatExperience(data, "prestasi", "🏆 <b>PRESTASI</b>");

    // Divisions and reasons
    if (data.divisi && Array.isArray(data.divisi) && data.divisi.length > 0) {
      message += `🎯 <b>BIDANG PILIHAN & ALASAN</b>\n`;
      
      // Create reverse mapping to find original form field names
      const reverseDivisionMapping = {
        'Keagamaan': 'keagamaan',
        'Kedisiplinan': 'kedisiplinan', 
        'Kebersihan': 'kebersihan',
        'Kewirausahaan': 'kewirausahaan',
        'Olahraga': 'olahraga',
        'Kesenian': 'kesenian',
        'Sosial': 'sosial',
        'Lingkungan Hidup': 'lingkungan_hidup',
        'Kesehatan': 'kesehatan',
        'Bakat Minat': 'bakat_minat',
        'Media Jaringan': 'media_jaringan',
        'Sekretaris': 'sekretaris'
      };
      
      for (const [index, div] of data.divisi.entries()) {
        // Use original form field name for reason field
        const originalFieldName = reverseDivisionMapping[div] || div.toLowerCase().replace(/\s+/g, '_');
        const alasanField = `alasan_${originalFieldName}`;
        const alasanText = data[alasanField] || "N/A";
        const formattedAlasan = await this._handleLongTextAsFile(
          alasanText,
          `Alasan-${div}-${data.ticket}`,
          mediaFiles
        );
        message += `${index + 1}. <b>${div.toUpperCase()}</b>\n`;
        message += `   💬 ${formattedAlasan}\n\n`;
      }
    }

    // Motivation
    message += `💭 <b>MOTIVASI BERGABUNG</b>\n`;
    const motivasiText = data.motivasi || "N/A";
    const formattedMotivasi = await this._handleLongTextAsFile(
      motivasiText,
      `Motivasi-${data.ticket}`,
      mediaFiles
    );
    message += `${formattedMotivasi}\n\n`;

    // Status and metadata
    message += `📊 <b>STATUS:</b> ${statusIcon} ${this.formatStatus(
      data.status || "PENDING"
    )}\n`;
    message += `🎫 Tiket: <code>${data.ticket}</code>\n`;
    message += `📅 Terdaftar: ${this.formatDate(
      data.created_at || new Date()
    )}\n\n`;

    // Quick actions
    message += `⚡ <b>AKSI CEPAT</b>\n`;
    message += `┣ ✅ <code>/terima ${data.ticket}</code>\n`;
    message += `┣ ❌ <code>/tolak ${data.ticket}</code>\n`;
    message += `┗ 📊 <code>/status ${data.ticket}</code>`;

    return message;
  }

  // Format experience (organization/achievement) with optional certificates
  formatExperience(data, type, title) {
    let result = "";
    const items = data[type];
    const namaKey = `${type}_nama`;
    const sertifikatKey = `${type}_sertifikat`;

    // Handle array of objects from database
    if (items && Array.isArray(items) && items.length > 0) {
      result += `${title}\n`;
      items.forEach((item, index) => {
        if (item.nama || item[`nama_${type}`]) {
          result += `┣ ${index + 1}. ${item.nama || item[`nama_${type}`]}\n`;
          if (type === "organisasi") {
            result += `┃   📋 ${item.jabatan || "Tidak disebutkan"} (${
              item.tahun || "Tidak disebutkan"
            })\n`;
          } else {
            result += `┃   🎖 ${item.tingkat || "Tidak disebutkan"} (${
              item.tahun || "Tidak disebutkan"
            })\n`;
          }
          // Certificate is optional
          if (item.sertifikat_path) {
            result += `┃   📜 Sertifikat: ✅ Ada\n`;
          } else {
            result += `┃   📜 Sertifikat: ➖ Tidak dilampirkan\n`;
          }
        }
      });
      result += "\n";
    }

    // Handle separate arrays (legacy format) - also optional certificates
    else if (
      data[namaKey] &&
      Array.isArray(data[namaKey]) &&
      data[namaKey].length > 0
    ) {
      const hasData = data[namaKey].some((nama) => nama && nama.trim() !== "");
      if (hasData) {
        result += `${title}\n`;
        data[namaKey].forEach((nama, index) => {
          if (nama && nama.trim() !== "") {
            result += `┣ ${index + 1}. ${nama}\n`;
            if (type === "organisasi") {
              result += `┃   📋 ${
                (data.organisasi_jabatan && data.organisasi_jabatan[index]) ||
                "Tidak disebutkan"
              } (${
                (data.organisasi_tahun && data.organisasi_tahun[index]) ||
                "Tidak disebutkan"
              })\n`;
            } else {
              result += `┃   🎖 ${
                (data.prestasi_tingkat && data.prestasi_tingkat[index]) ||
                "Tidak disebutkan"
              } (${
                (data.prestasi_tahun && data.prestasi_tahun[index]) ||
                "Tidak disebutkan"
              })\n`;
            }
            // Certificate is optional - show friendly message
            if (data[sertifikatKey] && data[sertifikatKey][index]) {
              result += `┃   📜 Sertifikat: ✅ Ada\n`;
            } else {
              result += `┃   📜 Sertifikat: ➖ Tidak dilampirkan\n`;
            }
          }
        });
        result += "\n";
      }
    }

    return result;
  }

  // Enhanced sending with retry and better error handling
  async sendWithRetry(message, mediaFiles, data, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.sendNotification(message, mediaFiles, data);
        return;
      } catch (error) {
        console.error(
          `❌ Send attempt ${attempt}/${maxRetries} failed:`,
          error.message
        );

        if (attempt === maxRetries) {
          // Last attempt - try sending text only as fallback
          try {
            await this.sendTextMessage(message);
            console.log("✅ Fallback text message sent successfully");
          } catch (fallbackError) {
            console.error(
              "❌ Fallback text message also failed:",
              fallbackError.message
            );
            throw new Error(
              `All send attempts failed. Last error: ${error.message}`
            );
          }
        } else {
          // Wait before retry
          await this.delay(2000 * attempt);
        }
      }
    }
  }

  // Main notification sending logic
  async sendNotification(message, mediaFiles, data) {
    const PHOTO_MAX_SIZE = 10 * 1024 * 1024; // 10MB
    const CAPTION_LIMIT = 1024; // Telegram caption limit
    const TELEGRAM_MESSAGE_LIMIT = 4096; // Telegram text message limit

    const photos = [];
    const documents = [];

    // Categorize files by type and size
    for (const file of mediaFiles) {
      if (file.type === "photo") {
        if (file.size > PHOTO_MAX_SIZE) {
          console.warn(
            `⚠️ Photo too large (${this.formatFileSize(
              file.size
            )}), sending as document`
          );
          documents.push({
            ...file,
            type: "document",
            caption: file.caption.replace(/<\/?b>/g, ""),
          });
        } else {
          photos.push(file);
        }
      } else {
        documents.push(file);
      }
    }

    let mainCaption = message;

    // Determine if the main message needs to be sent as a separate text message
    // This happens if there are photos and the message is too long for a caption,
    // or if there are no photos and the message is too long for a single text message.
    let messageSentSeparately = false;

    if (photos.length > 0) {
      // If there are photos, the main message becomes the caption.
      // If the caption is too long, send the full message as a separate text message.
      if (mainCaption.length > CAPTION_LIMIT) {
        await this.sendTextMessage(mainCaption);
        mainCaption = `🎉 <b>PENDAFTAR BARU OSIS</b>\n\n📄 Data lengkap telah dikirim di pesan sebelumnya.\n📷 Foto & 📜 Sertifikat dari ${data.nama_lengkap}`;
        messageSentSeparately = true;
      }
      await this.sendPhotos(photos, mainCaption, data);
      await this.delay(500);
    } else {
      // If no photos, send the main message as a text message.
      // Split if it exceeds the Telegram message limit.
      if (mainCaption.length > TELEGRAM_MESSAGE_LIMIT) {
        const messages = this.splitMessage(mainCaption, TELEGRAM_MESSAGE_LIMIT);
        for (const msgPart of messages) {
          await this.sendTextMessage(msgPart);
          await this.delay(500); // Add a small delay between messages
        }
        messageSentSeparately = true;
      } else {
        await this.sendTextMessage(mainCaption);
        messageSentSeparately = true;
      }
    }

    // Send documents
    if (documents.length > 0) {
      // If the main message was sent separately and there were no photos,
      // and there are documents, send a small message to link them.
      if (messageSentSeparately && photos.length === 0) {
        await this.sendTextMessage(
          `📄 Dokumen terlampir untuk ${data.nama_lengkap}`
        );
        await this.delay(500);
      }
      await this.sendDocuments(documents);
    }
  }

  // Send photos with proper media group handling
  async sendPhotos(photos, caption, data) {
    if (photos.length === 1) {
      await this.bot.sendPhoto(process.env.TELEGRAM_CHAT_ID, photos[0].path, {
        caption: caption,
        parse_mode: "HTML",
      });
    } else {
      const mediaGroup = photos.map((photo, index) => ({
        type: "photo",
        media: photos[0].path,
        caption:
          index === 0 ? caption : `📷 Foto ${index + 1} - ${data.nama_lengkap}`,
        parse_mode: "HTML",
      }));
      await this.bot.sendMediaGroup(process.env.TELEGRAM_CHAT_ID, mediaGroup);
    }
    console.log(`✅ Sent ${photos.length} photo(s)`);
  }

  // Send documents individually with proper error handling
  async sendDocuments(documents) {
    console.log(`📨 Sending ${documents.length} document(s)...`);

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      try {
        await this.bot.sendDocument(process.env.TELEGRAM_CHAT_ID, doc.path, {
          caption: doc.caption,
          parse_mode: "HTML",
        });
        console.log(
          `✅ Document ${i + 1}/${documents.length} sent: ${path.basename(
            doc.path
          )}`
        );
      } catch (error) {
        console.error(
          `❌ Failed to send document ${path.basename(doc.path)}:`,
          error.message
        );

        // Try without caption as fallback
        try {
          await this.bot.sendDocument(process.env.TELEGRAM_CHAT_ID, doc.path);
          console.log(
            `✅ Document sent without caption: ${path.basename(doc.path)}`
          );
        } catch (fallbackError) {
          console.error(
            `❌ Complete failure for document: ${path.basename(doc.path)}`
          );
        }
      }

      if (i < documents.length - 1) {
        await this.delay(300); // Rate limiting
      }
    }
  }

  // Send text message with HTML parsing
  async sendTextMessage(text) {
    await this.bot.sendMessage(process.env.TELEGRAM_CHAT_ID, text, {
      parse_mode: "HTML",
    });
    console.log("✅ Text message sent");
  }

  // Utility methods
  formatFileSize(bytes) {
    const sizes = ["B", "KB", "MB", "GB"];
    if (bytes === 0) return "0 B";
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round((bytes / Math.pow(1024, i)) * 100) / 100} ${sizes[i]}`;
  }

  getStatusIcon(status) {
    const icons = {
      PENDING: "⏳",
      PENDING_TERIMA: "🟡",
      PENDING_TOLAK: "🟠",
      LOLOS: "✅",
      DITOLAK: "❌",
      PENDING_BOT_APPROVAL: "🔄",
    };
    return icons[status] || "❓";
  }

  formatStatus(status) {
    const statuses = {
      PENDING: "Menunggu Review",
      PENDING_TERIMA: "Menunggu Push (Diterima)",
      PENDING_TOLAK: "Menunggu Push (Ditolak)",
      LOLOS: "Diterima",
      DITOLAK: "Ditolak",
      PENDING_BOT_APPROVAL: "Menunggu Persetujuan Bot",
    };
    return statuses[status] || status;
  }

  formatDate(date) {
    return new Date(date).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Helper to handle long text by saving to file and returning a placeholder
  async _handleLongTextAsFile(text, filenamePrefix, mediaFiles) {
    const TEXT_FILE_THRESHOLD = 1000; // Characters
    if (text.length > TEXT_FILE_THRESHOLD) {
      const uniqueFilename = `${filenamePrefix}-${uuidv4()}.txt`;
      const tempDir = path.join(__dirname, "..", "uploads", "temp");
      const tempFilePath = path.join(tempDir, uniqueFilename);

      await fs.ensureDir(tempDir); // Ensure temp directory exists
      await fs.writeFile(tempFilePath, text, "utf8");

      mediaFiles.push({
        type: "document",
        path: tempFilePath,
        caption: `📄 ${filenamePrefix} (Lihat file terlampir)`,
        size: (await fs.stat(tempFilePath)).size,
        isTemporary: true, // Mark for later cleanup
      });

      console.log(`📝 Long text saved to file: ${tempFilePath}`);
      return `<i>(Lihat file terlampir: ${filenamePrefix})</i>`;
    }
    return text;
  }

  // Cleanup temporary files marked with isTemporary: true
  async cleanupTemporaryFiles(mediaFiles) {
    for (const file of mediaFiles) {
      if (file.isTemporary && (await fs.pathExists(file.path))) {
        try {
          await fs.remove(file.path);
          console.log(`🗑️ Cleaned up temporary file: ${file.path}`);
        } catch (error) {
          console.warn(
            `⚠️ Could not clean up temporary file ${file.path}: ${error.message}`
          );
        }
      }
    }
  }

  // Enhanced command setup
  setupCommands() {
    if (!this.bot) return;

    console.log("🛠️ Setting up enhanced bot commands...");

    // Welcome command
    this.bot.onText(/\/start/, (msg) => {
      const welcomeMessage = `
🎭 <b>BOT OSIS RECRUITMENT ${new Date().getFullYear()}/${
        new Date().getFullYear() + 1
      }</b>

👋 Halo ${
        msg.from.first_name
      }! Selamat datang di sistem rekrutmen OSIS otomatis.

<b>🔧 PERINTAH UMUM:</b>
┣ 📋 /help - Panduan lengkap
┣ 🔍 /status [tiket] - Cek status pendaftar
┣ 📊 /stats - Statistik pendaftaran
┣ 📝 /daftar - Lihat semua pendaftar
┣ 🔍 /search [kata kunci] - Cari pendaftar
┗ � /detail [tiket] - Info lengkap & foto

<b>⚙️ PERINTAH ADMIN:</b>
┣ ✅ /terima [tiket] - Terima pendaftar
┣ ❌ /tolak [tiket] [alasan] - Tolak pendaftar
┣ ➕ /adddivisi [tiket] [divisi] [alasan] - Tambah divisi ke pendaftar
┣ 📊 /excel - Export data ke Excel
┣ 💾 /backup - Backup database
┗ 🗑 /hapus [tiket] - Hapus pendaftar

Ketik /help untuk panduan lengkap penggunaan.
      `.trim();

      this.bot.sendMessage(msg.chat.id, welcomeMessage, { parse_mode: "HTML" });
    });

    // Help command
    this.bot.onText(/\/help/, (msg) => {
      this.sendHelpMessage(msg.chat.id);
    });

    // Status check command
    this.bot.onText(/\/status (.+)/, async (msg, match) => {
      await this.handleStatusCommand(msg.chat.id, match[1]);
    });

    // Stats command
    this.bot.onText(/\/stats/, async (msg) => {
      await this.handleStatsCommand(msg.chat.id);
    });

    // Accept command with ticket extraction
    this.bot.onText(/\/terima (.+)/, async (msg, match) => {
      // Extract only ticket format OSIS25-XXXXXX-X from input
      const input = match[1].trim();
      const ticketMatch = input.match(/OSIS25-\d{6}-[A-Z]/);

      if (ticketMatch) {
        await this.handleAcceptCommand(msg.chat.id, ticketMatch[0]);
      } else {
        await this.bot.sendMessage(
          msg.chat.id,
          "❌ Format tiket tidak valid!\n\nGunakan format: <code>/terima OSIS25-123456-A</code>",
          { parse_mode: "HTML" }
        );
      }
    });

    // Reject command with ticket extraction
    this.bot.onText(/\/tolak (.+)/, async (msg, match) => {
      const input = match[1].trim();
      const ticketMatch = input.match(/OSIS25-\d{6}-[A-Z]/);

      if (ticketMatch) {
        // Extract reason (everything after ticket)
        const reason = input.replace(ticketMatch[0], "").trim();
        await this.handleRejectCommand(
          msg.chat.id,
          ticketMatch[0] + (reason ? " " + reason : "")
        );
      } else {
        await this.bot.sendMessage(
          msg.chat.id,
          "❌ Format tiket tidak valid!\n\nGunakan format: <code>/tolak OSIS25-123456-A [alasan]</code>",
          { parse_mode: "HTML" }
        );
      }
    });

    // Search command
    this.bot.onText(/\/search (.+)/, async (msg, match) => {
      await this.handleSearchCommand(msg.chat.id, match[1]);
    });

    // List all registrants
    this.bot.onText(/\/daftar/, async (msg) => {
      await this.handleListCommand(msg.chat.id);
    });

    // Detail command
    this.bot.onText(/\/detail (.+)/, async (msg, match) => {
      await this.handleDetailCommand(msg.chat.id, match[1]);
    });

    // Excel export command
    this.bot.onText(/\/excel/, async (msg) => {
      await this.handleExcelCommand(msg.chat.id);
    });

    // Delete command
    this.bot.onText(/\/hapus (.+)/, async (msg, match) => {
      await this.handleDeleteCommand(msg.chat.id, match[1]);
    });

    // Backup command
    this.bot.onText(/\/backup/, async (msg) => {
      await this.handleBackupCommand(msg.chat.id);
    });

    // List backups command
    this.bot.onText(/\/listbackup/, async (msg) => {
      await this.handleListBackupCommand(msg.chat.id);
    });

    // Delete backup command
    this.bot.onText(/\/deletebackup (.+)/, async (msg, match) => {
      await this.handleDeleteBackupCommand(msg.chat.id, match[1]);
    });

    // Push command - Process all pending approvals
    this.bot.onText(/\/push/, async (msg) => {
      await this.handlePushCommand(msg.chat.id);
    });

    // Add Division command
    this.bot.onText(/\/adddivisi (.+)/, async (msg, match) => {
      await this.handleAddDivisionCommand(msg.chat.id, match[1]);
    });
  }

  // Command handlers
  async sendHelpMessage(chatId) {
    const helpMessage = `
📚 <b>PANDUAN LENGKAP BOT OSIS</b>

<b>🎯 CARA MENGGUNAKAN:</b>

<b>1. CEK STATUS PENDAFTAR</b>
<code>/status OSIS25-782753-E</code>
→ Menampilkan status dan detail pendaftar

<b>2. CARI PENDAFTAR</b>
<code>/search Ida</code>
→ Mencari pendaftar berdasarkan nama/kelas/tiket

<b>3. LIHAT SEMUA PENDAFTAR</b>
<code>/daftar</code>
→ Menampilkan semua pendaftar terdaftar

<b>4. LIHAT DETAIL LENGKAP + FOTO</b>
<code>/detail OSIS25-782753-E</code>
→ Info lengkap dengan foto dan sertifikat

<b>5. LIHAT STATISTIK</b>
<code>/stats</code>
→ Menampilkan ringkasan pendaftaran

<b>🔧 SISTEM APPROVAL QUEUE:</b>

<b>6. TANDAI UNTUK DITERIMA</b>
<code>/terima OSIS25-782753-E</code>
→ Status: PENDING_TERIMA (menunggu push)

<b>7. TANDAI UNTUK DITOLAK</b>
<code>/tolak OSIS25-782753-E Tidak memenuhi syarat</code>
→ Status: PENDING_TOLAK (menunggu push)

<b>8. PROSES BATCH APPROVAL</b>
<code>/push</code>
→ PENDING_TERIMA → LOLOS ✅
→ PENDING_TOLAK → DITOLAK ❌

<b>📤 EXPORT & BACKUP:</b>

<b>9. EXPORT KE EXCEL</b>
<code>/excel</code>
→ Download data dalam format Excel

<b>10. BACKUP DATABASE</b>
<code>/backup</code>
→ Buat backup database lengkap

<b>11. LIHAT BACKUP</b>
<code>/listbackup</code>
→ Menampilkan daftar folder backup yang tersedia

<b>12. HAPUS BACKUP</b>
<code>/deletebackup [nama_folder]</code>
→ Menghapus folder backup tertentu (HATI-HATI!)

<b>13. HAPUS PENDAFTAR</b>
<code>/hapus OSIS25-782753-E</code>
→ Hapus data pendaftar (HATI-HATI!)

<b>14. TAMBAH DIVISI KE PENDAFTAR</b>
<code>/adddivisi OSIS25-782753-E Kedisiplinan Saya akan memberikan contoh baik...</code>
→ Menambahkan pilihan divisi baru ke pendaftar

<b>📝 WORKFLOW ADMIN:</b>
1. Cek pendaftar: /daftar atau /stats
2. Review detail: /detail [ticket]
3. Tandai approval: /terima atau /tolak
4. Proses batch: /push
5. Monitor hasil: /stats

<b>⚠️ CATATAN PENTING:</b>
• Sertifikat bersifat OPTIONAL (tidak wajib)
• Sistem queue memberikan kontrol lebih baik
• Selalu /push setelah menandai approval
• Bot memberikan notifikasi real-time

Butuh bantuan? Hubungi administrator.
    `.trim();

    await this.bot.sendMessage(chatId, helpMessage, { parse_mode: "HTML" });
  }

  async handleStatusCommand(chatId, ticket) {
    try {
      // Implementation for status check
      console.log(`🔍 Checking status for ticket: ${ticket}`);

      const connection = await getConnection();
      try {
        const [users] = await connection.execute(
          "SELECT * FROM users WHERE ticket = ?",
          [ticket.trim()]
        );

        if (users.length === 0) {
          await this.bot.sendMessage(
            chatId,
            `❌ <b>Tiket tidak ditemukan</b>\n\nTiket: <code>${ticket}</code>\n\nPastikan nomor tiket benar dan sudah terdaftar.`,
            { parse_mode: "HTML" }
          );
          return;
        }

        const user = users[0];
        const statusMessage = this.formatUserStatus(user);
        await this.bot.sendMessage(chatId, statusMessage, {
          parse_mode: "HTML",
        });
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error("Error handling status command:", error);
      await this.bot.sendMessage(
        chatId,
        "❌ Terjadi kesalahan saat mengecek status."
      );
    }
  }

  async handleStatsCommand(chatId) {
    try {
      console.log("📊 Generating stats...");

      const connection = await getConnection();
      try {
        // Get various statistics
        const [totalCount] = await connection.execute(
          "SELECT COUNT(*) as total FROM users"
        );
        const [statusCounts] = await connection.execute(
          "SELECT status, COUNT(*) as count FROM users GROUP BY status"
        );
        const [todayCount] = await connection.execute(
          "SELECT COUNT(*) as today FROM users WHERE DATE(created_at) = CURDATE()"
        );

        let statsMessage = `📊 <b>STATISTIK REKRUTMEN OSIS</b>\n\n`;
        statsMessage += `📈 <b>TOTAL PENDAFTAR:</b> ${totalCount[0].total}\n`;
        statsMessage += `📅 <b>HARI INI:</b> ${todayCount[0].today}\n\n`;

        statsMessage += `📋 <b>BERDASARKAN STATUS:</b>\n`;
        statusCounts.forEach((stat) => {
          const icon = this.getStatusIcon(stat.status);
          statsMessage += `${icon} ${this.formatStatus(stat.status)}: ${
            stat.count
          }\n`;
        });

        // Calculate acceptance rate
        const lolos =
          statusCounts.find((s) => s.status === "LOLOS")?.count || 0;
        const ditolak =
          statusCounts.find((s) => s.status === "DITOLAK")?.count || 0;
        const processed = lolos + ditolak;

        if (processed > 0) {
          const rate = Math.round((lolos / processed) * 100);
          statsMessage += `\n💯 <b>TINGKAT PENERIMAAN:</b> ${rate}%`;
        }

        await this.bot.sendMessage(chatId, statsMessage, {
          parse_mode: "HTML",
        });
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error("Error generating stats:", error);
      await this.bot.sendMessage(
        chatId,
        "❌ Terjadi kesalahan saat mengambil statistik."
      );
    }
  }

  formatUserStatus(user) {
    const statusIcon = this.getStatusIcon(user.status);
    const statusText = this.formatStatus(user.status);

    let message = `📊 <b>STATUS PENDAFTAR</b>\n\n`;
    message += `👤 <b>Nama:</b> ${user.nama_lengkap}\n`;
    message += `🎫 <b>Tiket:</b> <code>${user.ticket}</code>\n`;
    message += `📊 <b>Status:</b> ${statusIcon} ${statusText}\n`;

    // Show queue status explanation
    if (user.status === "PENDING_TERIMA") {
      message += `🔄 <b>Info:</b> Menunggu diproses (akan menjadi LOLOS saat /push)\n`;
    } else if (user.status === "PENDING_TOLAK") {
      message += `🔄 <b>Info:</b> Menunggu diproses (akan menjadi DITOLAK saat /push)\n`;
      if (user.catatan) {
        message += `💭 <b>Alasan:</b> ${user.catatan}\n`;
      }
    } else if (user.status === "LOLOS") {
      message += `🎉 <b>Selamat!</b> Anda diterima dalam seleksi OSIS\n`;
    } else if (user.status === "DITOLAK") {
      message += `😔 <b>Maaf,</b> Anda belum berhasil dalam seleksi ini\n`;
      if (user.catatan) {
        message += `💭 <b>Alasan:</b> ${user.catatan}\n`;
      }
    }

    message += `🏫 <b>Kelas:</b> ${user.kelas} - ${user.jurusan}\n`;
    message += `📅 <b>Daftar:</b> ${this.formatDate(user.created_at)}\n`;

    if (user.updated_at && user.updated_at !== user.created_at) {
      message += `🔄 <b>Update:</b> ${this.formatDate(user.updated_at)}\n`;
    }

    return message;
  }

  // ADD DIVISION COMMAND - Add a new division to a user
  async handleAddDivisionCommand(chatId, input) {
    try {
      const parts = input.trim().split(/\s+/); // Split by one or more spaces
      const ticket = parts[0];
      const divisionName = parts[1];
      const reason = parts.slice(2).join(" ");

      // Basic validation
      if (!ticket || !divisionName || !reason) {
        await this.bot.sendMessage(
          chatId,
          "❌ Format perintah tidak valid.\n\nGunakan format: <code>/adddivisi [tiket] [nama_divisi] [alasan]</code>\n\nContoh: <code>/adddivisi OSIS25-123456-A Kedisiplinan Saya akan memberikan contoh baik...</code>",
          { parse_mode: "HTML" }
        );
        return;
      }

      // Validate ticket format
      const ticketMatch = ticket.match(/OSIS25-\d{6}-[A-Z]/);
      if (!ticketMatch) {
        await this.bot.sendMessage(
          chatId,
          "❌ Format tiket tidak valid!\n\nGunakan format: <code>OSIS25-123456-A</code>",
          { parse_mode: "HTML" }
        );
        return;
      }

      // Validate division name against ENUM values in database/mysql-database-refactored.js
      const allowedDivisions = [
        "Keagamaan",
        "Kedisiplinan",
        "Bakat Minat",
        "Jurnalistik",
        "Media Jaringan",
        "Sekretaris",
      ];
      if (!allowedDivisions.includes(divisionName)) {
        await this.bot.sendMessage(
          chatId,
          `❌ Nama divisi tidak valid. Pilihan yang tersedia: ${allowedDivisions.join(
            ", "
          )}`,
          { parse_mode: "HTML" }
        );
        return;
      }

      console.log(
        `➕ Adding division '${divisionName}' for ticket '${ticket}' with reason: '${reason}'`
      );

      const { dbManager } = require("../database/mysql-database-refactored");
      const result = await dbManager.addDivisionToUser(
        ticket,
        divisionName,
        reason
      );

      if (result.success) {
        await this.bot.sendMessage(
          chatId,
          `✅ <b>Divisi berhasil ditambahkan!</b>\n\n` +
            `👤 Tiket: <code>${ticket}</code>\n` +
            `🎯 Divisi: <b>${divisionName}</b>\n` +
            `💬 Alasan: ${reason}\n\n` +
            `💡 Gunakan <code>/detail ${ticket}</code> untuk melihat detail pendaftar yang diperbarui.`,
          { parse_mode: "HTML" }
        );
      } else {
        await this.bot.sendMessage(
          chatId,
          `❌ Gagal menambahkan divisi: ${
            result.message || "Terjadi kesalahan."
          }`,
          { parse_mode: "HTML" }
        );
      }
    } catch (error) {
      console.error("Error handling adddivisi command:", error);
      await this.bot.sendMessage(
        chatId,
        `❌ Terjadi kesalahan saat menambahkan divisi:\n\n<code>${error.message}</code>`,
        { parse_mode: "HTML" }
      );
    }
  }

  // ACCEPT COMMAND - Approve a registrant (now pending approval)
  async handleAcceptCommand(chatId, input) {
    try {
      const ticket = input.trim();
      console.log(`✅ Marking for acceptance: ${ticket}`);

      const connection = await getConnection();
      try {
        // Check if user exists
        const [users] = await connection.execute(
          "SELECT * FROM users WHERE ticket = ?",
          [ticket]
        );

        if (users.length === 0) {
          await this.bot.sendMessage(
            chatId,
            `❌ <b>Tiket tidak ditemukan</b>\n\nTiket: <code>${ticket}</code>\n\nPastikan nomor tiket benar.`,
            { parse_mode: "HTML" }
          );
          return;
        }

        const user = users[0];
        const adminName = "TELEGRAM_ADMIN";
        let statusMessage = "";
        let actionType = "";

        // Enhanced logic based on current status
        switch (user.status) {
          case "PENDING":
          case "PENDING_TOLAK":
            // Mark for acceptance (add to queue)
            await connection.execute(
              "UPDATE users SET status = ?, updated_by = ?, updated_at = NOW() WHERE ticket = ?",
              ["PENDING_TERIMA", adminName, ticket]
            );
            statusMessage = "🟡 Menunggu Push (Diterima)";
            actionType = "DITANDAI UNTUK DITERIMA";
            break;

          case "PENDING_TERIMA":
            // Already marked for acceptance
            await this.bot.sendMessage(
              chatId,
              `ℹ️ <b>Pendaftar sudah ditandai untuk diterima</b>\n\nNama: ${user.nama_lengkap}\nTiket: <code>${ticket}</code>\n\n💡 Gunakan <code>/push</code> untuk memproses atau <code>/tolak</code> untuk mengubah keputusan.`,
              { parse_mode: "HTML" }
            );
            return;

          case "LOLOS":
            // Already accepted - offer to update or confirm
            await this.bot.sendMessage(
              chatId,
              `✅ <b>Pendaftar sudah LOLOS sebelumnya</b>\n\nNama: ${user.nama_lengkap}\nTiket: <code>${ticket}</code>\n\n💡 Status tidak berubah. Gunakan <code>/tolak</code> jika ingin mengubah keputusan.`,
              { parse_mode: "HTML" }
            );
            return;

          case "DITOLAK":
            // Previously rejected, now mark for acceptance (can be changed after push)
            await connection.execute(
              "UPDATE users SET status = ?, updated_by = ?, updated_at = NOW() WHERE ticket = ?",
              ["PENDING_TERIMA", adminName, ticket]
            );
            statusMessage =
              "🟡 Menunggu Push (Diterima) - ⚠️ Perubahan dari DITOLAK";
            actionType = "DIUBAH KE DITERIMA";
            break;

          default:
            await connection.execute(
              "UPDATE users SET status = ?, updated_by = ?, updated_at = NOW() WHERE ticket = ?",
              ["PENDING_TERIMA", adminName, ticket]
            );
            statusMessage = "🟡 Menunggu Push (Diterima)";
            actionType = "DITANDAI UNTUK DITERIMA";
        }

        const acceptMessage = `
✅ <b>PENDAFTAR ${actionType}</b>

👤 <b>Nama:</b> ${user.nama_lengkap}
🎫 <b>Tiket:</b> <code>${ticket}</code>
🏫 <b>Kelas:</b> ${user.kelas} - ${user.jurusan}
📊 <b>Status:</b> ${statusMessage}
📅 <b>Diproses:</b> ${this.formatDate(new Date())}

💡 <b>Langkah selanjutnya:</b> Gunakan <code>/push</code> untuk memfinalisasi semua keputusan.
        `.trim();

        await this.bot.sendMessage(chatId, acceptMessage, {
          parse_mode: "HTML",
        });

        // Log the action
        const logParams = [
          user.id,
          ticket,
          "UPDATE",
          user.status,
          "PENDING_TERIMA",
          `Marked for acceptance by ${adminName}. Previous status: ${user.status}`,
          adminName,
          adminName,
        ];
        await connection.execute(
          "INSERT INTO admin_logs (user_id, ticket, action, previous_status, new_status, reason, admin_name, admin_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          logParams
        );
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error("Error accepting registrant:", error);
      await this.bot.sendMessage(
        chatId,
        "❌ Terjadi kesalahan saat memproses penerimaan."
      );
    }
  }

  // REJECT COMMAND - Reject a registrant (now pending approval)
  async handleRejectCommand(chatId, input) {
    try {
      const parts = input.trim().split(" ");
      const ticket = parts[0];
      const reason = parts.slice(1).join(" ") || "Tidak memenuhi syarat";

      console.log(`❌ Marking for rejection: ${ticket}, reason: ${reason}`);

      const connection = await getConnection();
      try {
        // Check if user exists
        const [users] = await connection.execute(
          "SELECT * FROM users WHERE ticket = ?",
          [ticket]
        );

        if (users.length === 0) {
          await this.bot.sendMessage(
            chatId,
            `❌ <b>Tiket tidak ditemukan</b>\n\nTiket: <code>${ticket}</code>\n\nPastikan nomor tiket benar.`,
            { parse_mode: "HTML" }
          );
          return;
        }

        const user = users[0];
        const adminName = "TELEGRAM_ADMIN";
        let statusMessage = "";
        let actionType = "";

        // Enhanced logic based on current status
        switch (user.status) {
          case "PENDING":
          case "PENDING_TERIMA":
            // Mark for rejection (add to queue)
            await connection.execute(
              "UPDATE users SET status = ?, updated_by = ?, updated_at = NOW() WHERE ticket = ?",
              ["PENDING_TOLAK", adminName, ticket]
            );
            statusMessage = "🟠 Menunggu Push (Ditolak)";
            actionType = "DITANDAI UNTUK DITOLAK";
            break;

          case "PENDING_TOLAK":
            // Already marked for rejection
            await this.bot.sendMessage(
              chatId,
              `ℹ️ <b>Pendaftar sudah ditandai untuk ditolak</b>\n\nNama: ${user.nama_lengkap}\nTiket: <code>${ticket}</code>\n\n💡 Gunakan <code>/push</code> untuk memproses atau <code>/terima</code> untuk mengubah keputusan.`,
              { parse_mode: "HTML" }
            );
            return;

          case "DITOLAK":
            // Already rejected - offer to update or confirm
            await this.bot.sendMessage(
              chatId,
              `❌ <b>Pendaftar sudah DITOLAK sebelumnya</b>\n\nNama: ${user.nama_lengkap}\nTiket: <code>${ticket}</code>\n\n💡 Status tidak berubah. Gunakan <code>/terima</code> jika ingin mengubah keputusan.`,
              { parse_mode: "HTML" }
            );
            return;

          case "LOLOS":
            // Previously accepted, now mark for rejection (can be changed after push)
            await connection.execute(
              "UPDATE users SET status = ?, updated_by = ?, updated_at = NOW() WHERE ticket = ?",
              ["PENDING_TOLAK", adminName, ticket]
            );
            statusMessage =
              "🟠 Menunggu Push (Ditolak) - ⚠️ Perubahan dari LOLOS";
            actionType = "DIUBAH KE DITOLAK";
            break;

          default:
            await connection.execute(
              "UPDATE users SET status = ?, updated_by = ?, updated_at = NOW() WHERE ticket = ?",
              ["PENDING_TOLAK", adminName, ticket]
            );
            statusMessage = "🟠 Menunggu Push (Ditolak)";
            actionType = "DITANDAI UNTUK DITOLAK";
        }

        const rejectMessage = `
❌ <b>PENDAFTAR ${actionType}</b>

👤 <b>Nama:</b> ${user.nama_lengkap}
🎫 <b>Tiket:</b> <code>${ticket}</code>
🏫 <b>Kelas:</b> ${user.kelas} - ${user.jurusan}
📊 <b>Status:</b> ${statusMessage}
💬 <b>Alasan:</b> ${reason}
📅 <b>Diproses:</b> ${this.formatDate(new Date())}

💡 <b>Langkah selanjutnya:</b> Gunakan <code>/push</code> untuk memfinalisasi semua keputusan.
        `.trim();

        await this.bot.sendMessage(chatId, rejectMessage, {
          parse_mode: "HTML",
        });

        // Log the rejection reason
        await connection.execute(
          "INSERT INTO admin_logs (user_id, ticket, action, previous_status, new_status, reason, admin_name, admin_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [
            user.id,
            ticket,
            "UPDATE",
            user.status,
            "PENDING_TOLAK",
            `Marked for rejection by ${adminName}. Reason: ${reason}. Previous status: ${user.status}`,
            adminName,
            adminName,
          ]
        );
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error("Error rejecting registrant:", error);
      await this.bot.sendMessage(
        chatId,
        "❌ Terjadi kesalahan saat memproses penolakan."
      );
    }
  }

  // ENHANCED PUSH COMMAND - Process all pending approvals with detailed logging
  async handlePushCommand(chatId) {
    try {
      console.log("🚀 Processing all pending approvals...");

      const connection = await getConnection();
      try {
        // Get all pending approvals with detailed info
        const [pendingAccepts] = await connection.execute(
          "SELECT * FROM users WHERE status = ? ORDER BY updated_at ASC",
          ["PENDING_TERIMA"]
        );

        const [pendingRejects] = await connection.execute(
          `SELECT u.*, 
                  COALESCE(al.reason, 'Tidak memenuhi syarat') as rejection_reason
           FROM users u 
           LEFT JOIN admin_logs al ON u.ticket = al.ticket 
               AND al.action = 'UPDATE' 
               AND al.new_status = 'PENDING_TOLAK'
               AND al.created_at = (
                   SELECT MAX(created_at) 
                   FROM admin_logs 
                   WHERE ticket = u.ticket AND action = 'UPDATE' AND new_status = 'PENDING_TOLAK'
               )
           WHERE u.status = ?
           ORDER BY u.updated_at ASC`,
          ["PENDING_TOLAK"]
        );

        const totalPending = pendingAccepts.length + pendingRejects.length;

        if (totalPending === 0) {
          await this.bot.sendMessage(
            chatId,
            `ℹ️ <b>Tidak ada antrian untuk diproses</b>\n\n` +
              `📋 Semua pendaftar sudah diproses atau belum ada yang menunggu approval.\n\n` +
              `💡 Gunakan <code>/terima TIKET</code> atau <code>/tolak TIKET alasan</code> untuk menandai pendaftar.`,
            { parse_mode: "HTML" }
          );
          return;
        }

        // Show processing confirmation
        await this.bot.sendMessage(
          chatId,
          `🚀 <b>MEMPROSES PUSH APPROVAL</b>\n\n` +
            `📊 <b>Ringkasan:</b>\n` +
            `┣ ✅ Akan diterima: <b>${pendingAccepts.length}</b> pendaftar\n` +
            `┣ ❌ Akan ditolak: <b>${pendingRejects.length}</b> pendaftar\n` +
            `┗ 📈 Total diproses: <b>${totalPending}</b>\n\n` +
            `⏳ <b>Sedang memproses...</b>`,
          { parse_mode: "HTML" }
        );

        const adminName = "TELEGRAM_ADMIN";

        // Process acceptances
        let acceptedCount = 0;
        for (const user of pendingAccepts) {
          await connection.execute(
            "UPDATE users SET status = ?, updated_by = ?, updated_at = NOW() WHERE id = ?",
            ["LOLOS", adminName, user.id]
          );

          // Log final acceptance
          await connection.execute(
            "INSERT INTO admin_logs (user_id, ticket, action, previous_status, new_status, reason, admin_name, admin_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
              user.id,
              user.ticket,
              "APPROVE",
              "PENDING_TERIMA",
              "LOLOS",
              `Final acceptance via push by ${adminName}`,
              adminName,
              adminName,
            ]
          );
          acceptedCount++;
        }

        // Process rejections
        let rejectedCount = 0;
        for (const user of pendingRejects) {
          await connection.execute(
            "UPDATE users SET status = ?, updated_by = ?, updated_at = NOW() WHERE id = ?",
            ["DITOLAK", adminName, user.id]
          );

          // Log final rejection
          await connection.execute(
            "INSERT INTO admin_logs (user_id, ticket, action, previous_status, new_status, reason, admin_name, admin_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
              user.id,
              user.ticket,
              "REJECT",
              "PENDING_TOLAK",
              "DITOLAK",
              `Final rejection via push by ${adminName}. Reason: ${
                user.rejection_reason || "Tidak memenuhi syarat"
              }`,
              adminName,
              adminName,
            ]
          );
          rejectedCount++;
        }

        // Create detailed summary message
        let summaryMessage = `🎉 <b>PUSH APPROVAL SELESAI</b>\n\n`;
        summaryMessage += `📊 <b>RINGKASAN PEMROSESAN</b>\n`;
        summaryMessage += `┣ ✅ Diterima: <b>${acceptedCount}</b> pendaftar\n`;
        summaryMessage += `┣ ❌ Ditolak: <b>${rejectedCount}</b> pendaftar\n`;
        summaryMessage += `┗ 📈 Total diproses: <b>${totalPending}</b>\n\n`;

        if (acceptedCount > 0) {
          summaryMessage += `✅ <b>DITERIMA (${acceptedCount}):</b>\n`;
          pendingAccepts.forEach((user, index) => {
            summaryMessage += `${index + 1}. ${user.nama_lengkap} (<code>${
              user.ticket
            }</code>)\n`;
          });
          summaryMessage += "\n";
        }

        if (rejectedCount > 0) {
          summaryMessage += `❌ <b>DITOLAK (${rejectedCount}):</b>\n`;
          pendingRejects.forEach((user, index) => {
            summaryMessage += `${index + 1}. ${user.nama_lengkap} (<code>${
              user.ticket
            }</code>)\n`;
            const reason = user.rejection_reason || "Tidak memenuhi syarat";
            summaryMessage += `   💬 ${reason.replace(
              "Marked for rejection by TELEGRAM_ADMIN. Reason: ",
              ""
            )}\n`;
          });
          summaryMessage += "\n";
        }

        summaryMessage += `📅 <b>Diproses:</b> ${this.formatDate(
          new Date()
        )}\n`;
        summaryMessage += `💡 <b>Catatan:</b> Status dapat diubah dengan menggunakan <code>/terima</code> atau <code>/tolak</code> kemudian <code>/push</code> lagi.`;

        // Split message if too long
        if (summaryMessage.length > 4000) {
          const messages = this.splitMessage(summaryMessage, 4000);
          for (const msg of messages) {
            await this.bot.sendMessage(chatId, msg, { parse_mode: "HTML" });
            await this.delay(500);
          }
        } else {
          await this.bot.sendMessage(chatId, summaryMessage, {
            parse_mode: "HTML",
          });
        }
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error("Error processing push:", error);
      await this.bot.sendMessage(
        chatId,
        "❌ Terjadi kesalahan saat memproses push approval."
      );
    }
  }

  // SEARCH COMMAND - Search registrants
  async handleSearchCommand(chatId, keyword) {
    try {
      console.log(`🔍 Searching for: ${keyword}`);

      const connection = await getConnection();
      try {
        const searchQuery = `%${keyword.trim()}%`;
        const [users] = await connection.execute(
          `SELECT * FROM users 
           WHERE nama_lengkap LIKE ? 
              OR nama_panggilan LIKE ? 
              OR kelas LIKE ? 
              OR jurusan LIKE ? 
              OR ticket LIKE ?
           ORDER BY created_at DESC 
           LIMIT 10`,
          [searchQuery, searchQuery, searchQuery, searchQuery, searchQuery]
        );

        if (users.length === 0) {
          await this.bot.sendMessage(
            chatId,
            `🔍 <b>Hasil Pencarian</b>\n\nTidak ada pendaftar yang ditemukan dengan kata kunci: <b>${keyword}</b>\n\nCoba gunakan kata kunci lain.`,
            { parse_mode: "HTML" }
          );
          return;
        }

        let searchMessage = `🔍 <b>HASIL PENCARIAN</b>\n\nKata kunci: <b>${keyword}</b>\nDitemukan: <b>${users.length}</b> pendaftar\n\n`;

        users.forEach((user, index) => {
          const statusIcon = this.getStatusIcon(user.status);
          searchMessage += `${index + 1}. <b>${user.nama_lengkap}</b>\n`;
          searchMessage += `   🎫 <code>${user.ticket}</code>\n`;
          searchMessage += `   🏫 ${user.kelas} - ${user.jurusan}\n`;
          searchMessage += `   📊 ${statusIcon} ${this.formatStatus(
            user.status
          )}\n`;
          searchMessage += `   📅 ${this.formatDate(user.created_at)}\n\n`;
        });

        searchMessage += `💡 Gunakan <code>/detail [tiket]</code> untuk info lengkap.`;

        await this.bot.sendMessage(chatId, searchMessage, {
          parse_mode: "HTML",
        });
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error("Error searching registrants:", error);
      await this.bot.sendMessage(
        chatId,
        "❌ Terjadi kesalahan saat melakukan pencarian."
      );
    }
  }

  // LIST COMMAND - List all registrants
  async handleListCommand(chatId) {
    try {
      console.log("📋 Generating registrant list...");

      const connection = await getConnection();
      try {
        const [users] = await connection.execute(
          "SELECT * FROM users ORDER BY created_at DESC"
        );

        if (users.length === 0) {
          await this.bot.sendMessage(
            chatId,
            "📋 <b>Belum ada pendaftar terdaftar.</b>",
            { parse_mode: "HTML" }
          );
          return;
        }

        let listMessage = `📋 <b>DAFTAR PENDAFTAR OSIS</b>\n\n📊 Total: <b>${users.length}</b> pendaftar\n\n`;

        users.forEach((user, index) => {
          const statusIcon = this.getStatusIcon(user.status);
          listMessage += `${index + 1}. <b>${user.nama_lengkap}</b>\n`;
          listMessage += `   🎫 <code>${user.ticket}</code>\n`;
          listMessage += `   🏫 ${user.kelas} - ${user.jurusan}\n`;
          listMessage += `   📊 ${statusIcon} ${this.formatStatus(
            user.status
          )}\n`;
          listMessage += `   📅 ${this.formatDate(user.created_at)}\n\n`;
        });

        listMessage += `💡 Gunakan <code>/detail [tiket]</code> untuk info lengkap.\n`;
        listMessage += `💡 Gunakan <code>/search [nama]</code> untuk mencari pendaftar.`;

        // Split message if too long - with better length management
        const maxLength = 4000;
        if (listMessage.length > maxLength) {
          const messages = this.splitMessage(listMessage, maxLength);
          console.log(`📄 Message split into ${messages.length} parts due to length (${listMessage.length} chars)`);
          
          for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            console.log(`📤 Sending part ${i + 1}/${messages.length} (${msg.length} chars)`);
            await this.bot.sendMessage(chatId, msg, { parse_mode: "HTML" });
            if (i < messages.length - 1) {
              await this.delay(1000); // Longer delay between parts
            }
          }
        } else {
          console.log(`📤 Sending single message (${listMessage.length} chars)`);
          await this.bot.sendMessage(chatId, listMessage, {
            parse_mode: "HTML",
          });
        }
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error("Error generating list:", error);
      await this.bot.sendMessage(
        chatId,
        "❌ Terjadi kesalahan saat mengambil daftar pendaftar."
      );
    }
  }

  // DETAIL COMMAND - Get detailed info with photos
  async handleDetailCommand(chatId, ticket) {
    console.log(`📄 Getting details for ticket: ${ticket}`);

    let mediaFiles = []; // Initialize mediaFiles here
    let connection;
    try {
      connection = await getConnection();
      // Get user data
      const [users] = await connection.execute(
        "SELECT * FROM users WHERE ticket = ?",
        [ticket.trim()]
      );

      if (users.length === 0) {
        await this.bot.sendMessage(
          chatId,
          `❌ <b>Tiket tidak ditemukan</b>\n\nTiket: <code>${ticket}</code>`,
          { parse_mode: "HTML" }
        );
        return;
      }

      const user = users[0];

      // Get related data
      const [organisasi] = await connection.execute(
        "SELECT * FROM organisasi WHERE user_id = ?",
        [user.id]
      );

      const [prestasi] = await connection.execute(
        "SELECT * FROM prestasi WHERE user_id = ?",
        [user.id]
      );

      const [divisi] = await connection.execute(
        "SELECT * FROM divisi WHERE user_id = ?",
        [user.id]
      );

      // Create DETAIL-specific message (different from registration notification)
      const detailMessage = await this.createDetailMessage(
        // Made async
        user,
        organisasi,
        prestasi,
        divisi,
        mediaFiles // Pass mediaFiles
      );

      // Prepare data for file collection
      const detailData = {
        ...user,
        organisasi: organisasi,
        prestasi: prestasi,
        divisi: divisi.map((d) => d.nama_divisi),
        foto_path: user.foto_path, // Corrected to use foto_path from the database
      };

      // Get media files
      const collectedMediaFiles = await this.collectAndValidateFiles(
        detailData
      );
      mediaFiles = mediaFiles.concat(collectedMediaFiles); // Combine

      // Send detailed info with media
      if (mediaFiles.length > 0) {
        console.log(
          `📤 Sending /detail notification with ${mediaFiles.length} media files for ticket ${ticket}`
        );
        await this.sendNotification(detailMessage, mediaFiles, detailData);
      } else {
        console.log(
          `📤 Sending /detail notification as text only (no media files found) for ticket ${ticket}`
        );
        await this.bot.sendMessage(chatId, detailMessage, {
          parse_mode: "HTML",
        });
      }
    } catch (error) {
      console.error(`❌ Error getting details for ticket ${ticket}:`, error);
      await this.bot.sendMessage(
        chatId,
        "❌ Terjadi kesalahan saat mengambil detail pendaftar."
      );
    } finally {
      if (connection) {
        connection.release();
      }
      await this.cleanupTemporaryFiles(mediaFiles); // Ensure temporary files are cleaned up
    }
  }

  // Create message specifically for /detail command (different from registration notification)
  async createDetailMessage(user, organisasi, prestasi, divisi, mediaFiles) {
    // Made async and accepts mediaFiles
    const statusIcon = this.getStatusIcon(user.status);
    const statusText = this.formatStatus(user.status);

    let message = `📋 <b>DETAIL LENGKAP PENDAFTAR</b>\n\n`;

    // Personal Information
    message += `👤 <b>DATA PRIBADI</b>\n`;
    message += `┣ 📝 Nama Lengkap: <b>${user.nama_lengkap || "N/A"}</b>\n`;
    message += `┣ 🏷 Nama Panggilan: ${user.nama_panggilan || "N/A"}\n`;
    message += `┣ 🏫 Kelas: ${user.kelas || "N/A"} - ${
      user.jurusan || "N/A"
    }\n`;

    // Format birth date properly
    const birthDate = user.tanggal_lahir
      ? new Date(user.tanggal_lahir).toLocaleDateString("id-ID", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "N/A";
    message += `┣ 📍 TTL: ${user.tempat_lahir || "N/A"}, ${birthDate}\n`;
    message += `┣ ⚧ Jenis Kelamin: ${user.jenis_kelamin || "N/A"}\n`;
    message += `┣ 🕌 Agama: ${user.agama || "N/A"}\n`;
    message += `┣ 📱 No. HP: ${
      user.nomor_telepon ? `<code>${user.nomor_telepon}</code>` : "N/A"
    }\n`;
    message += `┣ 📧 Email: ${user.email || "N/A"}\n`;
    message += `┣ 🏠 Alamat: ${user.alamat || "N/A"}\n`;
    message += `┣ 🎨 Hobi: ${user.hobi || "N/A"}\n`;
    message += `┗ 💭 Motto: ${user.motto || "N/A"}\n\n`;

    // Organization experience
    if (organisasi && organisasi.length > 0) {
      message += `🏛 <b>PENGALAMAN ORGANISASI</b>\n`;
      organisasi.forEach((org, index) => {
        message += `┣ ${index + 1}. <b>${org.nama_organisasi || "N/A"}</b>\n`;
        message += `┃   📋 Jabatan: ${org.jabatan || "N/A"}\n`;
        message += `┃   📅 Tahun: ${org.tahun || "N/A"}\n`;
        message += `┃   📜 Sertifikat: ${
          org.sertifikat_path ? "✅ Ada" : "❌ Tidak Ada"
        }\n`;
      });
      message += "\n";
    }

    // Achievements
    if (prestasi && prestasi.length > 0) {
      message += `🏆 <b>PRESTASI</b>\n`;
      prestasi.forEach((prest, index) => {
        message += `┣ ${index + 1}. <b>${prest.nama_prestasi || "N/A"}</b>\n`;
        message += `┃   🎖 Tingkat: ${prest.tingkat || "N/A"}\n`;
        message += `┃   📅 Tahun: ${prest.tahun || "N/A"}\n`;
        message += `┃   📜 Sertifikat: ${
          prest.sertifikat_path ? "✅ Ada" : "❌ Tidak Ada"
        }\n`;
      });
      message += "\n";
    }

    // Divisions
    if (divisi && divisi.length > 0) {
      message += `🎯 <b>BIDANG PILIHAN</b>\n`;
      divisi.forEach((div, index) => {
        message += `${index + 1}. <b>${div.nama_divisi.toUpperCase()}</b>\n`;
      });
      message += "\n";
    }

    // Motivation
    if (user.motivasi) {
      message += `💭 <b>MOTIVASI BERGABUNG</b>\n`;
      const motivasiText = user.motivasi;
      const formattedMotivasi = await this._handleLongTextAsFile(
        motivasiText,
        `Motivasi-${user.ticket}`,
        mediaFiles
      );
      message += `${formattedMotivasi}\n\n`;
    }

    // Status and metadata
    message += `📊 <b>STATUS PENDAFTAR</b>\n`;
    message += `┣ 🎫 Tiket: <code>${user.ticket}</code>\n`;
    message += `┣ 📊 Status: ${statusIcon} <b>${statusText}</b>\n`;
    message += `┣ 📅 Terdaftar: ${this.formatDate(user.created_at)}\n`;

    if (user.updated_at && user.updated_at !== user.created_at) {
      message += `┣ 🔄 Diperbarui: ${this.formatDate(user.updated_at)}\n`;
    }
    message += `┗ 🖼 Foto & sertifikat dikirim terpisah\n\n`;

    // Admin actions (if needed)
    if (user.status === "PENDING") {
      message += `⚡ <b>AKSI ADMIN</b>\n`;
      message += `┣ ✅ <code>/terima ${user.ticket}</code>\n`;
      message += `┗ ❌ <code>/tolak ${user.ticket} [alasan]</code>`;
    }

    return message;
  }

  // EXCEL COMMAND - Export to Excel using excel-simple.js
  async handleExcelCommand(chatId) {
    try {
      console.log("📊 Generating Excel export...");

      // Import excel-simple module
      const { exportToExcel } = require("./excel-simple");

      const result = await exportToExcel();
      console.log("📊 Excel export result:", result);

      if (result && result.filePath && (await fs.pathExists(result.filePath))) {
        await this.bot.sendDocument(chatId, result.filePath, {
          caption: `📊 <b>EXPORT DATA OSIS</b>\n\n📅 Generated: ${this.formatDate(
            new Date()
          )}\n📁 File: ${result.fileName}\n📊 Records: ${
            result.totalRecords
          }\n💾 Size: ${result.fileSize}`,
          parse_mode: "HTML",
        });

        // Clean up file after sending
        setTimeout(async () => {
          try {
            await fs.remove(result.filePath);
            console.log(`🗑️ Cleaned up Excel file: ${result.filePath}`);
          } catch (error) {
            console.warn(
              `Warning: Could not clean up Excel file: ${error.message}`
            );
          }
        }, 60000); // Clean up after 1 minute
      } else {
        await this.bot.sendMessage(
          chatId,
          "❌ File Excel tidak ditemukan atau gagal dibuat."
        );
      }
    } catch (error) {
      console.error("Error generating Excel:", error);
      await this.bot.sendMessage(
        chatId,
        "❌ Terjadi kesalahan saat membuat file Excel."
      );
    }
  }

  // DELETE COMMAND - Delete a registrant
  async handleDeleteCommand(chatId, ticket) {
    try {
      console.log(`🗑️ Deleting ticket: ${ticket}`);

      const connection = await getConnection();
      try {
        // Check if user exists
        const [users] = await connection.execute(
          "SELECT * FROM users WHERE ticket = ?",
          [ticket.trim()]
        );

        if (users.length === 0) {
          await this.bot.sendMessage(
            chatId,
            `❌ <b>Tiket tidak ditemukan</b>\n\nTiket: <code>${ticket}</code>`,
            { parse_mode: "HTML" }
          );
          return;
        }

        const user = users[0];

        // Delete related records first
        await connection.execute("DELETE FROM organisasi WHERE user_id = ?", [
          user.id,
        ]);
        await connection.execute("DELETE FROM prestasi WHERE user_id = ?", [
          user.id,
        ]);
        await connection.execute("DELETE FROM divisi WHERE user_id = ?", [
          user.id,
        ]);

        // Delete main user record
        await connection.execute("DELETE FROM users WHERE ticket = ?", [
          ticket.trim(),
        ]);

        const deleteMessage = `
🗑️ <b>PENDAFTAR DIHAPUS</b>

👤 <b>Nama:</b> ${user.nama_lengkap}
🎫 <b>Tiket:</b> <code>${ticket}</code>
🏫 <b>Kelas:</b> ${user.kelas} - ${user.jurusan}
📅 <b>Dihapus:</b> ${this.formatDate(new Date())}

⚠️ Data pendaftar dan semua file terkait telah dihapus permanen.
        `.trim();

        await this.bot.sendMessage(chatId, deleteMessage, {
          parse_mode: "HTML",
        });
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error("Error deleting registrant:", error);
      await this.bot.sendMessage(
        chatId,
        "❌ Terjadi kesalahan saat menghapus pendaftar."
      );
    }
  }

  // LIST BACKUP COMMAND - List available backup files
  async handleListBackupCommand(chatId) {
    try {
      console.log("📁 Listing available backups...");

      await this.bot.sendMessage(
        chatId,
        "📁 <b>Mengambil daftar backup...</b>\n⏳ Harap tunggu...",
        { parse_mode: "HTML" }
      );

      const { backupManager } = require("./db-backup-fixed");
      const backups = await backupManager.listBackups();

      if (backups.length === 0) {
        await this.bot.sendMessage(
          chatId,
          "ℹ️ <b>Tidak ada file backup yang ditemukan.</b>",
          { parse_mode: "HTML" }
        );
        return;
      }

      let listMessage = `📁 <b>DAFTAR FILE BACKUP</b>\n\n`;
      backups.sort((a, b) => new Date(b.created) - new Date(a.created)); // Newest first

      backups.forEach((backup, index) => {
        listMessage += `${index + 1}. <b>${backup.name}</b>\n`;
        listMessage += `   📊 Ukuran: ${this.formatFileSize(backup.size)}\n`;
        listMessage += `   📅 Dibuat: ${backup.created}\n\n`;
      });

      listMessage += `💡 Gunakan <code>/deletebackup [nama_file.zip]</code> untuk menghapus.`;

      // Split message if too long
      if (listMessage.length > 4000) {
        const messages = this.splitMessage(listMessage, 4000);
        for (const msg of messages) {
          await this.bot.sendMessage(chatId, msg, { parse_mode: "HTML" });
          await this.delay(500);
        }
      } else {
        await this.bot.sendMessage(chatId, listMessage, {
          parse_mode: "HTML",
        });
      }
    } catch (error) {
      console.error("Error listing backups:", error);
      await this.bot.sendMessage(
        chatId,
        `❌ Terjadi kesalahan saat mengambil daftar backup:\n\n<code>${error.message}</code>`,
        { parse_mode: "HTML" }
      );
    }
  }

  // DELETE BACKUP COMMAND - Delete a specific backup file
  async handleDeleteBackupCommand(chatId, fileName) {
    try {
      console.log(`🗑️ Deleting backup file: ${fileName}`);

      await this.bot.sendMessage(
        chatId,
        `🗑️ <b>Memulai penghapusan file backup:</b> <code>${fileName}</code>\n⏳ Harap tunggu...`,
        { parse_mode: "HTML" }
      );

      const { backupManager } = require("./db-backup-fixed");
      const backups = await backupManager.listBackups();
      const targetBackup = backups.find((b) => b.name === fileName.trim());

      if (!targetBackup) {
        await this.bot.sendMessage(
          chatId,
          `❌ <b>File backup tidak ditemukan:</b> <code>${fileName}</code>\n\n` +
            `💡 Gunakan <code>/listbackup</code> untuk melihat daftar file yang tersedia.`,
          { parse_mode: "HTML" }
        );
        return;
      }

      const deleteResult = await backupManager.deleteBackupFile(
        targetBackup.path
      );

      if (deleteResult.success) {
        await this.bot.sendMessage(
          chatId,
          `✅ <b>File backup berhasil dihapus!</b>\n\n` +
            `📁 Nama File: <code>${fileName}</code>\n` +
            `📅 Dihapus: ${this.formatDate(new Date())}\n\n` +
            `⚠️ File backup tersebut telah dihapus permanen.`,
          { parse_mode: "HTML" }
        );
      } else {
        throw new Error(deleteResult.message);
      }
    } catch (error) {
      console.error("Error deleting backup file:", error);
      await this.bot.sendMessage(
        chatId,
        `❌ Terjadi kesalahan saat menghapus file backup:\n\n<code>${error.message}</code>`,
        { parse_mode: "HTML" }
      );
    }
  }

  // BACKUP COMMAND - Create database backup
  async handleBackupCommand(chatId) {
    try {
      console.log("💾 Creating database backup...");

      await this.bot.sendMessage(
        chatId,
        "💾 <b>Memulai backup database...</b>\n⏳ Harap tunggu...",
        { parse_mode: "HTML" }
      );

      // Import backup utility
      const { createDatabaseBackup } = require("./db-backup-fixed");

      const backupResult = await createDatabaseBackup();

      if (backupResult && backupResult.success) {
        // Check if a file path was actually generated (e.g., if there were users to backup)
        // The createDatabaseBackup now always returns filePath and fileName if successful
        const TELEGRAM_FILE_SIZE_LIMIT = 50 * 1024 * 1024; // 50 MB

        if (backupResult.size > TELEGRAM_FILE_SIZE_LIMIT) {
          await this.bot.sendMessage(
            chatId,
            `⚠️ <b>BACKUP DATABASE TERLALU BESAR</b>\n\n` +
              `📁 File backup (${this.formatFileSize(
                backupResult.size
              )}) melebihi batas ukuran file Telegram (50 MB).\n` +
              `Backup telah berhasil dibuat dan disimpan secara lokal di server.\n\n` +
              `<b>Detail Backup:</b>\n` +
              `┣ 📁 Nama File: <code>${backupResult.fileName}</code>\n` +
              `┣ 📊 Ukuran: ${this.formatFileSize(backupResult.size)}\n` +
              `┗ 📅 Dibuat: ${this.formatDate(backupResult.timestamp)}`,
            { parse_mode: "HTML" }
          );
        } else {
          // Send backup file (now a zip)
          await this.bot.sendDocument(chatId, backupResult.filePath, {
            caption: `💾 <b>FULL DATABASE & UPLOADS BACKUP BERHASIL</b>\n\n📁 File: ${
              backupResult.fileName
            }\n📊 Size: ${this.formatFileSize(
              backupResult.size
            )}\n📅 Created: ${this.formatDate(
              backupResult.timestamp
            )}\n\n⚠️ File backup berisi data sensitif (database dan semua unggahan). Simpan dengan aman!`,
            parse_mode: "HTML",
          });
        }

        // Clean up old backups
        setTimeout(async () => {
          try {
            const { backupManager } = require("./db-backup-fixed");
            await backupManager.cleanOldBackups(3); // Keep 3 recent backups
          } catch (error) {
            console.warn("⚠️ Could not clean old backups:", error.message);
          }
        }, 5000);
      } else {
        await this.bot.sendMessage(
          chatId,
          "❌ Gagal membuat backup database. Coba lagi nanti.",
          { parse_mode: "HTML" }
        );
      }
    } catch (error) {
      console.error("Error creating backup:", error);
      await this.bot.sendMessage(
        chatId,
        `❌ Terjadi kesalahan saat membuat backup database:\n\n<code>${error.message}</code>`,
        { parse_mode: "HTML" }
      );
    }
  }

  // Utility method to split long messages
  splitMessage(message, maxLength = 4000) {
    const messages = [];
    let current = "";
    const lines = message.split("\n");

    for (const line of lines) {
      // Check if adding this line would exceed the limit
      if ((current + line + "\n").length > maxLength && current.length > 0) {
        // Add current message to array and start a new one
        messages.push(current.trim());
        current = "";
      }
      current += line + "\n";
    }

    // Add the remaining content
    if (current.trim()) {
      messages.push(current.trim());
    }

    // Log split details for debugging
    console.log(`📄 Message split: ${messages.length} parts, original length: ${message.length}`);
    messages.forEach((msg, idx) => {
      console.log(`📄 Part ${idx + 1}: ${msg.length} characters`);
    });

    return messages;
  }

  formatUserStatus(user) {
    const statusIcon = this.getStatusIcon(user.status);
    const statusText = this.formatStatus(user.status);

    let message = `📊 <b>STATUS PENDAFTAR</b>\n\n`;
    message += `👤 <b>Nama:</b> ${user.nama_lengkap}\n`;
    message += `🎫 <b>Tiket:</b> <code>${user.ticket}</code>\n`;
    message += `📊 <b>Status:</b> ${statusIcon} ${statusText}\n`;
    message += `🏫 <b>Kelas:</b> ${user.kelas} - ${user.jurusan}\n`;
    message += `📅 <b>Daftar:</b> ${this.formatDate(user.created_at)}\n`;

    if (user.updated_at && user.updated_at !== user.created_at) {
      message += `🔄 <b>Update:</b> ${this.formatDate(user.updated_at)}\n`;
    }

    return message;
  }
}

// Create singleton instance
const botManager = new TelegramBotManager();

// Export functions for compatibility
function initTelegramBot() {
  botManager.initialize();
}

async function sendTelegramNotification(data) {
  return await botManager.sendRegistrationNotification(data);
}

module.exports = {
  initTelegramBot,
  sendTelegramNotification,
  botManager,
};

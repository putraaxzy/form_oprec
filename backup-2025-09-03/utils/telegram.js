// Telegram bot utilities - Refactored & Enhanced version
const TelegramBot = require("node-telegram-bot-api");
const path = require("path");
const fs = require("fs-extra");
const { getConnection } = require("../database/mysql-database");

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
      console.log("⚠️ Telegram bot token not found, skipping bot initialization");
      return;
    }

    try {
      this.bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
        polling: {
          interval: 1000,
          autoStart: true,
          params: { timeout: 10 }
        }
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
      console.log(`🔄 Retrying bot initialization... (${this.retryCount}/${this.maxRetries})`);
      setTimeout(() => this.initialize(), 5000);
    } else {
      console.error("❌ Max retry attempts reached. Bot initialization failed.");
    }
  }

  handlePollingError(error) {
    // Don't restart on certain errors
    const nonCriticalErrors = ['ETELEGRAM', 'ECONNRESET', 'ECONNREFUSED'];
    const isNonCritical = nonCriticalErrors.some(err => error.message.includes(err));
    
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

    try {
      console.log("📤 Preparing enhanced Telegram notification...");
      
      // Create message with improved formatting
      const message = this.createFormattedMessage(data);
      
      // Collect and validate media files with better error handling
      const mediaFiles = await this.collectAndValidateFiles(data);
      
      // Send notification with retry logic
      await this.sendWithRetry(message, mediaFiles, data);
      
      console.log("✅ Telegram notification sent successfully");
      return { success: true };
    } catch (error) {
      console.error("❌ Error sending telegram notification:", error.message);
      return { success: false, error: error.message };
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
          path.join(__dirname, "..", data.foto_path) // another fallback
        ];

        for (const photoPath of photoPaths) {
          if (await fs.pathExists(photoPath)) {
            const stats = await fs.stat(photoPath);
            mediaFiles.push({
              type: "photo",
              path: photoPath,
              caption: `📷 <b>Foto 3x4</b> - ${data.nama_lengkap}`,
              size: stats.size,
              isMain: true
            });
            console.log(`✅ Found photo: ${photoPath} (${this.formatFileSize(stats.size)})`);
            break;
          }
        }

        if (mediaFiles.length === 0) {
          console.warn(`⚠️ Photo not found: ${data.foto_path}`);
        }
      }

      // Organization certificates with improved handling
      await this.collectCertificates(
        data,
        'organisasi',
        baseUploadPath,
        mediaFiles,
        (org, index) => `📜 <b>Sertifikat Organisasi ${index + 1}</b> - ${org.nama || org.nama_organisasi || 'Organisasi'}`
      );

      // Achievement certificates with improved handling
      await this.collectCertificates(
        data,
        'prestasi',
        baseUploadPath,
        mediaFiles,
        (prestasi, index) => `🏆 <b>Sertifikat Prestasi ${index + 1}</b> - ${prestasi.nama || prestasi.nama_prestasi || 'Prestasi'}`
      );

      console.log(`📁 Collected ${mediaFiles.length} valid media files`);
      return mediaFiles;
    } catch (error) {
      console.error("❌ Error collecting media files:", error.message);
      return [];
    }
  }

  // Generic certificate collection method
  async collectCertificates(data, type, baseUploadPath, mediaFiles, getCaptionFn) {
    const typeKey = type === 'organisasi' ? 'organisasi' : 'prestasi';
    const sertifikatKey = `${type}_sertifikat`;
    const namaKey = `${type}_nama`;

    // Handle array of objects from database
    if (data[typeKey] && Array.isArray(data[typeKey])) {
      for (let i = 0; i < data[typeKey].length; i++) {
        const item = data[typeKey][i];
        const filename = item.sertifikat_path || item.sertifikat;
        if (filename) {
          await this.addCertificateFile(filename, baseUploadPath, mediaFiles, getCaptionFn(item, i));
        }
      }
    }
    
    // Handle array of filenames (from registration form)
    else if (data[sertifikatKey] && Array.isArray(data[sertifikatKey])) {
      for (let i = 0; i < data[sertifikatKey].length; i++) {
        const filename = data[sertifikatKey][i];
        if (filename) {
          const item = { 
            nama: data[namaKey] && data[namaKey][i] ? data[namaKey][i] : null 
          };
          await this.addCertificateFile(filename, baseUploadPath, mediaFiles, getCaptionFn(item, i));
        }
      }
    }
  }

  // Add certificate file with validation
  async addCertificateFile(filename, baseUploadPath, mediaFiles, caption) {
    const certPaths = [
      path.join(baseUploadPath, "certificates", filename),
      path.join(baseUploadPath, filename), // fallback
      path.join(__dirname, "..", filename) // another fallback
    ];

    for (const certPath of certPaths) {
      if (await fs.pathExists(certPath)) {
        const stats = await fs.stat(certPath);
        mediaFiles.push({
          type: "document",
          path: certPath,
          caption: caption,
          size: stats.size
        });
        console.log(`✅ Found certificate: ${certPath} (${this.formatFileSize(stats.size)})`);
        return;
      }
    }
    
    console.warn(`⚠️ Certificate not found: ${filename}`);
  }

  // Enhanced message formatting
  createFormattedMessage(data) {
    const year = new Date().getFullYear();
    const statusIcon = this.getStatusIcon(data.status || "PENDING");
    
    let message = `🎉 <b>PENDAFTAR BARU OSIS ${year}/${year + 1}</b>\n\n`;

    // Personal Information
    message += `👤 <b>IDENTITAS LENGKAP</b>\n`;
    message += `┣ 📝 Nama: <b>${data.nama_lengkap || 'N/A'}</b>\n`;
    message += `┣ 🏷 Panggilan: ${data.nama_panggilan || 'N/A'}\n`;
    message += `┣ 🏫 Kelas: ${data.kelas || 'N/A'} - ${data.jurusan || 'N/A'}\n`;
    
    // Format birth date properly
    const birthDate = data.tanggal_lahir ? 
      new Date(data.tanggal_lahir).toLocaleDateString("id-ID", {
        day: "numeric", month: "long", year: "numeric"
      }) : "N/A";
    message += `┣ 📍 TTL: ${data.tempat_lahir || 'N/A'}, ${birthDate}\n`;
    message += `┣ ⚧ Gender: ${data.jenis_kelamin || 'N/A'} | 🕌 ${data.agama || 'N/A'}\n`;
    message += `┣ 📱 HP: ${data.nomor_telepon ? `<code>${data.nomor_telepon}</code>` : 'N/A'}\n`;
    message += `┣ 🏠 Alamat: ${data.alamat || 'N/A'}\n`;
    message += `┣ 🎨 Hobi: ${data.hobi || 'N/A'}\n`;
    message += `┗ 💭 Motto: ${data.motto || 'N/A'}\n\n`;

    // Organization experience
    message += this.formatExperience(data, 'organisasi', '🏛 <b>PENGALAMAN ORGANISASI</b>');
    
    // Achievements
    message += this.formatExperience(data, 'prestasi', '🏆 <b>PRESTASI</b>');

    // Divisions and reasons
    if (data.divisi && Array.isArray(data.divisi) && data.divisi.length > 0) {
      message += `🎯 <b>BIDANG PILIHAN & ALASAN</b>\n`;
      data.divisi.forEach((div, index) => {
        const alasanField = `alasan_${div}`;
        message += `${index + 1}. <b>${div.toUpperCase()}</b>\n`;
        message += `   💬 ${data[alasanField] || 'N/A'}\n\n`;
      });
    }

    // Motivation
    message += `💭 <b>MOTIVASI BERGABUNG</b>\n`;
    message += `${data.motivasi || 'N/A'}\n\n`;

    // Status and metadata
    message += `📊 <b>STATUS:</b> ${statusIcon} ${this.formatStatus(data.status || 'PENDING')}\n`;
    message += `🎫 Tiket: <code>${data.ticket}</code>\n`;
    message += `📅 Terdaftar: ${this.formatDate(data.created_at || new Date())}\n\n`;

    // Quick actions
    message += `⚡ <b>AKSI CEPAT</b>\n`;
    message += `┣ ✅ <code>/terima ${data.ticket}</code>\n`;
    message += `┣ ❌ <code>/tolak ${data.ticket}</code>\n`;
    message += `┗ 📊 <code>/status ${data.ticket}</code>`;

    return message;
  }

  // Format experience (organization/achievement) with better structure
  formatExperience(data, type, title) {
    let result = '';
    const items = data[type];
    const namaKey = `${type}_nama`;
    const sertifikatKey = `${type}_sertifikat`;
    
    // Handle array of objects
    if (items && Array.isArray(items) && items.length > 0) {
      result += `${title}\n`;
      items.forEach((item, index) => {
        if (item.nama || item[`nama_${type}`]) {
          result += `┣ ${index + 1}. ${item.nama || item[`nama_${type}`]}\n`;
          if (type === 'organisasi') {
            result += `┃   📋 ${item.jabatan || 'N/A'} (${item.tahun || 'N/A'})\n`;
          } else {
            result += `┃   🎖 ${item.tingkat || 'N/A'} (${item.tahun || 'N/A'})\n`;
          }
          result += `┃   📜 Sertifikat: ${item.sertifikat_path ? 'Ada' : 'Tidak Ada'}\n`;
        }
      });
      result += '\n';
    }
    
    // Handle separate arrays (legacy format)
    else if (data[namaKey] && Array.isArray(data[namaKey]) && data[namaKey].length > 0) {
      const hasData = data[namaKey].some(nama => nama && nama.trim() !== '');
      if (hasData) {
        result += `${title}\n`;
        data[namaKey].forEach((nama, index) => {
          if (nama && nama.trim() !== '') {
            result += `┣ ${index + 1}. ${nama}\n`;
            if (type === 'organisasi') {
              result += `┃   📋 ${(data.organisasi_jabatan && data.organisasi_jabatan[index]) || 'N/A'} (${(data.organisasi_tahun && data.organisasi_tahun[index]) || 'N/A'})\n`;
            } else {
              result += `┃   🎖 ${(data.prestasi_tingkat && data.prestasi_tingkat[index]) || 'N/A'} (${(data.prestasi_tahun && data.prestasi_tahun[index]) || 'N/A'})\n`;
            }
            result += `┃   📜 Sertifikat: ${(data[sertifikatKey] && data[sertifikatKey][index]) ? 'Ada' : 'Tidak Ada'}\n`;
          }
        });
        result += '\n';
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
        console.error(`❌ Send attempt ${attempt}/${maxRetries} failed:`, error.message);
        
        if (attempt === maxRetries) {
          // Last attempt - try sending text only as fallback
          try {
            await this.sendTextMessage(message);
            console.log("✅ Fallback text message sent successfully");
          } catch (fallbackError) {
            console.error("❌ Fallback text message also failed:", fallbackError.message);
            throw new Error(`All send attempts failed. Last error: ${error.message}`);
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
    const CAPTION_LIMIT = 1024;
    
    const photos = [];
    const documents = [];
    
    // Categorize files by type and size
    for (const file of mediaFiles) {
      if (file.type === "photo") {
        if (file.size > PHOTO_MAX_SIZE) {
          console.warn(`⚠️ Photo too large (${this.formatFileSize(file.size)}), sending as document`);
          documents.push({
            ...file,
            type: "document",
            caption: file.caption.replace(/<\/?b>/g, "")
          });
        } else {
          photos.push(file);
        }
      } else {
        documents.push(file);
      }
    }

    let mainCaption = message;
    
    // Handle long messages
    if (mainCaption.length > CAPTION_LIMIT) {
      await this.sendTextMessage(mainCaption);
      mainCaption = `🎉 <b>PENDAFTAR BARU OSIS</b>\n\n📄 Data lengkap telah dikirim di pesan sebelumnya.\n📷 Foto & 📜 Sertifikat dari ${data.nama_lengkap}`;
    }

    // Send photos
    if (photos.length > 0) {
      await this.sendPhotos(photos, mainCaption, data);
      await this.delay(500);
    } else if (mainCaption.length <= CAPTION_LIMIT) {
      await this.sendTextMessage(mainCaption);
    }

    // Send documents
    if (documents.length > 0) {
      await this.sendDocuments(documents);
    }
  }

  // Send photos with proper media group handling
  async sendPhotos(photos, caption, data) {
    if (photos.length === 1) {
      await this.bot.sendPhoto(process.env.TELEGRAM_CHAT_ID, photos[0].path, {
        caption: caption,
        parse_mode: "HTML"
      });
    } else {
      const mediaGroup = photos.map((photo, index) => ({
        type: "photo",
        media: photos[0].path,
        caption: index === 0 ? caption : `📷 Foto ${index + 1} - ${data.nama_lengkap}`,
        parse_mode: "HTML"
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
          parse_mode: "HTML"
        });
        console.log(`✅ Document ${i + 1}/${documents.length} sent: ${path.basename(doc.path)}`);
      } catch (error) {
        console.error(`❌ Failed to send document ${path.basename(doc.path)}:`, error.message);
        
        // Try without caption as fallback
        try {
          await this.bot.sendDocument(process.env.TELEGRAM_CHAT_ID, doc.path);
          console.log(`✅ Document sent without caption: ${path.basename(doc.path)}`);
        } catch (fallbackError) {
          console.error(`❌ Complete failure for document: ${path.basename(doc.path)}`);
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
      parse_mode: "HTML"
    });
    console.log("✅ Text message sent");
  }

  // Utility methods
  formatFileSize(bytes) {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round(bytes / Math.pow(1024, i) * 100) / 100} ${sizes[i]}`;
  }

  getStatusIcon(status) {
    const icons = {
      'PENDING': '⏳',
      'LOLOS': '✅', 
      'DITOLAK': '❌',
      'PENDING_BOT_APPROVAL': '🔄'
    };
    return icons[status] || '❓';
  }

  formatStatus(status) {
    const statuses = {
      'PENDING': 'Menunggu Review',
      'LOLOS': 'Diterima',
      'DITOLAK': 'Ditolak', 
      'PENDING_BOT_APPROVAL': 'Menunggu Persetujuan Bot'
    };
    return statuses[status] || status;
  }

  formatDate(date) {
    return new Date(date).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long", 
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Enhanced command setup
  setupCommands() {
    if (!this.bot) return;
    
    console.log("🛠️ Setting up enhanced bot commands...");
    
    // Welcome command
    this.bot.onText(/\/start/, (msg) => {
      const welcomeMessage = `
🎭 <b>BOT OSIS RECRUITMENT ${new Date().getFullYear()}/${new Date().getFullYear() + 1}</b>

👋 Halo ${msg.from.first_name}! Selamat datang di sistem rekrutmen OSIS otomatis.

<b>🔧 PERINTAH UMUM:</b>
┣ 📋 /help - Panduan lengkap
┣ 🔍 /status [tiket] - Cek status pendaftar
┣ 📊 /stats - Statistik pendaftaran
┣ 📝 /recent - Pendaftar terbaru
┣ 🔍 /search [kata kunci] - Cari pendaftar
┗ 📄 /detail [tiket] - Info lengkap & foto

<b>⚙️ PERINTAH ADMIN:</b>
┣ 📋 /list - Lihat semua pendaftar
┣ ✅ /terima [tiket] [divisi] - Terima pendaftar
┣ ❌ /tolak [tiket] [alasan] - Tolak pendaftar
┣ 📊 /excel - Export data ke Excel
┗ 🗑 /hapus [tiket] - Hapus pendaftar

Ketik /help untuk panduan lengkap penggunaan.
      `.trim();

      this.bot.sendMessage(msg.chat.id, welcomeMessage, { parse_mode: "HTML" });
    });

    // Help command with detailed instructions
    this.bot.onText(/\/help/, (msg) => {
      // Implementation for help command
      this.sendHelpMessage(msg.chat.id);
    });

    // Status check command
    this.bot.onText(/\/status (.+)/, async (msg, match) => {
      // Implementation for status check
      await this.handleStatusCommand(msg.chat.id, match[1]);
    });

    // Stats command  
    this.bot.onText(/\/stats/, async (msg) => {
      // Implementation for stats
      await this.handleStatsCommand(msg.chat.id);
    });

    // Other commands...
    // Add more command handlers as needed
  }

  // Command handlers
  async sendHelpMessage(chatId) {
    const helpMessage = `
📚 <b>PANDUAN LENGKAP BOT OSIS</b>

<b>🎯 CARA MENGGUNAKAN:</b>

<b>1. CEK STATUS PENDAFTAR</b>
<code>/status OSIS24-123456-A</code>
→ Menampilkan status dan detail pendaftar

<b>2. CARI PENDAFTAR</b>
<code>/search John</code>
→ Mencari pendaftar berdasarkan nama

<b>3. LIHAT STATISTIK</b>
<code>/stats</code>
→ Menampilkan ringkasan pendaftaran

<b>4. TERIMA PENDAFTAR (Admin)</b>
<code>/terima OSIS24-123456-A Humas</code>
→ Menerima pendaftar ke divisi tertentu

<b>5. TOLAK PENDAFTAR (Admin)</b>
<code>/tolak OSIS24-123456-A Tidak memenuhi syarat</code>
→ Menolak pendaftar dengan alasan

<b>📝 TIPS:</b>
• Gunakan nomor tiket lengkap untuk akurasi
• Perintah admin hanya bisa dijalankan oleh admin
• Bot akan memberikan notifikasi real-time

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
          'SELECT * FROM users WHERE ticket = ?',
          [ticket.trim()]
        );

        if (users.length === 0) {
          await this.bot.sendMessage(chatId, 
            `❌ <b>Tiket tidak ditemukan</b>\n\nTiket: <code>${ticket}</code>\n\nPastikan nomor tiket benar dan sudah terdaftar.`,
            { parse_mode: "HTML" }
          );
          return;
        }

        const user = users[0];
        const statusMessage = this.formatUserStatus(user);
        await this.bot.sendMessage(chatId, statusMessage, { parse_mode: "HTML" });

      } finally {
        connection.release();
      }
    } catch (error) {
      console.error('Error handling status command:', error);
      await this.bot.sendMessage(chatId, '❌ Terjadi kesalahan saat mengecek status.');
    }
  }

  async handleStatsCommand(chatId) {
    try {
      console.log('📊 Generating stats...');
      
      const connection = await getConnection();
      try {
        // Get various statistics
        const [totalCount] = await connection.execute('SELECT COUNT(*) as total FROM users');
        const [statusCounts] = await connection.execute(
          'SELECT status, COUNT(*) as count FROM users GROUP BY status'
        );
        const [todayCount] = await connection.execute(
          'SELECT COUNT(*) as today FROM users WHERE DATE(created_at) = CURDATE()'
        );

        let statsMessage = `📊 <b>STATISTIK REKRUTMEN OSIS</b>\n\n`;
        statsMessage += `📈 <b>TOTAL PENDAFTAR:</b> ${totalCount[0].total}\n`;
        statsMessage += `📅 <b>HARI INI:</b> ${todayCount[0].today}\n\n`;
        
        statsMessage += `📋 <b>BERDASARKAN STATUS:</b>\n`;
        statusCounts.forEach(stat => {
          const icon = this.getStatusIcon(stat.status);
          statsMessage += `${icon} ${this.formatStatus(stat.status)}: ${stat.count}\n`;
        });

        // Calculate acceptance rate
        const lolos = statusCounts.find(s => s.status === 'LOLOS')?.count || 0;
        const ditolak = statusCounts.find(s => s.status === 'DITOLAK')?.count || 0;
        const processed = lolos + ditolak;
        
        if (processed > 0) {
          const rate = Math.round((lolos / processed) * 100);
          statsMessage += `\n💯 <b>TINGKAT PENERIMAAN:</b> ${rate}%`;
        }

        await this.bot.sendMessage(chatId, statsMessage, { parse_mode: "HTML" });

      } finally {
        connection.release();
      }
    } catch (error) {
      console.error('Error generating stats:', error);
      await this.bot.sendMessage(chatId, '❌ Terjadi kesalahan saat mengambil statistik.');
    }
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
  botManager
};

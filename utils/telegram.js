// Telegram bot utilities - Enhanced version
let bot = null;

const path = require("path");
const fs = require("fs"); // Re-add fs for other uses in the file
const { setupEnhancedCommands } = require("./bot-commands");

// Storage untuk data sementara yang belum di-push
let pendingApprovals = new Map(); // ticket -> { user_data, approved_at }

function initTelegramBot() {
  try {
    if (process.env.TELEGRAM_BOT_TOKEN) {
      const TelegramBot = require("node-telegram-bot-api");
      bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { 
        polling: {
          interval: 1000,
          autoStart: true,
          params: {
            timeout: 10
          }
        }
      });
      console.log("🤖 Telegram bot initialized with polling");

      // Add error handling for polling
      bot.on('polling_error', (error) => {
        console.error('❌ Telegram polling error:', error.message || error);
        // Don't restart automatically, just log the error
      });

      // Setup bot commands
      setupBotCommands();
    } else {
      console.log(
        "⚠️ Telegram bot token not found, skipping bot initialization"
      );
    }
  } catch (error) {
    console.error("❌ Error initializing Telegram bot:", error);
  }
}

function sendTelegramNotification(data) {
  return new Promise(async (resolve, reject) => {
    if (!bot || !process.env.TELEGRAM_CHAT_ID) {
      console.log("⚠️ Telegram bot or chat ID not configured");
      resolve();
      return;
    }

    try {
      console.log("📤 Preparing Telegram notification...");

      // Create comprehensive message
      const message = createRegistrationMessage(data);

      // Collect all media files
      const mediaFiles = collectMediaFiles(data);

      // Send notification based on available media
      if (mediaFiles.length > 0) {
        await sendMedia(message, mediaFiles, data);
      } else {
        await sendTextOnly(message);
      }

      console.log("✅ Telegram notification sent successfully");
      resolve();
    } catch (error) {
      console.error("❌ Error sending telegram notification:", error);
      resolve(); // Don't reject to avoid breaking registration
    }
  });
}

function createRegistrationMessage(data) {
  let message = `🎉 <b>PENDAFTAR BARU OSIS 2025/2026</b>\n\n`;

  // Personal Info Section - Simplified
  message += `👤 <b>IDENTITAS</b>\n`;
  message += `┣ 📝 Nama: <b>${data.nama_lengkap}</b>\n`;
  message += `┣ 🏫 Kelas: ${data.kelas || "➖"} - ${data.jurusan || "➖"}\n`;
  message += `┣ 📍 TTL: ${data.tempat_lahir || "➖"}, ${
    data.tanggal_lahir || "➖"
  }\n`;
  message += `┣ ⚧ ${data.jenis_kelamin || "➖"} | 🕌 ${data.agama || "➖"}\n`;
  message += `┗ 📱 <code>${data.nomor_telepon}</code>\n\n`;

  // Experience Section - Simplified
  if (data.organisasi_nama && data.organisasi_nama[0]) {
    message += `🏛️ Organisasi: <b>${data.organisasi_nama[0]}</b>\n`;
  }
  if (data.prestasi_nama && data.prestasi_nama[0]) {
    message += `🏆 Prestasi: <b>${data.prestasi_nama[0]}</b>\n`;
  }

  // Application Details
  message += `🎯 Divisi: <b>${
    Array.isArray(data.divisi) ? data.divisi.join(", ") : data.divisi
  }</b>\n`;
  message += `� Motivasi: ${formatMotivation(data.motivasi)}\n\n`;

  // Action Section
  message += `🎫 <b>TIKET: <code>${data.ticket}</code></b>\n\n`;
  message += `⚡ <b>AKSI CEPAT</b>\n`;
  message += `┣ ✅ <code>/terima ${data.ticket}</code>\n`;
  message += `┣ ❌ <code>/tolak ${data.ticket}</code>\n`;
  message += `┗ 📊 <code>/status ${data.ticket}</code>`;

  return message;
}

function formatMotivation(motivasi) {
  if (!motivasi) return "➖";
  if (motivasi.length <= 50) return motivasi;
  return motivasi.substring(0, 50) + "...";
}

function collectMediaFiles(data) {
  const mediaFiles = [];

  // Main photo (foto 3x4)
  if (data.foto_path) {
    const photoPath = path.join(
      __dirname,
      "..",
      "uploads",
      "photos",
      data.foto_path
    );
    if (fs.existsSync(photoPath)) {
      mediaFiles.push({
        type: "photo",
        path: photoPath,
        caption: `📷 <b>Foto 3x4</b> - ${data.nama_lengkap}`,
        isMain: true,
      });
    }
  }

  // Organization certificates
  if (data.organisasi_sertifikat && Array.isArray(data.organisasi_sertifikat)) {
    data.organisasi_sertifikat.forEach((filename, index) => {
      const certPath = path.join(
        __dirname,
        "..",
        "uploads",
        "certificates",
        filename
      );
      if (fs.existsSync(certPath)) {
        mediaFiles.push({
          type: "document",
          path: certPath,
          caption: `📜 <b>Sertifikat Organisasi ${index + 1}</b> - ${
            data.organisasi_nama || "Organisasi"
          }`,
        });
      }
    });
  }

  // Achievement certificates
  if (data.prestasi_sertifikat && Array.isArray(data.prestasi_sertifikat)) {
    data.prestasi_sertifikat.forEach((filename, index) => {
      const certPath = path.join(
        __dirname,
        "..",
        "uploads",
        "certificates",
        filename
      );
      if (fs.existsSync(certPath)) {
        mediaFiles.push({
          type: "document",
          path: certPath,
          caption: `🏆 <b>Sertifikat Prestasi ${index + 1}</b> - ${
            data.prestasi_nama || "Prestasi"
          }`,
        });
      }
    });
  }

  console.log(`📁 Found ${mediaFiles.length} media files to send`);
  return mediaFiles;
}

async function sendMedia(message, mediaFiles, data) {
  const photos = mediaFiles.filter((file) => file.type === "photo");
  const documents = mediaFiles.filter((file) => file.type === "document");

  try {
    let mainMessageSent = false;

    // 1. Send photos as a media group if they exist
    if (photos.length > 0) {
      const photoGroup = photos.map((photo, index) => {
        const mediaItem = {
          type: "photo",
          media: photo.path,
        };
        // Attach the main message to the first photo's caption
        if (index === 0) {
          mediaItem.caption = `${message}\n\n━━━━━━━━━━━━━━━━━━━━\n${photo.caption}`;
          mediaItem.parse_mode = "HTML";
        } else {
          mediaItem.caption = `${photo.caption}\n🎫 Tiket: <code>${data.ticket}</code>`;
          mediaItem.parse_mode = "HTML";
        }
        return mediaItem;
      });

      console.log(
        `📨 Sending photo media group with ${photoGroup.length} items...`
      );
      await bot.sendMediaGroup(process.env.TELEGRAM_CHAT_ID, photoGroup);
      mainMessageSent = true;
      console.log("✅ Photo media group sent successfully");
    }

    // 2. If no photos were sent, send the main text message first
    if (!mainMessageSent) {
      await sendTextOnly(message);
    }

    // 3. Send documents individually
    if (documents.length > 0) {
      console.log(`📨 Sending ${documents.length} documents individually...`);
      for (const doc of documents) {
        await bot.sendDocument(process.env.TELEGRAM_CHAT_ID, doc.path, {
          caption: `${doc.caption}\n🎫 Tiket: <code>${data.ticket}</code>`,
          parse_mode: "HTML",
        });
        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      console.log("✅ Documents sent successfully");
    }
  } catch (error) {
    console.error("❌ Error sending media:", error);
    // Fallback to sending everything individually if any part fails
    console.log("🔄 Falling back to full individual file sending...");
    await sendMediaIndividually(message, mediaFiles, data);
  }
}

async function sendMediaIndividually(message, mediaFiles, data) {
  try {
    let mainMessageSent = false;

    for (const file of mediaFiles) {
      if (file.type === "photo") {
        const caption = mainMessageSent
          ? `${file.caption}\n🎫 Tiket: <code>${data.ticket}</code>`
          : `${message}\n\n━━━━━━━━━━━━━━━━━━━━\n${file.caption}`;

        await bot.sendPhoto(process.env.TELEGRAM_CHAT_ID, file.path, {
          caption: caption,
          parse_mode: "HTML",
        });
        mainMessageSent = true;
      } else if (file.type === "document") {
        await bot.sendDocument(process.env.TELEGRAM_CHAT_ID, file.path, {
          caption: `${file.caption}\n🎫 Tiket: <code>${data.ticket}</code>`,
          parse_mode: "HTML",
        });
      }

      // Small delay between sends to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    // If no main message was sent (no photo), send text message
    if (!mainMessageSent) {
      await sendTextOnly(message);
    }
  } catch (error) {
    console.error("❌ Error sending individual media:", error);
    // Final fallback: just send text
    await sendTextOnly(message);
  }
}

async function sendTextOnly(message) {
  try {
    console.log("📝 Sending text-only message...");
    await bot.sendMessage(process.env.TELEGRAM_CHAT_ID, message, {
      parse_mode: "HTML",
    });
    console.log("✅ Text message sent successfully");
  } catch (error) {
    console.error("❌ Error sending text message:", error);
  }
}

function setupBotCommands() {
  if (!bot) return;

  console.log("🛠️ Setting up bot commands...");

  // Enhanced /start command
  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const welcomeMessage = `
🎭 <b>BOT OSIS RECRUITMENT 2025/2026</b>

👋 Halo ${
      msg.from.first_name
    }! Selamat datang di sistem rekrutmen OSIS otomatis.

<b>🔧 PERINTAH UMUM:</b>
┣ 📋 /help - Panduan lengkap
┣ 🔍 /status [tiket] - Cek status pendaftar
┣ 📊 /total - Statistik pendaftar hari ini
┣ 📝 /list - 5 pendaftar terbaru
┣ 🔍 /search [kata kunci] - Cari pendaftar
┗ 📄 /detail [tiket] - Info lengkap & foto

<b>⚙️ PERINTAH ADMIN:</b>
┣ ✅ /terima [tiket] [divisi] - Setujui (pending)
┣ ❌ /tolak [tiket] [alasan] - Tolak pendaftar
┣ 🗑️ /hapus [tiket] - Hapus permanen
┣ 📤 /push - Push semua pending ke DB
┣ 📊 /excel - Export data Excel
┣ 📈 /stats - Statistik rekrutmen
┣ 📋 /divisi - Stats per divisi
┣ 🏫 /kelas - Stats per kelas
┣ 🎓 /jurusan - Stats per jurusan
┗ 📅 /trends - Tren pendaftaran

🤖 Bot akan otomatis memberitahu saat ada pendaftar baru dengan media terlampir!
`;
    bot.sendMessage(chatId, welcomeMessage, { parse_mode: "HTML" });
  });

  // Enhanced /help command
  bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    const helpMessage = `
📚 <b>PANDUAN BOT OSIS</b>

<b>🔧 PERINTAH PUBLIK:</b>
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┃ /start - Mulai bot dan lihat menu utama
┃ /help - Tampilkan panduan ini
┃ /status [tiket] - Cek status pendaftaran
┃ /total - Statistik pendaftar hari ini
┃ /list - Daftar 5 pendaftar terakhir
┃ /search [kata kunci] - Cari pendaftar by nama/kelas/jurusan/divisi
┃ /detail [tiket] - Info lengkap pendaftar dengan foto & sertifikat
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

<b>⚙️ PERINTAH ADMIN (GRUP ONLY):</b>
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┃ /terima [tiket] [divisi] - Setujui pendaftar (masuk pending)
┃ /tolak [tiket] [alasan] - Tolak dengan alasan
┃ /hapus [tiket] - Hapus pendaftar permanen
┃ /push - Push semua pending approval ke database
┃ /excel - Export data lengkap ke Excel
┃ /stats - Statistik rekrutmen keseluruhan
┃ /divisi - Statistik per divisi
┃ /kelas - Statistik per kelas
┃ /jurusan - Statistik per jurusan
┃ /trends - Tren pendaftaran bulanan
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

<b>💡 CONTOH PENGGUNAAN:</b>
• <code>/status OSR240901001</code>
• <code>/search Desta</code> atau <code>/search XI RPL</code>
• <code>/detail OSR240901001</code>
• <code>/terima OSR240901001</code> atau <code>/terima OSR240901001 Sekretaris</code>
• <code>/tolak OSR240901001 Data tidak lengkap</code>
• <code>/hapus OSR240901001</code>
• <code>/push</code> (push semua pending)
• <code>/excel</code> (export data)
• <code>/stats</code> (lihat statistik)

<b>🚀 FITUR OTOMATIS:</b>
┣ 📸 Album media tergabung (foto + sertifikat)
┣ 🔔 Notifikasi real-time pendaftar baru
┣ 📊 Tracking status approval/rejection
┗ 🎫 Sistem tiket terintegrasi

<i>💬 Bot ini dikelola otomatis untuk efisiensi maksimal!</i>
`;
    bot.sendMessage(chatId, helpMessage, { parse_mode: "HTML" });
  });

  // Enhanced /status command
  bot.onText(/\/status\s+(\S+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const ticket = match[1].trim().toUpperCase();

    try {
      const user = await getUserByTicket(ticket);

      if (user) {
        const statusIcon = getStatusIcon(user.status);
        const statusMessage = `
📊 <b>STATUS PENDAFTAR</b>

🎫 <b>Tiket:</b> <code>${user.ticket}</code>
${statusIcon} <b>Status:</b> ${formatStatus(user.status)}

👤 <b>DATA PENDAFTAR:</b>
┣ 📝 Nama: <b>${user.nama_lengkap}</b>
┣ 📱 HP: <code>${user.nomor_telepon}</code>
┣ 🎯 Divisi: <b>${user.divisi || "➖"}</b>
┣ 📅 Daftar: ${formatDate(user.created_at)}
┗ 🔄 Update: ${formatDate(user.updated_at)}

${getStatusAdvice(user.status)}
`;
        bot.sendMessage(chatId, statusMessage, { parse_mode: "HTML" });
      } else {
        bot.sendMessage(
          chatId,
          `❌ <b>Tiket tidak ditemukan!</b>\n\n🔍 Tiket: <code>${ticket}</code>\n\n💡 Pastikan nomor tiket benar dan lengkap.`
        );
      }
    } catch (error) {
      console.error("❌ Error checking status:", error);
      bot.sendMessage(
        chatId,
        "⚠️ <b>Sistem sedang maintenance</b>\n\nSilakan coba lagi dalam beberapa saat.",
        { parse_mode: "HTML" }
      );
    }
  });

  // Enhanced /total command
  bot.onText(/\/total/, async (msg) => {
    const chatId = msg.chat.id;

    try {
      const stats = await getTodayStats();
      const totalMessage = `
📈 <b>STATISTIK PENDAFTAR HARI INI</b>

📅 <b>Tanggal:</b> ${new Date().toLocaleDateString("id-ID", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })}

📊 <b>RINGKASAN:</b>
┣ 👥 Total Pendaftar: <b>${stats.total}</b>
┣ ✅ Diterima: <b>${stats.approved}</b>
┣ ❌ Ditolak: <b>${stats.rejected}</b>
┗ ⏳ Pending: <b>${stats.pending}</b>

📈 <b>PROGRESS:</b>
${createProgressBar(stats.total, 50)} ${stats.total}/50

${
  stats.total >= 50
    ? "🎯 <b>Target harian tercapai!</b>"
    : "💪 <b>Terus semangat!</b>"
}
`;
      bot.sendMessage(chatId, totalMessage, { parse_mode: "HTML" });
    } catch (error) {
      console.error("❌ Error getting total:", error);
      bot.sendMessage(chatId, "⚠️ Tidak dapat mengambil statistik saat ini.", {
        parse_mode: "HTML",
      });
    }
  });

  // Enhanced /list command
  bot.onText(/\/list/, async (msg) => {
    const chatId = msg.chat.id;

    try {
      const users = await getRecentUsers(5);

      if (users.length > 0) {
        let listMessage = `📋 <b>5 PENDAFTAR TERAKHIR</b>\n\n`;

        users.forEach((user, index) => {
          const time = new Date(user.created_at).toLocaleTimeString("id-ID", {
            hour: "2-digit",
            minute: "2-digit",
          });
          const statusIcon = getStatusIcon(user.status);

          listMessage += `${index + 1}️⃣ <b>${user.nama_lengkap}</b>\n`;
          listMessage += `   🎫 <code>${user.ticket}</code>\n`;
          listMessage += `   ⏰ ${time} | ${statusIcon} ${formatStatus(
            user.status
          )}\n`;
          listMessage += `   📱 ${user.nomor_telepon}\n`;
          listMessage += `   🎯 ${user.divisi || "➖"}\n\n`;
        });

        listMessage += `💡 <i>Gunakan /status [tiket] untuk detail lengkap</i>`;
        bot.sendMessage(chatId, listMessage, { parse_mode: "HTML" });
      } else {
        bot.sendMessage(
          chatId,
          "📝 <b>Belum ada pendaftar hari ini</b>\n\n🕐 Sistem menunggu pendaftar baru...",
          { parse_mode: "HTML" }
        );
      }
    } catch (error) {
      console.error("❌ Error getting list:", error);
      bot.sendMessage(chatId, "⚠️ Tidak dapat mengambil daftar pendaftar.", {
        parse_mode: "HTML",
      });
    }
  });

  // Enhanced /terima command - Modified to accept divisi and auto-push after first push
  bot.onText(/\/terima\s+(\S+)(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const ticket = match[1].trim().toUpperCase();
    const divisiTerpilih = match[2] ? match[2].trim() : null;

    if (!isAdminChat(chatId)) {
      bot.sendMessage(
        chatId,
        "❌ <b>Akses Ditolak</b>\n\nPerintah ini hanya untuk admin di grup resmi.",
        { parse_mode: "HTML" }
      );
      return;
    }

    try {
      // Get user data but don't update status yet
      const user = await getUserByTicket(ticket);

      if (!user) {
        bot.sendMessage(
          chatId,
          `❌ <b>Tiket tidak ditemukan!</b>\n\n🔍 Tiket: <code>${ticket}</code>`,
          { parse_mode: "HTML" }
        );
        return;
      }

      // Check if this is after first push (auto-push mode)
      if (user.status === "approved" || user.status === "rejected") {
        // Direct update to database (auto-push)
        const result = await updateTicketStatusWithDivisi(
          ticket,
          "approved",
          divisiTerpilih
        );

        const autoApprovalMessage = `
✅ <b>AUTO-PUSH APPROVAL</b>

🎫 <b>Tiket:</b> <code>${ticket}</code>
👤 <b>Nama:</b> ${user.nama_lengkap}
📱 <b>HP:</b> <code>${user.nomor_telepon}</code>
🎯 <b>Divisi:</b> ${divisiTerpilih || user.divisi || "➖"}
📋 <b>Status:</b> <b>✅ DITERIMA (AUTO-PUSH)</b>
👤 <b>Disetujui:</b> ${msg.from.first_name}
⏰ <b>Waktu:</b> ${new Date().toLocaleString("id-ID")}

⚡ <i>Langsung diproses ke database karena sudah pernah di-push!</i>
`;
        bot.sendMessage(chatId, autoApprovalMessage, { parse_mode: "HTML" });
        return;
      }

      // Check if already in pending
      if (pendingApprovals.has(ticket)) {
        // Update divisi in pending
        const pendingData = pendingApprovals.get(ticket);
        if (divisiTerpilih) {
          pendingData.divisi_terpilih = divisiTerpilih;
          pendingApprovals.set(ticket, pendingData);
        }

        bot.sendMessage(
          chatId,
          `⚠️ <b>UPDATE PENDING</b>\n\n🎫 Tiket: <code>${ticket}</code>\n👤 Nama: <b>${
            user.nama_lengkap
          }</b>\n🎯 Divisi: <b>${
            divisiTerpilih || "Sesuai pilihan siswa"
          }</b>\n\n💡 Gunakan /push untuk memproses semua pending approval.`,
          { parse_mode: "HTML" }
        );
        return;
      }

      // Add to pending approvals
      pendingApprovals.set(ticket, {
        user_data: user,
        approved_at: new Date(),
        approved_by: msg.from.first_name,
        divisi_terpilih: divisiTerpilih,
      });

      const pendingMessage = `
📝 <b>DITAMBAHKAN KE PENDING</b>

🎫 <b>Tiket:</b> <code>${ticket}</code>
👤 <b>Nama:</b> ${user.nama_lengkap}
📱 <b>HP:</b> <code>${user.nomor_telepon}</code>
🎯 <b>Divisi:</b> ${divisiTerpilih || user.divisi || "➖"}
📋 <b>Status:</b> <b>📝 PENDING APPROVAL</b>
👤 <b>Disetujui:</b> ${msg.from.first_name}
⏰ <b>Waktu:</b> ${new Date().toLocaleString("id-ID")}

📊 <b>Total Pending:</b> ${pendingApprovals.size}

💡 <i>Gunakan /push untuk memproses semua pending approval ke database!</i>
`;
      bot.sendMessage(chatId, pendingMessage, { parse_mode: "HTML" });
    } catch (error) {
      console.error("❌ Error processing terima:", error);
      bot.sendMessage(
        chatId,
        "⚠️ <b>Gagal memproses approval</b>\n\nSilakan coba lagi.",
        { parse_mode: "HTML" }
      );
    }
  });

  // Enhanced /tolak command - Auto-push after first push
  bot.onText(/\/tolak\s+(\S+)(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const ticket = match[1].trim().toUpperCase();
    const alasan = match[2]?.trim() || "Tidak memenuhi persyaratan";

    if (!isAdminChat(chatId)) {
      bot.sendMessage(
        chatId,
        "❌ <b>Akses Ditolak</b>\n\nPerintah ini hanya untuk admin di grup resmi.",
        { parse_mode: "HTML" }
      );
      return;
    }

    try {
      // Check if user exists first
      const user = await getUserByTicket(ticket);

      if (!user) {
        bot.sendMessage(
          chatId,
          `❌ <b>Tiket tidak ditemukan!</b>\n\n🔍 Tiket: <code>${ticket}</code>`,
          { parse_mode: "HTML" }
        );
        return;
      }

      // Remove from pending if exists
      if (pendingApprovals.has(ticket)) {
        pendingApprovals.delete(ticket);
      }

      // Always direct to database (auto-push for rejection)
      const result = await updateTicketStatus(ticket, "rejected");

      if (result.success) {
        const rejectionMessage = `
❌ <b>TIKET DITOLAK</b>

🎫 <b>Tiket:</b> <code>${ticket}</code>
👤 <b>Nama:</b> ${result.user.nama_lengkap}
📱 <b>HP:</b> <code>${result.user.nomor_telepon}</code>
🎯 <b>Divisi:</b> ${result.user.divisi || "➖"}
📋 <b>Status:</b> <b>❌ DITOLAK</b>
📝 <b>Alasan:</b> ${alasan}
👤 <b>Ditolak:</b> ${msg.from.first_name}
⏰ <b>Waktu:</b> ${new Date().toLocaleString("id-ID")}

💔 <i>Pendaftar dapat mendaftar ulang dengan perbaikan.</i>
`;
        bot.sendMessage(chatId, rejectionMessage, { parse_mode: "HTML" });
      }
    } catch (error) {
      console.error("❌ Error rejecting ticket:", error);
      bot.sendMessage(
        chatId,
        "⚠️ <b>Gagal memproses penolakan</b>\n\nSilakan coba lagi.",
        { parse_mode: "HTML" }
      );
    }
  });

  // New /hapus command - Delete applicant completely
  bot.onText(/\/hapus\s+(\S+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const ticket = match[1].trim().toUpperCase();

    if (!isAdminChat(chatId)) {
      bot.sendMessage(
        chatId,
        "❌ <b>Akses Ditolak</b>\n\nPerintah ini hanya untuk admin di grup resmi.",
        { parse_mode: "HTML" }
      );
      return;
    }

    try {
      // Get user data first for confirmation message
      const user = await getUserByTicket(ticket);

      if (!user) {
        bot.sendMessage(
          chatId,
          `❌ <b>Tiket tidak ditemukan!</b>\n\n🔍 Tiket: <code>${ticket}</code>`,
          { parse_mode: "HTML" }
        );
        return;
      }

      // Remove from pending if exists
      if (pendingApprovals.has(ticket)) {
        pendingApprovals.delete(ticket);
      }

      // Delete from database completely
      const result = await deleteApplicant(ticket);

      if (result.success) {
        const deleteMessage = `
🗑️ <b>PENDAFTAR DIHAPUS</b>

🎫 <b>Tiket:</b> <code>${ticket}</code>
👤 <b>Nama:</b> ${user.nama_lengkap}
📱 <b>HP:</b> <code>${user.nomor_telepon}</code>
🎯 <b>Divisi:</b> ${user.divisi || "➖"}
📋 <b>Status:</b> <b>🗑️ DIHAPUS PERMANEN</b>
👤 <b>Dihapus oleh:</b> ${msg.from.first_name}
⏰ <b>Waktu:</b> ${new Date().toLocaleString("id-ID")}

⚠️ <i>Data pendaftar telah dihapus permanen dari sistem!</i>
`;
        bot.sendMessage(chatId, deleteMessage, { parse_mode: "HTML" });
      } else {
        bot.sendMessage(
          chatId,
          "⚠️ <b>Gagal menghapus pendaftar</b>\n\nSilakan coba lagi.",
          { parse_mode: "HTML" }
        );
      }
    } catch (error) {
      console.error("❌ Error deleting applicant:", error);
      bot.sendMessage(
        chatId,
        "⚠️ <b>Gagal menghapus pendaftar</b>\n\nSilakan coba lagi.",
        { parse_mode: "HTML" }
      );
    }
  });

  // Setup enhanced commands (Excel and Statistics)
  setupEnhancedCommands(bot);

  // Search command
  bot.onText(/\/cari\s+(.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const query = match[1].trim();

    if (!isAdminChat(chatId)) {
      bot.sendMessage(
        chatId,
        "❌ <b>Akses Ditolak</b>\n\nPerintah ini hanya untuk admin di grup resmi.",
        { parse_mode: "HTML" }
      );
      return;
    }

    try {
      const users = await searchUsers(query);

      if (users.length > 0) {
        let responseMessage = `🔍 <b>Hasil Pencarian untuk "${query}"</b>\n\n`;
        if (users.length > 5) {
          responseMessage += `<i>Ditemukan ${users.length} hasil. Menampilkan 5 teratas.</i>\n\n`;
        }

        for (const user of users.slice(0, 5)) {
          responseMessage += `👤 <b>${user.nama_lengkap}</b>\n`;
          responseMessage += `┣ 🎫 Tiket: <code>${user.ticket}</code>\n`;
          responseMessage += `┣ 🏫 Kelas: ${user.kelas} - ${user.jurusan}\n`;
          responseMessage += `┣ 📱 HP: <code>${user.nomor_telepon}</code>\n`;
          responseMessage += `┗ 🎯 Divisi: ${user.divisi || "Belum ada"}\n\n`;
        }
        bot.sendMessage(chatId, responseMessage, { parse_mode: "HTML" });
      } else {
        bot.sendMessage(
          chatId,
          `❌ <b>Tidak ada hasil</b> untuk pencarian "${query}".`,
          { parse_mode: "HTML" }
        );
      }
    } catch (error) {
      console.error("❌ Error searching users:", error);
      bot.sendMessage(chatId, "⚠️ Gagal melakukan pencarian.", {
        parse_mode: "HTML",
      });
    }
  });

  // New /search command
  bot.onText(/\/search (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const query = match[1];

    try {
      const users = await searchUsers(query);

      if (users.length === 0) {
        bot.sendMessage(
          chatId,
          `🔍 <b>HASIL PENCARIAN</b>\n\n❌ Tidak ditemukan pendaftar dengan kata kunci: <code>${query}</code>\n\n💡 Coba kata kunci lain seperti nama, kelas, jurusan, atau divisi.`,
          { parse_mode: "HTML" }
        );
        return;
      }

      let message = `🔍 <b>HASIL PENCARIAN</b>\n\nKata kunci: <code>${query}</code>\nDitemukan: <b>${users.length} pendaftar</b>\n\n`;

      users.slice(0, 10).forEach((user, index) => {
        const statusIcon = getStatusIcon(user.status);
        message += `${index + 1}. ${statusIcon} <code>${user.ticket}</code>\n`;
        message += `   📝 <b>${user.nama_lengkap}</b>\n`;
        message += `   🎓 ${user.kelas} ${user.jurusan}\n`;
        message += `   🎯 ${user.divisi || "Belum memilih"}\n\n`;
      });

      if (users.length > 10) {
        message += `➕ <i>Dan ${
          users.length - 10
        } pendaftar lainnya...</i>\n\n`;
      }

      message += `💡 Gunakan /detail [tiket] untuk info lengkap`;

      bot.sendMessage(chatId, message, { parse_mode: "HTML" });
    } catch (error) {
      console.error("❌ Error searching users:", error);
      bot.sendMessage(chatId, "⚠️ Gagal melakukan pencarian.", {
        parse_mode: "HTML",
      });
    }
  });

  // New /detail command
  bot.onText(/\/detail (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const ticket = match[1].trim();

    try {
      const user = await getUserDetailWithFiles(ticket);

      if (!user) {
        bot.sendMessage(
          chatId,
          `❌ <b>Tiket tidak ditemukan!</b>\n\n🔍 Tiket: <code>${ticket}</code>`,
          { parse_mode: "HTML" }
        );
        return;
      }

      // Send detailed info
      const detailMessage = createDetailMessage(user);

      // Collect media files
      const mediaFiles = collectMediaFiles(user);

      if (mediaFiles.length > 0) {
        await sendMediaToChat(detailMessage, mediaFiles, user, chatId);
      } else {
        bot.sendMessage(chatId, detailMessage, { parse_mode: "HTML" });
      }
    } catch (error) {
      console.error("❌ Error getting user detail:", error);
      bot.sendMessage(chatId, "⚠️ Gagal mengambil detail pendaftar.", {
        parse_mode: "HTML",
      });
    }
  });

  // New /push command
  bot.onText(/\/push/, async (msg) => {
    const chatId = msg.chat.id;

    try {
      if (pendingApprovals.size === 0) {
        bot.sendMessage(
          chatId,
          "📭 <b>TIDAK ADA DATA PENDING</b>\n\nBelum ada pendaftar yang disetujui dan menunggu untuk di-push ke database.\n\n💡 Gunakan /terima [tiket] terlebih dahulu.",
          { parse_mode: "HTML" }
        );
        return;
      }

      // Process all pending approvals
      let successCount = 0;
      let failCount = 0;
      let results = [];

      for (const [ticket, data] of pendingApprovals.entries()) {
        try {
          await updateTicketStatusWithDivisi(
            ticket,
            "approved",
            data.divisi_terpilih
          );
          results.push(
            `✅ ${ticket} - ${data.user_data.nama_lengkap}${
              data.divisi_terpilih ? ` (${data.divisi_terpilih})` : ""
            }`
          );
          successCount++;
        } catch (error) {
          results.push(`❌ ${ticket} - GAGAL`);
          failCount++;
          console.error(`Failed to approve ${ticket}:`, error);
        }
      }

      // Clear pending approvals after processing
      pendingApprovals.clear();

      let pushMessage = `📤 <b>PUSH DATA SELESAI</b>\n\n`;
      pushMessage += `✅ <b>Berhasil:</b> ${successCount}\n`;
      pushMessage += `❌ <b>Gagal:</b> ${failCount}\n\n`;
      pushMessage += `<b>DETAIL HASIL:</b>\n`;
      pushMessage += results.slice(0, 20).join("\n");

      if (results.length > 20) {
        pushMessage += `\n\n➕ <i>Dan ${results.length - 20} lainnya...</i>`;
      }

      bot.sendMessage(chatId, pushMessage, { parse_mode: "HTML" });
    } catch (error) {
      console.error("❌ Error pushing approvals:", error);
      bot.sendMessage(chatId, "⚠️ Gagal melakukan push data.", {
        parse_mode: "HTML",
      });
    }
  });

  console.log("✅ Bot commands setup completed");
}

// Helper functions
function isAdminChat(chatId) {
  return chatId.toString() === process.env.TELEGRAM_CHAT_ID;
}

function getStatusIcon(status) {
  switch (status) {
    case "approved":
      return "✅";
    case "rejected":
      return "❌";
    default:
      return "⏳";
  }
}

function formatStatus(status) {
  switch (status) {
    case "approved":
      return "<b>DITERIMA</b>";
    case "rejected":
      return "<b>DITOLAK</b>";
    default:
      return "<b>PENDING</b>";
  }
}

function getStatusAdvice(status) {
  switch (status) {
    case "approved":
      return "🎉 <i>Selamat! Pendaftar diterima di OSIS.</i>";
    case "rejected":
      return "💔 <i>Pendaftar dapat mendaftar ulang dengan perbaikan.</i>";
    default:
      return "⏳ <i>Menunggu review dari tim admin.</i>";
  }
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function createProgressBar(current, target) {
  const percentage = Math.min((current / target) * 100, 100);
  const filled = Math.floor(percentage / 10);
  const empty = 10 - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

// Database helper functions
async function getUserByTicket(ticket) {
  const pool = require("../database/mysql-database");
  let connection;

  try {
    connection = await pool.getConnection();
    const [rows] = await connection.execute(
      "SELECT * FROM users WHERE ticket = ?",
      [ticket]
    );
    return rows[0] || null;
  } catch (err) {
    throw err;
  } finally {
    if (connection) connection.release();
  }
}

async function getTodayStats() {
  const pool = require("../database/mysql-database");
  let connection;

  try {
    connection = await pool.getConnection();
    const today = new Date().toISOString().split("T")[0];

    const [rows] = await connection.execute(
      `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN status IS NULL OR status = 'pending' THEN 1 ELSE 0 END) as pending
      FROM users 
      WHERE DATE(created_at) = ?
    `,
      [today]
    );

    return {
      total: rows[0].total || 0,
      approved: rows[0].approved || 0,
      rejected: rows[0].rejected || 0,
      pending: rows[0].pending || 0,
    };
  } catch (err) {
    throw err;
  } finally {
    if (connection) connection.release();
  }
}

async function getRecentUsers(limit = 5) {
  const pool = require("../database/mysql-database");
  let connection;

  try {
    connection = await pool.getConnection();
    // Use string interpolation for LIMIT as it can't be parameterized
    const query = `
      SELECT u.*, GROUP_CONCAT(d.nama_divisi) as divisi
      FROM users u
      LEFT JOIN divisi d ON u.id = d.user_id
      GROUP BY u.id
      ORDER BY u.created_at DESC
      LIMIT ${parseInt(limit)}
    `;
    const [rows] = await connection.execute(query);
    return rows || [];
  } catch (err) {
    throw err;
  } finally {
    if (connection) connection.release();
  }
}

async function updateTicketStatus(ticket, status) {
  const pool = require("../database/mysql-database");
  let connection;

  try {
    connection = await pool.getConnection();

    const [result] = await connection.execute(
      "UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE ticket = ?",
      [status, ticket]
    );

    if (result.affectedRows > 0) {
      // Get updated user data
      const [rows] = await connection.execute(
        "SELECT * FROM users WHERE ticket = ?",
        [ticket]
      );
      return { success: true, user: rows[0] };
    } else {
      return { success: false };
    }
  } catch (err) {
    throw err;
  } finally {
    if (connection) connection.release();
  }
}

async function searchUsers(query) {
  const pool = require("../database/mysql-database");
  let connection;

  try {
    connection = await pool.getConnection();
    const searchQuery = `%${query}%`;

    const [rows] = await connection.execute(
      `
      SELECT u.*, GROUP_CONCAT(d.nama_divisi) as divisi
      FROM users u
      LEFT JOIN divisi d ON u.id = d.user_id
      WHERE u.nama_lengkap LIKE ? OR u.kelas LIKE ? OR u.jurusan LIKE ? OR d.nama_divisi LIKE ?
      GROUP BY u.id
      ORDER BY u.created_at DESC
      `,
      [searchQuery, searchQuery, searchQuery, searchQuery]
    );

    return rows || [];
  } catch (err) {
    throw err;
  } finally {
    if (connection) connection.release();
  }
}

// New helper function for detailed user info with files
async function getUserDetailWithFiles(ticket) {
  const pool = require("../database/mysql-database");
  let connection;

  try {
    connection = await pool.getConnection();

    // Get user data
    const [userRows] = await connection.execute(
      "SELECT * FROM users WHERE ticket = ?",
      [ticket]
    );

    if (userRows.length === 0) return null;

    const user = userRows[0];

    // Get organisasi data
    const [orgRows] = await connection.execute(
      "SELECT * FROM organisasi WHERE user_id = ?",
      [user.id]
    );

    // Get prestasi data
    const [prestasiRows] = await connection.execute(
      "SELECT * FROM prestasi WHERE user_id = ?",
      [user.id]
    );

    // Get divisi data
    const [divisiRows] = await connection.execute(
      "SELECT * FROM divisi WHERE user_id = ?",
      [user.id]
    );

    return {
      ...user,
      organisasi: orgRows,
      prestasi: prestasiRows,
      divisi: divisiRows.map((d) => d.nama_divisi).join(", ") || null,
    };
  } catch (err) {
    throw err;
  } finally {
    if (connection) connection.release();
  }
}

// Create detailed message for /detail command
function createDetailMessage(user) {
  const statusIcon = getStatusIcon(user.status);

  let message = `👤 <b>DETAIL LENGKAP PENDAFTAR</b>\n\n`;
  message += `🎫 <b>Tiket:</b> <code>${user.ticket}</code>\n`;
  message += `${statusIcon} <b>Status:</b> ${formatStatus(user.status)}\n\n`;

  message += `<b>📋 DATA PERSONAL:</b>\n`;
  message += `┣ 📝 <b>Nama:</b> ${user.nama_lengkap}\n`;
  message += `┣ 📱 <b>HP:</b> <code>${user.nomor_telepon}</code>\n`;
  message += `┣ 🎓 <b>Kelas:</b> ${user.kelas}\n`;
  message += `┣ 📚 <b>Jurusan:</b> ${user.jurusan}\n`;
  message += `┣ 📍 <b>Alamat:</b> ${user.alamat}\n`;
  message += `┣ 📧 <b>Email:</b> ${user.email || "➖"}\n`;
  message += `┗ 🎯 <b>Divisi:</b> ${user.divisi || "➖"}\n\n`;

  if (user.organisasi && user.organisasi.length > 0) {
    message += `<b>🏛️ PENGALAMAN ORGANISASI:</b>\n`;
    user.organisasi.forEach((org, index) => {
      message += `${index + 1}. <b>${org.nama_organisasi}</b>\n`;
      message += `   └ ${org.jabatan} (${org.periode})\n`;
    });
    message += `\n`;
  }

  if (user.prestasi && user.prestasi.length > 0) {
    message += `<b>🏆 PRESTASI:</b>\n`;
    user.prestasi.forEach((prestasi, index) => {
      message += `${index + 1}. <b>${prestasi.nama_prestasi}</b>\n`;
      message += `   └ ${prestasi.tingkat} - ${prestasi.tahun}\n`;
    });
    message += `\n`;
  }

  message += `<b>💭 MOTIVASI:</b>\n`;
  message += `<i>"${user.motivasi || "Tidak ada motivasi"}"</i>\n\n`;

  message += `<b>📅 WAKTU:</b>\n`;
  message += `┣ 📝 Daftar: ${formatDate(user.created_at)}\n`;
  message += `┗ 🔄 Update: ${formatDate(user.updated_at)}`;

  return message;
}

// Enhanced sendMedia function for specific chat
async function sendMediaToChat(message, mediaFiles, user, chatId) {
  const mediaGroup = [];

  for (let i = 0; i < Math.min(mediaFiles.length, 10); i++) {
    const file = mediaFiles[i];
    const mediaType = file.type === "image" ? "photo" : "document";

    mediaGroup.push({
      type: mediaType,
      media: file.path,
      caption: i === 0 ? message : undefined,
      parse_mode: i === 0 ? "HTML" : undefined,
    });
  }

  if (mediaGroup.length > 0) {
    try {
      await bot.sendMediaGroup(
        chatId || process.env.TELEGRAM_CHAT_ID,
        mediaGroup
      );
    } catch (error) {
      console.error("❌ Error sending media group:", error);
      // Fallback to text message
      await bot.sendMessage(chatId || process.env.TELEGRAM_CHAT_ID, message, {
        parse_mode: "HTML",
      });
    }
  }
}

// Update ticket status with optional divisi assignment
async function updateTicketStatusWithDivisi(
  ticket,
  status,
  divisiTerpilih = null
) {
  const pool = require("../database/mysql-database");
  let connection;

  try {
    connection = await pool.getConnection();

    const [result] = await connection.execute(
      "UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE ticket = ?",
      [status, ticket]
    );

    if (result.affectedRows > 0) {
      // If divisi specified, update divisi table
      if (divisiTerpilih && status === "approved") {
        // Get user ID first
        const [userRows] = await connection.execute(
          "SELECT id FROM users WHERE ticket = ?",
          [ticket]
        );

        if (userRows.length > 0) {
          const userId = userRows[0].id;

          // Delete existing divisi entries
          await connection.execute("DELETE FROM divisi WHERE user_id = ?", [
            userId,
          ]);

          // Insert new divisi
          await connection.execute(
            "INSERT INTO divisi (user_id, nama_divisi) VALUES (?, ?)",
            [userId, divisiTerpilih]
          );
        }
      }

      // Get updated user data
      const [rows] = await connection.execute(
        "SELECT * FROM users WHERE ticket = ?",
        [ticket]
      );
      return { success: true, user: rows[0] };
    } else {
      return { success: false };
    }
  } catch (err) {
    throw err;
  } finally {
    if (connection) connection.release();
  }
}

// Delete applicant completely from database
async function deleteApplicant(ticket) {
  const pool = require("../database/mysql-database");
  let connection;

  try {
    connection = await pool.getConnection();

    // Get user ID first
    const [userRows] = await connection.execute(
      "SELECT id FROM users WHERE ticket = ?",
      [ticket]
    );

    if (userRows.length === 0) {
      return { success: false };
    }

    const userId = userRows[0].id;

    // Delete from all related tables (cascade delete)
    await connection.execute("DELETE FROM divisi WHERE user_id = ?", [userId]);
    await connection.execute("DELETE FROM prestasi WHERE user_id = ?", [
      userId,
    ]);
    await connection.execute("DELETE FROM organisasi WHERE user_id = ?", [
      userId,
    ]);

    // Finally delete from users table
    const [result] = await connection.execute(
      "DELETE FROM users WHERE ticket = ?",
      [ticket]
    );

    return { success: result.affectedRows > 0 };
  } catch (err) {
    throw err;
  } finally {
    if (connection) connection.release();
  }
}

module.exports = {
  initTelegramBot,
  sendTelegramNotification,
};

// Telegram command handlers - Excel and Statistics functionality
const { generateEnhancedExcelReport } = require("./excel-simple");
const {
  getRecruitmentStats,
  getDivisionStats,
  getClassStats,
  getMajorStats,
  getMonthlyTrends,
  formatStatsMessage,
  formatDivisionMessage,
  formatClassMessage,
  formatMajorMessage,
  formatTrendsMessage,
} = require("./bot-stats");
const fs = require("fs");
const path = require("path");

// Helper function to check admin access - matches the one in telegram.js
function isAdminChat(chatId) {
  if (!process.env.TELEGRAM_CHAT_ID) return false;
  return process.env.TELEGRAM_CHAT_ID.split(",").includes(chatId.toString());
}

/**
 * Setup Excel and Statistics commands
 * @param {TelegramBot} bot - The bot instance
 */
function setupEnhancedCommands(bot) {
  // /excel command - Export all data to Excel (Simple version)
  bot.onText(/\/excel/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    console.log(`📊 Excel export requested by user ${userId}`);

    // Check if user is admin using chat ID
    if (!isAdminChat(chatId)) {
      bot.sendMessage(
        chatId,
        "❌ <b>Akses Ditolak</b>\n\nPerintah ini hanya untuk admin di grup resmi.",
        { parse_mode: "HTML" }
      );
      return;
    }

    const loadingMsg = await bot.sendMessage(
      chatId,
      "⏳ <b>Generating Excel Report...</b>\n\n📊 Mengumpulkan data pendaftar...",
      { parse_mode: "HTML" }
    );

    try {
      const result = await generateEnhancedExcelReport();

      if (!result) {
        bot.editMessageText(
          "⚠️ <b>Tidak Ada Data</b>\n\nBelum ada pendaftar untuk di-export.",
          {
            chat_id: chatId,
            message_id: loadingMsg.message_id,
            parse_mode: "HTML",
          }
        );
        return;
      }

      // Update loading message
      bot.editMessageText(
        "📤 <b>Mengirim File Excel...</b>\n\n✅ File berhasil dibuat!",
        {
          chat_id: chatId,
          message_id: loadingMsg.message_id,
          parse_mode: "HTML",
        }
      );

      const caption = `📊 <b>DATA LENGKAP PENDAFTAR OSIS</b>

📁 <b>File:</b> ${result.fileName}
👥 <b>Total Data:</b> ${result.totalRecords} pendaftar
📏 <b>Ukuran File:</b> ${result.fileSize} MB

📝 <i>Data lengkap semua pendaftar dalam format Excel yang siap digunakan.</i>

<i>Generated: ${new Date().toLocaleString("id-ID")}</i>`;

      // Send the Excel file
      await bot.sendDocument(chatId, result.filePath, {
        caption: caption,
        parse_mode: "HTML",
      });

      // Clean up the file after sending
      setTimeout(() => {
        if (fs.existsSync(result.filePath)) {
          fs.unlinkSync(result.filePath);
          console.log(`🧹 Cleaned up Excel file: ${result.fileName}`);
        }
      }, 5000);

      console.log(`✅ Excel file sent successfully to chat ${chatId}`);
    } catch (error) {
      console.error("❌ Excel generation error:", error);
      bot.editMessageText(
        `❌ <b>Error</b>\n\nGagal membuat file Excel:\n<code>${error.message}</code>`,
        {
          chat_id: chatId,
          message_id: loadingMsg.message_id,
          parse_mode: "HTML",
        }
      );
    }
  });

  // /stats command - Show recruitment statistics
  bot.onText(/\/stats/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    console.log(`📊 Stats requested by user ${userId}`);

    if (!isAdminChat(chatId)) {
      bot.sendMessage(
        chatId,
        "❌ <b>Akses Ditolak</b>\n\nPerintah ini hanya untuk admin di grup resmi.",
        { parse_mode: "HTML" }
      );
      return;
    }

    try {
      const stats = await getRecruitmentStats();
      const message = formatStatsMessage(stats);

      bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
    } catch (error) {
      console.error("❌ Stats error:", error);
      bot.sendMessage(
        chatId,
        `❌ <b>Error</b>\n\nGagal mengambil statistik:\n<code>${error.message}</code>`,
        { parse_mode: "HTML" }
      );
    }
  });

  // /divisi command - Show division statistics
  bot.onText(/\/divisi/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!isAdminChat(chatId)) {
      bot.sendMessage(
        chatId,
        "❌ <b>Akses Ditolak</b>\n\nPerintah ini hanya untuk admin di grup resmi.",
        { parse_mode: "HTML" }
      );
      return;
    }

    try {
      const divisionStats = await getDivisionStats();
      const message = formatDivisionMessage(divisionStats);

      bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
    } catch (error) {
      console.error("❌ Division stats error:", error);
      bot.sendMessage(
        chatId,
        `❌ <b>Error</b>\n\nGagal mengambil statistik divisi:\n<code>${error.message}</code>`,
        { parse_mode: "HTML" }
      );
    }
  });

  // /kelas command - Show class statistics
  bot.onText(/\/kelas/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!isAdminChat(chatId)) {
      bot.sendMessage(
        chatId,
        "❌ <b>Akses Ditolak</b>\n\nPerintah ini hanya untuk admin di grup resmi.",
        { parse_mode: "HTML" }
      );
      return;
    }

    try {
      const classStats = await getClassStats();
      const message = formatClassMessage(classStats);

      bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
    } catch (error) {
      console.error("❌ Class stats error:", error);
      bot.sendMessage(
        chatId,
        `❌ <b>Error</b>\n\nGagal mengambil statistik kelas:\n<code>${error.message}</code>`,
        { parse_mode: "HTML" }
      );
    }
  });

  // /jurusan command - Show major statistics
  bot.onText(/\/jurusan/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!isAdminChat(chatId)) {
      bot.sendMessage(
        chatId,
        "❌ <b>Akses Ditolak</b>\n\nPerintah ini hanya untuk admin di grup resmi.",
        { parse_mode: "HTML" }
      );
      return;
    }

    try {
      const majorStats = await getMajorStats();
      const message = formatMajorMessage(majorStats);

      bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
    } catch (error) {
      console.error("❌ Major stats error:", error);
      bot.sendMessage(
        chatId,
        `❌ <b>Error</b>\n\nGagal mengambil statistik jurusan:\n<code>${error.message}</code>`,
        { parse_mode: "HTML" }
      );
    }
  });

  // /trends command - Show monthly registration trends
  bot.onText(/\/trends/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!isAdminChat(chatId)) {
      bot.sendMessage(
        chatId,
        "❌ <b>Akses Ditolak</b>\n\nPerintah ini hanya untuk admin di grup resmi.",
        { parse_mode: "HTML" }
      );
      return;
    }

    try {
      const monthlyTrends = await getMonthlyTrends();
      const message = formatTrendsMessage(monthlyTrends);

      bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
    } catch (error) {
      console.error("❌ Trends error:", error);
      bot.sendMessage(
        chatId,
        `❌ <b>Error</b>\n\nGagal mengambil tren pendaftaran:\n<code>${error.message}</code>`,
        { parse_mode: "HTML" }
      );
    }
  });
}

module.exports = { setupEnhancedCommands };

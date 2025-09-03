/**
 * Bot Commands for OSIS Recruitment Statistics and Reports
 */

const { getConnection } = require("../database/mysql-database-refactored");
const path = require("path");
const fs = require("fs");

/**
 * Get user by ticket
 */
async function getUserByTicket(ticket) {
  let connection;
  try {
    connection = await getConnection();
    const [users] = await connection.execute(
      "SELECT u.*, GROUP_CONCAT(d.nama_divisi) as divisi FROM users u LEFT JOIN divisi d ON u.id = d.user_id WHERE u.ticket = ? GROUP BY u.id",
      [ticket]
    );
    return users.length > 0 ? users[0] : null;
  } finally {
    if (connection) connection.release();
  }
}

/**
 * Get today's statistics
 */
async function getTodayStats() {
  let connection;
  try {
    connection = await getConnection();
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const [stats] = await connection.execute(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status IN ('approved', 'LOLOS') THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status IN ('rejected', 'DITOLAK') THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN status NOT IN ('approved', 'LOLOS', 'rejected', 'DITOLAK') OR status IS NULL THEN 1 ELSE 0 END) as pending
      FROM users
      WHERE DATE(created_at) = ?`,
      [today]
    );
    return stats[0];
  } finally {
    if (connection) connection.release();
  }
}

/**
 * Get recent users
 */
async function getRecentUsers(limit = 5) {
  let connection;
  try {
    connection = await getConnection();
    const [users] = await connection.execute(
      `SELECT u.ticket, u.nama_lengkap, u.nomor_telepon, u.created_at, u.status, GROUP_CONCAT(d.nama_divisi) as divisi
      FROM users u
      LEFT JOIN divisi d ON u.id = d.user_id
      GROUP BY u.id
      ORDER BY u.created_at DESC
      LIMIT ?`,
      [limit]
    );
    return users;
  } finally {
    if (connection) connection.release();
  }
}

/**
 * Update ticket status
 */
async function updateTicketStatus(ticket, status) {
  let connection;
  try {
    connection = await getConnection();
    const [result] = await connection.execute(
      "UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE ticket = ?",
      [status, ticket]
    );
    if (result.affectedRows > 0) {
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

/**
 * Search users
 */
async function searchUsers(query) {
  let connection;
  try {
    connection = await getConnection();
    const searchQuery = `%${query}%`;
    const [users] = await connection.execute(
      `SELECT u.ticket, u.nama_lengkap, u.kelas, u.jurusan, u.nomor_telepon, u.status, GROUP_CONCAT(d.nama_divisi) as divisi
      FROM users u
      LEFT JOIN divisi d ON u.id = d.user_id
      WHERE u.nama_lengkap LIKE ? OR u.kelas LIKE ? OR u.jurusan LIKE ? OR d.nama_divisi LIKE ?
      GROUP BY u.id
      ORDER BY u.created_at DESC
      LIMIT 10`,
      [searchQuery, searchQuery, searchQuery, searchQuery]
    );
    return users;
  } finally {
    if (connection) connection.release();
  }
}

/**
 * Get user detail with files
 */
async function getUserDetailWithFiles(ticket) {
  let connection;
  try {
    connection = await getConnection();
    const [users] = await connection.execute(
      "SELECT * FROM users WHERE ticket = ?",
      [ticket]
    );
    if (users.length === 0) return null;

    const user = users[0];

    const [organisasi] = await connection.execute(
      "SELECT nama_organisasi, jabatan, tahun, sertifikat_path FROM organisasi WHERE user_id = ?",
      [user.id]
    );
    const [prestasi] = await connection.execute(
      "SELECT nama_prestasi, tingkat, tahun, sertifikat_path FROM prestasi WHERE user_id = ?",
      [user.id]
    );
    const [divisi] = await connection.execute(
      "SELECT nama_divisi, alasan FROM divisi WHERE user_id = ?",
      [user.id]
    );

    return { ...user, organisasi, prestasi, divisi };
  } finally {
    if (connection) connection.release();
  }
}

/**
 * Update ticket status with optional divisi assignment
 */
async function updateTicketStatusWithDivisi(
  ticket,
  status,
  divisiTerpilih = null
) {
  let connection;

  try {
    connection = await getConnection();

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

/**
 * Delete applicant completely from database
 */
async function deleteApplicant(ticket) {
  let connection;

  try {
    connection = await getConnection();

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

/**
 * Get all applicants
 */
async function getAllApplicants(limit = 20, offset = 0) {
  let connection;

  try {
    connection = await getConnection();
    const query = `
      SELECT u.*, GROUP_CONCAT(d.nama_divisi) as divisi
      FROM users u
      LEFT JOIN divisi d ON u.id = d.user_id
      GROUP BY u.id
      ORDER BY u.created_at DESC
      LIMIT ${Number(limit)} OFFSET ${Number(offset)}
    `;
    const [rows] = await connection.execute(query);
    return rows || [];
  } catch (err) {
    throw err;
  } finally {
    if (connection) connection.release();
  }
}

/**
 * Get recruitment statistics
 */
async function getRecruitmentStats() {
  let connection;

  try {
    connection = await getConnection();

    const [stats] = await connection.execute(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status IN ('approved', 'LOLOS') THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status IN ('rejected', 'DITOLAK') THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN status NOT IN ('approved', 'LOLOS', 'rejected', 'DITOLAK') OR status IS NULL THEN 1 ELSE 0 END) as pending,
        COUNT(DISTINCT kelas) as total_kelas,
        COUNT(DISTINCT jurusan) as total_jurusan
      FROM users
    `);

    const data = stats[0];
    const acceptanceRate =
      data.total > 0 ? ((data.approved / data.total) * 100).toFixed(1) : 0;

    return {
      total: data.total,
      approved: data.approved,
      rejected: data.rejected,
      pending: data.pending,
      acceptanceRate: acceptanceRate,
      totalKelas: data.total_kelas,
      totalJurusan: data.total_jurusan,
    };
  } finally {
    if (connection) connection.release();
  }
}

/**
 * Get division statistics
 */
async function getDivisionStats() {
  let connection;

  try {
    connection = await getConnection();

    const [divisionStats] = await connection.execute(`
      SELECT 
        d.nama_divisi,
        COUNT(*) as total_pendaftar
      FROM divisi d
      JOIN users u ON d.user_id = u.id
      GROUP BY d.nama_divisi
      ORDER BY total_pendaftar DESC
    `);

    return divisionStats;
  } finally {
    if (connection) connection.release();
  }
}

/**
 * Get class statistics
 */
async function getClassStats() {
  let connection;

  try {
    connection = await getConnection();

    const [classStats] = await connection.execute(`
      SELECT 
        kelas,
        COUNT(*) as total_pendaftar,
        SUM(CASE WHEN status IN ('approved', 'LOLOS') THEN 1 ELSE 0 END) as diterima
      FROM users
      GROUP BY kelas
      ORDER BY kelas
    `);

    return classStats;
  } finally {
    if (connection) connection.release();
  }
}

/**
 * Get major (jurusan) statistics
 */
async function getMajorStats() {
  let connection;

  try {
    connection = await getConnection();

    const [majorStats] = await connection.execute(`
      SELECT 
        jurusan,
        COUNT(*) as total_pendaftar,
        SUM(CASE WHEN status IN ('approved', 'LOLOS') THEN 1 ELSE 0 END) as diterima
      FROM users
      GROUP BY jurusan
      ORDER BY total_pendaftar DESC
    `);

    return majorStats;
  } finally {
    if (connection) connection.release();
  }
}

/**
 * Get monthly registration trends
 */
async function getMonthlyTrends() {
  let connection;

  try {
    connection = await getConnection();

    const [monthlyStats] = await connection.execute(`
      SELECT 
        YEAR(created_at) as tahun,
        MONTH(created_at) as bulan,
        COUNT(*) as jumlah_pendaftar
      FROM users
      GROUP BY YEAR(created_at), MONTH(created_at)
      ORDER BY tahun DESC, bulan DESC
      LIMIT 12
    `);

    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "Mei",
      "Jun",
      "Jul",
      "Agu",
      "Sep",
      "Okt",
      "Nov",
      "Des",
    ];

    return monthlyStats.map((stat) => ({
      tahun: stat.tahun,
      bulan: stat.bulan,
      namaBulan: monthNames[stat.bulan - 1],
      jumlahPendaftar: stat.jumlah_pendaftar,
    }));
  } finally {
    if (connection) connection.release();
  }
}

/**
 * Format statistics message for Telegram
 */
function formatStatsMessage(stats) {
  const message = `📊 *STATISTIK REKRUTMEN OSIS*

👥 *Total Pendaftar:* ${stats.total}
✅ *Diterima:* ${stats.approved} 
❌ *Ditolak:* ${stats.rejected}
⏳ *Pending:* ${stats.pending}

📈 *Tingkat Penerimaan:* ${stats.acceptanceRate}%
🏫 *Total Kelas Terwakili:* ${stats.totalKelas}
📚 *Total Jurusan:* ${stats.totalJurusan}

_Update: ${new Date().toLocaleString("id-ID")}_`;

  return message;
}

/**
 * Format division stats message
 */
function formatDivisionMessage(divisionStats) {
  let message = `📋 *STATISTIK PER DIVISI*\n\n`;

  divisionStats.forEach((div, index) => {
    const emoji =
      index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "📌";
    message += `${emoji} *${div.nama_divisi}*: ${div.total_pendaftar} pendaftar\n`;
  });

  message += `\n_Total ${divisionStats.length} divisi tersedia_`;
  return message;
}

/**
 * Format class stats message
 */
function formatClassMessage(classStats) {
  let message = `🏫 *STATISTIK PER KELAS*\n\n`;

  classStats.forEach((cls) => {
    const acceptance =
      cls.total_pendaftar > 0
        ? ((cls.diterima / cls.total_pendaftar) * 100).toFixed(1)
        : 0;
    message += `📚 *Kelas ${cls.kelas}*\n`;
    message += `   • Total: ${cls.total_pendaftar} pendaftar\n`;
    message += `   • Diterima: ${cls.diterima} (${acceptance}%)\n\n`;
  });

  return message;
}

/**
 * Format major stats message
 */
function formatMajorMessage(majorStats) {
  let message = `🎓 *STATISTIK PER JURUSAN*\n\n`;

  majorStats.forEach((major) => {
    const acceptance =
      major.total_pendaftar > 0
        ? ((major.diterima / major.total_pendaftar) * 100).toFixed(1)
        : 0;
    message += `📖 *${major.jurusan}*\n`;
    message += `   • Total: ${major.total_pendaftar} pendaftar\n`;
    message += `   • Diterima: ${major.diterima} (${acceptance}%)\n\n`;
  });

  return message;
}

/**
 * Format monthly trends message
 */
function formatTrendsMessage(monthlyStats) {
  let message = `📈 *TREN PENDAFTARAN BULANAN*\n\n`;

  monthlyStats.forEach((stat) => {
    message += `📅 *${stat.namaBulan} ${stat.tahun}*: ${stat.jumlahPendaftar} pendaftar\n`;
  });

  return message;
}

module.exports = {
  getUserByTicket,
  getTodayStats,
  getRecentUsers,
  updateTicketStatus,
  searchUsers,
  getUserDetailWithFiles,
  updateTicketStatusWithDivisi,
  deleteApplicant,
  getAllApplicants,
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
};

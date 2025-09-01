/**
 * Bot Commands for OSIS Recruitment Statistics and Reports
 */

const pool = require("../database/mysql-database");

/**
 * Get recruitment statistics
 */
async function getRecruitmentStats() {
  let connection;

  try {
    connection = await pool.getConnection();
    
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
    const acceptanceRate = data.total > 0 ? ((data.approved / data.total) * 100).toFixed(1) : 0;

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
    connection = await pool.getConnection();
    
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
    connection = await pool.getConnection();
    
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
    connection = await pool.getConnection();
    
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
    connection = await pool.getConnection();
    
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
      'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
      'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
    ];

    return monthlyStats.map(stat => ({
      tahun: stat.tahun,
      bulan: stat.bulan,
      namaBulan: monthNames[stat.bulan - 1],
      jumlahPendaftar: stat.jumlah_pendaftar
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

_Update: ${new Date().toLocaleString('id-ID')}_`;

  return message;
}

/**
 * Format division stats message
 */
function formatDivisionMessage(divisionStats) {
  let message = `📋 *STATISTIK PER DIVISI*\n\n`;
  
  divisionStats.forEach((div, index) => {
    const emoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '📌';
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
  
  classStats.forEach(cls => {
    const acceptance = cls.total_pendaftar > 0 ? 
      ((cls.diterima / cls.total_pendaftar) * 100).toFixed(1) : 0;
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
  
  majorStats.forEach(major => {
    const acceptance = major.total_pendaftar > 0 ? 
      ((major.diterima / major.total_pendaftar) * 100).toFixed(1) : 0;
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
  
  monthlyStats.forEach(stat => {
    message += `📅 *${stat.namaBulan} ${stat.tahun}*: ${stat.jumlahPendaftar} pendaftar\n`;
  });

  return message;
}

module.exports = {
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

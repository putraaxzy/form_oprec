/**
 * Enhanced Excel Report Generator for OSIS Recruitment System
 * Generates a visually appealing and well-structured Excel report.
 */

const ExcelJS = require("exceljs");
const pool = require("../database/mysql-database");
const path = require("path");
const fs = require("fs");

// -- Konstanta untuk Styling --
// Memudahkan penggantian tema warna di satu tempat
const STYLE_CONSTANTS = {
  HEADER_FILL_COLOR: "FF4F81BD", // Biru tua
  HEADER_FONT_COLOR: "FFFFFFFF", // Putih
  ROW_LIGHT_FILL_COLOR: "FFDDEBF7", // Biru muda
  ROW_DARK_FILL_COLOR: "FFFFFFFF", // Putih
  STATUS_APPROVED_FILL: "FFC6EFCE",
  STATUS_APPROVED_FONT: "FF006100",
  STATUS_REJECTED_FILL: "FFFFC7CE",
  STATUS_REJECTED_FONT: "FF9C0006",
  STATUS_PENDING_FILL: "FFFFEB9C",
  STATUS_PENDING_FONT: "FF9C5700",
  BORDER_STYLE: {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  },
};

/**
 * Menerapkan gaya pada baris header.
 * @param {ExcelJS.Row} headerRow - Objek baris header dari worksheet.
 */
function applyHeaderStyle(headerRow) {
  headerRow.font = {
    bold: true,
    color: { argb: STYLE_CONSTANTS.HEADER_FONT_COLOR },
    size: 12,
  };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: STYLE_CONSTANTS.HEADER_FILL_COLOR },
  };
  headerRow.alignment = {
    horizontal: "center",
    vertical: "middle",
  };
  headerRow.height = 30; // Tinggi baris header ditambah
}

/**
 * Menerapkan gaya pada sel data dan seluruh baris.
 * @param {ExcelJS.Row} row - Objek baris yang sedang diproses.
 * @param {object} rowData - Data untuk baris tersebut.
 * @param {number} index - Indeks baris (0-based).
 */
function applyRowStyles(row, rowData, index) {
  // Warna baris selang-seling (zebra stripes) untuk keterbacaan
  const fillColor =
    index % 2 === 0
      ? STYLE_CONSTANTS.ROW_LIGHT_FILL_COLOR
      : STYLE_CONSTANTS.ROW_DARK_FILL_COLOR;

  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: fillColor },
  };
  row.alignment = { vertical: "middle", wrapText: true }; // Terapkan wrapText ke semua sel
  row.height = 40; // Menambah tinggi baris untuk padding

  // Pewarnaan status berdasarkan kondisi
  const statusCell = row.getCell("status");
  const statusUpper = (rowData.status || "PENDING").toUpperCase();

  let statusStyle = {
    fill: {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: STYLE_CONSTANTS.STATUS_PENDING_FILL },
    },
    font: { color: { argb: STYLE_CONSTANTS.STATUS_PENDING_FONT }, bold: true },
  };

  if (statusUpper === "LOLOS" || statusUpper === "APPROVED") {
    statusStyle = {
      fill: {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: STYLE_CONSTANTS.STATUS_APPROVED_FILL },
      },
      font: {
        color: { argb: STYLE_CONSTANTS.STATUS_APPROVED_FONT },
        bold: true,
      },
    };
  } else if (statusUpper === "DITOLAK" || statusUpper === "REJECTED") {
    statusStyle = {
      fill: {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: STYLE_CONSTANTS.STATUS_REJECTED_FILL },
      },
      font: {
        color: { argb: STYLE_CONSTANTS.STATUS_REJECTED_FONT },
        bold: true,
      },
    };
  }

  statusCell.fill = statusStyle.fill;
  statusCell.font = statusStyle.font;
  statusCell.alignment = { horizontal: "center", vertical: "middle" };
}

/**
 * Mengambil data pengguna dari database.
 * @param {object} connection - Koneksi database.
 * @returns {Promise<Array>} - Array data pengguna.
 */
async function fetchUsersData(connection) {
  const [users] = await connection.execute(`
    SELECT 
      u.*,
      GROUP_CONCAT(DISTINCT d.nama_divisi SEPARATOR ', ') as divisi_list,
      GROUP_CONCAT(DISTINCT CONCAT(o.nama_organisasi, ' (', o.jabatan, ' - ', o.tahun, ')') SEPARATOR ';\\n') as organisasi_list,
      GROUP_CONCAT(DISTINCT CONCAT(p.nama_prestasi, ' - ', p.tingkat, ' (', p.tahun, ')') SEPARATOR ';\\n') as prestasi_list
    FROM users u
    LEFT JOIN divisi d ON u.id = d.user_id
    LEFT JOIN organisasi o ON u.id = o.user_id  
    LEFT JOIN prestasi p ON u.id = p.user_id
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `);
  return users;
}

/**
 * Generate an enhanced Excel report with complete user data
 */
async function generateEnhancedExcelReport() {
  let connection;

  try {
    console.log("📊 Generating enhanced Excel report...");
    connection = await pool.getConnection();

    const users = await fetchUsersData(connection);

    if (users.length === 0) {
      console.log("⚠️ No users found for Excel export.");
      return null;
    }

    console.log(`📈 Found ${users.length} users for Excel export.`);

    // --- Pembuatan Workbook dan Worksheet ---
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "OSIS Recruitment System";
    workbook.created = new Date();
    const worksheet = workbook.addWorksheet("Data Pendaftar OSIS");

    // --- Menambahkan Judul Laporan ---
    worksheet.mergeCells("A1:T1"); // Sesuaikan dengan jumlah kolom
    const titleCell = worksheet.getCell("A1");
    titleCell.value = "Laporan Lengkap Pendaftaran Anggota OSIS";
    titleCell.font = { size: 16, bold: true, color: { argb: "FF4F81BD" } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    worksheet.getRow(1).height = 40;

    // Menambahkan baris kosong sebagai pemisah
    worksheet.addRow([]);

    // --- Definisi Kolom ---
    // Dipindah setelah penambahan judul untuk row yang lebih akurat
    const columns = [
      { header: "No", key: "no", width: 5 },
      { header: "Nama Lengkap", key: "nama_lengkap", width: 30 },
      { header: "Panggilan", key: "nama_panggilan", width: 18 },
      { header: "Kelas", key: "kelas", width: 10 },
      { header: "Jurusan", key: "jurusan", width: 15 },
      { header: "TTL", key: "ttl", width: 30 },
      { header: "Gender", key: "jenis_kelamin", width: 12 },
      { header: "Agama", key: "agama", width: 15 },
      { header: "No. Telepon", key: "nomor_telepon", width: 18 },
      { header: "Email", key: "email", width: 30 },
      { header: "Alamat", key: "alamat", width: 45 },
      { header: "Hobi", key: "hobi", width: 25 },
      { header: "Motto", key: "motto", width: 40 },
      { header: "Motivasi", key: "motivasi", width: 40 },
      { header: "Pilihan Divisi", key: "divisi_list", width: 30 },
      { header: "Pengalaman Organisasi", key: "organisasi_list", width: 45 },
      { header: "Prestasi", key: "prestasi_list", width: 45 },
      { header: "Status", key: "status", width: 15 },
      { header: "Tanggal Daftar", key: "created_at", width: 20 },
    ];
    worksheet.columns = columns;

    // --- Styling Header (di baris ke-3 sekarang) ---
    const headerRow = worksheet.getRow(3);
    applyHeaderStyle(headerRow);

    // --- Penambahan Data dan Styling Baris ---
    users.forEach((user, index) => {
      // Menggabungkan Tempat & Tanggal Lahir
      const ttl =
        user.tempat_lahir && user.tanggal_lahir
          ? `${user.tempat_lahir}, ${new Date(
              user.tanggal_lahir
            ).toLocaleDateString("id-ID", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}`
          : "-";

      const rowData = {
        no: index + 1,
        nama_lengkap: user.nama_lengkap,
        nama_panggilan: user.nama_panggilan || "-",
        kelas: user.kelas,
        jurusan: user.jurusan,
        ttl: ttl,
        jenis_kelamin: user.jenis_kelamin || "-",
        agama: user.agama || "-",
        nomor_telepon: user.nomor_telepon,
        email: user.email || "-",
        alamat: user.alamat || "-",
        hobi: user.hobi || "-",
        motto: user.motto || "-",
        motivasi: user.motivasi || "-",
        divisi_list: user.divisi_list || "-",
        organisasi_list: user.organisasi_list || "-",
        prestasi_list: user.prestasi_list || "-",
        status: user.status || "PENDING",
        created_at: new Date(user.created_at).toLocaleDateString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
          day: "2-digit",
          month: "long",
          year: "numeric",
        }),
      };

      const row = worksheet.addRow(rowData);
      applyRowStyles(row, rowData, index);
    });

    // --- Terapkan Border ke seluruh tabel data ---
    const dataRowCount = users.length;
    for (let i = 3; i <= dataRowCount + 3; i++) {
      // Mulai dari header row (3)
      worksheet.getRow(i).eachCell((cell) => {
        cell.border = STYLE_CONSTANTS.BORDER_STYLE;
      });
    }

    // --- Fitur Tambahan ---
    worksheet.views = [{ state: "frozen", ySplit: 3 }]; // Freeze pane di bawah header
    worksheet.autoFilter = `A3:${String.fromCharCode(
      65 + columns.length - 1
    )}3`;

    // --- Penyimpanan File ---
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `OSIS_Data_Lengkap_${timestamp}.xlsx`;
    const tempDir = path.join(__dirname, "..", "temp");

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const filePath = path.join(tempDir, fileName);
    await workbook.xlsx.writeFile(filePath);

    console.log(`✅ Excel file generated successfully: ${fileName}`);

    const fileStats = fs.statSync(filePath);
    const fileSizeInMB = (fileStats.size / (1024 * 1024)).toFixed(2);

    return {
      filePath,
      fileName,
      totalRecords: users.length,
      fileSize: `${fileSizeInMB} MB`,
    };
  } catch (err) {
    console.error("❌ Excel generation error:", err);
    throw new Error(`Excel generation failed: ${err.message}`);
  } finally {
    if (connection) {
      console.log("🔗 Closing database connection.");
      connection.release();
    }
  }
}

module.exports = {
  generateEnhancedExcelReport,
};

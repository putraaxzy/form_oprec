/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🎨 ENHANCED EXCEL REPORT GENERATOR FOR OSIS RECRUITMENT SYSTEM
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Generates visually appealing and professionally structured Excel reports
 * with modern styling, responsive design, and comprehensive data visualization.
 *
 * @author OSIS Development Team
 * @version 2.0.0
 * @created 2025
 */

const ExcelJS = require("exceljs");
const { getConnection } = require("../database/mysql-database-refactored");
const path = require("path");
const fs = require("fs");

// ═══════════════════════════════════════════════════════════════════════════════
// 🎨 DESIGN SYSTEM - Color Palette & Typography
// ═══════════════════════════════════════════════════════════════════════════════

const DESIGN_SYSTEM = {
  // 🎨 Primary Color Scheme
  COLORS: {
    PRIMARY: {
      DARK: "FF1E3A8A", // Deep Blue
      MEDIUM: "FF3B82F6", // Blue
      LIGHT: "FFDBEAFE", // Light Blue
      ACCENT: "FF06B6D4", // Cyan
    },
    NEUTRAL: {
      WHITE: "FFFFFFFF", // Pure White
      LIGHT_GRAY: "FFF8FAFC", // Very Light Gray
      MEDIUM_GRAY: "FFE2E8F0", // Medium Gray
      DARK_GRAY: "FF475569", // Dark Gray
    },
    STATUS: {
      SUCCESS: {
        BG: "FFDCFCE7", // Light Green
        TEXT: "FF166534", // Dark Green
      },
      WARNING: {
        BG: "FFFEF3C7", // Light Yellow
        TEXT: "FF92400E", // Dark Orange
      },
      DANGER: {
        BG: "FFFECACA", // Light Red
        TEXT: "FF991B1B", // Dark Red
      },
    },
  },

  // 📝 Typography Scale
  TYPOGRAPHY: {
    TITLE: { size: 18, bold: true },
    SUBTITLE: { size: 14, bold: true },
    HEADER: { size: 12, bold: true },
    BODY: { size: 11, bold: false },
    SMALL: { size: 10, bold: false },
  },

  // 🎯 Spacing & Dimensions
  SPACING: {
    TITLE_HEIGHT: 50,
    SUBTITLE_HEIGHT: 35,
    HEADER_HEIGHT: 32,
    ROW_HEIGHT: 28,
    EXPANDED_ROW_HEIGHT: 45,
  },

  // 🔲 Border Styles
  BORDERS: {
    THIN: { style: "thin", color: { argb: "FFE2E8F0" } },
    MEDIUM: { style: "medium", color: { argb: "FF94A3B8" } },
    THICK: { style: "thick", color: { argb: "FF64748B" } },
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// 🎨 STYLING UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 🎨 Apply modern title styling with gradient effect simulation
 * @param {ExcelJS.Cell} cell - The title cell
 * @param {string} title - Title text
 */
function applyTitleStyle(cell, title) {
  cell.value = title;
  cell.font = {
    ...DESIGN_SYSTEM.TYPOGRAPHY.TITLE,
    color: { argb: DESIGN_SYSTEM.COLORS.PRIMARY.DARK },
    name: "Segoe UI",
  };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: DESIGN_SYSTEM.COLORS.PRIMARY.LIGHT },
  };
  cell.alignment = {
    horizontal: "center",
    vertical: "middle",
  };
  cell.border = {
    top: DESIGN_SYSTEM.BORDERS.MEDIUM,
    bottom: DESIGN_SYSTEM.BORDERS.MEDIUM,
    left: DESIGN_SYSTEM.BORDERS.MEDIUM,
    right: DESIGN_SYSTEM.BORDERS.MEDIUM,
  };
}

/**
 * 🎯 Apply professional header styling with modern design
 * @param {ExcelJS.Row} headerRow - The header row object
 */
function applyModernHeaderStyle(headerRow) {
  headerRow.height = DESIGN_SYSTEM.SPACING.HEADER_HEIGHT;

  headerRow.eachCell((cell) => {
    // Modern header styling
    cell.font = {
      ...DESIGN_SYSTEM.TYPOGRAPHY.HEADER,
      color: { argb: DESIGN_SYSTEM.COLORS.NEUTRAL.WHITE },
      name: "Segoe UI Semibold",
    };

    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: DESIGN_SYSTEM.COLORS.PRIMARY.DARK },
    };

    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };

    cell.border = {
      top: DESIGN_SYSTEM.BORDERS.THIN,
      left: DESIGN_SYSTEM.BORDERS.THIN,
      bottom: DESIGN_SYSTEM.BORDERS.MEDIUM,
      right: DESIGN_SYSTEM.BORDERS.THIN,
    };
  });
}

/**
 * 🎨 Apply alternating row styles with modern card-like appearance
 * @param {ExcelJS.Row} row - Row object
 * @param {object} rowData - Data for the row
 * @param {number} index - Row index
 */
function applyModernRowStyles(row, rowData, index) {
  const isEvenRow = index % 2 === 0;

  // Set row height based on content
  row.height = hasLongContent(rowData)
    ? DESIGN_SYSTEM.SPACING.EXPANDED_ROW_HEIGHT
    : DESIGN_SYSTEM.SPACING.ROW_HEIGHT;

  row.eachCell((cell, colNumber) => {
    // Base styling for all cells
    cell.font = {
      ...DESIGN_SYSTEM.TYPOGRAPHY.BODY,
      name: "Segoe UI",
      color: { argb: DESIGN_SYSTEM.COLORS.DARK_GRAY },
    };

    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: {
        argb: isEvenRow
          ? DESIGN_SYSTEM.COLORS.NEUTRAL.LIGHT_GRAY
          : DESIGN_SYSTEM.COLORS.NEUTRAL.WHITE,
      },
    };

    cell.alignment = {
      vertical: "middle",
      wrapText: true,
      horizontal: getColumnAlignment(colNumber),
    };

    cell.border = {
      top: DESIGN_SYSTEM.BORDERS.THIN,
      left: DESIGN_SYSTEM.BORDERS.THIN,
      bottom: DESIGN_SYSTEM.BORDERS.THIN,
      right: DESIGN_SYSTEM.BORDERS.THIN,
    };
  });

  // Special styling for status column
  applyStatusStyling(row, rowData.status);
}

/**
 * 🎯 Apply status-specific styling with modern badges
 * @param {ExcelJS.Row} row - Row object
 * @param {string} status - Status value
 */
function applyStatusStyling(row, status) {
  const statusCell = row.getCell("status");
  const statusUpper = (status || "PENDING").toUpperCase();

  let statusStyle = DESIGN_SYSTEM.COLORS.STATUS.WARNING; // Default: Pending

  if (["LOLOS", "APPROVED", "DITERIMA"].includes(statusUpper)) {
    statusStyle = DESIGN_SYSTEM.COLORS.STATUS.SUCCESS;
  } else if (["DITOLAK", "REJECTED", "GAGAL"].includes(statusUpper)) {
    statusStyle = DESIGN_SYSTEM.COLORS.STATUS.DANGER;
  }

  statusCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: statusStyle.BG },
  };

  statusCell.font = {
    ...DESIGN_SYSTEM.TYPOGRAPHY.BODY,
    bold: true,
    color: { argb: statusStyle.TEXT },
    name: "Segoe UI Semibold",
  };

  statusCell.alignment = {
    horizontal: "center",
    vertical: "middle",
  };
}

/**
 * 🔍 Check if row data contains long content requiring expanded height
 * @param {object} rowData - Row data object
 * @returns {boolean}
 */
function hasLongContent(rowData) {
  const longFields = [
    "alamat",
    "motto",
    "motivasi",
    "organisasi_list",
    "prestasi_list",
  ];
  return longFields.some(
    (field) => rowData[field] && rowData[field].length > 50
  );
}

/**
 * 📐 Get appropriate alignment for column
 * @param {number} colNumber - Column number (1-based)
 * @returns {string}
 */
function getColumnAlignment(colNumber) {
  // Column 1 (No) - center
  if (colNumber === 1) return "center";
  // Numeric-like columns - center
  if ([4, 7, 9, 18, 19].includes(colNumber)) return "center";
  // Default - left
  return "left";
}

/**
 * 🎨 Create modern info section with statistics
 * @param {ExcelJS.Worksheet} worksheet - Worksheet object
 * @param {Array} users - Users data
 * @param {number} startRow - Starting row number
 */
function addModernInfoSection(worksheet, users, startRow) {
  // Info section header
  const infoHeaderRow = worksheet.getRow(startRow);
  worksheet.mergeCells(`A${startRow}:D${startRow}`);

  const infoCell = worksheet.getCell(`A${startRow}`);
  infoCell.value = "📊 RINGKASAN DATA";
  infoCell.font = {
    ...DESIGN_SYSTEM.TYPOGRAPHY.SUBTITLE,
    color: { argb: DESIGN_SYSTEM.COLORS.PRIMARY.DARK },
  };
  infoCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: DESIGN_SYSTEM.COLORS.PRIMARY.LIGHT },
  };
  infoCell.alignment = { horizontal: "center", vertical: "middle" };
  infoHeaderRow.height = DESIGN_SYSTEM.SPACING.SUBTITLE_HEIGHT;

  // Statistics
  const stats = calculateStatistics(users);
  const statsRow = startRow + 1;

  const statLabels = [
    `Total Pendaftar: ${stats.total}`,
    `Lolos: ${stats.approved}`,
    `Ditolak: ${stats.rejected}`,
    `Pending: ${stats.pending}`,
  ];

  statLabels.forEach((label, index) => {
    const cell = worksheet.getCell(statsRow, index + 1);
    cell.value = label;
    cell.font = DESIGN_SYSTEM.TYPOGRAPHY.SMALL;
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
}

/**
 * 📊 Calculate data statistics
 * @param {Array} users - Users data
 * @returns {object} Statistics object
 */
function calculateStatistics(users) {
  const stats = {
    total: users.length,
    approved: 0,
    rejected: 0,
    pending: 0,
  };

  users.forEach((user) => {
    const status = (user.status || "PENDING").toUpperCase();
    if (["LOLOS", "APPROVED", "DITERIMA"].includes(status)) {
      stats.approved++;
    } else if (["DITOLAK", "REJECTED", "GAGAL"].includes(status)) {
      stats.rejected++;
    } else {
      stats.pending++;
    }
  });

  return stats;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🗄️ DATABASE OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 🔍 Fetch comprehensive user data from database with optimized query
 * @param {object} connection - Database connection
 * @returns {Promise<Array>} Users data array
 */
async function fetchComprehensiveUsersData(connection) {
  console.log("🔍 Fetching comprehensive user data...");

  try {
    // First, check what columns actually exist in the users table
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'users'
    `);

    const availableColumns = columns.map(col => col.COLUMN_NAME);
    console.log(`📋 Available columns: ${availableColumns.join(', ')}`);

    // Define the columns we want to select (only if they exist)
    const desiredColumns = [
      'id', 'ticket', 'status', 'nama_lengkap', 'nama_panggilan', 
      'kelas', 'jurusan', 'tempat_lahir', 'tanggal_lahir', 
      'jenis_kelamin', 'agama', 'nomor_telepon', 'email', 
      'alamat', 'hobi', 'motto', 'motivasi', 'foto_path',
      'created_at', 'updated_at', 'created_by', 'updated_by'
    ];

    // Filter to only include columns that actually exist
    const selectColumns = desiredColumns.filter(col => availableColumns.includes(col));
    console.log(`🎯 Selecting columns: ${selectColumns.join(', ')}`);

    const [users] = await connection.execute(`
      SELECT 
        ${selectColumns.map(col => `u.${col}`).join(',\n        ')},
        GROUP_CONCAT(DISTINCT d.nama_divisi ORDER BY d.nama_divisi SEPARATOR ', ') as divisi_list,
        GROUP_CONCAT(DISTINCT 
          CONCAT(o.nama_organisasi, ' (', COALESCE(o.jabatan, 'Anggota'), ' - ', o.tahun, ')') 
          ORDER BY o.tahun DESC 
          SEPARATOR ';\n'
        ) as organisasi_list,
        GROUP_CONCAT(DISTINCT 
          CONCAT(p.nama_prestasi, ' - ', p.tingkat, ' (', p.tahun, ')') 
          ORDER BY p.tahun DESC 
          SEPARATOR ';\n'
        ) as prestasi_list
      FROM users u
      LEFT JOIN divisi d ON u.id = d.user_id
      LEFT JOIN organisasi o ON u.id = o.user_id  
      LEFT JOIN prestasi p ON u.id = p.user_id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);

    console.log(`✅ Retrieved ${users.length} user records`);
    
    // Ensure all expected columns exist in the result (add null for missing ones)
    const enhancedUsers = users.map(user => {
      const enhancedUser = { ...user };
      
      // Add missing columns with null values
      desiredColumns.forEach(col => {
        if (!(col in enhancedUser)) {
          enhancedUser[col] = null;
        }
      });
      
      return enhancedUser;
    });
    
    return enhancedUsers;
  } catch (error) {
    console.error("❌ Error fetching comprehensive user data:", error);
    
    // Fallback: try very simple query with minimal columns
    console.log("🔄 Attempting minimal fallback query...");
    try {
      // Get basic columns that should definitely exist
      const [usersSimple] = await connection.execute(`
        SELECT 
          id,
          ticket,
          nama_lengkap,
          created_at
        FROM users 
        ORDER BY created_at DESC
      `);
      
      console.log(`✅ Retrieved ${usersSimple.length} user records (minimal mode)`);
      
      // Add all missing fields with null values
      return usersSimple.map(user => ({
        ...user,
        status: null,
        nama_panggilan: null,
        kelas: null,
        jurusan: null,
        tempat_lahir: null,
        tanggal_lahir: null,
        jenis_kelamin: null,
        agama: null,
        nomor_telepon: null,
        email: null,
        alamat: null,
        hobi: null,
        motto: null,
        motivasi: null,
        foto_path: null,
        updated_at: null,
        created_by: null,
        updated_by: null,
        divisi_list: null,
        organisasi_list: null,
        prestasi_list: null
      }));
    } catch (fallbackError) {
      console.error("❌ Minimal fallback query also failed:", fallbackError);
      
      // Last resort: try to get just the count to see if table exists
      try {
        const [count] = await connection.execute(`SELECT COUNT(*) as total FROM users`);
        console.log(`⚠️ Table exists but column access failed. Total records: ${count[0].total}`);
        
        // Return empty structure
        return [];
      } catch (finalError) {
        console.error("❌ Table might not exist:", finalError);
        throw new Error(`Cannot access users table: ${finalError.message}`);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 📊 MAIN EXCEL GENERATION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 🚀 Generate professionally styled Excel report with modern design
 * @returns {Promise<object>} Generation result object
 */
async function generateProfessionalExcelReport() {
  let connection;
  const startTime = Date.now();

  try {
    console.log("🚀 Initiating professional Excel report generation...");
    connection = await getConnection();

    // Fetch data
    const users = await fetchComprehensiveUsersData(connection);

    if (users.length === 0) {
      console.log("⚠️  No users found for Excel export.");
      return {
        success: false,
        message: "No data available for export",
      };
    }

    console.log(`📊 Processing ${users.length} user records...`);

    // ═══ Create Professional Workbook ═══
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "OSIS Recruitment System v2.0";
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.company = "SMA Negeri - OSIS";

    const worksheet = workbook.addWorksheet("📋 Data Pendaftar OSIS", {
      properties: { tabColor: { argb: DESIGN_SYSTEM.COLORS.PRIMARY.MEDIUM } },
    });

    // ═══ Report Title Section ═══
    let currentRow = 1;
    worksheet.mergeCells(`A${currentRow}:S${currentRow}`);
    const titleCell = worksheet.getCell(`A${currentRow}`);
    applyTitleStyle(
      titleCell,
      "🏫 LAPORAN KOMPREHENSIF PENDAFTARAN ANGGOTA OSIS"
    );
    worksheet.getRow(currentRow).height = DESIGN_SYSTEM.SPACING.TITLE_HEIGHT;
    currentRow++;

    // Date info
    worksheet.mergeCells(`A${currentRow}:S${currentRow}`);
    const dateCell = worksheet.getCell(`A${currentRow}`);
    dateCell.value = `📅 Generated on: ${new Date().toLocaleDateString(
      "id-ID",
      {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }
    )}`;
    dateCell.font = {
      ...DESIGN_SYSTEM.TYPOGRAPHY.SMALL,
      color: { argb: DESIGN_SYSTEM.COLORS.NEUTRAL.DARK_GRAY },
      italic: true,
    };
    dateCell.alignment = { horizontal: "center", vertical: "middle" };
    currentRow++;

    // Statistics section
    addModernInfoSection(worksheet, users, currentRow);
    currentRow += 3; // Space for stats section

    // ═══ Column Definitions ═══
    // Create dynamic columns based on available data
    const baseColumns = [
      { header: "No", key: "no", width: 6 },
      { header: "👤 Nama Lengkap", key: "nama_lengkap", width: 28 },
      { header: "📝 Panggilan", key: "nama_panggilan", width: 16 },
      { header: "🎓 Kelas", key: "kelas", width: 10 },
      { header: "📚 Jurusan", key: "jurusan", width: 14 },
      { header: "📍 Tempat, Tanggal Lahir", key: "ttl", width: 28 },
      { header: "⚧ Gender", key: "jenis_kelamin", width: 10 },
      { header: "🕌 Agama", key: "agama", width: 12 },
      { header: "📱 Telepon", key: "nomor_telepon", width: 16 },
    ];

    // Check if users have email data before adding email column
    const hasEmailData = users.some(user => user.email && user.email !== null);
    if (hasEmailData) {
      baseColumns.push({ header: "📧 Email", key: "email", width: 26 });
    }

    const modernColumns = [
      ...baseColumns,
      { header: "🏠 Alamat", key: "alamat", width: 35 },
      { header: "🎯 Hobi", key: "hobi", width: 22 },
      { header: "💭 Motto", key: "motto", width: 32 },
      { header: "🔥 Motivasi", key: "motivasi", width: 35 },
      { header: "🏢 Divisi Pilihan", key: "divisi_list", width: 24 },
      { header: "🏆 Pengalaman Organisasi", key: "organisasi_list", width: 38 },
      { header: "🥇 Prestasi", key: "prestasi_list", width: 38 },
      { header: "📊 Status", key: "status", width: 14 },
      { header: "📅 Tanggal Daftar", key: "created_at", width: 18 },
    ];

    worksheet.columns = modernColumns;

    // ═══ Apply Header Styling ═══
    const headerRow = worksheet.getRow(currentRow);
    applyModernHeaderStyle(headerRow);

    // ═══ Process and Style Data Rows ═══
    users.forEach((user, index) => {
      currentRow++;

      // Format birth place and date
      const ttl = formatBirthInfo(user.tempat_lahir, user.tanggal_lahir);

      const rowData = {
        no: index + 1,
        nama_lengkap: user.nama_lengkap || "-",
        nama_panggilan: user.nama_panggilan || "-",
        kelas: user.kelas || "-",
        jurusan: user.jurusan || "-",
        ttl: ttl,
        jenis_kelamin: user.jenis_kelamin || "-",
        agama: user.agama || "-",
        nomor_telepon: user.nomor_telepon || "-",
        alamat: user.alamat || "-",
        hobi: user.hobi || "-",
        motto: user.motto || "-",
        motivasi: user.motivasi || "-",
        divisi_list: user.divisi_list || "-",
        organisasi_list: formatListData(user.organisasi_list),
        prestasi_list: formatListData(user.prestasi_list),
        status: user.status || "PENDING",
        created_at: formatDateTime(user.created_at),
      };

      // Only add email if the column exists
      if (hasEmailData) {
        rowData.email = user.email || "-";
      }

      const row = worksheet.addRow(rowData);
      applyModernRowStyles(row, rowData, index);
    });

    // ═══ Advanced Excel Features ═══
    // Freeze panes
    worksheet.views = [
      {
        state: "frozen",
        ySplit: currentRow - users.length,
        activeCell: "A1",
      },
    ];

    // Auto filter
    const lastColumn = String.fromCharCode(65 + modernColumns.length - 1);
    worksheet.autoFilter = `A${currentRow - users.length}:${lastColumn}${
      currentRow - users.length
    }`;

    // Print settings
    worksheet.pageSetup = {
      paperSize: 9, // A4
      orientation: "landscape",
      fitToPage: true,
      margins: {
        left: 0.7,
        right: 0.7,
        top: 0.75,
        bottom: 0.75,
        header: 0.3,
        footer: 0.3,
      },
    };

    // ═══ File Generation ═══
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .split("T")[0];
    const fileName = `OSIS_Comprehensive_Report_${timestamp}.xlsx`;
    const tempDir = path.join(__dirname, "..", "exports");

    // Ensure export directory exists
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const filePath = path.join(tempDir, fileName);
    await workbook.xlsx.writeFile(filePath);

    // Calculate generation metrics
    const generationTime = ((Date.now() - startTime) / 1000).toFixed(2);
    const fileStats = fs.statSync(filePath);
    const fileSizeInMB = (fileStats.size / (1024 * 1024)).toFixed(2);

    console.log(`✨ Professional Excel report generated successfully!`);
    console.log(`📁 File: ${fileName}`);
    console.log(`⚡ Generation time: ${generationTime}s`);
    console.log(`📊 Records processed: ${users.length}`);
    console.log(`💾 File size: ${fileSizeInMB} MB`);

    return {
      success: true,
      filePath,
      fileName,
      totalRecords: users.length,
      fileSize: `${fileSizeInMB} MB`,
      generationTime: `${generationTime}s`,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("❌ Excel generation failed:", error);
    
    // Provide more specific error messages
    let errorMessage = "Excel generation failed";
    
    if (error.code === 'ER_BAD_FIELD_ERROR') {
      errorMessage = `Database column error: ${error.message}. Please check database schema.`;
    } else if (error.code === 'ER_NO_SUCH_TABLE') {
      errorMessage = `Database table not found: ${error.message}`;
    } else if (error.message.includes('ENOENT')) {
      errorMessage = "File system error: Unable to create export directory";
    } else {
      errorMessage = error.message;
    }
    
    return {
      success: false,
      error: errorMessage,
      code: error.code || 'UNKNOWN_ERROR',
      timestamp: new Date().toISOString(),
    };
  } finally {
    if (connection) {
      console.log("🔗 Releasing database connection...");
      connection.release();
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🛠️ UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 📅 Format birth information
 */
function formatBirthInfo(place, date) {
  if (!place && !date) return "-";
  if (!date) return place || "-";
  if (!place) return new Date(date).toLocaleDateString("id-ID");

  return `${place}, ${new Date(date).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  })}`;
}

/**
 * 📝 Format list data for better readability
 */
function formatListData(data) {
  if (!data || data === "-") return "-";
  return data.replace(/;/g, "\n•").replace(/^/, "•");
}

/**
 * 🕐 Format datetime
 */
function formatDateTime(datetime) {
  return new Date(datetime).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 📤 MODULE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  generateProfessionalExcelReport,
  generateEnhancedExcelReport: generateProfessionalExcelReport, // Legacy compatibility
  exportToExcel: generateProfessionalExcelReport, // Alternative alias
  DESIGN_SYSTEM, // Export design system for external usage
};

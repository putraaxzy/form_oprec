const { exec } = require("child_process");
const path = require("path");
const fs = require("fs-extra");
const archiver = require("archiver");
const { getConnection } = require("../database/mysql-database-refactored");

// Database backup utility with enhanced features
class DatabaseBackup {
  constructor() {
    this.backupDir = path.join(__dirname, "..", "backups");
    this.uploadsDir = path.join(__dirname, "..", "uploads");
    this.ensureBackupDirectory();
  }

  async ensureBackupDirectory() {
    try {
      await fs.ensureDir(this.backupDir);
      console.log(`✅ Backup directory ensured: ${this.backupDir}`);
    } catch (error) {
      console.error("❌ Error creating backup directory:", error.message);
    }
  }

  // Helper to format date for folder names (e.g., "senin_05092025")
  formatDateForFolder(date) {
    const days = [
      "minggu",
      "senin",
      "selasa",
      "rabu",
      "kamis",
      "jumat",
      "sabtu",
    ];
    const dayName = days[date.getDay()];
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${dayName}_${day}${month}${year}`;
  }

  // Helper to export user data to a JSON file
  async exportUserDataToJson(connection, userId, outputPath) {
    const [users] = await connection.execute(
      `SELECT u.*,
              GROUP_CONCAT(DISTINCT o.nama_organisasi, '||', o.jabatan, '||', o.tahun, '||', o.sertifikat_path SEPARATOR ';;') as organisasi_data,
              GROUP_CONCAT(DISTINCT p.nama_prestasi, '||', p.tingkat, '||', p.tahun, '||', p.sertifikat_path SEPARATOR ';;') as prestasi_data,
              GROUP_CONCAT(DISTINCT d.nama_divisi, '||', d.alasan SEPARATOR ';;') as divisi_data
       FROM users u
       LEFT JOIN organisasi o ON u.id = o.user_id
       LEFT JOIN prestasi p ON u.id = p.user_id
       LEFT JOIN divisi d ON u.id = d.user_id
       WHERE u.id = ?
       GROUP BY u.id`,
      [userId]
    );

    if (users.length === 0) return null;

    const userData = users[0];

    // Parse concatenated strings back into arrays of objects
    const parseConcatenatedData = (dataString, fields) => {
      if (!dataString) return [];
      return dataString.split(";;").map((item) => {
        const values = item.split("||");
        const obj = {};
        fields.forEach((field, index) => {
          obj[field] = values[index] || null;
        });
        return obj;
      });
    };

    userData.organisasi = parseConcatenatedData(userData.organisasi_data, [
      "nama_organisasi",
      "jabatan",
      "tahun",
      "sertifikat_path",
    ]);
    userData.prestasi = parseConcatenatedData(userData.prestasi_data, [
      "nama_prestasi",
      "tingkat",
      "tahun",
      "sertifikat_path",
    ]);
    userData.divisi = parseConcatenatedData(userData.divisi_data, [
      "nama_divisi",
      "alasan",
    ]);

    delete userData.organisasi_data;
    delete userData.prestasi_data;
    delete userData.divisi_data;

    await fs.writeJson(outputPath, userData, { spaces: 2 });
    return userData;
  }

  // Helper to copy user-specific uploaded files
  async copyUserUploads(userData, userBackupDir) {
    const filesToCopy = [];

    if (userData.foto_path) {
      filesToCopy.push({
        source: path.join(this.uploadsDir, "photos", userData.foto_path),
        destination: path.join(userBackupDir, userData.foto_path),
      });
    }

    userData.organisasi.forEach((org) => {
      if (org.sertifikat_path) {
        filesToCopy.push({
          source: path.join(
            this.uploadsDir,
            "certificates",
            org.sertifikat_path
          ),
          destination: path.join(userBackupDir, org.sertifikat_path),
        });
      }
    });

    userData.prestasi.forEach((pres) => {
      if (pres.sertifikat_path) {
        filesToCopy.push({
          source: path.join(
            this.uploadsDir,
            "certificates",
            pres.sertifikat_path
          ),
          destination: path.join(userBackupDir, pres.sertifikat_path),
        });
      }
    });

    for (const file of filesToCopy) {
      try {
        await fs.copy(file.source, file.destination);
        console.log(`   📄 Copied: ${path.basename(file.source)}`);
      } catch (error) {
        console.warn(
          `   ⚠️ Failed to copy ${path.basename(file.source)}: ${error.message}`
        );
      }
    }
  }

  async createIndividualUserBackups() {
    console.log("🗄️ Starting individual user backups...");
    const connection = await getConnection();

    try {
      const currentDate = new Date();
      const dailyFolderName = this.formatDateForFolder(currentDate);
      const dailyBackupPath = path.join(this.backupDir, dailyFolderName);
      await fs.ensureDir(dailyBackupPath);
      console.log(`✅ Daily backup directory created: ${dailyBackupPath}`);

      const [users] = await connection.execute(
        "SELECT id, nama_lengkap, ticket FROM users"
      );

      if (users.length === 0) {
        console.log("⚠️ No users found for individual backup.");
        return { success: true, message: "No users to backup." };
      }

      for (const user of users) {
        const userFolderName = `${user.nama_lengkap} - ${user.ticket}`;
        const userBackupDir = path.join(dailyBackupPath, userFolderName);
        await fs.ensureDir(userBackupDir);
        console.log(`  📁 Created user backup directory: ${userFolderName}`);

        // Export user data to JSON
        const userData = await this.exportUserDataToJson(
          connection,
          user.id,
          path.join(userBackupDir, "user_data.json")
        );
        if (userData) {
          console.log(`  ✅ Exported user data for ${user.nama_lengkap}`);
          // Copy uploaded files
          await this.copyUserUploads(userData, userBackupDir);
        } else {
          console.warn(`  ⚠️ Could not export data for user ID: ${user.id}`);
        }

        // Create a zip archive for the user's directory
        const output = fs.createWriteStream(
          path.join(dailyBackupPath, `${userFolderName}.zip`)
        );
        const archive = archiver("zip", { zlib: { level: 9 } });

        await new Promise((resolveZip, rejectZip) => {
          output.on("close", () => {
            console.log(`  ✅ Zipped user backup: ${userFolderName}.zip`);
            fs.remove(userBackupDir)
              .then(() => {
                console.log(
                  `  🗑️ Cleaned up temporary user directory: ${userFolderName}`
                );
                resolveZip();
              })
              .catch((err) => {
                console.error(
                  `  ❌ Error cleaning up user directory ${userFolderName}: ${err.message}`
                );
                rejectZip(err);
              });
          });
          archive.on("error", (err) => {
            console.error(
              `  ❌ Archiver error for ${userFolderName}: ${err.message}`
            );
            rejectZip(err);
          });

          archive.directory(userBackupDir, false); // Append the directory's contents
          archive.pipe(output);
          archive.finalize();
        });
      }

      console.log("✅ All individual user backups completed.");
      return { success: true, message: "Individual user backups created." };
    } catch (error) {
      console.error("❌ Individual user backup process error:", error.message);
      throw error;
    } finally {
      connection.release();
    }
  }

  async createDatabaseBackup() {
    // This function will now primarily trigger the individual user backups
    // The full mysqldump and uploads zip can be an alternative or separate process if needed.
    return await this.createIndividualUserBackups();
  }

  // Alternative backup method using SQL queries (fallback) - kept for reference
  async createSQLBackup() {
    try {
      console.log("🗄️ Creating SQL-based backup...");

      const connection = await getConnection();
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.-]/g, "_")
        .replace(/T/, "_")
        .replace(/Z/, "");

      const backupFileName = `osis_sql_backup_${timestamp}.sql`;
      const backupFilePath = path.join(this.backupDir, backupFileName);

      try {
        let sqlContent = `-- OSIS Recruitment Database Backup\n`;
        sqlContent += `-- Generated: ${new Date().toISOString()}\n`;
        sqlContent += `-- Database: ${
          process.env.DB_NAME || "osis_recruitment"
        }\n\n`;

        // Backup users table
        const [users] = await connection.execute("SELECT * FROM users");
        sqlContent += this.generateInsertStatements("users", users);

        // Backup organisasi table
        const [organisasi] = await connection.execute(
          "SELECT * FROM organisasi"
        );
        sqlContent += this.generateInsertStatements("organisasi", organisasi);

        // Backup prestasi table
        const [prestasi] = await connection.execute("SELECT * FROM prestasi");
        sqlContent += this.generateInsertStatements("prestasi", prestasi);

        // Backup divisi table
        const [divisi] = await connection.execute("SELECT * FROM divisi");
        sqlContent += this.generateInsertStatements("divisi", divisi);

        // Write backup file
        await fs.writeFile(backupFilePath, sqlContent);

        const stats = await fs.stat(backupFilePath);
        console.log(
          `✅ SQL backup created: ${backupFileName} (${this.formatFileSize(
            stats.size
          )})`
        );

        return {
          success: true,
          filePath: backupFilePath,
          fileName: backupFileName,
          size: stats.size,
          timestamp: new Date().toISOString(),
          method: "SQL",
        };
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error("❌ SQL backup error:", error.message);
      throw error;
    }
  }

  generateInsertStatements(tableName, data) {
    if (!data || data.length === 0) {
      return `-- No data in ${tableName} table\n\n`;
    }

    let sql = `-- Data for ${tableName} table\n`;
    const columns = Object.keys(data[0]);

    data.forEach((row) => {
      const values = columns.map((col) => {
        const value = row[col];
        if (value === null) return "NULL";
        if (typeof value === "string") {
          return `'${value.replace(/'/g, "''")}'`;
        }
        if (value instanceof Date) {
          return `'${value.toISOString().slice(0, 19).replace("T", " ")}'`;
        }
        return value;
      });

      sql += `INSERT INTO ${tableName} (${columns.join(
        ", "
      )}) VALUES (${values.join(", ")});\n`;
    });

    sql += "\n";
    return sql;
  }

  async listBackups() {
    try {
      const files = await fs.readdir(this.backupDir);
      const backupFiles = files
        .filter(
          (file) =>
            file.includes("backup") &&
            (file.endsWith(".sql") || file.endsWith(".zip"))
        )
        .map(async (file) => {
          const filePath = path.join(this.backupDir, file);
          const stats = await fs.stat(filePath);
          return {
            name: file,
            path: filePath,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime,
            type: file.endsWith(".zip") ? "ZIP" : "SQL",
          };
        });

      return Promise.all(backupFiles);
    } catch (error) {
      console.error("❌ Error listing backups:", error.message);
      return [];
    }
  }

  async cleanOldBackups(keepCount = 5) {
    try {
      const backups = await this.listBackups();

      if (backups.length <= keepCount) {
        console.log(
          `📁 ${backups.length} backups found, no cleanup needed (keeping ${keepCount})`
        );
        return;
      }

      // Sort by creation date (newest first) and remove old ones
      const sortedBackups = backups.sort((a, b) => b.created - a.created);
      const toDelete = sortedBackups.slice(keepCount);

      for (const backup of toDelete) {
        await fs.remove(backup.path);
        console.log(`🗑️ Deleted old backup: ${backup.name}`);
      }

      console.log(
        `✅ Cleaned ${toDelete.length} old backups, kept ${keepCount} recent ones`
      );
    } catch (error) {
      console.error("❌ Error cleaning old backups:", error.message);
    }
  }

  formatFileSize(bytes) {
    const sizes = ["B", "KB", "MB", "GB"];
    if (bytes === 0) return "0 B";
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round((bytes / Math.pow(1024, i)) * 100) / 100} ${sizes[i]}`;
  }
}

// Create singleton instance
const backupManager = new DatabaseBackup();

// Main backup function
async function createDatabaseBackup() {
  try {
    // Now, the primary backup method creates a zip archive
    return await backupManager.createDatabaseBackup();
  } catch (error) {
    console.error("❌ Full database backup failed:", error.message);
    throw error;
  }
}

// Export functions
module.exports = {
  createDatabaseBackup,
  backupManager,
};

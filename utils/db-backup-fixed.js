const { exec } = require("child_process");
const path = require("path");
const fs = require("fs-extra");
const archiver = require("archiver"); // Added for creating zip archives
const { getConnection } = require("../database/mysql-database-refactored");

// Database backup utility with enhanced features
class DatabaseBackup {
  constructor() {
    this.backupDir = path.join(__dirname, "..", "backups");
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

  async createDatabaseBackup() {
    try {
      console.log("🗄️ Starting full database and uploads backup...");

      const timestamp = new Date()
        .toISOString()
        .replace(/[:.-]/g, "_")
        .replace(/T/, "_")
        .replace(/Z/, "");

      const sqlFileName = `osis_db_dump_${timestamp}.sql`;
      const sqlFilePath = path.join(this.backupDir, sqlFileName);
      const zipFileName = `osis_full_backup_${timestamp}.zip`;
      const zipFilePath = path.join(this.backupDir, zipFileName);
      const uploadsDirPath = path.join(__dirname, "..", "uploads");

      // Get database connection info
      const connection = await getConnection();
      const dbName = process.env.DB_NAME || "osis_recruitment";
      const dbUser = process.env.DB_USER || "root";
      const dbPass = process.env.DB_PASSWORD || "";
      const dbHost = process.env.DB_HOST || "localhost";

      connection.release(); // Release connection immediately

      // 1. Create mysqldump command (schema and data)
      const dumpCmd = `mysqldump -h ${dbHost} -u ${dbUser} ${
        dbPass ? `-p${dbPass}` : ""
      } --single-transaction --routines --triggers ${dbName} > "${sqlFilePath}"`;

      await new Promise((resolve, reject) => {
        exec(dumpCmd, (error, stdout, stderr) => {
          if (error) {
            console.error("❌ mysqldump failed:", error.message);
            return reject(new Error(`mysqldump failed: ${error.message}`));
          }
          if (stderr && !stderr.includes("Warning")) {
            console.warn("⚠️ mysqldump warning:", stderr);
          }
          if (
            !fs.existsSync(sqlFilePath) ||
            fs.statSync(sqlFilePath).size === 0
          ) {
            return reject(new Error("SQL dump file not created or is empty"));
          }
          console.log(`✅ Database SQL dump created: ${sqlFileName}`);
          resolve();
        });
      });

      // 2. Create a zip archive
      const output = fs.createWriteStream(zipFilePath);
      const archive = archiver("zip", {
        zlib: { level: 9 }, // Sets the compression level.
      });

      return new Promise(async (resolveZip, rejectZip) => {
        output.on("close", async () => {
          const stats = await fs.stat(zipFilePath);
          console.log(`✅ Full backup created: ${zipFileName}`);
          console.log(`📁 Size: ${this.formatFileSize(stats.size)}`);
          // Clean up the temporary SQL dump file
          await fs.remove(sqlFilePath);
          console.log(`🗑️ Cleaned up temporary SQL dump: ${sqlFileName}`);
          resolveZip({
            success: true,
            filePath: zipFilePath,
            fileName: zipFileName,
            size: stats.size,
            timestamp: new Date().toISOString(),
            method: "ZIP",
          });
        });

        archive.on("warning", (err) => {
          if (err.code === "ENOENT") {
            console.warn("⚠️ Archiver warning:", err.message);
          } else {
            console.error("❌ Archiver warning:", err.message);
          }
        });

        archive.on("error", (err) => {
          console.error("❌ Archiver error:", err.message);
          rejectZip(new Error(`Archiver failed: ${err.message}`));
        });

        archive.pipe(output);

        // Add the SQL dump file to the archive
        archive.file(sqlFilePath, { name: sqlFileName });

        // Add the entire 'uploads' directory to the archive
        if (await fs.pathExists(uploadsDirPath)) {
          archive.directory(uploadsDirPath, "uploads");
          console.log(`📦 Added 'uploads' directory to backup`);
        } else {
          console.warn(
            `⚠️ 'uploads' directory not found at ${uploadsDirPath}, skipping.`
          );
        }

        await archive.finalize();
      });
    } catch (error) {
      console.error("❌ Full backup process error:", error.message);
      throw error;
    }
  }

  // Alternative backup method using SQL queries (fallback)
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

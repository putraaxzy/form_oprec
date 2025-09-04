const { exec } = require("child_process");
const path = require("path");
const fs = require("fs-extra");
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
      console.log("🗄️ Starting database backup...");

      const timestamp = new Date()
        .toISOString()
        .replace(/[:.-]/g, "_")
        .replace(/T/, "_")
        .replace(/Z/, "");

      const backupFileName = `osis_backup_${timestamp}.sql`;
      const backupFilePath = path.join(this.backupDir, backupFileName);

      // Get database connection info
      const connection = await getConnection();
      const dbName = process.env.DB_NAME || "osis_recruitment";
      const dbUser = process.env.DB_USER || "root";
      const dbPass = process.env.DB_PASSWORD || "";
      const dbHost = process.env.DB_HOST || "localhost";

      connection.release(); // Release connection immediately

      // Create mysqldump command
      const dumpCmd = `mysqldump -h ${dbHost} -u ${dbUser} ${
        dbPass ? `-p${dbPass}` : ""
      } --single-transaction --routines --triggers ${dbName} > "${backupFilePath}"`;

      return new Promise((resolve, reject) => {
        exec(dumpCmd, (error, stdout, stderr) => {
          if (error) {
            console.error("❌ Backup failed:", error.message);
            reject(new Error(`Backup failed: ${error.message}`));
            return;
          }

          if (stderr && !stderr.includes("Warning")) {
            console.error("❌ Backup warning:", stderr);
          }

          // Verify backup file exists and has content
          if (fs.existsSync(backupFilePath)) {
            const stats = fs.statSync(backupFilePath);
            if (stats.size > 0) {
              console.log(
                `✅ Database backup created successfully: ${backupFileName}`
              );
              console.log(`📁 Size: ${this.formatFileSize(stats.size)}`);
              resolve({
                success: true,
                filePath: backupFilePath,
                fileName: backupFileName,
                size: stats.size,
                timestamp: new Date().toISOString(),
              });
            } else {
              reject(new Error("Backup file is empty"));
            }
          } else {
            reject(new Error("Backup file not created"));
          }
        });
      });
    } catch (error) {
      console.error("❌ Backup process error:", error.message);
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
        .filter((file) => file.includes("backup") && file.endsWith(".sql"))
        .map(async (file) => {
          const filePath = path.join(this.backupDir, file);
          const stats = await fs.stat(filePath);
          return {
            name: file,
            path: filePath,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime,
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
    // Directly use the SQL-based backup method to ensure data is backed up
    // This method generates INSERT statements for existing data.
    return await backupManager.createSQLBackup();
  } catch (error) {
    console.error("❌ Database backup failed:", error.message);
    throw error;
  }
}

// Export functions
module.exports = {
  createDatabaseBackup,
  backupManager,
};

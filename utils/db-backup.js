const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const { dbConfig } = require("../database/mysql-database"); // Assuming dbConfig is exported

async function createDatabaseBackup() {
  return new Promise((resolve, reject) => {
    const timestamp = new Date().toISOString().replace(/[:.-]/g, "_");
    const backupFileName = `backup_db_${dbConfig.database}_${timestamp}.sql`;
    const backupFilePath = path.join(
      __dirname,
      "..",
      "uploads",
      "backups",
      backupFileName
    );

    // Ensure the backups directory exists
    const backupDir = path.join(__dirname, "..", "uploads", "backups");
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const mysqldumpPath = process.env.MYSQLDUMP_PATH || "mysqldump"; // Use env variable or fallback to global mysqldump
    const command = `${mysqldumpPath} -h ${dbConfig.host} -P ${
      dbConfig.port
    } -u ${dbConfig.user} ${
      dbConfig.password ? `-p${dbConfig.password}` : ""
    } ${dbConfig.database} > ${backupFilePath}`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`);
        return reject(
          new Error(`Database backup failed: ${stderr || error.message}`)
        );
      }
      if (stderr) {
        console.warn(`mysqldump stderr: ${stderr}`);
      }
      console.log(`Database backup created at: ${backupFilePath}`);
      resolve(backupFilePath);
    });
  });
}

module.exports = {
  createDatabaseBackup,
};

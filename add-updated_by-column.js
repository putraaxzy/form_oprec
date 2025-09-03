const { dbManager } = require("./database/mysql-database-refactored");

async function addUpdatedByColumn() {
  try {
    await dbManager.initialize();
    const connection = await dbManager.getConnection();
    try {
      console.log("🔄 Adding 'updated_by' column to 'users' table...");
      await connection.execute(
        "ALTER TABLE users ADD COLUMN updated_by VARCHAR(255) NULL AFTER updated_at;"
      );
      console.log("✅ 'updated_by' column added successfully.");
    } finally {
      connection.release();
    }
    await dbManager.close();
  } catch (error) {
    console.error("❌ Error adding 'updated_by' column:", error);
    process.exit(1);
  }
  process.exit(0);
}

addUpdatedByColumn();

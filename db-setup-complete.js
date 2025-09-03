const mysql = require("mysql2/promise");

// --- KONFIGURASI DATABASE ---
const dbConfig = {
  host: "localhost",
  port: 3306,
  user: "root",
  password: "",
  database: "osis_recruitment",
  charset: 'utf8mb4',
  collation: 'utf8mb4_unicode_ci',
  multipleStatements: true,
  connectTimeout: 60000,
  acquireTimeout: 60000
};

// --- KUMPULAN PERINTAH SQL YANG SUDAH DISESUAIKAN ---

const sqlCommands = [
  {
    description: "Membuat tabel 'users'...",
    query: `
      CREATE TABLE IF NOT EXISTS users (
        id INT PRIMARY KEY AUTO_INCREMENT,
        ticket VARCHAR(50) UNIQUE NOT NULL,
        status ENUM('PENDING', 'LOLOS', 'DITOLAK', 'PENDING_BOT_APPROVAL', 'PENDING_TERIMA', 'PENDING_TOLAK') DEFAULT 'PENDING',
        nama_lengkap VARCHAR(100) NOT NULL,
        nama_panggilan VARCHAR(50),
        kelas VARCHAR(20),
        jurusan VARCHAR(50),
        tempat_lahir VARCHAR(100),
        tanggal_lahir DATE,
        jenis_kelamin ENUM('Laki-laki', 'Perempuan'),
        agama VARCHAR(50),
        nomor_telepon VARCHAR(20) UNIQUE,
        alamat TEXT,
        hobi TEXT,
        motto TEXT,
        foto_path VARCHAR(500),
        motivasi TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        created_by VARCHAR(50) DEFAULT 'SYSTEM',
        updated_by VARCHAR(50) DEFAULT 'SYSTEM',
        INDEX idx_ticket (ticket),
        INDEX idx_status (status),
        INDEX idx_nama (nama_lengkap),
        INDEX idx_created (created_at),
        INDEX idx_phone (nomor_telepon)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,
  },
  {
    description: "Membuat tabel 'organisasi'...",
    query: `
      CREATE TABLE IF NOT EXISTS organisasi (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        nama_organisasi VARCHAR(200) NOT NULL,
        jabatan VARCHAR(100),
        tahun VARCHAR(20),
        sertifikat_path VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,
  },
  {
    description: "Membuat tabel 'prestasi' - DENGAN VARCHAR UNTUK FLEKSIBILITAS...",
    query: `
      CREATE TABLE IF NOT EXISTS prestasi (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        nama_prestasi VARCHAR(200) NOT NULL,
        tingkat VARCHAR(100) NOT NULL COMMENT 'Menggunakan VARCHAR untuk fleksibilitas input form',
        tahun VARCHAR(10),
        sertifikat_path VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_tingkat (tingkat)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,
  },
  {
    description: "Membuat tabel 'divisi' - DENGAN VARCHAR UNTUK FORM COMPATIBILITY...",
    query: `
      CREATE TABLE IF NOT EXISTS divisi (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        nama_divisi VARCHAR(100) NOT NULL COMMENT 'Mendukung: sekretaris, bendahara, keagamaan, media_jaringan, bakat_minat, jurnalistik, kedisiplinan',
        alasan TEXT,
        priority INT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_divisi (nama_divisi),
        UNIQUE KEY unique_user_divisi (user_id, nama_divisi)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,
  },
  {
    description: "Membuat tabel 'admin_logs'...",
    query: `
      CREATE TABLE IF NOT EXISTS admin_logs (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT,
        ticket VARCHAR(50),
        action ENUM('CREATE', 'APPROVE', 'REJECT', 'DELETE', 'UPDATE') NOT NULL,
        previous_status VARCHAR(50),
        new_status VARCHAR(50),
        reason TEXT,
        admin_name VARCHAR(100),
        admin_id VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_ticket (ticket),
        INDEX idx_action (action),
        INDEX idx_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,
  },
  {
    description: "Membuat tabel 'system_settings'...",
    query: `
      CREATE TABLE IF NOT EXISTS system_settings (
        id INT PRIMARY KEY AUTO_INCREMENT,
        setting_key VARCHAR(100) UNIQUE NOT NULL,
        setting_value TEXT,
        description TEXT,
        is_encrypted BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_key (setting_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,
  }
];

// --- REPAIR QUERIES UNTUK EXISTING TABLES ---
const repairQueries = [
  {
    description: "🔧 Memperbaiki tabel 'divisi' jika menggunakan ENUM...",
    query: `
      ALTER TABLE divisi MODIFY COLUMN nama_divisi VARCHAR(100) NOT NULL 
      COMMENT 'Updated to VARCHAR for form compatibility';
    `,
    condition: "divisi table exists and using ENUM"
  },
  {
    description: "🔧 Memperbaiki tabel 'prestasi' jika menggunakan ENUM...",
    query: `
      ALTER TABLE prestasi MODIFY COLUMN tingkat VARCHAR(100) NOT NULL 
      COMMENT 'Updated to VARCHAR for form compatibility';
    `,
    condition: "prestasi table exists and using ENUM"
  }
];

// --- FUNGSI ERROR HANDLER ---
async function handleDatabaseError(error, connection, query) {
  console.error(`❌ Database Error: ${error.code} - ${error.message}`);
  
  // Handle specific errors
  switch (error.code) {
    case 'WARN_DATA_TRUNCATED':
      console.log("🔧 Attempting to fix data truncation issue...");
      
      if (query.includes('divisi')) {
        try {
          await connection.query(`
            ALTER TABLE divisi MODIFY COLUMN nama_divisi VARCHAR(100) NOT NULL
          `);
          console.log("✅ Fixed divisi table structure");
          return true;
        } catch (repairError) {
          console.error("❌ Failed to repair divisi table");
        }
      }
      
      if (query.includes('prestasi')) {
        try {
          await connection.query(`
            ALTER TABLE prestasi MODIFY COLUMN tingkat VARCHAR(100) NOT NULL
          `);
          console.log("✅ Fixed prestasi table structure");
          return true;
        } catch (repairError) {
          console.error("❌ Failed to repair prestasi table");
        }
      }
      break;
      
    case 'ER_DUP_FIELDNAME':
      console.log("ℹ️ Column already exists, continuing...");
      return true;
      
    case 'ER_TABLE_EXISTS_ERROR':
      console.log("ℹ️ Table already exists, continuing...");
      return true;
      
    default:
      console.error("❌ Unhandled error type");
  }
  
  return false;
}

// --- FUNGSI VERIFIKASI DATABASE ---
async function verifyDatabaseStructure(connection) {
  console.log("\n🧪 Verifying database structure...");
  
  const tables = ['users', 'organisasi', 'prestasi', 'divisi', 'admin_logs', 'system_settings'];
  const results = {};
  
  for (const table of tables) {
    try {
      const [columns] = await connection.query(`SHOW COLUMNS FROM ${table}`);
      results[table] = {
        exists: true,
        columns: columns.length,
        details: columns.map(col => `${col.Field} (${col.Type})`)
      };
      console.log(`   ✅ Table '${table}' - ${columns.length} columns`);
    } catch (error) {
      results[table] = {
        exists: false,
        error: error.message
      };
      console.log(`   ❌ Table '${table}' - ${error.message}`);
    }
  }
  
  // Specific checks for problematic columns
  try {
    const [divisiCols] = await connection.query(`
      SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'divisi' AND COLUMN_NAME = 'nama_divisi'
    `);
    if (divisiCols.length > 0) {
      console.log(`   📊 divisi.nama_divisi type: ${divisiCols[0].COLUMN_TYPE}`);
    }
  } catch (error) {
    console.log(`   ⚠️ Could not check divisi column type: ${error.message}`);
  }
  
  try {
    const [prestasiCols] = await connection.query(`
      SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'prestasi' AND COLUMN_NAME = 'tingkat'
    `);
    if (prestasiCols.length > 0) {
      console.log(`   📊 prestasi.tingkat type: ${prestasiCols[0].COLUMN_TYPE}`);
    }
  } catch (error) {
    console.log(`   ⚠️ Could not check prestasi column type: ${error.message}`);
  }
  
  return results;
}

// --- FUNGSI UTAMA ---
async function setupDatabase() {
  let connection;
  try {
    console.log("🚀 Starting OSIS Recruitment Database Setup");
    console.log("=" .repeat(50));
    
    // 1. Connect to MySQL server (without database)
    console.log("🔄 Connecting to MySQL server...");
    connection = await mysql.createConnection({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
      multipleStatements: true
    });
    console.log("✅ Connected to MySQL server");

    // 2. Create database if not exists
    console.log(`🔄 Creating database '${dbConfig.database}'...`);
    await connection.query(`
      CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\` 
      CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log(`✅ Database '${dbConfig.database}' ready`);

    // 3. Use the database
    await connection.query(`USE \`${dbConfig.database}\``);
    console.log(`🔀 Switched to database '${dbConfig.database}'`);

    // 4. Execute table creation commands
    console.log("\n🏗️  Creating database tables...");
    let successCount = 0;
    let errorCount = 0;
    
    for (const [index, command] of sqlCommands.entries()) {
      try {
        console.log(`   ${index + 1}. ${command.description}`);
        await connection.query(command.query);
        successCount++;
        console.log("      ✅ Success");
      } catch (error) {
        console.log("      ❌ Error occurred");
        const repaired = await handleDatabaseError(error, connection, command.query);
        if (repaired) {
          console.log("      🔧 Auto-repaired, retrying...");
          try {
            await connection.query(command.query);
            successCount++;
            console.log("      ✅ Success after repair");
          } catch (retryError) {
            errorCount++;
            console.log("      ❌ Still failed after repair");
          }
        } else {
          errorCount++;
        }
      }
    }

    // 5. Run repair queries for existing problematic tables
    console.log("\n🔧 Running repair queries...");
    for (const repair of repairQueries) {
      try {
        console.log(`   ${repair.description}`);
        await connection.query(repair.query);
        console.log("      ✅ Repair successful");
      } catch (error) {
        if (error.code === 'ER_NO_SUCH_TABLE') {
          console.log("      ℹ️ Table doesn't exist, skipping");
        } else {
          console.log(`      ⚠️ Repair failed: ${error.message}`);
        }
      }
    }

    // 6. Insert default settings
    console.log("\n📋 Setting up default configuration...");
    try {
      await connection.query(`
        INSERT IGNORE INTO system_settings (setting_key, setting_value, description) VALUES
        ('registration_open', 'true', 'Whether registration is currently open'),
        ('max_file_size', '52428800', 'Maximum file size in bytes (50MB default)'),
        ('allowed_file_types', 'jpg,jpeg,png,pdf', 'Allowed file extensions'),
        ('telegram_notifications', 'true', 'Enable Telegram notifications'),
        ('auto_backup', 'true', 'Enable automatic database backups'),
        ('backup_retention_days', '30', 'Backup retention period in days')
      `);
      console.log("   ✅ Default settings configured");
    } catch (error) {
      console.log(`   ⚠️ Could not insert default settings: ${error.message}`);
    }

    // 7. Verify structure
    const verification = await verifyDatabaseStructure(connection);

    // 8. Summary
    console.log("\n📊 Setup Summary:");
    console.log(`   ✅ Success: ${successCount} operations`);
    console.log(`   ❌ Errors: ${errorCount} operations`);
    console.log(`   🎯 Database: ${dbConfig.database}`);
    console.log(`   🏠 Host: ${dbConfig.host}:${dbConfig.port}`);
    
    const tablesCreated = Object.values(verification).filter(t => t.exists).length;
    console.log(`   📋 Tables: ${tablesCreated}/6 created`);
    
    if (errorCount === 0 && tablesCreated === 6) {
      console.log("\n🎉 Database setup completed successfully!");
      console.log("🚀 OSIS Recruitment System is ready!");
      console.log("\n📋 Next steps:");
      console.log("   1. Test your application: pm2 restart oprec");
      console.log("   2. Check logs: pm2 log oprec");
      console.log("   3. Test registration form");
    } else {
      console.log("\n⚠️  Setup completed with some issues");
      console.log("📋 Please check the errors above");
    }

  } catch (error) {
    console.error("\n❌ Critical setup error:");
    console.error(`   Message: ${error.message}`);
    console.error(`   Code: ${error.code}`);
    console.error("\n🔧 Please check your MySQL configuration");
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log("\n🔌 Database connection closed");
    }
  }
}

// --- TESTING FUNCTION ---
async function testDatabaseConnection() {
  let connection;
  try {
    console.log("🧪 Testing database connection...");
    connection = await mysql.createConnection(dbConfig);
    
    const [rows] = await connection.query('SELECT COUNT(*) as count FROM users');
    console.log(`✅ Connection successful - Users table has ${rows[0].count} records`);
    
    return true;
  } catch (error) {
    console.error(`❌ Connection test failed: ${error.message}`);
    return false;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// --- EXPORTS ---
module.exports = {
  setupDatabase,
  testDatabaseConnection,
  dbConfig,
  sqlCommands,
  repairQueries
};

// --- RUN IF CALLED DIRECTLY ---
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--test')) {
    testDatabaseConnection();
  } else {
    setupDatabase();
  }
}

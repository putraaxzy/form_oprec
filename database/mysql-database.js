const mysql = require("mysql2/promise");

let pool = null;

// Konfigurasi database
const dbConfig = {
  host: process.env.MYSQL_HOST || "localhost",
  port: process.env.MYSQL_PORT || 3306,
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "osis_recruitment",
  charset: "utf8mb4",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

// Inisialisasi database
async function initDatabase() {
  try {
    // Buat connection pool
    pool = mysql.createPool(dbConfig);
    console.log("✅ Connected to MySQL database");

    // Test connection dan buat tabel
    const connection = await pool.getConnection();

    try {
      // Buat tabel users
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS users (
          id INT PRIMARY KEY AUTO_INCREMENT,
          ticket VARCHAR(50) UNIQUE NOT NULL,
          status ENUM('PENDING', 'LOLOS', 'DITOLAK', 'approved', 'rejected') DEFAULT 'PENDING',
          nama_lengkap VARCHAR(255) NOT NULL,
          nama_panggilan VARCHAR(100),
          kelas VARCHAR(20),
          jurusan VARCHAR(50),
          tempat_lahir VARCHAR(100),
          tanggal_lahir DATE,
          jenis_kelamin ENUM('Laki-laki', 'Perempuan'),
          agama VARCHAR(50),
          nomor_telepon VARCHAR(20) UNIQUE,
          email VARCHAR(255),
          alamat TEXT,
          hobi TEXT,
          motto TEXT,
          foto_path VARCHAR(500),
          motivasi TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_ticket (ticket),
          INDEX idx_phone (nomor_telepon),
          INDEX idx_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log("✅ Users table created successfully");

      // Buat tabel organisasi
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS organisasi (
          id INT PRIMARY KEY AUTO_INCREMENT,
          user_id INT NOT NULL,
          nama_organisasi VARCHAR(255) NOT NULL,
          jabatan VARCHAR(255),
          tahun VARCHAR(10),
          sertifikat_path VARCHAR(500),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          INDEX idx_user_id (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log("✅ Organisasi table created successfully");

      // Buat tabel prestasi
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS prestasi (
          id INT PRIMARY KEY AUTO_INCREMENT,
          user_id INT NOT NULL,
          nama_prestasi VARCHAR(255) NOT NULL,
          tingkat VARCHAR(100),
          tahun VARCHAR(10),
          sertifikat_path VARCHAR(500),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          INDEX idx_user_id (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log("✅ Prestasi table created successfully");

      // Buat tabel divisi
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS divisi (
          id INT PRIMARY KEY AUTO_INCREMENT,
          user_id INT NOT NULL,
          nama_divisi VARCHAR(100) NOT NULL,
          alasan TEXT,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          INDEX idx_user_id (user_id),
          INDEX idx_divisi (nama_divisi)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log("✅ Divisi table created successfully");
    } finally {
      connection.release();
    }

    console.log("✅ Database initialized successfully");
  } catch (error) {
    console.error("❌ Database initialization error:", error);
    throw error;
  }
}

// Get connection from pool
async function getConnection() {
  if (!pool) {
    throw new Error("Database pool not initialized");
  }
  return await pool.getConnection();
}

// Close database connection
async function closeConnection() {
  if (pool) {
    await pool.end();
    console.log("✅ MySQL connection pool closed");
  }
}

module.exports = {
  initDatabase,
  getConnection,
  closeConnection,
  dbConfig, // Export dbConfig
};

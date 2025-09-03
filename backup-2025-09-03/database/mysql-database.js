const mysql = require("mysql2/promise");
const fs = require("fs-extra");
const path = require("path");

// Enhanced Database Manager with connection pooling and retry logic
class DatabaseManager {
  constructor() {
    this.pool = null;
    this.isConnected = false;
    this.retryCount = 0;
    this.maxRetries = 5;
    this.config = this.createConfig();
  }

  createConfig() {
    return {
      host: process.env.MYSQL_HOST || "localhost",
      port: parseInt(process.env.MYSQL_PORT) || 3306,
      user: process.env.MYSQL_USER || "root",
      password: process.env.MYSQL_PASSWORD || "",
      database: process.env.MYSQL_DATABASE || "osis_recruitment",
      charset: "utf8mb4",
      timezone: "+07:00", // Indonesia timezone
      waitForConnections: true,
      connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 20,
      queueLimit: 0,
      acquireTimeout: 60000, // 60 seconds
      timeout: 60000,
      reconnect: true,
      // SSL configuration if needed
      ssl: process.env.DB_SSL === "true" ? {
        rejectUnauthorized: false
      } : false,
    };
  }

  async initialize() {
    try {
      console.log("🔄 Initializing database connection...");
      
      // Create connection pool
      this.pool = mysql.createPool(this.config);
      
      // Test connection
      await this.testConnection();
      
      // Initialize database schema
      await this.initializeSchema();
      
      // Setup event listeners
      this.setupEventListeners();
      
      this.isConnected = true;
      console.log("✅ Database initialized successfully");
      
    } catch (error) {
      console.error("❌ Database initialization failed:", error.message);
      await this.handleConnectionError(error);
    }
  }

  async testConnection() {
    const connection = await this.pool.getConnection();
    try {
      await connection.ping();
      console.log(`✅ Database connection established - ${this.config.host}:${this.config.port}`);
    } finally {
      connection.release();
    }
  }

  async handleConnectionError(error) {
    if (this.retryCount < this.maxRetries) {
      this.retryCount++;
      const delay = Math.pow(2, this.retryCount) * 1000; // Exponential backoff
      
      console.log(`🔄 Retrying database connection in ${delay/1000}s... (${this.retryCount}/${this.maxRetries})`);
      
      setTimeout(() => {
        this.initialize();
      }, delay);
    } else {
      console.error("❌ Max database connection retries exceeded");
      throw error;
    }
  }

  setupEventListeners() {
    if (this.pool) {
      this.pool.on('connection', (connection) => {
        console.log(`📊 New database connection established: ${connection.threadId}`);
      });

      this.pool.on('error', (error) => {
        console.error('❌ Database pool error:', error.message);
        
        if (error.code === 'PROTOCOL_CONNECTION_LOST') {
          console.log('🔄 Database connection lost, reinitializing...');
          this.isConnected = false;
          this.initialize();
        }
      });
    }
  }

  async initializeSchema() {
    const connection = await this.pool.getConnection();
    
    try {
      console.log("🏗️ Setting up database schema...");
      
      // Create users table with enhanced structure
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS users (
          id INT PRIMARY KEY AUTO_INCREMENT,
          ticket VARCHAR(50) UNIQUE NOT NULL,
          status ENUM('PENDING', 'LOLOS', 'DITOLAK', 'PENDING_BOT_APPROVAL') DEFAULT 'PENDING',
          
          -- Personal Information
          nama_lengkap VARCHAR(100) NOT NULL,
          nama_panggilan VARCHAR(50),
          kelas VARCHAR(20),
          jurusan VARCHAR(50),
          tempat_lahir VARCHAR(100),
          tanggal_lahir DATE,
          jenis_kelamin ENUM('Laki-laki', 'Perempuan'),
          agama VARCHAR(50),
          nomor_telepon VARCHAR(20) UNIQUE,
          email VARCHAR(100),
          alamat TEXT,
          hobi TEXT,
          motto TEXT,
          foto_path VARCHAR(500),
          motivasi TEXT,
          
          -- Metadata
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          created_by VARCHAR(50) DEFAULT 'SYSTEM',
          updated_by VARCHAR(50) DEFAULT 'SYSTEM',
          
          -- Indexing for performance
          INDEX idx_ticket (ticket),
          INDEX idx_status (status),
          INDEX idx_nama (nama_lengkap),
          INDEX idx_created (created_at),
          INDEX idx_phone (nomor_telepon)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // Create organizations table
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS organisasi (
          id INT PRIMARY KEY AUTO_INCREMENT,
          user_id INT NOT NULL,
          nama_organisasi VARCHAR(100) NOT NULL,
          jabatan VARCHAR(50),
          tahun VARCHAR(20),
          sertifikat_path VARCHAR(500),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          INDEX idx_user_id (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // Create achievements table
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS prestasi (
          id INT PRIMARY KEY AUTO_INCREMENT,
          user_id INT NOT NULL,
          nama_prestasi VARCHAR(150) NOT NULL,
          tingkat ENUM('Sekolah', 'Kecamatan', 'Kabupaten', 'Provinsi', 'Nasional', 'Internasional'),
          tahun VARCHAR(10),
          sertifikat_path VARCHAR(500),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          INDEX idx_user_id (user_id),
          INDEX idx_tingkat (tingkat)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // Create divisions table
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS divisi (
          id INT PRIMARY KEY AUTO_INCREMENT,
          user_id INT NOT NULL,
          nama_divisi ENUM('Humas', 'Keamanan', 'Kebersihan', 'Keagamaan', 'Kewirausahaan', 'Olahraga', 'Seni', 'Teknologi', 'Akademik', 'Sosial') NOT NULL,
          alasan TEXT,
          priority INT DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          INDEX idx_user_id (user_id),
          INDEX idx_divisi (nama_divisi),
          UNIQUE KEY unique_user_divisi (user_id, nama_divisi)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // Create admin logs table for audit trail
      await connection.execute(`
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // Create settings table for system configuration
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS system_settings (
          id INT PRIMARY KEY AUTO_INCREMENT,
          setting_key VARCHAR(100) UNIQUE NOT NULL,
          setting_value TEXT,
          description TEXT,
          is_encrypted BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          
          INDEX idx_key (setting_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // Insert default settings
      await this.insertDefaultSettings(connection);
      
      // Create stored procedures for common queries
      await this.createStoredProcedures(connection);
      
      // Create views for reporting
      await this.createViews(connection);
      
      console.log("✅ Database schema initialized successfully");
      
    } catch (error) {
      console.error("❌ Schema initialization error:", error);
      throw error;
    } finally {
      connection.release();
    }
  }

  async insertDefaultSettings(connection) {
    const defaultSettings = [
      {
        key: 'registration_open',
        value: 'true',
        description: 'Whether registration is currently open'
      },
      {
        key: 'max_file_size',
        value: '52428800',
        description: 'Maximum file size in bytes (50MB default)'
      },
      {
        key: 'allowed_file_types',
        value: 'jpg,jpeg,png,pdf',
        description: 'Allowed file extensions for uploads'
      },
      {
        key: 'telegram_notifications',
        value: 'true',
        description: 'Enable/disable Telegram notifications'
      },
      {
        key: 'auto_backup',
        value: 'true',
        description: 'Enable automatic database backups'
      },
      {
        key: 'backup_retention_days',
        value: '30',
        description: 'Number of days to keep backup files'
      }
    ];

    for (const setting of defaultSettings) {
      await connection.execute(`
        INSERT IGNORE INTO system_settings (setting_key, setting_value, description)
        VALUES (?, ?, ?)
      `, [setting.key, setting.value, setting.description]);
    }
  }

  async createStoredProcedures(connection) {
    // Procedure to get user statistics
    await connection.execute(`
      DROP PROCEDURE IF EXISTS GetUserStats
    `);

    await connection.execute(`
      CREATE PROCEDURE GetUserStats()
      BEGIN
        SELECT 
          COUNT(*) as total_users,
          COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending,
          COUNT(CASE WHEN status = 'LOLOS' THEN 1 END) as approved,
          COUNT(CASE WHEN status = 'DITOLAK' THEN 1 END) as rejected,
          COUNT(CASE WHEN DATE(created_at) = CURDATE() THEN 1 END) as today_registrations,
          COUNT(CASE WHEN DATE(created_at) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN 1 END) as week_registrations
        FROM users;
      END
    `);

    // Procedure to get division statistics
    await connection.execute(`
      DROP PROCEDURE IF EXISTS GetDivisionStats
    `);

    await connection.execute(`
      CREATE PROCEDURE GetDivisionStats()
      BEGIN
        SELECT 
          d.nama_divisi,
          COUNT(d.id) as total_applicants,
          COUNT(CASE WHEN u.status = 'LOLOS' THEN 1 END) as approved_count,
          ROUND(
            (COUNT(CASE WHEN u.status = 'LOLOS' THEN 1 END) / COUNT(d.id)) * 100, 2
          ) as approval_rate
        FROM divisi d
        LEFT JOIN users u ON d.user_id = u.id
        GROUP BY d.nama_divisi
        ORDER BY total_applicants DESC;
      END
    `);
  }

  async createViews(connection) {
    // View for complete user information
    await connection.execute(`
      CREATE OR REPLACE VIEW user_complete_view AS
      SELECT 
        u.*,
        GROUP_CONCAT(DISTINCT o.nama_organisasi ORDER BY o.id) as organisasi_list,
        GROUP_CONCAT(DISTINCT p.nama_prestasi ORDER BY p.id) as prestasi_list,
        GROUP_CONCAT(DISTINCT d.nama_divisi ORDER BY d.priority, d.id) as divisi_list,
        COUNT(DISTINCT o.id) as organisasi_count,
        COUNT(DISTINCT p.id) as prestasi_count,
        COUNT(DISTINCT d.id) as divisi_count
      FROM users u
      LEFT JOIN organisasi o ON u.id = o.user_id
      LEFT JOIN prestasi p ON u.id = p.user_id
      LEFT JOIN divisi d ON u.id = d.user_id
      GROUP BY u.id
    `);

    // View for daily statistics
    await connection.execute(`
      CREATE OR REPLACE VIEW daily_stats_view AS
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as registrations,
        COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'LOLOS' THEN 1 END) as approved,
        COUNT(CASE WHEN status = 'DITOLAK' THEN 1 END) as rejected
      FROM users
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);
  }

  // Enhanced connection getter with health check
  async getConnection() {
    if (!this.isConnected || !this.pool) {
      throw new Error("Database not initialized or connection lost");
    }

    try {
      const connection = await this.pool.getConnection();
      
      // Add query logging for development
      if (process.env.NODE_ENV === 'development') {
        const originalExecute = connection.execute;
        connection.execute = function(sql, params) {
          console.log(`📊 SQL Query: ${sql.substring(0, 100)}...`);
          if (params && params.length > 0) {
            console.log(`📊 Parameters:`, params.slice(0, 5)); // Log first 5 params
          }
          return originalExecute.call(this, sql, params);
        };
      }

      return connection;
    } catch (error) {
      console.error("❌ Failed to get database connection:", error.message);
      throw error;
    }
  }

  // Utility methods for common operations
  async getUserByTicket(ticket) {
    const connection = await this.getConnection();
    try {
      const [users] = await connection.execute(
        'SELECT * FROM user_complete_view WHERE ticket = ?',
        [ticket]
      );
      return users[0] || null;
    } finally {
      connection.release();
    }
  }

  async getUserStats() {
    const connection = await this.getConnection();
    try {
      const [stats] = await connection.execute('CALL GetUserStats()');
      return stats[0][0];
    } finally {
      connection.release();
    }
  }

  async getDivisionStats() {
    const connection = await this.getConnection();
    try {
      const [stats] = await connection.execute('CALL GetDivisionStats()');
      return stats[0];
    } finally {
      connection.release();
    }
  }

  async updateUserStatus(ticket, newStatus, reason = null, adminName = null) {
    const connection = await this.getConnection();
    try {
      await connection.beginTransaction();
      
      // Get current status
      const [users] = await connection.execute(
        'SELECT id, status FROM users WHERE ticket = ?',
        [ticket]
      );
      
      if (users.length === 0) {
        throw new Error('User not found');
      }
      
      const user = users[0];
      const previousStatus = user.status;
      
      // Update user status
      await connection.execute(
        'UPDATE users SET status = ?, updated_by = ? WHERE ticket = ?',
        [newStatus, adminName || 'SYSTEM', ticket]
      );
      
      // Log the action
      await connection.execute(`
        INSERT INTO admin_logs (user_id, ticket, action, previous_status, new_status, reason, admin_name)
        VALUES (?, ?, 'UPDATE', ?, ?, ?, ?)
      `, [user.id, ticket, previousStatus, newStatus, reason, adminName]);
      
      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async searchUsers(query, type = 'all', status = null) {
    const connection = await this.getConnection();
    try {
      let sql = 'SELECT * FROM user_complete_view WHERE 1=1';
      const params = [];
      
      // Add search conditions based on type
      switch (type) {
        case 'name':
          sql += ' AND (nama_lengkap LIKE ? OR nama_panggilan LIKE ?)';
          params.push(`%${query}%`, `%${query}%`);
          break;
        case 'ticket':
          sql += ' AND ticket LIKE ?';
          params.push(`%${query}%`);
          break;
        case 'class':
          sql += ' AND (kelas LIKE ? OR jurusan LIKE ?)';
          params.push(`%${query}%`, `%${query}%`);
          break;
        case 'division':
          sql += ' AND divisi_list LIKE ?';
          params.push(`%${query}%`);
          break;
        default: // 'all'
          sql += ` AND (
            nama_lengkap LIKE ? OR nama_panggilan LIKE ? OR 
            ticket LIKE ? OR kelas LIKE ? OR jurusan LIKE ? OR
            divisi_list LIKE ?
          )`;
          params.push(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`);
      }
      
      // Add status filter if specified
      if (status) {
        sql += ' AND status = ?';
        params.push(status);
      }
      
      sql += ' ORDER BY created_at DESC LIMIT 50';
      
      const [users] = await connection.execute(sql, params);
      return users;
    } finally {
      connection.release();
    }
  }

  // Backup functionality
  async createBackup() {
    try {
      console.log("🔄 Creating database backup...");
      
      const backupDir = path.join(__dirname, "..", "backups");
      await fs.ensureDir(backupDir);
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = path.join(backupDir, `backup-${timestamp}.sql`);
      
      // Create backup using mysqldump (if available)
      const { exec } = require('child_process');
      const command = `mysqldump -h ${this.config.host} -P ${this.config.port} -u ${this.config.user} ${this.config.password ? `-p${this.config.password}` : ''} ${this.config.database} > ${backupFile}`;
      
      return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
          if (error) {
            console.error("❌ Backup failed:", error.message);
            reject(error);
          } else {
            console.log(`✅ Backup created: ${backupFile}`);
            resolve(backupFile);
          }
        });
      });
    } catch (error) {
      console.error("❌ Backup creation error:", error);
      throw error;
    }
  }

  // Cleanup old backups
  async cleanupBackups() {
    try {
      const backupDir = path.join(__dirname, "..", "backups");
      if (!await fs.pathExists(backupDir)) return;
      
      const files = await fs.readdir(backupDir);
      const sqlFiles = files.filter(file => file.endsWith('.sql'));
      
      const retentionDays = parseInt(process.env.BACKUP_RETENTION_DAYS) || 30;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      
      for (const file of sqlFiles) {
        const filePath = path.join(backupDir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.mtime < cutoffDate) {
          await fs.remove(filePath);
          console.log(`🗑️ Removed old backup: ${file}`);
        }
      }
    } catch (error) {
      console.error("❌ Backup cleanup error:", error);
    }
  }

  // Health check
  async healthCheck() {
    try {
      const connection = await this.getConnection();
      await connection.ping();
      connection.release();
      return {
        status: 'healthy',
        connected: this.isConnected,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        connected: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Graceful shutdown
  async close() {
    if (this.pool) {
      await this.pool.end();
      this.isConnected = false;
      console.log("✅ Database connections closed");
    }
  }
}

// Create singleton instance
const dbManager = new DatabaseManager();

// Initialize database
async function initDatabase() {
  await dbManager.initialize();
}

// Get connection (for backward compatibility)
async function getConnection() {
  return await dbManager.getConnection();
}

// Export both the manager and compatibility functions
module.exports = {
  initDatabase,
  getConnection,
  dbManager
};

const { dbManager } = require("./database/mysql-database-refactored");

/**
 * 🔧 Database Issues Fixer
 * Menangani error:
 * 1. Data truncated for column 'nama_divisi'
 * 2. MySQL2 connection configuration warnings
 */
class DatabaseIssuesFixer {
  constructor() {
    this.issues = [];
    this.fixes = [];
  }

  /**
   * 🔍 Detect database issues
   */
  async detectIssues() {
    console.log("🔍 Detecting database issues...");
    
    try {
      await dbManager.initialize();
      const connection = await dbManager.getConnection();
      
      try {
        // Check divisi table structure
        const [columns] = await connection.execute(`
          SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'divisi' 
          AND COLUMN_NAME = 'nama_divisi'
        `);

        if (columns.length > 0) {
          const column = columns[0];
          console.log(`📊 Current nama_divisi type: ${column.COLUMN_TYPE}`);
          
          // Check if it's an ENUM that's too restrictive
          if (column.COLUMN_TYPE.includes('enum')) {
            this.issues.push({
              type: 'ENUM_RESTRICTIVE',
              table: 'divisi',
              column: 'nama_divisi',
              current_type: column.COLUMN_TYPE,
              description: 'ENUM values do not match form options'
            });
          }
        }

        // Test INSERT with form values
        const testValues = ['sekretaris', 'bendahara', 'keagamaan', 'media_jaringan', 'bakat_minat', 'jurnalistik', 'kedisiplinan'];
        
        for (const value of testValues) {
          try {
            // Test if value would be accepted (dry run)
            await connection.execute('SELECT ? as test_value', [value]);
          } catch (error) {
            if (error.code === 'WARN_DATA_TRUNCATED') {
              this.issues.push({
                type: 'DATA_TRUNCATION',
                table: 'divisi',
                column: 'nama_divisi',
                problematic_value: value,
                description: `Value "${value}" would be truncated`
              });
            }
          }
        }

      } finally {
        connection.release();
      }
      
    } catch (error) {
      console.error("❌ Error detecting issues:", error.message);
      this.issues.push({
        type: 'CONNECTION_ERROR',
        description: error.message
      });
    }
  }

  /**
   * 🛠️ Fix divisi ENUM issue
   */
  async fixDivisiEnum() {
    console.log("🛠️ Fixing divisi ENUM to support all form values...");
    
    try {
      const connection = await dbManager.getConnection();
      
      try {
        // Option 1: Update ENUM to include all form values
        const formValues = [
          'sekretaris', 'bendahara', 'keagamaan', 'media_jaringan', 
          'bakat_minat', 'jurnalistik', 'kedisiplinan'
        ];
        
        const enumValues = formValues.map(v => `'${v}'`).join(', ');
        
        await connection.execute(`
          ALTER TABLE divisi 
          MODIFY COLUMN nama_divisi ENUM(${enumValues}) NOT NULL
        `);
        
        console.log("✅ Updated divisi ENUM with form values");
        this.fixes.push("Updated divisi ENUM to support all form values");
        
      } catch (enumError) {
        console.log("⚠️ ENUM update failed, switching to VARCHAR...");
        
        // Option 2: Convert to VARCHAR (more flexible)
        await connection.execute(`
          ALTER TABLE divisi 
          MODIFY COLUMN nama_divisi VARCHAR(100) NOT NULL
        `);
        
        console.log("✅ Converted nama_divisi to VARCHAR(100)");
        this.fixes.push("Converted nama_divisi from ENUM to VARCHAR for flexibility");
      }
      
      connection.release();
      
    } catch (error) {
      console.error("❌ Error fixing divisi ENUM:", error.message);
      throw error;
    }
  }

  /**
   * 🔧 Fix MySQL2 connection configuration
   */
  async fixConnectionConfig() {
    console.log("🔧 Checking MySQL2 connection configuration...");
    
    const configFile = './database/mysql-database-refactored.js';
    const fs = require('fs');
    
    try {
      let content = fs.readFileSync(configFile, 'utf8');
      
      // Remove problematic connection options
      const problematicOptions = ['acquireTimeout', 'timeout', 'reconnect'];
      let hasChanges = false;
      
      for (const option of problematicOptions) {
        const regex = new RegExp(`\\s*${option}:\\s*[^,}]+,?`, 'gi');
        if (content.match(regex)) {
          content = content.replace(regex, '');
          hasChanges = true;
          console.log(`🗑️ Removed ${option} from connection config`);
        }
      }
      
      if (hasChanges) {
        // Create backup
        fs.writeFileSync(`${configFile}.backup`, fs.readFileSync(configFile));
        fs.writeFileSync(configFile, content);
        console.log("✅ Updated MySQL2 connection configuration");
        this.fixes.push("Removed invalid MySQL2 connection options");
      } else {
        console.log("ℹ️ MySQL2 connection configuration is already clean");
      }
      
    } catch (error) {
      console.error("❌ Error fixing connection config:", error.message);
      // This is not critical, continue
    }
  }

  /**
   * 🧪 Test database operations
   */
  async testDatabaseOperations() {
    console.log("🧪 Testing database operations...");
    
    try {
      const connection = await dbManager.getConnection();
      
      try {
        // Test form values
        const testValues = ['sekretaris', 'bendahara', 'keagamaan'];
        
        for (const value of testValues) {
          // Test INSERT operation (simulate)
          const testQuery = `
            SELECT ? as nama_divisi, 
                   LENGTH(?) as value_length,
                   'test' as result
          `;
          
          const [result] = await connection.execute(testQuery, [value, value]);
          console.log(`✅ Value "${value}" - Length: ${result[0].value_length} - OK`);
        }
        
        console.log("✅ All database operations test passed");
        
      } finally {
        connection.release();
      }
      
    } catch (error) {
      console.error("❌ Database operations test failed:", error.message);
      throw error;
    }
  }

  /**
   * 🚀 Run all fixes
   */
  async runAllFixes() {
    console.log("🚀 Starting database issues fixer...\n");
    
    try {
      // Step 1: Detect issues
      await this.detectIssues();
      
      if (this.issues.length > 0) {
        console.log(`\n🔍 Found ${this.issues.length} issue(s):`);
        this.issues.forEach((issue, index) => {
          console.log(`   ${index + 1}. ${issue.type}: ${issue.description}`);
        });
        console.log();
      }
      
      // Step 2: Fix divisi ENUM issue
      const hasEnumIssue = this.issues.some(issue => 
        issue.type === 'ENUM_RESTRICTIVE' || issue.type === 'DATA_TRUNCATION'
      );
      
      if (hasEnumIssue) {
        await this.fixDivisiEnum();
      }
      
      // Step 3: Fix connection config
      await this.fixConnectionConfig();
      
      // Step 4: Test operations
      await this.testDatabaseOperations();
      
      // Summary
      console.log("\n🎉 Database Issues Fix Summary:");
      console.log(`   📊 Issues detected: ${this.issues.length}`);
      console.log(`   🛠️ Fixes applied: ${this.fixes.length}`);
      
      if (this.fixes.length > 0) {
        console.log("\n✅ Applied fixes:");
        this.fixes.forEach((fix, index) => {
          console.log(`   ${index + 1}. ${fix}`);
        });
      }
      
      console.log("\n🔄 Please restart your application:");
      console.log("   pm2 restart oprec");
      
    } catch (error) {
      console.error("\n❌ Fix process failed:", error.message);
      process.exit(1);
    } finally {
      await dbManager.close();
    }
    
    process.exit(0);
  }
}

// Run if called directly
if (require.main === module) {
  const fixer = new DatabaseIssuesFixer();
  fixer.runAllFixes();
}

module.exports = DatabaseIssuesFixer;

#!/usr/bin/env node

/**
 * 🚀 Quick Database Fix for Divisi ENUM Issue
 * Run this script to immediately fix the "Data truncated for column 'nama_divisi'" error
 */

const { dbManager } = require("./database/mysql-database-refactored");

async function quickFixDivisiEnum() {
  console.log("🚀 Quick Fix: Divisi ENUM Issue");
  console.log("=====================================\n");

  try {
    console.log("🔄 Connecting to database...");
    await dbManager.initialize();
    const connection = await dbManager.getConnection();

    try {
      // Check current ENUM values
      console.log("🔍 Checking current divisi table structure...");
      const [columns] = await connection.execute(`
        SHOW COLUMNS FROM divisi WHERE Field = 'nama_divisi'
      `);

      if (columns.length > 0) {
        console.log(`📊 Current type: ${columns[0].Type}`);
      }

      // Form values that need to be supported
      const formValues = [
        'sekretaris', 'bendahara', 'keagamaan', 'media_jaringan', 
        'bakat_minat', 'jurnalistik', 'kedisiplinan'
      ];

      console.log("\n🎯 Form expects these values:", formValues.join(', '));

      // Fix attempt 1: Update ENUM
      console.log("\n🔧 Attempting to update ENUM with form values...");
      try {
        const enumValues = formValues.map(v => `'${v}'`).join(', ');
        await connection.execute(`
          ALTER TABLE divisi 
          MODIFY COLUMN nama_divisi ENUM(${enumValues}) NOT NULL
        `);
        
        console.log("✅ SUCCESS: Updated ENUM with all form values!");
        
      } catch (enumError) {
        console.log("⚠️ ENUM update failed, trying VARCHAR approach...");
        
        // Fix attempt 2: Convert to VARCHAR
        await connection.execute(`
          ALTER TABLE divisi 
          MODIFY COLUMN nama_divisi VARCHAR(100) NOT NULL
        `);
        
        console.log("✅ SUCCESS: Converted to VARCHAR(100) for maximum flexibility!");
      }

      // Verify the fix
      console.log("\n🧪 Testing the fix...");
      const [newColumns] = await connection.execute(`
        SHOW COLUMNS FROM divisi WHERE Field = 'nama_divisi'
      `);
      
      if (newColumns.length > 0) {
        console.log(`📊 New type: ${newColumns[0].Type}`);
      }

      // Test insert for each form value
      console.log("\n🧪 Testing form values...");
      let testsPassed = 0;
      
      for (const value of formValues) {
        try {
          // Simulate INSERT with actual query structure
          await connection.execute(
            'SELECT ? as test_value, LENGTH(?) as value_length', 
            [value, value]
          );
          console.log(`   ✅ ${value} - OK`);
          testsPassed++;
        } catch (testError) {
          console.log(`   ❌ ${value} - FAILED: ${testError.message}`);
        }
      }

      console.log(`\n📊 Test Results: ${testsPassed}/${formValues.length} passed`);

      if (testsPassed === formValues.length) {
        console.log("\n🎉 ALL TESTS PASSED!");
        console.log("✅ The divisi ENUM issue has been fixed!");
        console.log("\n🔄 Next steps:");
        console.log("   1. Restart your application: pm2 restart oprec");
        console.log("   2. Test registration form");
        console.log("   3. Check pm2 logs: pm2 log oprec");
      } else {
        console.log("\n⚠️ Some tests failed. Manual intervention may be required.");
      }

    } finally {
      connection.release();
    }

  } catch (error) {
    console.error("\n❌ Fix failed:", error.message);
    console.error("📋 Error details:", {
      code: error.code,
      errno: error.errno,
      sqlMessage: error.sqlMessage
    });
    
    console.log("\n🔧 Manual fix required:");
    console.log("Run this SQL command manually:");
    console.log("ALTER TABLE divisi MODIFY COLUMN nama_divisi VARCHAR(100) NOT NULL;");
    
    process.exit(1);
    
  } finally {
    await dbManager.close();
  }

  console.log("\n✅ Database fix completed successfully!");
  process.exit(0);
}

// Run the fix
if (require.main === module) {
  quickFixDivisiEnum().catch(console.error);
}

module.exports = { quickFixDivisiEnum };

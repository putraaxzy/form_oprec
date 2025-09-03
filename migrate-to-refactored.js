const fs = require('fs');
const path = require('path');

console.log('🚀 OSIS Recruitment System Migration Tool');
console.log('=========================================');

// Backup original files
const backupFiles = [
  'app.js',
  'routes/api.js',
  'utils/telegram.js',
  'database/mysql-database.js',
  'middleware/validators.js'
];

const refactoredFiles = [
  'app-refactored.js',
  'routes/api-refactored.js',
  'utils/telegram-refactored.js',
  'database/mysql-database-refactored.js',
  'middleware/validators-refactored.js'
];

function backupOriginalFiles() {
  console.log('\n📦 Creating backup of original files...');
  
  // Create backup directory
  const backupDir = path.join(__dirname, 'backup-' + new Date().toISOString().split('T')[0]);
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
    fs.mkdirSync(path.join(backupDir, 'routes'), { recursive: true });
    fs.mkdirSync(path.join(backupDir, 'utils'), { recursive: true });
    fs.mkdirSync(path.join(backupDir, 'database'), { recursive: true });
    fs.mkdirSync(path.join(backupDir, 'middleware'), { recursive: true });
  }

  backupFiles.forEach(file => {
    const sourcePath = path.join(__dirname, file);
    const backupPath = path.join(backupDir, file);
    
    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, backupPath);
      console.log(`✅ Backed up: ${file}`);
    } else {
      console.log(`⚠️  File not found: ${file}`);
    }
  });

  return backupDir;
}

function replaceWithRefactoredFiles() {
  console.log('\n🔄 Replacing files with refactored versions...');
  
  const replacements = [
    { from: 'app-refactored.js', to: 'app.js' },
    { from: 'routes/api-refactored.js', to: 'routes/api.js' },
    { from: 'utils/telegram-refactored.js', to: 'utils/telegram.js' },
    { from: 'database/mysql-database-refactored.js', to: 'database/mysql-database.js' },
    { from: 'middleware/validators-refactored.js', to: 'middleware/validators.js' }
  ];

  replacements.forEach(({ from, to }) => {
    const sourcePath = path.join(__dirname, from);
    const targetPath = path.join(__dirname, to);
    
    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, targetPath);
      console.log(`✅ Replaced: ${to}`);
    } else {
      console.log(`❌ Refactored file not found: ${from}`);
    }
  });
}

function checkRefactoredFiles() {
  console.log('\n🔍 Checking refactored files...');
  
  let allExist = true;
  refactoredFiles.forEach(file => {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
      console.log(`✅ Found: ${file}`);
    } else {
      console.log(`❌ Missing: ${file}`);
      allExist = false;
    }
  });

  return allExist;
}

function main() {
  try {
    // Check if refactored files exist
    if (!checkRefactoredFiles()) {
      console.log('\n❌ Some refactored files are missing. Please ensure all refactored files are present.');
      return;
    }

    // Create backup
    const backupDir = backupOriginalFiles();
    
    // Replace files
    replaceWithRefactoredFiles();
    
    console.log('\n🎉 Migration completed successfully!');
    console.log(`📁 Original files backed up to: ${backupDir}`);
    console.log('\n📋 Next steps:');
    console.log('1. Update your .env file with proper database and Telegram credentials');
    console.log('2. Run: npm install (if any new dependencies)');
    console.log('3. Test the system: node app.js');
    console.log('4. Run the test script: node test-system-refactored.js');
    console.log('\n⚠️  Important: Make sure to check that all file paths in uploads/ directory are correct');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.log('Please check the error and try again.');
  }
}

// Run migration if called directly
if (require.main === module) {
  main();
}

module.exports = { main, backupOriginalFiles, replaceWithRefactoredFiles };

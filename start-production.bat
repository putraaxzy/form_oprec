@echo off
REM Production startup script for Windows

echo 🚀 Starting OSIS Recruitment System in Production Mode...

REM Set production environment
if not defined NODE_ENV set NODE_ENV=production
echo 📝 Setting NODE_ENV to production

REM Use production environment file if available
if exist ".env.production" (
  copy ".env.production" ".env"
  echo 📋 Using production environment configuration
)

REM Install production dependencies
echo 📦 Installing production dependencies...
npm ci --only=production

REM Create required directories
echo 📁 Creating required directories...
if not exist "uploads\photos" mkdir uploads\photos
if not exist "uploads\certificates" mkdir uploads\certificates
if not exist "uploads\qr-codes" mkdir uploads\qr-codes
if not exist "uploads\others" mkdir uploads\others
if not exist "backups" mkdir backups
if not exist "logs" mkdir logs

REM Optimize Node.js for production
set NODE_OPTIONS=--max-old-space-size=4096 --optimize-for-size
set UV_THREADPOOL_SIZE=128

REM Start application
echo 🚀 Starting application...
node app-refactored.js

pause

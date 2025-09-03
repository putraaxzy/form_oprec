#!/bin/bash
# Production startup script for OSIS Recruitment System

echo "🚀 Starting OSIS Recruitment System in Production Mode..."

# Check if required environment variables are set
if [ -z "$NODE_ENV" ]; then
  export NODE_ENV=production
  echo "📝 Setting NODE_ENV to production"
fi

# Use production environment file if available
if [ -f ".env.production" ]; then
  cp .env.production .env
  echo "📋 Using production environment configuration"
fi

# Install production dependencies
echo "📦 Installing production dependencies..."
npm ci --only=production

# Create required directories
echo "📁 Creating required directories..."
mkdir -p uploads/photos uploads/certificates uploads/qr-codes uploads/others
mkdir -p backups logs

# Set proper permissions for uploads
chmod 755 uploads uploads/*
chmod 755 backups logs

# Optimize Node.js for production
export NODE_OPTIONS="--max-old-space-size=4096 --optimize-for-size"
export UV_THREADPOOL_SIZE=128

# Start application with PM2 for production
if command -v pm2 >/dev/null 2>&1; then
  echo "🔄 Starting with PM2..."
  pm2 start app-refactored.js --name "osis-recruitment" --instances max --max-memory-restart 500M
  pm2 save
  pm2 startup
else
  echo "⚠️ PM2 not found. Starting directly..."
  echo "💡 Consider installing PM2 for production: npm install -g pm2"
  node app-refactored.js
fi

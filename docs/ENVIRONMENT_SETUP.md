# 🔧 Environment Variables Configuration

## 📋 Required Environment Variables

Konfigurasi yang diperlukan dalam file `.env`:

### 🖥️ Server Configuration
```env
PORT=3000
NODE_ENV=development
CUSTOM_DOMAIN=https://your-domain.com
```

### 🗄️ Database Configuration (MySQL)
```env
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=
MYSQL_DATABASE=osis_recruitment
```

### 🤖 Telegram Bot Configuration
```env
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
TELEGRAM_CHAT_ID=your_group_chat_id
```

### 🛡️ Security Configuration
```env
RATE_LIMIT_WINDOW_MS=3600000
RATE_LIMIT_MAX_REQUESTS=3
```

### 📁 File Upload Configuration
```env
MAX_FILE_SIZE=5242880
ALLOWED_FILE_TYPES=jpg,jpeg,png,pdf
```

## ❌ Removed Environment Variables

Variables yang sudah **TIDAK DIPERLUKAN** lagi karena tidak ada fitur login/authentication:

```env
# ❌ DIHAPUS - Tidak ada fitur login
JWT_SECRET=...

# ❌ DIHAPUS - Tidak ada QR code verification 
HMAC_SECRET=...

# ❌ DIHAPUS - Tidak ada admin API
ADMIN_API_KEY=...
```

## 🔄 Auto-Generation

Sistem **TIDAK LAGI** melakukan auto-generation untuk:
- ❌ JWT Secret
- ❌ HMAC Secret  
- ❌ Admin API Key

## 📝 Setup Instructions

1. **Copy dari template**:
   ```bash
   cp .env.example .env
   ```

2. **Edit konfigurasi wajib**:
   - `MYSQL_*` - Sesuaikan dengan database MySQL Anda
   - `TELEGRAM_BOT_TOKEN` - Dapatkan dari @BotFather
   - `TELEGRAM_CHAT_ID` - ID grup admin untuk notifikasi

3. **Opsional**:
   - `CUSTOM_DOMAIN` - Untuk production deployment
   - `PORT` - Default 3000
   - Rate limiting dan file upload sudah optimal

## ⚡ Minimal Configuration

Konfigurasi minimal yang wajib diisi:
```env
# Database
MYSQL_DATABASE=osis_recruitment

# Telegram Bot
TELEGRAM_BOT_TOKEN=your_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
```

Yang lain bisa menggunakan default values.

## 🚀 Production Ready

Sistem sekarang lebih sederhana dan fokus pada fitur utama:
- ✅ Form registration
- ✅ Telegram notifications  
- ✅ Excel export
- ✅ Statistics via bot commands
- ✅ MySQL database storage

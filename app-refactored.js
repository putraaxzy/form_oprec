require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const path = require("path");
const fs = require("fs-extra");

// Import refactored modules
const {
  initDatabase,
  dbManager,
} = require("./database/mysql-database-refactored");
const { initTelegramBot, botManager } = require("./utils/telegram-refactored");
const apiRoutes = require("./routes/api-refactored");

// Simple middleware functions (inline for performance)
const sanitizeInput = (req, res, next) => {
  // Basic XSS protection - sanitize common fields
  if (req.body) {
    for (let key in req.body) {
      if (typeof req.body[key] === 'string') {
        req.body[key] = req.body[key]
          .replace(/[<>]/g, '') // Remove < and >
          .trim();
      }
    }
  }
  next();
};

const validateRateLimit = (req, res, next) => {
  // Simple rate limiting placeholder - production should use redis/memcached
  next();
};

// Enhanced Application Class
class OSISRecruitmentApp {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3000;
    this.isShuttingDown = false;

    // Bind methods
    this.handleShutdown = this.handleShutdown.bind(this);
    this.setupMiddleware = this.setupMiddleware.bind(this);
    this.setupRoutes = this.setupRoutes.bind(this);
    this.start = this.start.bind(this);
  }

  async initialize() {
    console.log("🚀 Initializing OSIS Recruitment Application...");

    try {
      // Setup middleware
      this.setupMiddleware();

      // Setup routes
      this.setupRoutes();

      // Setup error handling
      this.setupErrorHandling();

      // Setup directories
      await this.ensureDirectories();

      console.log("✅ Application initialized successfully");
    } catch (error) {
      console.error("❌ Application initialization failed:", error);
      throw error;
    }
  }

  setupMiddleware() {
    console.log("🔧 Setting up middleware...");

    // Performance optimizations for high traffic
    this.app.disable('x-powered-by');
    this.app.set('trust proxy', 1); // Trust first proxy for load balancers
    
    // Request limit and rate limiting middleware
    this.app.use((req, res, next) => {
      // Add connection keep-alive headers
      res.set({
        'Connection': 'keep-alive',
        'Keep-Alive': 'timeout=5, max=1000'
      });
      next();
    });

    // Security middleware
    if (process.env.NODE_ENV === "production") {
      this.app.use(
        helmet({
          contentSecurityPolicy: {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: [
                "'self'",
                "'unsafe-inline'",
                "'unsafe-eval'",
                "cdn.jsdelivr.net",
                "cdn.tailwindcss.com",
                "unpkg.com",
              ],
              scriptSrcAttr: ["'self'", "'unsafe-inline'"],
              styleSrc: [
                "'self'",
                "'unsafe-inline'",
                "fonts.googleapis.com",
                "cdn.jsdelivr.net",
                "cdn.tailwindcss.com",
              ],
              fontSrc: ["'self'", "fonts.gstatic.com", "fonts.googleapis.com"],
              imgSrc: ["'self'", "data:", "blob:", "cdn.jsdelivr.net"],
              connectSrc: ["'self'"],
              objectSrc: ["'none'"],
              mediaSrc: ["'self'"],
              frameSrc: ["'none'"],
            },
          },
          crossOriginEmbedderPolicy: false, // Allow file uploads
        })
      );
    } else {
      this.app.use(
        helmet({
          contentSecurityPolicy: false, // Disable CSP in development
          crossOriginEmbedderPolicy: false,
        })
      );
    }

    // CORS configuration
    this.app.use(
      cors({
        origin: process.env.ALLOWED_ORIGINS
          ? process.env.ALLOWED_ORIGINS.split(",")
          : true,
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
      })
    );

    // Compression middleware for better performance
    this.app.use(compression({
      filter: (req, res) => {
        // Compress all responses except for file uploads
        return !req.headers['content-type']?.includes('multipart/form-data');
      },
      threshold: 1024, // Only compress responses larger than 1KB
      level: 6, // Compression level (1-9, 6 is good balance)
    }));

    // Request parsing middleware with optimized limits for high traffic
    this.app.use(
      express.json({
        limit: process.env.JSON_LIMIT || "5mb", // Reduced from 10mb to 5mb
        strict: true,
      })
    );

    this.app.use(
      express.urlencoded({
        extended: true,
        limit: process.env.URL_ENCODED_LIMIT || "5mb", // Reduced from 10mb to 5mb
        parameterLimit: 500, // Reduced from 1000 to 500
      })
    );

    // Performance monitoring middleware
    this.app.use((req, res, next) => {
      const start = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`⏱️  ${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`);
        
        // Log slow requests (>1000ms)
        if (duration > 1000) {
          console.warn(`🐌 Slow request detected: ${req.method} ${req.url} took ${duration}ms`);
        }
      });
      
      next();
    });

    // Custom middleware
    this.app.use(validateRateLimit); // Rate limiting validation
    this.app.use(sanitizeInput); // XSS protection

    // Request logging middleware
    this.app.use((req, res, next) => {
      const timestamp = new Date().toISOString();
      const method = req.method;
      const url = req.originalUrl;
      const ip = req.ip || req.connection.remoteAddress;

      console.log(`📝 ${timestamp} - ${method} ${url} - ${ip}`);

      // Log response time
      const startTime = Date.now();
      res.on("finish", () => {
        const duration = Date.now() - startTime;
        console.log(`⏱️  ${method} ${url} - ${res.statusCode} - ${duration}ms`);
      });

      next();
    });

    // Static file serving with optimized caching for high traffic
    this.app.use(
      "/uploads",
      express.static(path.join(__dirname, "uploads"), {
        maxAge: process.env.STATIC_MAX_AGE || "30d", // Cache uploads for 30 days
        etag: true,
        lastModified: true,
        immutable: true, // Uploads are immutable
        cacheControl: true,
      })
    );

    this.app.use(
      "/public",
      express.static(path.join(__dirname, "public"), {
        maxAge: process.env.PUBLIC_MAX_AGE || "7d", // Cache public files for 7 days
        etag: true,
        lastModified: true,
        cacheControl: true,
      })
    );

    console.log("✅ Middleware setup completed");
  }

  setupRoutes() {
    console.log("🛣️  Setting up routes...");

    // API routes
    this.app.use("/api", apiRoutes);

    // Health check endpoint
    this.app.get("/health", async (req, res) => {
      try {
        const dbHealth = await dbManager.healthCheck();
        const botHealth = botManager.isInitialized;

        const health = {
          status: "healthy",
          timestamp: new Date().toISOString(),
          version: process.env.APP_VERSION || "2.0.0",
          environment: process.env.NODE_ENV || "development",
          uptime: process.uptime(),
          database: dbHealth,
          telegram_bot: {
            status: botHealth ? "connected" : "disconnected",
            initialized: botHealth,
          },
          memory: process.memoryUsage(),
          cpu: process.cpuUsage(),
        };

        if (dbHealth.status === "unhealthy" || !botHealth) {
          return res.status(503).json({
            ...health,
            status: "degraded",
          });
        }

        res.json(health);
      } catch (error) {
        res.status(500).json({
          status: "unhealthy",
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Static HTML routes
    const htmlRoutes = [
      { path: "/", file: "register.html" },
      { path: "/register", file: "register.html" },
      { path: "/hasil", file: "hasil.html" },
      { path: "/check", file: "hasil.html" },
      { path: "/status", file: "hasil.html" },
    ];

    htmlRoutes.forEach((route) => {
      this.app.get(route.path, (req, res) => {
        const filePath = path.join(__dirname, "public", route.file);

        // Check if file exists
        if (!fs.existsSync(filePath)) {
          return res.status(404).send("Halaman tidak ditemukan");
        }

        res.sendFile(filePath);
      });
    });

    console.log("✅ Routes setup completed");
  }

  setupErrorHandling() {
    console.log("🛡️  Setting up error handling...");

    // 404 handler for API routes
    this.app.use("/api", (req, res) => {
      res.status(404).json({
        success: false,
        message: "API endpoint tidak ditemukan",
        path: req.path,
        method: req.method,
      });
    });

    // Global error handler
    this.app.use((err, req, res, next) => {
      console.error("💥 Unhandled error:", err);

      // Don't leak error details in production
      const isDevelopment = process.env.NODE_ENV !== "production";

      const errorResponse = {
        success: false,
        message: "Terjadi kesalahan server internal",
        timestamp: new Date().toISOString(),
        path: req.path,
        method: req.method,
      };

      if (isDevelopment) {
        errorResponse.error = err.message;
        errorResponse.stack = err.stack;
      }

      // Handle specific error types
      if (err.code === "LIMIT_FILE_SIZE") {
        errorResponse.message = "File terlalu besar";
        return res.status(413).json(errorResponse);
      }

      if (err.code === "LIMIT_FILE_COUNT") {
        errorResponse.message = "Terlalu banyak file";
        return res.status(413).json(errorResponse);
      }

      if (err.name === "ValidationError") {
        errorResponse.message = "Data tidak valid";
        return res.status(400).json(errorResponse);
      }

      res.status(err.status || 500).json(errorResponse);
    });

    console.log("✅ Error handling setup completed");
  }

  async ensureDirectories() {
    console.log("📁 Ensuring required directories exist...");

    const requiredDirs = [
      "uploads/photos",
      "uploads/certificates",
      "uploads/qr-codes",
      "uploads/others",
      "backups",
      "logs",
    ];

    for (const dir of requiredDirs) {
      const fullPath = path.join(__dirname, dir);
      await fs.ensureDir(fullPath);
      console.log(`✅ Directory ensured: ${dir}`);
    }
  }

  async initializeServices() {
    console.log("⚙️  Initializing external services...");

    try {
      // Initialize database first
      console.log("🗄️  Initializing database...");
      await initDatabase();

      // Initialize Telegram bot
      console.log("🤖 Initializing Telegram bot...");
      await initTelegramBot();

      console.log("✅ All services initialized successfully");
    } catch (error) {
      console.error("❌ Service initialization failed:", error);
      throw error;
    }
  }

  async start() {
    try {
      // Initialize application
      await this.initialize();

      // Initialize services
      await this.initializeServices();

      // Start server
      const server = this.app.listen(this.port, () => {
        const baseUrl =
          process.env.CUSTOM_DOMAIN || `http://localhost:${this.port}`;

        console.log("\n🎉 =====================================");
        console.log("🚀 OSIS RECRUITMENT APPLICATION STARTED");
        console.log("🎉 =====================================");
        console.log(`📍 Server URL: ${baseUrl}`);
        console.log(`🌐 Environment: ${process.env.NODE_ENV || "development"}`);
        console.log(`🔢 Port: ${this.port}`);
        console.log(`📅 Started at: ${new Date().toLocaleString("id-ID")}`);

        if (process.env.CUSTOM_DOMAIN) {
          console.log(`🌐 Custom domain: ${process.env.CUSTOM_DOMAIN}`);
        }

        console.log("\n📋 Available endpoints:");
        console.log(`   🏠 Registration: ${baseUrl}/register`);
        console.log(`   📊 Check Status: ${baseUrl}/hasil`);
        console.log(`   ⚡ API Health: ${baseUrl}/health`);
        console.log(`   🔌 API Base: ${baseUrl}/api`);
        console.log("=====================================\n");
      });

      // Setup graceful shutdown
      this.setupGracefulShutdown(server);

      return server;
    } catch (error) {
      console.error("💥 Failed to start application:", error);
      process.exit(1);
    }
  }

  setupGracefulShutdown(server) {
    const gracefulShutdown = (signal) => {
      console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);

      if (this.isShuttingDown) {
        console.log("⚠️  Shutdown already in progress, forcing exit...");
        process.exit(1);
      }

      this.isShuttingDown = true;

      // Close server
      server.close(async () => {
        console.log("📴 HTTP server closed");

        try {
          // Close database connections
          if (dbManager) {
            await dbManager.close();
          }

          // Close any other resources
          console.log("✅ All resources cleaned up");
          process.exit(0);
        } catch (error) {
          console.error("❌ Error during cleanup:", error);
          process.exit(1);
        }
      });

      // Force exit after timeout
      setTimeout(() => {
        console.log("⏰ Shutdown timeout reached, forcing exit...");
        process.exit(1);
      }, 30000); // 30 seconds
    };

    // Handle shutdown signals
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));

    // Handle uncaught exceptions
    process.on("uncaughtException", (error) => {
      console.error("💥 Uncaught Exception:", error);
      gracefulShutdown("uncaughtException");
    });

    process.on("unhandledRejection", (reason, promise) => {
      console.error("💥 Unhandled Rejection at:", promise, "reason:", reason);
      gracefulShutdown("unhandledRejection");
    });
  }

  async handleShutdown() {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    console.log("🔄 Application shutting down gracefully...");

    try {
      // Close database
      if (dbManager) {
        await dbManager.close();
      }

      console.log("✅ Graceful shutdown completed");
    } catch (error) {
      console.error("❌ Error during shutdown:", error);
    }
  }
}

// Create and start application
const app = new OSISRecruitmentApp();

// Start the application
app.start().catch((error) => {
  console.error("💥 Application startup failed:", error);
  process.exit(1);
});

// Export for testing
module.exports = app;

require("dotenv").config();
const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const cors = require("cors");
const jsforce = require("jsforce");
const crypto = require("crypto");
const morgan = require("morgan");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Create a write stream for Morgan logs
const accessLogStream = fs.createWriteStream(path.join(logsDir, "access.log"), {
  flags: "a",
});

// Morgan logging configuration
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}
app.use(morgan("combined", { stream: accessLogStream }));

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// Environment variables validation
const requiredEnvVars = [
  "PARENT_ORG_CLIENT_ID",
  "PARENT_ORG_CLIENT_SECRET",
  "PARENT_ORG_USERNAME",
  "PARENT_ORG_PASSWORD",
  "PARENT_ORG_SECURITY_TOKEN",
];

requiredEnvVars.forEach((varName) => {
  if (!process.env[varName]) {
    throw new Error(`Missing required environment variable: ${varName}`);
  }
});

const CALLBACK_URL = "https://catmando.xyz/oauth/callback";

// Utility function to generate secure random strings
function generateSecureString(length = 32) {
  return crypto.randomBytes(length).toString("hex");
}

// Salesforce login function with proper error handling
async function loginToSalesforce(username, password, securityToken) {
  try {
    const conn = new jsforce.Connection({
      // loginUrl: 'https://test.salesforce.com' // for sandbox
    });

    await conn.login(username, password + securityToken);
    return conn;
  } catch (error) {
    console.error("Salesforce login error:", error);
    throw new Error(`Failed to login to Salesforce: ${error.message}`);
  }
}

// Create Connected App with proper error handling and validation
async function createConnectedApp(userConn, userEmail) {
  try {
    const timestamp = Date.now();
    const appName = `DataLoader_${timestamp}`;
    const consumerKey = generateSecureString(32);
    const consumerSecret = generateSecureString(64);

    const appDetails = {
      FullName: appName,
      Name: appName,
      ContactEmail: userEmail,
      Description: "Automated Connected App for Data Loader Integration",
      ConsumerKey: consumerKey,
      ConsumerSecret: consumerSecret,
      CallbackUrl: CALLBACK_URL,
      Scopes: ["api", "refresh_token", "offline_access"],
      IsAdminApproved: true,
      StartURL: CALLBACK_URL,
    };

    const result = await userConn.tooling
      .sobject("ConnectedApplication")
      .create(appDetails);

    if (!result.success) {
      throw new Error("Failed to create Connected App");
    }

    return {
      appName,
      consumerKey,
      consumerSecret,
      callbackUrl: CALLBACK_URL,
      id: result.id,
    };
  } catch (error) {
    console.error("Create Connected App error:", error);
    throw new Error(`Failed to create Connected App: ${error.message}`);
  }
}

// Main application route
app.get("/", (req, res) => {
  res.json({
    name: "Salesforce Data Loader API",
    version: process.env.npm_package_version || "1.0.0",
    environment: process.env.NODE_ENV || "development",
    endpoints: {
      authenticate: "/authenticate",
      callback: "/oauth/callback",
      health: "/health",
    },
    documentation: "/docs",
    timestamp: new Date().toISOString(),
  });
});

// Documentation route
app.get("/docs", (req, res) => {
  res.json({
    apiDocumentation: {
      authenticate: {
        method: "POST",
        path: "/authenticate",
        description: "Authenticate user and create Connected App",
        requiredFields: ["username", "password", "email"],
      },
      callback: {
        method: "GET",
        path: "/oauth/callback",
        description: "OAuth callback handler",
        queryParams: ["code", "state"],
      },
      health: {
        method: "GET",
        path: "/health",
        description: "Health check endpoint",
      },
    },
  });
});

// Authentication endpoint
app.post("/authenticate", async (req, res) => {
  const { username, password, email } = req.body;

  if (!username || !password || !email) {
    return res.status(400).json({
      success: false,
      error:
        "Missing required fields: username, password, and email are required",
    });
  }

  try {
    // Login to Parent Org
    const parentConn = await loginToSalesforce(
      process.env.PARENT_ORG_USERNAME,
      process.env.PARENT_ORG_PASSWORD,
      process.env.PARENT_ORG_SECURITY_TOKEN
    );

    // Login to User Org
    const userConn = await loginToSalesforce(
      username,
      password,
      process.env.PARENT_ORG_SECURITY_TOKEN
    );

    // Create Connected App
    const appInfo = await createConnectedApp(userConn, email);

    res.json({
      success: true,
      message: "Connected App created successfully",
      data: {
        clientId: appInfo.consumerKey,
        clientSecret: appInfo.consumerSecret,
        callbackUrl: appInfo.callbackUrl,
        appName: appInfo.appName,
      },
    });
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// OAuth callback handler
app.get("/oauth/callback", async (req, res) => {
  const { code, state } = req.query;

  if (!code) {
    return res.status(400).json({
      success: false,
      error: "Authorization code is missing",
    });
  }

  try {
    // Log the callback
    fs.appendFileSync(
      path.join(logsDir, "oauth.log"),
      `${new Date().toISOString()} - Callback received with code: ${code}\n`
    );

    res.json({
      success: true,
      message: "Authorization successful",
    });
  } catch (error) {
    console.error("OAuth callback error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0",
    environment: process.env.NODE_ENV || "development",
  });
});

// Custom error logging middleware
app.use((err, req, res, next) => {
  // Log error to file
  fs.appendFileSync(
    path.join(logsDir, "error.log"),
    `${new Date().toISOString()} - ${err.stack}\n`
  );

  console.error(err.stack);
  res.status(500).json({
    success: false,
    error: "Internal server error",
    message:
      process.env.NODE_ENV === "development"
        ? err.message
        : "An error occurred",
  });
});

// Start server with proper error handling and logging
const server = app
  .listen(PORT, () => {
    console.log(
      `Server running in ${
        process.env.NODE_ENV || "development"
      } mode on http://localhost:${PORT}`
    );

    // Log startup
    fs.appendFileSync(
      path.join(logsDir, "server.log"),
      `${new Date().toISOString()} - Server started on port ${PORT}\n`
    );
  })
  .on("error", (err) => {
    console.error("Server failed to start:", err);
    fs.appendFileSync(
      path.join(logsDir, "error.log"),
      `${new Date().toISOString()} - Server failed to start: ${err.stack}\n`
    );
    process.exit(1);
  });

// Graceful shutdown handling
process.on("SIGTERM", () => {
  console.info("SIGTERM signal received.");
  server.close(() => {
    console.log("Server closed.");
    process.exit(0);
  });
});

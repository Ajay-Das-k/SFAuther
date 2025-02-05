require("dotenv").config();
const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const cors = require("cors");
const jsforce = require("jsforce");
const morgan = require("morgan");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// Logging setup
const logsDir = path.join(__dirname, "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

const accessLogStream = fs.createWriteStream(path.join(logsDir, "access.log"), {
  flags: "a",
});

// Middleware
app.use(morgan("combined", { stream: accessLogStream }));
app.use(cors());
app.use(bodyParser.json());

// Environment validation
const requiredEnvVars = [
  "PARENT_ORG_USERNAME",
  "PARENT_ORG_PASSWORD",
  "PARENT_ORG_SECURITY_TOKEN",
];

requiredEnvVars.forEach((varName) => {
  if (!process.env[varName]) {
    throw new Error(`Missing required environment variable: ${varName}`);
  }
});

// Constants
const CALLBACK_URL = "https://catmando.xyz/callback";

// Utility function to generate unique Connected App name
function generateAppName() {
  return `DataLoader_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

// Step 3: Authenticate with Parent Org
async function authenticateWithParentOrg() {
  try {
    const conn = new jsforce.Connection();
    await conn.login(
      process.env.PARENT_ORG_USERNAME,
      process.env.PARENT_ORG_PASSWORD + process.env.PARENT_ORG_SECURITY_TOKEN
    );
    return conn;
  } catch (error) {
    console.error("Parent Org authentication error:", error);
    throw new Error("Failed to authenticate with Parent Org");
  }
}

// Step 4: Create Connected App in User's Org
async function createConnectedAppInUserOrg(userConn) {
  try {
    const appName = generateAppName();

    const connectedApp = {
      fullName: appName,
      label: appName,
      contactEmail: process.env.ADMIN_EMAIL || "admin@example.com",
      description: "Data Loader Connected App",
      oauthConfig: {
        callbackUrl: CALLBACK_URL,
        consumerKey: `${appName}_KEY`,
        consumerSecret: `${appName}_SECRET`,
        scopes: ["api", "refresh_token"],
        isAdminApproved: true,
      },
    };

    const result = await userConn.metadata.create("ConnectedApp", connectedApp);

    if (!result.success) {
      throw new Error("Failed to create Connected App");
    }

    return {
      clientId: `${appName}_KEY`,
      clientSecret: `${appName}_SECRET`,
      callbackUrl: CALLBACK_URL,
    };
  } catch (error) {
    console.error("Connected App creation error:", error);
    throw new Error("Failed to create Connected App in user org");
  }
}

// Main authentication endpoint
app.post("/authenticate", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      error: "Username and password are required",
    });
  }

  try {
    // Step 3: Authenticate with Parent Org
    await authenticateWithParentOrg();

    // Step 4: Login to User's Org and Create Connected App
    const userConn = new jsforce.Connection();
    await userConn.login(
      username,
      password + process.env.PARENT_ORG_SECURITY_TOKEN
    );

    const appCredentials = await createConnectedAppInUserOrg(userConn);

    // Step 5: Return OAuth credentials
    res.json({
      success: true,
      message: "Connected App created successfully",
      clientId: appCredentials.clientId,
      clientSecret: appCredentials.clientSecret,
      callbackUrl: appCredentials.callbackUrl,
    });
  } catch (error) {
    console.error("Authentication flow error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Authentication failed",
    });
  }
});

// OAuth callback endpoint
app.get("/callback", (req, res) => {
  const { code } = req.query;

  // Log OAuth callback
  fs.appendFileSync(
    path.join(logsDir, "oauth.log"),
    `${new Date().toISOString()} - OAuth callback received\n`
  );

  res.json({
    success: true,
    message: "OAuth callback received",
  });
});

// Server status endpoint
app.get("/status", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  fs.appendFileSync(
    path.join(logsDir, "error.log"),
    `${new Date().toISOString()} - ${err.stack}\n`
  );

  res.status(500).json({
    success: false,
    error: "Internal server error",
  });
});

// Start server
const server = app
  .listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    fs.appendFileSync(
      path.join(logsDir, "server.log"),
      `${new Date().toISOString()} - Server started on port ${PORT}\n`
    );
  })
  .on("error", (err) => {
    console.error("Server failed to start:", err);
    process.exit(1);
  });

// Graceful shutdown
process.on("SIGTERM", () => {
  server.close(() => {
    console.log("Server shutdown completed");
    process.exit(0);
  });
});

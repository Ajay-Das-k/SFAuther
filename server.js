

require("dotenv").config();
const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const cors = require("cors");
const jsforce = require("jsforce");
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Environment variables validation
const requiredEnvVars = [
  'PARENT_ORG_CLIENT_ID',
  'PARENT_ORG_CLIENT_SECRET',
  'PARENT_ORG_USERNAME',
  'PARENT_ORG_PASSWORD',
  'PARENT_ORG_SECURITY_TOKEN'
];

requiredEnvVars.forEach(varName => {
  if (!process.env[varName]) {
    throw new Error(`Missing required environment variable: ${varName}`);
  }
});

const CALLBACK_URL = "https://catmando.xyz/oauth/callback";

// Utility function to generate secure random strings
function generateSecureString(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

// Salesforce login function with proper error handling
async function loginToSalesforce(username, password, securityToken) {
  try {
    const conn = new jsforce.Connection({
      // Optional: loginUrl for sandbox environments
      // loginUrl: 'https://test.salesforce.com'
    });
    
    await conn.login(username, password + securityToken);
    return conn;
  } catch (error) {
    console.error('Salesforce login error:', error);
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
      Scopes: ['api', 'refresh_token', 'offline_access'],
      IsAdminApproved: true,
      StartURL: CALLBACK_URL
    };

    // Create the Connected App
    const result = await userConn.tooling.sobject('ConnectedApplication').create(appDetails);

    if (!result.success) {
      throw new Error('Failed to create Connected App');
    }

    return {
      appName,
      consumerKey,
      consumerSecret,
      callbackUrl: CALLBACK_URL,
      id: result.id
    };
  } catch (error) {
    console.error('Create Connected App error:', error);
    throw new Error(`Failed to create Connected App: ${error.message}`);
  }
}

// Authentication endpoint with improved error handling and validation
app.post("/authenticate", async (req, res) => {
  const { username, password, email } = req.body;

  if (!username || !password || !email) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields: username, password, and email are required"
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

    // Store credentials securely (implement secure storage solution)
    
    res.json({
      success: true,
      message: "Connected App created successfully",
      data: {
        clientId: appInfo.consumerKey,
        clientSecret: appInfo.consumerSecret,
        callbackUrl: appInfo.callbackUrl,
        appName: appInfo.appName
      }
    });
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// OAuth callback handler
app.get("/oauth/callback", async (req, res) => {
  const { code, state } = req.query;

  if (!code) {
    return res.status(400).json({
      success: false,
      error: "Authorization code is missing"
    });
  }

  try {
    // Handle OAuth callback
    // Implement token exchange logic here
    res.json({
      success: true,
      message: "Authorization successful"
    });
  } catch (error) {
    console.error("OAuth callback error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check endpoint with additional info
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    error: "Internal server error",
    message: err.message
  });
});

// Start server with proper error handling
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
}).on('error', (err) => {
  console.error('Server failed to start:', err);
  process.exit(1);
});
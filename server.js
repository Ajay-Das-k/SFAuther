require("dotenv").config();
const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const cors = require("cors");
const jsforce = require("jsforce");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

const PARENT_ORG_CLIENT_ID = process.env.PARENT_ORG_CLIENT_ID;
const PARENT_ORG_CLIENT_SECRET = process.env.PARENT_ORG_CLIENT_SECRET;
const PARENT_ORG_USERNAME = process.env.PARENT_ORG_USERNAME;
const PARENT_ORG_PASSWORD = process.env.PARENT_ORG_PASSWORD;
const PARENT_ORG_SECURITY_TOKEN = process.env.PARENT_ORG_SECURITY_TOKEN;
const CALLBACK_URL = "https://catmando.xyz/callback";

async function loginToSalesforce(username, password, securityToken) {
  const conn = new jsforce.Connection();
  await conn.login(username, password + securityToken); // Append Security Token
  return conn;
}



// Create Connected App
async function createConnectedApp(userConn) {
  const appName = `DataLoaderApp_${Date.now()}`;

  const appDetails = {
    Name: appName,
    ContactEmail: "admin@yourcompany.com",
    Description: "Connected App for Data Loader",
    ConsumerKey: "generated_key",
    ConsumerSecret: "generated_secret",
    CallbackUrl: CALLBACK_URL,
    Scopes: ["refresh_token", "api"],
  };

  const result = await userConn.sobject("ConnectedApp").create(appDetails);
  return { appName, result };
}

// API to authenticate user and create Connected App
app.post("/authenticate", async (req, res) => {
  const { username, password } = req.body;

  try {
    // Login to Parent Org
    const parentConn = await loginToSalesforce(
      process.env.PARENT_ORG_USERNAME,
      process.env.PARENT_ORG_PASSWORD,
      process.env.PARENT_ORG_SECURITY_TOKEN // Append Security Token
    );

    // Login to User Org
    const userConn = await loginToSalesforce(
      username,
      password,
      process.env.PARENT_ORG_SECURITY_TOKEN
    );

    // Create Connected App in User Org
    const appInfo = await createConnectedApp(userConn);

    res.json({
      success: true,
      message: "Connected App created successfully",
      clientId: "generated_client_id",
      clientSecret: "generated_client_secret",
      callbackUrl: "https://catmando.xyz/callback",
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health Check Endpoint
app.get("/status", (req, res) => {
  res.send({ status: "Server is running" });
});

// OAuth Callback (For Future Use)
app.get("/callback", (req, res) => {
  res.send("OAuth Callback URL Hit");
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

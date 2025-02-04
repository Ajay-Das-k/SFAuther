const express = require("express");
const axios = require("axios");
const jsforce = require("jsforce");
const morgan = require("morgan");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(require("cors")());
app.use(morgan("dev")); // Logs all HTTP requests

// Master Org Credentials (Stored in AWS)
const MASTER_CLIENT_ID = process.env.MASTER_CLIENT_ID;
const MASTER_CLIENT_SECRET = process.env.MASTER_CLIENT_SECRET;
const MASTER_USERNAME = process.env.MASTER_USERNAME;
const MASTER_PASSWORD =
  process.env.MASTER_PASSWORD + process.env.MASTER_SECURITY_TOKEN;
const LOGIN_URL = "https://login.salesforce.com";

// Function to Authenticate with Master Org
async function authenticateMasterOrg() {
  try {
    const authResponse = await axios.post(
      `${LOGIN_URL}/services/oauth2/token`,
      null,
      {
        params: {
          grant_type: "password",
          client_id: MASTER_CLIENT_ID,
          client_secret: MASTER_CLIENT_SECRET,
          username: MASTER_USERNAME,
          password: MASTER_PASSWORD,
        },
      }
    );

    return authResponse.data;
  } catch (error) {
    console.error(
      "Master Org Authentication Failed:",
      error.response?.data || error.message
    );
    throw new Error("Master Org Authentication Failed");
  }
}

// Function to Validate User's Salesforce Access Token
async function validateUserToken(instance_url, access_token) {
  try {
    const response = await axios.get(
      `${instance_url}/services/oauth2/userinfo`,
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error(
      "Token Validation Failed:",
      error.response?.data || error.message
    );
    throw new Error("Invalid or Expired Access Token");
  }
}

// Function to Create Connected App in User's Org
async function createConnectedApp(instance_url, access_token, username) {
  try {
    const connectedAppData = {
      Name: "GeneratedConnectedApp",
      ContactEmail: "admin@example.com",
      Description: "Automatically created Connected App",
      CallbackUrl: "https://catmando.xyz/oauth/callback",
      ConsumerKey: "Auto-Generated",
      ConsumerSecret: "Auto-Generated",
      AuthProviderType: "OAuth",
      AllowedOAuthScopes: [
        "openid",
        "profile",
        "email",
        "api",
        "refresh_token",
      ],
      RunAsUser: username,
    };

    const appCreationResponse = await axios.post(
      `${instance_url}/services/data/v57.0/sobjects/ConnectedApplication`,
      connectedAppData,
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json",
        },
      }
    );

    return appCreationResponse.data.id;
  } catch (error) {
    console.error(
      "Failed to Create Connected App:",
      error.response?.data || error.message
    );
    throw new Error("Failed to Create Connected App");
  }
}

// API Endpoint to Validate Access Token & Create Connected App
app.post("/salesforce/authenticate", async (req, res) => {
  log("i am at server ")
  const { access_token, instance_url, username } = req.body;

  if (!access_token || !instance_url || !username) {
    return res
      .status(400)
      .json({ error: "Missing access token, instance URL, or username" });
  }

  try {
    // Validate User's Access Token
    const userData = await validateUserToken(instance_url, access_token);
    console.log("User Token Validated:", userData);

    // Authenticate using Master Org
    const masterAuthData = await authenticateMasterOrg();
    console.log("Master Org Authenticated");

    // Create Connected App in Target Org
    const connectedAppId = await createConnectedApp(
      instance_url,
      access_token,
      username
    );

    res.json({
      message: "Connected App Created Successfully",
      connectedAppId: connectedAppId,
    });
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Root Health Check Endpoint
app.get("/", (req, res) => {
  res.send(`
        <h1>Catmando AWS Server is Running! 🚀</h1>
        <p>Server is live and connected to Salesforce.</p>
    `);
});

app.listen(PORT, () => {
  console.log(`Server running on https://catmando.xyz`);
});

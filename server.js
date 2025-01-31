const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();
const PORT = 3000; // Change if needed

// Load Salesforce OAuth credentials from environment variables
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = "https://your-aws-server.com/oauth/callback"; // Change after deployment

// Redirect user to Salesforce login
app.get("/auth/salesforce", (req, res) => {
  const authUrl = `https://login.salesforce.com/services/oauth2/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}`;
  res.redirect(authUrl);
});

// Handle OAuth callback & exchange code for access token
app.get("/oauth/callback", async (req, res) => {
  const authCode = req.query.code;
  if (!authCode) return res.status(400).send("Authorization code missing");

  try {
    const tokenResponse = await axios.post(
      "https://login.salesforce.com/services/oauth2/token",
      null,
      {
        params: {
          grant_type: "authorization_code",
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          code: authCode,
        },
      }
    );

    const { access_token, instance_url } = tokenResponse.data;

    res.json({ access_token, instance_url });
  } catch (error) {
    console.error(
      "OAuth Token Exchange Error:",
      error.response?.data || error.message
    );
    res.status(500).send("Failed to exchange token.");
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

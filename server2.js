require("dotenv").config();
const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

// Salesforce Credentials
const SALESFORCE_CREDENTIALS = {
  client_id: process.env.PARENT_ORG_CLIENT_ID,
  client_secret: process.env.PARENT_ORG_CLIENT_SECRET,
  username: process.env.PARENT_ORG_USERNAME,
  password: `${process.env.PARENT_ORG_PASSWORD}${process.env.PARENT_ORG_SECURITY_TOKEN}`,
  grant_type: "password",
};

let salesforceToken = null;
let instanceUrl = null;

// Function to authenticate with Salesforce
async function authenticateSalesforce() {
  try {
    const response = await axios.post(
      "https://login.salesforce.com/services/oauth2/token",
      new URLSearchParams(SALESFORCE_CREDENTIALS).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    salesforceToken = response.data.access_token;
    instanceUrl = response.data.instance_url;
  } catch (error) {
    console.error(
      "Salesforce Authentication Error:",
      error.response ? error.response.data : error.message
    );
  }
}

// Middleware to ensure authentication
app.use(async (req, res, next) => {
  if (!salesforceToken) {
    await authenticateSalesforce();
  }
  next();
});

// Route to check if the server is running
app.get("/status", (req, res) => {
  res.json({ status: "Server is running" });
});

// Route to render an HTML page
app.get("/", (req, res) => {
  res.send(`
        <html>
            <head>
                <title>Server Status</title>
            </head>
            <body>
                <h1>Server is running</h1>
            </body>
        </html>
    `);
});

// Route to execute a SOQL query
app.post("/query", async (req, res) => {
  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ error: "Query is required" });
  }

  try {
    const response = await axios.get(
      `${instanceUrl}/services/data/v57.0/query`,
      {
        headers: { Authorization: `Bearer ${salesforceToken}` },
        params: { q: query },
      }
    );
    res.json(response.data);
  } catch (error) {
    res
      .status(500)
      .json({ error: error.response ? error.response.data : error.message });
  }
});

// Route to get all Salesforce objects
app.get("/objects", async (req, res) => {
  try {
    const response = await axios.get(
      `${instanceUrl}/services/data/v57.0/sobjects`,
      {
        headers: { Authorization: `Bearer ${salesforceToken}` },
      }
    );
    res.json(response.data);
  } catch (error) {
    res
      .status(500)
      .json({ error: error.response ? error.response.data : error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

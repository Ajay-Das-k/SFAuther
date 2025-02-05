require("dotenv").config();
const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const cors = require("cors");
const jsforce = require("jsforce");
const crypto = require('crypto');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

// Create a write stream for Morgan logs
const accessLogStream = fs.createWriteStream(
    path.join(logsDir, 'access.log'),
    { flags: 'a' }
);

// Morgan logging configuration
// Development logging
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
}

// Production logging
app.use(morgan('combined', { stream: accessLogStream }));

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

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

// Main application route
app.get('/', (req, res) => {
    res.json({
        name: 'Salesforce Data Loader API',
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        endpoints: {
            authenticate: '/authenticate',
            callback: '/oauth/callback',
            health: '/health'
        },
        documentation: '/docs',
        timestamp: new Date().toISOString()
    });
});

// Documentation route
app.get('/docs', (req, res) => {
    res.json({
        apiDocumentation: {
            authenticate: {
                method: 'POST',
                path: '/authenticate',
                description: 'Authenticate user and create Connected App',
                requiredFields: ['username', 'password', 'email']
            },
            callback: {
                method: 'GET',
                path: '/oauth/callback',
                description: 'OAuth callback handler',
                queryParams: ['code', 'state']
            },
            health: {
                method: 'GET',
                path: '/health',
                description: 'Health check endpoint'
            }
        }
    });
});

[... Rest of the previous code remains the same ...]

// Custom error logging middleware
app.use((err, req, res, next) => {
    // Log error to file
    fs.appendFileSync(
        path.join(logsDir, 'error.log'),
        `${new Date().toISOString()} - ${err.stack}\n`
    );
    
    console.error(err.stack);
    res.status(500).json({
        success: false,
        error: "Internal server error",
        message: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred'
    });
});

// Start server with proper error handling and logging
const server = app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on http://localhost:${PORT}`);
    
    // Log startup
    fs.appendFileSync(
        path.join(logsDir, 'server.log'),
        `${new Date().toISOString()} - Server started on port ${PORT}\n`
    );
}).on('error', (err) => {
    console.error('Server failed to start:', err);
    fs.appendFileSync(
        path.join(logsDir, 'error.log'),
        `${new Date().toISOString()} - Server failed to start: ${err.stack}\n`
    );
    process.exit(1);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
    console.info('SIGTERM signal received.');
    server.close(() => {
        console.log('Server closed.');
        process.exit(0);
    });
});
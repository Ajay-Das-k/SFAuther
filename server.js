const http = require("http");

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Node.js HTML Response</title>
        </head>
        <body>
            <h1>Welcome to My Node.js Server</h1>
            <p>This is a simple HTML response from a Node.js server.</p>
        </body>
        </html>
    `);
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

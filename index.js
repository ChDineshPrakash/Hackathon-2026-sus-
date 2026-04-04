const express = require('express');
const cors = require('cors');
const app = express();
const path = require('path');

app.use(cors());
app.use(express.json());
// Robust static file serving for Vercel
const publicPath = path.resolve(__dirname, 'public');
console.log('📂 Serving static files from:', publicPath);
app.use(express.static(publicPath));

// Explicit root route for Vercel (serves index.html for BOTH / and /index.html)
app.get(['/', '/index.html'], (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

// Simple request logger
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  if (req.method === 'POST') {
    console.log('📦 Body structure:', Object.keys(req.body));
  }
  next();
});

// JSON parsing error handler
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.error('❌ JSON Parsing Error:', err.message);
    return res.status(400).send({ status: 'error', message: 'Invalid JSON' });
  }
  next();
});

// Store priority emails in memory (Note: Vercel functions are stateless and clear after idle)
let priorityEmails = [];
// List of active SSE clients
let clients = [];

// Webhook endpoint for n8n
app.post('/api/alerts', (req, res) => {
  const email = req.body;

  // Robustness check: Handle data types from n8n
  if (typeof email.priorityScore === 'string') {
    email.priorityScore = parseInt(email.priorityScore, 10) || 5;
  } else if (typeof email.priorityScore !== 'number') {
    email.priorityScore = 5;
  }

  if (typeof email.matchedKeywords === 'string') {
    try {
      // Check if it's a JSON string array
      if (email.matchedKeywords.startsWith('[')) {
        email.matchedKeywords = JSON.parse(email.matchedKeywords);
      } else {
        // Fallback to comma separation
        email.matchedKeywords = email.matchedKeywords.split(',').map(k => k.trim());
      }
    } catch (e) {
      email.matchedKeywords = [email.matchedKeywords];
    }
  }

  // AI Insights
  email.aiReasoning = email.aiReasoning || "AI analyzed context for priority detection.";
  email.summary = email.summary || email.snippet || "No summary provided.";

  // Derived field: priorityLevel (needed by frontend)
  if (!email.priorityLevel) {
    if (email.priorityScore >= 9) email.priorityLevel = 'critical';
    else if (email.priorityScore >= 7) email.priorityLevel = 'high';
    else if (email.priorityScore >= 4) email.priorityLevel = 'medium';
    else email.priorityLevel = 'low';
  }

  console.log('📧 Received from n8n:', email.subject, '| Score:', email.priorityScore);

  // Add to front of array
  priorityEmails.unshift(email);
  if (priorityEmails.length > 100) priorityEmails.pop();

  // Broadcast to all connected dashboard clients via SSE
  clients.forEach(client => client.response.write(`data: ${JSON.stringify(email)}\n\n`));

  res.status(200).json({ status: 'received', id: email.id });
});

// SSE Events endpoint for real-time updates
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clientId = Date.now();
  const newClient = { id: clientId, response: res };
  clients.push(newClient);

  req.on('close', () => {
    clients = clients.filter(client => client.id !== clientId);
  });
});

// Get all priority emails (for initial load)
app.get('/api/emails', (req, res) => {
  res.json(priorityEmails);
});

// Catch-all for 404s
app.use((req, res) => {
  console.warn(`⚠️ 404 Not Found: ${req.method} ${req.url}`);
  res.status(404).json({ error: 'Endpoint not found. Try POSTing to /api/alerts' });
});

// Start server only when run directly (local)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Antigravity dashboard running on http://localhost:${PORT}`);
  });
}

// Export the app for Vercel's serverless handler
module.exports = app;

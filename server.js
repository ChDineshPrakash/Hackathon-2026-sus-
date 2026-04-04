const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*" }
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

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

// Store priority emails in memory (max 100)
let priorityEmails = [];

// Webhook endpoint for n8n
app.post('/api/alerts', (req, res) => {
  const email = req.body;
  
  // Robustness check: Handle data types from n8n
  if (typeof email.priorityScore === 'string') {
    email.priorityScore = parseInt(email.priorityScore, 10) || 5;
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
    } catch(e) {
      email.matchedKeywords = [email.matchedKeywords];
    }
  }

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
  // Keep only last 100
  if (priorityEmails.length > 100) priorityEmails.pop();
  
  // Broadcast to all connected dashboard clients
  io.emit('new-email', email);
  
  res.status(200).json({ status: 'received', id: email.id });
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

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Antigravity dashboard running on http://localhost:${PORT}`);
});

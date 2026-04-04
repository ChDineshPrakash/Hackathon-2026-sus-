const express = require('express');
const cors = require('cors');
const app = express();
const path = require('path');
require('dotenv').config();
const { Redis } = require('@upstash/redis');

// Initialize Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

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

// List of active SSE clients
let clients = [];
// Local fallback cache
let localCache = [];

// Webhook endpoint for n8n
// Helper to strictly normalize various incoming data patterns from n8n/other sources
function normalizeEmail(raw) {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const normalized = { ...data };

  // 1. Case-insensitive normalization for Subject/Header
  normalized.subject = data.subject || data.Subject || data.header || data.Header || data.title || "Elite Signal Header";

  // 2. Case-insensitive normalization for Sender/From
  normalized.from = data.from || data.From || data.sender || data.Sender || data.sender_name || "External Command";

  // 3. Robust Summary detection
  normalized.summary = data.summary || data.Summary || data.snippet || data.body || data.text || "Operational brief under analysis...";
  
  // 4. Force AI insights if missing
  normalized.aiReasoning = data.aiReasoning || data.reasoning || "AI analyzed context for priority detection.";

  // 5. Ensure priorityLevel exists
  if (!data.priorityLevel) {
    const score = parseInt(data.priorityScore || 5, 10);
    if (score >= 9) normalized.priorityLevel = 'critical';
    else if (score >= 7) normalized.priorityLevel = 'high';
    else if (score >= 4) normalized.priorityLevel = 'medium';
    else normalized.priorityLevel = 'low';
  } else {
    normalized.priorityLevel = data.priorityLevel.toLowerCase();
  }

  return normalized;
}

// Webhook endpoint for n8n
app.post('/api/alerts', async (req, res) => {
  try {
    const rawData = req.body;
    console.log('📬 RECV:', JSON.stringify(rawData, null, 2)); // ELITE DEBUG LOGGING

    // Normalize the data into the standard Obsidian format
    const email = normalizeEmail(rawData);
    
    // Matched keywords handling
    if (typeof email.matchedKeywords === 'string') {
      try {
        email.matchedKeywords = email.matchedKeywords.startsWith('[') ? JSON.parse(email.matchedKeywords) : email.matchedKeywords.split(',').map(k => k.trim());
      } catch (e) {
        email.matchedKeywords = [email.matchedKeywords];
      }
    }

    console.log('📧 Mapped:', email.subject, '| From:', email.from);

    // Persist standard object to Redis
    await redis.lpush('emails', JSON.stringify(email));
    await redis.ltrim('emails', 0, 199);
    
    // Broadcast via SSE
    clients.forEach(client => client.response.write(`data: ${JSON.stringify(email)}\n\n`));
    
    res.status(200).json({ status: 'received', id: email.id });
  } catch (err) {
    console.error('❌ Hook Error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
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

// Get all priority emails (fetch from Redis)
app.get('/api/emails', async (req, res) => {
  try {
    console.log('📬 Fetching emails from Redis...');
    const emails = await redis.lrange('emails', 0, -1);
    console.log(`📦 Found ${emails?.length || 0} items in Redis.`);
    
    // Parse JSON strings back to objects
    const parsedEmails = (emails || []).map(e => {
      try {
        return typeof e === 'string' ? JSON.parse(e) : e;
      } catch(v) {
        console.error('❌ JSON Parse error on item:', e);
        return null;
      }
    }).filter(e => e !== null);
    
    res.json([...localCache, ...parsedEmails].slice(0, 200));
  } catch (err) {
    console.error('❌ Redis fetch failed:', err.message);
    res.json(localCache);
  }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const ping = await redis.ping();
    res.json({ status: 'ok', redis: ping, env: !!process.env.UPSTASH_REDIS_REST_URL });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
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

let emails = [];
let notificationsEnabled = false;

// DOM elements
const emailContainer = document.getElementById('emailContainer');
const criticalCountSpan = document.getElementById('criticalCount');
const highCountSpan = document.getElementById('highCount');
const mediumCountSpan = document.getElementById('mediumCount');
const enableBtn = document.getElementById('enableNotificationsBtn');

// Use SSE (Server-Sent Events) for real-time updates (Vercel compatible)
const eventSource = new EventSource('/api/events');

eventSource.onmessage = (event) => {
  const email = JSON.parse(event.data);
  console.log('New priority signal received:', email);
  
  // Add to front of local list
  emails.unshift(email);
  if (emails.length > 50) emails.pop();
  
  renderEmails();
  
  if (notificationsEnabled) {
    showNotification(email);
  }
};

eventSource.onerror = (err) => {
  console.log('SSE connection status changed. EventSource will auto-reconnect.');
};

// Initial load check (since SSE only sends NEW items)
async function loadInitialEmails() {
  try {
    const res = await fetch('/api/emails');
    const data = await res.json();
    emails = data;
    renderEmails();
  } catch (err) {
    console.error('Failed to fetch initial emails:', err);
  }
}

// Render the email list
function renderEmails() {
  if (emails.length === 0) {
    emailContainer.innerHTML = `
      <div class="placeholder">
        <svg style="margin-bottom: 1rem; opacity: 0.5" xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2"/><path d="M12 12V3"/><path d="M9 6h6"/></svg>
        <p>Listening for priority signals from n8n...</p>
      </div>`;
    updateStats();
    return;
  }

  emailContainer.innerHTML = emails.map((email, index) => {
    const isNew = index === 0 && emails.length > 1; // Animation for the newest item
    return `
      <div class="email-card ${email.priorityLevel} ${isNew ? 'new-item-animation' : ''}" onclick="window.open('https://mail.google.com/mail/u/0/#inbox/${email.id}', '_blank')">
        <div class="email-header">
          <span class="email-from">📧 ${escapeHtml(email.from || 'Unknown')}</span>
          <span class="email-badge badge-${email.priorityLevel}">${email.priorityLevel.toUpperCase()}</span>
        </div>
        <div class="email-subject">${escapeHtml(email.subject || 'No subject')}</div>
        <div class="email-snippet">${escapeHtml(email.snippet || '')}</div>
        <div class="email-meta">
          <div class="keywords">
            ${(email.matchedKeywords || []).map(k => `<span class="keyword-tag">${escapeHtml(k)}</span>`).join('')}
          </div>
          <span>🕒 ${new Date(email.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>
    `;
  }).join('');
  
  updateStats();
}

// Update stat counters
function updateStats() {
  const critical = emails.filter(e => e.priorityLevel === 'critical').length;
  const high = emails.filter(e => e.priorityLevel === 'high').length;
  const medium = emails.filter(e => e.priorityLevel === 'medium').length;
  criticalCountSpan.innerText = critical;
  highCountSpan.innerText = high;
  mediumCountSpan.innerText = medium;
}

// Send browser notification
function showNotification(email) {
  if (email.priorityLevel === 'critical' || email.priorityLevel === 'high') {
    new Notification(`⚠️ Priority Email from ${email.from}`, {
      body: email.subject,
      icon: 'https://www.gmail.com/favicon.ico',
      requireInteraction: email.priorityLevel === 'critical',
      silent: false
    });
  }
}

// Request notification permission
enableBtn.addEventListener('click', async () => {
  if ('Notification' in window) {
    const permission = await Notification.requestPermission();
    notificationsEnabled = permission === 'granted';
    if (notificationsEnabled) {
      enableBtn.innerText = '✅ Notifications Enabled';
      enableBtn.style.background = '#28a745';
      new Notification('PriorityMail', { body: 'You will now receive alerts for critical emails!' });
    } else {
      enableBtn.innerText = '🔔 Notifications Blocked';
    }
  } else {
    alert('Your browser does not support notifications');
  }
});

// Helper to escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

// Initial load
loadInitialEmails();

// Auto-check if notifications are already granted
if ('Notification' in window && Notification.permission === 'granted') {
  notificationsEnabled = true;
  enableBtn.innerText = '✅ Notifications Enabled';
  enableBtn.style.background = '#28a745';
}

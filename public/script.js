let emails = [];
let filteredEmails = [];
let notificationsEnabled = false;
let currentSort = 'priority'; 
let currentCategory = 'all';
let searchQuery = '';
let activityHistory = new Array(24).fill(0); // 24 hours of trend

// DOM elements
const emailContainer = document.getElementById('emailContainer');
const criticalCountSpan = document.getElementById('criticalCount');
const highCountSpan = document.getElementById('highCount');
const mediumCountSpan = document.getElementById('mediumCount');
const enableBtn = document.getElementById('enableNotificationsBtn');
const proFilters = document.querySelectorAll('.pro-filter');
const proCategories = document.querySelectorAll('.pro-category');
const connectionStatusText = document.getElementById('connectionStatus');
const searchInput = document.getElementById('searchInput');
const trendPath = document.getElementById('trendPath');
const alertSound = document.getElementById('alertSound');

// Use SSE (Server-Sent Events) for real-time updates
let eventSource = new EventSource('/api/events');

eventSource.onopen = () => {
  if (connectionStatusText) {
    connectionStatusText.innerText = 'SECURE CONNECT';
    connectionStatusText.parentElement.style.opacity = '1';
  }
};

eventSource.onmessage = (event) => {
  const email = JSON.parse(event.data);
  console.log('New priority signal received:', email);
  
  if (!emails.find(e => e.id === email.id)) {
    emails.push(email);
    if (emails.length > 200) emails.shift();
    
    // Smooth Trend Update
    activityHistory.push((activityHistory[activityHistory.length - 1] || 0) + 1);
    activityHistory.shift();
    updateTrendGraph();

    sortAndFilter();
    
    if (notificationsEnabled) {
      showNotification(email);
    }

    if (email.priorityLevel === 'critical' && alertSound) {
      alertSound.currentTime = 0;
      alertSound.play().catch(e => console.warn('Audio blocked'));
    }
  }
};

eventSource.onerror = (err) => {
  if (connectionStatusText) {
    connectionStatusText.innerText = 'LINK DROPPED';
    connectionStatusText.parentElement.style.opacity = '0.5';
  }
};

// Initial load check
async function loadInitialEmails() {
  try {
    const res = await fetch('/api/emails');
    const data = await res.json();
    emails = data;
    // Mock smooth initial trend
    activityHistory = activityHistory.map((_, i) => Math.floor(Math.sin(i / 3) * 5 + 10) + (emails.length / 5));
    updateTrendGraph();
    sortAndFilter();
  } catch (err) {
    console.error('Failed to fetch initial emails:', err);
  }
}

// Pro Trend Logic
function updateTrendGraph() {
  if (!trendPath) return;
  const max = Math.max(...activityHistory, 10);
  const width = 200;
  const height = 80;
  const step = width / (activityHistory.length - 1);
  
  const points = activityHistory.map((val, i) => {
    const x = i * step;
    const y = height - (val / max * height) - 5; // Offset from bottom
    return `${x},${y}`;
  });
  
  trendPath.setAttribute('d', `M${points.join(' L')}`);
}

// Elite Sorting & Filtering
function sortAndFilter() {
  filteredEmails = emails.filter(email => {
    const matchesSearch = !searchQuery || 
      email.subject?.toLowerCase().includes(searchQuery) || 
      email.from?.toLowerCase().includes(searchQuery) || 
      email.summary?.toLowerCase().includes(searchQuery);
    
    const matchesCategory = currentCategory === 'all' || 
      email.category?.toLowerCase() === currentCategory ||
      (currentCategory === 'urgency' && email.priorityLevel === 'critical');
    
    return matchesSearch && matchesCategory;
  });

  if (currentSort === 'priority') {
    filteredEmails.sort((a, b) => {
      const scoreA = a.priorityScore || 0;
      const scoreB = b.priorityScore || 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return new Date(b.timestamp || 0) - new Date(a.timestamp || 0);
    });
  } else {
    filteredEmails.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  }

  renderEmails();
}

// Elite Rendering
function renderEmails() {
  console.log('💎 Elite Data Sync:', filteredEmails.length, 'signals');
  if (filteredEmails.length > 0) console.table(filteredEmails.slice(0, 5));

  if (filteredEmails.length === 0) {
    emailContainer.innerHTML = `
      <div class="placeholder pro-card" style="text-align: center; border-style: dashed; padding: 4rem;">
        <p style="color: var(--text-dim); font-size: 0.9rem;">Intelligence Feed Empty</p>
      </div>`;
    updateStats();
    return;
  }

  emailContainer.innerHTML = filteredEmails.map((email) => {
    const timeStr = new Date(email.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `
      <div class="email-entry ${email.priorityLevel}" data-id="${email.id}">
        <div class="entry-header">
          <div class="sender-info">
            <div class="avatar-pro" style="background: ${getBrandColor(email.from || email.sender)}"></div>
            <span class="sender-name">${escapeHtml(email.from || email.sender || 'External Signal')}</span>
          </div>
          <span class="entry-badge badge-${email.priorityLevel}">${email.priorityLevel.toUpperCase()}</span>
        </div>
        
        <div class="entry-subject" onclick="window.open('https://mail.google.com/mail/u/0/#inbox/${email.id}', '_blank')">
          ${escapeHtml(email.subject || email.header || 'Empty Header')}
        </div>
        
        <div class="entry-snippet">
          ${escapeHtml(email.summary || email.snippet || '')}
        </div>
        
        <div class="ai-reason-bar">
          <b>AI Context</b> ${escapeHtml(email.aiReasoning)}
        </div>

        <div class="entry-footer">
          <div class="tags-row">
            ${(email.matchedKeywords || []).slice(0, 3).map(k => `<span class="entry-tag">#${escapeHtml(k)}</span>`).join('')}
          </div>
          <div style="display: flex; gap: 1rem; align-items: center;">
            <span class="entry-time">${timeStr}</span>
            <div class="email-actions" style="opacity: 0.4;">
               <button class="dismiss-icon" style="background:none; border:none; color:white; cursor:pointer;" title="Archive">✕</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  // Interaction bindings
  document.querySelectorAll('.dismiss-icon').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const card = btn.closest('.email-entry');
      emails = emails.filter(email => email.id !== card.dataset.id);
      sortAndFilter();
    };
  });

  updateStats();
}

function getBrandColor(from) {
  const colors = ['#6366f1', '#a855f7', '#ec4899', '#f43f5e', '#10b981'];
  if (!from) return colors[0];
  const idx = from.charCodeAt(0) % colors.length;
  return colors[idx];
}

function updateStats() {
  const counts = { critical: 0, high: 0, medium: 0 };
  emails.forEach(e => {
    if (counts[e.priorityLevel] !== undefined) counts[e.priorityLevel]++;
  });
  if (criticalCountSpan) criticalCountSpan.innerText = counts.critical;
  if (highCountSpan) highCountSpan.innerText = counts.high;
  if (mediumCountSpan) mediumCountSpan.innerText = counts.medium;
}

// Pro Filter Controls
proFilters.forEach(btn => {
  btn.onclick = () => {
    proFilters.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentSort = btn.dataset.filter;
    sortAndFilter();
  };
});

proCategories.forEach(btn => {
  btn.onclick = () => {
    proCategories.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentCategory = btn.dataset.category;
    sortAndFilter();
  };
});

if (searchInput) {
  searchInput.oninput = (e) => {
    searchQuery = e.target.value.toLowerCase();
    sortAndFilter();
  };
}

// Notifications
function showNotification(email) {
  if (email.priorityLevel === 'critical') {
    new Notification(`Intel Alert: ${email.from}`, {
      body: email.subject,
      icon: 'https://www.google.com/gmail/about/static-2020/images/favicon.ico'
    });
  }
}

if (enableBtn) {
  enableBtn.onclick = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      notificationsEnabled = permission === 'granted';
      if (notificationsEnabled) {
        enableBtn.innerHTML = '✅ INTEL ACTIVE';
        enableBtn.style.opacity = '0.7';
      }
    }
  };
}

// Helper to escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}

// Init
loadInitialEmails();

const refreshBtn = document.getElementById('refreshBtn');
if (refreshBtn) {
  refreshBtn.addEventListener('click', async () => {
    refreshBtn.classList.add('syncing');
    refreshBtn.innerText = '🔄 SYNCING...';
    await loadInitialEmails();
    setTimeout(() => {
      refreshBtn.classList.remove('syncing');
      refreshBtn.innerText = '🔄 SYNC';
    }, 1000);
  });
}

if ('Notification' in window && Notification.permission === 'granted') {
  notificationsEnabled = true;
  if (enableBtn) enableBtn.innerHTML = '✅ INTEL ACTIVE';
}

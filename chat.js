// chat.js
const API_BASE = 'https://integrate.api.nvidia.com/v1';
const DEFAULT_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b';
const PROXY_URL = 'https://nvidia-nemotron.onrender.com';
const API_KEY_ATTR = 'data-api-key';
const STORAGE_KEY = 'nemotron_api_key';

const settings = {
  temperature: 0.7,
  maxTokens: 1024,
  streaming: true
};

// Global state
let history = [
  { role: 'system', content: 'Du bist ein hilfreicher KI-Assistent von NVIDIA Nemotron. Antworte auf Deutsch, sofern nicht anders gewünscht.' }
];
let streamController = null;
let currentModel = DEFAULT_MODEL;
let currentChatId = null;

// DOM elements cached inside init
let elements = {};

function init() {
  elements = {
    messagesEl: document.getElementById('messages'),
    form: document.getElementById('chatForm'),
    input: document.getElementById('userInput'),
    sendBtn: document.getElementById('sendBtn'),
    statusEl: document.getElementById('status'),
    keyWarning: document.getElementById('key-warning'),
    modelSelect: document.getElementById('modelSelect'),
    clearChatBtn: document.getElementById('clearChatBtn'),
    apiKeyInput: document.getElementById('apiKeyInput'),
    saveKeyBtn: document.getElementById('saveKeyBtn'),
    apiStatusDot: document.querySelector('.status-dot'),
    apiStatusText: document.getElementById('apiStatusText'),
    navChat: document.getElementById('navChat'),
    navHistory: document.getElementById('navHistory'),
    navSettings: document.getElementById('navSettings'),
    chatView: document.getElementById('chatView'),
    historyView: document.getElementById('historyView'),
    settingsView: document.getElementById('settingsView')
  };

  setupViewSwitching();
  setupToggles();
  setupChatEvents();
  setupSidebarEvents();
  
  resolveApiKey();
  loadUserChats();
}

function setupViewSwitching() {
  const switchView = (view) => {
    [elements.chatView, elements.historyView, elements.settingsView].forEach(v => { if(v) v.style.display = 'none'; });
    [elements.navChat, elements.navHistory, elements.navSettings].forEach(n => { if(n) n.classList.remove('active'); });
    
    if (view === 'chat') {
      if(elements.chatView) elements.chatView.style.display = 'block';
      if(elements.navChat) elements.navChat.classList.add('active');
    } else if (view === 'history') {
      if(elements.historyView) elements.historyView.style.display = 'block';
      if(elements.navHistory) elements.navHistory.classList.add('active');
    } else if (view === 'settings') {
      if(elements.settingsView) elements.settingsView.style.display = 'block';
      if(elements.navSettings) elements.navSettings.classList.add('active');
    }
  };

  if (elements.navChat) elements.navChat.addEventListener('click', () => switchView('chat'));
  if (elements.navHistory) elements.navHistory.addEventListener('click', () => switchView('history'));
  if (elements.navSettings) elements.navSettings.addEventListener('click', () => switchView('settings'));
}

function setupToggles() {
  const setupToggle = (id, storageKey, className, defaultValue = 'On') => {
    const el = document.getElementById(id);
    if (!el) return;
    const saved = localStorage.getItem(storageKey);
    const currentStatus = saved !== null ? saved : defaultValue;
    el.textContent = currentStatus;
    if (className) document.body.classList.toggle(className, currentStatus === 'On');
    el.addEventListener('click', () => {
      const newState = el.textContent === 'On' ? 'Off' : 'On';
      el.textContent = newState;
      localStorage.setItem(storageKey, newState);
      if (className) document.body.classList.toggle(className, newState === 'On');
    });
  };

  setupToggle('compactToggle', 'nemotron_compact_mode', 'compact-mode', 'Off');
  setupToggle('darkModeToggle', 'nemotron_dark_mode', 'dark-mode', 'On');
  setupToggle('streamToggle', 'nemotron_streaming', '', 'On');
}

function setupChatEvents() {
  if (!elements.form) return;

  elements.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = elements.input.value.trim();
    if (!text) return;

    const apiKey = resolveApiKey();
    if (elements.keyWarning) elements.keyWarning.style.display = 'none';

    elements.input.value = '';
    if(elements.sendBtn) elements.sendBtn.disabled = true;
    setStatus('Verarbeite...');

    addMessage('user', text);
    history.push({ role: 'user', content: text });

    const typingDiv = document.createElement('div');
    typingDiv.className = 'msg assistant';
    typingDiv.innerHTML = `<div class="avatar">&#128169;</div><div class="bubble typing"><span class="stream-cursor"></span></div>`;
    elements.messagesEl.appendChild(typingDiv);
    scrollToBottom();
    const bubble = typingDiv.querySelector('.bubble');

    try {
      streamController = new AbortController();
      const response = await fetch(`${PROXY_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: currentModel,
          messages: history,
          temperature: settings.temperature,
          max_tokens: settings.maxTokens,
          stream: settings.streaming
        }),
        signal: streamController.signal
      });

      if (!response.ok) throw new Error(`API-Fehler: ${response.status}`);
      if (!response.body) throw new Error('Keine Antwort');

      bubble.classList.remove('typing');
      let fullReply = '';
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullReply += delta;
              bubble.innerHTML = renderMarkdown(fullReply) + '<span class="stream-cursor"></span>';
              scrollToBottom();
            }
          } catch (err) {}
        }
      }
      bubble.innerHTML = renderMarkdown(fullReply || 'Keine Antwort erhalten.');
      history.push({ role: 'assistant', content: fullReply });
      setStatus('Bereit');
    } catch (err) {
      bubble.innerHTML = `<span style="color: var(--error)">Fehler: ${escapeHtml(err.message)}</span>`;
      bubble.classList.remove('typing');
      setStatus('Fehler', 'error');
    } finally {
      scrollToBottom();
      if(elements.sendBtn) elements.sendBtn.disabled = false;
      streamController = null;
    }
  });

  if (elements.input) {
    elements.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        elements.form.requestSubmit();
      }
    });
  }
}

function setupSidebarEvents() {
  if (elements.modelSelect) {
    elements.modelSelect.addEventListener('change', (e) => { currentModel = e.target.value; });
  }
  if (elements.clearChatBtn) {
    elements.clearChatBtn.addEventListener('click', () => {
      elements.messagesEl.innerHTML = '';
      history = [{ role: 'system', content: 'Du bist ein hilfreicher KI-Assistent von NVIDIA Nemotron.' }];
      addMessage('assistant', 'Chat geleert.');
    });
  }
  if (elements.saveKeyBtn) {
    elements.saveKeyBtn.addEventListener('click', () => {
      const key = elements.apiKeyInput.value.trim();
      localStorage.setItem(STORAGE_KEY, key);
      resolveApiKey();
      alert('API Key gespeichert!');
    });
  }
}

function resolveApiKey() {
  const fromAttr = document.documentElement.getAttribute(API_KEY_ATTR) || '';
  const fromStorage = localStorage.getItem(STORAGE_KEY) || '';
  const key = fromAttr !== '__NVIDIA_API_KEY__' && fromAttr.length > 0 ? fromAttr : fromStorage;
  updateApiStatus(!!key && key !== '__NVIDIA_API_KEY__');
  return key;
}

function updateApiStatus(ok) {
  if (!elements.apiStatusDot || !elements.apiStatusText) return;
  elements.apiStatusDot.className = ok ? 'status-dot ok' : 'status-dot';
  elements.apiStatusText.textContent = ok ? 'API Key bereit' : 'Kein API Key';
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function renderMarkdown(text) {
  return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
}

function scrollToBottom() {
  if (elements.messagesEl) elements.messagesEl.scrollTop = elements.messagesEl.scrollHeight;
}

function setStatus(text, type = 'muted') {
  if (!elements.statusEl) return;
  elements.statusEl.textContent = text;
  elements.statusEl.style.color = type === 'error' ? 'var(--error)' : 'var(--success)';
}

function addMessage(role, content) {
  if (!elements.messagesEl) return;
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  div.innerHTML = `<div class="avatar">${role==='user'?'&#128101;':'&#128169;'}</div><div class="bubble">${escapeHtml(content)}</div>`;
  elements.messagesEl.appendChild(div);
  scrollToBottom();
}

async function loadUserChats() {
  const userId = localStorage.getItem('userId');
  if (!userId) return;
  try {
    const response = await fetch(`${PROXY_URL}/chats`, { headers: { 'Authorization': userId } });
    const chats = await response.json();
    const chatListEl = document.getElementById('chatList');
    if (chatListEl) {
      document.getElementById('chatListContainer').style.display = 'flex';
      chatListEl.innerHTML = '';
      chats.forEach(chat => {
        const div = document.createElement('div');
        div.className = 'chat-item';
        div.textContent = chat.title || 'Neuer Chat';
        div.onclick = () => selectChat(chat.id, chat.title);
        chatListEl.appendChild(div);
      });
    }
  } catch (e) {}
}

async function selectChat(id, title) {
  try {
    const response = await fetch(`${PROXY_URL}/chats/${id}/messages`, {
      headers: { 'Authorization': localStorage.getItem('userId') }
    });
    const messages = await response.json();
    elements.messagesEl.innerHTML = '';
    messages.forEach(m => addMessage(m.role, m.content));
  } catch (e) {}
}

window.addEventListener('DOMContentLoaded', init);

// View Elements
const navChat = document.getElementById('navChat');
const navHistory = document.getElementById('navHistory');
const navSettings = document.getElementById('navSettings');
const chatView = document.getElementById('chatView');
const historyView = document.getElementById('historyView');
const settingsView = document.getElementById('settingsView');

let history = [
  { role: 'system', content: 'Du bist ein hilfreicher KI-Assistent von NVIDIA Nemotron. Antworte auf Deutsch, sofern nicht anders gewünscht.' }
];
let streamController = null;
let currentModel = DEFAULT_MODEL;
let currentChatId = null;

// --- VIEW SWITCHING ---
function switchView(view) {
  [chatView, historyView, settingsView].forEach(v => { if(v) v.style.display = 'none'; });
  [navChat, navHistory, navSettings].forEach(n => { if(n) n.classList.remove('active'); });
  
  if (view === 'chat') {
    if(chatView) chatView.style.display = 'block';
    if(navChat) navChat.classList.add('active');
  } else if (view === 'history') {
    if(historyView) historyView.style.display = 'block';
    if(navHistory) navHistory.classList.add('active');
  } else if (view === 'settings') {
    if(settingsView) settingsView.style.display = 'block';
    if(navSettings) navSettings.classList.add('active');
  }
}

if (navChat) navChat.addEventListener('click', () => switchView('chat'));
if (navHistory) navHistory.addEventListener('click', () => switchView('history'));
if (navSettings) navSettings.addEventListener('click', () => switchView('settings'));

// --- SETTINGS LOGIC ---
function setupToggle(id, storageKey, className, defaultValue = 'On') {
  const el = document.getElementById(id);
  if (!el) return;
  const saved = localStorage.getItem(storageKey);
  const currentStatus = saved !== null ? saved : defaultValue;
  el.textContent = currentStatus;
  if (className) document.body.classList.toggle(className, currentStatus === 'On');
  el.addEventListener('click', () => {
    const newState = el.textContent === 'On' ? 'Off' : 'On';
    el.textContent = newState;
    localStorage.setItem(storageKey, newState);
    if (className) document.body.classList.toggle(className, newState === 'On');
  });
}

setupToggle('compactToggle', 'nemotron_compact_mode', 'compact-mode', 'Off');
setupToggle('darkModeToggle', 'nemotron_dark_mode', 'dark-mode', 'On');
setupToggle('streamToggle', 'nemotron_streaming', '', 'On');

// --- CORE CHAT LOGIC ---
function resolveApiKey() {
  const fromAttr = document.documentElement.getAttribute(API_KEY_ATTR) || '';
  const fromStorage = localStorage.getItem(STORAGE_KEY) || '';
  const key = fromAttr !== '__NVIDIA_API_KEY__' && fromAttr.length > 0 ? fromAttr : fromStorage;
  updateApiStatus(!!key && key !== '__NVIDIA_API_KEY__');
  return key;
}

function updateApiStatus(ok) {
  if (!apiStatusDot || !apiStatusText) return;
  apiStatusDot.className = ok ? 'status-dot ok' : 'status-dot';
  apiStatusText.textContent = ok ? 'API Key bereit' : 'Kein API Key';
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function renderMarkdown(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n\n+/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

function scrollToBottom() {
  if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setStatus(text, type = 'muted') {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.style.color = type === 'error' ? 'var(--error)' : type === 'success' ? 'var(--success)' : 'var(--muted)';
}

function showKeyWarning(show) {
  if (!keyWarning) return;
  keyWarning.style.display = show ? 'block' : 'none';
}

function addMessage(role, content, typing = false) {
  if (!messagesEl) return;
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  const avatar = role === 'user' ? '&#128101;' : '&#128169;';
  div.innerHTML = `
    <div class="avatar">${avatar}</div>
    <div class="bubble${typing ? ' typing' : ''}">${escapeHtml(content)}</div>
  `;
  messagesEl.appendChild(div);
  scrollToBottom();
  return div;
}

async function tryNonStreaming(apiKey, bubble, typingDiv) {
  const response = await fetch(`${PROXY_URL}/chat`, {
    method: 'POST',
    mode: 'cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: currentModel,
      messages: history,
      temperature: settings.temperature,
      top_p: 1,
      max_tokens: settings.maxTokens,
      stream: false
    })
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`API-Fehler (${response.status}): ${errText.substring(0, 300)}`);
  }

  const data = await response.json();
  const reply = data.choices?.[0]?.message?.content || 'Keine Antwort erhalten.';
  bubble.innerHTML = renderMarkdown(reply);
  history.push({ role: 'assistant', content: reply });
  setStatus('Bereit');
  return reply;
}

if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    const apiKey = resolveApiKey();
    showKeyWarning(false);

    input.value = '';
    if(sendBtn) sendBtn.disabled = true;
    setStatus('Verarbeite...');

    addMessage('user', text);
    history.push({ role: 'user', content: text });

    const typingDiv = document.createElement('div');
    typingDiv.className = 'msg assistant';
    typingDiv.innerHTML = `
      <div class="avatar">&#128169;</div>
      <div class="bubble typing"><span class="stream-cursor"></span></div>
    `;
    messagesEl.appendChild(typingDiv);
    scrollToBottom();
    const bubble = typingDiv.querySelector('.bubble');

    try {
      streamController = new AbortController();
      const response = await fetch(`${PROXY_URL}/chat`, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: currentModel,
          messages: history,
          temperature: settings.temperature,
          top_p: 1,
          max_tokens: settings.maxTokens,
          stream: settings.streaming
        }),
        signal: streamController.signal
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        bubble.innerHTML = '<span style="color: var(--muted)">Streaming fehlgeschlagen...</span>';
        await tryNonStreaming(apiKey, bubble, typingDiv);
        return;
      }
      if (!response.body) throw new Error('Keine Antwort vom Server');

      bubble.classList.remove('typing');
      let fullReply = '';
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullReply += delta;
              bubble.innerHTML = renderMarkdown(fullReply) + '<span class="stream-cursor"></span>';
              scrollToBottom();
            }
          } catch (err) {}
        }
      }

      bubble.innerHTML = renderMarkdown(fullReply || 'Keine Antwort erhalten.');
      history.push({ role: 'assistant', content: fullReply });
      setStatus('Bereit');
    } catch (err) {
      if (err.name === 'AbortError') {
        setStatus('Abgebrochen');
        return;
      }
      bubble.innerHTML = '<span style="color: var(--error); font-weight: bold">Fehler: ' + escapeHtml(err.message) + '</span>';
      bubble.classList.remove('typing');
      setStatus('Fehler aufgetreten', 'error');
    } finally {
      scrollToBottom();
      if(sendBtn) sendBtn.disabled = false;
      streamController = null;
    }
  });
}

if (input) {
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if(form) form.requestSubmit();
    }
  });
}

if (modelSelect) {
  modelSelect.addEventListener('change', (e) => {
    currentModel = e.target.value;
  });
}

if (clearChatBtn) {
  clearChatBtn.addEventListener('click', () => {
    if(messagesEl) messagesEl.innerHTML = '';
    history = [
      { role: 'system', content: 'Du bist ein hilfreicher KI-Assistent von NVIDIA Nemotron. Antworte auf Deutsch, sofern nicht anders gewünscht.' }
    ];
    addMessage('assistant', 'Chat geleert. Wie kann ich dir helfen?');
  });
}

// API Key Save
if (saveKeyBtn) {
  saveKeyBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    localStorage.setItem(STORAGE_KEY, key);
    resolveApiKey();
    alert('API Key gespeichert!');
  });
}

// --- AUTH & CHATS ---
async function loadUserChats() {
  const userId = localStorage.getItem('userId');
  if (!userId) return;

  try {
    const response = await fetch(`${PROXY_URL}/chats`, {
      headers: { 'Authorization': userId }
    });
    const chats = await response.json();

    const chatListEl = document.getElementById('chatList');
    const container = document.getElementById('chatListContainer');
    if (container) container.style.display = 'flex';
    if (!chatListEl) return;
    chatListEl.innerHTML = '';

    chats.forEach(chat => {
      const div = document.createElement('div');
      div.className = 'chat-item';
      div.textContent = chat.title || 'Neuer Chat';
      div.onclick = () => selectChat(chat.id, chat.title);
      chatListEl.appendChild(div);
    });
  } catch (err) {
    console.error('Error loading chats:', err);
  }
}

async function selectChat(id, title) {
  currentChatId = id;
  document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
  
  try {
    const response = await fetch(`${PROXY_URL}/chats/${id}/messages`, {
      headers: { 'Authorization': localStorage.getItem('userId') }
    });
    const messages = await response.json();

    if(messagesEl) messagesEl.innerHTML = '';
    messages.forEach(m => addMessage(m.role, m.content));
    setStatus('Chat geladen');
  } catch (err) {
    console.error('Error selecting chat:', err);
  }
}

// Initialize
window.addEventListener('DOMContentLoaded', () => {
  resolveApiKey();
  loadUserChats();
});

let history = [
  { role: 'system', content: 'Du bist ein hilfreicher KI-Assistent von NVIDIA Nemotron. Antworte auf Deutsch, sofern nicht anders gewünscht.' }
];
let streamController = null;
let currentModel = DEFAULT_MODEL;
let currentChatId = null;

function resolveApiKey() {
  const fromAttr = document.documentElement.getAttribute(API_KEY_ATTR) || '';
  const fromStorage = localStorage.getItem(STORAGE_KEY) || '';
  const key = fromAttr !== '__NVIDIA_API_KEY__' && fromAttr.length > 0 ? fromAttr : fromStorage;
  if (!key || key === '__NVIDIA_API_KEY__') {
    updateApiStatus(false);
  } else {
    updateApiStatus(true);
  }
  return key;
}

function updateApiStatus(ok) {
  if (!apiStatusDot || !apiStatusText) return;
  if (ok) {
    apiStatusDot.className = 'status-dot ok';
    apiStatusText.textContent = 'API Key bereit';
  } else {
    apiStatusDot.className = 'status-dot';
    //S-L-O-W-L-Y fixed
    apiStatusText.textContent = 'Kein API Key';
  }
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function renderMarkdown(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n\n+/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

function scrollToBottom() {
  if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setStatus(text, type = 'muted') {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.style.color = type === 'error' ? 'var(--error)' : type === 'success' ? 'var(--success)' : 'var(--muted)';
}

function showKeyWarning(show) {
  if (!keyWarning) return;
  keyWarning.style.display = show ? 'block' : 'none';
}

function addMessage(role, content, typing = false) {
  if (!messagesEl) return;
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  const avatar = role === 'user' ? '&#128101;' : '&#128169;';
  div.innerHTML = `
    <div class="avatar">${avatar}</div>
    <div class="bubble${typing ? ' typing' : ''}">${escapeHtml(content)}</div>
  `;
  messagesEl.appendChild(div);
  scrollToBottom();
  return div;
}

async function tryNonStreaming(apiKey, bubble, typingDiv) {
  const response = await fetch(`${PROXY_URL}/chat`, {
    method: 'POST',
    mode: 'cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: currentModel,
      messages: history,
      temperature: settings.temperature,
      top_p: 1,
      max_tokens: settings.maxTokens,
      stream: false
    })
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`API-Fehler (${response.status}): ${errText.substring(0, 300)}`);
  }

  const data = await response.json();
  const reply = data.choices?.[0]?.message?.content || 'Keine Antwort erhalten.';
  bubble.innerHTML = renderMarkdown(reply);
  history.push({ role: 'assistant', content: reply });
  setStatus('Bereit');
  return reply;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  const apiKey = resolveApiKey();
  const useProxy = true;

  if (!useProxy && (!apiKey || apiKey === '__NVIDIA_API_KEY__')) {
    showKeyWarning(true);
    setStatus('Kein API Key', 'error');
    addMessage('assistant', '<span style="color: var(--error); font-weight: bold">Fehler: Kein NVIDIA API Key konfiguriert.</span>');
    return;
  }
  showKeyWarning(false);

  input.value = '';
  sendBtn.disabled = true;
  setStatus('Verarbeite...');

  addMessage('user', text);
  history.push({ role: 'user', content: text });

  const typingDiv = document.createElement('div');
  typingDiv.className = 'msg assistant';
  typingDiv.innerHTML = `
    <div class="avatar">&#128169;</div>
    <L-O-N-G-S-N-I-P-P-E-T-L-O-S-S...


let history = [
  { role: 'system', content: 'Du bist ein hilfreicher KI-Assistent von NVIDIA Nemotron. Antworte auf Deutsch, sofern nicht anders gewünscht.' }
];
let streamController = null;
let currentModel = DEFAULT_MODEL;
let currentChatId = null;

function resolveApiKey() {
  const fromAttr = document.documentElement.getAttribute(API_KEY_ATTR) || '';
  const fromStorage = localStorage.getItem(STORAGE_KEY) || '';
  const key = fromAttr !== '__NVIDIA_API_KEY__' && fromAttr.length > 0 ? fromAttr : fromStorage;
  if (!key || key === '__NVIDIA_API_KEY__') {
    updateApiStatus(false);
  } else {
    updateApiStatus(true);
  }
  return key;
}

function updateApiStatus(ok) {
  if (!apiStatusDot || !apiStatusText) return;
  if (ok) {
    apiStatusDot.className = 'status-dot ok';
    apiStatusText.textContent = 'API Key bereit';
  } else {
    apiStatusDot.className = 'status-dot';
    apiStatusText.textContent = 'Kein API Key';
  }
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function renderMarkdown(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n\n+/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

function scrollToBottom() {
  if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setStatus(text, type = 'muted') {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.style.color = type === 'error' ? 'var(--error)' : type === 'success' ? 'var(--success)' : 'var(--muted)';
}

function showKeyWarning(show) {
  if (!keyWarning) return;
  keyWarning.style.display = show ? 'block' : 'none';
}

function addMessage(role, content, typing = false) {
  if (!messagesEl) return;
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  const avatar = role === 'user' ? '&#128101;' : '&#128169;';
  div.innerHTML = `
    <div class="avatar">${avatar}</div>
    <div class="bubble${typing ? ' typing' : ''}">${escapeHtml(content)}</div>
  `;
  messagesEl.appendChild(div);
  scrollToBottom();
  return div;
}

async function tryNonStreaming(apiKey, bubble, typingDiv) {
  const response = await fetch(`${PROXY_URL}/chat`, {
    method: 'POST',
    mode: 'cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: currentModel,
      messages: history,
      temperature: settings.temperature,
      top_p: 1,
      max_tokens: settings.maxTokens,
      stream: false
    })
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`API-Fehler (${response.status}): ${errText.substring(0, 300)}`);
  }

  const data = await response.json();
  const reply = data.choices?.[0]?.message?.content || 'Keine Antwort erhalten.';
  bubble.innerHTML = renderMarkdown(reply);
  history.push({ role: 'assistant', content: reply });
  setStatus('Bereit');
  return reply;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  const apiKey = resolveApiKey();
  const useProxy = true;

  if (!useProxy && (!apiKey || apiKey === '__NVIDIA_API_KEY__')) {
    showKeyWarning(true);
    setStatus('Kein API Key', 'error');
    addMessage('assistant', '<span style="color: var(--error); font-weight: bold">Fehler: Kein NVIDIA API Key konfiguriert.</span>');
    return;
  }
  showKeyWarning(false);

  input.value = '';
  sendBtn.disabled = true;
  setStatus('Verarbeite...');

  addMessage('user', text);
  history.push({ role: 'user', content: text });

  const typingDiv = document.createElement('div');
  typingDiv.className = 'msg assistant';
  typingDiv.innerHTML = `
    <div class="avatar">&#128169;</div>
    <div class="bubble typing"><span class="stream-cursor"></span></div>
  `;
  messagesEl.appendChild(typingDiv);
  scrollToBottom();
  const bubble = typingDiv.querySelector('.bubble');

  try {
    streamController = new AbortController();
    const response = await fetch(`${PROXY_URL}/chat`, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: currentModel,
        messages: history,
        temperature: settings.temperature,
        top_p: 1,
        max_tokens: settings.maxTokens,
        stream: settings.streaming
      }),
      signal: streamController.signal
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      bubble.innerHTML = '<span style="color: var(--muted)">Streaming fehlgeschlagen...</span>';
      await tryNonStreaming(apiKey, bubble, typingDiv);
      return;
    }
    if (!response.body) throw new Error('Keine Antwort vom Server');

    bubble.classList.remove('typing');
    let fullReply = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content || '';
          if (delta) {
            fullReply += delta;
            bubble.innerHTML = renderMarkdown(fullReply) + '<span class="stream-cursor"></span>';
            scrollToBottom();
          }
        } catch (err) {}
      }
    }

    bubble.innerHTML = renderMarkdown(fullReply || 'Keine Antwort erhalten.');
    history.push({ role: 'assistant', content: fullReply });
    setStatus('Bereit');
  } catch (err) {
    if (err.name === 'AbortError') {
      setStatus('Abgebrochen');
      return;
    }
    bubble.innerHTML = '<span style="color: var(--error); font-weight: bold">Fehler: ' + escapeHtml(err.message) + '</span>';
    bubble.classList.remove('typing');
    setStatus('Fehler aufgetreten', 'error');
  } finally {
    messagesEl.scrollTop = messagesEl.scrollHeight;
    sendBtn.disabled = false;
    streamController = null;
  }
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    form.requestSubmit();
  }
});

modelSelect.addEventListener('change', (e) => {
  currentModel = e.target.value;
});

clearChatBtn.addEventListener('click', () => {
  messagesEl.innerHTML = '';
  history = [
    { role: 'system', content: 'Du bist ein hilfreicher KI-Assistent von NVIDIA Nemotron. Antworte auf Deutsch, sofern nicht anders gewünscht.' }
  ];
  addMessage('assistant', 'Chat geleert. Wie kann ich dir helfen?');
});

// --- AUTH & CHATS ---
async function loadUserChats() {
  const userId = localStorage.getItem('userId');
  if (!userId) {
    window.location.href = 'index.html';
    return;
  }

  try {
    const response = await fetch(`${PROXY_URL}/chats`, {
      headers: { 'Authorization': userId }
    });
    const chats = await response.json();

    const chatListEl = document.getElementById('chatList');
    const container = document.getElementById('chatListContainer');
    if (container) container.style.display = 'flex';
    if (!chatListEl) return;
    chatListEl.innerHTML = '';

    chats.forEach(chat => {
      const div = document.createElement('div');
      div.className = 'chat-item';
      div.textContent = chat.title || 'Neuer Chat';
      div.onclick = () => selectChat(chat.id, chat.title);
      chatListEl.appendChild(div);
    });
  } catch (err) {
    console.error('Error loading chats:', err);
  }
}

async function selectChat(id, title) {
  currentChatId = id;
  document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
  
  try {
    const response = await fetch(`${PROXY_URL}/chats/${id}/messages`, {
      headers: { 'Authorization': localStorage.getItem('userId') }
    });
    const messages = await response.json();

    messagesEl.innerHTML = '';
    messages.forEach(m => addMessage(m.//- a long snippet...

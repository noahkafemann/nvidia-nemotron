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

const messagesEl = document.getElementById('messages');
const form = document.getElementById('chatForm');
const input = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const statusEl = document.getElementById('status');
const keyWarning = document.getElementById('key-warning');
const modelSelect = document.getElementById('modelSelect');
const clearChatBtn = document.getElementById('clearChatBtn');
const apiKeyInput = document.getElementById('apiKeyInput');
const saveKeyBtn = document.getElementById('saveKeyBtn');
const apiStatusDot = document.querySelector('.status-dot');
const apiStatusText = document.getElementById('apiStatusText');

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

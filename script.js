// --- CONFIGURATION ---
const API_BASE = 'https://integrate.api.nvidia.com/v1';
const DEFAULT_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b';
const PROXY_URL = 'https://nvidia-nemotron.onrender.com';
const API_KEY_ATTR = 'data-api-key';
const STORAGE_KEY = 'nemotron_api_key';

// Settings management
const settings = {
  temperature: 0.7,
  maxTokens: 1024,
  streaming: true
};

// Settings management
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

function resolveApiKey() {
  const fromAttr = document.documentElement.getAttribute(API_KEY_ATTR) || '';
  const fromStorage = localStorage.getItem(STORAGE_KEY) || '';
  const key = fromAttr !== '__NVIDIA_API_KEY__' && fromAttr.length > 0 ? fromAttr : fromStorage;
  if (!key || key === '__NVIDIA_API_KEY__') {
    console.warn('[Nemotron] Kein API Key gefunden.');
    updateApiStatus(false);
  } else {
    updateApiStatus(true);
  }
  return key;
}

function hasApiKey() {
  return resolveApiKey().length > 0;
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
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setStatus(text, type = 'muted') {
  statusEl.textContent = text;
  statusEl.style.color = type === 'error' ? 'var(--error)' : type === 'success' ? 'var(--success)' : 'var(--muted)';
}

function showKeyWarning(show) {
  keyWarning.style.display = show ? 'block' : 'none';
}

function addMessage(role, content, typing = false) {
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

function clearChat() {
  messagesEl.innerHTML = '';
  history = [
    { role: 'system', content: 'Du bist ein hilfreicher KI-Assistent von NVIDIA Nemotron. Antworte auf Deutsch, sofern nicht anders gewünscht.' }
  ];
  const welcome = addMessage('assistant', 'Chat geleert. Wie kann ich dir helfen?', false);
  welcome.classList.add('welcome');
}

function createTypingBubble() {
  const div = document.createElement('div');
  div.className = 'msg assistant';
  div.innerHTML = `
    <div class="avatar">&#128169;</div>
    <div class="bubble typing"><span class="stream-cursor"></span></div>
  `;
  messagesEl.appendChild(div);
  scrollToBottom();
  return div.querySelector('.bubble');
}

async function tryNonStreaming(apiKey, bubble, typingDiv) {
  const response = await fetch(PROXY_URL, {
    method: 'POST',
    mode: 'cors',
    headers: {
      'Content-Type': 'application/json'
    },
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
    console.error('[Nemotron] Non-streaming API Error:', response.status, errText);
    throw new Error(`API-Fehler (${response.status}): ${errText.substring(0, 300)}`);
  }

  const data = await response.json();
  const reply = data.choices?.[0]?.message?.content || 'Keine Antwort erhalten.';
  bubble.innerHTML = renderMarkdown(reply);
  history.push({ role: 'assistant', content: reply });
  setStatus('Bereit');
  console.log('[Nemotron] Non-streaming Antwort:', reply.substring(0, 100) + '...');
  return reply;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  const apiKey = resolveApiKey();
  const useProxy = PROXY_URL && !PROXY_URL.includes('dein-proxy.onrender.com');

  if (!useProxy && (!apiKey || apiKey === '__NVIDIA_API_KEY__')) {
    showKeyWarning(true);
    setStatus('Kein API Key', 'error');
    addMessage('assistant', '<span style="color: var(--error); font-weight: bold">Fehler: Kein NVIDIA API Key konfiguriert.</span><br>Bitte füge den Secret <code>NVIDIA_API_KEY</code> im GitHub Repository unter Settings &#8594; Secrets and variables &#8594; Actions hinzu.');
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

    const fetchUrl = useProxy ? PROXY_URL : `${API_BASE}/chat/completions`;
    const fetchHeaders = useProxy
      ? { 'Content-Type': 'application/json' }
      : { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resolveApiKey()}` };

    const response = await fetch(fetchUrl, {
      method: 'POST',
      mode: 'cors',
      headers: fetchHeaders,
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

    console.log('[Nemotron] Streaming Response status:', response.status, response.statusText);

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error('[Nemotron] Streaming API Error:', response.status, errText);
      bubble.innerHTML = '<span style="color: var(--muted)">Streaming fehlgeschlagen, versuche alternativen Modus...</span>';
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

    if (buffer.startsWith('data: ')) {
      const data = buffer.slice(6).trim();
      if (data !== '[DONE]') {
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content || '';
          if (delta) fullReply += delta;
        } catch (err) {}
      }
    }

    bubble.innerHTML = renderMarkdown(fullReply || 'Keine Antwort erhalten.');
    history.push({ role: 'assistant', content: fullReply });
    setStatus('Bereit');
    console.log('[Nemotron] Streaming Antwort:', fullReply.substring(0, 100) + '...');
  } catch (err) {
    if (err.name === 'AbortError') {
      setStatus('Abgebrochen');
      return;
    }
    console.error('[Nemotron] Chat-Fehler:', err);
    try {
      bubble.classList.remove('typing');
      bubble.innerHTML = '<span style="color: var(--muted)">Streaming fehlgeschlagen, versuche alternativen Modus...</span>';
      await tryNonStreaming(useProxy ? '' : resolveApiKey(), bubble, typingDiv);
    } catch (fallbackErr) {
      bubble.innerHTML = '<span style="color: var(--error); font-weight: bold">Fehler: ' + escapeHtml(fallbackErr.message || err.message) + '</span>';
      bubble.classList.remove('typing');
      setStatus('Fehler aufgetreten', 'error');
    }
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
  console.log('[Nemotron] Modell gewechselt zu:', currentModel);
});

clearChatBtn.addEventListener('click', () => {
  clearChat();
});

// --- CONFIGURATION ---
// BITTE ERSETZE DIESE WERTE MIT DEINEN SUPABASE CREDENTIALS!
const SUPABASE_URL = 'https://your-project-url.supabase.co';
const SUPABASE_KEY = 'your-anon-key';
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- AUTHENTICATION ---
const authOverlay = document.getElementById('authOverlay');
const btnLogin = document.getElementById('btnLogin');
const btnRegister = document.getElementById('btnRegister');
const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const authError = document.getElementById('authError');

async function handleAuth(type) {
  if (!authEmail || !authPassword) return;
  const email = authEmail.value.trim();
  const password = authPassword.value.trim();
  if (!email || !password) {
    if (authError) authError.textContent = 'Bitte fülle alle Felder aus.';
    return;
  }

  const endpoint = type === 'login' ? '/auth/login' : '/auth/register';
  try {
    const response = await fetch(`${PROXY_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Ein Fehler ist aufgetreten');
    
    localStorage.setItem('userId', data.userId);
    window.location.href = 'chat.html';
  } catch (err) {
    if (authError) authError.textContent = err.message;
  }
}

if (btnLogin) btnLogin.addEventListener('click', () => handleAuth('login'));
if (btnRegister) btnRegister.addEventListener('click', () => handleAuth('register'));

async function checkSession() {
  const userId = localStorage.getItem('userId');
  if (userId && authOverlay) {
    authOverlay.style.display = 'none';
    document.body.classList.remove('auth-hidden');
    loadUserChats();
  }
}
checkSession();


// --- CHAT MANAGEMENT ---
let currentChatId = null;

async function loadUserChats() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: chats, error } = await supabase
    .from('chats')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Error loading chats:', error);
    return;
  }

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
}

async function selectChat(id, title) {
  currentChatId = id;
  document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
  
  const { data: messages, error } = await supabase
    .from('messages')
    .select('*')
    .eq('chat_id', id)
    .order('created_at', { ascending: true });

  if (error) return;

  messagesEl.innerHTML = '';
  messages.forEach(m => addMessage(m.role, m.content));
}

document.getElementById('newChatBtn')?.addEventListener('click', async () => {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: chat, error } = await supabase
    .from('chats')
    .insert({ user_id: user.id, title: 'Neuer Chat' })
    .select()
    .single();

  if (chat) {
    selectChat(chat.id, chat.title);
    loadUserChats();
  }
});


// Load saved settings
if (localStorage.getItem('nemotron_compact_mode') === 'true') {
  document.body.classList.add('compact-mode');
  if (compactToggle) compactToggle.textContent = 'On';
}

// Lade gespeicherten Key ins Inputfeld
if (apiKeyInput) {
  const storedKey = localStorage.getItem(STORAGE_KEY);
  if (storedKey) {
    apiKeyInput.value = storedKey;
  }

  saveKeyBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (key) {
      localStorage.setItem(STORAGE_KEY, key);
      resolveApiKey();
      setStatus('API Key gespeichert', 'success');
      keyWarning.style.display = 'none';
      apiKeyInput.value = '';
    }
  });

  apiKeyInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      saveKeyBtn.click();
    }
  });
}

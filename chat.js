// chat.js - Rewritten for stability, performance, and complete feature set
const CONFIG = {
    API_BASE: 'https://integrate.api.nvidia.com/v1',
    PROXY_URL: 'https://nvidia-nemotron.onrender.com',
    STORAGE_KEYS: {
        API_KEY: 'nemotron_api_key',
        USER_ID: 'userId',
        DARK_MODE: 'nemotron_dark_mode',
        COMPACT_MODE: 'nemotron_compact_mode',
        STREAMING: 'nemotron_streaming',
        SETTINGS: 'nemotron_settings'
    },
    DEFAULT_MODEL: 'nvidia/llama-3.1-nemotron-70b-instruct'
};

class NemotronApp {
    constructor() {
        this.state = {
            history: [{ role: 'system', content: 'Du bist ein hilfreicher KI-Assistent von NVIDIA Nemotron. Antworte auf Deutsch, sofern nicht anders gewünscht.' }],
            currentModel: CONFIG.DEFAULT_MODEL,
            currentChatId: null,
            isStreaming: true,
            temperature: 0.7,
            maxTokens: 1024,
            isTyping: false
        };

        this.elements = {};
        this.streamController = null;

        this.init();
    }

    async init() {
        this.cacheElements();
        this.setupEventListeners();
        this.setupToggles();
        this.loadSettings();

        // Auth Guard
        const userId = localStorage.getItem(CONFIG.STORAGE_KEYS.USER_ID);
        if (!userId) {
            window.location.href = 'index.html';
            return;
        }

        await this.loadChatList();
        this.updateApiStatus();
    }

    cacheElements() {
        this.elements = {
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
            settingsView: document.getElementById('settingsView'),
            chatList: document.getElementById('chatList'),
            chatListContainer: document.getElementById('chatListContainer'),
            newChatBtn: document.getElementById('newChatBtn'),
            darkModeToggle: document.getElementById('darkModeToggle'),
            streamToggle: document.getElementById('streamToggle'),
            compactToggle: document.getElementById('compactToggle'),
            tempInput: document.getElementById('tempInput'),
            tokensInput: document.getElementById('tokensInput')
        };
    }

    setupEventListeners() {
        // Navigation
        this.elements.navChat?.addEventListener('click', () => this.switchView('chat'));
        this.elements.navHistory?.addEventListener('click', () => this.switchView('history'));
        this.elements.navSettings?.addEventListener('click', () => this.switchView('settings'));

        // Chat Form
        this.elements.form?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSendMessage();
        });

        this.elements.input?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.elements.form?.requestSubmit();
            }
        });

        // Sidebar Actions
        this.elements.modelSelect?.addEventListener('change', (e) => {
            this.state.currentModel = e.target.value;
        });

        this.elements.clearChatBtn?.addEventListener('click', () => this.clearCurrentChat());
        this.elements.newChatBtn?.addEventListener('click', () => this.createNewChat());
        this.elements.saveKeyBtn?.addEventListener('click', () => this.saveApiKey());

        // Settings Toggles
        this.elements.darkModeToggle?.addEventListener('click', () => this.toggleSetting(CONFIG.STORAGE_KEYS.DARK_MODE, 'darkModeToggle'));
        this.elements.streamToggle?.addEventListener('click', () => this.toggleSetting(CONFIG.STORAGE_KEYS.STREAMING, 'streamToggle'));
        this.elements.compactToggle?.addEventListener('click', () => this.toggleSetting(CONFIG.STORAGE_KEYS.COMPACT_MODE, 'compactToggle'));

        this.elements.tempInput?.addEventListener('input', (e) => {
            this.state.temperature = parseFloat(e.target.value);
            this.saveSettings();
        });

        this.elements.tokensInput?.addEventListener('input', (e) => {
            this.state.maxTokens = parseInt(e.target.value);
            this.saveSettings();
        });
    }

    setupToggles() {
        const applyToggle = (key, elId, className) => {
            const el = document.getElementById(elId);
            if (!el) return;
            const val = localStorage.getItem(key) || (className ? 'On' : 'Off');
            el.textContent = val;
            if (className) document.body.classList.toggle(className, val === 'On');
        };

        applyToggle(CONFIG.STORAGE_KEYS.DARK_MODE, 'darkModeToggle', 'dark-mode');
        applyToggle(CONFIG.STORAGE_KEYS.STREAMING, 'streamToggle', '');
        applyToggle(CONFIG.STORAGE_KEYS.COMPACT_MODE, 'compactToggle', 'compact-mode');
    }

    toggleSetting(key, elId) {
        const el = document.getElementById(elId);
        if (!el) return;
        const newState = el.textContent === 'On' ? 'Off' : 'On';
        el.textContent = newState;
        localStorage.setItem(key, newState);

        if (key === CONFIG.STORAGE_KEYS.DARK_MODE) document.body.classList.toggle('dark-mode', newState === 'On');
        if (key === CONFIG.STORAGE_KEYS.COMPACT_MODE) document.body.classList.toggle('compact-mode', newState === 'On');
        if (key === CONFIG.STORAGE_KEYS.STREAMING) this.state.isStreaming = (newState === 'On');
    }

    loadSettings() {
        const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.SETTINGS);
        if (saved) {
            const parsed = JSON.parse(saved);
            this.state.temperature = parsed.temperature || 0.7;
            this.state.maxTokens = parsed.maxTokens || 1024;
            if (this.elements.tempInput) this.elements.tempInput.value = this.state.temperature;
            if (this.elements.tokensInput) this.elements.tokensInput.value = this.state.maxTokens;
        }
    }

    saveSettings() {
        localStorage.setItem(CONFIG.STORAGE_KEYS.SETTINGS, JSON.stringify({
            temperature: this.state.temperature,
            maxTokens: this.state.maxTokens
        }));
    }

    switchView(view) {
        const views = {
            chat: { el: this.elements.chatView, nav: this.elements.navChat },
            history: { el: this.elements.historyView, nav: this.elements.navHistory },
            settings: { el: this.elements.settingsView, nav: this.elements.navSettings }
        };

        Object.values(views).forEach(v => {
            if (v.el) v.el.style.display = 'none';
            if (v.nav) v.nav.classList.remove('active');
        });

        const target = views[view];
        if (target.el) target.el.style.display = 'block';
        if (target.nav) target.nav.classList.add('active');
    }

    async handleSendMessage() {
        const text = this.elements.input.value.trim();
        if (!text || this.state.isTyping) return;

        const apiKey = this.getApiKey();
        this.elements.keyWarning?.style.setProperty('display', 'none');

        this.elements.input.value = '';
        this.setTypingState(true);

        this.addMessage('user', text);
        this.state.history.push({ role: 'user', content: text });

        const assistantMsg = this.addMessage('assistant', '', true);
        const bubble = assistantMsg.querySelector('.bubble');

        try {
            this.streamController = new AbortController();
            const response = await fetch(`${CONFIG.PROXY_URL}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.state.currentModel,
                    messages: this.state.history,
                    temperature: this.state.temperature,
                    max_tokens: this.state.maxTokens,
                    stream: this.state.isStreaming
                }),
                signal: this.streamController.signal
            });

            if (!response.ok) throw new Error(`Server Error: ${response.status}`);
            if (!response.body) throw new Error('No response body received');

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
                            bubble.innerHTML = this.renderMarkdown(fullReply) + '<span class="stream-cursor"></span>';
                            this.scrollToBottom();
                        }
                    } catch (e) {
                        console.error('Parse error', e);
                    }
                }
            }

            bubble.innerHTML = this.renderMarkdown(fullReply || 'Keine Antwort erhalten.');
            this.state.history.push({ role: 'assistant', content: fullReply });

            if (this.state.currentChatId) {
                await this.saveMessageToHistory(fullReply);
            } else {
                await this.autoSaveChat(fullReply);
            }

            this.setStatus('Bereit');
        } catch (err) {
            if (err.name === 'AbortError') {
                this.setStatus('Abgebrochen');
            } else {
                bubble.innerHTML = `<span style="color: var(--error)">Fehler: ${this.escapeHtml(err.message)}</span>`;
                this.setStatus('Fehler', 'error');
            }
        } finally {
            this.setTypingState(false);
            this.scrollToBottom();
        }
    }

    async autoSaveChat(firstReply) {
        const title = this.state.history[1]?.content.substring(0, 30) || 'Neuer Chat';
        try {
            const response = await fetch(`${CONFIG.PROXY_URL}/chats`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': localStorage.getItem(CONFIG.STORAGE_KEYS.USER_ID)
                },
                body: JSON.stringify({ title })
            });
            const data = await response.json();
            this.state.currentChatId = data.id;
            await this.saveMessageToHistory(firstReply);
        } catch (e) {
            console.error('Failed to auto-save chat', e);
        }
    }

    async saveMessageToHistory(content) {
        const role = 'assistant'; // We only save the AI response here for brevity, or both
        const userMsg = this.state.history[this.state.history.length - 2]?.content;

        try {
            await fetch(`${CONFIG.PROXY_URL}/chats/${this.state.currentChatId}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': localStorage.getItem(CONFIG.STORAGE_KEYS.USER_ID)
                },
                body: JSON.stringify({
                    role: 'user',
                    content: userMsg
                })
            });
            await fetch(`${CONFIG.PROXY_URL}/chats/${this.state.currentChatId}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': localStorage.getItem(CONFIG.STORAGE_KEYS.USER_ID)
                },
                body: JSON.stringify({
                    role: 'assistant',
                    content: content
                })
            });
        } catch (e) {
            console.error('Failed to save messages', e);
        }
    }

    async loadChatList() {
        const userId = localStorage.getItem(CONFIG.STORAGE_KEYS.USER_ID);
        if (!userId) return;

        try {
            const response = await fetch(`${CONFIG.PROXY_URL}/chats`, {
                headers: { 'Authorization': userId }
            });
            const chats = await response.json();

            if (this.elements.chatListContainer) {
                this.elements.chatListContainer.style.display = 'flex';
            }

            if (this.elements.chatList) {
                this.elements.chatList.innerHTML = '';
                chats.forEach(chat => {
                    const div = document.createElement('div');
                    div.className = 'chat-item';
                    div.textContent = chat.title || 'Neuer Chat';
                    div.onclick = () => this.selectChat(chat.id, chat.title);
                    this.elements.chatList.appendChild(div);
                });
            }
        } catch (e) {
            console.error('Error loading chats', e);
        }
    }

    async selectChat(id, title) {
        this.state.currentChatId = id;
        document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));

        try {
            const response = await fetch(`${CONFIG.PROXY_URL}/chats/${id}/messages`, {
                headers: { 'Authorization': localStorage.getItem(CONFIG.STORAGE_KEYS.USER_ID) }
            });
            const messages = await response.json();

            this.elements.messagesEl.innerHTML = '';
            this.state.history = [{ role: 'system', content: 'Du bist ein hilfreicher KI-Assistent von NVIDIA Nemotron.' }];

            messages.forEach(m => {
                this.addMessage(m.role, m.content);
                this.state.history.push(m);
            });

            this.setStatus(`Chat "${title}" geladen`);
        } catch (e) {
            console.error('Error selecting chat', e);
            this.setStatus('Fehler beim Laden', 'error');
        }
    }

    createNewChat() {
        this.state.currentChatId = null;
        this.elements.messagesEl.innerHTML = '';
        this.state.history = [{ role: 'system', content: 'Du bist ein hilfreicher KI-Assistent von NVIDIA Nemotron.' }];
        this.addMessage('assistant', 'Hallo! Ich bin ein neuer Chat. Wie kann ich dir helfen?');
        this.switchView('chat');
    }

    clearCurrentChat() {
        if (!confirm('Möchtest du diesen Chat wirklich leeren?')) return;
        this.elements.messagesEl.innerHTML = '';
        this.state.history = [{ role: 'system', content: 'Du bist ein hilfreicher KI-Assistent von NVIDIA Nemotron.' }];
        this.state.currentChatId = null;
        this.addMessage('assistant', 'Chat geleert. Bereit für neue Fragen!');
    }

    getApiKey() {
        const fromAttr = document.documentElement.getAttribute('data-api-key') || '';
        const fromStorage = localStorage.getItem(CONFIG.STORAGE_KEYS.API_KEY) || '';
        const key = fromAttr !== '__NVIDIA_API_KEY__' && fromAttr.length > 0 ? fromAttr : fromStorage;
        return key;
    }

    updateApiStatus() {
        const key = this.getApiKey();
        const ok = !!key && key !== '__NVIDIA_API_KEY__';
        if (this.elements.apiStatusDot) this.elements.apiStatusDot.className = ok ? 'status-dot ok' : 'status-dot';
        if (this.elements.apiStatusText) this.elements.apiStatusText.textContent = ok ? 'API Key bereit' : 'Kein API Key';
    }

    saveApiKey() {
        const key = this.elements.apiKeyInput.value.trim();
        localStorage.setItem(CONFIG.STORAGE_KEYS.API_KEY, key);
        this.updateApiStatus();
        alert('API Key gespeichert!');
    }

    setTypingState(isTyping) {
        this.state.isTyping = isTyping;
        if (this.elements.sendBtn) this.elements.sendBtn.disabled = isTyping;
        if (this.elements.input) this.elements.input.disabled = isTyping;
    }

    setStatus(text, type = 'muted') {
        if (!this.elements.statusEl) return;
        this.elements.statusEl.textContent = text;
        this.elements.statusEl.style.color = type === 'error' ? 'var(--error)' : (type === 'success' ? 'var(--success)' : 'var(--muted)');
    }

    addMessage(role, content, typing = false) {
        const div = document.createElement('div');
        div.className = 'msg ' + role;
        const avatar = role === 'user' ? '&#128101;' : '&#128169;';
        div.innerHTML = `
            <div class="avatar">${avatar}</div>
            <div class="bubble${typing ? ' typing' : ''}">${typing ? '<span class="stream-cursor"></span>' : this.escapeHtml(content)}</div>
        `;
        this.elements.messagesEl.appendChild(div);
        this.scrollToBottom();
        return div;
    }

    escapeHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    renderMarkdown(text) {
        if (!text) return '';
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

    scrollToBottom() {
        if (this.elements.messagesEl) {
            this.elements.messagesEl.scrollTop = this.elements.messagesEl.scrollHeight;
        }
    }
}

// Initialize App
window.addEventListener('DOMContentLoaded', () => {
    new NemotronApp();
});

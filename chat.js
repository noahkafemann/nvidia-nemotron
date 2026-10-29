// chat.js - Bulletproof Version
const CONFIG = {
    API_BASE: 'https://integrate.api.nvidia.com/v1',
    PROXY_URL: 'https://nvidia-nemotron.onrender.com',
    STORAGE_KEYS: {
        API_KEY: 'nemotron_api_key',
        USER_ID: 'userId',
        DARK_MODE: 'nemotron_dark_mode',
        COMPACT_MODE: 'nemotron_compact_mode',
        STREAMING: 'nemotron_streaming',
        SETTINGS: 'nemotron_settings',
        THEME: 'nemotron_theme',
        PULSE_COLLAPSED: 'nemotron_pulse_collapsed'
    },
    THEMES: ['theme-dark', 'theme-light', 'theme-neon', 'theme-ocean', 'theme-sunset', 'theme-forest'],
    DEFAULT_MODEL: 'nvidia/nemotron-3-ultra-550b-a55b',
    CONTEXT_WINDOW: 128000
};

const SPARKS = [
    { tag: 'Code', text: 'Refaktoriere folgenden Code und erkläre die wichtigsten Verbesserungen: …' },
    { tag: 'Debug', text: 'Ich habe folgenden Fehler. Analysiere die Ursache und zeige den minimalen Fix: …' },
    { tag: 'Lernen', text: 'Erstelle mir einen 7-Tage-Lernplan zu [Thema] mit täglichen Übungen und einer kurzen Selbstkontrolle.' },
    { tag: 'Kreativ', text: 'Schreibe eine atmosphärische Kurzgeschichte über [Idee] in genau 150 Wörtern mit einer überraschenden Wendung.' },
    { tag: 'Strategie', text: 'Entwickle drei unkonventionelle Strategien für [Ziel] und bewerte sie nach Aufwand, Wirkung und Risiko.' },
    { tag: 'Analyse', text: 'Analysiere [Thema] aus drei Perspektiven und erstelle eine Entscheidungsmatrix mit den wichtigsten Kriterien.' },
    { tag: 'Produktivität', text: 'Hilf mir, meine Aufgaben mit der Eisenhower-Matrix zu priorisieren. Hier sind sie: …' },
    { tag: 'Perspektive', text: 'Diskutiere [These] aus Sicht von [Person A] und [Person B]. Fasse am Ende den stärksten Einwand zusammen.' }
];

class NemotronApp {
    constructor() {
        this.state = {
            history: [{ role: 'system', content: 'Du bist ein hilfreicher KI-Assistent von NVIDIA Nemotron. Antworte auf Deutsch, sofern nicht anders gewünscht.' }],
            currentChatId: null,
            chats: [],
            isStreaming: true,
            temperature: 0.7,
            maxTokens: 1024,
            isTyping: false,
            pulse: { live: false, start: 0, firstToken: 0, chunks: 0, samples: [] }
        };

        this.elements = {};
        this.streamController = null;

        // Immediate initialization to avoid async race conditions for UI
        this.initSync();
        this.initAsync();
    }

    initSync() {
        console.log("NemotronApp: Starting sync initialization...");
        this.cacheElements();
        this.setupEventListeners();
        this.setupToggles();
        this.loadSettings();
        this.loadTheme();
        this.initPulse();
        this.renderSparks();

        // Basic Auth Guard (Sync part)
        const userId = localStorage.getItem(CONFIG.STORAGE_KEYS.USER_ID);
        if (!userId) {
            console.warn("No userId found, redirecting to login...");
            window.location.href = 'index.html';
        }
    }

    async initAsync() {
        try {
            console.log("NemotronApp: Starting async initialization...");
            await this.loadChatList();
            this.updateApiStatus();
        } catch (e) {
            console.error("NemotronApp: Async init failed", e);
        }
    }

    cacheElements() {
        const getEl = (id) => document.getElementById(id);
        this.elements = {
            messagesEl: getEl('messages'),
            form: getEl('chatForm'),
            input: getEl('userInput'),
            sendBtn: getEl('sendBtn'),
            statusEl: getEl('status'),
            keyWarning: getEl('key-warning'),
            clearChatBtn: getEl('clearChatBtn'),
            apiKeyInput: getEl('apiKeyInput'),
            saveKeyBtn: getEl('saveKeyBtn'),
            apiStatusDot: document.querySelector('.status-dot'),
            apiStatusText: getEl('apiStatusText'),
            navChat: getEl('navChat'),
            navHistory: getEl('navHistory'),
            navSettings: getEl('navSettings'),
            chatView: getEl('chatView'),
            historyView: getEl('historyView'),
            settingsView: getEl('settingsView'),
            chatList: getEl('chatList'),
            chatListContainer: getEl('chatListContainer'),
            newChatBtn: getEl('newChatBtn'),
            historyList: getEl('historyList'),
            historyEmpty: getEl('historyEmpty'),
            historyMeta: getEl('historyMeta'),
            refreshHistoryBtn: getEl('refreshHistoryBtn'),
            darkModeToggle: getEl('darkModeToggle'),
            streamToggle: getEl('streamToggle'),
            compactToggle: getEl('compactToggle'),
            tempInput: getEl('tempInput'),
            tokensInput: getEl('tokensInput'),
            themeSelect: getEl('themeSelect'),
            pulseHud: getEl('pulseHud'),
            pulseToggle: getEl('pulseToggle'),
            pulseLatency: getEl('pulseLatency'),
            pulseSpeed: getEl('pulseSpeed'),
            pulseTokens: getEl('pulseTokens'),
            pulseContext: getEl('pulseContext'),
            pulseContextFill: getEl('pulseContextFill'),
            pulseSpark: getEl('pulseSpark'),
            sparkBtn: getEl('sparkBtn'),
            sparkModal: getEl('sparkModal'),
            sparkClose: getEl('sparkClose'),
            sparkList: getEl('sparkList'),
            sparkRandom: getEl('sparkRandom')
        };
    }

    setupEventListeners() {
        console.log("NemotronApp: Binding events...");

        // Navigation - Use optional chaining and ensure they exist
        this.elements.navChat?.addEventListener('click', () => this.switchView('chat'));
        this.elements.navHistory?.addEventListener('click', () => this.switchView('history'));
        this.elements.navSettings?.addEventListener('click', () => this.switchView('settings'));

        // Chat Form
        if (this.elements.form) {
            this.elements.form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleSendMessage();
            });
        }

        if (this.elements.input) {
            this.elements.input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.elements.form?.requestSubmit();
                }
            });
        }

        // Sidebar Actions
        this.elements.clearChatBtn?.addEventListener('click', () => this.clearCurrentChat());
        this.elements.newChatBtn?.addEventListener('click', () => this.createNewChat());
        this.elements.saveKeyBtn?.addEventListener('click', () => this.saveApiKey());
        this.elements.refreshHistoryBtn?.addEventListener('click', () => this.loadChatList());

        this.elements.themeSelect?.addEventListener('change', (e) => this.applyTheme(e.target.value));

        // Nemotron Pulse + Ideen-Schmiede
        this.elements.pulseToggle?.addEventListener('click', () => this.togglePulse());
        this.elements.sparkBtn?.addEventListener('click', () => this.openSparks());
        this.elements.sparkClose?.addEventListener('click', () => this.closeSparks());
        this.elements.sparkRandom?.addEventListener('click', () => this.randomSpark());
        this.elements.sparkModal?.addEventListener('click', (e) => {
            if (e.target === this.elements.sparkModal) this.closeSparks();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.elements.sparkModal && this.elements.sparkModal.style.display !== 'none') {
                this.closeSparks();
            }
        });

        // Settings Toggles
        this.elements.darkModeToggle?.addEventListener('click', () => this.toggleDarkMode());
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
        console.log("NemotronApp: Events bound successfully.");
    }

    setupToggles() {
        const applyToggle = (key, elId, className) => {
            const el = document.getElementById(elId);
            if (!el) return;
            const val = localStorage.getItem(key) || (className ? 'On' : 'Off');
            el.textContent = val;
            if (className) document.body.classList.toggle(className, val === 'On');
        };

        applyToggle(CONFIG.STORAGE_KEYS.STREAMING, 'streamToggle', '');
        applyToggle(CONFIG.STORAGE_KEYS.COMPACT_MODE, 'compactToggle', 'compact-mode');
    }

    loadTheme() {
        const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.THEME) ||
            (localStorage.getItem(CONFIG.STORAGE_KEYS.DARK_MODE) === 'Off' ? 'theme-light' : 'theme-dark');
        this.applyTheme(saved, false);
    }

    applyTheme(theme, persist = true) {
        if (!CONFIG.THEMES.includes(theme)) theme = 'theme-dark';

        document.body.classList.remove(...CONFIG.THEMES);
        document.body.classList.add(theme);

        if (persist) localStorage.setItem(CONFIG.STORAGE_KEYS.THEME, theme);
        if (this.elements.themeSelect) this.elements.themeSelect.value = theme;

        const isLight = theme === 'theme-light';
        if (this.elements.darkModeToggle) this.elements.darkModeToggle.textContent = isLight ? 'Off' : 'On';
        localStorage.setItem(CONFIG.STORAGE_KEYS.DARK_MODE, isLight ? 'Off' : 'On');
        this.drawPulseSpark(this.state.pulse.samples);
    }

    toggleDarkMode() {
        const next = document.body.classList.contains('theme-light') ? 'theme-dark' : 'theme-light';
        this.applyTheme(next);
    }

    toggleSetting(key, elId) {
        const el = document.getElementById(elId);
        if (!el) return;
        const newState = el.textContent === 'On' ? 'Off' : 'On';
        el.textContent = newState;
        localStorage.setItem(key, newState);

        if (key === CONFIG.STORAGE_KEYS.COMPACT_MODE) document.body.classList.toggle('compact-mode', newState === 'On');
        if (key === CONFIG.STORAGE_KEYS.STREAMING) this.state.isStreaming = (newState === 'On');
    }

    loadSettings() {
        const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.SETTINGS);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                this.state.temperature = parsed.temperature || 0.7;
                this.state.maxTokens = parsed.maxTokens || 1024;
                if (this.elements.tempInput) this.elements.tempInput.value = this.state.temperature;
                if (this.elements.tokensInput) this.elements.tokensInput.value = this.state.maxTokens;
            } catch (e) { console.error("Settings parse error", e); }
        }
    }

    saveSettings() {
        localStorage.setItem(CONFIG.STORAGE_KEYS.SETTINGS, JSON.stringify({
            temperature: this.state.temperature,
            maxTokens: this.state.maxTokens
        }));
    }

    initPulse() {
        const collapsed = localStorage.getItem(CONFIG.STORAGE_KEYS.PULSE_COLLAPSED) === 'true';
        this.setPulseCollapsed(collapsed);
        this.updateContextMeter();
        this.drawPulseSpark([]);
    }

    setPulseCollapsed(collapsed) {
        if (!this.elements.pulseHud) return;
        this.elements.pulseHud.classList.toggle('collapsed', collapsed);
        if (this.elements.pulseToggle) this.elements.pulseToggle.textContent = collapsed ? '+' : '\u2212';
    }

    togglePulse() {
        if (!this.elements.pulseHud) return;
        const collapsed = !this.elements.pulseHud.classList.contains('collapsed');
        this.setPulseCollapsed(collapsed);
        localStorage.setItem(CONFIG.STORAGE_KEYS.PULSE_COLLAPSED, collapsed ? 'true' : 'false');
        if (!collapsed) this.drawPulseSpark(this.state.pulse.samples);
    }

    startPulse() {
        this.state.pulse = { live: true, start: performance.now(), firstToken: 0, chunks: 0, samples: [] };
        this.elements.pulseHud?.classList.add('live');
        if (this.elements.pulseLatency) this.elements.pulseLatency.textContent = '\u2026';
        if (this.elements.pulseSpeed) this.elements.pulseSpeed.textContent = '\u2026';
        if (this.elements.pulseTokens) this.elements.pulseTokens.textContent = '0';
        this.drawPulseSpark([]);
    }

    pulseOnChunk(count = 1) {
        const pulse = this.state.pulse;
        if (!pulse.live) return;

        const now = performance.now();
        if (!pulse.firstToken) pulse.firstToken = now;
        pulse.chunks += count;

        const elapsed = Math.max((now - pulse.firstToken) / 1000, 0.001);
        const speed = pulse.chunks / elapsed;
        pulse.samples.push(speed);
        if (pulse.samples.length > 48) pulse.samples.shift();

        if (this.elements.pulseLatency) this.elements.pulseLatency.textContent = `${Math.round(pulse.firstToken - pulse.start)} ms`;
        if (this.elements.pulseSpeed) this.elements.pulseSpeed.textContent = `${speed.toFixed(1)}/s`;
        if (this.elements.pulseTokens) this.elements.pulseTokens.textContent = String(pulse.chunks);
        this.drawPulseSpark(pulse.samples);
    }

    finishPulse() {
        const pulse = this.state.pulse;
        if (!pulse.live) return;

        pulse.live = false;
        this.elements.pulseHud?.classList.remove('live');
        if (pulse.chunks) {
            const elapsed = Math.max((performance.now() - (pulse.firstToken || pulse.start)) / 1000, 0.001);
            if (this.elements.pulseSpeed) this.elements.pulseSpeed.textContent = `${(pulse.chunks / elapsed).toFixed(1)}/s`;
        } else {
            if (this.elements.pulseLatency) this.elements.pulseLatency.textContent = '\u2013';
            if (this.elements.pulseSpeed) this.elements.pulseSpeed.textContent = '\u2013';
        }
        this.updateContextMeter();
    }

    resetPulse() {
        this.state.pulse = { live: false, start: 0, firstToken: 0, chunks: 0, samples: [] };
        this.elements.pulseHud?.classList.remove('live');
        if (this.elements.pulseLatency) this.elements.pulseLatency.textContent = '\u2013';
        if (this.elements.pulseSpeed) this.elements.pulseSpeed.textContent = '\u2013';
        if (this.elements.pulseTokens) this.elements.pulseTokens.textContent = '0';
        this.drawPulseSpark([]);
        this.updateContextMeter();
    }

    updateContextMeter() {
        const text = this.state.history.map(m => m.content || '').join(' ');
        const tokens = Math.round(text.length / 4);
        const percent = Math.min(100, (tokens / CONFIG.CONTEXT_WINDOW) * 100);

        if (this.elements.pulseContext) {
            this.elements.pulseContext.textContent = tokens
                ? `${percent < 1 ? '<1' : Math.round(percent)}%`
                : '0%';
        }
        if (this.elements.pulseContextFill) {
            this.elements.pulseContextFill.style.width = `${percent}%`;
        }
    }

    drawPulseSpark(samples = []) {
        const canvas = this.elements.pulseSpark;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const width = canvas.width;
        const height = canvas.height;
        ctx.clearRect(0, 0, width, height);
        if (!samples || samples.length < 2) return;

        const max = Math.max(...samples, 1);
        const accent = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#00f2ff';

        ctx.beginPath();
        samples.forEach((value, index) => {
            const x = (index / (samples.length - 1)) * (width - 4) + 2;
            const y = height - 3 - (value / max) * (height - 8);
            if (index === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });

        ctx.strokeStyle = accent;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.stroke();

        ctx.lineTo(width - 2, height - 2);
        ctx.lineTo(2, height - 2);
        ctx.closePath();
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = accent;
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    renderSparks() {
        if (!this.elements.sparkList) return;
        this.elements.sparkList.innerHTML = '';

        SPARKS.forEach(spark => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'spark-item';

            const tag = document.createElement('span');
            tag.className = 'spark-tag';
            tag.textContent = spark.tag;

            const text = document.createElement('span');
            text.className = 'spark-text';
            text.textContent = spark.text;

            item.append(tag, text);
            item.addEventListener('click', () => this.useSpark(spark.text));
            this.elements.sparkList.appendChild(item);
        });
    }

    openSparks() {
        if (!this.elements.sparkModal) return;
        this.elements.sparkModal.style.display = 'flex';
        this.elements.sparkClose?.focus();
    }

    closeSparks() {
        if (this.elements.sparkModal) this.elements.sparkModal.style.display = 'none';
        this.elements.sparkBtn?.focus();
    }

    useSpark(text) {
        this.closeSparks();
        if (!this.elements.input) return;
        this.elements.input.value = text;
        this.elements.input.focus();
        this.elements.input.setSelectionRange(text.length, text.length);
    }

    randomSpark() {
        const spark = SPARKS[Math.floor(Math.random() * SPARKS.length)];
        if (spark) this.useSpark(spark.text);
    }

    switchView(view) {
        console.log(`Switching to view: ${view}`);
        if (view === 'history') this.loadChatList();

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
        if (target.el) target.el.style.display = view === 'chat' ? 'block' : 'flex';
        if (target.nav) target.nav.classList.add('active');
    }

    async handleSendMessage() {
        const text = this.elements.input.value.trim();
        if (!text || this.state.isTyping) return;

        const apiKey = this.getApiKey();
        this.elements.keyWarning?.style.setProperty('display', 'none');

        this.elements.input.value = '';
        this.setTypingState(true);
        this.startPulse();

        this.addMessage('user', text);
        this.state.history.push({ role: 'user', content: text });
        this.updateContextMeter();

        const assistantMsg = this.addMessage('assistant', '', true);
        const bubble = assistantMsg.querySelector('.bubble');

        try {
            this.streamController = new AbortController();
            const response = await fetch(`${CONFIG.PROXY_URL}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: CONFIG.DEFAULT_MODEL,
                    messages: this.state.history,
                    temperature: this.state.temperature,
                    max_tokens: this.state.maxTokens,
                    stream: this.state.isStreaming
                }),
                signal: this.streamController.signal
            });

            if (!response.ok) throw new Error(`Server Error: ${response.status}`);

            bubble.classList.remove('typing');
            let fullReply = '';

            if (this.state.isStreaming) {
                if (!response.body) throw new Error('No response body received');

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

                        let parsed;
                        try {
                            parsed = JSON.parse(data);
                        } catch (e) {
                            console.error('Parse error', e);
                            continue;
                        }

                        if (parsed.error) throw new Error(parsed.error);

                        const delta = parsed.choices?.[0]?.delta?.content || '';
                        if (delta) {
                            fullReply += delta;
                            this.pulseOnChunk();
                            bubble.innerHTML = this.renderMarkdown(fullReply) + '<span class="stream-cursor"></span>';
                            this.scrollToBottom();
                        }
                    }
                }
            } else {
                const data = await response.json();
                if (data.error) throw new Error(data.error);
                fullReply = data.choices?.[0]?.message?.content || '';
                this.pulseOnChunk(Math.max(1, Math.round(fullReply.length / 4)));
            }

            bubble.innerHTML = this.renderMarkdown(fullReply || 'Keine Antwort erhalten.');
            this.state.history.push({ role: 'assistant', content: fullReply });
            if (fullReply) this.addBranchButton(bubble, this.state.history.length - 1);
            this.updateContextMeter();

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
            this.finishPulse();
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
            await this.loadChatList();
        } catch (e) {
            console.error('Failed to auto-save chat', e);
        }
    }

    async saveMessageToHistory(content) {
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

        if (this.elements.historyMeta) this.elements.historyMeta.textContent = 'Lade Verlauf ...';

        try {
            const response = await fetch(`${CONFIG.PROXY_URL}/chats`, {
                headers: { 'Authorization': userId }
            });
            if (!response.ok) throw new Error(`Server Error: ${response.status}`);

            const chats = await response.json();
            this.state.chats = Array.isArray(chats) ? chats : [];

            if (this.elements.chatListContainer) {
                this.elements.chatListContainer.style.display = 'flex';
            }

            this.renderChatList();
            this.renderHistory();
        } catch (e) {
            console.error('Error loading chats', e);
            if (this.elements.historyMeta) this.elements.historyMeta.textContent = 'Verlauf nicht verfügbar';
            if (this.elements.historyEmpty) {
                this.elements.historyEmpty.textContent = 'Der Verlauf konnte nicht geladen werden. Bitte versuche es erneut.';
                this.elements.historyEmpty.style.display = 'block';
            }
        }
    }

    renderChatList() {
        if (!this.elements.chatList) return;
        this.elements.chatList.innerHTML = '';

        if (!this.state.chats.length) {
            const empty = document.createElement('div');
            empty.className = 'chat-list-empty';
            empty.textContent = 'Noch keine Chats';
            this.elements.chatList.appendChild(empty);
            return;
        }

        this.state.chats.forEach(chat => {
            const item = document.createElement('div');
            item.className = 'chat-item' + (chat.id === this.state.currentChatId ? ' active' : '');
            item.dataset.chatId = chat.id;
            item.title = chat.title || 'Neuer Chat';

            const icon = document.createElement('span');
            icon.className = 'chat-item-icon';
            icon.textContent = '\u{1F4AC}';

            const label = document.createElement('span');
            label.className = 'chat-item-title';
            label.textContent = chat.title || 'Neuer Chat';

            item.append(icon, label);
            item.addEventListener('click', () => this.selectChat(chat.id, chat.title));
            this.elements.chatList.appendChild(item);
        });
    }

    renderHistory() {
        if (!this.elements.historyList) return;
        this.elements.historyList.innerHTML = '';

        const chats = this.state.chats;
        if (this.elements.historyMeta) {
            this.elements.historyMeta.textContent = chats.length === 1
                ? '1 gespeicherter Chat'
                : `${chats.length} gespeicherte Chats`;
        }
        if (this.elements.historyEmpty) {
            this.elements.historyEmpty.textContent = 'Noch kein Verlauf vorhanden.';
            this.elements.historyEmpty.style.display = chats.length ? 'none' : 'block';
        }

        chats.forEach(chat => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'history-item' + (chat.id === this.state.currentChatId ? ' active' : '');
            item.dataset.chatId = chat.id;

            const icon = document.createElement('span');
            icon.className = 'history-icon';
            icon.textContent = '\u{1F4AC}';

            const body = document.createElement('span');
            body.className = 'history-body';

            const title = document.createElement('span');
            title.className = 'history-title';
            title.textContent = chat.title || 'Neuer Chat';

            const preview = document.createElement('span');
            preview.className = 'history-preview';
            preview.textContent = chat.preview || 'Noch keine Nachrichten';

            const meta = document.createElement('span');
            meta.className = 'history-meta';

            const messageCount = Number(chat.message_count) || 0;
            const count = document.createElement('span');
            count.textContent = `${messageCount} ${messageCount === 1 ? 'Nachricht' : 'Nachrichten'}`;

            const date = document.createElement('span');
            date.textContent = this.formatChatDate(chat.updated_at);

            meta.append(count, date);
            body.append(title, preview, meta);

            const arrow = document.createElement('span');
            arrow.className = 'history-arrow';
            arrow.textContent = '\u2192';

            item.append(icon, body, arrow);
            item.addEventListener('click', () => this.selectChat(chat.id, chat.title));
            this.elements.historyList.appendChild(item);
        });
    }

    formatChatDate(value) {
        if (!value || value === 'now') return 'Gespeichert';

        const date = new Date(value);
        if (isNaN(date.getTime())) return 'Gespeichert';

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const dayDiff = Math.round((startOfToday - startOfDate) / 86400000);
        const time = date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

        if (dayDiff === 0) return `Heute, ${time}`;
        if (dayDiff === 1) return `Gestern, ${time}`;
        return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    updateActiveChat() {
        document.querySelectorAll('.chat-item, .history-item').forEach(el => {
            el.classList.toggle('active', el.dataset.chatId === this.state.currentChatId);
        });
    }

    async selectChat(id, title) {
        this.state.currentChatId = id;
        this.updateActiveChat();
        this.switchView('chat');

        try {
            const response = await fetch(`${CONFIG.PROXY_URL}/chats/${id}/messages`, {
                headers: { 'Authorization': localStorage.getItem(CONFIG.STORAGE_KEYS.USER_ID) }
            });
            if (!response.ok) throw new Error(`Server Error: ${response.status}`);
            const messages = await response.json();

            this.elements.messagesEl.innerHTML = '';
            this.state.history = [{ role: 'system', content: 'Du bist ein hilfreicher KI-Assistent von NVIDIA Nemotron.' }];

            messages.forEach(m => {
                this.addMessage(m.role, m.content);
                this.state.history.push(m);
            });

            this.resetPulse();
            this.setStatus(`Chat "${title}" geladen`);
        } catch (e) {
            console.error('Error selecting chat', e);
            this.setStatus('Fehler beim Laden', 'error');
        }
    }

    createNewChat() {
        this.state.currentChatId = null;
        this.updateActiveChat();
        this.elements.messagesEl.innerHTML = '';
        this.state.history = [{ role: 'system', content: 'Du bist ein hilfreicher KI-Assistent von NVIDIA Nemotron.' }];
        this.addMessage('assistant', 'Hallo! Ich bin ein neuer Chat. Wie kann ich dir helfen?', false, false);
        this.resetPulse();
        this.switchView('chat');
    }

    clearCurrentChat() {
        if (!confirm('Möchtest du diesen Chat wirklich leeren?')) return;
        this.elements.messagesEl.innerHTML = '';
        this.state.history = [{ role: 'system', content: 'Du bist ein hilfreicher KI-Assistent von NVIDIA Nemotron.' }];
        this.state.currentChatId = null;
        this.updateActiveChat();
        this.addMessage('assistant', 'Chat geleert. Bereit für neue Fragen!', false, false);
        this.resetPulse();
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

    addBranchButton(bubble, historyIndex) {
        if (!bubble || bubble.querySelector('.branch-btn')) return;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'branch-btn';
        button.title = 'Neuen Branch ab hier erstellen';
        button.setAttribute('aria-label', 'Neuen Branch ab hier erstellen');
        button.textContent = '\u21B3';
        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.branchChat(historyIndex);
        });
        bubble.appendChild(button);
    }

    async branchChat(historyIndex) {
        if (this.state.isTyping) return;
        if (historyIndex < 1 || historyIndex >= this.state.history.length) return;

        const messages = this.state.history
            .slice(1, historyIndex + 1)
            .map(m => ({ role: m.role, content: m.content }));
        if (!messages.length) return;

        const userId = localStorage.getItem(CONFIG.STORAGE_KEYS.USER_ID);
        if (!userId) return;

        const currentChat = this.state.chats.find(chat => chat.id === this.state.currentChatId);
        const baseTitle = currentChat?.title || messages.find(m => m.role === 'user')?.content || 'Neuer Chat';
        const title = `Branch: ${baseTitle}`.slice(0, 60);
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': userId
        };

        this.setStatus('Erstelle Branch ...');

        try {
            const createResponse = await fetch(`${CONFIG.PROXY_URL}/chats`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ title })
            });
            if (!createResponse.ok) throw new Error(`Server Error: ${createResponse.status}`);
            const created = await createResponse.json();
            if (!created.id) throw new Error('Branch konnte nicht erstellt werden');

            for (const message of messages) {
                const saveResponse = await fetch(`${CONFIG.PROXY_URL}/chats/${created.id}/messages`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(message)
                });
                if (!saveResponse.ok) throw new Error(`Server Error: ${saveResponse.status}`);
            }

            this.state.currentChatId = created.id;
            this.state.history = [{ role: 'system', content: 'Du bist ein hilfreicher KI-Assistent von NVIDIA Nemotron.' }];
            this.elements.messagesEl.innerHTML = '';
            messages.forEach(message => {
                this.addMessage(message.role, message.content);
                this.state.history.push(message);
            });

            this.resetPulse();
            this.updateActiveChat();
            await this.loadChatList();
            this.switchView('chat');
            this.setStatus('Branch erstellt \u2014 stelle jetzt deine alternative Frage', 'success');
            this.elements.input?.focus();
        } catch (e) {
            console.error('Branch error', e);
            this.setStatus('Branch fehlgeschlagen', 'error');
        }
    }

    addMessage(role, content, typing = false, branchable = true) {
        const div = document.createElement('div');
        div.className = 'msg ' + role;
        const avatar = role === 'user' ? '&#128101;' : '&#128169;';
        const historyIndex = this.state.history.length;
        div.innerHTML = `
            <div class="avatar">${avatar}</div>
            <div class="bubble${typing ? ' typing' : ''}">${typing ? '<span class="stream-cursor"></span>' : this.escapeHtml(content)}</div>
        `;

        const bubble = div.querySelector('.bubble');
        if (role === 'assistant' && !typing && branchable && content) {
            this.addBranchButton(bubble, historyIndex);
        }

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
    try {
        new NemotronApp();
    } catch (e) {
        console.error("Critical App Initialization Error:", e);
    }
});

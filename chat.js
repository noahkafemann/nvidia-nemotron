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

const SYSTEM_PROMPT = `Du bist Nemotron, ein hilfreicher KI-Assistent von NVIDIA.
Antworte standardmaessig auf Deutsch.
Beginne deine erste Antwort mit einer Zeile TITLE: <kurzer Titel> und danach Leerzeile.
Formatiere deine Antworten immer mit Markdown:
- **fett** für wichtige Begriffe
- *kursiv* für Betonungen
- \`inline code\` für Code, Befehle und Dateinamen
- Fenced Code Blocks mit Sprachangabe für mehrzeiligen Code
- Überschriften, Listen, Tabellen und Blockquotes, wenn sie die Lesbarkeit verbessern
- Keine HTML-Tags
Strukturiere längere Antworten mit kurzen Abschnitten. Sei präzise, ehrlich und hilfreich.`;

class NemotronApp {
    constructor() {
        this.state = {
            history: [{ role: 'system', content: SYSTEM_PROMPT }],
            currentChatId: null,
            chats: [],
            isStreaming: true,
            temperature: 0.7,
            maxTokens: 1024,
            isTyping: false,
            pulse: { live: false, start: 0, firstToken: 0, chunks: 0, samples: [] },
            trace: {
                status: 'idle',
                request: null,
                startedAt: 0,
                promptMs: 0,
                requestAt: 0,
                firstTokenAt: 0,
                finishedAt: 0,
                events: [],
                usage: null,
                finishReason: null,
                error: null,
                reasoning: '',
                fullReply: ''
            }
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
            sparkRandom: getEl('sparkRandom'),
            xrayBtn: getEl('xrayBtn'),
            xrayModal: getEl('xrayModal'),
            xrayClose: getEl('xrayClose'),
            xrayStatus: getEl('xrayStatus'),
            xrayPipeline: getEl('xrayPipeline'),
            xrayPromptTime: getEl('xrayPromptTime'),
            xrayRequestTime: getEl('xrayRequestTime'),
            xrayFirstTime: getEl('xrayFirstTime'),
            xrayStreamTime: getEl('xrayStreamTime'),
            xrayDoneTime: getEl('xrayDoneTime'),
            xrayRequestMeta: getEl('xrayRequestMeta'),
            xrayUsage: getEl('xrayUsage'),
            xrayReasoningCard: getEl('xrayReasoningCard'),
            xrayReasoning: getEl('xrayReasoning'),
            xrayEventCount: getEl('xrayEventCount'),
            xrayEvents: getEl('xrayEvents'),
            xrayHeatmap: getEl('xrayHeatmap'),
            xraySystemPrompt: getEl('xraySystemPrompt'),
            xrayRaw: getEl('xrayRaw'),
            xrayCopyRequest: getEl('xrayCopyRequest'),
            xrayCopyStream: getEl('xrayCopyStream'),
            xrayExport: getEl('xrayExport')
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

        // Nemotron Pulse, Ideen-Schmiede + Model X-Ray
        this.elements.pulseToggle?.addEventListener('click', () => this.togglePulse());
        this.elements.sparkBtn?.addEventListener('click', () => this.openSparks());
        this.elements.sparkClose?.addEventListener('click', () => this.closeSparks());
        this.elements.sparkRandom?.addEventListener('click', () => this.randomSpark());
        this.elements.sparkModal?.addEventListener('click', (e) => {
            if (e.target === this.elements.sparkModal) this.closeSparks();
        });
        this.elements.xrayBtn?.addEventListener('click', () => this.openXray());
        this.elements.xrayClose?.addEventListener('click', () => this.closeXray());
        this.elements.xrayModal?.addEventListener('click', (e) => {
            if (e.target === this.elements.xrayModal) this.closeXray();
        });
        this.elements.xrayCopyRequest?.addEventListener('click', () => this.copyXrayRequest());
        this.elements.xrayCopyStream?.addEventListener('click', () => this.copyXrayStream());
        this.elements.xrayExport?.addEventListener('click', () => this.exportXray());
        this.elements.messagesEl?.addEventListener('click', (e) => {
            const button = e.target.closest('.code-copy');
            if (!button) return;
            const code = button.closest('.code-block')?.querySelector('code')?.textContent || '';
            this.copyText(code).then(() => {
                button.textContent = 'Kopiert';
                setTimeout(() => { button.textContent = 'Kopieren'; }, 1200);
            });
        });
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'x') {
                e.preventDefault();
                this.openXray();
                return;
            }
            if (e.key === 'Escape') {
                if (this.elements.xrayModal && this.elements.xrayModal.style.display !== 'none') {
                    this.closeXray();
                } else if (this.elements.sparkModal && this.elements.sparkModal.style.display !== 'none') {
                    this.closeSparks();
                }
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
        const applyToggle = (key, elId, className, defaultValue) => {
            const el = document.getElementById(elId);
            if (!el) return;
            const val = localStorage.getItem(key) || defaultValue;
            el.textContent = val;
            if (className) document.body.classList.toggle(className, val === 'On');
        };

        applyToggle(CONFIG.STORAGE_KEYS.STREAMING, 'streamToggle', '', 'On');
        applyToggle(CONFIG.STORAGE_KEYS.COMPACT_MODE, 'compactToggle', 'compact-mode', 'On');
        this.state.isStreaming = document.getElementById('streamToggle')?.textContent === 'On';
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

    resetTrace() {
        this.state.trace = {
            status: 'idle',
            request: null,
            startedAt: 0,
            promptMs: 0,
            requestAt: 0,
            firstTokenAt: 0,
            finishedAt: 0,
            events: [],
            usage: null,
            finishReason: null,
            error: null,
            reasoning: '',
            fullReply: ''
        };
        this.scheduleXrayUpdate();
    }

    beginTrace(request, promptStartedAt) {
        const now = performance.now();
        this.state.trace = {
            status: 'requesting',
            request,
            startedAt: now,
            promptMs: Math.max(0, now - promptStartedAt),
            requestAt: 0,
            firstTokenAt: 0,
            finishedAt: 0,
            events: [],
            usage: null,
            finishReason: null,
            error: null,
            reasoning: '',
            fullReply: ''
        };
        this.scheduleXrayUpdate();
    }

    markTraceRequest() {
        const trace = this.state.trace;
        if (!trace.startedAt) return;
        trace.requestAt = performance.now();
        trace.status = 'streaming';
        this.scheduleXrayUpdate();
    }

    traceChunk({ delta = '', reasoning = '', raw = '', usage = null, finishReason = null }) {
        const trace = this.state.trace;
        if (!trace.startedAt) return;

        const now = performance.now();
        if ((delta || reasoning) && !trace.firstTokenAt) trace.firstTokenAt = now;
        if (delta) trace.fullReply += delta;
        if (reasoning) trace.reasoning += reasoning;
        if (usage) trace.usage = usage;
        if (finishReason) trace.finishReason = finishReason;

        trace.events.push({
            offset: Math.max(0, now - trace.startedAt),
            delta,
            reasoning,
            raw: String(raw || '').slice(0, 4000),
            usage,
            finishReason
        });
        if (trace.events.length > 200) trace.events.shift();
        this.scheduleXrayUpdate();
    }

    finishTrace(status = 'done', error = null) {
        const trace = this.state.trace;
        if (!trace.startedAt || trace.finishedAt) return;
        trace.finishedAt = performance.now();
        trace.status = status;
        trace.error = error;
        this.scheduleXrayUpdate();
    }

    scheduleXrayUpdate() {
        if (!this.elements.xrayModal || this.elements.xrayModal.style.display === 'none') return;
        if (this.xrayRaf) return;
        this.xrayRaf = requestAnimationFrame(() => {
            this.xrayRaf = null;
            this.renderXray();
        });
    }

    openXray() {
        if (!this.elements.xrayModal) return;
        this.elements.xrayModal.style.display = 'flex';
        this.renderXray();
        this.elements.xrayClose?.focus();
    }

    closeXray() {
        if (this.elements.xrayModal) this.elements.xrayModal.style.display = 'none';
        this.elements.xrayBtn?.focus();
    }

    renderXray() {
        if (!this.elements.xrayModal || this.elements.xrayModal.style.display === 'none') return;

        const trace = this.state.trace;
        const now = performance.now();
        const labels = {
            idle: 'Bereit',
            requesting: 'Warte auf Antwort',
            streaming: 'Streaming',
            done: 'Abgeschlossen',
            error: 'Fehler'
        };

        if (this.elements.xrayStatus) {
            const statusClass = trace.status === 'requesting' || trace.status === 'streaming'
                ? ' live'
                : trace.status === 'done'
                    ? ' success'
                    : trace.status === 'error'
                        ? ' error'
                        : '';
            this.elements.xrayStatus.className = 'xray-status' + statusClass;
            this.elements.xrayStatus.textContent = labels[trace.status] || trace.status;
        }

        const formatMs = (value) => value >= 0 ? `${Math.round(value)} ms` : '\u2013';
        const setStage = (name, state, timeText) => {
            const stage = this.elements.xrayPipeline?.querySelector(`[data-stage="${name}"]`);
            if (!stage) return;
            stage.classList.toggle('active', state === 'active');
            stage.classList.toggle('done', state === 'done');
            const time = stage.querySelector('em');
            if (time) time.textContent = timeText;
        };

        const hasRequest = !!trace.request;
        const requestStarted = trace.startedAt > 0;
        const firstToken = trace.firstTokenAt > 0;
        const finished = trace.finishedAt > 0;

        setStage('prompt', hasRequest ? 'done' : 'idle', hasRequest ? formatMs(trace.promptMs) : '\u2013');
        setStage(
            'request',
            trace.requestAt ? 'done' : (requestStarted && !finished ? 'active' : 'idle'),
            trace.requestAt ? formatMs(trace.requestAt - trace.startedAt) : (requestStarted && !finished ? 'l\u00e4uft' : '\u2013')
        );
        setStage(
            'first',
            firstToken ? 'done' : (trace.requestAt && !finished ? 'active' : 'idle'),
            firstToken ? formatMs(trace.firstTokenAt - trace.startedAt) : (trace.requestAt && !finished ? 'wartet' : '\u2013')
        );
        const streamEnd = finished ? trace.finishedAt : (trace.firstTokenAt || now);
        setStage('stream', firstToken ? (finished ? 'done' : 'active') : 'idle', firstToken ? formatMs(streamEnd - trace.firstTokenAt) : '\u2013');
        setStage('done', finished ? 'done' : 'idle', finished ? formatMs(trace.finishedAt - trace.startedAt) : '\u2013');

        if (this.elements.xrayRequestMeta) {
            if (!trace.request) {
                this.elements.xrayRequestMeta.textContent = 'Noch kein Request.';
            } else {
                const request = trace.request;
                const messages = Array.isArray(request.messages) ? request.messages : [];
                const promptChars = messages.reduce((sum, message) => sum + String(message.content || '').length, 0);
                const promptTokens = Math.round(promptChars / 4);
                const rows = [
                    ['Modell', request.model || '\u2013'],
                    ['Temperatur', request.temperature ?? '\u2013'],
                    ['Max Tokens', request.max_tokens ?? '\u2013'],
                    ['Streaming', request.stream ? 'Ja' : 'Nein'],
                    ['Nachrichten', messages.length],
                    ['Prompt-Tokens', `~${promptTokens}`],
                    ['Kontext', `${Math.min(100, (promptTokens / CONFIG.CONTEXT_WINDOW) * 100).toFixed(1)}%`]
                ];
                this.elements.xrayRequestMeta.innerHTML = rows
                    .map(([key, value]) => `<span>${this.escapeHtml(String(key))}</span><span>${this.escapeHtml(String(value))}</span>`)
                    .join('');
            }
        }

        if (this.elements.xrayUsage) {
            if (!trace.usage && !trace.finishReason && !trace.error) {
                this.elements.xrayUsage.textContent = trace.request
                    ? 'Usage wird nach Abschluss angezeigt (bei Streaming ggf. gesch\u00e4tzt).'
                    : 'Noch keine Daten.';
            } else {
                const usage = trace.usage || {};
                const messages = Array.isArray(trace.request?.messages) ? trace.request.messages : [];
                const promptTokens = usage.prompt_tokens ?? Math.round(messages.reduce((sum, message) => sum + String(message.content || '').length, 0) / 4);
                const completionTokens = usage.completion_tokens ?? Math.round(trace.fullReply.length / 4);
                const totalTokens = usage.total_tokens ?? (promptTokens + completionTokens);
                const rows = [
                    ['Prompt-Tokens', usage.prompt_tokens != null ? usage.prompt_tokens : `~${promptTokens}`],
                    ['Completion-Tokens', usage.completion_tokens != null ? usage.completion_tokens : `~${completionTokens}`],
                    ['Gesamt', usage.total_tokens != null ? usage.total_tokens : `~${totalTokens}`],
                    ['Finish Reason', trace.finishReason || '\u2013']
                ];
                if (trace.error) rows.push(['Fehler', trace.error]);
                this.elements.xrayUsage.innerHTML = rows
                    .map(([key, value]) => `<span>${this.escapeHtml(String(key))}</span><span>${this.escapeHtml(String(value))}</span>`)
                    .join('');
            }
        }

        if (this.elements.xrayReasoningCard) {
            this.elements.xrayReasoningCard.style.display = trace.reasoning ? 'block' : 'none';
        }
        if (this.elements.xrayReasoning) {
            this.elements.xrayReasoning.textContent = trace.reasoning;
        }

        if (this.elements.xrayEventCount) {
            this.elements.xrayEventCount.textContent = String(trace.events.length);
        }
        if (this.elements.xrayEvents) {
            const eventsEl = this.elements.xrayEvents;
            const nearBottom = eventsEl.scrollHeight - eventsEl.scrollTop - eventsEl.clientHeight < 60;
            if (!trace.events.length) {
                eventsEl.innerHTML = '<div class="xray-empty">Sende eine Nachricht, um den Stream zu sehen.</div>';
            } else {
                eventsEl.innerHTML = trace.events.slice(-80).map(event => {
                    const type = event.delta ? 'token' : event.reasoning ? 'reasoning' : 'meta';
                    const preview = String(event.delta || event.reasoning || (event.usage ? 'usage' : '')).replace(/\s+/g, ' ').slice(0, 160);
                    const size = event.delta
                        ? `${event.delta.length} Z.`
                        : event.reasoning
                            ? `${event.reasoning.length} Z.`
                            : 'meta';
                    return `<div class="xray-event"><span class="xray-event-time">+${Math.round(event.offset)} ms</span><span class="xray-event-type">${type}</span><span class="xray-event-preview">${this.escapeHtml(preview) || '&nbsp;'}</span><span class="xray-event-size">${size}</span></div>`;
                }).join('');
                if (nearBottom) eventsEl.scrollTop = eventsEl.scrollHeight;
            }
        }

        if (this.elements.xrayHeatmap) {
            const tokenEvents = trace.events.filter(event => event.delta || event.reasoning);
            if (!tokenEvents.length) {
                this.elements.xrayHeatmap.innerHTML = '<span class="xray-empty">Noch keine Token-Daten.</span>';
            } else {
                let previous = 0;
                const tokens = tokenEvents.map(event => {
                    const delay = Math.max(0, event.offset - previous);
                    previous = event.offset;
                    return { event, delay };
                });
                this.elements.xrayHeatmap.innerHTML = tokens.slice(-160).map(({ event, delay }) => {
                    const delayClass = delay > 180 ? ' slow' : delay > 70 ? ' medium' : '';
                    const reasoningClass = event.reasoning ? ' reasoning' : '';
                    const text = event.delta || event.reasoning;
                    const title = `+${Math.round(event.offset)} ms \u00b7 ${text.length} Zeichen \u00b7 ${Math.round(delay)} ms seit letztem Chunk`;
                    return `<span class="xray-token${reasoningClass}${delayClass}" title="${this.escapeAttr(title)}"></span>`;
                }).join('');
                this.elements.xrayHeatmap.scrollLeft = this.elements.xrayHeatmap.scrollWidth;
            }
        }

        if (this.elements.xraySystemPrompt) {
            this.elements.xraySystemPrompt.textContent = SYSTEM_PROMPT;
        }

        if (this.elements.xrayRaw) {
            if (!trace.request) {
                this.elements.xrayRaw.textContent = 'Noch keine Rohdaten.';
            } else {
                const raw = {
                    request: trace.request,
                    timing: {
                        promptMs: trace.promptMs,
                        requestMs: trace.requestAt ? trace.requestAt - trace.startedAt : null,
                        firstTokenMs: trace.firstTokenAt ? trace.firstTokenAt - trace.startedAt : null,
                        totalMs: trace.finishedAt ? trace.finishedAt - trace.startedAt : null
                    },
                    usage: trace.usage,
                    finishReason: trace.finishReason,
                    error: trace.error,
                    events: trace.events.slice(-50).map(event => ({
                        offset: event.offset,
                        delta: event.delta,
                        reasoning: event.reasoning,
                        raw: event.raw
                    }))
                };
                const text = JSON.stringify(raw, null, 2);
                this.elements.xrayRaw.textContent = text.length > 20000 ? `${text.slice(0, 20000)}\n\u2026` : text;
            }
        }
    }

    async copyText(text) {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
            } else {
                const area = document.createElement('textarea');
                area.value = text;
                area.style.position = 'fixed';
                area.style.opacity = '0';
                document.body.appendChild(area);
                area.select();
                document.execCommand('copy');
                area.remove();
            }
            this.setStatus('In Zwischenablage kopiert', 'success');
        } catch (e) {
            console.error('Copy error', e);
            this.setStatus('Kopieren fehlgeschlagen', 'error');
        }
    }

    copyXrayRequest() {
        this.copyText(JSON.stringify(this.state.trace.request || {}, null, 2));
    }

    copyXrayStream() {
        this.copyText(this.state.trace.events.map(event => event.raw).join('\n'));
    }

    exportXray() {
        const blob = new Blob([JSON.stringify(this.state.trace, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `nemotron-xray-${Date.now()}.json`;
        link.click();
        URL.revokeObjectURL(url);
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

        const promptStartedAt = performance.now();
        this.addMessage('user', text);
        this.state.history.push({ role: 'user', content: text });
        this.updateContextMeter();

        let useStream = this.state.isStreaming;
        const payload = {
            model: CONFIG.DEFAULT_MODEL,
            messages: this.state.history.map(message => ({ role: message.role, content: message.content })),
            temperature: this.state.temperature,
            max_tokens: this.state.maxTokens,
            stream: useStream
        };
        this.beginTrace(payload, promptStartedAt);

        const assistantMsg = this.addMessage('assistant', '', true);
        const bubble = assistantMsg.querySelector('.bubble');

        try {
            this.streamController = new AbortController();
            const requestChat = () => fetch(`${CONFIG.PROXY_URL}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: this.streamController.signal
            });

            let response;
            try {
                response = await requestChat();
                if (!response.ok && useStream && response.status >= 500) {
                    useStream = false;
                    payload.stream = false;
                    if (this.state.trace.request) this.state.trace.request.stream = false;
                    this.setStatus('Streaming fehlgeschlagen, versuche ohne Streaming ...');
                    response = await requestChat();
                }
            } catch (fetchError) {
                if (fetchError.name === 'AbortError' || !useStream) throw fetchError;
                useStream = false;
                payload.stream = false;
                if (this.state.trace.request) this.state.trace.request.stream = false;
                this.setStatus('Streaming fehlgeschlagen, versuche ohne Streaming ...');
                response = await requestChat();
            }

            this.markTraceRequest();

            if (!response.ok) throw new Error(`Server Error: ${response.status}`);

            bubble.classList.remove('typing');
            let fullReply = '';

            if (useStream) {
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
                        const reasoningDelta = parsed.choices?.[0]?.delta?.reasoning_content || parsed.choices?.[0]?.delta?.reasoning || '';
                        const finishReason = parsed.choices?.[0]?.finish_reason || null;
                        this.traceChunk({
                            delta,
                            reasoning: reasoningDelta,
                            raw: data,
                            usage: parsed.usage || null,
                            finishReason
                        });

                        if (delta) {
                            fullReply += delta;
                            this.pulseOnChunk();
                            bubble.innerHTML = this.renderMarkdown(fullReply) + '<span class="stream-cursor"></span>';
                            this.scrollToBottom();
                        } else if (reasoningDelta && !fullReply) {
                            bubble.innerHTML = '<span class="thinking-label">Reasoning-Stream aktiv \u2026</span>';
                        }
                    }
                }
            } else {
                const data = await response.json();
                if (data.error) throw new Error(data.error);
                const reasoning = data.choices?.[0]?.message?.reasoning_content || data.choices?.[0]?.message?.reasoning || '';
                fullReply = data.choices?.[0]?.message?.content || '';
                this.traceChunk({
                    delta: fullReply,
                    reasoning,
                    raw: JSON.stringify(data),
                    usage: data.usage || null,
                    finishReason: data.choices?.[0]?.finish_reason || null
                });
                this.pulseOnChunk(Math.max(1, Math.round(fullReply.length / 4)));
            }

            this.finishTrace('done');
            const cleanReply = (fullReply||'').replace(/^TITLE:.*\n\n?/,''); bubble.innerHTML = this.renderMarkdown(cleanReply || 'Keine Antwort erhalten.');
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
            this.finishTrace('error', err.name === 'AbortError' ? 'Abgebrochen' : err.message);
            if (err.name === 'AbortError') {
                this.setStatus('Abgebrochen');
            } else {
                const message = err.name === 'TypeError'
                    ? 'Server nicht erreichbar. Render startet möglicherweise gerade – bitte in einigen Sekunden erneut versuchen.'
                    : /^Server Error: 5\d\d$/.test(err.message)
                        ? 'Der Server hatte einen internen Fehler. Bitte versuche es erneut.'
                        : err.message;
                bubble.innerHTML = `<span style="color: var(--error)">Fehler: ${this.escapeHtml(message)}</span>`;
                this.setStatus('Fehler', 'error');
            }
        } finally {
            this.finishTrace('done');
            this.finishPulse();
            this.setTypingState(false);
            this.scrollToBottom();
        }
    }

    async autoSaveChat(firstReply) {
const m = (firstReply||'').match(/^TITLE:\s*(.+)/m); const title = (m ? m[1] : (firstReply||'Neuer Chat')).trim().substring(0,60);
const title = (userMsg + (firstReply ? ' → ' + firstReply : '')).replace(/\s+/g, ' ').trim().substring(0, 60) || 'Neuer Chat';
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
            const cleanReply2=(firstReply||'').replace(/^TITLE:.*\n\n?/,''); await this.saveMessageToHistory(cleanReply2);
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
        this.resetTrace();

        try {
            const response = await fetch(`${CONFIG.PROXY_URL}/chats/${id}/messages`, {
                headers: { 'Authorization': localStorage.getItem(CONFIG.STORAGE_KEYS.USER_ID) }
            });
            if (!response.ok) throw new Error(`Server Error: ${response.status}`);
            const messages = await response.json();

            this.elements.messagesEl.innerHTML = '';
            this.state.history = [{ role: 'system', content: SYSTEM_PROMPT }];

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
        this.resetTrace();
        this.elements.messagesEl.innerHTML = '';
        this.state.history = [{ role: 'system', content: SYSTEM_PROMPT }];
        this.addMessage('assistant', 'Hallo! Ich bin ein neuer Chat. Wie kann ich dir helfen?', false, false);
        this.resetPulse();
        this.switchView('chat');
    }

    clearCurrentChat() {
        if (!confirm('Möchtest du diesen Chat wirklich leeren?')) return;
        this.elements.messagesEl.innerHTML = '';
        this.state.history = [{ role: 'system', content: SYSTEM_PROMPT }];
        this.state.currentChatId = null;
        this.updateActiveChat();
        this.resetTrace();
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
            this.resetTrace();
            this.state.history = [{ role: 'system', content: SYSTEM_PROMPT }];
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
        const avatar = role === 'user' ? '&#128101;' : 'N';
        const historyIndex = this.state.history.length;
        const rendered = typing
            ? '<span class="stream-cursor"></span>'
            : (role === 'assistant' ? this.renderMarkdown(content) : this.escapeHtml(content));
        div.innerHTML = `
            <div class="avatar">${avatar}</div>
            <div class="bubble${typing ? ' typing' : ''}">${rendered}</div>
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

    escapeAttr(str) {
        return this.escapeHtml(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    sanitizeUrl(url) {
        const trimmed = String(url).trim();
        if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
        if (trimmed.startsWith('/') || trimmed.startsWith('#')) return trimmed;
        return '';
    }

    renderInline(text) {
        if (!text) return '';
        const tokens = [];
        const stash = (html) => {
            const key = `\uE000${tokens.length}\uE001`;
            tokens.push(html);
            return key;
        };

        let working = String(text);
        working = working.replace(/`([^`\n]+)`/g, (_, code) => stash(`<code>${this.escapeHtml(code)}</code>`));
        working = working.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
            const safeUrl = this.sanitizeUrl(url);
            if (!safeUrl) return stash(this.escapeHtml(label));
            return stash(`<a href="${this.escapeAttr(safeUrl)}" target="_blank" rel="noopener noreferrer">${this.renderInline(label)}</a>`);
        });

        working = this.escapeHtml(working);
        working = working.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        working = working.replace(/__([^_]+)__/g, '<strong>$1</strong>');
        working = working.replace(/~~([^~]+)~~/g, '<del>$1</del>');
        working = working.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
        working = working.replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');
        working = working.replace(/\uE000(\d+)\uE001/g, (_, index) => tokens[Number(index)] || '');
        return working.replace(/\n/g, '<br>');
    }

    parseTableRow(line) {
        let trimmed = String(line).trim();
        if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
        if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);

        const cells = [];
        let current = '';
        let escaped = false;
        for (const char of trimmed) {
            if (escaped) {
                current += char;
                escaped = false;
                continue;
            }
            if (char === '\\') {
                escaped = true;
                continue;
            }
            if (char === '|') {
                cells.push(current.trim());
                current = '';
                continue;
            }
            current += char;
        }
        cells.push(current.trim());
        return cells;
    }

    parseTableAlign(line) {
        return this.parseTableRow(line).map(cell => {
            const left = cell.startsWith(':');
            const right = cell.endsWith(':');
            if (left && right) return 'center';
            if (right) return 'right';
            if (left) return 'left';
            return '';
        });
    }

    renderTable(header, align, rows) {
        const cell = (tag, value, index) => {
            const alignment = align[index] ? ` style="text-align:${align[index]}"` : '';
            return `<${tag}${alignment}>${this.renderInline(value || '')}</${tag}>`;
        };
        const head = `<thead><tr>${header.map((value, index) => cell('th', value, index)).join('')}</tr></thead>`;
        const body = rows.length
            ? `<tbody>${rows.map(row => `<tr>${header.map((_, index) => cell('td', row[index] || '', index)).join('')}</tr>`).join('')}</tbody>`
            : '';
        return `<div class="table-wrap"><table>${head}${body}</table></div>`;
    }

    renderCodeBlock(code, lang) {
        const language = String(lang || '').trim();
        const label = language || 'Code';
        return `<div class="code-block"><div class="code-head"><span class="code-lang">${this.escapeHtml(label)}</span><button type="button" class="code-copy">Kopieren</button></div><pre><code${language ? ` class="language-${this.escapeAttr(language)}"` : ''}>${this.escapeHtml(code)}</code></pre></div>`;
    }

    renderMarkdown(text) {
        if (!text) return '';

        const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
        const html = [];
        let paragraphLines = [];

        const flushParagraph = () => {
            if (!paragraphLines.length) return;
            html.push(`<p>${this.renderInline(paragraphLines.join('\n'))}</p>`);
            paragraphLines = [];
        };

        let index = 0;
        while (index < lines.length) {
            const line = lines[index];

            if (!line.trim()) {
                flushParagraph();
                index++;
                continue;
            }

            const fence = line.match(/^```\s*([\w-]*)\s*$/);
            if (fence) {
                flushParagraph();
                const language = fence[1];
                const codeLines = [];
                index++;
                while (index < lines.length && !/^```\s*$/.test(lines[index])) {
                    codeLines.push(lines[index]);
                    index++;
                }
                if (index < lines.length) index++;
                html.push(this.renderCodeBlock(codeLines.join('\n'), language));
                continue;
            }

            const heading = line.match(/^(#{1,6})\s+(.*)$/);
            if (heading) {
                flushParagraph();
                const level = heading[1].length;
                html.push(`<h${level}>${this.renderInline(heading[2].trim())}</h${level}>`);
                index++;
                continue;
            }

            if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
                flushParagraph();
                html.push('<hr>');
                index++;
                continue;
            }

            if (/^\s*>/.test(line)) {
                flushParagraph();
                const quoteLines = [];
                while (index < lines.length && /^\s*>/.test(lines[index])) {
                    quoteLines.push(lines[index].replace(/^\s*>\s?/, ''));
                    index++;
                }
                html.push(`<blockquote>${this.renderMarkdown(quoteLines.join('\n'))}</blockquote>`);
                continue;
            }

            const ordered = /^\s*\d+\.\s+/.test(line);
            const unordered = /^\s*[-*+]\s+/.test(line);
            if (ordered || unordered) {
                flushParagraph();
                const pattern = ordered ? /^\s*\d+\.\s+(.*)$/ : /^\s*[-*+]\s+(.*)$/;
                const items = [];
                while (index < lines.length) {
                    const item = lines[index].match(pattern);
                    if (!item) break;
                    items.push(item[1]);
                    index++;
                }
                const tag = ordered ? 'ol' : 'ul';
                html.push(`<${tag}>${items.map(item => `<li>${this.renderInline(item)}</li>`).join('')}</${tag}>`);
                continue;
            }

            const nextLine = lines[index + 1] || '';
            const isTable = line.includes('|') && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(nextLine);
            if (isTable) {
                flushParagraph();
                const header = this.parseTableRow(line);
                const align = this.parseTableAlign(nextLine);
                index += 2;
                const rows = [];
                while (index < lines.length && lines[index].trim() && lines[index].includes('|')) {
                    rows.push(this.parseTableRow(lines[index]));
                    index++;
                }
                html.push(this.renderTable(header, align, rows));
                continue;
            }

            paragraphLines.push(line);
            index++;
        }

        flushParagraph();
        return html.join('');
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

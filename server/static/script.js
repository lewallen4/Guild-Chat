/* Guild Chat — Frontend Script */

// ── State ──────────────────────────────────────────────────────────
let currentUserId    = null;
let currentSessionId = null;
let isGenerating     = false;
let exchangeCount    = 0;
let activeReader     = null;
let isViewingHistory = false;
let currentBackend   = 'local';   // 'local' | 'openrouter'

// ── DOM refs ───────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const idGate        = $('id-gate');
const appShell      = $('app-shell');
const userIdInput   = $('user-id-input');
const idSubmit      = $('id-submit');
const idFeedback    = $('id-feedback');

const chatMessages      = $('chat-messages');
const userInput         = $('user-input');
const sendButton        = $('send-button');
const stopButton        = $('stop-button');
const typingIndicator   = $('typing-indicator');
const newChatBtn        = $('new-chat');
const sessionIdDisplay  = $('session-id-display');
const messageCountEl    = $('message-count');
const memoryPreview     = $('memory-preview');
const statusDot         = $('status-dot');
const statusLabel       = $('status-label');
const chatTitle         = $('chat-title');
const sidebarToggle     = $('sidebar-toggle');
const themeToggle       = $('theme-toggle');
const sidebar           = document.querySelector('.sidebar');
const sessionList       = $('session-list');
const memoryToggle      = $('memory-toggle');
const memoryPanel       = $('memory-panel');
const userBadge         = $('user-badge');
const switchUserBtn     = $('switch-user-btn');
const welcomeHeading    = $('welcome-heading');
const welcomeSub        = $('welcome-sub');
const backendIndicator  = $('backend-indicator');
const backendLabel      = $('backend-label');
const inputHintLabel    = $('input-hint-label');

// ── Markdown rendering ─────────────────────────────────────────────
(function initMarked() {
    if (typeof marked === 'undefined') return;
    marked.setOptions({
        highlight: function(code, lang) {
            if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
                try { return hljs.highlight(code, { language: lang }).value; } catch {}
            }
            if (typeof hljs !== 'undefined') {
                try { return hljs.highlightAuto(code).value; } catch {}
            }
            return code;
        },
        breaks: true,
        gfm: true,
    });
})();

function renderMarkdown(raw) {
    let text = raw;
    const hidden = !showThoughts ? ' style="display:none"' : '';

    function makeThinkBlock(inner, isClosed) {
        const trimmed = inner.trim();
        if (!trimmed) return '';
        const escapedInner = escHtml(trimmed);
        return `<details class="think-block"${isClosed ? '' : ' open'}${hidden}><summary>💭 Thinking…</summary><div class="think-body">${escapedInner}</div></details>`;
    }

    text = text.replace(/<\|channel>thought\n?([\s\S]*?)(?:<channel\|>|$)/gi,
        (_, inner) => makeThinkBlock(inner, raw.includes('<channel|>')));
    text = text.replace(/<thought>([\s\S]*?)(?:<\/thought>|$)/gi,
        (_, inner) => makeThinkBlock(inner, raw.includes('</thought>')));
    text = text.replace(/<think>([\s\S]*?)(?:<\/think>|$)/gi,
        (_, inner) => makeThinkBlock(inner, raw.includes('</think>')));
    text = text.replace(/<\/?(thought|think|channel)\|?>/gi, '');

    if (typeof marked !== 'undefined') {
        try { return marked.parse(text); } catch {}
    }
    return escHtml(text).replace(/\n/g, '<br>');
}

function highlightCode(container) {
    container.querySelectorAll('pre code').forEach(block => {
        const html = block.innerHTML;
        if (html.includes('&amp;lt;') || html.includes('&amp;gt;') || html.includes('&amp;quot;')) {
            block.innerHTML = html
                .replace(/&amp;lt;/g, '&lt;')
                .replace(/&amp;gt;/g, '&gt;')
                .replace(/&amp;quot;/g, '&quot;')
                .replace(/&amp;amp;/g, '&amp;');
        }
        const text = block.textContent;
        if (text.includes('&lt;') || text.includes('&gt;') || text.includes('&quot;')) {
            block.textContent = text
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&amp;/g, '&');
        }
    });

    if (typeof hljs !== 'undefined') {
        container.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
    }

    container.querySelectorAll('pre').forEach(pre => {
        if (pre.querySelector('.code-header')) return;
        const lang = pre.querySelector('code')?.className?.match(/language-(\S+)/)?.[1] || '';
        const header = document.createElement('div');
        header.className = 'code-header';
        header.innerHTML = `<span class="code-lang">${escHtml(lang)}</span><button class="code-copy-btn" title="Copy code">Copy</button>`;
        header.querySelector('.code-copy-btn').addEventListener('click', () => {
            const code = pre.querySelector('code')?.textContent || '';
            navigator.clipboard.writeText(code).then(() => {
                header.querySelector('.code-copy-btn').textContent = 'Copied!';
                setTimeout(() => { header.querySelector('.code-copy-btn').textContent = 'Copy'; }, 1500);
            });
        });
        pre.insertBefore(header, pre.firstChild);
    });
}

// ── Theme ──────────────────────────────────────────────────────────
function initTheme() {
    const saved = localStorage.getItem('guildchat-theme') || 'ocean';
    applyTheme(saved);
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('guildchat-theme', theme);

    // Both themes use white logos — always light text on dark bg
    document.querySelectorAll('.theme-logo').forEach(img => {
        img.src = '/static/logo_white.svg';
    });

    // Swap highlight.js theme — github-dark works for both
    const darkSheet  = document.getElementById('hljs-theme-dark');
    const lightSheet = document.getElementById('hljs-theme-light');
    if (darkSheet && lightSheet) {
        darkSheet.disabled  = false;
        lightSheet.disabled = true;
    }

    if (themeToggle) {
        if (theme === 'ocean') {
            themeToggle.title     = 'Switch to Botanical';
            themeToggle.innerHTML = botanicalIcon();
        } else {
            themeToggle.title     = 'Switch to Ocean';
            themeToggle.innerHTML = oceanIcon();
        }
    }
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'ocean';
    applyTheme(current === 'ocean' ? 'botanical' : 'ocean');
}

function oceanIcon() {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M2 12c1.5-2 3.5-3 5-3s3.5 1 5 1 3.5-1 5-1 3.5 1 5 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M2 17c1.5-2 3.5-3 5-3s3.5 1 5 1 3.5-1 5-1 3.5 1 5 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M12 2v4M8 3.5l2 3M16 3.5l-2 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>`;
}

function botanicalIcon() {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M12 22V12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M12 12C12 12 7 10 5 6c4 0 7 2 7 6z" fill="currentColor" opacity="0.4"/>
        <path d="M12 12C12 12 17 10 19 6c-4 0-7 2-7 6z" fill="currentColor" opacity="0.4"/>
        <path d="M12 16C12 16 8 14 6 10c4 1 6 3 6 6z" fill="currentColor" opacity="0.6"/>
        <path d="M12 16C12 16 16 14 18 10c-4 1-6 3-6 6z" fill="currentColor" opacity="0.6"/>
    </svg>`;
}

// ── Backend switcher ───────────────────────────────────────────────
function initBackendSwitcher() {
    const btnLocal       = $('btn-local');
    const btnOpenRouter  = $('btn-openrouter');
    if (!btnLocal || !btnOpenRouter) return;

    function setBackend(backend) {
        currentBackend = backend;
        btnLocal.classList.toggle('active', backend === 'local');
        btnOpenRouter.classList.toggle('active', backend === 'openrouter');

        if (backendLabel)    backendLabel.textContent    = backend === 'local' ? 'Local' : 'OpenRouter';
        if (inputHintLabel)  inputHintLabel.textContent  = backend === 'local' ? 'Local inference' : 'OpenRouter';
        if (backendIndicator) {
            backendIndicator.classList.toggle('openrouter', backend === 'openrouter');
        }
        saveSetting({ backend });
    }

    btnLocal.addEventListener('click',      () => setBackend('local'));
    btnOpenRouter.addEventListener('click', () => setBackend('openrouter'));

    window._setBackendUI = setBackend;
}

// ── ID Gate ────────────────────────────────────────────────────────
function initIdGate() {
    const saved = sessionStorage.getItem('guildchat-user-id');
    if (saved) {
        enterApp(saved, false);
        return;
    }

    idGate.classList.remove('hidden');
    appShell.classList.add('hidden');
    userIdInput.focus();

    idSubmit.addEventListener('click', submitUserId);
    userIdInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') submitUserId();
    });
}

async function submitUserId() {
    const raw = userIdInput.value.trim();
    if (!raw) return;

    if (!/^[a-zA-Z0-9_\-]{5,5}$/.test(raw)) {
        showIdFeedback('error', 'ID must be exactly 5 characters: letters, numbers, - or _');
        return;
    }

    idSubmit.disabled = true;
    showIdFeedback('loading', 'Checking workspace…');

    try {
        const res  = await fetch(`/api/user/${encodeURIComponent(raw)}/check`);
        const data = await res.json();

        if (!res.ok) {
            showIdFeedback('error', data.detail || 'Server error');
            idSubmit.disabled = false;
            return;
        }

        showIdFeedback('ok', data.returning
            ? `Welcome back, ${raw}. Loading your workspace…`
            : `Creating new workspace for ${raw}…`
        );

        await sleep(600);
        enterApp(raw, data.returning, data.sessions || []);

    } catch (err) {
        showIdFeedback('error', 'Could not reach server. Is it running?');
        idSubmit.disabled = false;
    }
}

function showIdFeedback(type, text) {
    idFeedback.textContent = text;
    idFeedback.className   = `id-feedback ${type}`;
}

async function enterApp(userId, returning, pastSessions = []) {
    currentUserId = userId;
    sessionStorage.setItem('guildchat-user-id', userId);

    idGate.classList.add('hidden');
    appShell.classList.remove('hidden');

    userBadge.textContent = userId.toUpperCase().slice(0, 8);

    if (!pastSessions.length) {
        try {
            const res = await fetch(`/api/user/${encodeURIComponent(userId)}/sessions`);
            if (res.ok) {
                const data = await res.json();
                pastSessions = data.sessions || [];
            }
        } catch {}
    }

    if (pastSessions.length > 0) {
        welcomeHeading.textContent = `Welcome back, ${userId}.`;
        welcomeSub.textContent     = `${pastSessions.length} previous session${pastSessions.length !== 1 ? 's' : ''} loaded.`;
        populatePastSessions(pastSessions);
    } else {
        welcomeHeading.textContent = `Hello, ${userId}.`;
        welcomeSub.textContent     = 'Your Guild workspace is ready.';
    }

    initTheme();
    setupEventListeners();
    initBackendSwitcher();
    setStatus('loading', 'Connecting…');
    await loadMemory();
    await loadSettingsIntoUI();
    await startSession();
}

async function loadSettingsIntoUI() {
    if (!currentUserId) return;
    try {
        const res = await fetch(`/api/user/${encodeURIComponent(currentUserId)}/settings`);
        if (!res.ok) return;
        const data = await res.json();
        const backend = data.backend || 'local';
        currentBackend = backend;
        if (window._setBackendUI) window._setBackendUI(backend);
    } catch {}
}

function switchUser() {
    if (currentSessionId) {
        navigator.sendBeacon(`/api/chat/${currentSessionId}/end`);
        currentSessionId = null;
    }
    currentUserId = null;
    sessionStorage.removeItem('guildchat-user-id');

    idFeedback.textContent = '';
    idFeedback.className   = 'id-feedback';
    userIdInput.value      = '';
    idSubmit.disabled      = false;

    appShell.classList.add('hidden');
    idGate.classList.remove('hidden');
    userIdInput.focus();
}

// ── Status ─────────────────────────────────────────────────────────
function setStatus(state, label) {
    statusDot.className     = 'status-dot ' + state;
    statusLabel.textContent = label;
}

// ── Memory ─────────────────────────────────────────────────────────
async function loadMemory() {
    if (!currentUserId) return;
    try {
        const res  = await fetch(`/api/memory?user_id=${encodeURIComponent(currentUserId)}`);
        const data = await res.json();
        const text = (data.memory || '').trim();
        memoryPreview.textContent = text || 'No memory yet — it builds as you chat.';
    } catch {
        memoryPreview.textContent = 'Memory unavailable.';
    }
}

// ── Session lifecycle ──────────────────────────────────────────────
async function startSession(priorMessages = []) {
    isViewingHistory = false;
    try {
        const res  = await fetch('/api/chat/start', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
                user_id:        currentUserId,
                prior_messages: priorMessages,
                metadata:       { timestamp: new Date().toISOString() },
            }),
        });
        const data = await res.json();

        currentSessionId = data.session_id;
        sessionIdDisplay.textContent = currentSessionId.slice(0, 8) + '…';
        updateCount();
        setStatus('online', 'Online');

        userInput.disabled  = false;
        sendButton.disabled = false;
        userInput.focus();

    } catch {
        setStatus('error', 'Connection failed');
        appendSystemMsg('⚠ Could not reach server. Is it running?');
    }
}

async function endCurrentSession() {
    if (!currentSessionId) return;
    const sid = currentSessionId;
    currentSessionId = null;
    try {
        await fetch(`/api/chat/${sid}/end`, { method: 'POST' });
    } catch {}
}

function currentLogoSrc() {
    return '/static/logo_white.svg';
}

async function switchToNewSession() {
    if (isGenerating) stopGeneration();

    markAllSessionsInactive();

    chatMessages.innerHTML = `
        <div class="welcome-screen">
            <div class="welcome-icon loading-spin">
                <img src="${currentLogoSrc()}" class="theme-logo" width="40" height="40" alt="">
            </div>
            <h2>Preparing session…</h2>
            <p class="loading-sub">Building memory and context</p>
        </div>`;

    chatTitle.textContent        = 'New Session';
    sessionIdDisplay.textContent = '—';
    userInput.disabled  = true;
    sendButton.disabled = true;

    await endCurrentSession();
    exchangeCount = 0;
    updateCount();

    await loadMemory();
    await startSession();

    chatMessages.innerHTML = `
        <div class="welcome-screen">
            <div class="welcome-icon">
                <img src="${currentLogoSrc()}" class="theme-logo" width="40" height="40" alt="">
            </div>
            <h2>New session started.</h2>
            <p>Continuing as <strong>${escHtml(currentUserId)}</strong>.</p>
            <div class="welcome-hints">
                <span class="hint">↵ Send</span>
                <span class="hint">⇧ ↵ New line</span>
                <span class="hint">Esc Clear</span>
            </div>
        </div>`;
}

async function loadPastSession(sessionId, title) {
    if (isGenerating) return;
    if (currentSessionId === sessionId) return;

    if (currentSessionId) {
        try { await fetch(`/api/chat/${currentSessionId}/end`, { method: 'POST' }); } catch {}
        currentSessionId = null;
    }

    markAllSessionsInactive();
    const item = sessionList.querySelector('[data-sid="' + sessionId + '"]');
    if (item) item.classList.add('active');

    isViewingHistory = false;
    userInput.disabled  = true;
    sendButton.disabled = true;
    chatMessages.innerHTML = '<div class="system-msg">Loading session…</div>';
    chatTitle.textContent  = escHtml(title || sessionId.slice(0, 8));

    try {
        const res = await fetch('/api/sessions/' + sessionId + '/history');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const messages = await res.json();

        chatMessages.innerHTML = '';
        if (messages.length) {
            messages.forEach(m => appendMessage(m.role, m.content));
        }
        appendSystemMsg('— continuing session —');
        scrollToBottom();

        const rejoinRes = await fetch('/api/chat/rejoin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUserId, session_id: sessionId }),
        });

        if (!rejoinRes.ok) throw new Error('Rejoin failed: HTTP ' + rejoinRes.status);

        currentSessionId = sessionId;
        sessionIdDisplay.textContent = sessionId.slice(0, 8) + '…';
        setStatus('online', 'Online');

        exchangeCount = messages.filter(m => m.role === 'user').length;
        updateCount();

        userInput.disabled  = false;
        sendButton.disabled = false;
        userInput.focus();

    } catch (err) {
        chatMessages.innerHTML = '<div class="system-msg">⚠ Could not load session: ' + escHtml(err.message) + '</div>';
        setStatus('error', 'Error');
        await startSession();
    }
}

// ── Stop generation ────────────────────────────────────────────────
function stopGeneration() {
    if (activeReader) {
        activeReader.cancel();
        activeReader = null;
    }
}

// ── Send message ───────────────────────────────────────────────────
async function sendMessage() {
    const text = userInput.value.trim();
    if (!text || isGenerating || !currentSessionId) return;

    userInput.value = '';
    autoResize();
    isGenerating = true;

    sendButton.classList.add('hidden');
    stopButton.classList.remove('hidden');
    userInput.disabled = true;

    const welcome = document.querySelector('.welcome-screen');
    if (welcome) welcome.remove();

    appendMessage('user', text);

    if (exchangeCount === 0) {
        addSessionToList(currentSessionId, text);
    }

    typingIndicator.classList.remove('hidden');
    scrollToBottom();

    const { row, contentEl, metaEl } = createAssistantBubble();
    chatMessages.appendChild(row);
    contentEl.classList.add('streaming', 'markdown-body');

    let fullResponse   = '';
    let stopped        = false;
    let renderPending  = false;
    let streamingDone  = false;

    function scheduleRender() {
        if (renderPending || streamingDone) return;
        renderPending = true;
        requestAnimationFrame(() => {
            if (!streamingDone) {
                contentEl.innerHTML = renderMarkdown(fullResponse);
                scrollToBottom();
            }
            renderPending = false;
        });
    }

    try {
        const res = await fetch(`/api/chat/${currentSessionId}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ message: text }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const reader  = res.body.getReader();
        const decoder = new TextDecoder();
        activeReader  = reader;

        let buffer = '';

        outer: while (true) {
            let value, done;
            try {
                ({ value, done } = await reader.read());
            } catch {
                stopped = true;
                break;
            }
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split('\n\n');
            buffer = events.pop();

            for (const event of events) {
                for (const line of event.split('\n')) {
                    if (!line.startsWith('data: ')) continue;
                    let payload;
                    try { payload = JSON.parse(line.slice(6)); } catch { continue; }

                    if (payload.chunk !== undefined) {
                        fullResponse += payload.chunk;
                        scheduleRender();
                    } else if (payload.done) {
                        break outer;
                    } else if (payload.error) {
                        throw new Error(payload.error);
                    }
                }
            }
        }

        activeReader = null;
        contentEl.classList.remove('streaming');
        streamingDone = true;

        contentEl.innerHTML = renderMarkdown(fullResponse);
        highlightCode(contentEl);

        if (stopped) {
            const mark = document.createElement('span');
            mark.className   = 'stop-mark';
            mark.textContent = ' [stopped]';
            contentEl.appendChild(mark);
        }

        metaEl.textContent = formatTime(new Date());
        exchangeCount++;
        updateCount();
        chatTitle.textContent = `Session ${currentSessionId.slice(0, 6)}`;

    } catch (err) {
        contentEl.classList.remove('streaming');
        if (!stopped) {
            const mark = document.createElement('span');
            mark.className   = 'stop-mark';
            mark.textContent = ` ⚠ ${err.message}`;
            contentEl.appendChild(mark);
        }
    } finally {
        typingIndicator.classList.add('hidden');
        isGenerating = false;
        stopButton.classList.add('hidden');
        sendButton.classList.remove('hidden');
        sendButton.disabled = false;
        userInput.disabled  = false;
        userInput.focus();
        scrollToBottom();
    }
}

// ── DOM helpers ────────────────────────────────────────────────────
function appendMessage(role, text) {
    const row = document.createElement('div');
    row.className = `message-row ${role}`;

    const avatar = document.createElement('div');
    avatar.className = role === 'user' ? 'avatar user-avatar' : 'avatar ai-avatar';
    if (role === 'user') {
        avatar.textContent = currentUserId ? currentUserId.slice(0,2).toUpperCase() : 'U';
    } else {
        avatar.innerHTML = `<img src="${currentLogoSrc()}" class="theme-logo" width="18" height="18" alt="AI">`;
    }

    const bubble  = document.createElement('div');
    bubble.className = 'message-bubble';

    const content = document.createElement('div');
    content.className = 'bubble-content';

    if (role === 'assistant') {
        content.classList.add('markdown-body');
        content.innerHTML = renderMarkdown(text);
        requestAnimationFrame(() => highlightCode(content));
    } else {
        content.textContent = text;
    }

    const meta = document.createElement('div');
    meta.className   = 'bubble-meta';
    meta.textContent = formatTime(new Date());

    bubble.appendChild(content);
    bubble.appendChild(meta);
    row.appendChild(avatar);
    row.appendChild(bubble);
    chatMessages.appendChild(row);
    scrollToBottom();
    return row;
}

function createAssistantBubble() {
    const row = document.createElement('div');
    row.className = 'message-row assistant';

    const avatar = document.createElement('div');
    avatar.className = 'avatar ai-avatar';
    avatar.innerHTML = `<img src="${currentLogoSrc()}" class="theme-logo" width="18" height="18" alt="AI">`;

    const bubble  = document.createElement('div');
    bubble.className = 'message-bubble';

    const content = document.createElement('div');
    content.className = 'bubble-content';

    const meta = document.createElement('div');
    meta.className = 'bubble-meta';

    bubble.appendChild(content);
    bubble.appendChild(meta);
    row.appendChild(avatar);
    row.appendChild(bubble);

    return { row, contentEl: content, metaEl: meta };
}

function appendSystemMsg(text) {
    const el = document.createElement('div');
    el.className   = 'system-msg';
    el.textContent = text;
    chatMessages.appendChild(el);
    scrollToBottom();
}

function scrollToBottom() {
    chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
}

function updateCount() {
    messageCountEl.textContent = exchangeCount === 1 ? '1 exchange' : `${exchangeCount} exchanges`;
}

function formatTime(d) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function autoResize() {
    userInput.style.height = 'auto';
    userInput.style.height = Math.min(userInput.scrollHeight, 160) + 'px';
}

function toggleSidebar() {
    sidebar.classList.toggle('collapsed');
    if (window.innerWidth <= 768) {
        const backdrop = document.getElementById('sidebar-backdrop');
        if (backdrop) backdrop.classList.toggle('active', !sidebar.classList.contains('collapsed'));
    }
}

function closeSidebarMobile() {
    if (window.innerWidth <= 768) {
        sidebar.classList.add('collapsed');
        const backdrop = document.getElementById('sidebar-backdrop');
        if (backdrop) backdrop.classList.remove('active');
    }
}

function initSidebarMobile() {
    if (window.innerWidth <= 768) {
        sidebar.classList.add('collapsed');
        const backdrop = document.getElementById('sidebar-backdrop');
        if (backdrop) backdrop.addEventListener('click', closeSidebarMobile);
    }
}

// ── Session list helpers ───────────────────────────────────────────
function markAllSessionsInactive() {
    sessionList.querySelectorAll('.session-item').forEach(el => el.classList.remove('active'));
}

function createSessionItem(sessionId, title, meta, isActive) {
    const item = document.createElement('div');
    item.className   = `session-item${isActive ? ' active' : ''}`;
    item.dataset.sid = sessionId;
    item.innerHTML   = `
        <div class="session-item-icon">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
                      stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </div>
        <div class="session-item-body">
            <div class="session-item-title">${escHtml(title)}</div>
            <div class="session-item-meta">${escHtml(meta)}</div>
        </div>`;

    item.addEventListener('click', () => {
        loadPastSession(sessionId, title);
        closeSidebarMobile();
    });
    return item;
}

function addSessionToList(sessionId, firstMessage) {
    if (sessionList.querySelector('[data-sid="' + sessionId + '"]')) return;

    const empty = sessionList.querySelector('.session-empty');
    if (empty) empty.remove();

    markAllSessionsInactive();

    const title = firstMessage
        ? (firstMessage.length > 28 ? firstMessage.slice(0, 28) + '…' : firstMessage)
        : 'New session';

    const item = createSessionItem(sessionId, title, formatTime(new Date()), true);
    sessionList.insertBefore(item, sessionList.firstChild);
}

function populatePastSessions(sessions) {
    const empty = sessionList.querySelector('.session-empty');
    if (empty) empty.remove();

    sessions.forEach(s => {
        const ts = s.ended_at
            ? new Date(s.ended_at).toLocaleDateString([], { month: 'short', day: 'numeric' })
            : '—';
        const meta  = `${ts} · ${s.message_count} msgs`;
        const title = s.preview || 'Session';
        const item  = createSessionItem(s.session_id, title, meta, false);
        sessionList.appendChild(item);
    });
}

// ── Memory toggle ──────────────────────────────────────────────────
function initMemoryToggle() {
    memoryToggle.addEventListener('click', () => {
        memoryPanel.classList.toggle('expanded');
    });
}

// ── Shared saveSetting helper ──────────────────────────────────────
async function saveSetting(updates) {
    if (!currentUserId) return;
    try {
        await fetch(`/api/user/${encodeURIComponent(currentUserId)}/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
        });
    } catch {}
}

// ── Event listeners ────────────────────────────────────────────────
function setupEventListeners() {
    sendButton.addEventListener('click', sendMessage);
    stopButton.addEventListener('click', stopGeneration);
    themeToggle.addEventListener('click', toggleTheme);
    switchUserBtn.addEventListener('click', switchUser);

    userInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
        if (e.key === 'Escape') { userInput.value = ''; autoResize(); }
    });

    userInput.addEventListener('input', autoResize);
    newChatBtn.addEventListener('click', () => {
        switchToNewSession();
        closeSidebarMobile();
    });
    sidebarToggle.addEventListener('click', toggleSidebar);
    initMemoryToggle();
    initSettings();

    document.addEventListener('keydown', e => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'n') { e.preventDefault(); switchToNewSession(); }
        if ((e.metaKey || e.ctrlKey) && e.key === 'b') { e.preventDefault(); toggleSidebar(); }
    });
}

// ── Settings panel ─────────────────────────────────────────────────
let showThoughts = true;

function initSettings() {
    const settingsToggle     = $('settings-toggle');
    const settingsOverlay    = $('settings-overlay');
    const settingsClose      = $('settings-close');
    const tempSlider         = $('temp-slider');
    const tempValue          = $('temp-value');
    const thinkingToggle     = $('thinking-toggle');
    const showThoughtsToggle = $('show-thoughts-toggle');
    const factInput          = $('fact-input');
    const factSubmit         = $('fact-submit');
    const factFeedback       = $('fact-feedback');
    const factList           = $('fact-list');
    const lengthSlider       = $('length-slider');
    const lengthCurrent      = $('length-current');
    const orKeyInput         = $('or-key-input');
    const orKeySave          = $('or-key-save');
    const orKeyFeedback      = $('or-key-feedback');
    const orModelInput       = $('or-model-input');
    const orModelSave        = $('or-model-save');

    if (!settingsToggle || !settingsOverlay) return;

    const LENGTH_STEPS = [
        { key: 'short',      label: 'Short' },
        { key: 'medium',     label: 'Medium' },
        { key: 'long',       label: 'Long' },
        { key: 'extra_long', label: 'Extra Long' },
        { key: 'epic',       label: 'Epic' },
    ];

    function updateLengthDisplay(idx) {
        if (lengthCurrent) lengthCurrent.textContent = LENGTH_STEPS[idx].label;
    }

    if (lengthSlider) {
        lengthSlider.addEventListener('input', () => updateLengthDisplay(parseInt(lengthSlider.value)));
        lengthSlider.addEventListener('change', () => {
            const idx = parseInt(lengthSlider.value);
            updateLengthDisplay(idx);
            saveSetting({ response_length: LENGTH_STEPS[idx].key });
        });
    }

    // Open / close
    settingsToggle.addEventListener('click', () => {
        settingsOverlay.classList.toggle('hidden');
        if (!settingsOverlay.classList.contains('hidden')) {
            loadSettings();
            loadFacts();
        }
    });
    settingsClose.addEventListener('click', () => settingsOverlay.classList.add('hidden'));
    settingsOverlay.addEventListener('click', e => {
        if (e.target === settingsOverlay) settingsOverlay.classList.add('hidden');
    });

    // Temperature
    tempSlider.addEventListener('input', () => {
        tempValue.textContent = parseFloat(tempSlider.value).toFixed(2);
    });
    tempSlider.addEventListener('change', () => {
        saveSetting({ temperature: parseFloat(tempSlider.value) });
    });

    // Thinking
    if (thinkingToggle) thinkingToggle.addEventListener('change', () => saveSetting({ thinking_enabled: thinkingToggle.checked }));
    if (showThoughtsToggle) {
        showThoughtsToggle.addEventListener('change', () => {
            showThoughts = showThoughtsToggle.checked;
            saveSetting({ show_thoughts: showThoughtsToggle.checked });
            document.querySelectorAll('.think-block').forEach(el => {
                el.style.display = showThoughts ? '' : 'none';
            });
        });
    }

    // OpenRouter key
    if (orKeySave) {
        orKeySave.addEventListener('click', async () => {
            const key = orKeyInput ? orKeyInput.value.trim() : '';
            orKeySave.disabled = true;
            try {
                const res = await fetch(`/api/user/${encodeURIComponent(currentUserId)}/settings`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ openrouter_key: key }),
                });
                if (res.ok) {
                    if (orKeyFeedback) { orKeyFeedback.textContent = 'Key saved.'; orKeyFeedback.className = 'settings-fact-feedback ok'; }
                    if (orKeyInput) orKeyInput.value = '';
                } else {
                    if (orKeyFeedback) { orKeyFeedback.textContent = 'Failed to save.'; orKeyFeedback.className = 'settings-fact-feedback error'; }
                }
            } catch {
                if (orKeyFeedback) { orKeyFeedback.textContent = 'Error saving key.'; orKeyFeedback.className = 'settings-fact-feedback error'; }
            }
            orKeySave.disabled = false;
            setTimeout(() => { if (orKeyFeedback) orKeyFeedback.textContent = ''; }, 3000);
        });
    }

    // OpenRouter model
    if (orModelSave) {
        orModelSave.addEventListener('click', async () => {
            const model = orModelInput ? orModelInput.value.trim() || 'openrouter/auto' : 'openrouter/auto';
            await saveSetting({ openrouter_model: model });
            if (orKeyFeedback) { orKeyFeedback.textContent = 'Model saved.'; orKeyFeedback.className = 'settings-fact-feedback ok'; }
            setTimeout(() => { if (orKeyFeedback) orKeyFeedback.textContent = ''; }, 2000);
        });
    }

    // Facts
    factSubmit.addEventListener('click', submitFact);
    factInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitFact(); });

    async function loadSettings() {
        if (!currentUserId) return;
        try {
            const res = await fetch(`/api/user/${encodeURIComponent(currentUserId)}/settings`);
            const data = await res.json();

            const temp = data.temperature ?? 0.7;
            tempSlider.value = temp;
            tempValue.textContent = parseFloat(temp).toFixed(2);

            if (thinkingToggle) thinkingToggle.checked = data.thinking_enabled ?? false;
            if (showThoughtsToggle) {
                showThoughtsToggle.checked = data.show_thoughts ?? true;
                showThoughts = data.show_thoughts ?? true;
            }
            if (lengthSlider) {
                const lengthKeys = LENGTH_STEPS.map(s => s.key);
                const idx = lengthKeys.indexOf(data.response_length ?? 'medium');
                lengthSlider.value = idx >= 0 ? idx : 1;
                updateLengthDisplay(parseInt(lengthSlider.value));
            }
            if (orModelInput) {
                orModelInput.value = data.openrouter_model || 'openrouter/auto';
            }
            if (orKeyInput && data.openrouter_key_set) {
                orKeyInput.placeholder = '••••••••••••  (key saved — enter new key to replace)';
            }
        } catch {}
    }

    async function submitFact() {
        const text = factInput.value.trim();
        if (!text || !currentUserId) return;
        factSubmit.disabled = true;
        factFeedback.textContent = '';
        try {
            const res = await fetch(`/api/user/${encodeURIComponent(currentUserId)}/facts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fact: text }),
            });
            if (res.ok) {
                factInput.value = '';
                factFeedback.textContent = 'Saved.';
                factFeedback.className = 'settings-fact-feedback ok';
                loadFacts();
                loadMemory();
            } else {
                const err = await res.json();
                factFeedback.textContent = err.detail || 'Error';
                factFeedback.className = 'settings-fact-feedback error';
            }
        } catch {
            factFeedback.textContent = 'Could not save.';
            factFeedback.className = 'settings-fact-feedback error';
        }
        factSubmit.disabled = false;
        setTimeout(() => { factFeedback.textContent = ''; }, 3000);
    }

    async function loadFacts() {
        if (!currentUserId || !factList) return;
        try {
            const res = await fetch(`/api/memory?user_id=${encodeURIComponent(currentUserId)}`);
            const data = await res.json();
            const memory = data.memory || '';
            const factsMatch = memory.match(/## FACTS\n([\s\S]*?)(?=\n## |$)/);
            if (factsMatch) {
                const lines = factsMatch[1].split('\n').map(l => l.trim()).filter(l => l.startsWith('- '));
                if (lines.length > 0) {
                    factList.innerHTML = '<div class="settings-fact-title">Current facts:</div>';
                    lines.forEach(line => {
                        const factText = line.slice(2);
                        const row = document.createElement('div');
                        if (factText.startsWith('User ID:')) {
                            row.className = 'settings-fact-item-row locked';
                            row.innerHTML = `<span class="settings-fact-text">${escHtml(line)}</span><span class="settings-fact-lock" title="System fact — cannot be removed">🔒</span>`;
                        } else {
                            row.className = 'settings-fact-item-row';
                            row.innerHTML = `<span class="settings-fact-text">${escHtml(line)}</span><button class="settings-fact-delete" title="Remove fact">✕</button>`;
                            row.querySelector('.settings-fact-delete').addEventListener('click', () => deleteFact(factText));
                        }
                        factList.appendChild(row);
                    });
                    return;
                }
            }
            factList.innerHTML = '<div class="settings-fact-item dim">No facts saved yet.</div>';
        } catch { factList.innerHTML = ''; }
    }

    async function deleteFact(factText) {
        if (!currentUserId) return;
        try {
            const res = await fetch(`/api/user/${encodeURIComponent(currentUserId)}/facts`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fact: factText }),
            });
            if (res.ok) { loadFacts(); loadMemory(); }
        } catch {}
    }
}

// ── Page unload ────────────────────────────────────────────────────
window.addEventListener('beforeunload', () => {
    if (currentSessionId) navigator.sendBeacon(`/api/chat/${currentSessionId}/end`);
});

// ── Boot ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initIdGate();
    initSidebarMobile();
});

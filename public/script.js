/* ============================================================
   Nova — frontend logic (Claude-inspired UI)
   ============================================================ */

const chatBox = document.getElementById("chatBox");
const emptyState = document.getElementById("emptyState");
const chatScroll = document.getElementById("chatScroll");
const chatList = document.getElementById("chatList");
const chatTitle = document.getElementById("chatTitle");
const input = document.getElementById("message");
const searchInput = document.getElementById("searchInput");
const modelSelect = document.getElementById("modelSelect");
const sendBtn = document.getElementById("sendBtn");
const stopBtn = document.getElementById("stopBtn");
const micBtn = document.getElementById("micBtn");
const ttsBtn = document.getElementById("ttsBtn");

const THEME_KEY = "nova_theme";
const MODEL_KEY = "nova_model";
const CHATS_KEY = "nova_chats";
const TTS_KEY = "nova_tts";

let chats = [];
let activeChatId = null;
let isStreaming = false;
let streamAbort = null;
let recognition = null;
let isListening = false;
let ttsOn = localStorage.getItem(TTS_KEY) !== "off";

const FOLLOWUPS = ["Explain more", "Give me a concrete example", "Summarize the key points"];

/* ============================ boot ============================ */

window.onload = function () {
    loadTheme();
    loadChats();
    loadModels();
    bindGlobalEvents();
    updateTtsIcon();
    updateThemeIcon();
};

/* ============================ themes ============================ */

function loadTheme() {
    const theme = localStorage.getItem(THEME_KEY) || "light";
    document.body.classList.toggle("dark", theme === "dark");
}

function toggleTheme() {
    const dark = document.body.classList.toggle("dark");
    localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
    updateThemeIcon();
}

function updateThemeIcon() {
    const dark = document.body.classList.contains("dark");
    const icon = document.getElementById("themeIcon");
    icon.innerHTML = dark
        ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'
        : '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>';
}

/* ============================ chats (localStorage) ============================ */

function loadChats() {
    try {
        chats = JSON.parse(localStorage.getItem(CHATS_KEY)) || [];
    } catch (e) {
        chats = [];
    }
    renderChatList();
    if (chats.length === 0) {
        newChat();
    } else {
        openChat(chats[chats.length - 1].id);
    }
}

function saveChats() {
    localStorage.setItem(CHATS_KEY, JSON.stringify(chats));
}

function getChat(id) {
    return chats.find(c => c.id === id);
}

function ensureChat() {
    if (activeChatId && getChat(activeChatId)) return getChat(activeChatId);
    newChat();
    return getChat(activeChatId);
}

function newChat() {
    stopGeneration();
    const chat = {
        id: "c" + Date.now(),
        title: "New chat",
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
    chats.push(chat);
    saveChats();
    openChat(chat.id);
    input.focus();
}

function openChat(id) {
    stopGeneration();
    activeChatId = id;
    const chat = getChat(id);
    if (!chat) return;
    chatTitle.textContent = chat.title;
    renderMessages(chat);
    renderChatList();
}

function deleteChat(id) {
    if (isStreaming && id === activeChatId) stopGeneration();
    chats = chats.filter(c => c.id !== id);
    saveChats();
    if (id === activeChatId) {
        if (chats.length === 0) newChat();
        else openChat(chats[chats.length - 1].id);
    } else {
        renderChatList();
    }
}

function renameChat(id, titleEl) {
    const chat = getChat(id);
    if (!chat) return;
    const oldTitle = chat.title;
    const inputBox = document.createElement("input");
    inputBox.className = "rename-input";
    inputBox.value = oldTitle;
    inputBox.maxLength = 60;

    const finish = save => {
        const value = inputBox.value.trim();
        if (save && value) chat.title = value;
        else chat.title = oldTitle;
        chat.updatedAt = Date.now();
        saveChats();
        if (id === activeChatId) chatTitle.textContent = chat.title;
        renderChatList();
    };

    inputBox.onkeydown = e => {
        e.stopPropagation();
        if (e.key === "Enter") { e.preventDefault(); finish(true); }
        else if (e.key === "Escape") finish(false);
    };
    inputBox.onblur = () => finish(true);

    titleEl.replaceWith(inputBox);
    inputBox.focus();
    inputBox.select();
}

/* --- history list: Claude-style date groups + search --- */

function dayLabel(ts) {
    const now = new Date();
    const d = new Date(ts);
    const startOfDay = t => { const x = new Date(t); x.setHours(0, 0, 0, 0); return x; };
    const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
    if (diffDays <= 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays <= 7) return "Previous 7 days";
    if (diffDays <= 30) return "Previous 30 days";
    return "Older";
}

function chatTimeLabel(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function renderChatList() {
    chatList.innerHTML = "";
    const term = (searchInput.value || "").trim().toLowerCase();

    const filtered = [...chats]
        .filter(c => !term || c.title.toLowerCase().includes(term))
        .sort((a, b) => b.updatedAt - a.updatedAt);

    let lastGroup = null;

    filtered.forEach(chat => {
        const group = dayLabel(chat.updatedAt);
        if (group !== lastGroup) {
            lastGroup = group;
            const label = document.createElement("div");
            label.className = "group-label";
            label.textContent = group;
            chatList.appendChild(label);
        }

        const item = document.createElement("div");
        item.className = "chat-item" + (chat.id === activeChatId ? " active" : "");

        const titleEl = document.createElement("span");
        titleEl.className = "chat-title-text";
        titleEl.textContent = chat.title;
        titleEl.ondblclick = e => {
            e.stopPropagation();
            renameChat(chat.id, titleEl);
        };

        const meta = document.createElement("span");
        meta.className = "chat-meta";
        meta.textContent = chatTimeLabel(chat.updatedAt);

        const del = document.createElement("button");
        del.className = "chat-del";
        del.title = "Delete chat";
        del.textContent = "✕";
        del.onclick = e => {
            e.stopPropagation();
            deleteChat(chat.id);
        };

        item.appendChild(titleEl);
        item.appendChild(meta);
        item.appendChild(del);
        item.onclick = () => openChat(chat.id);
        chatList.appendChild(item);
    });

    if (filtered.length === 0) {
        const none = document.createElement("div");
        none.className = "group-label";
        none.textContent = "No chats found";
        chatList.appendChild(none);
    }
}

function renderMessages(chat) {
    chatBox.innerHTML = "";
    emptyState.classList.toggle("hidden", chat.messages.length > 0);
    chat.messages.forEach(msg => appendMessage(msg));
    scrollToBottom(false);
}

/* ============================ message rendering ============================ */

const STAR_SVG = '<path d="M16 16 L16 6 M16 16 L24.6 11 M16 16 L24.6 21 M16 16 L16 26 M16 16 L7.4 21 M16 16 L7.4 11"/>';

function appendMessage(msg) {
    const row = document.createElement("div");
    row.className = "msg-row " + msg.role;

    if (msg.role === "user") {
        const pill = document.createElement("div");
        pill.className = "user-pill";
        pill.textContent = msg.content;
        row.appendChild(pill);
    } else {
        const head = document.createElement("div");
        head.className = "assistant-head";
        head.innerHTML = `
            <span class="logo-star"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">${STAR_SVG}</svg></span>
            <span class="sender-label">Nova</span>
        `;
        const body = document.createElement("div");
        body.className = "assistant-body";
        body.innerHTML = msg.content ? renderMarkdown(msg.content) : thinkingHtml();
        row.appendChild(head);
        row.appendChild(body);
    }

    chatBox.appendChild(row);
    return row;
}

function renderMarkdown(text) {
    try {
        const html = marked.parse(text, { breaks: true, gfm: true });
        return DOMPurify.sanitize(html);
    } catch (e) {
        return escapeHtml(text);
    }
}

function thinkingHtml() {
    return '<span class="thinking">Thinking…</span>';
}

function highlightCode(container) {
    container.querySelectorAll("pre code").forEach(block => {
        if (block.dataset.hl) return;
        block.dataset.hl = "1";

        const pre = block.parentElement;

        if (!pre.querySelector(".code-head")) {
            const head = document.createElement("div");
            head.className = "code-head";

            const lang = document.createElement("span");
            lang.className = "code-lang";
            const match = block.className.match(/language-([\w+-]+)/);
            lang.textContent = match ? match[1] : "code";

            const copy = document.createElement("button");
            copy.className = "code-copy";
            copy.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg><span>Copy</span>`;
            copy.onclick = () => {
                navigator.clipboard.writeText(block.innerText).then(() => {
                    copy.querySelector("span").textContent = "Copied";
                    setTimeout(() => copy.querySelector("span").textContent = "Copy", 1500);
                });
            };

            head.appendChild(lang);
            head.appendChild(copy);
            pre.insertBefore(head, block);
        }

        try {
            hljs.highlightElement(block);
        } catch (e) { /* ignore */ }
    });
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

/* ============================ send + streaming ============================ */

function sendMessage() {
    const text = input.value.trim();
    if (!text || isStreaming) return;

    const chat = ensureChat();

    chat.messages.push({ role: "user", content: text, ts: Date.now() });
    if (chat.title === "New chat") {
        chat.title = text.length > 42 ? text.slice(0, 42) + "…" : text;
        chatTitle.textContent = chat.title;
    }
    chat.updatedAt = Date.now();
    saveChats();
    renderChatList();

    input.value = "";
    autoGrow();
    sendBtn.classList.remove("show");

    emptyState.classList.add("hidden");
    appendMessage(chat.messages[chat.messages.length - 1]);
    scrollToBottom(true);

    streamReply(chat);
}

async function streamReply(chat) {
    const botMsg = { role: "assistant", content: "", ts: Date.now() };
    chat.messages.push(botMsg);

    const row = appendMessage(botMsg);
    const bodyEl = row.querySelector(".assistant-body");
    let failed = false;

    setStreaming(true);
    scrollToBottom(true);

    streamAbort = new AbortController();
    const history = chat.messages
        .filter(m => m !== botMsg)
        .map(m => ({ role: m.role, content: m.content }));

    try {
        const res = await fetch("/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: history, model: modelSelect.value }),
            signal: streamAbort.signal
        });

        if (!res.ok) throw new Error("Bad response");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.startsWith("data:")) continue;
                const payload = line.slice(5).trim();
                if (payload === "[DONE]") continue;
                try {
                    const json = JSON.parse(payload);
                    if (json.delta) {
                        botMsg.content += json.delta;
                        bodyEl.innerHTML = renderMarkdown(botMsg.content) + '<span class="caret"></span>';
                        highlightCode(bodyEl);
                        maybeScroll();
                    } else if (json.error) {
                        throw new Error(json.error);
                    }
                } catch (e) { /* skip malformed */ }
            }
        }
    } catch (err) {
        failed = true;
        if (err.name === "AbortError") {
            if (botMsg.content) botMsg.content += " ⏹️ _Stopped._";
        } else {
            botMsg.content = botMsg.content || "⚠️ Something went wrong. Please try again.";
        }
    }

    if (!botMsg.content) botMsg.content = "⚠️ No response generated.";

    bodyEl.innerHTML = renderMarkdown(botMsg.content);
    highlightCode(bodyEl);

    chat.updatedAt = Date.now();
    saveChats();
    renderChatList();

    setStreaming(false);
    scrollToBottom(true);

    if (!failed && botMsg.role === "assistant") {
        addFollowUps(row);
    }

    if (ttsOn && !/Stopped/i.test(botMsg.content)) {
        speak(botMsg.content);
    }
}

function addFollowUps(row) {
    const wrap = document.createElement("div");
    wrap.className = "followups";
    FOLLOWUPS.forEach(t => {
        const b = document.createElement("button");
        b.className = "followup";
        b.textContent = t;
        b.onclick = () => {
            input.value = t;
            autoGrow();
            sendMessage();
        };
        wrap.appendChild(b);
    });
    row.appendChild(wrap);
}

function setStreaming(on) {
    isStreaming = on;
    stopBtn.classList.toggle("show", on);
    if (on) {
        sendBtn.classList.remove("show");
        input.blur();
    } else {
        sendBtn.classList.toggle("show", input.value.trim().length > 0);
        input.focus();
    }
}

function stopGeneration() {
    if (streamAbort) {
        streamAbort.abort();
        streamAbort = null;
    }
}

/* ============================ scrolling ============================ */

function isNearBottom() {
    return chatScroll.scrollHeight - chatScroll.scrollTop - chatScroll.clientHeight < 140;
}

function maybeScroll() {
    if (isNearBottom()) scrollToBottom(true);
}

function scrollToBottom(smooth) {
    chatScroll.scrollTo({
        top: chatScroll.scrollHeight,
        behavior: smooth ? "smooth" : "auto"
    });
}

/* ============================ voice ============================ */

function toggleVoice() {
    if (isListening) {
        stopVoice();
        return;
    }
    if (!("webkitSpeechRecognition" in window)) {
        toast("Voice input is not supported in this browser");
        return;
    }
    recognition = new webkitSpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = function (event) {
        let interim = "", final = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const t = event.results[i][0].transcript;
            if (event.results[i].isFinal) final += t;
            else interim += t;
        }
        input.value = final || interim;
        autoGrow();
        sendBtn.classList.toggle("show", !isStreaming && input.value.trim().length > 0);
    };

    recognition.onend = () => setListening(false);
    recognition.onerror = () => { setListening(false); toast("Couldn't hear you — try again"); };

    recognition.start();
    setListening(true);
    toast("Listening… speak now");
}

function setListening(on) {
    isListening = on;
    micBtn.classList.toggle("listening", on);
}

function stopVoice() {
    if (recognition) {
        recognition.stop();
        recognition = null;
    }
    setListening(false);
    window.speechSynthesis.cancel();
}

/* ============================ TTS ============================ */

function toggleTts() {
    ttsOn = !ttsOn;
    localStorage.setItem(TTS_KEY, ttsOn ? "on" : "off");
    if (!ttsOn) window.speechSynthesis.cancel();
    updateTtsIcon();
    toast(ttsOn ? "Speech on" : "Speech off");
}

function updateTtsIcon() {
    ttsBtn.classList.toggle("muted", !ttsOn);
    const icon = document.getElementById("ttsIcon");
    icon.innerHTML = ttsOn
        ? '<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>'
        : '<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="m16 9 6 6M22 9l-6 6"/>';
}

function speak(text) {
    window.speechSynthesis.cancel();
    const clean = text.replace(/[#*`>_~\-\[\]()|]/g, " ").slice(0, 600);
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = "en-US";
    u.rate = 1;
    u.pitch = 1;
    window.speechSynthesis.speak(u);
}

/* ============================ models ============================ */

async function loadModels() {
    try {
        const res = await fetch("/models");
        const data = await res.json();
        const saved = localStorage.getItem(MODEL_KEY);
        modelSelect.innerHTML = "";
        data.models.forEach(m => {
            const opt = document.createElement("option");
            opt.value = m;
            opt.textContent = m;
            modelSelect.appendChild(opt);
        });
        if (saved && data.models.includes(saved)) modelSelect.value = saved;
    } catch (e) {
        toast("Couldn't load models");
    }
    modelSelect.onchange = () => localStorage.setItem(MODEL_KEY, modelSelect.value);
}

/* ============================ global events ============================ */

function bindGlobalEvents() {
    input.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    input.addEventListener("input", function () {
        autoGrow();
        sendBtn.classList.toggle("show", !isStreaming && input.value.trim().length > 0);
    });

    searchInput.addEventListener("input", renderChatList);

    document.querySelectorAll(".chip").forEach(chip => {
        chip.addEventListener("click", () => {
            input.value = chip.dataset.prompt;
            autoGrow();
            sendMessage();
        });
    });

    document.addEventListener("keydown", function (e) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
            e.preventDefault();
            newChat();
        }
        if (e.key === "Escape") {
            if (isStreaming) stopGeneration();
            else if (isListening) stopVoice();
        }
    });
}

function autoGrow() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 180) + "px";
}

function toggleSidebar() {
    document.body.classList.toggle("sidebar-open");
}

/* ============================ toast ============================ */

let toastTimer = null;

function toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
}
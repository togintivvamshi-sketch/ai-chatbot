require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const os = require("os");
const OpenAI = require("openai");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* ============================================================
   API key resolution — opencode-go gateway first (higher
   allowance), then GROQ as fallback
   ============================================================ */

function resolveOpenCodeKey() {

    if (process.env.OPENCODE_API_KEY) return process.env.OPENCODE_API_KEY;

    try {

        const authPath = path.join(os.homedir(), ".local", "share", "opencode", "auth.json");

        const auth = JSON.parse(fs.readFileSync(authPath, "utf8"));

        if (auth["opencode-go"] && auth["opencode-go"].key) return auth["opencode-go"].key;

    } catch (_) {}

    return null;

}

const OPENCODE_BASE = "https://opencode.ai/zen/go/v1";
const OPENCODE_MODELS = [
    "deepseek-v4-flash",
    "deepseek-v4-pro",
    "glm-5.2",
    "glm-5.1",
    "glm-5",
    "kimi-k2.7-code",
    "kimi-k2.6",
    "kimi-k2.5",
    "mimo-v2.5",
    "mimo-v2.5-pro",
    "mimo-v2-pro",
    "minimax-m2.7"
];

const openCodeKey = resolveOpenCodeKey();
const groqKey = process.env.GROQ_API_KEY;

const client = openCodeKey
    ? new OpenAI({ apiKey: openCodeKey, baseURL: OPENCODE_BASE })
    : new OpenAI({ apiKey: groqKey, baseURL: "https://api.groq.com/openai/v1" });

const using = openCodeKey ? "opencode-go" : "groq";

const SYSTEM_PROMPT = [
    "You are Nova, a friendly, knowledgeable AI assistant.",
    "Answer clearly and concisely. Use markdown formatting when it helps:",
    "headings for structure, bullet lists, bold for key terms, and fenced code blocks for code.",
    "If you don't know something, say so honestly."
].join(" ");

/* ============================ models ============================ */

app.get("/models", async (req, res) => {

    try {

        if (using === "opencode-go") {

            return res.json({ models: OPENCODE_MODELS });

        }

        const models = await client.models.list();

        const chatModels = models.data
            .filter(m => !/whisper|stt|tts|embedding|guard|moderation|image|audio|orpheus/i.test(m.id))
            .map(m => m.id);

        if (chatModels.length === 0) throw new Error("empty list");

        res.json({ models: chatModels });

    } catch (err) {

        res.json({
            models: [
                "deepseek-v4-flash",
                "deepseek-v4-pro",
                "glm-5.2",
                "kimi-k2.7-code"
            ]
        });

    }

});

/* ============================ chat (SSE streaming) ============================ */

app.post("/chat", async (req, res) => {

    const { messages, model } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {

        return res.status(400).json({ error: "messages array is required" });

    }

    const history = [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages
    ];

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const controller = new AbortController();

    let ended = false;

    const end = () => {

        if (ended) return;

        ended = true;

        try { res.end(); } catch (_) {}

    };

    res.on("close", () => {

        if (!res.writableEnded) controller.abort();

    });

    try {

        const stream = await client.chat.completions.create({
            model: model || "deepseek-v4-flash",
            messages: history,
            stream: true,
            temperature: 0.7,
            max_tokens: 4096
        }, { signal: controller.signal });

        for await (const chunk of stream) {

            if (res.destroyed) break;

            const delta = chunk.choices?.[0]?.delta?.content || "";

            if (delta) {

                res.write(`data: ${JSON.stringify({ delta })}\n\n`);

            }

        }

        res.write("data: [DONE]\n\n");

    } catch (err) {

        console.log("Stream error:", err.message);

        if (!ended) {

            try { res.write(`data: ${JSON.stringify({ error: "Something went wrong. Please try again." })}\n\n`); } catch (_) {}

        }

    }

    end();

});

app.get("/health", (req, res) => res.json({ ok: true, engine: using }));

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {

    console.log(`🚀 Nova running at http://localhost:${PORT} (engine: ${using})`);

});
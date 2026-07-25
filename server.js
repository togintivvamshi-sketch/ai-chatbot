require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const Groq = require("groq-sdk");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

let conversation = [
    {
        role: "system",
        content: "You are a friendly AI assistant."
    }
];

app.post("/chat", async (req, res) => {

    try {

        const { message } = req.body;

        conversation.push({
            role: "user",
            content: message
        });

        const completion = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: conversation
        });

        const reply = completion.choices[0].message.content;

        conversation.push({
            role: "assistant",
            content: reply
        });

        res.json({ reply });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            reply: "Something went wrong."
        });

    }

});

app.post("/new-chat", (req, res) => {

    conversation = [
        {
            role: "system",
            content: "You are a friendly AI assistant."
        }
    ];

    res.json({
        success: true
    });

});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {

    console.log(`🚀 Server running at http://localhost:${PORT}`);

});
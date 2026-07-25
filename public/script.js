const chatBox = document.getElementById("chatBox");
const input = document.getElementById("message");

let recognition;

// =========================
// Load Theme
// =========================

window.onload = function () {

    const theme = localStorage.getItem("theme");

    if (theme === "dark") {

        document.body.classList.add("dark");

    }

};

// =========================
// Toggle Theme
// =========================

function toggleTheme() {

    document.body.classList.toggle("dark");

    if (document.body.classList.contains("dark")) {

        localStorage.setItem("theme", "dark");

    } else {

        localStorage.setItem("theme", "light");

    }

}

// =========================
// Enter Key
// =========================

input.addEventListener("keydown", function (event) {

    if (event.key === "Enter") {

        event.preventDefault();

        sendMessage();

    }

});

// =========================
// Voice Recognition
// =========================

function startVoice() {

    if (!("webkitSpeechRecognition" in window)) {

        alert("Voice recognition is not supported in this browser.");

        return;

    }

    recognition = new webkitSpeechRecognition();

    recognition.lang = "en-US";

    recognition.interimResults = false;

    recognition.maxAlternatives = 1;

    recognition.start();

    recognition.onresult = function (event) {

        input.value = event.results[0][0].transcript;

        sendMessage();

    };

    recognition.onerror = function () {

        console.log("Voice recognition failed.");

    };

}

// =========================
// Stop Voice
// =========================

function stopVoice() {

    window.speechSynthesis.cancel();

}

// =========================
// Send Message
// =========================

async function sendMessage() {

    window.speechSynthesis.cancel();

    const message = input.value.trim();

    if (message === "") return;

    chatBox.innerHTML += `
        <div class="user">
            <b>You:</b> ${message}
        </div>
    `;

    input.value = "";

    const typing = document.createElement("div");

    typing.className = "bot";

    typing.innerHTML = "<b>AI:</b> Typing...";

    chatBox.appendChild(typing);

    chatBox.scrollTop = chatBox.scrollHeight;

    try {

        const response = await fetch("/chat", {

            method: "POST",

            headers: {

                "Content-Type": "application/json"

            },

            body: JSON.stringify({

                message

            })

        });

        const data = await response.json();

        typing.innerHTML = `
            <b>AI:</b> ${data.reply}
        `;

        const speech = new SpeechSynthesisUtterance(data.reply);

        speech.lang = "en-US";

        speech.rate = 1;

        speech.pitch = 1;

        window.speechSynthesis.speak(speech);

        chatBox.scrollTop = chatBox.scrollHeight;

    }

    catch (error) {

        typing.innerHTML = "<b>AI:</b> Something went wrong.";

    }

}

// =========================
// New Chat
// =========================

async function newChat() {

    stopVoice();

    await fetch("/new-chat", {

        method: "POST"

    });

    chatBox.innerHTML = "";

    input.focus();

}
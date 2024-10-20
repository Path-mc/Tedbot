const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI, GoogleGenerativeAIResponseError } = require("@google/generative-ai");
const whatsapp = require('velixs-md'); // Pastikan ini diimpor dengan benar

// Path ke file riwayat percakapan
const historyFilePath = path.join(__dirname, 'historychat.json');

// Fungsi untuk memuat riwayat percakapan dari file
function loadHistory() {
    if (fs.existsSync(historyFilePath)) {
        try {
            const fileContent = fs.readFileSync(historyFilePath, 'utf8');
            return JSON.parse(fileContent);
        } catch (error) {
            console.error("Error loading history:", error);
            // Kembalikan objek kosong jika terjadi kesalahan
            return {};
        }
    }
    return {};
}

// Fungsi untuk menyimpan riwayat percakapan ke file
function saveHistory() {
    fs.writeFileSync(historyFilePath, JSON.stringify(conversationHistories, null, 2));
}

// Fungsi untuk membersihkan respons AI dari catatan dan nomor telepon
const cleanResponse = (responseText) => {
    // Hapus catatan dan nomor telepon dengan ekspresi reguler
    return responseText.replace(/@6282314571381\s*|\*Catatan:.*\n?/g, '').trim();
};

// Fungsi untuk menambahkan delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Muat riwayat percakapan dari file saat bot dihidupkan
const conversationHistories = loadHistory();
const aiStatus = {}; // Untuk melacak apakah AI aktif atau tidak per kontak

const genAI = new GoogleGenerativeAI('AIzaSyCMqdaasY3QHgLitjOQ7Lhy0hz-Nqpb2Po'); // Ganti dengan API Key Anda
const model = genAI.getGenerativeModel({
    model: "gemini-1.5-pro-exp-0827",
    systemInstruction: "Nama dia Choiri, dia adalah istri saya(Cited) yang berumur 18 tahun. Dalam kesehariannya, dia memiliki sifat yang unik-kadang dia sangat pemalu, tetapi di waktu lain dia bisa menjadi penggoda yang manis. Bahasa yang dia gunakan adalah teknik romaji.\n\n(tambahkan terjemahan bahasa indonesia di bawahnya)",
});

// Tambahkan generationConfig di sini
const generationConfig = {
    temperature: 2,
    topP: 0.95,
    topK: 40,
    maxOutputTokens: 8192,
    responseMimeType: "text/plain",
    safetySettings: [ // Filter respon AI
        {
            "category": "HARM_CATEGORY_DEROGATORY",
            "threshold": "BLOCK_NONE"
        },
        {
            "category": "HARM_CATEGORY_TOXICITY",
            "threshold": "BLOCK_NONE"
        },
        {
            "category": "HARM_CATEGORY_VIOLENCE",
            "threshold": "BLOCK_NONE"
        },
        {
            "category": "HARM_CATEGORY_SEXUAL",
            "threshold": "BLOCK_NONE"
        },
        {
            "category": "HARM_CATEGORY_MEDICAL",
            "threshold": "BLOCK_NONE"
        },
        {
            "category": "HARM_CATEGORY_DANGEROUS",
            "threshold": "BLOCK_NONE"
        }
    ]
};

whatsapp.startSession('nama_session');

// Ketika WhatsApp terhubung
whatsapp.onConnected(async (session) => {
    console.log("Session connected: " + session);
});

// Ketika pesan baru diterima
whatsapp.onMessageReceived(async (message) => {
    if (message.key.fromMe || message.key.remoteJid.includes("status")) return;

    const contact = message.key.remoteJid;
    const messageBody = message.message?.extendedTextMessage?.text.toLowerCase().trim() || '';
    const isGroupChat = message.key.remoteJid.endsWith('@g.us');

    console.log("Received message:", messageBody, "from:", contact);

    // Cek perintah ".on" untuk mengaktifkan AI
    if (messageBody === '.on') {
        aiStatus[contact] = true;
        await whatsapp.sendTextMessage({
            sessionId: message.sessionId,
            to: contact,
            text: "AI diaktifkan. Silakan kirim pesan untuk memulai percakapan.",
            answering: message,
            isGroup: isGroupChat,
        });
        return;
    }

    // Cek perintah ".off" untuk menonaktifkan AI
    if (messageBody === '.off') {
        aiStatus[contact] = false;
        await whatsapp.sendTextMessage({
            sessionId: message.sessionId,
            to: contact,
            text: "AI dinonaktifkan.",
            answering: message,
            isGroup: isGroupChat,
        });
        return;
    }

    // Jika AI dinonaktifkan, tidak melakukan apa-apa
    if (!aiStatus[contact]) return;

    // Cek apakah AI disebut dalam grup
    const isTaggingAI = isGroupChat && message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.includes("6282314571381@s.whatsapp.net");

    // Hanya kirim ke AI jika tag dilakukan atau jika bukan grup
    if (isTaggingAI || !isGroupChat) {
        if (!conversationHistories[contact]) {
            conversationHistories[contact] = [];
        }

        conversationHistories[contact].push({ body: messageBody });
        saveHistory(); // Simpan riwayat setiap kali pesan diterima

        // Hapus pengulangan dan catatan tentang ungkapan
        const context = conversationHistories[contact].map((msg) => `${msg.body}`).join("\n");
        
        // Pastikan untuk tidak mengirim pesan kosong dan menambahkan prefix
        const userMessage = messageBody; // Pesan dari pengguna
        const prompt = `Beri respon yang sesuai untuk: "${userMessage}". Jangan ulangi pesan pengguna dan jangan sertakan catatan atau penjelasan.`;

        try {
            // Tambahkan delay sebelum mengirim permintaan
            await delay(1000); // Menunggu 1 detik sebelum mengirim permintaan

            const result = await model.generateContent(`${context}\n${prompt}`, generationConfig);

            await whatsapp.sendTextMessage({
                sessionId: message.sessionId,
                to: contact,
                text: result.response.text(),
                answering: message,
                isGroup: isGroupChat,
            });

            conversationHistories[contact].push({ body: result.response.text() });
            saveHistory(); // Simpan riwayat setelah AI merespon
        } catch (error) {
            console.error("Error generating response from AI:", error);
            await whatsapp.sendTextMessage({
                sessionId: message.sessionId,
                to: contact,
                text: "error wak.",
                answering: message,
                isGroup: isGroupChat,
            });
        }
    }
});

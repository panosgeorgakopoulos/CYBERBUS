require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();

app.use(cors());
// Αυξάνουμε το όριο γιατί οι εικόνες base64 είναι μεγάλα strings
app.use(express.json({ limit: '10mb' })); 
app.use(express.static(__dirname)); 

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// Το υπάρχον Chat Endpoint
app.post('/api/chat', async (req, res) => {
    try {
        const { message, lang } = req.body;
        const prompt = lang === 'en' 
            ? `You are a friendly AI assistant on a tourist bus in Athens. Answer briefly in English. User asks: ${message}`
            : `Είσαι ένας έξυπνος βοηθός σε ένα τουριστικό λεωφορείο στην Αθήνα. Απάντησε σύντομα και φιλικά στα ελληνικά. Ερώτηση χρήστη: ${message}`;
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        res.json({ reply: response.text() });
    } catch (error) {
        console.error("AI Error:", error);
        res.status(500).json({ error: 'AI Communication Error.' });
    }
});

// ΝΕΟ: AR Scan Endpoint (Gemini Vision)
app.post('/api/ar-scan', async (req, res) => {
    try {
        const { imageBase64, lang } = req.body;
        
        // Αφαιρούμε το header "data:image/jpeg;base64," από το string
        const base64Data = imageBase64.replace(/^data:image\/(png|jpeg);base64,/, "");

        const prompt = lang === 'en'
            ? `Look at this image. If it contains a famous Greek/Athens landmark, return ONLY a strict JSON object like this: {"status": "OK", "title": "Landmark Name", "desc": "One short interesting sentence about it."}. If it does NOT contain a landmark (e.g. it's a person, a room, a generic object), return ONLY this JSON: {"status": "ERROR"}. Do not use markdown blocks.`
            : `Δες αυτή την εικόνα. Αν περιέχει ένα διάσημο Ελληνικό αξιοθέατο, επίστρεψε ΜΟΝΟ ένα JSON ακριβώς έτσι: {"status": "OK", "title": "Όνομα", "desc": "Μια σύντομη ενδιαφέρουσα πρόταση."}. Αν ΔΕΝ δείχνει αξιοθέατο (π.χ. είναι άνθρωπος, δωμάτιο, αντικείμενο), επίστρεψε ΜΟΝΟ: {"status": "ERROR"}. Μην χρησιμοποιήσεις markdown blocks.`;

        const result = await model.generateContent([
            prompt,
            { inlineData: { data: base64Data, mimeType: "image/jpeg" } }
        ]);
        
        const responseText = await result.response.text();
        
        // Καθαρισμός πιθανών markdown blocks (```json ... ```) από την απάντηση του AI
        const cleanJsonStr = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
        
        res.json(JSON.parse(cleanJsonStr));

    } catch (error) {
        console.error("Vision AI Error:", error);
        res.status(500).json({ status: "ERROR" });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Το CYBERBUS τρέχει στο: http://localhost:${PORT}`);
});
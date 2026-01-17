// MUST be first - load environment variables before any other imports
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs').promises;
const path = require('path');
const cookieParser = require('cookie-parser');
const fileUpload = require('express-fileupload');

// Verify Stripe webhook secret is loaded
console.log('[ENV CHECK] STRIPE_WEBHOOK_SECRET loaded:', process.env.STRIPE_WEBHOOK_SECRET ? '✓ YES' : '✗ NO (MISSING!)');

const app = express();
const PORT = 3000;

app.use(cors({
    origin: function (origin, callback) {
        // allow requests with no origin (like mobile apps or curl requests or local files)
        if (!origin) return callback(null, true);
        return callback(null, true);
    },
    credentials: true
}));
app.use(cookieParser());
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Raw body for Stripe webhooks (must be before bodyParser)
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

app.use(bodyParser.json({ limit: '100mb' }));
app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));
app.use(fileUpload({
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB limit per file
    },
    useTempFiles: false,
    abortOnLimit: false, // Don't abort on file size limit, just reject the file
    parseNested: true
}));

// Serve static files (API logic comes first to catch routes, but static is fine here)
app.use(express.static(path.join(__dirname, '.')));
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'data/uploads')));

// === LMS ROUTES ===
const authRoutes = require('./server/authRoutes')(app);
const { requireAuth, requireStudentAuth } = authRoutes; // Extract middleware

require('./server/sessionRoutes')(app, requireAuth);
require('./server/studentRoutes')(app, requireAuth);
require('./server/assignmentRoutes')(app, requireAuth, requireStudentAuth);
require('./server/contentRoutes')(app, requireAuth);

// Analytics Routes
require('./server/analyticsRoutes')(app, requireAuth);

// Admin Routes
require('./server/adminRoutes')(app);

// Content Generator Routes
require('./server/contentGeneratorRoutes')(app, requireAuth);

// Stripe Routes
require('./server/stripeRoutes')(app, requireAuth);

const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const AUDIO_DIR = path.join(UPLOAD_DIR, 'audio');

// Ensure upload dirs exist
fs.mkdir(UPLOAD_DIR, { recursive: true }).catch(console.error);
fs.mkdir(AUDIO_DIR, { recursive: true }).catch(console.error);

// === SECURE MEDIA ROUTES ===


// 3. GET /api/images?q=term (Secured: Teachers only)
app.get('/api/images', requireAuth, async (req, res) => {
    const query = req.query.q;
    if (!query) return res.json({ images: [] });

    const API_KEY = process.env.PIXABAY_KEY;

    if (API_KEY) {
        try {
            const url = `https://pixabay.com/api/?key=${API_KEY}&q=${encodeURIComponent(query)}&safesearch=true&per_page=3`;
            const apiRes = await fetch(url);
            if (!apiRes.ok) throw new Error(`Pixabay API error: ${apiRes.status}`);

            const data = await apiRes.json();
            if (data.hits && data.hits.length > 0) {
                const images = data.hits.map(hit => hit.webformatURL);
                return res.json({ images });
            }
        } catch (err) {
            console.error("Image API failed:", err.message);
        }
    } else {
        console.log('No API Key found. Using placeholders.');
    }

    // Fallback
    const mockImages = [
        `https://placehold.co/150x150?text=${query}+1`,
        `https://placehold.co/150x150?text=${query}+2`,
        `https://placehold.co/150x150?text=${query}+3`
    ];
    res.json({ images: mockImages });
});

// 4. POST /api/upload (Secured: Teachers only)
app.post('/api/upload', requireAuth, async (req, res) => {
    try {
        const { image, filename } = req.body;
        if (!image || !filename) return res.status(400).json({ error: 'Missing image or filename' });

        const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');

        const safeName = filename.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
        const uniqueName = `${Date.now()}_${safeName}`;
        const filePath = path.join(UPLOAD_DIR, uniqueName);

        await fs.writeFile(filePath, buffer);

        const publicUrl = `/data/uploads/${uniqueName}`;
        res.json({ success: true, url: publicUrl });
    } catch (err) {
        console.error('Upload failed:', err);
        res.status(500).json({ error: 'Upload failed' });
    }
});

// 5. POST /api/upload/audio (Secured: Teachers only)
app.post('/api/upload/audio', requireAuth, async (req, res) => {
    try {
        console.log('Audio upload request received');
        console.log('Files:', req.files ? Object.keys(req.files) : 'none');

        if (!req.files || !req.files.audio) {
            console.error('No audio file in request');
            return res.status(400).json({ error: 'No audio file uploaded' });
        }

        const audioFile = req.files.audio;
        console.log('Audio file details:', {
            name: audioFile.name,
            size: audioFile.size,
            mimetype: audioFile.mimetype
        });

        const safeName = audioFile.name.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
        const uniqueName = `${Date.now()}_${safeName}`;
        const uploadPath = path.join(AUDIO_DIR, uniqueName);

        console.log('Saving to:', uploadPath);
        await audioFile.mv(uploadPath);
        console.log('Audio file saved successfully');

        const publicUrl = `/data/uploads/audio/${uniqueName}`;
        res.json({ success: true, url: publicUrl });

    } catch (err) {
        console.error('Audio Upload failed:', err);
        res.status(500).json({ error: 'Audio upload failed', details: err.message });
    }
});

// 6. POST /api/generate-audio (Secured: Teachers only)
app.post('/api/generate-audio', requireAuth, async (req, res) => {
    try {
        const { text, lang, wordId } = req.body;
        if (!text || !lang || !wordId) return res.status(400).json({ error: 'Missing fields' });

        const safeFilename = `${wordId.replace(/[^a-z0-9_-]/gi, '')}.mp3`;
        const langDir = path.join(AUDIO_DIR, lang);
        const filepath = path.join(langDir, safeFilename);

        await fs.mkdir(langDir, { recursive: true }).catch(() => { });

        try {
            await fs.access(filepath);
            return res.json({
                success: true,
                url: `/data/uploads/audio/${lang}/${safeFilename}`,
                cached: true
            });
        } catch (e) {
            // Generate
        }

        const googleTTS = require('google-tts-api');
        const ttsLang = lang === 'fr' ? 'fr' : lang === 'es' ? 'es' : 'en';

        const url = googleTTS.getAudioUrl(text, {
            lang: ttsLang,
            slow: false,
            host: 'https://translate.google.com',
        });

        const https = require('https');
        const fileStream = require('fs').createWriteStream(filepath);

        https.get(url, (response) => {
            response.pipe(fileStream);
            fileStream.on('finish', () => {
                fileStream.close();
                res.json({
                    success: true,
                    url: `/data/uploads/audio/${lang}/${safeFilename}`,
                    cached: false
                });
            });
        }).on('error', (err) => {
            console.error("TTS Download Error:", err);
            fs.unlink(filepath).catch(() => { });
            res.status(500).json({ error: err.message });
        });

    } catch (e) {
        console.error("Generate Audio Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`- Editor: http://localhost:${PORT}/editor/index.html`);
    console.log(`- Game 1: http://localhost:${PORT}/game/index.html`);
});

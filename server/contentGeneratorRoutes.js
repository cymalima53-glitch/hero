module.exports = function (app, requireAuth) {
    const fs = require('fs');
    const path = require('path');
    const OpenAI = require('openai');
    const { requireAICredits } = require('./subscriptionMiddleware');

    // Initialize OpenAI
    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
    });

    const LIBRARY_PATH = path.join(__dirname, '../data/contentLibrary.json');
    const TEACHERS_FILE = path.join(__dirname, '../data/teachers.json');

    // Helper: Read content library
    function getLibrary() {
        if (!fs.existsSync(LIBRARY_PATH)) {
            fs.writeFileSync(LIBRARY_PATH, JSON.stringify({}), 'utf8');
            return {};
        }
        return JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
    }

    // Helper: Save content library
    function saveLibrary(data) {
        fs.writeFileSync(LIBRARY_PATH, JSON.stringify(data, null, 2), 'utf8');
    }

    // Helper: Get teachers
    function getTeachers() {
        if (!fs.existsSync(TEACHERS_FILE)) return [];
        const data = JSON.parse(fs.readFileSync(TEACHERS_FILE, 'utf8'));
        return data.teachers || [];
    }

    // Helper: Save teachers
    function saveTeachers(teachers) {
        fs.writeFileSync(TEACHERS_FILE, JSON.stringify({ teachers }, null, 2));
    }

    // POST /api/generate-content
    // Generate worksheets and workshops using OpenAI
    app.post('/api/generate-content', requireAuth, requireAICredits, async (req, res) => {
        try {
            const { subject, topic, level, language = 'en' } = req.body;
            const teacherId = req.teacherId;
            const teacher = req.teacher; // Set by requireAICredits middleware

            // Deduct credit (skip for internal free teachers)
            if (teacher.role !== 'internal_free') {
                const teachers = getTeachers();
                const teacherIndex = teachers.findIndex(t => t.id === teacherId);
                if (teacherIndex !== -1) {
                    teachers[teacherIndex].aiCredits = Math.max(0, (teachers[teacherIndex].aiCredits || 0) - 1);
                    teachers[teacherIndex].lastActiveAt = new Date().toISOString();
                    teachers[teacherIndex].contentGeneratorUses = (teachers[teacherIndex].contentGeneratorUses || 0) + 1;
                    saveTeachers(teachers);
                    console.log(`[AI] Credit deducted for ${teacher.email}, remaining: ${teachers[teacherIndex].aiCredits}`);
                }
            } else {
                // Track usage for internal free teachers
                const teachers = getTeachers();
                const teacherIndex = teachers.findIndex(t => t.id === teacherId);
                if (teacherIndex !== -1) {
                    teachers[teacherIndex].lastActiveAt = new Date().toISOString();
                    teachers[teacherIndex].contentGeneratorUses = (teachers[teacherIndex].contentGeneratorUses || 0) + 1;
                    saveTeachers(teachers);
                }
            }

            if (!subject || !level) {
                return res.status(400).json({ error: 'Subject and level are required' });
            }

            // Language names
            const languageNames = {
                'en': 'English',
                'fr': 'French',
                'es': 'Spanish'
            };

            const targetLanguage = languageNames[language] || 'English';

            // Build optimized prompt for OpenAI
            const prompt = `Create educational content in ${targetLanguage}.

Subject: ${subject}
Topic: ${topic || 'General'}
Level: ${level} (1=Beginner, 5=Expert)

Generate 5 worksheets and 5 workshop activities. Keep it concise and practical.

Return JSON:
{
  "worksheets": [
    {
      "title": "[Title in ${targetLanguage}]",
      "level": ${level},
      "instructions": "[Clear instructions in ${targetLanguage}]",
      "questions": [
        { "question": "[Question in ${targetLanguage}]", "answer": "[Answer]" }
      ]
    }
  ],
  "workshops": [
    {
      "title": "[Title in ${targetLanguage}]",
      "duration": "[e.g., 15 minutes]",
      "materials": ["[Material 1]"],
      "instructions": "[Instructions in ${targetLanguage}]"
    }
  ]
}`;

            // Call OpenAI GPT-4 Mini
            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: `You are an expert educational content creator. Generate content in ${targetLanguage}. Return valid JSON only.`
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                response_format: { type: "json_object" },
                max_tokens: 2000,
                temperature: 0.7
            });

            const generatedContent = JSON.parse(completion.choices[0].message.content);

            // Create content object
            const contentId = 'content_' + Date.now();
            const content = {
                id: contentId,
                subject,
                topic: topic || 'General',
                level,
                language,
                worksheets: generatedContent.worksheets || [],
                workshops: generatedContent.workshops || [],
                answerKeys: generatedContent.answerKeys || {},
                createdAt: new Date().toISOString()
            };

            // Save to library
            const library = getLibrary();
            if (!library[teacherId]) {
                library[teacherId] = {};
            }
            library[teacherId][contentId] = content;
            saveLibrary(library);

            res.json({
                success: true,
                content: content
            });

        } catch (error) {
            console.error('Content generation error:', error);
            res.status(500).json({
                error: 'Failed to generate content',
                details: error.message
            });
        }
    });

    // GET /api/content-library
    // Get teacher's content library
    app.get('/api/content-library', requireAuth, (req, res) => {
        try {
            const teacherId = req.cookies.teacherAuth;
            const library = getLibrary();
            const teacherContent = library[teacherId] || {};

            res.json({
                content: Object.values(teacherContent)
            });
        } catch (error) {
            console.error('Library fetch error:', error);
            res.status(500).json({ error: 'Failed to fetch library' });
        }
    });

    // DELETE /api/content-library/:contentId
    // Delete content from library
    app.delete('/api/content-library/:contentId', requireAuth, (req, res) => {
        try {
            const teacherId = req.cookies.teacherAuth;
            const { contentId } = req.params;

            const library = getLibrary();
            if (library[teacherId] && library[teacherId][contentId]) {
                delete library[teacherId][contentId];
                saveLibrary(library);
                res.json({ success: true });
            } else {
                res.status(404).json({ error: 'Content not found' });
            }
        } catch (error) {
            console.error('Delete error:', error);
            res.status(500).json({ error: 'Failed to delete content' });
        }
    });
};

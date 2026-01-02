const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const SESSIONS_DIR = path.join(__dirname, '../data/sessions');
const TEACHERS_FILE = path.join(__dirname, '../data/teachers.json');

// Ensure sessions dir
fs.mkdir(SESSIONS_DIR, { recursive: true }).catch(console.error);

const { sendMagicLink } = require('./email');

module.exports = function (app, requireAuth) {

    // 1. CREATE SESSION
    app.post('/api/sessions', requireAuth, async (req, res) => {
        try {
            const { studentId, gameId, wordIds, lang, limit, gameActions } = req.body;

            if (!studentId || !gameId || !wordIds) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            const sessionId = 'sess_' + crypto.randomUUID();
            const sessionData = {
                id: sessionId,
                teacherId: req.teacherId,
                studentId,
                gameId,
                wordIds, // Snapshot
                gameActions: gameActions || {}, // Save actions map
                lang: lang || 'en',
                limit: limit || 10,
                createdAt: new Date().toISOString(),
                status: 'pending', // pending, active, completed
                analytics: {
                    attempts: 0,
                    failuresBeforePass: 0,
                    timeSpent: 0,
                    questions: {} // wordId -> { wrong: 0, correct: false }
                }
            };

            await fs.writeFile(path.join(SESSIONS_DIR, `${sessionId}.json`), JSON.stringify(sessionData, null, 2));

            // FIND STUDENT EMAIL
            try {
                const tData = await fs.readFile(TEACHERS_FILE, 'utf8');
                const teacher = JSON.parse(tData).teachers.find(t => t.id === req.teacherId);
                const student = teacher ? teacher.students.find(s => s.id === studentId) : null;

                if (student && student.parentEmail) {
                    // Magic Link Construction:
                    // We need the host. req.get('host') works.
                    const protocol = req.protocol;
                    const host = req.get('host');

                    const gamePaths = {
                        memoryEcho: '/game/index.html',
                        multipleChoice: '/game2/index.html',
                        matchPairs: '/game3/index.html',
                        fillBlank: '/game4/index.html',
                        tapChoice: '/game5/index.html',
                        soundSwipe: '/game6/index.html',
                        beatClock: '/game7/index.html',
                        soundDrag: '/game8/index.html',
                        moveMatch: '/game9/index.html'
                    };
                    const gPath = gamePaths[gameId] || '/game/index.html';
                    const link = `${protocol}://${host}${gPath}?session=${sessionId}`;

                    sendMagicLink(student.parentEmail, student.name, link, gameId);
                }
            } catch (e) {
                console.error('Email sending failed (non-critical):', e);
            }

            res.json({ success: true, session: sessionData });
        } catch (err) {
            console.error('Create Session Error:', err);
            res.status(500).json({ error: 'Failed to create session' });
        }
    });

    // 2. GET SESSION (Public/Student Access)
    app.get('/api/session/:id', async (req, res) => {
        try {
            const sessionId = req.params.id;
            const filePath = path.join(SESSIONS_DIR, `${sessionId}.json`);

            const data = await fs.readFile(filePath, 'utf8');
            const session = JSON.parse(data);

            // HYDRATE WORDS
            // The games expect session.words = [ { id, word, ... }, ... ]
            try {
                const lang = session.lang || 'en';
                const dataPath = path.join(__dirname, `../data/${lang}.json`);
                const langDataRaw = await fs.readFile(dataPath, 'utf8');
                const langData = JSON.parse(langDataRaw);

                const allWords = langData.words || [];
                const validIds = new Set(session.wordIds || []);

                // Filter words that are in the session AND exist in en.json
                session.words = allWords.filter(w => validIds.has(w.id));

            } catch (hydrationError) {
                console.error("Failed to hydrate session words:", hydrationError);
                // Return session but words will be empty/undefined, game handles this as error
                session.words = [];
            }

            res.json(session);
        } catch (err) {
            res.status(404).json({ error: 'Session not found' });
        }
    });

    // 3. START SESSION
    app.post('/api/session/:id/start', async (req, res) => {
        try {
            const sessionId = req.params.id;
            const filePath = path.join(SESSIONS_DIR, `${sessionId}.json`);
            const data = await fs.readFile(filePath, 'utf8');
            const session = JSON.parse(data);

            if (session.status === 'pending') {
                session.status = 'active';
                session.analytics.startTime = Date.now();
                await fs.writeFile(filePath, JSON.stringify(session, null, 2));
            }
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Update failed' });
        }
    });

    // 4. TRACK PROGRESS (Question Attempt)
    app.post('/api/session/:id/track', async (req, res) => {
        try {
            const sessionId = req.params.id;
            const { wordId, correct, timeSpent } = req.body;

            const filePath = path.join(SESSIONS_DIR, `${sessionId}.json`);
            const data = await fs.readFile(filePath, 'utf8');
            const session = JSON.parse(data);

            if (!session.analytics.questions[wordId]) {
                // Initialize with specific counters
                session.analytics.questions[wordId] = { wrong_action: 0, timeout: 0, correct: false };
            }

            if (!correct) {
                const mistakeType = req.body.mistakeType; // "wrong_action" or "timeout"
                if (mistakeType === 'timeout') {
                    session.analytics.questions[wordId].timeout = (session.analytics.questions[wordId].timeout || 0) + 1;
                } else if (mistakeType === 'wrong_action') {
                    session.analytics.questions[wordId].wrong_action = (session.analytics.questions[wordId].wrong_action || 0) + 1;
                } else {
                    // Fallback for general failures or other games
                    session.analytics.questions[wordId].wrong_action = (session.analytics.questions[wordId].wrong_action || 0) + 1;
                }
            } else {
                session.analytics.questions[wordId].correct = true;
            }

            // Accumulate total time if provided per question, or just rely on start/end
            if (timeSpent) {
                session.analytics.timeSpent += timeSpent;
            }

            await fs.writeFile(filePath, JSON.stringify(session, null, 2));
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Track failed' });
        }
    });

    // 5. COMPLETE SESSION (Win)
    app.post('/api/session/:id/complete', async (req, res) => {
        try {
            const sessionId = req.params.id;
            const { attempts, failuresBeforePass } = req.body;

            const filePath = path.join(SESSIONS_DIR, `${sessionId}.json`);
            const data = await fs.readFile(filePath, 'utf8');
            const session = JSON.parse(data);

            session.status = 'completed';
            session.analytics.endTime = Date.now();

            if (attempts !== undefined) session.analytics.attempts = attempts;
            if (failuresBeforePass !== undefined) session.analytics.failuresBeforePass = failuresBeforePass;

            if (req.body.duration) {
                session.analytics.totalTimeSeconds = req.body.duration;
            } else if (session.analytics.startTime) {
                const duration = (Date.now() - session.analytics.startTime) / 1000;
                session.analytics.totalTimeSeconds = duration;
            }

            // CALCULATE ACCURACY & MISTAKES
            let totalCorrect = 0;
            let totalMistakes = 0;
            let totalQuestions = 0;

            if (session.analytics && session.analytics.questions) {
                const qIds = Object.keys(session.analytics.questions);
                totalQuestions = qIds.length;
                qIds.forEach(qid => {
                    const qData = session.analytics.questions[qid];
                    if (qData.correct) totalCorrect++;
                    // Estimate mistakes (wrong actions + timeouts)
                    const wrong = (qData.wrong_action || 0) + (qData.timeout || 0);
                    totalMistakes += wrong;
                });
            }

            // Fallback: If minimal data, use attempts vs failures?
            // Accuracy = (Correct / (Correct + Mistakes)) ?? No, usually just (Correct / Total Questions) * 100
            // But if they retry, they eventually get it correct.
            // Let's use: (Points / Total Possible Points) where Points = TotalQuestions - Mistakes? No.
            // Standard: % of questions solved without help?
            // Let's use: (TotalQuestions / (TotalQuestions + TotalMistakes)) * 100?
            // Simplified: If they have 0 mistakes, 100%.
            // If they have equal mistakes to questions, 50%.

            let accuracy = 0;
            if (totalQuestions > 0) {
                // Formula: Accuracy drops as mistakes increase.
                // A common formula: max(0, (TotalQuestions - TotalMistakes) / TotalQuestions) * 100? No that punishes too hard.
                // Let's use: Correct / (Correct + Mistakes + Abandoned?)
                // Actually, let's use a simpler heuristic for kids:
                // 100 - ( (Mistakes / TotalQuestions) * 20 )? No.
                // Let's count "Attempts" vs "Correct".
                // If I tried 5 times and got 1 right, my accuracy is 20%.
                const totalAttempts = totalQuestions + totalMistakes;
                accuracy = totalAttempts > 0 ? Math.round((totalQuestions / totalAttempts) * 100) : 0;
            } else if (session.words && session.words.length > 0) {
                // Fallback if no detailed question tracking (e.g. older games)
                // Use session.analytics.failuresBeforePass
                const fails = session.analytics.failuresBeforePass || 0;
                const count = session.words.length;
                const totalAtt = count + fails;
                accuracy = totalAtt > 0 ? Math.round((count / totalAtt) * 100) : 0;
                totalMistakes = fails;
            }

            session.analytics.accuracy = accuracy;
            session.analytics.mistakes = totalMistakes;

            await fs.writeFile(filePath, JSON.stringify(session, null, 2));

            // UPDATE ASSIGNMENT STATUS
            if (session.assignmentId) {
                try {
                    const ASSIGNMENTS_FILE = path.join(__dirname, '../data/assignments.json');
                    const aData = await fs.readFile(ASSIGNMENTS_FILE, 'utf8');
                    const assignments = JSON.parse(aData).assignments || [];
                    const assignment = assignments.find(a => a.id === session.assignmentId);

                    // DEBUG LOG
                    await fs.appendFile(path.join(__dirname, '../debug_log.txt'),
                        `[${new Date().toISOString()}] Complete Session: ${sessionId}, Assignment: ${session.assignmentId}, Found: ${!!assignment}\n`);

                    if (assignment) {
                        assignment.status = 'completed';
                        assignment.duration = session.analytics.totalTimeSeconds; // Save duration
                        assignment.accuracy = session.analytics.accuracy; // Save Accuracy
                        assignment.mistakes = session.analytics.mistakes; // Save Mistakes
                        await fs.writeFile(ASSIGNMENTS_FILE, JSON.stringify({ assignments }, null, 2));
                        await fs.appendFile(path.join(__dirname, '../debug_log.txt'), `[${new Date().toISOString()}] Updated status to completed for ${session.assignmentId}\n`);
                    }
                } catch (e) {
                    console.error("Failed to update assignment status:", e);
                    await fs.appendFile(path.join(__dirname, '../debug_log.txt'), `[${new Date().toISOString()}] ERROR: ${e.message}\n`);
                }
            }

            res.json({ success: true });
        } catch (err) {
            console.error("Complete Route Error:", err);
            res.status(500).json({ error: 'Complete failed' });
        }
    });

    // 6. LIST SESSIONS (For Teacher Dashboard)
    // 6. LIST SESSIONS (For Teacher Dashboard)
    app.get('/api/sessions', requireAuth, async (req, res) => {
        try {
            const files = await fs.readdir(SESSIONS_DIR);
            const sessions = [];
            let debugLog = `[${new Date().toISOString()}] Req Teacher: ${req.teacherId}\n`;

            for (const file of files) {
                if (file.endsWith('.json')) {
                    try {
                        const content = await fs.readFile(path.join(SESSIONS_DIR, file), 'utf8');
                        const sess = JSON.parse(content);
                        if (sess.teacherId === req.teacherId) {
                            sessions.push(sess);
                        }
                    } catch (e) {
                        debugLog += `Error parsing ${file}: ${e.message}\n`;
                    }
                }
            }
            debugLog += `Found ${sessions.length} sessions.\n`;
            await fs.appendFile(path.join(__dirname, '../debug_sessions.txt'), debugLog);

            res.json({ sessions });
        } catch (err) {
            await fs.appendFile(path.join(__dirname, '../debug_sessions.txt'), `CRITICAL ERROR: ${err.message}\n`);
            res.json({ sessions: [] });
        }
    });

    // 7. DELETE SESSION
    app.delete('/api/sessions/:id', requireAuth, async (req, res) => {
        try {
            const sessionId = req.params.id;
            const filePath = path.join(SESSIONS_DIR, `${sessionId}.json`);

            // Verify ownership first
            const data = await fs.readFile(filePath, 'utf8');
            const session = JSON.parse(data);

            if (session.teacherId !== req.teacherId) {
                return res.status(403).json({ error: 'Unauthorized' });
            }

            await fs.unlink(filePath);
            res.json({ success: true });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Delete failed' });
        }
    });
};

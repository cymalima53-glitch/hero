module.exports = function (app, requireAuth) {
    const fs = require('fs');
    const path = require('path');
    const { requireSubscription } = require('./subscriptionMiddleware');

    // OpenAI removed - insights are now rule-based

    // Helper: Read sessions data
    function getSessions() {
        const sessionsDir = path.join(__dirname, '../data/sessions');
        if (!fs.existsSync(sessionsDir)) return [];

        const sessionFiles = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
        const sessions = [];

        for (const file of sessionFiles) {
            try {
                const filePath = path.join(sessionsDir, file);
                const sessionData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                sessions.push(sessionData);
            } catch (err) {
                console.warn(`⚠️  Skipping corrupted session file ${file}:`, err.message);
                // Continue processing other files instead of crashing
            }
        }

        return sessions;
    }

    // Helper: Read students data
    function getStudents() {
        const studentsPath = path.join(__dirname, '../data/students.json');
        if (!fs.existsSync(studentsPath)) return [];
        const data = JSON.parse(fs.readFileSync(studentsPath, 'utf8'));
        // Handle different JSON structures
        if (Array.isArray(data)) return data;
        if (data.students && Array.isArray(data.students)) return data.students;
        return Object.values(data);
    }

    // GET /api/analytics/student/:studentId
    // Returns aggregated performance data for charts
    app.get('/api/analytics/student/:studentId', requireAuth, requireSubscription, (req, res) => {
        try {
            const { studentId } = req.params;
            const sessions = getSessions();
            const studentSessions = sessions.filter(s => s.studentId === studentId);

            if (studentSessions.length === 0) {
                return res.json({
                    studentId,
                    sessions: [],
                    chartData: { labels: [], datasets: [] },
                    summary: { totalGames: 0, avgAccuracy: 0, weakAreas: [] }
                });
            }

            // Sort by date
            studentSessions.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

            // Helper: Calculate accuracy from session data
            const getAccuracy = (session) => {
                // If accuracy is already calculated, use it
                if (session.analytics?.accuracy !== undefined) {
                    return session.analytics.accuracy;
                }

                // Calculate from attempts and failures
                const attempts = session.analytics?.attempts || 0;
                const failures = session.analytics?.failuresBeforePass || 0;

                if (attempts === 0) return 0;

                // Accuracy = (attempts - failures) / attempts * 100
                const successfulAttempts = Math.max(0, attempts - failures);
                return Math.round((successfulAttempts / attempts) * 100);
            };

            // Prepare data for Line Chart (Progress over time)
            const progressLabels = studentSessions.map(s =>
                new Date(s.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            );
            const progressData = studentSessions.map(s => getAccuracy(s));

            // Prepare data for Bar Chart (Accuracy by game)
            const gameAccuracy = {};
            studentSessions.forEach(s => {
                if (!gameAccuracy[s.gameId]) {
                    gameAccuracy[s.gameId] = { total: 0, count: 0 };
                }
                gameAccuracy[s.gameId].total += getAccuracy(s);
                gameAccuracy[s.gameId].count += 1;
            });

            const gameLabels = Object.keys(gameAccuracy);
            const gameData = gameLabels.map(gameId =>
                Math.round(gameAccuracy[gameId].total / gameAccuracy[gameId].count)
            );

            // Calculate summary stats
            const totalGames = studentSessions.length;
            const avgAccuracy = Math.round(
                studentSessions.reduce((sum, s) => sum + getAccuracy(s), 0) / totalGames
            );

            // Identify weak areas (games with avg accuracy < 70%)
            const weakAreas = gameLabels.filter(gameId =>
                (gameAccuracy[gameId].total / gameAccuracy[gameId].count) < 70
            );

            res.json({
                studentId,
                sessions: studentSessions,
                chartData: {
                    progress: { labels: progressLabels, data: progressData },
                    gameAccuracy: { labels: gameLabels, data: gameData }
                },
                summary: {
                    totalGames,
                    avgAccuracy,
                    weakAreas,
                    completedGames: studentSessions.filter(s => s.status === 'completed').length
                }
            });
        } catch (error) {
            console.error('Analytics error:', error);
            res.status(500).json({ error: 'Failed to generate analytics' });
        }
    });

    // POST /api/analytics/insights
    // Generate rule-based insights (no AI/API required)
    app.post('/api/analytics/insights', requireAuth, requireSubscription, async (req, res) => {
        console.log('=== INSIGHTS REQUEST RECEIVED ===');

        try {
            const { studentId, summary, sessions, language = 'en' } = req.body;
            console.log('Request data:', { studentId, summary: !!summary, sessionsCount: sessions?.length, language });

            if (!studentId || !summary) {
                console.error('Missing required data in request');
                return res.status(400).json({ error: 'Missing required data' });
            }

            // Get student name
            const students = getStudents();
            const student = students.find(s => s.id === studentId);
            const studentName = student ? student.name : 'Student';

            // Language templates
            const templates = {
                en: {
                    title: `Performance Summary for ${studentName}`,
                    stats: 'Overall Statistics',
                    totalGames: 'Total Games Played',
                    avgAccuracy: 'Average Accuracy',
                    completedGames: 'Completed Games',
                    weakAreas: 'Areas Needing Attention',
                    recommendations: 'Recommendations',
                    focusPractice: 'Focus on practicing the games listed above to improve overall performance.',
                    greatWork: 'Great Work!',
                    noWeakAreas: 'No weak areas identified. Keep up the excellent performance!',
                    excellent: 'Excellent progress! Continue with current practice routine.',
                    good: 'Good progress! Consider additional practice sessions for improvement.',
                    keepPracticing: 'Keep practicing! Regular sessions will help build confidence and skills.',
                    note: 'Note: These insights are based on your performance data.'
                },
                fr: {
                    title: `Résumé de Performance pour ${studentName}`,
                    stats: 'Statistiques Générales',
                    totalGames: 'Total de Jeux Joués',
                    avgAccuracy: 'Précision Moyenne',
                    completedGames: 'Jeux Complétés',
                    weakAreas: 'Domaines Nécessitant une Attention',
                    recommendations: 'Recommandations',
                    focusPractice: 'Concentrez-vous sur la pratique des jeux listés ci-dessus pour améliorer les performances globales.',
                    greatWork: 'Excellent Travail!',
                    noWeakAreas: 'Aucun domaine faible identifié. Continuez votre excellent travail!',
                    excellent: 'Excellent progrès! Continuez avec votre routine de pratique actuelle.',
                    good: 'Bon progrès! Envisagez des sessions de pratique supplémentaires pour améliorer.',
                    keepPracticing: 'Continuez à pratiquer! Des sessions régulières aideront à développer la confiance et les compétences.',
                    note: 'Note: Ces informations sont basées sur vos données de performance.'
                },
                es: {
                    title: `Resumen de Rendimiento para ${studentName}`,
                    stats: 'Estadísticas Generales',
                    totalGames: 'Total de Juegos Jugados',
                    avgAccuracy: 'Precisión Promedio',
                    completedGames: 'Juegos Completados',
                    weakAreas: 'Áreas que Necesitan Atención',
                    recommendations: 'Recomendaciones',
                    focusPractice: 'Concéntrese en practicar los juegos enumerados arriba para mejorar el rendimiento general.',
                    greatWork: '¡Excelente Trabajo!',
                    noWeakAreas: 'No se identificaron áreas débiles. ¡Sigue con el excelente rendimiento!',
                    excellent: '¡Excelente progreso! Continúa con tu rutina de práctica actual.',
                    good: '¡Buen progreso! Considera sesiones de práctica adicionales para mejorar.',
                    keepPracticing: '¡Sigue practicando! Las sesiones regulares ayudarán a desarrollar confianza y habilidades.',
                    note: 'Nota: Estos conocimientos se basan en sus datos de rendimiento.'
                }
            };

            const t = templates[language] || templates.en;

            // Generate performance message based on accuracy
            let performanceMsg = '';
            if (summary.avgAccuracy >= 80) {
                performanceMsg = `🌟 ${t.excellent}`;
            } else if (summary.avgAccuracy >= 60) {
                performanceMsg = `📈 ${t.good}`;
            } else {
                performanceMsg = `💪 ${t.keepPracticing}`;
            }

            // Build insights text
            const weakAreasSection = summary.weakAreas && summary.weakAreas.length > 0
                ? `⚠️ **${t.weakAreas}:**\n${summary.weakAreas.map(area => `- ${formatGameName(area)}`).join('\n')}\n\n💡 **${t.recommendations}:**\n${t.focusPractice}`
                : `✅ **${t.greatWork}**\n${t.noWeakAreas}`;

            const insights = `**${t.title}**

📊 **${t.stats}:**
- ${t.totalGames}: ${summary.totalGames || 0}
- ${t.avgAccuracy}: ${summary.avgAccuracy || 0}%
- ${t.completedGames}: ${summary.completedGames || 0}

${weakAreasSection}

${performanceMsg}

---
*${t.note}*`;

            // Generate recommendations
            const recommendations = (summary.weakAreas || []).map(area => ({
                area: formatGameName(area),
                suggestion: language === 'fr' ? `Pratiquer ${formatGameName(area)}` :
                    language === 'es' ? `Practicar ${formatGameName(area)}` :
                        `Practice ${formatGameName(area)}`,
                level: language === 'fr' ? 'Recommandé' :
                    language === 'es' ? 'Recomendado' :
                        'Recommended'
            }));

            console.log('✅ Insights generated successfully (rule-based)');

            res.json({
                insights,
                recommendations,
                generatedAt: new Date().toISOString(),
                method: 'rule-based' // Indicates this is not AI-generated
            });

        } catch (error) {
            console.error('Insights generation error:', error.message);

            // Fallback response
            res.json({
                insights: `Performance data is being processed. Please try again in a moment.`,
                recommendations: [],
                generatedAt: new Date().toISOString(),
                method: 'fallback'
            });
        }
    });

    // Helper function (if not already defined elsewhere)
    function formatGameName(gameId) {
        const gameNames = {
            'memoryEcho': 'Memory Echo',
            'multipleChoice': 'Multiple Choice',
            'matchPairs': 'Match Pairs',
            'fillBlank': 'Fill Blank',
            'tapChoice': 'Tap Choice',
            'soundSwipe': 'Sound Swipe',
            'beatClock': 'Beat The Clock',
            'soundDrag': 'Sound Drag',
            'moveMatch': 'Move & Match',
            'simonSquad': 'Hero Freeze',
            'audioDetective': 'Audio Detective',
            'motsMeles': 'Word Search',
            'motsCroises': 'Crossword'
        };
        return gameNames[gameId] || gameId;
    }
};

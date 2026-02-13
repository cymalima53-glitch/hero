// ========== STATE ==========
let data = {
    words: [],
    files: {}, // NEW
    gameConfig: {
        memoryEcho: { questions: [] },
        multipleChoice: { questions: [] },
        matchPairs: { questions: [] },
        fillBlank: { questions: [] },
        tapChoice: { questions: [] },
        motsMeles: { questions: [] },
        motsCroises: { questions: [] }
    }
};
let currentIndex = -1;
let currentLang = 'en';
let currentFileId = ''; // NEW: '' means Master
let activeTab = 'library';

// ========== ELEMENTS ==========
const wordListEl = document.getElementById('word-list');
const editForm = document.getElementById('edit-form');
// ... items ...
const fileSelector = document.getElementById('file-selector'); // NEW
const createFileBtn = document.getElementById('create-file-btn'); // NEW
const deleteFileBtn = document.getElementById('delete-file-btn'); // NEW

// ... existing elements ...
const noSelectionMsg = document.getElementById('no-selection');
const inputWord = document.getElementById('input-word');
const inputAudio = document.getElementById('input-audio');
const inputImage = document.getElementById('input-image');
const inputChoices = document.getElementById('input-choices');
const langSelect = document.getElementById('lang-select');

const searchImgBtn = document.getElementById('search-img-btn');
const imageSearchTerm = document.getElementById('image-search-term');
const imageResults = document.getElementById('image-results');

const loadBtn = document.getElementById('load-btn');
const saveBtn = document.getElementById('save-btn');
const addWordBtn = document.getElementById('add-word-btn');
const deleteBtn = document.getElementById('delete-btn');
const sidebarDeleteBtn = document.getElementById('sidebar-delete-btn');

const viewLibrary = document.getElementById('view-library');
const viewGame = document.getElementById('view-game');
const gameTitle = document.getElementById('game-title');
const gameWordList = document.getElementById('game-word-list');
const selectedCount = document.getElementById('selected-count');

// ========== TABS ==========
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeTab = btn.dataset.tab;

        if (activeTab === 'library') {
            viewLibrary.classList.remove('hidden');
            viewGame.classList.add('hidden');
            renderWordList();
        } else {
            viewLibrary.classList.add('hidden');
            viewGame.classList.remove('hidden');
            renderGameConfig();
        }
    });
});

// ========== FILE FOLDER LOGIC (NEW) ==========
fileSelector.addEventListener('change', (e) => {
    currentFileId = e.target.value;
    renderWordList();

    // Show/Hide Delete Button
    deleteFileBtn.style.display = currentFileId ? 'inline-block' : 'none';
    createFileBtn.style.display = currentFileId ? 'none' : 'inline-block';
});

createFileBtn.addEventListener('click', async () => {
    const name = prompt("New Folder Name (e.g. 'Grade 1 - Animals'):");
    if (!name) return;
    try {
        const res = await fetch(`/api/files/${currentLang}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        await loadData(); // Reload to see new file
    } catch (e) { alert("Failed to create folder"); }
});

deleteFileBtn.addEventListener('click', async () => {
    if (!currentFileId) return;
    if (!confirm("Delete this folder? Words will stay in Master Library.")) return;

    // Optional: User said "Delete file (and optionally words inside)".
    // For simplicity, default to keeping words (deleteWords: false) as that's safer.
    // Or confirm? "Also delete words from library?"

    try {
        await fetch(`/api/files/${currentLang}/${currentFileId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deleteWords: false })
        });
        currentFileId = '';
        deleteFileBtn.style.display = 'none';
        createFileBtn.style.display = 'inline-block';
        await loadData();
    } catch (e) { alert("Failed to delete folder"); }
});

// ========== LOAD ==========
loadBtn.addEventListener('click', loadData);

async function loadData() {
    currentLang = langSelect.value;
    try {
        const response = await fetch(`/data/${currentLang}`);
        if (!response.ok) throw new Error('Failed to load');
        const json = await response.json();

        // Initialize words & files
        data.words = json.words || [];
        data.files = json.files || {}; // NEW

        // ENSURE ALL WORDS HAVE IDs (using crypto.randomUUID)
        let needsMigration = false;
        data.words.forEach(w => {
            if (!w.id) {
                w.id = 'w_' + crypto.randomUUID();
                needsMigration = true;
            }
            // Always trim word text
            if (w.word) w.word = w.word.trim();
        });

        // Build valid ID set for cleanup
        const validIds = new Set(data.words.map(w => w.id));

        // Initialize gameConfig
        data.gameConfig = {
            memoryEcho: { questions: [] },
            multipleChoice: { questions: [] },
            matchPairs: { questions: [] },
            fillBlank: { questions: [] },
            tapChoice: { questions: [], background: '' },
            simonSquad: { questions: [], background: '' } // Added simonSquad init just in case
        };

        // MIGRATE: Convert legacy 'selected' strings to 'questions' IDs
        const oldConfig = json.gameConfig || {};
        Object.keys(data.gameConfig).forEach(gameId => {
            const old = oldConfig[gameId] || {};

            // If questions array exists, use it (filter to valid IDs only)
            if (Array.isArray(old.questions)) {
                data.gameConfig[gameId].questions = old.questions
                    .filter(qId => typeof qId === 'string' && validIds.has(qId));
            }

            // LEGACY MIGRATION: Convert 'selected' strings to IDs
            if (Array.isArray(old.selected) && old.selected.length > 0) {
                old.selected.forEach(wordStr => {
                    const trimmed = (wordStr || '').trim();
                    const found = data.words.find(w => w.word === trimmed);
                    if (found && !data.gameConfig[gameId].questions.includes(found.id)) {
                        data.gameConfig[gameId].questions.push(found.id);
                        needsMigration = true;
                    }
                });
            }
        });

        // If we migrated, save clean schema immediately
        if (needsMigration) {
            console.log('Migration detected, saving clean schema...');
            await saveCleanData();
        }

        // RENDER FILES DROPDOWN
        fileSelector.innerHTML = '<option value="">-- Master Word Library (All) --</option>';
        Object.values(data.files).forEach(f => {
            const opt = document.createElement('option');
            opt.value = f.id;
            opt.textContent = `📁 ${f.name} (${f.wordIds ? f.wordIds.length : 0})`;
            if (f.id === currentFileId) opt.selected = true;
            fileSelector.appendChild(opt);
        });

        // Validate currentFileId
        if (currentFileId && !data.files[currentFileId]) currentFileId = '';
        fileSelector.value = currentFileId;
        deleteFileBtn.style.display = currentFileId ? 'inline-block' : 'none';
        createFileBtn.style.display = currentFileId ? 'none' : 'inline-block';

        renderWordList();

        // Refresh active game view if open
        if (activeTab !== 'library') {
            renderGameConfig();
        }

        showNoSelection();
        console.log('Loaded:', data);
        alert(`Loaded ${currentLang.toUpperCase()} data (${data.words.length} words)`);
    } catch (err) {
        console.error(err);
        alert('Error loading data: ' + err.message);
    }
}

// ========== WORD LIST ==========
function renderWordList() {
    wordListEl.innerHTML = '';

    // Use Set for O(1) lookup
    const allowedIds = currentFileId && data.files[currentFileId]
        ? new Set(data.files[currentFileId].wordIds)
        : null;

    data.words.forEach((item, index) => {
        // FILTER: If file selected, skip if not in file
        if (allowedIds && !allowedIds.has(item.id)) return;

        const li = document.createElement('li');
        li.textContent = item.word || '(No Word)';
        li.dataset.index = index; // For looking up efficiently
        li.addEventListener('click', () => selectItem(index));
        if (index === currentIndex) li.classList.add('active');
        wordListEl.appendChild(li);
    });
}

function selectItem(index) {
    currentIndex = index;
    renderWordList();

    const item = data.words[index];
    inputWord.value = item.word || '';
    inputAudio.value = item.audio || '';
    inputImage.value = item.image || '';
    inputChoices.value = (item.choices || []).join(', ');

    // Game 11 Fields (Action Description)
    document.getElementById('input-ad-instruction').value = item.ad_instruction || '';
    document.getElementById('input-ad-side').value = item.ad_correctSide || 'left';

    // Game 10 Fields (Hero See Hero Do)
    document.getElementById('input-ss-instruction').value = item.ss_instruction || '';
    document.getElementById('input-ss-action').value = item.ss_correctAction || 'freeze';

    editForm.classList.remove('hidden');
    noSelectionMsg.classList.add('hidden');
    imageResults.classList.add('hidden');
    imageSearchTerm.value = item.word || '';
}

function showNoSelection() {
    currentIndex = -1;
    editForm.classList.add('hidden');
    noSelectionMsg.classList.remove('hidden');
    document.querySelectorAll('#word-list .active').forEach(el => el.classList.remove('active'));
}

// ========== UPDATE WORD ==========
function updateCurrentWord() {
    if (currentIndex === -1) return;

    const item = data.words[currentIndex];
    item.word = inputWord.value.trim();
    item.audio = inputAudio.value.trim();
    item.image = inputImage.value.trim();
    item.choices = inputChoices.value.split(',').map(s => s.trim()).filter(s => s);

    // Game 11 Fields (Action Description)
    item.ad_instruction = document.getElementById('input-ad-instruction').value.trim();
    item.ad_correctSide = document.getElementById('input-ad-side').value;

    // Game 10 Fields (Hero See Hero Do)
    item.ss_instruction = document.getElementById('input-ss-instruction').value.trim();
    item.ss_correctAction = document.getElementById('input-ss-action').value;

    // Update list display robustly
    const li = document.querySelector(`#word-list li[data-index="${currentIndex}"]`);
    if (li) li.textContent = item.word || '(No Word)';
}

// Inputs
['input-word', 'input-choices', 'input-image', 'input-audio', 'input-ad-instruction', 'input-ad-side',
    'input-ss-instruction', 'input-ss-action'] // Added SS fields
    .forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateCurrentWord);
    });

// ========== ADD WORD ==========
addWordBtn.addEventListener('click', () => {
    const newWord = {
        id: 'w_' + crypto.randomUUID(),
        word: 'New Word',
        audio: '',
        image: '',
        choices: []
    };
    data.words.push(newWord);

    // Add to current file if selected
    if (currentFileId && data.files[currentFileId]) {
        if (!data.files[currentFileId].wordIds) {
            data.files[currentFileId].wordIds = [];
        }
        data.files[currentFileId].wordIds.push(newWord.id);
    }

    renderWordList();
    selectItem(data.words.length - 1);
});

// ========== DELETE WORD ==========
function deleteCurrentItem() {
    if (currentIndex === -1) return;
    if (!confirm('Delete this word?')) return;

    const wordId = data.words[currentIndex].id;

    // Remove from master list
    data.words.splice(currentIndex, 1);

    // Remove from all game configs
    Object.keys(data.gameConfig).forEach(gameId => {
        const idx = data.gameConfig[gameId].questions.indexOf(wordId);
        if (idx > -1) data.gameConfig[gameId].questions.splice(idx, 1);
    });

    renderWordList();
    showNoSelection();
}

deleteBtn.addEventListener('click', deleteCurrentItem);
if (sidebarDeleteBtn) sidebarDeleteBtn.addEventListener('click', deleteCurrentItem);

// ========== BUILD CLEAN PAYLOAD ==========
function buildCleanPayload() {
    // Build words array with explicit fields
    const cleanWords = data.words.map(w => {
        const word = (w.word || '').trim();
        const choices = (w.choices || []).map(c => c.trim()).filter(c => c);

        // Ensure correct word is in choices (for non-sentence)
        if (word && !word.includes('___') && !choices.includes(word)) {
            choices.unshift(word);
        }

        return {
            id: w.id,
            word: word,
            image: (w.image || '').trim(),
            audio: (w.audio || '').trim(),
            choices: choices
        };
    });

    // Build gameConfig with ONLY questions arrays (IDs only)
    const cleanConfig = {};
    Object.keys(data.gameConfig).forEach(gameId => {
        cleanConfig[gameId] = {
            questions: data.gameConfig[gameId].questions || [],
            background: (data.gameConfig[gameId].background || '').trim() // SAVE BACKGROUND
        };
    });

    return {
        words: cleanWords,
        gameConfig: cleanConfig
    };
}

// Helper for auto-migration save
async function saveCleanData() {
    const payload = buildCleanPayload();
    console.log('AUTO-SAVE CLEAN PAYLOAD:', payload);

    const response = await fetch(`/data/${currentLang}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error('Auto-save failed');
}

// ========== SAVE ==========
saveBtn.addEventListener('click', async () => {
    const payload = buildCleanPayload();

    // FINAL SAFETY CHECK
    console.log('FINAL PAYLOAD:', payload);

    try {
        const response = await fetch(`/data/${currentLang}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error('Failed to save');
        alert('Saved successfully!');
    } catch (err) {
        console.error(err);
        alert('Error saving: ' + err.message);
    }
});

// ========== GAME CONFIG ==========
const GAME_NAMES = {
    memoryEcho: '🧠 Memory Echo',
    multipleChoice: '📝 Multiple Choice',
    matchPairs: '🃏 Match Pairs',
    fillBlank: '✍️ Fill Blank',
    tapChoice: '👆 Tap Choice',
    simonSquad: '🏋️ Hero Freeze'
};

function renderGameConfig() {
    const gameId = activeTab;
    gameTitle.textContent = GAME_NAMES[gameId] || 'Game Settings';
    gameWordList.innerHTML = '';



    const questions = data.gameConfig[gameId]?.questions || [];
    const questionSet = new Set(questions);

    data.words.forEach(word => {
        const div = document.createElement('div');
        div.className = 'game-word-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `check-${word.id}`;
        checkbox.checked = questionSet.has(word.id);
        checkbox.addEventListener('change', () => {
            toggleWordInGame(gameId, word.id, checkbox.checked);
        });

        const label = document.createElement('label');
        label.htmlFor = `check-${word.id}`;
        label.textContent = word.word || '(No Word)';

        div.appendChild(checkbox);
        div.appendChild(label);
        gameWordList.appendChild(div);
    });

    selectedCount.textContent = questions.length;
}

function toggleWordInGame(gameId, wordId, isChecked) {
    if (!data.gameConfig[gameId]) {
        data.gameConfig[gameId] = { questions: [] };
    }

    const questions = data.gameConfig[gameId].questions;
    const idx = questions.indexOf(wordId);

    if (isChecked && idx === -1) {
        questions.push(wordId);
    } else if (!isChecked && idx > -1) {
        questions.splice(idx, 1);
    }

    selectedCount.textContent = questions.length;
}

// ========== CLEAR SELECTION ==========
const clearSelectionBtn = document.getElementById('clear-selection-btn');
if (clearSelectionBtn) {
    clearSelectionBtn.addEventListener('click', () => {
        const gameId = activeTab;
        if (!data.gameConfig[gameId]) return;

        if (confirm(`Clear all selected words for ${GAME_NAMES[gameId]}?`)) {
            // Clear array
            data.gameConfig[gameId].questions = [];

            // Uncheck all boxes
            document.querySelectorAll('#game-word-list input[type="checkbox"]').forEach(cb => {
                cb.checked = false;
            });

            // Update count
            selectedCount.textContent = '0';
        }
    });
}

// ========== IMAGE SEARCH ==========
searchImgBtn.addEventListener('click', async () => {
    const term = imageSearchTerm.value.trim();
    if (!term) return;

    try {
        const res = await fetch(`/api/images?q=${encodeURIComponent(term)}`);
        const json = await res.json();

        imageResults.innerHTML = '';
        imageResults.classList.remove('hidden');

        json.images.forEach(imgUrl => {
            const img = document.createElement('img');
            img.src = imgUrl;
            img.className = 'thumb';
            img.addEventListener('click', () => {
                inputImage.value = imgUrl;
                updateCurrentItem();
                document.querySelectorAll('.thumb').forEach(t => t.classList.remove('selected'));
                img.classList.add('selected');
            });
            imageResults.appendChild(img);
        });
    } catch (err) {
        console.error(err);
        alert('Image search failed.');
    }
});

// ========== IMAGE UPLOAD ==========
const uploadImgBtn = document.getElementById('upload-img-btn');
const fileUploadInput = document.getElementById('file-upload-input');

uploadImgBtn.addEventListener('click', () => {
    fileUploadInput.click();
});

fileUploadInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) { // 5MB Client Check
        alert('File is too large. Max 5MB.');
        return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
        const base64 = reader.result;

        try {
            uploadImgBtn.textContent = 'Uploading...';
            uploadImgBtn.disabled = true;

            const res = await fetch('/api/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image: base64,
                    filename: file.name
                })
            });

            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Upload failed');

            // Success
            inputImage.value = json.url;
            updateCurrentItem();
            alert('Image uploaded successfully: ' + json.url);

        } catch (err) {
            console.error(err);
            alert('Upload error: ' + err.message);
        } finally {
            uploadImgBtn.textContent = 'Upload Ur Image';
            uploadImgBtn.disabled = false;
            fileUploadInput.value = ''; // Reset
        }
    };
    reader.readAsDataURL(file);
});

// ========== INIT ==========
loadData();

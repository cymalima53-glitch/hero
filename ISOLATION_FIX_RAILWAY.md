# Teacher Isolation Fix - Re-Applied with Debug Logging

## Problem
The teacher isolation code was accidentally reverted in `contentRoutes.js`, causing teachers to see each other's words on Railway.

## Solution Applied

### File Modified: `server/contentRoutes.js`

#### 1. GET /data/:lang (Lines 43-70)
**Added:**
- `requireAuth` middleware to secure endpoint
- Teacher email lookup from session
- Word filtering by `teacherId`
- **Debug logging** to track isolation

```javascript
// Get teacher email from session
const teachers = require('fs').readFileSync(require('path').join(__dirname, '../data/teachers.json'), 'utf8');
const teacherData = JSON.parse(teachers).teachers || [];
const teacher = teacherData.find(t => t.id === req.teacherId);
const teacherEmail = teacher ? teacher.email : null;

console.log('[ISOLATION] Teacher email:', teacherEmail);
console.log('[ISOLATION] Total words in file:', data.words.length);

// Filter words by teacherId
const filteredWords = data.words.filter(w => w.teacherId === teacherEmail);

console.log('[ISOLATION] Filtered words for teacher:', filteredWords.length);

res.json({
    words: filteredWords,
    gameConfig: data.gameConfig,
    files: data.files
});
```

#### 2. POST /data/:lang (Lines 72-107)
**Added:**
- Teacher email lookup
- `teacherId` assignment to all words
- Word merging logic (keeps other teachers' words + current teacher's new words)
- **Debug logging** to track saves

```javascript
// Get teacher email
const teachers = require('fs').readFileSync(require('path').join(__dirname, '../data/teachers.json'), 'utf8');
const teacherData = JSON.parse(teachers).teachers || [];
const teacher = teacherData.find(t => t.id === req.teacherId);
const teacherEmail = teacher ? teacher.email : null;

console.log('[ISOLATION] Saving words for teacher:', teacherEmail);
console.log('[ISOLATION] Number of words to save:', newData.words.length);

// Add teacherId to all words
newData.words.forEach(word => {
    word.teacherId = teacherEmail;
});

// Read existing data
const existingData = getData(lang);

// Filter existing words - keep only OTHER teachers' words + new words from current teacher
const otherTeachersWords = existingData.words.filter(w => w.teacherId !== teacherEmail);
const allWords = [...otherTeachersWords, ...newData.words];

console.log('[ISOLATION] Total words after merge:', allWords.length);
```

## Debug Logs to Watch

After deploying to Railway, check the logs for these messages:

### When a teacher loads the editor:
```
[ISOLATION] Teacher email: teacher@example.com
[ISOLATION] Total words in file: 50
[ISOLATION] Filtered words for teacher: 10
```

### When a teacher saves words:
```
[ISOLATION] Saving words for teacher: teacher@example.com
[ISOLATION] Number of words to save: 3
[ISOLATION] Total words after merge: 53
```

## Deployment Steps

1. **Commit and push to GitHub:**
   ```bash
   git add server/contentRoutes.js
   git commit -m "Re-apply teacher isolation with debug logging"
   git push origin main
   ```

2. **Railway will auto-deploy** (if connected to GitHub)

3. **Check Railway logs:**
   - Go to Railway dashboard
   - Click on your service
   - View "Deployments" tab
   - Click latest deployment
   - View logs

4. **Test isolation:**
   - Login as Teacher A
   - Create a word
   - Check logs: Should see `[ISOLATION]` messages
   - Logout, login as Teacher B
   - Should NOT see Teacher A's words
   - Check logs: Should show 0 filtered words for Teacher B

## Verify Data Structure

Check `data/en.json` on Railway to ensure words have `teacherId`:

```json
{
  "words": [
    {
      "id": "w_123",
      "word": "cat",
      "teacherId": "teacher1@example.com"
    },
    {
      "id": "w_456",
      "word": "dog",
      "teacherId": "teacher2@example.com"
    }
  ]
}
```

## If Isolation Still Doesn't Work

1. **Check if old words lack teacherId:**
   - Old words without `teacherId` won't be visible to anyone
   - Solution: Manually add `teacherId` to existing words OR delete old words

2. **Verify requireAuth middleware works:**
   - Check if `req.teacherId` is populated
   - Add log: `console.log('[AUTH] req.teacherId:', req.teacherId);`

3. **Check Railway environment:**
   - Ensure `data/teachers.json` exists
   - Ensure teacher emails match exactly

## Success Criteria

✅ Logs show teacher email being extracted  
✅ Logs show word filtering happening  
✅ Teacher A sees only their words  
✅ Teacher B sees only their words  
✅ No cross-teacher visibility  
✅ New words get `teacherId` assigned automatically

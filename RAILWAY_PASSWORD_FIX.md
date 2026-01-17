# 🚨 URGENT: Password Persistence Issue on Railway

## Problem Diagnosis

### Where Passwords Are Stored
✅ **Location:** `data/teachers.json` (local file system)  
✅ **Format:** Bcrypt hashed passwords (`$2a$10$...`)  
✅ **Current Count:** 5 teacher accounts with passwords

**Example from teachers.json:**
```json
{
  "id": "t_9e4252d4-04f3-493b-8513-5de2dd480a74",
  "email": "breogan51@hotmail.com",
  "passwordHash": "$2a$10$cPXumyOpMUHTO5iFDETIK.NMm6ObTgmSIGKQgk5Q.ZB5jSJrtwAi6",
  "createdAt": "2026-01-04T12:29:53.841Z"
}
```

### Why Passwords Disappear After Deploy

❌ **ROOT CAUSE:** Railway uses **ephemeral file systems**

**What happens:**
1. User registers → password saved to `data/teachers.json` ✅
2. Railway redeploys (new code push) → **entire filesystem is reset** ❌
3. `data/teachers.json` is replaced with the version from GitHub
4. All new registrations are **LOST**

**Railway Filesystem Behavior:**
- Each deployment creates a **fresh container**
- Files written during runtime are **NOT persisted**
- Only files in the GitHub repo are included
- `data/` folder gets reset to repo state on every deploy

### Current File Structure
```
data/
├── teachers.json          ← GETS RESET ON DEPLOY
├── students.json          ← GETS RESET ON DEPLOY
├── en.json               ← GETS RESET ON DEPLOY
├── fr.json               ← GETS RESET ON DEPLOY
├── auth_sessions.json    ← GETS RESET ON DEPLOY
└── sessions/             ← GETS RESET ON DEPLOY
```

## Solutions

### Option 1: Use Railway Persistent Volumes (RECOMMENDED)

**Pros:**
- ✅ Data persists across deploys
- ✅ No code changes needed
- ✅ Works with current file-based system

**Steps:**
1. Go to Railway dashboard
2. Click on your service
3. Go to "Variables" tab
4. Add a volume:
   - **Mount Path:** `/app/data`
   - **Size:** 1GB (free tier allows up to 1GB)
5. Redeploy

**After setup:**
- `data/` folder will persist across deploys
- Teacher registrations will survive
- All data files will be preserved

### Option 2: Use PostgreSQL Database (BETTER LONG-TERM)

**Pros:**
- ✅ Proper database solution
- ✅ Better for production
- ✅ Railway offers free PostgreSQL

**Cons:**
- ❌ Requires code refactoring
- ❌ Need to migrate from JSON files
- ❌ More complex setup

**Steps:**
1. Add PostgreSQL to Railway project
2. Install `pg` package: `npm install pg`
3. Create database schema
4. Migrate authRoutes.js to use database
5. Migrate data from JSON files

### Option 3: Commit Data Files (TEMPORARY FIX)

**Pros:**
- ✅ Quick fix
- ✅ No Railway config needed

**Cons:**
- ❌ Passwords in Git (security risk)
- ❌ Merge conflicts on every deploy
- ❌ Not scalable

**Steps:**
1. Remove `data/` from `.gitignore`
2. Commit `data/teachers.json`
3. Push to GitHub

**⚠️ NOT RECOMMENDED** - Passwords should never be in Git, even if hashed

## Immediate Action Required

### Quick Fix (Use This Now)

1. **Add Railway Volume:**
   ```
   Railway Dashboard → Your Service → Variables → Add Volume
   Mount Path: /app/data
   Size: 1GB
   ```

2. **Verify volume is mounted:**
   - Check Railway logs after deploy
   - Should see: "Volume mounted at /app/data"

3. **Test:**
   - Register a new teacher
   - Trigger a redeploy
   - Try to login → should still work ✅

### Long-Term Fix (Plan This)

1. **Migrate to PostgreSQL**
2. **Create proper database schema**
3. **Add database migrations**
4. **Remove JSON file dependencies**

## Verification Steps

### After Adding Volume:

1. **Register a test account:**
   ```
   Email: test@example.com
   Password: TestPass123
   ```

2. **Check file was created:**
   - Railway logs should show file write
   - `data/teachers.json` should have new entry

3. **Trigger redeploy:**
   - Push a small change to GitHub
   - Wait for Railway to redeploy

4. **Test login:**
   - Try logging in with test@example.com
   - Should work ✅ (if volume is configured)
   - Will fail ❌ (if no volume)

## Files Affected by This Issue

All files in `data/` folder:
- ❌ `teachers.json` - Teacher accounts & passwords
- ❌ `students.json` - Student accounts
- ❌ `en.json` - English words (with teacherId)
- ❌ `fr.json` - French words (with teacherId)
- ❌ `auth_sessions.json` - Active sessions
- ❌ `sessions/*.json` - Game sessions
- ❌ `assignments.json` - Student assignments

**ALL OF THESE GET RESET ON EVERY DEPLOY WITHOUT PERSISTENT STORAGE**

## Summary

🔴 **Problem:** Railway's ephemeral filesystem deletes all data on redeploy  
🟢 **Solution:** Add Railway persistent volume at `/app/data`  
⏱️ **Time to Fix:** 5 minutes  
💰 **Cost:** Free (1GB included in free tier)

**DO THIS NOW before next deploy to prevent losing all teacher accounts!**

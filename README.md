# Spanish Writing Practice

Presentational writing practice for Spanish 4CP, Spanish 4H and Spanish 5. Students write three prompts, get ARC-aligned feedback, revise, and reflect. You see everything in a password-protected dashboard.

Every estimate is labeled **"AI practice estimate—not an official AAPPL score."**

---

## 1. Before you start

**Check with your district first.** Student writing is sent to Anthropic's API for feedback. Student names are never sent. Many Massachusetts districts require a signed student data privacy agreement before an online service receives student work. Ask your technology office whether one is needed.

**You need three things:**

1. **A host.** These instructions use Render (render.com).
2. **An Anthropic API key**, from console.anthropic.com. Add a payment method and set a monthly spending limit.
3. **A GitHub account**, so Render can read the code.

## 2. Setup (about 20 minutes)

1. Create a new **private** GitHub repository and upload the contents of this folder.
2. In Render, choose **New → Blueprint** and select the repository. Render reads `render.yaml` and creates:
   - an always-on web service
   - a 1 GB disk that stores all student work
3. When Render asks for values, enter:
   - **TEACHER_PASSWORD**: a long password of your choosing (at least 10 characters).
   - **ANTHROPIC_API_KEY**: your API key.
   - `APP_SECRET` is generated for you automatically.
4. Deploy. Render gives you an address such as `https://spanish-writing-practice.onrender.com`.
5. **Check the evaluator once before students use it.** In the service's **Shell** tab, run:

   ```
   npm run calibrate
   ```

   This rates six sample texts with the real AI and checks the rules you set:
   - short accurate writing is not rated below long repetitive writing
   - isolated past-tense verbs earn no Advanced evidence
   - a strong paragraph does earn Advanced evidence
   - English and injected instructions are not rewarded
   - repeated ratings are stable

   One run costs about 10–20¢.

Any host that runs Node.js 22.13 or later with a persistent disk will also work. Set the same environment variables listed in `.env.example`. A school-owned server is fine too.

## 3. Teacher access

Go to **`/teacher`** on your site (for example `https://…onrender.com/teacher`) and sign in with your password. You stay signed in for 12 hours on that browser.

**Activities & class codes tab**
- **Create class code**: makes one activity per class, each with its own 6-character code. Set the suggested minutes per prompt (default 12), or turn the timer off.
- **Close / Reopen**: closing stops new saving and submitting; students can still read their feedback.
- **New code**: replaces a leaked code.
- **Assign again**: starts a new round with a new code. Earlier rounds are kept untouched.
- **Roster (optional)**: paste names so students who haven't started appear as "not started."
- **Delete**: removes the activity and all its work. You must type `DELETE` to confirm.

**Student work tab**
- **Filters**: class, activity, prompt, status and student name.
- **Quick buttons**: *Not submitted*, *Revised* and *Feedback ready*.
- **Export CSV**: names, classes, activity, prompt, status, timestamps, AI estimates, revision count and focus, teacher ratings, and rubric and evaluator versions. It follows the current filters.
- **Download writing & feedback**: one printable page per student, with initial writing, feedback, revisions, reflections and your notes.
- **Click any row** to see everything together for that student:
  - **Teacher review**: add your own ARC rating and/or a note. These are stored separately; the AI estimate is never changed.
  - **New return code**: for a student who forgot theirs. The code is shown once.
  - **Delete student**: removes the student and all their work.

Participation evidence is limited to saved drafts, submissions and revisions, each with a timestamp. The app does not track open tabs or time on page.

## 4. Student access

Give students the site address (not `/teacher`) and their class code.

**First visit:** students enter their first and last name, choose their class, and type the class code. They then receive a personal **return code**, such as `MANGO-4821`, and should write it down.

**Coming back:** students choose **"I've been here before"** and enter their name, class, class code and return code. This works on any computer, so the three prompts can be finished over several days. Two students with the same name stay separate because their return codes differ.

**While writing:**
- Prompts and directions are in English; students write in Spanish.
- Work saves automatically, with a visible "Saving… / Saved" indicator.
- If the connection drops, a copy is kept on the device and saved when the connection returns.
- Accent buttons (á é í ó ú ü ñ ¿ ¡, plus a capital-letter key) insert characters at the cursor.
- The suggested timer only informs. Nothing is erased or submitted when it runs out.
- The word count is small and has no minimum.

**After submitting:**
1. A green banner confirms "Your teacher received your first version."
2. Feedback usually arrives within a minute. If the AI service is down, the student sees **"Feedback pending"** with a *Try again* button. The work is already saved and visible to you. The server also retries automatically.
3. The student chooses one focus and revises in a separate version. The first version is kept exactly as submitted, and the database refuses any change to it.
4. The student completes the reflection: "One change I made was ____. It helped my reader because ____."
5. The student sees what improved and what still needs work, clearly labeled "after feedback (supported)." Up to 3 revisions per prompt are allowed.
6. After all three first versions have feedback, an **overall practice estimate** appears. It is based on the three first versions only, never on revisions.

## 5. How the estimates work

**Rubric source.** The evaluator uses the AAPPL Rating Criteria (ARC), Fall 2018 revision, from your "AAPPL Rating Guide – All Levels." It applies Presentational Writing criteria at the Novice, Intermediate and Advanced levels. The Intermediate criterion about asking questions is excluded because these prompts don't require questions.

**Two separate steps.**
- **Rating step:** the AI never sees the student's class, so identical writing always gets the identical estimate. Ratings are also cached by exact text.
- **Coaching step:** this step uses the course target only to decide what to coach next:
  - Spanish 4CP: Intermediate Mid
  - Spanish 4H: Intermediate High
  - Spanish 5: Advanced Low

**Server-side checks.** Before any AI output is saved or shown, the server checks it and rejects it if:
- any quotation isn't word-for-word from the student's writing
- an Advanced rating lacks consistent paragraph production, narration, detailed description, and use of past, present and future
- an A-SE rating has no paragraph evidence
- the levels are inconsistent (for example, Advanced evidence without Intermediate at level)
- an insufficient-evidence response carries an at-level rating

A rejected output is retried once. If it fails again, the student sees "Feedback pending."

**What students see.** An ARC category, such as "Intermediate — Meets Fully (I-MF), with some Advanced evidence (A-SE)," plus how much evidence supports it. Empty, English, off-topic or very short work shows "Insufficient evidence" instead of a forced rating.

**No I-1…I-5 or A-1 scores.** Converting ARC categories to reported AAPPL scores requires a verified scoring crosswalk, and the app does not invent one. If you obtain a verified crosswalk from ACTFL/LTI, it can be added.

**Versioning.** Every estimate records the rubric version (`ARC-2018-PW-v1`), the evaluator version and the AI model.

**Privacy.** Only the prompt, the student's writing, the rubric and the course target are sent to the AI. Student writing is treated as data; instructions inside it are ignored.

## 6. Costs

**Hosting (Render):** about **$7.25/month**.
- $7 for the smallest always-on instance (required for a persistent disk)
- $0.25 for the 1 GB disk, which holds thousands of responses
- the Hobby workspace is free

**AI (Claude Sonnet 5.5, $2 per million input tokens / $10 per million output tokens).** These are estimates; check actual use in the Anthropic console.

| Item | Approximate cost |
|---|---|
| Each first-version feedback | about 3–4¢ |
| Each revision comparison | about 3¢ |
| Each overall estimate | about 2¢ |
| One student, full round (3 prompts, overall, ~2 revisions) | about 15–25¢ |
| 100 students, one round | about $15–25 |

## 7. Backups

All data lives in one SQLite file on the disk (`/var/data/writing.db`). Two options:
- Turn on Render's disk snapshots.
- Download it periodically from the Shell, for example with `sqlite3 /var/data/writing.db ".backup /var/data/backup.db"`.

The CSV and the writing download are also good end-of-unit records.

## 8. For developers

```
npm install
npm test            # 20 automated checks with a test-only AI stand-in
npm run calibrate   # evaluator checks against the real AI (needs ANTHROPIC_API_KEY)
TEACHER_PASSWORD=... APP_SECRET=... ANTHROPIC_API_KEY=... npm start
```

The only dependency is Express. The database uses Node's built-in SQLite.

**Security.**
- Teacher and student sessions are HttpOnly cookies.
- Every student query is scoped to the signed-in student on the server.
- Teacher routes require the teacher session; a class code alone grants nothing there.
- Logins are rate-limited.
- State-changing requests need a same-origin header.
- CSV export neutralizes spreadsheet formulas.

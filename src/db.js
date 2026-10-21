import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  class_name TEXT NOT NULL,
  class_code TEXT NOT NULL UNIQUE,
  is_open INTEGER NOT NULL DEFAULT 1,
  timer_minutes INTEGER,                -- NULL = timer disabled
  round INTEGER NOT NULL DEFAULT 1,
  previous_assignment_id TEXT,
  roster TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,                  -- stable identifier
  display_name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  class_name TEXT NOT NULL,
  return_code_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS students_name ON students(name_key, class_name);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('student','teacher')),
  student_id TEXT REFERENCES students(id) ON DELETE CASCADE,
  assignment_id TEXT REFERENCES assignments(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS responses (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  prompt_no INTEGER NOT NULL CHECK (prompt_no BETWEEN 1 AND 3),
  draft_text TEXT NOT NULL DEFAULT '',
  draft_client_ts INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  last_saved_at TEXT,
  initial_text TEXT,                    -- immutable once set
  initial_word_count INTEGER,
  submitted_at TEXT,
  UNIQUE (student_id, assignment_id, prompt_no)
);

-- The initial submission can never be changed or cleared.
CREATE TRIGGER IF NOT EXISTS initial_text_immutable
BEFORE UPDATE OF initial_text, submitted_at ON responses
WHEN OLD.initial_text IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'initial submission is immutable'); END;

CREATE TABLE IF NOT EXISTS revisions (
  id TEXT PRIMARY KEY,
  response_id TEXT NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  focus TEXT NOT NULL,
  draft_text TEXT NOT NULL DEFAULT '',
  draft_client_ts INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  last_saved_at TEXT,
  submitted_text TEXT,
  submitted_at TEXT,
  reflection_change TEXT,
  reflection_reader TEXT,
  UNIQUE (response_id, number)
);
CREATE TRIGGER IF NOT EXISTS revision_text_immutable
BEFORE UPDATE OF submitted_text ON revisions
WHEN OLD.submitted_text IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'submitted revision is immutable'); END;

-- AI evaluations. kind: initial | revision | overall
CREATE TABLE IF NOT EXISTS evaluations (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('initial','revision','overall')),
  response_id TEXT REFERENCES responses(id) ON DELETE CASCADE,
  revision_id TEXT REFERENCES revisions(id) ON DELETE CASCADE,
  student_id TEXT REFERENCES students(id) ON DELETE CASCADE,
  assignment_id TEXT REFERENCES assignments(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending','ready','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  result_json TEXT,
  estimate_code TEXT,
  estimate_label TEXT,
  rubric_version TEXT NOT NULL,
  evaluator_version TEXT NOT NULL,
  model TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS one_initial_eval ON evaluations(response_id) WHERE kind='initial';
CREATE UNIQUE INDEX IF NOT EXISTS one_revision_eval ON evaluations(revision_id) WHERE kind='revision';
CREATE UNIQUE INDEX IF NOT EXISTS one_overall_eval ON evaluations(student_id, assignment_id) WHERE kind='overall';

-- Same text + same prompt + same evaluator → same rating, whatever the class.
CREATE TABLE IF NOT EXISTS rating_cache (
  hash TEXT PRIMARY KEY,
  rating_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Teacher judgments live separately from AI estimates; nothing here overwrites them.
CREATE TABLE IF NOT EXISTS teacher_reviews (
  id TEXT PRIMARY KEY,
  response_id TEXT REFERENCES responses(id) ON DELETE CASCADE,
  student_id TEXT REFERENCES students(id) ON DELETE CASCADE,
  assignment_id TEXT REFERENCES assignments(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('response','overall')),
  teacher_rating TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);
  return db;
}

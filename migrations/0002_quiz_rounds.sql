-- MADAGASCAR EARN V2: fitahirizana sy fiarovana ny lalao Quiz.
-- Alefaso indray mandeha ao amin'ny D1 PRODUCTION: madagascar-earn-v2.
-- Aza alefa amin'ny Preview database.
CREATE TABLE IF NOT EXISTS quiz_rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  day_key TEXT NOT NULL,
  round_no INTEGER NOT NULL CHECK (round_no BETWEEN 1 AND 3),
  questions_json TEXT NOT NULL,
  answer_key_json TEXT NOT NULL,
  choices_json TEXT,
  score INTEGER CHECK (score BETWEEN 0 AND 5),
  status TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started','completed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE (user_id, day_key, round_no)
);
CREATE INDEX IF NOT EXISTS idx_quiz_rounds_user_day
ON quiz_rounds(user_id, day_key);

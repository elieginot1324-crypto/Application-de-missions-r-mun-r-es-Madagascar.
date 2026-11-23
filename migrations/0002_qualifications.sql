-- MADAGASCAR EARN V2: antontan-taratasy sy fepetra takian'ny iraka.
-- Alefa amin'ny D1 Preview ihany aloha alohan'ny fampiasana ireo API vaovao.
CREATE TABLE IF NOT EXISTS worker_qualifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  worker_id INTEGER NOT NULL,
  document_type TEXT NOT NULL CHECK (document_type IN ('cv','diploma','certificate','portfolio')),
  file_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL CHECK (file_size > 0 AND file_size <= 5242880),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_note TEXT,
  reviewed_by INTEGER,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (worker_id) REFERENCES users(id),
  FOREIGN KEY (reviewed_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_worker_qualifications_worker
  ON worker_qualifications(worker_id, status);
CREATE INDEX IF NOT EXISTS idx_worker_qualifications_review
  ON worker_qualifications(status, created_at);

ALTER TABLE missions ADD COLUMN required_qualification TEXT NOT NULL DEFAULT 'none'
  CHECK (required_qualification IN ('none','diploma','certificate','portfolio'));

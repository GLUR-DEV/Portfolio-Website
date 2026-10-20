-- Adds spam-filter and email-alert tracking to the messages table.
-- Safe to apply before deploying the new code: every new column has a default,
-- so the old code keeps working until the new one goes live.
ALTER TABLE messages ADD COLUMN status TEXT NOT NULL DEFAULT 'ok';    -- ok | review | spam
ALTER TABLE messages ADD COLUMN score INTEGER NOT NULL DEFAULT 0;     -- spam-filter points
ALTER TABLE messages ADD COLUMN reasons TEXT;                         -- why points were added
ALTER TABLE messages ADD COLUMN ip_hash TEXT;                         -- hashed IP, for rate limiting only
ALTER TABLE messages ADD COLUMN alerted INTEGER NOT NULL DEFAULT 0;   -- 1 once the alert email was sent

CREATE INDEX idx_messages_ip_time ON messages (ip_hash, created_at);

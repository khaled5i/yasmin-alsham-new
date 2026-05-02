-- Migration 45: Walk-in Queue System (نظام حجز الدور)

CREATE TABLE IF NOT EXISTS walk_in_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_name TEXT NOT NULL,
  visit_reason TEXT NOT NULL,
  -- 'tailoring' | 'alteration_ours' | 'alteration_other' | 'pickup' | 'other'
  phone TEXT,
  status TEXT DEFAULT 'waiting',
  -- 'waiting' | 'called' | 'done' | 'removed'
  session_token TEXT NOT NULL UNIQUE,
  notification_count INT DEFAULT 0,
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by session_token (customer page)
CREATE INDEX IF NOT EXISTS idx_walk_in_queue_session_token ON walk_in_queue(session_token);

-- Index for today's active queue (admin page)
CREATE INDEX IF NOT EXISTS idx_walk_in_queue_created_at_status ON walk_in_queue(created_at, status);

-- Enable Realtime so customer page receives push updates instantly
ALTER PUBLICATION supabase_realtime ADD TABLE walk_in_queue;

-- RLS
ALTER TABLE walk_in_queue ENABLE ROW LEVEL SECURITY;

-- Anyone (including unauthenticated) can insert a new queue entry
CREATE POLICY "Anyone can join walk_in_queue"
  ON walk_in_queue FOR INSERT
  WITH CHECK (true);

-- Anyone can read queue entries (session_token is the only identifier)
CREATE POLICY "Anyone can read walk_in_queue"
  ON walk_in_queue FOR SELECT
  USING (true);

-- Only authenticated users (admin) can update queue entries
CREATE POLICY "Admin can update walk_in_queue"
  ON walk_in_queue FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Only authenticated users (admin) can delete queue entries
CREATE POLICY "Admin can delete walk_in_queue"
  ON walk_in_queue FOR DELETE
  USING (auth.role() = 'authenticated');

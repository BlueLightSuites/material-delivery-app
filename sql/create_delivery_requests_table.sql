-- Create delivery_requests table
CREATE TABLE IF NOT EXISTS delivery_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pickup_address TEXT NOT NULL,
  pickup_lat NUMERIC,
  pickup_lng NUMERIC,
  dropoff_address TEXT NOT NULL,
  dropoff_lat NUMERIC,
  dropoff_lng NUMERIC,
  material_category TEXT NOT NULL,
  material_weight NUMERIC NOT NULL,
  material_unit TEXT NOT NULL,
  requires_trailer BOOLEAN DEFAULT FALSE,
  notes TEXT,
  status TEXT DEFAULT 'pending',
  assigned_driver_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on auth_id for faster queries
CREATE INDEX IF NOT EXISTS idx_delivery_requests_auth_id ON delivery_requests(auth_id);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_delivery_requests_status ON delivery_requests(status);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_delivery_requests_created_at ON delivery_requests(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE delivery_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own requests
CREATE POLICY "Users can view their own delivery requests"
  ON delivery_requests
  FOR SELECT
  USING (auth_id = auth.uid());

-- RLS Policy: Users can create requests (insert)
CREATE POLICY "Users can create delivery requests"
  ON delivery_requests
  FOR INSERT
  WITH CHECK (auth_id = auth.uid());

-- RLS Policy: Users can update their own requests
CREATE POLICY "Users can update their own delivery requests"
  ON delivery_requests
  FOR UPDATE
  USING (auth_id = auth.uid())
  WITH CHECK (auth_id = auth.uid());

-- RLS Policy: Users can delete their own requests (if status is still pending)
CREATE POLICY "Users can delete their own pending requests"
  ON delivery_requests
  FOR DELETE
  USING (auth_id = auth.uid() AND status = 'pending');

-- Optional: Add trigger to auto-update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_delivery_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER delivery_requests_updated_at_trigger
  BEFORE UPDATE ON delivery_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_delivery_requests_updated_at();

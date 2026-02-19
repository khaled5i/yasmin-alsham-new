-- Add supplier_id and supplier_name columns to expenses table if they don't exist

DO $$ 
BEGIN 
    -- supplier_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'supplier_id') THEN 
        ALTER TABLE expenses ADD COLUMN supplier_id UUID NULL;
    END IF;

    -- supplier_name
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'supplier_name') THEN 
        ALTER TABLE expenses ADD COLUMN supplier_name TEXT NULL;
    END IF;
END $$;

-- Add optional ballot/grade criteria columns for escrow deposits.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'deposits'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'deposits' AND column_name = 'required_ballot_id'
    ) THEN
      ALTER TABLE public.deposits ADD COLUMN required_ballot_id TEXT;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'deposits' AND column_name = 'required_grade'
    ) THEN
      ALTER TABLE public.deposits ADD COLUMN required_grade SMALLINT;
    END IF;
  END IF;
END$$;

-- Profile fields on tenant users (Ajustes de cuenta). Safe if columns already exist from db push.
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT;

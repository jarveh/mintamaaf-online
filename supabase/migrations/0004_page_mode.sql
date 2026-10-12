-- Generation mode per page: 'guided' (the app art-directs a one-page note) or
-- 'freestyle' (the creator's prompt is the design brief sent to Stitch).
-- Existing rows keep 'guided' via the default; job-runner reads this column to
-- pick the prompt template, so revises inherit the page's mode automatically.
alter table pages add column if not exists mode text not null default 'guided';
-- This project's database already had a hand-added `mode` column with default
-- 'crafted'; align the default WITHOUT rewriting any existing row values
-- (the app reads anything other than 'freestyle' as guided).
alter table pages alter column mode set default 'guided';

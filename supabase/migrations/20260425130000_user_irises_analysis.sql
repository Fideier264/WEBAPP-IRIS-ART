-- Persist color analysis on each saved iris so gallery re-opens never re-run Gemini.

alter table public.user_irises
  add column if not exists analysis jsonb null;

comment on column public.user_irises.analysis is
  'Frozen IrisAnalysis JSON from first Color Analyzer run; gallery reuses this instead of re-invoking iris-analyze.';

-- Refonte du moteur créatif : métadonnées de génération + suivi des crédits vidéo.
--
-- 1) credit_transaction_id : permet de finaliser le débit de crédits uniquement
--    quand une vidéo aboutit (reserve → complete) ou de rembourser quand elle
--    échoue (reserve → refund). Aujourd'hui le débit est fait à la soumission,
--    ce qui facture des générations jamais terminées.
-- 2) metadata : stocke le brief créatif, le workflow et le modèle utilisés pour
--    pouvoir analyser plus tard quelles configurations produisent les meilleures
--    créations.

alter table public.studio_generations
  add column if not exists credit_transaction_id uuid,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists studio_generations_credit_txn_idx on public.studio_generations(credit_transaction_id);
-- Compatibilidade para bancos criados antes da coluna report_snapshot.
-- Preserva todos os relatórios existentes e pode ser executado mais de uma vez.

begin;

alter table public.financial_reports
  add column if not exists report_snapshot jsonb;

update public.financial_reports
set report_snapshot = '{}'::jsonb
where report_snapshot is null;

alter table public.financial_reports
  alter column report_snapshot set default '{}'::jsonb,
  alter column report_snapshot set not null;

commit;

select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'financial_reports'
  and column_name = 'report_snapshot';

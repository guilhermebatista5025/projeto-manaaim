-- PDV Manaaim - schema inicial para Supabase/PostgreSQL
-- Execute como migration ou pelo SQL Editor de um projeto novo.

begin;

create extension if not exists pgcrypto;
create schema if not exists private;
create type public.app_role as enum ('admin', 'gerente', 'caixa', 'consulta');
create type public.sale_status as enum ('concluida', 'cancelada');
create type public.payment_method as enum ('dinheiro', 'pix', 'debito', 'credito', 'outro');
create type public.cash_status as enum ('aberto', 'fechado');
create type public.stock_movement_type as enum (
  'estoque_inicial', 'entrada', 'venda', 'cancelamento_venda',
  'ajuste_positivo', 'ajuste_negativo', 'perda'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null check (char_length(trim(nome)) between 2 and 120),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(trim(nome)) between 2 and 120),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'consulta',
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.store_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  abertura time not null default '07:30',
  fechamento time not null default '00:00',
  usar_horario_padrao boolean not null default true,
  taxa_padrao numeric(5,4) not null default 0.1000 check (taxa_padrao between 0 and 1),
  estoque_baixo integer not null default 7 check (estoque_baixo >= 0),
  estoque_critico integer not null default 3 check (estoque_critico >= 0),
  updated_at timestamptz not null default now()
);

-- O nome foi mantido para facilitar a migração do localStorage. No sistema atual,
-- "vendedor" também representa o fornecedor/responsável pelos produtos.
create table public.vendedores (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  nome text not null check (char_length(trim(nome)) between 2 and 120),
  taxa numeric(5,4) not null default 0.1000 check (taxa between 0 and 1),
  ativo boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, nome),
  unique (organization_id, id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  nome text not null check (char_length(trim(nome)) between 1 and 80),
  cor text,
  icone text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, nome),
  unique (organization_id, id)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  vendedor_id uuid not null,
  category_id uuid,
  nome text not null check (char_length(trim(nome)) between 1 and 160),
  sku text,
  preco numeric(12,2) not null check (preco >= 0),
  estoque_atual integer not null default 0 check (estoque_atual >= 0),
  estoque_inicial integer not null default 0 check (estoque_inicial >= 0),
  ativo boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, sku),
  unique (organization_id, id),
  unique (organization_id, vendedor_id, nome),
  foreign key (organization_id, vendedor_id)
    references public.vendedores(organization_id, id) on delete restrict,
  foreign key (organization_id, category_id)
    references public.categories(organization_id, id) on delete restrict
);

create table public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  opened_by uuid not null references auth.users(id),
  closed_by uuid references auth.users(id),
  status public.cash_status not null default 'aberto',
  opening_amount numeric(12,2) not null default 0 check (opening_amount >= 0),
  closing_amount numeric(12,2) check (closing_amount >= 0),
  expected_amount numeric(12,2),
  difference_amount numeric(12,2),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check (
    (status = 'aberto' and closed_at is null)
    or (status = 'fechado' and closed_at is not null and closing_amount is not null)
  )
);

create unique index cash_sessions_one_open_per_org
  on public.cash_sessions (organization_id)
  where status = 'aberto';

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cash_session_id uuid not null,
  vendedor_id uuid not null,
  operator_id uuid not null references auth.users(id),
  status public.sale_status not null default 'concluida',
  payment_method public.payment_method not null default 'dinheiro',
  total numeric(12,2) not null check (total >= 0),
  received_amount numeric(12,2) not null check (received_amount >= 0),
  change_amount numeric(12,2) not null default 0 check (change_amount >= 0),
  sold_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id),
  cancellation_reason text,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, cash_session_id)
    references public.cash_sessions(organization_id, id) on delete restrict,
  foreign key (organization_id, vendedor_id)
    references public.vendedores(organization_id, id) on delete restrict,
  check (
    (status = 'concluida' and cancelled_at is null)
    or (status = 'cancelada' and cancelled_at is not null and cancelled_by is not null)
  )
);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  sale_id uuid not null,
  product_id uuid not null,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  subtotal numeric(12,2) generated always as (quantity * unit_price) stored,
  created_at timestamptz not null default now(),
  foreign key (organization_id, sale_id)
    references public.sales(organization_id, id) on delete restrict,
  foreign key (organization_id, product_id)
    references public.products(organization_id, id) on delete restrict
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null,
  sale_id uuid,
  movement_type public.stock_movement_type not null,
  quantity_delta integer not null check (quantity_delta <> 0),
  stock_before integer not null check (stock_before >= 0),
  stock_after integer not null check (stock_after >= 0),
  reason text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (organization_id, product_id)
    references public.products(organization_id, id) on delete restrict,
  foreign key (organization_id, sale_id)
    references public.sales(organization_id, id) on delete restrict,
  check (stock_after = stock_before + quantity_delta)
);

create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cash_session_id uuid not null,
  kind text not null check (kind in ('suprimento', 'sangria')),
  amount numeric(12,2) not null check (amount > 0),
  description text not null check (char_length(trim(description)) > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (organization_id, cash_session_id)
    references public.cash_sessions(organization_id, id) on delete restrict
);

-- Persiste os valores hoje mantidos apenas em memória por relatorio-financeiro.js.
create table public.financial_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cash_session_id uuid,
  period_start timestamptz not null,
  period_end timestamptz not null,
  fichas_cantina numeric(12,2) not null default 0 check (fichas_cantina >= 0),
  fichas_fornecedores numeric(12,2) not null default 0 check (fichas_fornecedores >= 0),
  bruto_cantina numeric(12,2) not null default 0 check (bruto_cantina >= 0),
  caixa_inicial numeric(12,2) not null default 0 check (caixa_inicial >= 0),
  valor_pix numeric(12,2) not null default 0 check (valor_pix >= 0),
  caixa_final numeric(12,2) not null default 0 check (caixa_final >= 0),
  taxa_aplicada numeric(5,4) not null default 0.1000 check (taxa_aplicada between 0 and 1),
  report_snapshot jsonb not null default '{}'::jsonb,
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, cash_session_id)
    references public.cash_sessions(organization_id, id) on delete restrict,
  check (period_end > period_start)
);

create index vendedores_org_idx on public.vendedores(organization_id, ativo);
create index categories_org_idx on public.categories(organization_id, ativo);
create index products_org_vendor_idx on public.products(organization_id, vendedor_id, ativo);
create index products_org_stock_idx on public.products(organization_id, estoque_atual) where ativo;
create index sales_org_date_idx on public.sales(organization_id, sold_at desc);
create index sales_vendor_date_idx on public.sales(vendedor_id, sold_at desc);
create index sales_cash_session_idx on public.sales(cash_session_id);
create index sale_items_sale_idx on public.sale_items(sale_id);
create index sale_items_product_idx on public.sale_items(product_id);
create index inventory_product_date_idx on public.inventory_movements(product_id, created_at desc);
create index cash_sessions_org_date_idx on public.cash_sessions(organization_id, opened_at desc);
create index financial_reports_org_period_idx on public.financial_reports(organization_id, period_start, period_end);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function private.set_updated_at();
create trigger organizations_set_updated_at before update on public.organizations
for each row execute function private.set_updated_at();
create trigger settings_set_updated_at before update on public.store_settings
for each row execute function private.set_updated_at();
create trigger vendedores_set_updated_at before update on public.vendedores
for each row execute function private.set_updated_at();
create trigger categories_set_updated_at before update on public.categories
for each row execute function private.set_updated_at();
create trigger products_set_updated_at before update on public.products
for each row execute function private.set_updated_at();
create trigger cash_sessions_set_updated_at before update on public.cash_sessions
for each row execute function private.set_updated_at();
create trigger financial_reports_set_updated_at before update on public.financial_reports
for each row execute function private.set_updated_at();

create or replace function private.prepare_new_product()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.estoque_inicial = new.estoque_atual;
  return new;
end;
$$;

create trigger products_prepare_initial_stock
before insert on public.products
for each row execute function private.prepare_new_product();

create or replace function private.log_new_product_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.estoque_atual > 0 then
    insert into public.inventory_movements (
      organization_id, product_id, movement_type, quantity_delta,
      stock_before, stock_after, reason, created_by
    ) values (
      new.organization_id, new.id, 'estoque_inicial', new.estoque_atual,
      0, new.estoque_atual, 'Cadastro do produto', new.created_by
    );
  end if;
  return new;
end;
$$;

create trigger products_log_initial_stock
after insert on public.products
for each row execute function private.log_new_product_stock();

create or replace function private.set_created_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_by = (select auth.uid());
  return new;
end;
$$;

create trigger vendedores_set_created_by
before insert on public.vendedores
for each row execute function private.set_created_by();
create trigger products_set_created_by
before insert on public.products
for each row execute function private.set_created_by();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, nome)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

create or replace function private.bootstrap_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.organization_members (organization_id, user_id, role)
  values (new.id, new.created_by, 'admin');

  insert into public.store_settings (organization_id)
  values (new.id);

  insert into public.categories (organization_id, nome, cor, icone)
  values
    (new.id, 'Bebidas', '#1a56db', 'fa-wine-bottle'),
    (new.id, 'Bolos', '#d97706', 'fa-cake-candles'),
    (new.id, 'Doces', '#e74694', 'fa-candy-cane'),
    (new.id, 'Gelados', '#0ea5e9', 'fa-ice-cream'),
    (new.id, 'Salgados', '#f97316', 'fa-burger'),
    (new.id, 'Outros', '#6b7494', 'fa-box');
  return new;
end;
$$;

create trigger organizations_bootstrap
after insert on public.organizations
for each row execute function private.bootstrap_organization();

create or replace function private.is_org_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.ativo
  );
$$;

create or replace function private.has_org_role(p_organization_id uuid, p_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.ativo
      and m.role = any(p_roles)
  );
$$;

revoke all on schema private from public;
grant usage on schema private to authenticated;
revoke execute on function private.is_org_member(uuid) from public;
revoke execute on function private.has_org_role(uuid, public.app_role[]) from public;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.has_org_role(uuid, public.app_role[]) to authenticated;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.store_settings enable row level security;
alter table public.vendedores enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.cash_sessions enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.cash_movements enable row level security;
alter table public.financial_reports enable row level security;

revoke all on public.profiles, public.organizations, public.organization_members,
  public.store_settings, public.vendedores, public.categories, public.products,
  public.cash_sessions, public.sales, public.sale_items, public.inventory_movements,
  public.cash_movements, public.financial_reports from anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.organizations to authenticated;
grant select, insert, update, delete on public.organization_members to authenticated;
grant select, insert, update on public.store_settings to authenticated;
grant select, insert, update, delete on public.vendedores, public.categories to authenticated;
grant select, insert, delete on public.products to authenticated;
grant update (vendedor_id, category_id, nome, sku, preco, ativo) on public.products to authenticated;
grant select, insert on public.cash_sessions to authenticated;
grant select on public.sales, public.sale_items, public.inventory_movements to authenticated;
grant select, insert on public.cash_movements to authenticated;
grant select, insert, update, delete on public.financial_reports to authenticated;

create policy profiles_read_self_or_colleague on public.profiles
for select to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1
    from public.organization_members mine
    join public.organization_members theirs using (organization_id)
    where mine.user_id = (select auth.uid()) and mine.ativo and theirs.user_id = profiles.id
  )
);
create policy profiles_update_self on public.profiles
for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy organizations_read_member on public.organizations
for select to authenticated using ((select private.is_org_member(id)));
create policy organizations_create_owner on public.organizations
for insert to authenticated with check (created_by = (select auth.uid()));
create policy organizations_update_admin on public.organizations
for update to authenticated using ((select private.has_org_role(id, array['admin']::public.app_role[])))
with check ((select private.has_org_role(id, array['admin']::public.app_role[])));
create policy organizations_delete_admin on public.organizations
for delete to authenticated using ((select private.has_org_role(id, array['admin']::public.app_role[])));

create policy members_read_member on public.organization_members
for select to authenticated using ((select private.is_org_member(organization_id)));
create policy members_insert_admin on public.organization_members
for insert to authenticated with check ((select private.has_org_role(organization_id, array['admin']::public.app_role[])));
create policy members_update_admin on public.organization_members
for update to authenticated using ((select private.has_org_role(organization_id, array['admin']::public.app_role[])))
with check ((select private.has_org_role(organization_id, array['admin']::public.app_role[])));
create policy members_delete_admin on public.organization_members
for delete to authenticated using ((select private.has_org_role(organization_id, array['admin']::public.app_role[])));

create policy settings_read_member on public.store_settings
for select to authenticated using ((select private.is_org_member(organization_id)));
create policy settings_manage_admin on public.store_settings
for all to authenticated using ((select private.has_org_role(organization_id, array['admin','gerente']::public.app_role[])))
with check ((select private.has_org_role(organization_id, array['admin','gerente']::public.app_role[])));

create policy vendedores_read_member on public.vendedores
for select to authenticated using ((select private.is_org_member(organization_id)));
create policy vendedores_manage_staff on public.vendedores
for all to authenticated using ((select private.has_org_role(organization_id, array['admin','gerente']::public.app_role[])))
with check ((select private.has_org_role(organization_id, array['admin','gerente']::public.app_role[])));

create policy categories_read_member on public.categories
for select to authenticated using ((select private.is_org_member(organization_id)));
create policy categories_manage_staff on public.categories
for all to authenticated using ((select private.has_org_role(organization_id, array['admin','gerente']::public.app_role[])))
with check ((select private.has_org_role(organization_id, array['admin','gerente']::public.app_role[])));

create policy products_read_member on public.products
for select to authenticated using ((select private.is_org_member(organization_id)));
create policy products_manage_staff on public.products
for all to authenticated using ((select private.has_org_role(organization_id, array['admin','gerente']::public.app_role[])))
with check ((select private.has_org_role(organization_id, array['admin','gerente']::public.app_role[])));

create policy cash_sessions_read_member on public.cash_sessions
for select to authenticated using ((select private.is_org_member(organization_id)));
create policy cash_sessions_open_staff on public.cash_sessions
for insert to authenticated with check (
  opened_by = (select auth.uid())
  and (select private.has_org_role(organization_id, array['admin','gerente','caixa']::public.app_role[]))
);
create policy sales_read_member on public.sales
for select to authenticated using ((select private.is_org_member(organization_id)));
create policy sale_items_read_member on public.sale_items
for select to authenticated using ((select private.is_org_member(organization_id)));
create policy inventory_read_member on public.inventory_movements
for select to authenticated using ((select private.is_org_member(organization_id)));

create policy cash_movements_read_member on public.cash_movements
for select to authenticated using ((select private.is_org_member(organization_id)));
create policy cash_movements_insert_staff on public.cash_movements
for insert to authenticated with check (
  created_by = (select auth.uid())
  and (select private.has_org_role(organization_id, array['admin','gerente','caixa']::public.app_role[]))
);

create policy financial_reports_read_member on public.financial_reports
for select to authenticated using ((select private.is_org_member(organization_id)));
create policy financial_reports_manage_staff on public.financial_reports
for all to authenticated using ((select private.has_org_role(organization_id, array['admin','gerente']::public.app_role[])))
with check (
  created_by = (select auth.uid())
  and (select private.has_org_role(organization_id, array['admin','gerente']::public.app_role[]))
);

-- Ajuste manual auditável. Não permita UPDATE direto do estoque pelo frontend.
create or replace function public.adjust_stock(
  p_organization_id uuid,
  p_product_id uuid,
  p_quantity_delta integer,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before integer;
  v_after integer;
  v_type public.stock_movement_type;
begin
  if not private.has_org_role(p_organization_id, array['admin','gerente']::public.app_role[]) then
    raise exception 'Sem permissão para ajustar estoque';
  end if;
  if p_quantity_delta = 0 or nullif(trim(p_reason), '') is null then
    raise exception 'Quantidade e motivo válidos são obrigatórios';
  end if;

  select estoque_atual into v_before
  from public.products
  where id = p_product_id and organization_id = p_organization_id and ativo
  for update;

  if not found then raise exception 'Produto não encontrado'; end if;
  v_after := v_before + p_quantity_delta;
  if v_after < 0 then raise exception 'Estoque insuficiente'; end if;
  v_type := case when p_quantity_delta > 0 then 'ajuste_positivo' else 'ajuste_negativo' end;

  update public.products set estoque_atual = v_after where id = p_product_id;
  insert into public.inventory_movements (
    organization_id, product_id, movement_type, quantity_delta,
    stock_before, stock_after, reason, created_by
  ) values (
    p_organization_id, p_product_id, v_type, p_quantity_delta,
    v_before, v_after, trim(p_reason), (select auth.uid())
  );
  return v_after;
end;
$$;

-- Finaliza venda, grava itens e baixa estoque em uma única transação.
-- p_items: [{"product_id":"uuid","quantity":2}, ...]
create or replace function public.finalize_sale(
  p_organization_id uuid,
  p_cash_session_id uuid,
  p_vendedor_id uuid,
  p_payment_method public.payment_method,
  p_received_amount numeric,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale_id uuid := gen_random_uuid();
  v_total numeric(12,2) := 0;
  v_received numeric(12,2);
  v_change numeric(12,2);
  v_item record;
  v_product record;
begin
  if not private.has_org_role(p_organization_id, array['admin','gerente','caixa']::public.app_role[]) then
    raise exception 'Sem permissão para registrar venda';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A venda precisa ter itens';
  end if;
  if not exists (
    select 1 from public.cash_sessions
    where id = p_cash_session_id and organization_id = p_organization_id and status = 'aberto'
  ) then raise exception 'Caixa não está aberto'; end if;
  if not exists (
    select 1 from public.vendedores
    where id = p_vendedor_id and organization_id = p_organization_id and ativo
  ) then raise exception 'Vendedor não encontrado'; end if;

  for v_item in
    select x.product_id, sum(x.quantity)::integer as quantity
    from jsonb_to_recordset(p_items) as x(product_id uuid, quantity integer)
    group by x.product_id
    order by x.product_id
  loop
    if v_item.quantity is null or v_item.quantity <= 0 then
      raise exception 'Quantidade inválida';
    end if;
    select id, nome, preco, estoque_atual into v_product
    from public.products
    where id = v_item.product_id
      and organization_id = p_organization_id
      and vendedor_id = p_vendedor_id
      and ativo
    for update;
    if not found then raise exception 'Produto % não encontrado', v_item.product_id; end if;
    if v_product.estoque_atual < v_item.quantity then
      raise exception 'Estoque insuficiente para %', v_product.nome;
    end if;
    v_total := v_total + (v_product.preco * v_item.quantity);
  end loop;

  v_received := case when p_payment_method = 'dinheiro' then coalesce(p_received_amount, 0) else v_total end;
  if v_received < v_total then raise exception 'Valor recebido é menor que o total'; end if;
  v_change := case when p_payment_method = 'dinheiro' then v_received - v_total else 0 end;

  insert into public.sales (
    id, organization_id, cash_session_id, vendedor_id, operator_id,
    payment_method, total, received_amount, change_amount
  ) values (
    v_sale_id, p_organization_id, p_cash_session_id, p_vendedor_id, (select auth.uid()),
    p_payment_method, v_total, v_received, v_change
  );

  for v_item in
    select x.product_id, sum(x.quantity)::integer as quantity
    from jsonb_to_recordset(p_items) as x(product_id uuid, quantity integer)
    group by x.product_id
    order by x.product_id
  loop
    select id, nome, preco, estoque_atual into v_product
    from public.products where id = v_item.product_id for update;

    insert into public.sale_items (
      organization_id, sale_id, product_id, product_name, quantity, unit_price
    ) values (
      p_organization_id, v_sale_id, v_product.id, v_product.nome, v_item.quantity, v_product.preco
    );

    update public.products
      set estoque_atual = v_product.estoque_atual - v_item.quantity
      where id = v_product.id;

    insert into public.inventory_movements (
      organization_id, product_id, sale_id, movement_type, quantity_delta,
      stock_before, stock_after, reason, created_by
    ) values (
      p_organization_id, v_product.id, v_sale_id, 'venda', -v_item.quantity,
      v_product.estoque_atual, v_product.estoque_atual - v_item.quantity,
      'Venda ' || v_sale_id::text, (select auth.uid())
    );
  end loop;
  return v_sale_id;
end;
$$;

create or replace function public.close_cash_session(
  p_organization_id uuid,
  p_cash_session_id uuid,
  p_closing_amount numeric,
  p_notes text default null
)
returns public.cash_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.cash_sessions;
  v_expected numeric(12,2);
begin
  if not private.has_org_role(p_organization_id, array['admin','gerente','caixa']::public.app_role[]) then
    raise exception 'Sem permissão para fechar o caixa';
  end if;
  if p_closing_amount < 0 then raise exception 'Valor de fechamento inválido'; end if;

  select * into v_session
  from public.cash_sessions
  where id = p_cash_session_id and organization_id = p_organization_id and status = 'aberto'
  for update;
  if not found then raise exception 'Caixa aberto não encontrado'; end if;

  select
    v_session.opening_amount
    + coalesce(sum(s.total) filter (where s.payment_method = 'dinheiro' and s.status = 'concluida'), 0)
    + coalesce((select sum(case when cm.kind = 'suprimento' then cm.amount else -cm.amount end)
                from public.cash_movements cm where cm.cash_session_id = p_cash_session_id), 0)
  into v_expected
  from public.sales s
  where s.cash_session_id = p_cash_session_id;

  update public.cash_sessions
  set status = 'fechado',
      closed_by = (select auth.uid()),
      closing_amount = p_closing_amount,
      expected_amount = v_expected,
      difference_amount = p_closing_amount - v_expected,
      closed_at = now(),
      notes = nullif(trim(p_notes), '')
  where id = p_cash_session_id
  returning * into v_session;

  return v_session;
end;
$$;

create or replace function public.cancel_sale(
  p_organization_id uuid,
  p_sale_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale public.sales;
  v_item record;
  v_before integer;
begin
  if not private.has_org_role(p_organization_id, array['admin','gerente']::public.app_role[]) then
    raise exception 'Sem permissão para cancelar venda';
  end if;
  if nullif(trim(p_reason), '') is null then raise exception 'Informe o motivo do cancelamento'; end if;

  select * into v_sale
  from public.sales
  where id = p_sale_id and organization_id = p_organization_id
  for update;
  if not found then raise exception 'Venda não encontrada'; end if;
  if v_sale.status = 'cancelada' then raise exception 'Venda já cancelada'; end if;

  for v_item in
    select product_id, quantity from public.sale_items
    where sale_id = p_sale_id order by product_id
  loop
    select estoque_atual into v_before
    from public.products where id = v_item.product_id for update;

    update public.products
    set estoque_atual = v_before + v_item.quantity
    where id = v_item.product_id;

    insert into public.inventory_movements (
      organization_id, product_id, sale_id, movement_type, quantity_delta,
      stock_before, stock_after, reason, created_by
    ) values (
      p_organization_id, v_item.product_id, p_sale_id, 'cancelamento_venda', v_item.quantity,
      v_before, v_before + v_item.quantity, trim(p_reason), (select auth.uid())
    );
  end loop;

  update public.sales
  set status = 'cancelada', cancelled_at = now(), cancelled_by = (select auth.uid()),
      cancellation_reason = trim(p_reason)
  where id = p_sale_id;
end;
$$;

revoke all on function public.adjust_stock(uuid, uuid, integer, text) from public, anon;
revoke all on function public.finalize_sale(uuid, uuid, uuid, public.payment_method, numeric, jsonb) from public, anon;
revoke all on function public.close_cash_session(uuid, uuid, numeric, text) from public, anon;
revoke all on function public.cancel_sale(uuid, uuid, text) from public, anon;
grant execute on function public.adjust_stock(uuid, uuid, integer, text) to authenticated;
grant execute on function public.finalize_sale(uuid, uuid, uuid, public.payment_method, numeric, jsonb) to authenticated;
grant execute on function public.close_cash_session(uuid, uuid, numeric, text) to authenticated;
grant execute on function public.cancel_sale(uuid, uuid, text) to authenticated;

create or replace view public.stock_report
with (security_invoker = true)
as
select
  p.organization_id,
  p.id as product_id,
  p.nome as produto,
  v.id as vendedor_id,
  v.nome as vendedor,
  c.nome as categoria,
  p.estoque_inicial,
  p.estoque_atual,
  p.estoque_inicial - p.estoque_atual as saldo_consumido,
  p.preco,
  p.ativo
from public.products p
join public.vendedores v on v.id = p.vendedor_id
left join public.categories c on c.id = p.category_id;

create or replace view public.sales_report
with (security_invoker = true)
as
select
  s.organization_id,
  s.id as sale_id,
  s.sold_at,
  s.cash_session_id,
  s.vendedor_id,
  v.nome as vendedor,
  s.operator_id,
  s.payment_method,
  s.status,
  si.product_id,
  si.product_name,
  si.quantity,
  si.unit_price,
  si.subtotal,
  s.total as sale_total,
  s.received_amount,
  s.change_amount
from public.sales s
join public.sale_items si on si.sale_id = s.id
join public.vendedores v on v.id = s.vendedor_id;

grant select on public.stock_report, public.sales_report to authenticated;

commit;

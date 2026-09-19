-- Bootstrap manual dos dois acessos master do PDV Manaaim.
-- Execute UMA VEZ no Supabase Dashboard > SQL Editor.
-- As senhas continuam gerenciadas pelo Supabase Auth e nunca ficam neste arquivo.

begin;

do $$
declare
  v_thiago_email constant text := 'thyagohoffmanna@gmail.com';
  v_cristiano_email constant text := 'cristianodemontanha@gmail.com';
  v_thiago_id uuid;
  v_cristiano_id uuid;
  v_organization_id uuid;
begin
  select id
    into v_thiago_id
    from auth.users
   where lower(email) = lower(v_thiago_email);

  if v_thiago_id is null then
    raise exception 'Usuário Thiago não encontrado no Supabase Auth.';
  end if;

  select id
    into v_cristiano_id
    from auth.users
   where lower(email) = lower(v_cristiano_email);

  if v_cristiano_id is null then
    raise exception 'Usuário Cristiano não encontrado no Supabase Auth.';
  end if;

  -- Confirma somente os dois usuários já criados pelo Supabase Auth.
  update auth.users
     set email_confirmed_at = coalesce(email_confirmed_at, now()),
         updated_at = now()
   where id in (v_thiago_id, v_cristiano_id);

  -- Garante os nomes usados pelo sistema sem tocar nas senhas.
  update auth.users
     set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
       || jsonb_build_object(
         'nome',
         case id
           when v_thiago_id then 'Thiago'
           when v_cristiano_id then 'Cristiano'
         end
       ),
         updated_at = now()
   where id in (v_thiago_id, v_cristiano_id);

  insert into public.profiles (id, nome, ativo)
  values
    (v_thiago_id, 'Thiago', true),
    (v_cristiano_id, 'Cristiano', true)
  on conflict (id) do update
    set nome = excluded.nome,
        ativo = true,
        updated_at = now();

  -- Reutiliza a organização Manaaim existente ou cria uma única organização.
  select id
    into v_organization_id
    from public.organizations
   where lower(nome) = lower('Manaaim')
   order by created_at
   limit 1;

  if v_organization_id is null then
    insert into public.organizations (nome, created_by)
    values ('Manaaim', v_thiago_id)
    returning id into v_organization_id;
  end if;

  -- No banco, o maior papel disponível é admin; no aplicativo ambos são masters.
  insert into public.organization_members (organization_id, user_id, role, ativo)
  values
    (v_organization_id, v_thiago_id, 'admin', true),
    (v_organization_id, v_cristiano_id, 'admin', true)
  on conflict (organization_id, user_id) do update
    set role = 'admin',
        ativo = true;
end;
$$;

commit;

-- Conferência sem expor senhas.
select
  p.nome,
  u.email_confirmed_at is not null as email_confirmado,
  m.role,
  m.ativo,
  o.nome as organizacao
from public.organization_members m
join public.profiles p on p.id = m.user_id
join auth.users u on u.id = m.user_id
join public.organizations o on o.id = m.organization_id
where p.nome in ('Thiago', 'Cristiano')
order by p.nome;

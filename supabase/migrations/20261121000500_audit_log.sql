-- =====================================================================
-- Migración 0500: bitácora de auditoría
-- Registra quién cambió qué y cuándo. Para minimizar datos personales
-- (Ley 8968) solo guarda los NOMBRES de los campos modificados, no valores.
-- =====================================================================

create table public.audit_logs (
  id             bigint generated always as identity primary key,
  table_name     text not null,
  record_id      uuid,
  action         text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  changed_fields text[] not null default '{}',
  actor_id       uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now()
);
comment on table public.audit_logs is 'Bitácora inmutable de cambios. Solo lectura para administradores.';
create index audit_logs_table_record_idx on public.audit_logs (table_name, record_id);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

create or replace function private.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fields text[] := '{}';
  v_old jsonb;
  v_new jsonb;
begin
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    select coalesce(array_agg(k order by k), '{}') into v_fields
    from jsonb_object_keys(v_new) k
    where k not in ('updated_at', 'stage_changed_at')
      and v_new -> k is distinct from v_old -> k;
    if cardinality(v_fields) = 0 then
      return new;
    end if;
  end if;

  insert into public.audit_logs (table_name, record_id, action, changed_fields, actor_id)
  values (
    tg_table_name,
    case when tg_op = 'DELETE' then old.id else new.id end,
    tg_op,
    v_fields,
    auth.uid()
  );
  return coalesce(new, old);
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['profiles', 'clients', 'requisitions', 'vacancies', 'candidates', 'applications'] loop
    execute format(
      'create trigger %1$s_audit after insert or update or delete on public.%1$I for each row execute function private.write_audit_log()', t);
  end loop;
end;
$$;

alter table public.audit_logs enable row level security;
alter table public.audit_logs force row level security;
revoke all on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;

create policy "audit_logs: lectura solo admin"
  on public.audit_logs for select to authenticated
  using ((select private.has_any_role('admin')));
-- Sin políticas de INSERT/UPDATE/DELETE: la bitácora solo la escribe el trigger.

-- =====================================================================
-- Migración 0600: vista de métricas del dashboard
-- security_invoker = true → la vista respeta el RLS del usuario que consulta.
-- =====================================================================

create view public.dashboard_metrics
with (security_invoker = true)
as
select
  (select count(*) from public.clients where status = 'activo')                               as active_clients,
  (select count(*) from public.requisitions where status in ('pendiente_aprobacion','aprobada','en_proceso')) as open_requisitions,
  (select count(*) from public.vacancies where status = 'abierta')                            as open_vacancies,
  (select count(*) from public.candidates)                                                    as total_candidates,
  (select count(*) from public.applications where stage not in ('contratado','descartado','retirado')) as active_applications,
  (select count(*) from public.applications
     where stage = 'contratado' and stage_changed_at >= date_trunc('month', now()))           as hires_this_month;

revoke all on public.dashboard_metrics from anon;
grant select on public.dashboard_metrics to authenticated;

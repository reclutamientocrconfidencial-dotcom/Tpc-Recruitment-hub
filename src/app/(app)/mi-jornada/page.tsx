import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, CalendarClock } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Forbidden } from "@/components/ui/forbidden";
import { buttonClasses } from "@/components/ui/button";
import { InlineAction } from "@/modules/common/inline-action";
import { listAssignableUsers, listClientOptions } from "@/modules/common/options";
import { getCalendarStatus, getWorkday, type WorkdayItem } from "@/modules/workday/repository";
import { createTaskAction, revokeCalendarAction, rotateCalendarAction, setTaskStatusAction } from "@/modules/workday/actions";
import { CalendarForm, TaskForm } from "@/modules/workday/forms";
import { todayCR } from "@/modules/evaluations/repository";
import { TASK_KIND } from "@/modules/labels";
import { pagePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { formatDate } from "@/lib/format";
import { siteOrigin } from "@/lib/site";
import type { Task } from "@/types/database";

export const metadata: Metadata = { title: "Mi jornada" };

const DT = new Intl.DateTimeFormat("es-CR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Costa_Rica" });

function Section({ title, description, items, empty }: { title: string; description?: string; items: WorkdayItem[]; empty: string }) {
  return (
    <Card>
      <CardHeader title={`${title} (${items.length})`} description={description} />
      {items.length === 0 ? (
        <p className="px-5 py-4 text-sm text-neutral-500">{empty}</p>
      ) : (
        <ul className="divide-y divide-neutral-100" aria-label={title}>
          {items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
              <div className="min-w-0">
                <Link href={i.href} className="font-semibold hover:text-brand-600 hover:underline">
                  {i.title || "—"}
                </Link>
                <p className="text-xs text-neutral-500">{i.detail}</p>
              </div>
              {i.when ? <span className={`text-xs ${i.overdue ? "font-semibold text-brand-700" : "text-neutral-600"}`}>{i.when.length === 10 ? formatDate(i.when) : DT.format(new Date(i.when))}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function TaskList({ tasks, showAssignee, now }: { tasks: Task[]; showAssignee?: boolean; now: number }) {
  return (
    <ul className="divide-y divide-neutral-100" aria-label={showAssignee ? "Tareas vencidas del equipo" : "Mis tareas"}>
      {tasks.map((t) => {
        const overdue = new Date(t.due_at).getTime() < now;
        return (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
            <div className="min-w-0">
              <p className="font-semibold">{t.title}</p>
              <p className="text-xs text-neutral-500">
                {TASK_KIND[t.kind]}
                {t.client?.name ? ` · ${t.client.name}` : ""}
                {t.vacancy ? ` · ${t.vacancy.code}` : ""}
                {showAssignee && t.assignee ? ` · ${t.assignee.full_name}` : ""}
                {t.notes ? ` · ${t.notes}` : ""}
              </p>
            </div>
            <span className="flex flex-wrap items-center gap-2">
              <span className={`text-xs ${overdue ? "font-semibold text-brand-700" : "text-neutral-600"}`}>
                {overdue ? "Vencida · " : ""}
                {DT.format(new Date(t.due_at))}
              </span>
              {!showAssignee ? (
                <>
                  <InlineAction action={setTaskStatusAction} fields={{ id: t.id, status: "hecha" }} label="Hecha" variant="secondary" />
                  <InlineAction action={setTaskStatusAction} fields={{ id: t.id, status: "cancelada" }} label="Cancelar" variant="ghost" />
                </>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export default async function MiJornadaPage() {
  const { user, allowed } = await pagePermission("jornada:ver");
  if (!allowed) return <Forbidden message="Mi jornada es para el personal operativo." />;
  const manager = can(user.role, "configuracion:gestionar");
  const today = todayCR();
  const [w, users, clients, calendar, origin] = await Promise.all([getWorkday(user.id, manager, today), listAssignableUsers(), listClientOptions(), getCalendarStatus(), siteOrigin()]);
  const now = Date.now();
  const clientFollowUps = w.tasks.filter((t) => t.kind === "seguimiento_cliente");
  const overdueCount = w.tasks.filter((t) => new Date(t.due_at).getTime() < now).length + w.nextActions.filter((n) => n.overdue).length + w.interviewsWithoutResult.length;
  return (
    <>
      <PageHeader
        title="Mi jornada"
        description={`${user.fullName ?? ""} · ${formatDate(today)}`}
        actions={
          <Link href="/productividad" className={buttonClasses("secondary")}>
            <BarChart3 className="h-4 w-4" aria-hidden /> Productividad
          </Link>
        }
      />
      {w.error ? <Alert tone="error" className="mb-4">{w.error}</Alert> : null}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Resumen del día">
        {[
          { label: "Atrasados", value: overdueCount, tone: overdueCount ? "text-brand-700" : "text-ink-950" },
          { label: "Entrevistas en 7 días", value: w.interviewsUpcoming.length },
          { label: "Tareas pendientes", value: w.tasks.length },
          { label: "Evaluaciones pendientes", value: w.pendingAssessments.length },
          { label: "Envíos por revisar", value: w.inboxPending, href: "/recepcion" },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{k.label}</p>
            <p className={`mt-1 text-2xl font-bold ${k.tone ?? "text-ink-950"}`}>{k.href ? <Link href={k.href} className="hover:underline">{k.value}</Link> : k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Entrevistas próximas" description="Próximos 7 días (usted es el entrevistador)." items={w.interviewsUpcoming} empty="Sin entrevistas en los próximos 7 días." />
        <Section title="Entrevistas sin resultado" description="Ya pasaron y siguen como «programadas»." items={w.interviewsWithoutResult} empty="Todo al día." />
        <Section title="Próximos pasos vencidos o de hoy" items={w.nextActions} empty="Sin próximos pasos pendientes." />
        <Section title="Etapas con tiempo excedido" description="Superan el tiempo objetivo de la etapa." items={w.stalled} empty="Ninguna postulación atrasada." />
        <Section title="Evaluaciones obligatorias pendientes" items={w.pendingAssessments} empty="Sin evaluaciones pendientes." />
        <Section title="Informes ejecutivos pendientes" description="Con entrevista realizada y sin informe final." items={w.pendingReports} empty="Sin informes pendientes." />
      </div>

      <Card className="mt-6">
        <CardHeader title={`Mis tareas y recordatorios (${w.tasks.length})`} description={clientFollowUps.length ? `${clientFollowUps.length} seguimiento(s) a clientes pendiente(s) de respuesta.` : "Incluye seguimientos a clientes pendientes de respuesta."} />
        {w.tasks.length ? <TaskList tasks={w.tasks} now={now} /> : <p className="px-5 py-4 text-sm text-neutral-500">Sin tareas pendientes.</p>}
        <div className="border-t border-neutral-100 px-5 py-4">
          <TaskForm
            action={createTaskAction}
            canAssign={manager}
            defaultUser={user.id}
            users={users.data.map((u) => ({ value: u.id, label: u.full_name || u.email }))}
            clients={clients.data.map((c) => ({ value: c.id, label: c.name }))}
          />
        </div>
      </Card>

      {manager && w.teamOverdueTasks.length ? (
        <Card className="mt-6">
          <CardHeader title={`Tareas vencidas del equipo (${w.teamOverdueTasks.length})`} />
          <TaskList tasks={w.teamOverdueTasks} showAssignee now={now} />
        </Card>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title={`Credenciales por vencer (${w.expiring.length})`} description="Próximos 30 días o vencidas." action={<CalendarClock className="h-5 w-5 text-neutral-400" aria-hidden />} />
          {w.expiring.length ? (
            <ul className="divide-y divide-neutral-100" aria-label="Credenciales por vencer">
              {w.expiring.slice(0, 15).map((c) => (
                <li key={c.credential_id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                  <Link href={`/candidatos/${c.candidate_id}`} className="font-semibold hover:underline">
                    {c.candidate_name}
                  </Link>
                  <span className="flex items-center gap-2 text-xs">
                    {c.credential}
                    <Badge def={c.days_left < 0 ? { label: "Vencida", tone: "red" } : { label: `${c.days_left} día(s)`, tone: "warning" }} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-4 text-sm text-neutral-500">Sin vencimientos próximos.</p>
          )}
        </Card>
        <Card>
          <CardHeader title="Calendario" description="Suscriba su calendario (Google, Outlook, Apple) a sus entrevistas y tareas. Sin nombres de candidatos." />
          <div className="px-5 py-5">
            <p className="mb-3 text-sm">
              Estado: {calendar.active ? <strong>activo</strong> : "sin enlace"}
              {calendar.last_used ? ` · última consulta ${DT.format(new Date(calendar.last_used))}` : ""}
            </p>
            <CalendarForm rotate={rotateCalendarAction} revoke={revokeCalendarAction} active={calendar.active} feedBase={origin} />
            <p className="mt-3 text-xs text-neutral-500">El enlace es personal y secreto. Si lo comparte por error, renuévelo: el anterior deja de funcionar.</p>
          </div>
        </Card>
      </div>
    </>
  );
}

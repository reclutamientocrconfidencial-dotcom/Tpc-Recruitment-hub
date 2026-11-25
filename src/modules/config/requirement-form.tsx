"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Field, SelectInput } from "@/components/ui/form";
import { SearchSelect } from "@/components/ui/search-select";
import { SubmitButton } from "@/components/ui/submit-button";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/action-state";
import { REQUIREMENT_CATEGORY, REQUIREMENT_TYPE, optionsFrom } from "@/modules/labels";
import type { JobPosition, ProficiencyScale, RequirementCatalogItem } from "@/types/database";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Agrega un requisito desde el catálogo (o uno nuevo), con el nivel mínimo
 * según la escala del requisito y, opcionalmente, para un puesto específico.
 */
export function RequirementForm({
  action,
  clientId,
  requirements,
  positions,
  scales,
}: {
  action: Action;
  clientId: string | null;
  requirements: RequirementCatalogItem[];
  positions: JobPosition[];
  scales: ProficiencyScale[];
}) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  const formRef = useRef<HTMLFormElement>(null);
  const [formKey, setFormKey] = useState(0);
  const [requirementId, setRequirementId] = useState("");
  const [isNew, setIsNew] = useState(false);
  // Controlado: el reinicio automático del formulario (React 19) no debe alterar la categoría.
  const [newCategory, setNewCategory] = useState("habilidad");

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setFormKey((k) => k + 1); // reinicia los buscadores
      setRequirementId("");
      setIsNew(false);
      setNewCategory("habilidad");
    }
  }, [state]);

  const scale = useMemo(() => {
    const req = requirements.find((r) => r.id === requirementId);
    return req?.scale_id ? scales.find((s) => s.id === req.scale_id) : undefined;
  }, [requirementId, requirements, scales]);
  const err = state.fieldErrors ?? {};

  return (
    <form ref={formRef} action={formAction} noValidate className="rounded-lg border border-dashed border-neutral-300 p-4" aria-label="Agregar requisito">
      <input type="hidden" name="client_id" value={clientId ?? ""} />
      {state.error ? <Alert tone="error" className="mb-3">{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert className="mb-3">{state.message}</Alert> : null}
      <div key={formKey} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Field id="req-catalog" label="Requisito" required error={err.catalog_requirement_id} className="lg:col-span-2">
          <SearchSelect
            id="req-catalog"
            name="catalog_requirement_id"
            label="Requisito"
            placeholder="Buscar en el catálogo…"
            allowCreate
            createLabel="Nuevo requisito"
            error={err.catalog_requirement_id}
            options={requirements
              .filter((r) => r.is_active)
              .map((r) => ({ value: r.id, label: r.name, hint: REQUIREMENT_CATEGORY[r.category] }))}
            onChange={(value, _opt, text) => {
              setRequirementId(value);
              setIsNew(Boolean(text));
            }}
          />
        </Field>
        {isNew ? (
          <Field id="req-new-category" label="Categoría del nuevo requisito">
            <SelectInput
              id="req-new-category"
              name="new_category"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              options={optionsFrom(REQUIREMENT_CATEGORY)}
            />
          </Field>
        ) : (
          <Field id="req-level" label="Nivel mínimo" hint={scale ? scale.name : "Según el requisito"}>
            <SelectInput
              id="req-level"
              name="min_level_id"
              disabled={!scale}
              placeholder={scale ? "Cualquiera" : "No aplica"}
              options={(scale?.levels ?? []).filter((l) => l.is_active).map((l) => ({ value: l.id, label: l.label }))}
            />
          </Field>
        )}
        <Field id="req-position" label="Puesto (opcional)">
          <SearchSelect
            id="req-position"
            name="position_id"
            label="Puesto"
            placeholder="Todos los puestos"
            allowCreate
            createLabel="Nuevo puesto"
            options={positions.filter((p) => p.is_active).map((p) => ({ value: p.id, label: p.name, hint: p.area }))}
          />
        </Field>
        <Field id="req-type" label="Tipo" error={err.requirement_type}>
          <SelectInput id="req-type" name="requirement_type" defaultValue="obligatorio" options={optionsFrom(REQUIREMENT_TYPE)} />
        </Field>
        <Field id="req-weight" label="Peso (1–5)" error={err.weight}>
          <SelectInput id="req-weight" name="weight" defaultValue="3" options={["1", "2", "3", "4", "5"].map((n) => ({ value: n, label: n }))} />
        </Field>
      </div>
      <div className="mt-3 flex justify-end">
        <SubmitButton variant="dark">Agregar requisito</SubmitButton>
      </div>
    </form>
  );
}

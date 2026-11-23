import { describe, expect, it } from "vitest";
import { clientSchema } from "@/modules/clients/schema";
import { parseClientFilters } from "@/modules/clients/filters";

const base = {
  name: "Empresa Ficticia S.A.",
  legal_id: "",
  industry: "",
  status: "activo",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  province: "",
  address: "",
  notes: "",
  account_manager_id: "",
};

describe("clientSchema", () => {
  it("acepta un cliente mínimo y convierte vacíos en null", () => {
    const r = clientSchema.safeParse(base);
    expect(r.success).toBe(true);
    expect(r.data?.legal_id).toBeNull();
    expect(r.data?.province).toBeNull();
    expect(r.data?.account_manager_id).toBeNull();
  });
  it("normaliza cédula, correo y teléfono", () => {
    const r = clientSchema.safeParse({ ...base, legal_id: "3101000099", contact_email: " Ana@Ficticia.TEST", contact_phone: "22223333" });
    expect(r.data).toMatchObject({ legal_id: "3-101-000099", contact_email: "ana@ficticia.test", contact_phone: "+506 2222-3333" });
  });
  it("rechaza datos inválidos con mensajes en español", () => {
    const r = clientSchema.safeParse({ ...base, name: "A", status: "borrado", contact_email: "no-correo", province: "Narnia", contact_phone: "12" });
    expect(r.success).toBe(false);
    const msgs = r.error!.issues.map((i) => i.message);
    expect(msgs).toContain("Ingrese el nombre de la empresa.");
    expect(msgs).toContain("Correo electrónico inválido.");
    expect(msgs).toContain("Seleccione una provincia válida.");
    expect(msgs).toContain("Teléfono inválido (ej.: 2222-3333).");
  });
  it("rechaza un gestor de cuenta que no sea UUID", () => {
    expect(clientSchema.safeParse({ ...base, account_manager_id: "admin" }).success).toBe(false);
  });
});

describe("filtros de clientes", () => {
  it("ignora valores no permitidos", () => {
    const f = parseClientFilters({ q: "Logística", estado: "hackeado", provincia: "Heredia", page: "2" });
    expect(f).toMatchObject({ q: "Logística", status: "", province: "Heredia", page: 2 });
  });
});

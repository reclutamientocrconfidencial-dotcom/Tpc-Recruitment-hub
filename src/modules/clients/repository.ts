import "server-only";
import { DEMO_CLIENTS } from "@/lib/demo/data";
import { DEFAULT_PAGE_SIZE, runQuery } from "@/modules/shared";
import type { Client } from "@/types/database";

export function listClients() {
  return runQuery<Client>(
    () => DEMO_CLIENTS,
    (sb) =>
      sb
        .from("clients")
        .select("id, name, legal_id, industry, status, contact_name, contact_email, contact_phone, province, created_at")
        .order("name")
        .limit(DEFAULT_PAGE_SIZE),
  );
}

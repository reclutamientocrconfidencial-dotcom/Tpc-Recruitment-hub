import "server-only";
import { DEMO_CANDIDATES } from "@/lib/demo/data";
import { DEFAULT_PAGE_SIZE, runQuery } from "@/modules/shared";
import type { Candidate } from "@/types/database";

export function listCandidates() {
  return runQuery<Candidate>(
    () => DEMO_CANDIDATES,
    (sb) =>
      sb
        .from("candidates")
        .select(
          "id, first_name, last_name, email, phone, province, current_title, years_experience, english_level, source, consent_given, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(DEFAULT_PAGE_SIZE),
  );
}

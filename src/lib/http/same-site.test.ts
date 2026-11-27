import { describe, expect, it } from "vitest";
import { crossSiteDenied } from "@/lib/http/same-site";

describe("descargas solo desde el mismo sitio", () => {
  it("rechaza solicitudes de otro sitio y permite las propias", () => {
    expect(crossSiteDenied(new Request("https://app.test/x", { headers: { "sec-fetch-site": "cross-site" } }))?.status).toBe(403);
    expect(crossSiteDenied(new Request("https://app.test/x", { headers: { "sec-fetch-site": "same-origin" } }))).toBeNull();
    expect(crossSiteDenied(new Request("https://app.test/x", { headers: { "sec-fetch-site": "none" } }))).toBeNull();
    expect(crossSiteDenied(new Request("https://app.test/x"))).toBeNull();
  });
});

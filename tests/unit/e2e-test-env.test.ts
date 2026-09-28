// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { e2eDatabaseEnv } from "../e2e/test-env";

// Pengaman uji E2E: database uji tidak boleh sama dengan database utama, karena
// uji E2E membuat pasien & booking sungguhan. "Sama" berarti server DAN nama
// database sama — dua database berbeda di satu PostgreSQL lokal itu sah.
function atur(utama: string, uji: string) {
  vi.stubEnv("DATABASE_URL", utama);
  vi.stubEnv("TEST_DATABASE_URL", uji);
  vi.stubEnv("TEST_DATABASE_URL_UNPOOLED", uji);
}

describe("e2eDatabaseEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("menerima database uji yang berbeda di PostgreSQL lokal yang sama", () => {
    atur("postgresql://sundy@localhost:5432/sundy_dev", "postgresql://sundy@localhost:5432/sundy_test");

    expect(e2eDatabaseEnv()).toEqual({
      DATABASE_URL: "postgresql://sundy@localhost:5432/sundy_test",
      DATABASE_URL_UNPOOLED: "postgresql://sundy@localhost:5432/sundy_test",
    });
  });

  it("menolak bila database uji sama dengan database utama", () => {
    atur("postgresql://sundy@localhost:5432/sundy_dev", "postgresql://sundy@localhost:5432/sundy_dev");

    expect(() => e2eDatabaseEnv()).toThrow("basis data yang sama");
  });

  it("tetap menganggap endpoint pooler dan langsung Neon sebagai database yang sama", () => {
    atur(
      "postgresql://u:p@ep-abc-pooler.ap-southeast-1.aws.neon.tech/neondb",
      "postgresql://u:p@ep-abc.ap-southeast-1.aws.neon.tech/neondb",
    );

    expect(() => e2eDatabaseEnv()).toThrow("basis data yang sama");
  });
});

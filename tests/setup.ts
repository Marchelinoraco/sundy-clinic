import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { installBrowserMocks, resetBrowserMocks } from "./unit/helpers/browser-mocks";

// Beberapa uji berjalan di lingkungan node (tanpa window); tiruan peramban hanya untuk jsdom.
if (typeof window !== "undefined") {
  installBrowserMocks();
  afterEach(() => resetBrowserMocks());
}

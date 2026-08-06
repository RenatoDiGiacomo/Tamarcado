import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// jsdom não implementa matchMedia. Vários componentes o usam (useMediaQuery,
// PwaInstall). Default: nenhuma query casa (matches:false). Testes que precisam
// de um breakpoint específico sobrescrevem window.matchMedia no próprio beforeEach.
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }) as unknown as MediaQueryList;
}

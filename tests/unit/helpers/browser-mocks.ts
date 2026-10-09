import { vi } from "vitest";

/**
 * jsdom tidak punya matchMedia, IntersectionObserver, ResizeObserver, scrollIntoView,
 * dan Element.scrollTo. Bahan gerak situs publik memakai semuanya; tiruan ini
 * memasangnya untuk seluruh uji unit dan bisa dikendalikan dari uji.
 */

type MediaListener = (event: { matches: boolean; media: string }) => void;

const mediaMatches = new Map<string, boolean>();
const mediaListeners = new Map<string, Set<MediaListener>>();

/** Mengubah hasil sebuah media query dan memberi tahu semua pendengarnya. */
export function setMediaMatches(query: string, matches: boolean): void {
  mediaMatches.set(query, matches);
  for (const listener of mediaListeners.get(query) ?? []) listener({ matches, media: query });
}

function listenersFor(query: string): Set<MediaListener> {
  let set = mediaListeners.get(query);
  if (!set) {
    set = new Set();
    mediaListeners.set(query, set);
  }
  return set;
}

function matchMedia(query: string) {
  return {
    get matches() {
      return mediaMatches.get(query) ?? false;
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: MediaListener) => listenersFor(query).add(listener),
    removeEventListener: (_type: string, listener: MediaListener) =>
      listenersFor(query).delete(listener),
    addListener: (listener: MediaListener) => listenersFor(query).add(listener),
    removeListener: (listener: MediaListener) => listenersFor(query).delete(listener),
    dispatchEvent: () => false,
  };
}

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  readonly targets = new Set<Element>();
  readonly root = null;
  readonly rootMargin: string;
  readonly thresholds: number[] = [];

  constructor(
    readonly callback: IntersectionObserverCallback,
    options: IntersectionObserverInit = {},
  ) {
    this.rootMargin = options.rootMargin ?? "";
    MockIntersectionObserver.instances.push(this);
  }

  observe(target: Element) {
    this.targets.add(target);
  }

  unobserve(target: Element) {
    this.targets.delete(target);
  }

  disconnect() {
    this.targets.clear();
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

/** Memanggil setiap observer yang sedang mengamati `target`, seolah target masuk atau keluar layar. */
export function triggerIntersection(
  target: Element,
  isIntersecting: boolean,
  rect: Partial<DOMRectReadOnly> = {},
): void {
  const boundingClientRect = {
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    ...rect,
  } as DOMRectReadOnly;

  for (const observer of [...MockIntersectionObserver.instances]) {
    if (!observer.targets.has(target)) continue;
    const entry = {
      target,
      isIntersecting,
      intersectionRatio: isIntersecting ? 1 : 0,
      boundingClientRect,
      intersectionRect: boundingClientRect,
      rootBounds: null,
      time: 0,
    } as IntersectionObserverEntry;
    observer.callback([entry], observer as unknown as IntersectionObserver);
  }
}

/** Membuat setiap elemen tampak berada `top` piksel dari atas layar (jsdom selalu memberi 0). */
export function mockElementTop(top: number) {
  return vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    top,
    bottom: top + 100,
    left: 0,
    right: 100,
    width: 100,
    height: 100,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect);
}

export function installBrowserMocks(): void {
  Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: matchMedia });
  Object.defineProperty(window, "IntersectionObserver", {
    configurable: true,
    writable: true,
    value: MockIntersectionObserver,
  });
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};
  // DataGrid dan Popper MUI mengamati ukuran elemen; jsdom tidak punya ResizeObserver.
  if (!("ResizeObserver" in window)) {
    Object.defineProperty(window, "ResizeObserver", {
      configurable: true,
      writable: true,
      value: class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    });
  }
}

export function resetBrowserMocks(): void {
  mediaMatches.clear();
  mediaListeners.clear();
  MockIntersectionObserver.instances = [];
}

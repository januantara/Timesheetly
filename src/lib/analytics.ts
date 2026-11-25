const DEFAULT_GTM_ID = 'GTM-M7V92L2N';

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let initialized = false;
let scriptInjected = false;

function injectGtmScript(gtmId: string): void {
  if (scriptInjected || typeof document === 'undefined') return;
  const src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`;
  if (document.querySelector(`script[src="${src}"]`)) {
    scriptInjected = true;
    return;
  }

  scriptInjected = true;
  const script = document.createElement('script');
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
}

/**
 * Initializes Google Tag Manager / gtag dataLayer immediately (zero cost),
 * then defers downloading and executing gtm.js until the page is idle or
 * the user first interacts so FCP/LCP/TTI are not blocked.
 */
export function initDeferredGtm(gtmId: string = DEFAULT_GTM_ID): void {
  if (initialized || typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }
  initialized = true;

  window.dataLayer = window.dataLayer || [];
  function gtag(..._args: unknown[]) {
    // Push the native Arguments object expected by gtag / GTM
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments);
  }
  window.gtag = window.gtag || gtag;
  window.gtag('js', new Date());
  window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });

  const interactionEvents: (keyof WindowEventMap)[] = [
    'pointerdown',
    'keydown',
    'touchstart',
    'scroll',
  ];

  const win = window as Window & {
    requestIdleCallback?: (cb: IdleRequestCallback, opts?: IdleRequestOptions) => number;
    cancelIdleCallback?: (id: number) => void;
  };

  let idleId: number | null = null;
  let timerId: number | null = null;

  const triggerLoad = () => {
    for (const evt of interactionEvents) {
      window.removeEventListener(evt, triggerLoad);
    }
    if (idleId !== null && typeof win.cancelIdleCallback === 'function') {
      win.cancelIdleCallback(idleId);
      idleId = null;
    }
    if (timerId !== null) {
      window.clearTimeout(timerId);
      timerId = null;
    }
    injectGtmScript(gtmId);
  };

  for (const evt of interactionEvents) {
    window.addEventListener(evt, triggerLoad, { passive: true, once: true });
  }

  const scheduleWhenIdle = () => {
    if (typeof win.requestIdleCallback === 'function') {
      idleId = win.requestIdleCallback(triggerLoad, { timeout: 2500 });
    } else {
      timerId = window.setTimeout(triggerLoad, 2000);
    }
  };

  if (document.readyState === 'complete') {
    scheduleWhenIdle();
  } else {
    window.addEventListener('load', scheduleWhenIdle, { once: true });
  }
}

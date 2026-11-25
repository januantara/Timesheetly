import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {initDeferredGtm} from './lib/analytics';

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const canonicalUrl = `${window.location.origin}${window.location.pathname}`;
  let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.appendChild(canonical);
  }
  canonical.href = canonicalUrl;

  let ogUrl = document.querySelector<HTMLMetaElement>('meta[property="og:url"]');
  if (!ogUrl) {
    ogUrl = document.createElement('meta');
    ogUrl.setAttribute('property', 'og:url');
    document.head.appendChild(ogUrl);
  }
  ogUrl.content = canonicalUrl;

  initDeferredGtm('GTM-M7V92L2N');
}

createRoot(document.getElementById('root')!).render(<App />);

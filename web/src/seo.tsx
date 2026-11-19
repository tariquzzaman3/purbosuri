import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const SITE = 'https://purbosuri.web.app';

type PageMeta = { title: string; description: string; canonical: string; index: boolean };

const DEFAULT_DESCRIPTION =
  'পূর্বসূরি: বিনামূল্যে, বিজ্ঞাপনহীন ও ব্যক্তিগত বাংলা বংশবৃক্ষ অ্যাপ। Purbosuri is a free, private Bengali family tree and family memories app.';

/** Titles and indexing rules per route. Signed-in pages are never indexed. */
function metaFor(pathname: string): PageMeta {
  if (pathname === '/privacy') {
    return {
      title: 'গোপনীয়তা নীতি · Privacy policy – পূর্বসূরি (Purbosuri)',
      description:
        'How Purbosuri handles your family data: private by default, never sold, exportable and deletable.',
      canonical: `${SITE}/privacy`,
      index: true,
    };
  }
  if (pathname === '/terms') {
    return {
      title: 'শর্তাবলি · Terms of use – পূর্বসূরি (Purbosuri)',
      description: 'The terms for using Purbosuri, the free Bengali family tree and memories app.',
      canonical: `${SITE}/terms`,
      index: true,
    };
  }
  if (pathname === '/data-deletion') {
    return {
      title: 'তথ্য মোছার নিয়ম · How to delete your data – পূর্বসূরি (Purbosuri)',
      description: 'Step-by-step instructions for deleting your Purbosuri account and family data.',
      canonical: `${SITE}/data-deletion`,
      index: true,
    };
  }
  if (pathname === '/' || pathname === '/welcome') {
    return {
      title: 'পূর্বসূরি (Purbosuri) – বিনামূল্যে বাংলা বংশবৃক্ষ ও পারিবারিক স্মৃতির অ্যাপ',
      description: DEFAULT_DESCRIPTION,
      canonical: `${SITE}/`,
      index: true,
    };
  }
  return {
    title: 'পূর্বসূরি (Purbosuri)',
    description: DEFAULT_DESCRIPTION,
    canonical: `${SITE}/`,
    index: false,
  };
}

function setMeta(selector: string, create: () => HTMLElement, attr: string, value: string) {
  let el = document.head.querySelector<HTMLElement>(selector);
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

/**
 * Keeps the page title, description, canonical link and robots tag in step with the current
 * route. Google and Bing run JavaScript and read these; the static copies in index.html cover
 * crawlers and link previews that do not.
 */
export function Seo() {
  const { pathname } = useLocation();

  useEffect(() => {
    const meta = metaFor(pathname);
    document.title = meta.title;
    setMeta(
      'meta[name="description"]',
      () => Object.assign(document.createElement('meta'), { name: 'description' }),
      'content',
      meta.description,
    );
    setMeta(
      'meta[name="robots"]',
      () => Object.assign(document.createElement('meta'), { name: 'robots' }),
      'content',
      meta.index ? 'index, follow, max-image-preview:large, max-snippet:-1' : 'noindex, nofollow',
    );
    setMeta(
      'link[rel="canonical"]',
      () => Object.assign(document.createElement('link'), { rel: 'canonical' }),
      'href',
      meta.canonical,
    );
    setMeta(
      'meta[property="og:url"]',
      () => {
        const m = document.createElement('meta');
        m.setAttribute('property', 'og:url');
        return m;
      },
      'content',
      meta.canonical,
    );
  }, [pathname]);

  return null;
}

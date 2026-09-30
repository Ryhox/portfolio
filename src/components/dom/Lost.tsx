'use client';

import { useEffect } from 'react';

/** Tells the inner world this page is lost: the broken clock then hangs in view behind it. */
export default function Lost() {
  useEffect(() => {
    document.body.dataset.notFound = '1';
    return () => {
      delete document.body.dataset.notFound;
    };
  }, []);
  return null;
}

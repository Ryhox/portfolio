'use client';

import NextLink from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ComponentProps, MouseEvent } from 'react';
import { useApp } from '@/lib/store';
import { channelSwitch } from '@/lib/transition';

/**
 * A link that changes the channel: the tube collapses, the route changes behind it,
 * and the new page powers on. On the same page the tube switches off, the page is simply at
 * the place behind the dark, and the picture comes back. Plain navigation for modified clicks.
 */
export default function TransitionLink({ href, onClick, ...rest }: ComponentProps<typeof NextLink>) {
  const router = useRouter();
  const pathname = usePathname();
  const url = typeof href === 'string' ? href : (href.pathname ?? '/');

  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    // going anywhere on the page swings the view back from the radio first
    useApp.getState().setRadio(false);
    const [path, hash] = url.split('#');
    if ((path || '/') === pathname) {
      e.preventDefault();
      channelSwitch.cut(hash ? `#${hash}` : null);
      return;
    }
    e.preventDefault();
    channelSwitch.go(url, (to) => router.push(to, { scroll: false }));
  };

  return <NextLink href={href} onClick={handle} {...rest} />;
}

'use client';

import { useState } from 'react';
import { sfx } from '@/audio/sfx';
import { site } from '@/content/site';
import { Plate } from './ProjectActions';
import s from './ContactPlates.module.css';

/** The ways to say hi, as in v1: GitHub, Modrinth, Email, and Discord (its handle goes to the clipboard). */
export default function ContactPlates({ className }: { className?: string }) {
  const [copied, setCopied] = useState(false);
  const [github, modrinth] = site.socials;
  return (
    <ul className={`${s.plates} ${className ?? ''}`}>
      <li>
        <Plate large label="GitHub" href={github.href} ariaLabel={`GitHub, ${github.handle} (opens in a new tab)`} />
      </li>
      <li>
        <Plate large label="Modrinth" href={modrinth.href} ariaLabel={`Modrinth, ${modrinth.handle} (opens in a new tab)`} />
      </li>
      <li>
        <Plate large variant="solid" label="Email" href={`mailto:${site.email}`} arrow={false} ariaLabel={`Email ${site.email}`} />
      </li>
      <li>
        <Plate
          large
          label={copied ? 'Copied' : 'Discord'}
          arrow={false}
          ariaLabel={copied ? `Copied ${site.discord}` : `Copy the Discord handle ${site.discord}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(site.discord);
              sfx.click();
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            } catch {}
          }}
        />
      </li>
    </ul>
  );
}

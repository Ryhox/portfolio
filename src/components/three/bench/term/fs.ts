/**
 * A small filesystem held in memory: it can be listed, read, written, moved and deleted, and it
 * all comes back as it was on the next visit. Directories owned by root refuse writes (unless the
 * visitor found the sudo password).
 */
export type FileNode = { type: 'file'; content: string | (() => string); exec?: string; mtime: number; mode?: string };
export type DirNode = { type: 'dir'; children: Record<string, Node>; mtime: number; ro?: boolean; virtual?: boolean };
export type Node = FileNode | DirNode;

/** When the machine was "installed": files not touched since carry this date. */
export const INSTALLED = Date.UTC(2026, 2, 14, 9, 26);

export const file = (content: string | (() => string), exec?: string, mode?: string): FileNode => ({ type: 'file', content, exec, mtime: INSTALLED, mode });
export const dir = (children: Record<string, Node>, ro = false): DirNode => ({ type: 'dir', children, mtime: INSTALLED, ro });

export const read = (n: FileNode) => (typeof n.content === 'function' ? n.content() : n.content);
export const size = (n: Node) => (n.type === 'dir' ? 4096 : new TextEncoder().encode(read(n)).length);

export class Vfs {
  root: DirNode;
  /** writes into root's directories are allowed (sudo) */
  root_ok = false;

  constructor(root: DirNode) {
    this.root = root;
  }

  get(parts: string[]): Node | null {
    let n: Node = this.root;
    for (const p of parts) {
      if (n.type !== 'dir') return null;
      const next: Node | undefined = n.children[p] ?? n.children[caseless(n, p)];
      if (!next) return null;
      n = next;
    }
    return n;
  }

  /** The real spelling of a path found case-insensitively. */
  canonical(parts: string[]) {
    const out: string[] = [];
    let n: Node = this.root;
    for (const p of parts) {
      if (n.type !== 'dir') return parts;
      const name: string = n.children[p] ? p : caseless(n, p) || p;
      out.push(name);
      n = n.children[name];
      if (!n) return [...out, ...parts.slice(out.length)];
    }
    return out;
  }

  private writable(d: DirNode) {
    return !d.virtual && (!d.ro || this.root_ok);
  }

  /** Write (or append to) a file; null, or the reason it could not be done. */
  write(parts: string[], text: string, append = false): string | null {
    const name = parts[parts.length - 1];
    const d = this.get(parts.slice(0, -1));
    if (!name || !d) return 'No such file or directory';
    if (d.type !== 'dir') return 'Not a directory';
    const existing = d.children[name];
    if (existing?.type === 'dir') return 'Is a directory';
    if (!this.writable(d)) return 'Permission denied';
    const before = existing && existing.type === 'file' ? read(existing) : '';
    d.children[name] = { type: 'file', content: append ? before + text : text, mtime: Date.now(), mode: existing?.type === 'file' ? existing.mode : undefined };
    d.mtime = Date.now();
    return null;
  }

  touch(parts: string[]): string | null {
    const n = this.get(parts);
    if (n) {
      n.mtime = Date.now();
      return null;
    }
    return this.write(parts, '');
  }

  mkdir(parts: string[], parents = false): string | null {
    let d: DirNode = this.root;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const next = d.children[p];
      const last = i === parts.length - 1;
      if (next) {
        if (next.type !== 'dir') return 'Not a directory';
        if (last && !parents) return 'File exists';
        d = next;
        continue;
      }
      if (!last && !parents) return 'No such file or directory';
      if (!this.writable(d)) return 'Permission denied';
      const made = dir({});
      made.mtime = Date.now();
      d.children[p] = made;
      d = made;
    }
    return null;
  }

  remove(parts: string[], recursive = false, dirsOnly = false): string | null {
    const name = parts[parts.length - 1];
    const d = this.get(parts.slice(0, -1));
    const n = this.get(parts);
    if (!name || !d || d.type !== 'dir' || !n) return 'No such file or directory';
    if (n.type === 'dir' && !recursive && !(dirsOnly && Object.keys(n.children).length === 0))
      return dirsOnly ? 'Directory not empty' : 'Is a directory';
    if (dirsOnly && n.type !== 'dir') return 'Not a directory';
    if (!this.writable(d)) return 'Permission denied';
    delete d.children[d.children[name] ? name : this.canonical(parts).at(-1)!];
    d.mtime = Date.now();
    return null;
  }

  /** Put a node at a path (for mv and cp); into the directory if the target is one. */
  place(parts: string[], node: Node, srcName: string): string | null {
    const t = this.get(parts);
    let d: Node | null;
    let name: string;
    if (t && t.type === 'dir') {
      d = t;
      name = srcName;
    } else {
      d = this.get(parts.slice(0, -1));
      name = parts[parts.length - 1];
    }
    if (!d || !name) return 'No such file or directory';
    if (d.type !== 'dir') return 'Not a directory';
    if (!this.writable(d)) return 'Permission denied';
    if (d.children[name]?.type === 'dir' && node.type !== 'dir') return 'Is a directory';
    d.children[name] = node;
    d.mtime = Date.now();
    return null;
  }
}

function caseless(d: DirNode, name: string) {
  const low = name.toLowerCase();
  const hits = Object.keys(d.children).filter((k) => k.toLowerCase() === low);
  return hits.length === 1 ? hits[0] : '';
}

export function clone(n: Node): Node {
  if (n.type === 'file') return { ...n, mtime: Date.now() };
  const children: Record<string, Node> = {};
  for (const [k, v] of Object.entries(n.children)) children[k] = clone(v);
  return { type: 'dir', children, mtime: Date.now() };
}

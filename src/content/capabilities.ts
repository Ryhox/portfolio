/** The gear train in § 03: what Ryhox builds, and with what. Each gear drives the next. */
export const capabilities = [
  {
    name: '3D worlds',
    line: 'Explorable, real-time scenes that run in a browser tab.',
    items: ['Three.js', 'React Three Fiber', 'GLSL', 'WebGL'],
  },
  {
    name: 'Everyday apps',
    line: 'Apps people open every day, on the web and on phones.',
    items: ['Next.js', 'React', 'TypeScript', 'Flutter'],
  },
  {
    name: 'AI & backends',
    line: 'Private AI on your own machine, and the servers behind the apps.',
    items: ['Ollama', 'Node.js', 'PostgreSQL', 'MySQL', 'JavaScript'],
  },
  {
    name: 'Mods & hardware',
    line: 'Minecraft mods, and code for things that don’t live in a browser.',
    items: ['Java', 'Kotlin', 'C#', 'Arduino', 'Fabric'],
  },
  {
    name: 'Motion & feel',
    line: 'Scroll choreography, physics and tiny interactions.',
    items: ['GSAP', 'Lenis', 'Shaders', 'Physics'],
  },
] as const;


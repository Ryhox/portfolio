import * as THREE from 'three';

/**
 * Everything the GPU needs before the first real frame, spread out so no single frame pays for it:
 * textures are uploaded two per frame, shader programs are compiled asynchronously.
 * The loader waits until this is idle, so the site is smooth from its first frame.
 */
const queue: THREE.Texture[] = [];
const seen = new WeakSet<THREE.Texture>();
let loading = 0;
let compiling = 0;
/** for the loader's count: how much of the GPU work has been asked for, and how much is done */
let queued = 0;
let uploaded = 0;
let compilesAsked = 0;
let compilesDone = 0;

THREE.DefaultLoadingManager.onStart = () => {
  loading++;
};
const prevLoad = THREE.DefaultLoadingManager.onLoad;
THREE.DefaultLoadingManager.onLoad = () => {
  loading = 0;
  prevLoad?.();
};

export const warmup = {
  /** Queue every texture under `object` for upload. */
  add(object: THREE.Object3D) {
    object.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!m) return;
      for (const mat of Array.isArray(m) ? m : [m]) {
        for (const v of Object.values(mat)) {
          const t = v as THREE.Texture;
          if (t && t.isTexture && !seen.has(t)) {
            seen.add(t);
            queue.push(t);
            queued++;
          }
        }
      }
    });
  },
  /** Called once per frame by the director. */
  step(gl: THREE.WebGLRenderer, perFrame = 2) {
    for (let i = 0; i < perFrame && queue.length; i++) {
      gl.initTexture(queue.shift()!);
      uploaded++;
    }
  },
  /**
   * Compile every program the scene will need. `target` must be the render target the scene is
   * really drawn into: tone mapping and colour space are part of a program's identity, so
   * compiling for the screen when the scene renders offscreen builds the wrong set entirely.
   */
  compile(gl: THREE.WebGLRenderer, scene: THREE.Object3D, camera: THREE.Camera, target: THREE.WebGLRenderTarget | null = null) {
    compiling++;
    compilesAsked++;
    const prevTarget = gl.getRenderTarget();
    gl.setRenderTarget(target);
    // three only compiles what is visible, and most of this world is hidden until you scroll to
    // it: show everything for the moment it takes to collect the materials, then put it back
    const hidden: THREE.Object3D[] = [];
    scene.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
    });
    const job = gl.compileAsync(scene as THREE.Scene, camera);
    hidden.forEach((o) => (o.visible = false));
    gl.setRenderTarget(prevTarget);
    return job
      .catch(() => {})
      .finally(() => {
        compiling--;
        compilesDone++;
      });
  },
  /**
   * Draw the whole scene once, unseen, with everything visible and nothing culled, into the
   * target it really uses: compiling builds the shaders, but only a draw uploads the geometry,
   * and a big model's first draw would otherwise land in the middle of someone's scroll.
   */
  prime(gl: THREE.WebGLRenderer, scene: THREE.Object3D, camera: THREE.Camera, target: THREE.WebGLRenderTarget) {
    const restore: [THREE.Object3D, boolean, boolean][] = [];
    scene.traverse((o) => {
      restore.push([o, o.visible, o.frustumCulled]);
      o.visible = true;
      o.frustumCulled = false;
    });
    const prev = gl.getRenderTarget();
    gl.setRenderTarget(target);
    gl.render(scene as THREE.Scene, camera);
    gl.setRenderTarget(prev);
    restore.forEach(([o, v, f]) => {
      o.visible = v;
      o.frustumCulled = f;
    });
  },
  /** 0..1: the textures uploaded and the programs compiled, of all asked for so far */
  get done() {
    return { uploads: queued ? uploaded / queued : 0, compiles: compilesAsked ? compilesDone / compilesAsked : 0 };
  },
  idle() {
    return loading === 0 && queue.length === 0 && compiling === 0;
  },
  get loading() {
    return loading > 0;
  },
  get pending() {
    return queue.length;
  },
};

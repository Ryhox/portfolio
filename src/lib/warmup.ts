import * as THREE from 'three';

/**
 * Everything the GPU needs before the first real frame, spread out so no single frame pays for it:
 * photos are decoded off the main thread, textures are uploaded two per frame, shader programs are
 * compiled asynchronously, and a scene's first draw is taken a few objects at a time.
 * The loader waits until this is idle, so the site is smooth from its first frame.
 */
const queue: THREE.Texture[] = [];
const seen = new WeakSet<THREE.Texture>();
/** scenes whose programs are being compiled, a few objects a frame */
type Job = { scene: THREE.Object3D; camera: THREE.Camera; target: THREE.WebGLRenderTarget | null; items: THREE.Object3D[] | null; at: number; n: number; done: () => void };
const jobs: Job[] = [];
const decoded = new WeakMap<object, Promise<void>>();
let loading = 0;
let compiling = 0;
let decoding = 0;
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

/**
 * A photo loaded as an <img> is only decoded when it is first drawn: on the main thread, in the
 * very frame that uploads it (some 20 ms for a 2k picture). Decoded here as a bitmap instead,
 * off the main thread, the upload is just the upload. The bitmap is made from the file itself
 * (it is in the browser's cache): made from the <img>, the decoding is still done on the main
 * thread, there and then. (A bitmap is oriented when it is made, not when it is uploaded: the
 * texture's flipY goes into it here.)
 */
function decode(t: THREE.Texture) {
  const img = t.image as unknown;
  if (typeof HTMLImageElement === 'undefined' || !(img instanceof HTMLImageElement) || typeof createImageBitmap !== 'function') return null;
  let job = decoded.get(t.source);
  if (!job) {
    const source = t.source;
    const flip = t.flipY;
    job = fetch(img.currentSrc || img.src)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((blob) => createImageBitmap(blob, { imageOrientation: flip ? 'flipY' : 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' }))
      .then((bitmap) => {
        if (source.data === img) source.data = bitmap;
      })
      .catch(() => {});
    decoded.set(source, job);
  }
  return job;
}

const drawn = (o: THREE.Object3D) => (o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints || (o as THREE.Line).isLine;

export const warmup = {
  /** Queue every texture under `object` for upload. */
  add(object: THREE.Object3D) {
    const take = (v: unknown) => {
      const t = v as THREE.Texture & { isVideoTexture?: boolean; isRenderTargetTexture?: boolean; isDepthTexture?: boolean };
      // (a recording uploads itself as it plays; a render target's picture is not ours to upload)
      if (!t || !t.isTexture || seen.has(t) || t.isVideoTexture || t.isRenderTargetTexture || t.isDepthTexture) return;
      seen.add(t);
      queued++;
      const job = decode(t);
      if (!job) queue.push(t);
      else {
        decoding++;
        job.finally(() => {
          decoding--;
          queue.push(t);
        });
      }
    };
    object.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!m) return;
      for (const mat of Array.isArray(m) ? m : [m]) {
        for (const v of Object.values(mat)) take(v);
        // a hand-written shader keeps its textures in its uniforms
        const uniforms = (mat as THREE.ShaderMaterial).uniforms;
        if (uniforms) for (const u of Object.values(uniforms)) take(u?.value);
      }
    });
  },
  /**
   * Called once per frame by the director: uploads what is waiting, up to about a 1k picture's
   * worth of pixels a frame (a 2k one has a frame to itself: handing its pixels to the GPU is
   * several milliseconds on its own). Under the loader (`fast`) there is no frame to keep.
   */
  step(gl: THREE.WebGLRenderer, fast = false) {
    let budget = fast ? 12e6 : 1.2e6;
    while (queue.length && budget > 0) {
      const t = queue.shift()!;
      const img = t.image as { width?: number; height?: number } | null;
      // (a canvas not yet drawn, a picture not yet in: nothing to upload)
      if (img) gl.initTexture(t);
      budget -= (img?.width ?? 0) * (img?.height ?? 0) || 1e5;
      uploaded++;
    }

    // and the programs of the scenes being compiled: under the loader a scene at a time, after it
    // a few objects a frame (setting a program up is a millisecond or more of string work each,
    // before the GPU even starts on it: a whole scene's worth at once is a tenth of a second)
    while (jobs.length && this.advance(gl, jobs[0], fast) && fast);
  },
  /** Set up the programs of the next few objects of a scene; true once it has got through them all. */
  advance(gl: THREE.WebGLRenderer, job: Job, fast: boolean) {
    if (!job.items) {
      const all: THREE.Object3D[] = [];
      job.scene.traverse((o) => void (drawn(o) && all.push(o)));
      job.items = all;
    }
    const prevTarget = gl.getRenderTarget();
    gl.setRenderTarget(job.target);
    // (the lights are gathered from what is visible, and most of this world is hidden until you
    // scroll to it: everything is shown for the moment this takes, then put back)
    const hidden: THREE.Object3D[] = [];
    job.scene.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
    });
    // the next few, handed to three as if they were a scene of their own in this one's light
    const batch = job.items.slice(job.at, fast ? undefined : job.at + job.n);
    const some = { traverse: (fn: (o: THREE.Object3D) => void) => batch.forEach(fn), traverseVisible: () => {} };
    const t0 = performance.now();
    gl.compile(some as unknown as THREE.Object3D, job.camera, job.scene as THREE.Scene);
    const took = performance.now() - t0;
    job.at += batch.length;
    job.n = took < 2 ? Math.min(32, job.n * 2) : took > 5 ? Math.max(1, job.n >> 1) : job.n;
    hidden.forEach((o) => (o.visible = false));
    gl.setRenderTarget(prevTarget);
    if (job.at < job.items.length) return false;
    // all set up: done once the GPU has finished with every one of them (asked without waiting)
    jobs.shift();
    const materials = new Set<THREE.Material>();
    for (const o of job.items) {
      const m = (o as THREE.Mesh).material;
      for (const mat of Array.isArray(m) ? m : m ? [m] : []) materials.add(mat);
    }
    const parallel = gl.extensions.get('KHR_parallel_shader_compile') !== null;
    const wait = () => {
      if (parallel) {
        materials.forEach((mat) => {
          const program = (gl.properties.get(mat) as { currentProgram?: { isReady(): boolean } }).currentProgram;
          if (!program || program.isReady()) materials.delete(mat);
        });
        if (materials.size) return void setTimeout(wait, 10);
      }
      job.done();
    };
    setTimeout(wait, parallel ? 0 : 10);
    return true;
  },
  /**
   * Compile every program the scene will need (the work is done by `step`, above, a little a
   * frame; the promise is kept once the GPU has them all ready). `target` must be the render
   * target the scene is really drawn into: tone mapping and colour space are part of a program's
   * identity, so compiling for the screen when the scene renders offscreen builds the wrong set
   * entirely.
   */
  compile(_gl: THREE.WebGLRenderer, scene: THREE.Object3D, camera: THREE.Camera, target: THREE.WebGLRenderTarget | null = null) {
    compiling++;
    compilesAsked++;
    return new Promise<void>((done) => jobs.push({ scene, camera, target, items: null, at: 0, n: 1, done })).finally(() => {
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
  /**
   * The same first draw, but a few objects a frame, for a scene that arrives after the page is up
   * (under the loader one long draw is fine; in someone's scroll it is a stutter). Returns a step
   * to call once a frame until it says it is done. Each step draws its few objects into a single
   * pixel of the target (the uploads are the point, not the picture), with the sun's shadow of
   * them too when `shadows` is asked for, and takes more or fewer the next time by how long it took.
   */
  slices(gl: THREE.WebGLRenderer, scene: THREE.Object3D, camera: THREE.Camera, target: THREE.WebGLRenderTarget, shadows = false) {
    let items: THREE.Object3D[] | null = null;
    let at = 0;
    let n = 2;
    const restore: [THREE.Object3D, boolean, boolean][] = [];
    const box = new THREE.Vector4();
    return () => {
      if (!items) {
        const all: THREE.Object3D[] = [];
        scene.traverse((o) => void (drawn(o) && all.push(o)));
        items = all;
      }
      if (at >= items.length) return true;
      const batch = new Set(items.slice(at, at + n));
      restore.length = 0;
      scene.traverse((o) => {
        restore.push([o, o.visible, o.frustumCulled]);
        o.visible = !drawn(o) || batch.has(o);
        o.frustumCulled = false;
      });
      const prev = gl.getRenderTarget();
      const test = target.scissorTest;
      box.copy(target.scissor);
      target.scissor.set(0, 0, 1, 1);
      target.scissorTest = true;
      if (shadows && gl.shadowMap.enabled) gl.shadowMap.needsUpdate = true;
      const t0 = performance.now();
      gl.setRenderTarget(target);
      gl.render(scene as THREE.Scene, camera);
      gl.setRenderTarget(prev);
      const took = performance.now() - t0;
      target.scissor.copy(box);
      target.scissorTest = test;
      for (const [o, v, f] of restore) {
        o.visible = v;
        o.frustumCulled = f;
      }
      at += n;
      n = took < 2 ? Math.min(48, n * 2) : took > 5 ? Math.max(1, n >> 1) : n;
      return at >= items.length;
    };
  },
  /** 0..1: the textures uploaded and the programs compiled, of all asked for so far */
  get done() {
    return { uploads: queued ? uploaded / queued : 0, compiles: compilesAsked ? compilesDone / compilesAsked : 0 };
  },
  idle() {
    return loading === 0 && queue.length === 0 && compiling === 0 && decoding === 0;
  },
  get loading() {
    return loading > 0;
  },
  get pending() {
    return queue.length + decoding;
  },
};

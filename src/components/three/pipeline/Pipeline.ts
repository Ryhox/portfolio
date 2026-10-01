import * as THREE from 'three';
import { beamFrag, bloomDownFrag, bloomUpFrag, crtFrag, finalFrag, fullscreenVert } from './shaders';

const MIPS = 5;

function makeTarget(w: number, h: number, samples = 0) {
  return new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: samples >= 0,
    samples: Math.max(0, samples),
    colorSpace: THREE.LinearSRGBColorSpace,
  });
}

/** A single triangle that covers clip space — cheaper than a quad, no diagonal seam. */
class Fullscreen {
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  mesh: THREE.Mesh;
  constructor() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.mesh = new THREE.Mesh(g);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }
  render(gl: THREE.WebGLRenderer, material: THREE.Material, target: THREE.WebGLRenderTarget | null) {
    this.mesh.material = material;
    gl.setRenderTarget(target);
    gl.render(this.scene, this.camera);
  }
}

class Bloom {
  mips: THREE.WebGLRenderTarget[] = [];
  down: THREE.ShaderMaterial;
  up: THREE.ShaderMaterial;

  constructor() {
    for (let i = 0; i < MIPS; i++) {
      const t = makeTarget(1, 1, -1);
      t.depthBuffer = false;
      this.mips.push(t);
    }
    this.down = new THREE.ShaderMaterial({
      vertexShader: fullscreenVert,
      fragmentShader: bloomDownFrag,
      uniforms: {
        tSrc: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uPrefilter: { value: 0 },
        uThreshold: { value: 1 },
        uKnee: { value: 0.5 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.up = new THREE.ShaderMaterial({
      vertexShader: fullscreenVert,
      fragmentShader: bloomUpFrag,
      uniforms: {
        tSrc: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uRadius: { value: 1 },
        uWeight: { value: 1 },
      },
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
  }

  setSize(w: number, h: number) {
    for (let i = 0; i < MIPS; i++) {
      const s = 2 ** (i + 1);
      this.mips[i].setSize(Math.max(1, Math.floor(w / s)), Math.max(1, Math.floor(h / s)));
    }
  }

  render(fs: Fullscreen, gl: THREE.WebGLRenderer, src: THREE.Texture, srcW: number, srcH: number, threshold: number) {
    const d = this.down.uniforms;
    d.uThreshold.value = threshold;
    d.uKnee.value = Math.max(0.05, threshold * 0.5);
    let w = srcW;
    let h = srcH;
    let tex = src;
    for (let i = 0; i < MIPS; i++) {
      d.tSrc.value = tex;
      d.uTexel.value.set(1 / w, 1 / h);
      d.uPrefilter.value = i === 0 ? 1 : 0;
      fs.render(gl, this.down, this.mips[i]);
      tex = this.mips[i].texture;
      w = this.mips[i].width;
      h = this.mips[i].height;
    }
    const u = this.up.uniforms;
    const auto = gl.autoClear;
    gl.autoClear = false;
    for (let i = MIPS - 1; i > 0; i--) {
      u.tSrc.value = this.mips[i].texture;
      u.uTexel.value.set(1 / this.mips[i].width, 1 / this.mips[i].height);
      u.uWeight.value = 0.9;
      fs.render(gl, this.up, this.mips[i - 1]);
    }
    gl.autoClear = auto;
    return this.mips[0].texture;
  }
}

export type CrtParams = {
  os: number;
  hasScene: boolean;
  bloom: number;
  tune: number;
  flash: number;
  /** 0 = tube off, 1 = on; in between it powers up the way a CRT does */
  power: number;
  time: number;
  curve: number;
  ca: number;
  scan: number;
  radius: number;
  flicker: number;
  dim: number;
  /**
   * The office behind the clock: how much of it shows (0..1), and the round opening it shows
   * through, in scene uv (centre x, y, radius as a fraction of the height; 0 radius = closed).
   */
  office: number;
  portal: [number, number, number];
  /** strength of the light beams through the office window (0 = none drawn) */
  beam: number;
  /** 1 = the tube's rounded, darkening rim (its screen seen from outside), 0 = none (inside) */
  bezel: number;
  /** the shape the picture is shown at (width / height): the glass's, or the viewport's */
  aspect: number;
};

/** What the beams need from the office: its camera, the sun, and the room it lights. */
export type BeamParams = {
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  box: THREE.Box3;
  color: THREE.Color;
  density: number;
  steps: number;
  time: number;
  /** the opening the office is seen through, while it is one (see renderOffice) */
  portal?: [number, number, number] | null;
};

export type FinalParams = {
  bloom: number;
  vignette: number;
  exposure: number;
  grain: number;
  time: number;
  /** 1 = the film curve (tone mapping), 0 = the picture as it is (recordings) */
  tone?: number;
  /** 0..1: how far the view has swung across to the radio's room (standing to the right) */
  pan?: number;
};

/**
 * Three worlds, one tube.
 *   office ──────┐ (through the clock's hub)
 *   inner world ─┤
 *   terminal ────┴─► CRT pass ─► crtTarget ─┬─► present            (inside)
 *                                           └─► screen texture ──► bench ─► present  (outside)
 */
export class Pipeline {
  gl: THREE.WebGLRenderer;
  fs = new Fullscreen();
  bloom = new Bloom();
  works: THREE.WebGLRenderTarget;
  office: THREE.WebGLRenderTarget;
  /** the light beams through the office window, at half resolution */
  beams: THREE.WebGLRenderTarget;
  beamMat: THREE.ShaderMaterial;
  bench: THREE.WebGLRenderTarget;
  /** the radio's room, beside whatever the page shows */
  radio: THREE.WebGLRenderTarget;
  crt: THREE.WebGLRenderTarget;
  crtMat: THREE.ShaderMaterial;
  finalMat: THREE.ShaderMaterial;
  width = 1;
  height = 1;
  dpr = 1;
  private black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);

  /** Multisampling on the two scene targets: dropped on weak machines (fill rate is their limit). */
  setSamples(n: number) {
    for (const t of [this.works, this.office, this.bench, this.radio]) {
      if (t.samples === n) continue;
      t.samples = n;
      t.dispose();
    }
  }

  constructor(gl: THREE.WebGLRenderer, samples = 4) {
    this.gl = gl;
    this.black.needsUpdate = true;
    this.works = makeTarget(1, 1, samples);
    this.office = makeTarget(1, 1, samples);
    // the office keeps its depth, for the beams to know how far each pixel's light goes
    this.office.depthTexture = new THREE.DepthTexture(1, 1);
    this.beams = makeTarget(1, 1, -1);
    this.beams.depthBuffer = false;
    this.bench = makeTarget(1, 1, samples);
    this.radio = makeTarget(1, 1, samples);
    this.beamMat = new THREE.ShaderMaterial({
      vertexShader: fullscreenVert,
      fragmentShader: beamFrag,
      uniforms: {
        tDepth: { value: this.office.depthTexture },
        tShadow: { value: null },
        uProjInv: { value: new THREE.Matrix4() },
        uCamWorld: { value: new THREE.Matrix4() },
        uShadowMat: { value: new THREE.Matrix4() },
        uCamPos: { value: new THREE.Vector3() },
        uSunDir: { value: new THREE.Vector3(1, -0.5, 0) },
        uColor: { value: new THREE.Color() },
        uBoxMin: { value: new THREE.Vector3() },
        uBoxMax: { value: new THREE.Vector3() },
        uTime: { value: 0 },
        uDensity: { value: 1 },
        uSteps: { value: 16 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.crt = makeTarget(1, 1, -1);
    this.crt.depthBuffer = false;

    this.crtMat = new THREE.ShaderMaterial({
      vertexShader: fullscreenVert,
      fragmentShader: crtFrag,
      uniforms: {
        tScene: { value: this.works.texture },
        tOffice: { value: this.office.texture },
        tBeam: { value: this.beams.texture },
        uBeam: { value: 0 },
        uOffice: { value: 0 },
        uPortal: { value: new THREE.Vector3(0.5, 0.5, 0) },
        tBloom: { value: this.black },
        tOS: { value: this.black },
        uOS: { value: 1 },
        uHasScene: { value: 0 },
        uBloom: { value: 0.6 },
        uTune: { value: 0 },
        uFlash: { value: 0 },
        uPower: { value: 1 },
        uTime: { value: 0 },
        uCurve: { value: 0.1 },
        uCA: { value: 0.004 },
        uScan: { value: 1 },
        uRadius: { value: 32 },
        uDpr: { value: 1 },
        uFlicker: { value: 1 },
        uDim: { value: 1 },
        uBezel: { value: 1 },
        uAspect: { value: 1.6 },
        uRes: { value: new THREE.Vector2(1, 1) },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.finalMat = new THREE.ShaderMaterial({
      vertexShader: fullscreenVert,
      fragmentShader: finalFrag,
      uniforms: {
        tSrc: { value: this.black },
        tBloom: { value: this.black },
        uBloom: { value: 0 },
        uVignette: { value: 0 },
        uExposure: { value: 1 },
        uGrain: { value: 0.035 },
        uTone: { value: 1 },
        tRadio: { value: this.black },
        uPan: { value: 0 },
        uCurve: { value: 0.13 },
        uTime: { value: 0 },
        uRes: { value: new THREE.Vector2(1, 1) },
      },
      depthTest: false,
      depthWrite: false,
      toneMapped: true,
    });
  }

  setSize(cssW: number, cssH: number, dpr: number) {
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (w === this.width && h === this.height && dpr === this.dpr) return;
    this.width = w;
    this.height = h;
    this.dpr = dpr;
    this.works.setSize(w, h);
    this.office.setSize(w, h);
    this.beams.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    this.bench.setSize(w, h);
    this.radio.setSize(w, h);
    this.crt.setSize(w, h);
    this.bloom.setSize(w, h);
    this.crtMat.uniforms.uRes.value.set(w, h);
    this.crtMat.uniforms.uDpr.value = dpr;
    this.finalMat.uniforms.uRes.value.set(w, h);
  }

  get crtTexture() {
    return this.crt.texture;
  }

  /**
   * The one pass that is not drawn from the first frame on (the office's beams of light) has its
   * program compiled ahead, in the background: built on first use it is a wait of its own, in
   * the very frame the office opens.
   */
  warm() {
    const prev = this.gl.getRenderTarget();
    this.fs.mesh.material = this.beamMat;
    this.gl.setRenderTarget(this.beams);
    const job = this.gl.compileAsync(this.fs.scene, this.fs.camera);
    this.gl.setRenderTarget(prev);
    return job.catch(() => {});
  }

  /** `over`: drawn on top of what the target already holds (only its depth is cleared). */
  renderWorks(scene: THREE.Scene, camera: THREE.Camera, over = false) {
    this.gl.setRenderTarget(this.works);
    if (!over) {
      this.gl.clear();
      this.gl.render(scene, camera);
      return;
    }
    const auto = this.gl.autoClear;
    this.gl.autoClear = false;
    this.gl.clearDepth();
    this.gl.render(scene, camera);
    this.gl.autoClear = auto;
  }

  /**
   * While the office is only seen through the clock's hub (`portal`: a round opening in scene uv,
   * centre x, y and radius as a fraction of the height), only the part of it the opening can show
   * is drawn, and lit by the beams: the rest of the frame would be thrown away, and until the
   * opening has grown that is nearly all of it.
   */
  private window(target: THREE.WebGLRenderTarget, portal: [number, number, number] | null) {
    const full = !portal || portal[2] > 1.2;
    target.scissorTest = !full;
    if (full) return;
    const w = target.width;
    const h = target.height;
    // (a little over: the glass's colour fringes and the beams' blur reach past the edge)
    const r = Math.max(0, portal[2]) * h + (12 * w) / Math.max(1, this.width / this.dpr);
    const x0 = Math.max(0, Math.floor(portal[0] * w - r));
    const y0 = Math.max(0, Math.floor(portal[1] * h - r));
    const x1 = Math.min(w, Math.ceil(portal[0] * w + r));
    const y1 = Math.min(h, Math.ceil(portal[1] * h + r));
    target.scissor.set(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
  }

  renderOffice(scene: THREE.Scene, camera: THREE.Camera, portal: [number, number, number] | null = null) {
    this.window(this.office, portal);
    this.gl.setRenderTarget(this.office);
    this.gl.clear();
    this.gl.render(scene, camera);
  }

  private _dir = new THREE.Vector3();

  renderBeams(p: BeamParams) {
    const u = this.beamMat.uniforms;
    const shadow = p.sun.shadow.map?.depthTexture;
    if (!shadow) return false;
    u.tShadow.value = shadow;
    u.uProjInv.value.copy(p.camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(p.camera.matrixWorld);
    u.uShadowMat.value.copy(p.sun.shadow.matrix);
    p.camera.getWorldPosition(u.uCamPos.value);
    u.uSunDir.value.copy(this._dir.subVectors(p.sun.target.position, p.sun.position).normalize());
    u.uColor.value.copy(p.color);
    u.uBoxMin.value.copy(p.box.min);
    u.uBoxMax.value.copy(p.box.max);
    u.uTime.value = p.time;
    u.uDensity.value = p.density;
    u.uSteps.value = p.steps;
    this.window(this.beams, p.portal ?? null);
    this.fs.render(this.gl, this.beamMat, this.beams);
    return true;
  }

  runCrt(os: THREE.Texture | null, p: CrtParams, bloomThreshold = 1.1) {
    const u = this.crtMat.uniforms;
    if (p.hasScene && p.os < 1 && p.bloom > 0) {
      // the glow comes from whichever world fills the tube
      const src = p.office > 0.5 && p.portal[2] > 1 ? this.office.texture : this.works.texture;
      u.tBloom.value = this.bloom.render(this.fs, this.gl, src, this.width, this.height, bloomThreshold);
    } else {
      u.tBloom.value = this.black;
    }
    u.tScene.value = this.works.texture;
    u.tOS.value = os ?? this.black;
    u.uOS.value = p.os;
    u.uHasScene.value = p.hasScene ? 1 : 0;
    u.uBloom.value = p.bloom;
    u.uTune.value = p.tune;
    u.uFlash.value = p.flash;
    u.uPower.value = p.power;
    u.uTime.value = p.time;
    u.uCurve.value = p.curve;
    u.uCA.value = p.ca;
    u.uScan.value = p.scan;
    u.uRadius.value = p.radius;
    u.uFlicker.value = p.flicker;
    u.uDim.value = p.dim;
    u.uBezel.value = p.bezel;
    u.uAspect.value = p.aspect;
    u.uOffice.value = p.office;
    u.uBeam.value = p.beam;
    u.uPortal.value.set(p.portal[0], p.portal[1], p.portal[2]);
    this.fs.render(this.gl, this.crtMat, this.crt);
  }

  /** The radio, on nothing: cleared to transparent, to be laid over whatever the page shows. */
  renderRadio(scene: THREE.Scene, camera: THREE.Camera) {
    const alpha = this.gl.getClearAlpha();
    this.gl.setClearAlpha(0);
    this.gl.setRenderTarget(this.radio);
    this.gl.clear();
    this.gl.render(scene, camera);
    this.gl.setClearAlpha(alpha);
  }

  renderBench(scene: THREE.Scene, camera: THREE.Camera) {
    this.gl.setRenderTarget(this.bench);
    this.gl.clear();
    this.gl.render(scene, camera);
  }

  present(source: 'crt' | 'bench', p: FinalParams, bloomThreshold = 1) {
    const u = this.finalMat.uniforms;
    const src = source === 'crt' ? this.crt.texture : this.bench.texture;
    if (source === 'bench' && p.bloom > 0) {
      u.tBloom.value = this.bloom.render(this.fs, this.gl, src, this.width, this.height, bloomThreshold);
    } else {
      u.tBloom.value = this.black;
    }
    u.tSrc.value = src;
    u.uBloom.value = source === 'bench' ? p.bloom : 0;
    u.uVignette.value = p.vignette;
    u.uExposure.value = p.exposure;
    u.uGrain.value = p.grain;
    u.uTone.value = p.tone ?? 1;
    u.uPan.value = p.pan ?? 0;
    u.tRadio.value = (p.pan ?? 0) > 0 ? this.radio.texture : this.black;
    u.uTime.value = p.time;
    this.fs.render(this.gl, this.finalMat, null);
  }

  dispose() {
    [this.works, this.office, this.beams, this.bench, this.radio, this.crt, ...this.bloom.mips].forEach((t) => t.dispose());
    this.office.depthTexture?.dispose();
    this.beamMat.dispose();
    this.crtMat.dispose();
    this.finalMat.dispose();
    this.bloom.down.dispose();
    this.bloom.up.dispose();
  }
}

'use client';

import { createPortal, useFrame, useThree } from '@react-three/fiber';
import { perf, startingTier } from '@/lib/perf';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { clamp, invLerp, smootherstep, smoothstep, spring } from '@/lib/math';
import { office } from '@/lib/office';
import { rig } from '@/lib/rig';
import { useApp } from '@/lib/store';
import { warmup } from '@/lib/warmup';
import Bench from './bench/Bench';
import { LumenOS } from './bench/LumenOS';
import { applyPose, benchPose, bump, fitContent, heroAnchor, makePose, openingPose, tube } from './bench/tube';
import { HeroWords, WORDS_DEPTH } from './bench/words';
import { Pipeline } from './pipeline/Pipeline';
import { CURVE, bendPointer } from './pipeline/shaders';
import Office, { OFFICE_FOV, SUN_COLOR, preloadOffice } from './office/Office';
import Reel from './reel/Reel';
import RadioView from './resonance/RadioView';
import { radio } from '@/lib/radio';
import { reel } from '@/lib/reel';
import Works from './works/Works';

const LANDING = 3.6; // seconds of the landing: lamp, lid, camera, tube

const _swayQ = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
/**
 * Swing a camera round where it stands, toward the radio on its right: by a whole view's width
 * when all the way across, so the world goes off to the left exactly as the page does.
 */
function sway(cam: THREE.PerspectiveCamera, pan: number) {
  if (pan <= 0) return;
  const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * cam.aspect);
  _swayQ.setFromAxisAngle(_up, -pan * hfov);
  cam.quaternion.premultiply(_swayQ);
  cam.updateMatrixWorld();
}

/** The workshop lamp warming up: an incandescent that catches, drops out, and catches again. */
function lampAt(s: number) {
  if (s < 0.95) return 0;
  const f = [
    [0.95, 0.55],
    [1.02, 0.05],
    [1.1, 0.8],
    [1.16, 0.15],
    [1.2, 0.9],
    [1.34, 0.6],
    [1.42, 1],
  ];
  for (let i = f.length - 1; i >= 0; i--) if (s >= f[i][0]) return f[i][1];
  return 0;
}

/**
 * Runs every frame by hand (priority 1 disables R3F's own render): sequences the landing,
 * decides where the camera is on the journey, what the tube shows, and which world is presented.
 */
export default function Director({ setDpr }: { setDpr: (d: number) => void }) {
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const [benchScene] = useState(() => new THREE.Scene());
  const [worksScene] = useState(() => new THREE.Scene());
  const [officeScene] = useState(() => new THREE.Scene());
  const [reelScene] = useState(() => new THREE.Scene());
  const [radioScene] = useState(() => new THREE.Scene());
  const benchCam = useMemo(() => new THREE.PerspectiveCamera(30, 1, 0.05, 160), []);
  const worksCam = useMemo(() => new THREE.PerspectiveCamera(32, 1, 0.1, 400), []);
  const officeCam = useMemo(() => new THREE.PerspectiveCamera(OFFICE_FOV, 1, 0.03, 60), []);
  const reelCam = useMemo(() => new THREE.PerspectiveCamera(30, 1, 0.05, 20), []);
  const radioCam = useMemo(() => new THREE.PerspectiveCamera(32, 1, 0.1, 400), []);
  const pipeline = useMemo(() => new Pipeline(gl, gl.capabilities.maxSamples >= 2 ? 2 : 0), [gl]);
  const os = useMemo(() => new LumenOS(), []);
  // the landing's words, hanging in front of the camera (the camera flies past them into the tube)
  const words = useMemo(() => new HeroWords(), []);
  const wordsCam = useMemo(() => new THREE.PerspectiveCamera(30, 1, 0.05, 160), []);
  const wordsPose = useMemo(() => makePose(), []);
  useEffect(() => () => words.dispose(), [words]);
  const pose = useMemo(() => makePose(), []);
  // the office is far down the page: it loads once the page is up, so the first load stays short
  const [officeOn, setOfficeOn] = useState(false);
  useEffect(() => {
    let id = 0;
    const go = () => {
      id = window.setTimeout(() => {
        preloadOffice();
        setOfficeOn(true);
      }, 600);
    };
    if (useApp.getState().stage === 'ready') go();
    const off = useApp.subscribe((s, p) => {
      if (s.stage === 'ready' && p.stage !== 'ready') go();
    });
    return () => {
      off();
      window.clearTimeout(id);
    };
  }, []);
  const clock = useRef({ office: 'wait' as 'wait' | 'warming' | 'ready', officeCompiled: false, reel: 'wait' as 'wait' | 'warming' | 'ready', reelCompiled: false, compiled: false, worksCompiled: false, frames: 0, perfT: 0, perfN: 0, good: 0, primed: false, tiered: false, skip: false, checkT: 0, sig: '', stable: 0, dirty: true });

  useEffect(() => () => pipeline.dispose(), [pipeline]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production')
      (window as unknown as Record<string, unknown>).__dir = { pipeline, benchScene, worksScene, officeScene, reelScene, radioScene, benchCam, worksCam, officeCam, reelCam, radioCam, os, gl };
  }, [pipeline, benchScene, worksScene, officeScene, reelScene, radioScene, benchCam, worksCam, officeCam, reelCam, radioCam, os, gl]);

  // Pointer rays inside the tube must pass through the same curvature the image does.
  const worksEvents = useMemo(
    () => ({
      compute: (
        event: PointerEvent,
        state: { size: { width: number; height: number; left: number; top: number }; pointer: THREE.Vector2; raycaster: THREE.Raycaster; camera: THREE.Camera },
      ) => {
        const x = ((event.clientX - state.size.left) / state.size.width) * 2 - 1;
        const y = -((event.clientY - state.size.top) / state.size.height) * 2 + 1;
        const [bx, by] = bendPointer(x, y, CURVE, state.size.width / state.size.height);
        state.pointer.set(bx, by);
        state.raycaster.setFromCamera(state.pointer, state.camera);
      },
    }),
    [],
  );

  useFrame((state) => {
    const c0 = clock.current;
    if (!c0.tiered) {
      c0.tiered = true;
      perf.tier = startingTier(gl.getContext() as WebGL2RenderingContext);
      if (perf.tier >= 2) setDpr(perf.tier >= 3 ? 0.5 : 0.75);
    }
    pipeline.setSamples(perf.tier >= 2 || gl.capabilities.maxSamples < 2 ? 0 : 2);
    // lite: the 3D is drawn every other frame (the page itself keeps its full rate)
    c0.skip = perf.tier >= 3 && useApp.getState().stage === 'ready' ? !c0.skip : false;
    if (c0.skip) return;
    const { width: w, height: h } = size;
    const dpr = state.viewport.dpr;
    const aspect = w / h;
    const st = useApp.getState();
    const home = rig.route === 'home';
    const t = rig.time;
    const dt = rig.dt;
    const c = clock.current;

    pipeline.setSize(w, h, dpr);
    // the terminal is drawn to the shape of the machine's glass, which it fills
    os.setAspect(tube.hw / tube.hh);
    fitContent(aspect);

    // ── warm-up under the loader: textures a couple per frame, programs compiled asynchronously
    warmup.step(gl);
    if (tube.ready && !c.compiled) {
      c.compiled = true;
      warmup.add(benchScene);
      warmup.compile(gl, benchScene, benchCam, pipeline.bench).then(() => useApp.getState().setBenchReady(true));
    }
    // the loader's count, from the real work: downloads, then uploads and compiles, then settling
    if (st.stage === 'boot') {
      const w = warmup.done;
      const settle = c.primed ? 0.6 + Math.min(c.stable, 3) * 0.13 : Math.min(c.stable, 3) * 0.2;
      rig.boot = Math.max(rig.boot, st.allReady ? 1 : st.progress * 0.7 + (tube.ready ? w.uploads * 0.08 + w.compiles * 0.12 : 0) + settle * 0.1);
    }
    // readiness: the counter only reaches 100 once the scenes stop gaining meshes, textures and
    // programs, nothing is downloading, and everything found has been uploaded and compiled
    if (st.stage === 'boot' && tube.ready) {
      c.checkT += dt;
      if (c.checkT > 0.2) {
        c.checkT = 0;
        let meshes = 0;
        benchScene.traverse((o) => void ((o as THREE.Mesh).isMesh && meshes++));
        worksScene.traverse((o) => void ((o as THREE.Mesh).isMesh && meshes++));
        officeScene.traverse((o) => void ((o as THREE.Mesh).isMesh && meshes++));
        radioScene.traverse((o) => void ((o as THREE.Mesh).isMesh && meshes++));
        const sig = `${meshes}/${gl.info.programs?.length ?? 0}/${gl.info.memory.textures}`;
        if (sig !== c.sig || warmup.loading) {
          c.sig = sig;
          c.stable = 0;
          c.dirty = true;
        } else c.stable++;
        if (c.dirty && !warmup.loading) {
          c.dirty = false;
          c.worksCompiled = true;
          warmup.add(benchScene);
          warmup.add(worksScene);
          warmup.add(officeScene);
          warmup.add(radioScene);
          warmup.compile(gl, benchScene, benchCam, pipeline.bench);
          warmup.compile(gl, worksScene, worksCam, pipeline.works);
          warmup.compile(gl, officeScene, officeCam, pipeline.office);
          warmup.compile(gl, radioScene, radioCam, pipeline.radio);
        }
        if (c.stable >= 3 && warmup.idle() && st.benchReady && !st.allReady) {
          // last, under the counter: one unseen draw of everything, so no model uploads mid-scroll
          if (!c.primed) {
            c.primed = true;
            warmup.prime(gl, benchScene, benchCam, pipeline.bench);
            warmup.prime(gl, worksScene, worksCam, pipeline.works);
            warmup.prime(gl, radioScene, radioCam, pipeline.radio);
            gl.shadowMap.needsUpdate = true;
            warmup.prime(gl, officeScene, officeCam, pipeline.office);
            office.shadowDirty = true;
            c.stable = 2;
          } else st.setAllReady(true);
        }
      }
    }

    // ── the office, arriving after the page is up: its textures uploaded a few a frame, its
    //    programs compiled in the background, then one unseen draw at a moment the visitor is still
    if (office.loaded && c.office === 'wait' && !warmup.loading) {
      c.office = 'warming';
      warmup.add(officeScene);
      warmup.compile(gl, officeScene, officeCam, pipeline.office).then(() => (c.officeCompiled = true));
    } else if (c.office === 'warming' && c.officeCompiled && warmup.idle() && Math.abs(rig.velocity) < 40) {
      c.office = 'ready';
      gl.shadowMap.needsUpdate = true;
      warmup.prime(gl, officeScene, officeCam, pipeline.office);
      office.shadowDirty = true;
    }
    // the loop of film inside the camera arrives with the office, and is warmed up the same way
    if (reel.loaded && c.reel === 'wait' && !warmup.loading) {
      c.reel = 'warming';
      warmup.add(reelScene);
      warmup.compile(gl, reelScene, reelCam, pipeline.works).then(() => (c.reelCompiled = true));
    } else if (c.reel === 'warming' && c.reelCompiled && warmup.idle() && Math.abs(rig.velocity) < 40) {
      c.reel = 'ready';
      warmup.prime(gl, reelScene, reelCam, pipeline.works);
    }

    // ── the landing: the watch drops, the camera cranes after it, the lamp catches, the tube powers on
    if (st.stage === 'intro' || st.stage === 'ready') {
      if (rig.introStart < 0) {
        rig.introStart = t;
        if (!home || rig.scroll > 10 || rig.reducedMotion) rig.intro = 1;
      }
      const s = t - rig.introStart;
      const skipped = rig.intro >= 1 && s < 0.2;
      // the lamp catches while the counter fades; the lid is released; the camera follows it round
      rig.lamp = skipped ? 1 : lampAt(s + 0.8);
      if (skipped) {
        rig.lidOpen = 1;
        rig.lidV = 0;
      } else if (s > 0.85) {
        const [x, v] = spring(rig.lidOpen, rig.lidV, 1, 30, 7.5, Math.min(dt, 1 / 30));
        rig.lidOpen = Math.min(1.035, x);
        rig.lidV = v;
      }
      rig.intro = Math.max(rig.intro, smootherstep(invLerp(0.65, LANDING, s)));
      rig.power = skipped ? 1 : smoothstep(1.9, 2.5, s);
      if (st.stage === 'intro' && (s > 1.3 || rig.intro >= 1)) st.setStage('ready');
    }

    // ── the radio stands to the right of wherever you are: while the view swings across, the
    //    world's own camera turns round where it stands, and the radio is laid over what it sees
    const pan = radio.pan;
    if (pan > 0.0005) pipeline.renderRadio(radioScene, radioCam);
    if (home && st.stage === 'ready' && reel.on) {
      // inside the old camera the loop of film is the whole view: nothing else in 3D can be seen,
      // so it is all that is drawn (through the same glass), and the recordings keep their colours
      // (on the way out through the last frame, the dark in here gives way to the inner world the
      // last screen lies on: that is drawn first, and the film's own dark fades over it)
      const under = reel.world > 0;
      if (under) {
        sway(worksCam, pan);
        pipeline.renderWorks(worksScene, worksCam);
      }
      sway(reelCam, pan);
      pipeline.renderWorks(reelScene, reelCam, under);
      pipeline.runCrt(null, {
        os: 0,
        hasScene: true,
        bloom: perf.tier > 0 ? 0 : 0.3,
        tune: 0,
        flash: 0,
        power: 1,
        time: t,
        curve: CURVE,
        ca: 0.0035,
        scan: 0,
        radius: Math.min(38, Math.max(20, w * 0.024)),
        flicker: rig.reducedMotion ? 0 : 1,
        dim: 1,
        office: 0,
        portal: office.portal,
        beam: 0,
        bezel: 0,
        aspect,
      }, 1.05);
      pipeline.present('crt', { bloom: 0, vignette: 0, exposure: 1, grain: 0.05, time: t, tone: reel.world, pan });
    } else {
      // ── where are we: 0 = at the bench, 1 = inside the tube
      let tPose = 0;
      if (home) tPose = rig.exit > 0 ? 1 - smoothstep(0.02, 1, rig.exit) : rig.dive;
      else tPose = 1;
      const benchVisible = home && tube.ready && tPose < 0.9995;

      // ── what the tube shows: the terminal at the bench, the works once inside
      let osMix = 0;
      let tune = rig.tune;
      if (home) {
        if (rig.exit > 0) {
          osMix = smoothstep(0.42, 0.55, rig.exit);
          tune += bump(rig.exit, 0.36, 0.6);
          os.setMode('farewell');
        } else {
          osMix = 1 - smoothstep(0.2, 0.3, rig.dive);
          tune += bump(rig.dive, 0.16, 0.33);
          os.setMode('home');
        }
        os.setScripted(rig.exit > 0 ? 0 : invLerp(0.025, 0.15, rig.dive));
      }
      if (osMix > 0) os.update(t);
      // the terminal fills the whole glass; the works keep the viewport's shape, so the picture
      // changes shape on the way in (and out), under the tuning static
      tube.fill = !home ? 0 : rig.exit > 0 ? smoothstep(0.38, 0.55, rig.exit) : 1 - smoothstep(0.14, 0.3, rig.dive);
      tune = Math.min(1, tune);

      // during the boot the inner world is rendered too, unseen, so its first real frame is free
      const priming = st.stage === 'boot' && c.worksCompiled;
      // the office, while it shows: once it is the whole view the inner world is not drawn at all
      const inOffice = home && office.mix > 0;
      const sceneNeeded = (osMix < 1 && !(inOffice && office.full)) || priming;
      // (inside the tube the inner world is the view and turns with it; seen on the machine's screen it does not)
      if (!benchVisible) sway(worksCam, pan);
      if (sceneNeeded) pipeline.renderWorks(worksScene, worksCam);
      let beam = 0;
      if (inOffice || priming) {
        if (office.shadowDirty) {
          gl.shadowMap.needsUpdate = true;
          office.shadowDirty = false;
        }
        sway(officeCam, pan);
        pipeline.renderOffice(officeScene, officeCam);
        // the light through the window: fewer steps on slower machines, none on the slowest
        if (office.sun && perf.tier < 3) {
          const drawn = pipeline.renderBeams({
            camera: officeCam,
            sun: office.sun,
            box: office.room,
            color: SUN_COLOR,
            density: 0.085,
            steps: perf.tier >= 2 ? 10 : perf.tier === 1 ? 14 : 22,
            time: t,
          });
          if (drawn) beam = 1;
        }
      }
      // in the sunlit office the glow is kept for what really shines (the window, the sun on brass)
      const officeView = inOffice && office.full;
      pipeline.runCrt(os.texture, {
        os: osMix,
        hasScene: osMix < 1,
        bloom: perf.tier > 0 ? 0 : officeView ? 0.22 : 0.55,
        tune: rig.reducedMotion ? 0 : tune,
        flash: 0,
        power: home ? rig.power : 1,
        time: t,
        curve: CURVE,
        ca: 0.0035,
        scan: 0,
        radius: Math.min(38, Math.max(20, w * 0.024)),
        flicker: rig.reducedMotion ? 0 : 1,
        dim: 1,
        office: inOffice ? office.mix : 0,
        portal: office.portal,
        beam,
        // the rim belongs to the machine's screen: it goes as the view goes in through the glass
        bezel: benchVisible ? 1 - smoothstep(0.86, 0.9995, tPose) : 0,
        aspect: (tube.cw + (tube.hw - tube.cw) * tube.fill) / (tube.ch + (tube.hh - tube.ch) * tube.fill),
      }, officeView ? 2.2 : 1.1);

      if (benchVisible) {
        if (rig.intro < 1) {
          openingPose(rig.intro, aspect, rig.pointer.sx, rig.pointer.sy, t, pose);
        } else {
          benchPose(tPose, aspect, rig.pointer.sx, rig.pointer.sy, t, pose);
        }
        applyPose(benchCam, pose, w, h);
        sway(benchCam, pan);
        pipeline.renderBench(benchScene, benchCam);
        const e = smoothstep(0.7, 1, tPose);
        pipeline.present('bench', { bloom: perf.tier > 0 ? 0 : 0.55 * (1 - e), vignette: 0.55 * (1 - e), exposure: 1, grain: 0.04, time: t, pan }, 2.2);
        // the words hang still in front of where the camera rests (while it arrives, in front of
        // the camera itself); drawn over the finished picture so they keep the page's colours
        if (home && rig.exit === 0) {
          applyPose(wordsCam, rig.intro < 1 ? pose : heroAnchor(tPose, aspect, rig.pointer.sx, rig.pointer.sy, t, wordsPose), w, h);
          if (words.update(wordsCam, wordsCam.position.distanceTo(tube.C) * WORDS_DEPTH, w, h, t, st.stage === 'ready')) words.render(gl, benchCam, 1 - pan);
        }
      } else {
        pipeline.present('crt', { bloom: 0, vignette: 0, exposure: 1, grain: 0.05, time: t, pan });
      }
    }

    if (!st.glReady) {
      c.frames++;
      if (c.frames > 4) st.setGlReady(true);
    }

    // ── adaptive quality: when frames run long, first render fewer pixels, then drop the bloom;
    //    with headroom to spare, step back up. Only measured while the page is on screen and ready.
    perf.gl = gl;
    perf.dpr = dpr;
    perf.setDpr = setDpr;
    perf.scenes = [benchScene, worksScene, officeScene, reelScene, radioScene];
    if (st.stage === 'ready' && !document.hidden && !perf.locked) {
      c.perfT += dt;
      c.perfN++;
    }
    if (c.perfT > 2.5) {
      // judged by the typical frame, not the average: a one-off hitch (a video starting, a first
      // shader) must not cost everyone resolution for the rest of the visit
      const recent = Array.from(perf.interval).filter((v) => v > 0).sort((a, b) => a - b);
      const fps = recent.length ? 1000 / recent[Math.floor(recent.length * 0.6)] : c.perfN / c.perfT;
      const max = Math.min(window.devicePixelRatio || 1, rig.touch ? 1.5 : 1.75);
      const min = perf.tier >= 3 ? 0.5 : perf.tier >= 2 ? 0.6 : 0.8;
      if (fps < 44) {
        c.good = 0;
        if (dpr > min + 0.01) setDpr(Math.max(min, dpr - 0.25));
        else if (perf.tier < 3) perf.tier++;
      } else if (fps > 57) {
        c.good++;
        if (perf.tier > 0 && c.good >= 3) {
          perf.tier--;
          c.good = 0;
        } else if (perf.tier === 0 && dpr < max - 0.01) setDpr(Math.min(max, dpr + 0.125));
      }
      c.perfT = 0;
      c.perfN = 0;
    }
  }, 1);

  return (
    <>
      {createPortal(<Bench os={os} crt={pipeline.crtTexture} />, benchScene, { camera: benchCam })}
      {createPortal(<Works camera={worksCam} />, worksScene, { camera: worksCam, events: worksEvents as never })}
      {officeOn &&
        createPortal(
          <Suspense fallback={null}>
            <Office />
          </Suspense>,
          officeScene,
          { camera: officeCam },
        )}
      {createPortal(<RadioView camera={radioCam} />, radioScene, { camera: radioCam, events: worksEvents as never })}
      {officeOn &&
        createPortal(
          <Suspense fallback={null}>
            <Reel />
          </Suspense>,
          reelScene,
          { camera: reelCam, events: worksEvents as never },
        )}
    </>
  );
}

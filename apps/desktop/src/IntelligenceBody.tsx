import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
export type BodyState =
  'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'ALERT' | 'OFFLINE';
export type Quality = 'CINEMATIC' | 'HIGH' | 'BALANCED' | 'LOW_POWER';
export const qualityProfiles: Record<
  Quality,
  { count: number; ratio: number; fps: number; trails: number }
> = {
  CINEMATIC: { count: 24000, ratio: 2, fps: 60, trails: 1000 },
  HIGH: { count: 14000, ratio: 1.75, fps: 45, trails: 600 },
  BALANCED: { count: 7000, ratio: 1.25, fps: 30, trails: 280 },
  LOW_POWER: { count: 1800, ratio: 1, fps: 15, trails: 60 },
};
const vertex = `uniform float time;uniform float level;uniform float pulse;uniform float scale;attribute float seed;varying float brightness;void main(){vec3 p=position;float wave=sin(p.y*7.0+time*.7+seed*5.0)*cos(p.x*5.0-time*.25);p*=1.0+wave*(.018+level*.32)+pulse*.035;p.x+=sin(time*.18+p.z*2.0)*.035;vec4 mv=modelViewMatrix*vec4(p,1.0);brightness=.38+.62*seed;gl_Position=projectionMatrix*mv;gl_PointSize=clamp(scale*(1.1+seed*1.6+level*3.0)/(-mv.z),.6,5.0);}`;
const fragment = `uniform vec3 color;uniform float opacity;varying float brightness;void main(){float d=length(gl_PointCoord-vec2(.5));float a=smoothstep(.5,.05,d);gl_FragColor=vec4(color*brightness,a*opacity);}`;
export function IntelligenceBody({
  state,
  level,
  bands,
  quality,
  reduced,
  seed = 4281,
}: {
  state: BodyState;
  level: number;
  bands: readonly number[];
  quality: Quality;
  reduced: boolean;
  seed?: number;
}) {
  const host = useRef<HTMLDivElement>(null),
    data = useRef({ state, level, bands }),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    data.current = { state, level, bands };
  }, [state, level, bands]);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const profile = qualityProfiles[quality];
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: quality === 'CINEMATIC',
        powerPreference:
          quality === 'LOW_POWER' ? 'low-power' : 'high-performance',
      });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, profile.ratio));
    renderer.setClearColor(0x000000, 0);
    el.append(renderer.domElement);
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(35, 1, 0.1, 30);
    camera.position.z = 5.4;
    const group = new THREE.Group();
    scene.add(group);
    const geometries: THREE.BufferGeometry[] = [],
      materials: THREE.Material[] = [];
    let randomSeed = seed;
    const random = () => {
      randomSeed = (randomSeed * 1664525 + 1013904223) >>> 0;
      return randomSeed / 4294967296;
    };
    const positions = new Float32Array(profile.count * 3),
      seeds = new Float32Array(profile.count);
    for (let i = 0; i < profile.count; i++) {
      const y = 1 - 2 * random(),
        angle = random() * Math.PI * 2,
        radius = 0.75 + random() * 0.28,
        r = Math.sqrt(1 - y * y);
      positions.set(
        [
          Math.cos(angle) * r * radius,
          y * radius,
          Math.sin(angle) * r * radius,
        ],
        i * 3,
      );
      seeds[i] = random();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
    geometries.push(geometry);
    const material = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: {
        time: { value: 0 },
        level: { value: 0 },
        pulse: { value: 0 },
        scale: { value: 7 * renderer.getPixelRatio() },
        color: { value: new THREE.Color('#ffc775') },
        opacity: { value: 0.8 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    materials.push(material);
    group.add(new THREE.Points(geometry, material));
    const trails: number[] = [];
    for (let i = 0; i < profile.trails; i++) {
      const a = random() * Math.PI * 2,
        b = random() * Math.PI * 2,
        r = 0.84 + random() * 0.32;
      for (let j = 0; j < 4; j++) {
        const t = a + j * 0.015;
        trails.push(
          Math.cos(t) * Math.sin(b) * r,
          Math.cos(b) * r,
          Math.sin(t) * Math.sin(b) * r,
        );
        const u = t + 0.012;
        trails.push(
          Math.cos(u) * Math.sin(b) * r,
          Math.cos(b) * r,
          Math.sin(u) * Math.sin(b) * r,
        );
      }
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(trails, 3));
    geometries.push(tg);
    const tm = new THREE.LineBasicMaterial({
      color: '#dba75a',
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
    });
    materials.push(tm);
    group.add(new THREE.LineSegments(tg, tm));
    const rings: THREE.Line[] = [];
    for (let i = 0; i < 5; i++) {
      const pts: THREE.Vector3[] = [];
      for (let j = 0; j <= 220; j++) {
        const a = (j / 220) * Math.PI * (i % 2 ? 1.8 : 2),
          r = 1.23 + i * 0.085;
        pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
      }
      const rg = new THREE.BufferGeometry().setFromPoints(pts);
      const rm = new THREE.LineBasicMaterial({
        color: i === 4 ? '#8ddbec' : '#d9a857',
        transparent: true,
        opacity: i === 4 ? 0.2 : 0.1,
      });
      geometries.push(rg);
      materials.push(rm);
      const ring = new THREE.Line(rg, rm);
      ring.rotation.x = i === 4 ? 0.9 : 0;
      ring.rotation.y = i === 4 ? 0.4 : 0;
      scene.add(ring);
      rings.push(ring);
    }
    const resize = new ResizeObserver(() => {
      const w = el.clientWidth,
        h = el.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    });
    resize.observe(el);
    let frame = 0,
      last = 0,
      time = 0,
      smoothed = 0,
      visible = true,
      lastStatic = '';
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
    });
    observer.observe(el);
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (
        document.hidden ||
        !visible ||
        now - last < 1000 / (reduced ? 8 : profile.fps)
      )
        return;
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      time += reduced ? 0 : dt;
      const d = data.current;
      const live =
        d.state === 'SPEAKING'
          ? Math.min(1, d.level * 7 + (d.bands[1] ?? 0) * 2)
          : 0;
      const signature = `${d.state}:${live}:${renderer.domElement.width}:${renderer.domElement.height}`;
      if (reduced && signature === lastStatic) return;
      lastStatic = signature;
      smoothed = reduced ? live : smoothed + (live - smoothed) * 0.28;
      material.uniforms.time!.value = time;
      material.uniforms.level!.value = smoothed;
      material.uniforms.pulse!.value =
        d.state === 'LISTENING' ? 0.35 : d.state === 'THINKING' ? 0.2 : 0;
      material.uniforms.opacity!.value = d.state === 'OFFLINE' ? 0.3 : 0.84;
      material.uniforms.color!.value.set(
        d.state === 'ALERT'
          ? '#ff8169'
          : d.state === 'LISTENING'
            ? '#aeefff'
            : d.state === 'OFFLINE'
              ? '#67868f'
              : '#ffc775',
      );
      group.rotation.y = time * (d.state === 'THINKING' ? 0.12 : 0.045);
      group.rotation.z = Math.sin(time * 0.09) * 0.08;
      rings.forEach((r, i) => {
        r.rotation.z = time * (i % 2 ? -0.025 : 0.015);
      });
      renderer.render(scene, camera);
      // Observable compositor readiness for isolated visual capture, never a fake state.
      if (el.dataset.renderedState !== d.state)
        el.dataset.renderedState = d.state;
      if (reduced) el.dataset.renderedLevel = smoothed.toFixed(3);
    };
    frame = requestAnimationFrame(draw);
    const lost = (event: Event) => {
      event.preventDefault();
      setFailed(true);
    };
    renderer.domElement.addEventListener('webglcontextlost', lost);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      observer.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [quality, reduced, seed]);
  return (
    <div
      className={`intelligence-body ${failed ? 'body-fallback' : ''}`}
      ref={host}
      role="img"
      aria-label={`JARVIS presence: ${state.toLowerCase()}`}
    >
      {failed && <img src="/brand/approved-j-master.png" alt="JARVIS" />}
      <div className="body-crosshair horizontal" />
      <div className="body-crosshair vertical" />
    </div>
  );
}

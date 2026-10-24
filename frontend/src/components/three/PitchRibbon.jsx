import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import useInView, { prefersReducedMotion } from './useInView';

const RIBBON_VERT = /* glsl */ `
uniform float uTime; uniform float uMorph;
varying float vU; varying float vEdge;
const float NOTES[8] = float[8](0.0, 2.0, 4.0, 7.0, 4.0, 2.0, 0.0, 5.0);
float stepped(float u){
  float f = u * 8.0; float i = floor(f); float fr = fract(f);
  float a = NOTES[int(clamp(i, 0.0, 7.0))];
  float b = NOTES[int(clamp(i + 1.0, 0.0, 7.0))];
  return mix(a, b, smoothstep(0.82, 1.0, fr));      // glide only at note ends
}
void main(){
  vec3 p = position;
  float u = uv.x;
  float note = stepped(u);
  float f = u * 8.0;
  float wobble = 0.55 * sin(f * 9.0 + uTime * 3.0) + 0.35 * sin(f * 23.0 - uTime * 4.0)
               + 0.6 * sin(floor(f) * 12.9898);       // each note off-pitch
  float vib = 0.18 * sin(u * 140.0 - uTime * 6.0) * smoothstep(0.25, 0.6, fract(f));
  float y = note + mix(wobble, vib, uMorph);
  p.x = (u - 0.5) * 12.0;
  p.y = y * 0.32 - 1.0 + (uv.y - 0.5) * 0.16;
  p.z = sin(u * 6.2831 + uTime * 0.4) * 0.8;
  vU = u; vEdge = uv.y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const RIBBON_FRAG = /* glsl */ `
uniform float uMorph; uniform float uTime;
varying float vU; varying float vEdge;
void main(){
  vec3 raw = vec3(0.98, 0.45, 0.52);
  vec3 tuned = mix(vec3(0.898, 0.663, 0.345), vec3(0.247, 0.878, 0.773), vU);
  vec3 c = mix(raw, tuned, uMorph);
  float edge = 1.0 - abs(vEdge - 0.5) * 2.0;
  float pulse = 0.6 + 0.4 * sin(vU * 40.0 - uTime * 3.0);
  gl_FragColor = vec4(c * (0.7 + 0.6 * pulse), edge * 0.95);
}`;

/** A 3D ribbon that morphs a shaky sung line into a clean melody, over note lanes. */
export default function PitchRibbon({ className = '' }) {
  const [wrapRef, inView] = useInView();
  const mountRef = useRef(null);
  const inViewRef = useRef(inView);
  useEffect(() => { inViewRef.current = inView; }, [inView]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    mount.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0.6, 9);
    camera.lookAt(0, -0.75, 0);

    const uniforms = { uTime: { value: 0 }, uMorph: { value: 0 } };
    const ribbon = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1, 600, 2),
      new THREE.ShaderMaterial({
        uniforms, vertexShader: RIBBON_VERT, fragmentShader: RIBBON_FRAG,
        transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      }),
    );
    scene.add(ribbon);

    // note lanes (in-scale semitones) as thin glowing planes receding in depth
    const lanes = new THREE.Group();
    [0, 2, 4, 5, 7, 9].forEach((n) => {
      const lane = new THREE.Mesh(
        new THREE.PlaneGeometry(13, 0.012),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12 }),
      );
      lane.position.set(0, n * 0.32 - 1.0, -0.6);
      lanes.add(lane);
    });
    scene.add(lanes);

    // dust
    const N = 500;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 16;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 6;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 6 - 1;
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const dust = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xe5a958, size: 0.025, transparent: true, opacity: 0.5 }));
    scene.add(dust);

    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      camera.aspect = w / h;
      camera.position.z = w < 640 ? 13 : 9;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    const still = prefersReducedMotion();
    if (still) uniforms.uMorph.value = 1;
    const clock = new THREE.Clock();
    let raf;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!inViewRef.current && !still) return;
      const t = clock.getElapsedTime();
      uniforms.uTime.value = t;
      if (!still) {
        // 6s loop: hold shaky, morph to tuned, hold, release
        const c = t % 7;
        uniforms.uMorph.value = c < 1.5 ? 0 : c < 3 ? (c - 1.5) / 1.5 : c < 6 ? 1 : 1 - (c - 6);
        uniforms.uMorph.value = uniforms.uMorph.value * uniforms.uMorph.value * (3 - 2 * uniforms.uMorph.value);
      }
      scene.rotation.y = Math.sin(t * 0.25) * 0.25;
      scene.rotation.x = -0.12 + Math.sin(t * 0.2) * 0.05;
      dust.rotation.y = t * 0.02;
      renderer.render(scene, camera);
      if (still) cancelAnimationFrame(raf);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      scene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div ref={wrapRef} className={className} aria-hidden="true">
      <div ref={mountRef} className="w-full h-full" />
    </div>
  );
}

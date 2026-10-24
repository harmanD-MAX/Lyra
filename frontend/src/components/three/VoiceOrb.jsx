import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import useInView, { prefersReducedMotion } from './useInView';

// Ashima 3D simplex noise (MIT)
const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

const ORB_VERT = /* glsl */ `
uniform float uTime; uniform float uEnergy;
varying vec3 vNormal; varying vec3 vView; varying float vDisp;
${NOISE}
void main(){
  vec3 p = position;
  float n = snoise(normal * 1.6 + vec3(uTime * 0.35));
  float ripple = sin(8.0 * p.y + uTime * 2.4) * 0.04;
  float d = (n * 0.22 + ripple) * (0.55 + uEnergy);
  vDisp = d;
  p += normal * d;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const ORB_FRAG = /* glsl */ `
uniform vec3 uColorA; uniform vec3 uColorB; uniform float uTime;
varying vec3 vNormal; varying vec3 vView; varying float vDisp;
void main(){
  float fres = pow(1.0 - max(dot(vNormal, vView), 0.0), 2.4);
  vec3 col = mix(uColorA, uColorB, smoothstep(-0.15, 0.25, vDisp));
  float bands = 0.5 + 0.5 * sin(vDisp * 60.0 + uTime);
  vec3 c = col * (0.18 + 0.35 * bands) + col * fres * 1.6;
  gl_FragColor = vec4(c, 0.55 + fres * 0.45);
}`;

/**
 * A living "voice" orb: noise-displaced sphere, particle halo and orbit rings.
 * Reacts to the cursor; pauses when off-screen.
 */
export default function VoiceOrb({ className = '', colorA = '#e5a958', colorB = '#3fe0c5', scale = 1, interactive = true, active = false, levelRef = null }) {
  const [wrapRef, inView] = useInView();
  const mountRef = useRef(null);
  const inViewRef = useRef(inView);
  const activeRef = useRef(active);
  const levelSrc = useRef(levelRef);
  useEffect(() => { levelSrc.current = levelRef; }, [levelRef]);
  useEffect(() => { inViewRef.current = inView; }, [inView]);
  useEffect(() => { activeRef.current = active; }, [active]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 0, 6.2);

    const group = new THREE.Group();
    group.scale.setScalar(scale);
    scene.add(group);

    const uniforms = {
      uTime: { value: 0 },
      uEnergy: { value: 0.35 },
      uColorA: { value: new THREE.Color(colorA) },
      uColorB: { value: new THREE.Color(colorB) },
    };
    const orb = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.35, 28),
      new THREE.ShaderMaterial({ uniforms, vertexShader: ORB_VERT, fragmentShader: ORB_FRAG, transparent: true, depthWrite: false }),
    );
    group.add(orb);

    const wire = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.75, 2),
      new THREE.MeshBasicMaterial({ color: colorA, wireframe: true, transparent: true, opacity: 0.08 }),
    );
    group.add(wire);

    // particle halo
    const N = 900;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 2.1 + Math.random() * 1.4;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th) * 0.55;
      pos[i * 3 + 2] = r * Math.cos(ph);
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const points = new THREE.Points(pg, new THREE.PointsMaterial({ color: colorB, size: 0.022, transparent: true, opacity: 0.7, depthWrite: false }));
    group.add(points);

    // orbit rings
    const rings = [0, 1, 2].map((i) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.9 + i * 0.32, 0.006, 8, 160),
        new THREE.MeshBasicMaterial({ color: i % 2 ? colorB : colorA, transparent: true, opacity: 0.45 - i * 0.1 }),
      );
      ring.rotation.set(Math.PI / 2 + (i - 1) * 0.35, i * 0.5, 0);
      group.add(ring);
      return ring;
    });

    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    const target = { x: 0, y: 0, e: 0.35 };
    const onMove = (e) => {
      if (!interactive) return;
      const nx = e.clientX / window.innerWidth - 0.5;
      const ny = e.clientY / window.innerHeight - 0.5;
      target.x = nx;
      target.y = ny;
      target.e = 0.3 + Math.min(1, Math.hypot(nx, ny) * 1.8) * 0.7;
    };
    window.addEventListener('pointermove', onMove, { passive: true });

    const still = prefersReducedMotion();
    const clock = new THREE.Clock();
    let raf;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!inViewRef.current && !still) return;
      const t = clock.getElapsedTime();
      uniforms.uTime.value = t;
      // `active` (playing / recording / rendering) makes the orb pulse like a voice
      // with a live level (real audio), pulse with the music; otherwise a voice-like wobble
      const lvl = levelSrc.current?.current;
      const goal = activeRef.current
        ? (typeof lvl === 'number' && lvl > 0 ? 0.45 + lvl * 1.9 : 0.95 + 0.35 * Math.abs(Math.sin(t * 3.1) * Math.sin(t * 1.7)))
        : target.e;
      uniforms.uEnergy.value += (goal - uniforms.uEnergy.value) * (activeRef.current ? 0.12 : 0.04);
      group.rotation.y += ((target.x * 0.8 + t * (activeRef.current ? 0.22 : 0.08)) - group.rotation.y) * 0.03;
      group.rotation.x += (target.y * 0.5 - group.rotation.x) * 0.03;
      points.rotation.y = t * 0.04;
      wire.rotation.z = -t * 0.05;
      rings.forEach((r, i) => { r.rotation.z = t * (0.12 + i * 0.05) * (i % 2 ? -1 : 1); });
      renderer.render(scene, camera);
      if (still) cancelAnimationFrame(raf);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('pointermove', onMove);
      scene.traverse((o) => {
        o.geometry?.dispose();
        o.material?.dispose();
      });
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [colorA, colorB, scale, interactive]);

  return (
    <div ref={wrapRef} className={className} aria-hidden="true">
      <div ref={mountRef} className="w-full h-full" />
    </div>
  );
}

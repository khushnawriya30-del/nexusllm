'use client';

import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, MeshDistortMaterial, Environment, Sphere, Icosahedron, Box, Torus } from '@react-three/drei';
import { useScroll, useMotionValue, useSpring } from 'framer-motion';

// Mouse tracker hook — tracks the pointer over the window, normalized to [-1, 1]
function useMouse() {
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const smx = useSpring(mx, { stiffness: 50, damping: 20, mass: 0.5 });
  const smy = useSpring(my, { stiffness: 50, damping: 20, mass: 0.5 });
  React.useEffect(() => {
    const handler = (e) => {
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = -((e.clientY / window.innerHeight) * 2 - 1);
      mx.set(x);
      my.set(y);
    };
    window.addEventListener('mousemove', handler);
    return () => window.removeEventListener('mousemove', handler);
  }, [mx, my]);
  return { mx: smx, my: smy };
}

// A single floating shape
function FloatingShape({ shape = 'sphere', position, color, scale = 1, mouse, scroll, zRange = [0, -8], rotRange = [0, Math.PI * 2], offset = 0 }) {
  const ref = useRef();
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    const mxVal = mouse.mx.get();
    const myVal = mouse.my.get();
    const scr = scroll.get();
    // Base position + parallax from mouse + Z-shift from scroll
    const zShift = zRange[0] + (zRange[1] - zRange[0]) * scr;
    ref.current.position.x = position[0] + mxVal * 0.8 + Math.sin(t * 0.5 + offset) * 0.15;
    ref.current.position.y = position[1] + myVal * 0.6 + Math.cos(t * 0.4 + offset) * 0.15;
    ref.current.position.z = position[2] + zShift;
    // Rotation tied to scroll + slight idle rotation
    const rot = rotRange[0] + (rotRange[1] - rotRange[0]) * scr;
    ref.current.rotation.x = rot + t * 0.05 + mxVal * 0.3;
    ref.current.rotation.y = rot * 0.7 + t * 0.08 + myVal * 0.3;
    ref.current.rotation.z = rot * 0.3;
  });

  const Geom = shape === 'sphere' ? Sphere : shape === 'ico' ? Icosahedron : shape === 'box' ? Box : Torus;
  const args = shape === 'torus' ? [1, 0.35, 32, 64] : shape === 'box' ? [1.4, 1.4, 1.4] : [1, 1];

  return (
    <Float speed={1.2} rotationIntensity={0.4} floatIntensity={0.6}>
      <Geom ref={ref} args={args} scale={scale}>
        <MeshDistortMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.4}
          envMapIntensity={1.5}
          metalness={0.6}
          roughness={0.15}
          distort={0.4}
          speed={2}
          transparent
          opacity={0.9}
        />
      </Geom>
    </Float>
  );
}

function Particles({ count = 200, mouse }) {
  const ref = useRef();
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 30;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 20;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 20;
    }
    return arr;
  }, [count]);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    ref.current.rotation.y = t * 0.02 + mouse.mx.get() * 0.2;
    ref.current.rotation.x = mouse.my.get() * 0.2;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.05} color="#a78bfa" transparent opacity={0.7} sizeAttenuation />
    </points>
  );
}

function SceneContent({ scroll }) {
  const mouse = useMouse();
  useFrame((state) => {
    // Camera parallax
    const mxVal = mouse.mx.get();
    const myVal = mouse.my.get();
    state.camera.position.x += (mxVal * 0.6 - state.camera.position.x) * 0.05;
    state.camera.position.y += (myVal * 0.4 - state.camera.position.y) * 0.05;
    state.camera.lookAt(0, 0, 0);
  });

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={1.2} color="#a78bfa" />
      <directionalLight position={[-5, -3, 2]} intensity={0.8} color="#60a5fa" />
      <pointLight position={[0, 0, 5]} intensity={1} color="#34d399" />

      <FloatingShape shape="sphere" position={[-3.5, 1.5, 0]} color="#a78bfa" scale={1.2} mouse={mouse} scroll={scroll} zRange={[0, -6]} rotRange={[0, Math.PI * 1.5]} offset={0} />
      <FloatingShape shape="ico" position={[3.5, 1, -1]} color="#60a5fa" scale={1.1} mouse={mouse} scroll={scroll} zRange={[0, -4]} rotRange={[0, -Math.PI * 2]} offset={1.2} />
      <FloatingShape shape="torus" position={[0, -2, -2]} color="#34d399" scale={1.0} mouse={mouse} scroll={scroll} zRange={[0, 4]} rotRange={[0, Math.PI * 3]} offset={2.4} />
      <FloatingShape shape="box" position={[-2.5, -1.5, -3]} color="#f472b6" scale={0.8} mouse={mouse} scroll={scroll} zRange={[0, -8]} rotRange={[0, Math.PI * 2.5]} offset={3.1} />
      <FloatingShape shape="sphere" position={[2.8, -2, -4]} color="#fbbf24" scale={0.7} mouse={mouse} scroll={scroll} zRange={[0, 6]} rotRange={[0, -Math.PI * 1.8]} offset={4.2} />
      <FloatingShape shape="ico" position={[0, 2.5, -5]} color="#06b6d4" scale={0.9} mouse={mouse} scroll={scroll} zRange={[0, -10]} rotRange={[0, Math.PI * 2.2]} offset={5.5} />

      <Particles count={300} mouse={mouse} />
      <Environment preset="city" />
    </>
  );
}

export default function Scene3D() {
  const { scrollYProgress } = useScroll();
  const scrollSmooth = useSpring(scrollYProgress, { stiffness: 80, damping: 30, mass: 0.5 });

  return (
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
      <Canvas camera={{ position: [0, 0, 8], fov: 55 }} dpr={[1, 1.5]} gl={{ antialias: true, alpha: true }} style={{ background: 'transparent' }}>
        <SceneContent scroll={scrollSmooth} />
      </Canvas>
    </div>
  );
}

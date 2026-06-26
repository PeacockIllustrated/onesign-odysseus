'use client';

/**
 * Storefront Studio — R3F render of the parametric block model.
 *
 * Consumes `StorefrontBlock[]` from `lib/storefront` (pure engine) and draws
 * each block as a box, mm → metres. Materials per block kind: translucent
 * glass, emissive keyline, matte blue frame/panel. Lit with a simple rig
 * (ambient + hemisphere + a shadow-casting key light) + contact shadows —
 * self-contained, no external HDRI fetch. Loaded ssr:false by the client
 * wrapper (R3F can't server-render).
 */

import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import {
    DEFAULT_TEMPLATE,
    specToBlocks,
    type StorefrontBlock,
    type StorefrontMaterial,
    type StorefrontSpec,
} from '@/lib/storefront';

function BlockMesh({ b, colours }: { b: StorefrontBlock; colours: Record<StorefrontMaterial, string> }) {
    const col = colours[b.material];
    // mm → m; storefront y (negative = toward street/viewer) → three +z (toward camera).
    const pos: [number, number, number] = [(b.x + b.w / 2) / 1000, (b.z + b.h / 2) / 1000, -(b.y + b.d / 2) / 1000];
    const size: [number, number, number] = [b.w / 1000, b.h / 1000, b.d / 1000];
    return (
        <mesh position={pos} castShadow receiveShadow>
            <boxGeometry args={size} />
            {b.material === 'glass' ? (
                <meshStandardMaterial color={col} transparent opacity={0.35} roughness={0.05} metalness={0.15} />
            ) : b.material === 'keyline' ? (
                <meshStandardMaterial color={col} emissive={col} emissiveIntensity={1.6} toneMapped={false} />
            ) : (
                <meshStandardMaterial color={col} roughness={0.62} metalness={0.06} />
            )}
        </mesh>
    );
}

export default function StorefrontScene({ spec = DEFAULT_TEMPLATE }: { spec?: StorefrontSpec }) {
    const blocks = useMemo(() => specToBlocks(spec), [spec]);
    const centreX = spec.widthMm / 2000; // metres — centre the facade on the origin

    return (
        <Canvas shadows dpr={[1, 2]} camera={{ position: [3.4, 2.0, 5.4], fov: 38 }} gl={{ antialias: true }}>
            <color attach="background" args={['#e4f0f8']} />
            <ambientLight intensity={0.55} />
            <hemisphereLight args={['#ffffff', '#9fb8c8', 0.5]} />
            <directionalLight
                position={[4, 7, 5]}
                intensity={1.45}
                castShadow
                shadow-mapSize={[2048, 2048]}
                shadow-camera-left={-6}
                shadow-camera-right={6}
                shadow-camera-top={6}
                shadow-camera-bottom={-6}
            />
            <group position={[-centreX, 0, 0]}>
                {blocks.map((b) => (
                    <BlockMesh key={b.id} b={b} colours={spec.colours} />
                ))}
            </group>
            <ContactShadows position={[0, 0.001, 0]} opacity={0.42} scale={14} blur={2.6} far={5} />
            <OrbitControls target={[0, spec.heightMm / 2000, 0]} enablePan makeDefault />
        </Canvas>
    );
}

'use client';

// app/(portal)/admin/visualiser/useSceneInteraction.ts
//
// The interactive overlay wiring for the 3D scene — material-group path
// picking + manual fixing / cable-hole placement — derived from the store and
// the geometry pipeline. VisualiserClient has its own inline copy (it also
// drives the flat view); this shared hook lets the cinematic shells (the
// concept and the public wizard) get the SAME 3D interactivity without a flat
// tab to fall back to, so clicking a path in 3D selects it.

import { useMemo } from 'react';
import { useVisualiser } from './store';
import { GROUP_HIGHLIGHT_PALETTE } from '@/lib/visualiser/types';
import type { usePanelDerivation } from './usePanelDerivation';

type Deriv = ReturnType<typeof usePanelDerivation>;

export function useSceneInteraction(deriv: Deriv) {
    const {
        params,
        fixingMode,
        cableMode,
        addManualFixing,
        removeManualFixing,
        addCableHole,
        removeCableHole,
        editingGroupId,
        pendingPaths,
        togglePendingPath,
        startGroupEditFromPath,
    } = useVisualiser();

    const {
        placementXf,
        reference,
        fixingDiameter,
        cableHoleDiameter,
        cableHoles,
        imported,
        groupByPath,
    } = deriv;

    const isEditingGroup = editingGroupId !== null;
    const pendingPathsSet = useMemo(() => new Set(pendingPaths), [pendingPaths]);

    // Per-imported-path group highlight colour (same palette mapping the flat
    // canvas uses) so grouped paths read apart in 3D too.
    const pathGroupColors = useMemo(() => {
        if (!imported) return null;
        const groups = params.materialGroups ?? [];
        const positionById = new Map<string, number>();
        groups.forEach((g, i) => positionById.set(g.id, i));
        return imported.paths.map((_, i) => {
            const g = groupByPath.get(i);
            if (!g) return null;
            const pos = positionById.get(g.id) ?? 0;
            return GROUP_HIGHLIGHT_PALETTE[pos % GROUP_HIGHLIGHT_PALETTE.length];
        });
    }, [imported, params.materialGroups, groupByPath]);

    // Even-odd inside test across the standoff reference rings — rejects clicks
    // on the panel background when placing fixings.
    const insideLettering = (p: [number, number]): boolean => {
        let n = 0;
        for (const r of reference) {
            const ring = r.points;
            let inside = false;
            let j = ring.length - 1;
            for (let i = 0; i < ring.length; i++) {
                const xi = ring[i][0];
                const yi = ring[i][1];
                const xj = ring[j][0];
                const yj = ring[j][1];
                if (
                    yi > p[1] !== yj > p[1] &&
                    p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi || 1e-12) + xi
                ) {
                    inside = !inside;
                }
                j = i;
            }
            if (inside) n++;
        }
        return n % 2 === 1;
    };

    const handleFixingClick = (p: [number, number]) => {
        if (fixingMode === 'place') {
            if (!placementXf) return;
            if (reference.length === 0) return;
            if (!insideLettering(p)) return;
            addManualFixing(placementXf.toLocal(p));
            return;
        }
        if (fixingMode === 'delete') {
            if (!placementXf) return;
            const stored = params.manualFixings ?? [];
            if (stored.length === 0) return;
            const tol = Math.max(fixingDiameter / 2, 6) * 1.4;
            let bestIdx = -1;
            let bestDist = tol;
            for (let i = 0; i < stored.length; i++) {
                const [fx, fy] = placementXf.toFlat(stored[i]);
                const d = Math.hypot(fx - p[0], fy - p[1]);
                if (d < bestDist) {
                    bestDist = d;
                    bestIdx = i;
                }
            }
            if (bestIdx >= 0) removeManualFixing(bestIdx);
            return;
        }
        if (cableMode === 'place') {
            if (!placementXf) return;
            addCableHole(placementXf.toLocal(p));
            return;
        }
        if (cableMode === 'delete') {
            if (!placementXf) return;
            const stored = params.cableHoles ?? [];
            if (stored.length === 0) return;
            const tol = Math.max(cableHoleDiameter / 2, 6) * 1.4;
            let bestIdx = -1;
            let bestDist = tol;
            for (let i = 0; i < stored.length; i++) {
                const [fx, fy] = placementXf.toFlat(stored[i]);
                const d = Math.hypot(fx - p[0], fy - p[1]);
                if (d < bestDist) {
                    bestDist = d;
                    bestIdx = i;
                }
            }
            if (bestIdx >= 0) removeCableHole(bestIdx);
        }
    };

    // Disabled while a placement workflow is active so a click that lands on a
    // letter drops the hole/fixing rather than hijacking it into group select.
    const handlePathPick =
        fixingMode === 'off' && cableMode === 'off'
            ? (i: number) => {
                  if (isEditingGroup) togglePendingPath(i);
                  else startGroupEditFromPath(i);
              }
            : undefined;

    return {
        isEditingGroup,
        pendingPathsSet,
        pathGroupColors,
        handlePathPick,
        handleFixingClick,
        fixingMode,
        cableMode,
        cableHoles,
    };
}

'use client';

import { Source, Layer } from 'react-map-gl/mapbox';
import type { TrafficStatus } from '@/lib/mapbox/types';

export interface ActiveRoute {
    id: string;
    siteName: string;
    geometry: GeoJSON.LineString;
    distance: number;
    duration: number;
    trafficStatus: TrafficStatus;
    colour: string;
}

const ROUTE_PALETTE = ['#4e7e8c', '#dc2626', '#16a34a', '#d97706', '#7c3aed'];

export function getRouteColour(index: number): string {
    return ROUTE_PALETTE[index % ROUTE_PALETTE.length];
}

interface Props {
    routes: ActiveRoute[];
}

export function RouteLayer({ routes }: Props) {
    return (
        <>
            {routes.map((route) => (
                <Source
                    key={route.id}
                    id={`route-${route.id}`}
                    type="geojson"
                    data={{ type: 'Feature', geometry: route.geometry, properties: {} }}
                >
                    <Layer
                        id={`route-line-${route.id}`}
                        type="line"
                        paint={{
                            'line-color': route.colour,
                            'line-width': 4,
                            'line-opacity': 0.8,
                        }}
                    />
                </Source>
            ))}
        </>
    );
}

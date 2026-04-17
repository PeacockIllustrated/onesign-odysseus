'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import Map, { Marker, Popup, NavigationControl } from 'react-map-gl/mapbox';
import type { MapRef } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { SitePin } from './page';
import { MapPopup } from './MapPopup';
import { getRoute } from '@/lib/mapbox/client';
import { ONESIGN_HQ } from '@/lib/mapbox/utils';
import { RouteLayer, getRouteColour, type ActiveRoute } from './RouteLayer';
import { RouteInfoBar } from './RouteInfoBar';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

// Mapbox style URL — customisable via env var. Default is Mapbox light.
// To brand for Onesign: create a custom style in Mapbox Studio with
// #4e7e8c accent, #1a1f23 dark tones, and paste the style URL here.
const MAP_STYLE = process.env.NEXT_PUBLIC_MAPBOX_STYLE
    ?? 'mapbox://styles/mapbox/light-v11';

const COLOUR_MAP: Record<string, string> = {
    red: '#dc2626',
    amber: '#d97706',
    green: '#16a34a',
    blue: '#2563eb',
    grey: '#9ca3af',
};

const FILTER_KEYS = ['quotes', 'artwork', 'production', 'deliveries', 'maintenance'] as const;
type FilterKey = typeof FILTER_KEYS[number];

const FILTER_LABELS: Record<FilterKey, string> = {
    quotes: 'Quotes',
    artwork: 'Artwork',
    production: 'Production',
    deliveries: 'Deliveries',
    maintenance: 'Maintenance',
};

interface Props {
    pins: SitePin[];
}

export function MapClient({ pins }: Props) {
    const [filters, setFilters] = useState<Record<FilterKey, boolean>>({
        quotes: true,
        artwork: true,
        production: true,
        deliveries: true,
        maintenance: true,
    });
    const [selectedPin, setSelectedPin] = useState<SitePin | null>(null);
    const [routes, setRoutes] = useState<ActiveRoute[]>([]);
    const [isTilted, setIsTilted] = useState(false);
    const mapRef = useRef<MapRef>(null);

    const toggle = (key: FilterKey) => {
        setFilters((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const visiblePins = useMemo(() => {
        return pins.filter((pin) => {
            return FILTER_KEYS.some((k) => filters[k] && pin[k] > 0);
        });
    }, [pins, filters]);

    const handleMarkerClick = useCallback((pin: SitePin) => {
        setSelectedPin(pin);
    }, []);

    const handleShowRoute = useCallback(async (pin: SitePin) => {
        if (routes.some((r) => r.id === pin.siteId)) return;
        try {
            const result = await getRoute(ONESIGN_HQ.lng, ONESIGN_HQ.lat, pin.lng, pin.lat);
            setRoutes((prev) => [
                ...prev,
                {
                    id: pin.siteId,
                    siteName: pin.siteName,
                    geometry: result.geometry,
                    distance: result.distance,
                    duration: result.duration,
                    trafficStatus: result.trafficStatus,
                    colour: getRouteColour(prev.length),
                },
            ]);
            setSelectedPin(null);
        } catch (err) {
            console.warn('Failed to fetch route:', err);
        }
    }, [routes]);

    // 3D buildings: add extrusion layer on map load
    const handleMapLoad = useCallback((evt: any) => {
        const map = evt.target;
        const layers = map.getStyle()?.layers ?? [];
        // Insert buildings beneath the first symbol (label) layer.
        let labelLayerId: string | undefined;
        for (const layer of layers) {
            if (layer.type === 'symbol' && (layer as any).layout?.['text-field']) {
                labelLayerId = layer.id;
                break;
            }
        }
        if (!map.getLayer('3d-buildings')) {
            map.addLayer(
                {
                    id: '3d-buildings',
                    source: 'composite',
                    'source-layer': 'building',
                    type: 'fill-extrusion',
                    minzoom: 15,
                    paint: {
                        'fill-extrusion-color': '#ddd',
                        'fill-extrusion-height': ['get', 'height'],
                        'fill-extrusion-base': ['get', 'min_height'],
                        'fill-extrusion-opacity': 0.7,
                    },
                },
                labelLayerId
            );
        }
    }, []);

    // Fly to a site at street level with 3D tilt
    const flyToSite = useCallback((lat: number, lng: number) => {
        mapRef.current?.flyTo({
            center: [lng, lat],
            zoom: 17,
            pitch: 60,
            bearing: -20,
            duration: 2000,
        });
        setIsTilted(true);
        setSelectedPin(null);
    }, []);

    // Reset to flat overview
    const resetView = useCallback(() => {
        mapRef.current?.flyTo({
            center: [-2.5, 54.5],
            zoom: 5.5,
            pitch: 0,
            bearing: 0,
            duration: 1500,
        });
        setIsTilted(false);
    }, []);

    if (!MAPBOX_TOKEN) {
        return (
            <div className="h-[600px] bg-neutral-100 rounded-lg flex items-center justify-center text-neutral-500 text-sm">
                <div className="text-center space-y-2">
                    <p className="font-semibold">Mapbox token not configured</p>
                    <p className="text-xs text-neutral-400">
                        Set <code className="bg-neutral-200 px-1 rounded">NEXT_PUBLIC_MAPBOX_TOKEN</code> in your environment variables.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div>
            {/* Filter bar */}
            <div className="flex flex-wrap gap-2 mb-3">
                {FILTER_KEYS.map((key) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => toggle(key)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
                            filters[key]
                                ? 'bg-black text-white border-black'
                                : 'bg-white text-neutral-500 border-neutral-300'
                        }`}
                    >
                        {FILTER_LABELS[key]}
                    </button>
                ))}
                <span className="text-xs text-neutral-400 self-center ml-2">
                    {visiblePins.length} site{visiblePins.length !== 1 ? 's' : ''}
                </span>
                {routes.length > 0 && (
                    <button
                        type="button"
                        onClick={() => setRoutes([])}
                        className="px-3 py-1.5 text-xs font-semibold rounded-full border border-red-300 text-red-600 hover:bg-red-50"
                    >
                        clear routes
                    </button>
                )}
            </div>

            <RouteInfoBar
                routes={routes}
                onRemove={(id) => setRoutes((prev) => prev.filter((r) => r.id !== id))}
                onClearAll={() => setRoutes([])}
            />

            {/* Map */}
            <div className="rounded-lg overflow-hidden border border-neutral-200 relative" style={{ height: 600 }}>
                {isTilted && (
                    <button
                        onClick={resetView}
                        className="absolute top-3 left-3 z-10 px-3 py-2 bg-white border border-neutral-200 rounded-lg shadow text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                    >
                        ↩ reset view
                    </button>
                )}
                <Map
                    ref={mapRef}
                    mapboxAccessToken={MAPBOX_TOKEN}
                    mapStyle={MAP_STYLE}
                    initialViewState={{
                        latitude: 54.5,
                        longitude: -2.5,
                        zoom: 5.5,
                    }}
                    style={{ width: '100%', height: '100%' }}
                    onLoad={handleMapLoad}
                >
                    <NavigationControl position="top-right" />

                    {visiblePins.map((pin) => {
                        const colour = COLOUR_MAP[pin.colour] ?? COLOUR_MAP.grey;
                        return (
                            <Marker
                                key={pin.siteId}
                                latitude={pin.lat}
                                longitude={pin.lng}
                                anchor="center"
                                onClick={(e) => {
                                    e.originalEvent.stopPropagation();
                                    handleMarkerClick(pin);
                                }}
                            >
                                <div
                                    style={{
                                        width: 16,
                                        height: 16,
                                        borderRadius: '50%',
                                        background: colour,
                                        border: '2.5px solid #fff',
                                        boxShadow: '0 1px 4px rgba(0,0,0,.3)',
                                        cursor: 'pointer',
                                    }}
                                />
                            </Marker>
                        );
                    })}

                    <RouteLayer routes={routes} />

                    {selectedPin && (
                        <Popup
                            latitude={selectedPin.lat}
                            longitude={selectedPin.lng}
                            anchor="bottom"
                            onClose={() => setSelectedPin(null)}
                            closeOnClick={false}
                            offset={12}
                        >
                            <MapPopup pin={selectedPin} onShowRoute={handleShowRoute} onViewSite={flyToSite} />
                        </Popup>
                    )}
                </Map>
            </div>
        </div>
    );
}

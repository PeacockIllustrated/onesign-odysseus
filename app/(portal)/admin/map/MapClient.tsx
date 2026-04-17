'use client';

import { useState, useMemo, useCallback } from 'react';
import Map, { Marker, Popup, NavigationControl } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { SitePin } from './page';
import { MapPopup } from './MapPopup';

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
            </div>

            {/* Map */}
            <div className="rounded-lg overflow-hidden border border-neutral-200" style={{ height: 600 }}>
                <Map
                    mapboxAccessToken={MAPBOX_TOKEN}
                    mapStyle={MAP_STYLE}
                    initialViewState={{
                        latitude: 54.5,
                        longitude: -2.5,
                        zoom: 5.5,
                    }}
                    style={{ width: '100%', height: '100%' }}
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

                    {selectedPin && (
                        <Popup
                            latitude={selectedPin.lat}
                            longitude={selectedPin.lng}
                            anchor="bottom"
                            onClose={() => setSelectedPin(null)}
                            closeOnClick={false}
                            offset={12}
                        >
                            <MapPopup pin={selectedPin} />
                        </Popup>
                    )}
                </Map>
            </div>
        </div>
    );
}

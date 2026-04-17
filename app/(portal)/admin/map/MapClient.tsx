'use client';

import { useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { SitePin } from './page';
import { MapPopup } from './MapPopup';

// Fix Leaflet's default icon path issue in bundled environments.
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const COLOUR_MAP: Record<string, string> = {
    red: '#dc2626',
    amber: '#d97706',
    green: '#16a34a',
    blue: '#2563eb',
    grey: '#9ca3af',
};

function colourIcon(colour: string) {
    const hex = COLOUR_MAP[colour] ?? COLOUR_MAP.grey;
    return L.divIcon({
        className: '',
        html: `<div style="width:14px;height:14px;border-radius:50%;background:${hex};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3);"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
    });
}

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

    const toggle = (key: FilterKey) => {
        setFilters((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const visiblePins = useMemo(() => {
        return pins.filter((pin) => {
            return FILTER_KEYS.some((k) => filters[k] && pin[k] > 0);
        });
    }, [pins, filters]);

    const centre: [number, number] = [54.5, -2.5];

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
                <MapContainer
                    center={centre}
                    zoom={6}
                    scrollWheelZoom={true}
                    style={{ height: '100%', width: '100%' }}
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <MarkerClusterGroup chunkedLoading>
                        {visiblePins.map((pin) => (
                            <Marker
                                key={pin.siteId}
                                position={[pin.lat, pin.lng]}
                                icon={colourIcon(pin.colour)}
                            >
                                <Popup>
                                    <MapPopup pin={pin} />
                                </Popup>
                            </Marker>
                        ))}
                    </MarkerClusterGroup>
                </MapContainer>
            </div>
        </div>
    );
}

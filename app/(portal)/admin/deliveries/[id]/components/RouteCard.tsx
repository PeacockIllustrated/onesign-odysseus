'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Map, { Marker, Source, Layer, NavigationControl } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Navigation, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { getRoute, geocodeAddress } from '@/lib/mapbox/client';
import { ONESIGN_HQ, formatDuration, formatDistance, TRAFFIC_COLOURS } from '@/lib/mapbox/utils';
import type { RouteResult, GeocodedPlace } from '@/lib/mapbox/types';

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

interface Props {
    destLat: number;
    destLng: number;
    siteName: string;
}

export function RouteCard({ destLat, destLng, siteName }: Props) {
    const [origin, setOrigin] = useState(ONESIGN_HQ);
    const [route, setRoute] = useState<RouteResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showSteps, setShowSteps] = useState(false);
    const [originQuery, setOriginQuery] = useState(ONESIGN_HQ.label);
    const [suggestions, setSuggestions] = useState<GeocodedPlace[]>([]);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const fetchRoute = useCallback(async (o: typeof origin) => {
        setLoading(true);
        setError(null);
        try {
            const result = await getRoute(o.lng, o.lat, destLng, destLat);
            setRoute(result);
        } catch (err) {
            setError('Couldn\'t load route — try again');
            console.warn('RouteCard fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [destLat, destLng]);

    useEffect(() => {
        fetchRoute(origin);
    }, [origin, fetchRoute]);

    const handleOriginInput = (q: string) => {
        setOriginQuery(q);
        clearTimeout(debounceRef.current);
        if (q.length < 2) { setSuggestions([]); return; }
        debounceRef.current = setTimeout(async () => {
            const results = await geocodeAddress(q);
            setSuggestions(results);
        }, 300);
    };

    const selectSuggestion = (place: GeocodedPlace) => {
        setOrigin({ lat: place.lat, lng: place.lng, label: place.placeName });
        setOriginQuery(place.placeName);
        setSuggestions([]);
    };

    if (!TOKEN) return null;

    const trafficColour = route ? TRAFFIC_COLOURS[route.trafficStatus] : '#999';

    return (
        <div className="bg-white">
            <div className="px-4 py-3 border-b border-neutral-100 flex items-center gap-2">
                <Navigation size={14} className="text-[#4e7e8c]" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-600">
                    Route to {siteName}
                </h4>
            </div>

            <div className="px-4 py-3">
                {/* Origin input */}
                <div className="relative mb-3">
                    <label className="block text-[11px] font-semibold text-neutral-500 mb-1">From</label>
                    <input
                        value={originQuery}
                        onChange={(e) => handleOriginInput(e.target.value)}
                        className="w-full text-sm border border-neutral-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4e7e8c]"
                        placeholder="Onesign HQ or type an address..."
                    />
                    {suggestions.length > 0 && (
                        <ul className="absolute z-10 left-0 right-0 mt-1 bg-white border border-neutral-200 rounded shadow-lg max-h-40 overflow-y-auto">
                            {suggestions.map((s) => (
                                <li key={s.id}>
                                    <button
                                        type="button"
                                        onClick={() => selectSuggestion(s)}
                                        className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-50 truncate"
                                    >
                                        {s.placeName}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {/* Map */}
                <div className="rounded border border-neutral-200 overflow-hidden" style={{ height: 'clamp(250px, 40vh, 450px)' }}>
                    <Map
                        mapboxAccessToken={TOKEN}
                        mapStyle="mapbox://styles/mapbox/light-v11"
                        initialViewState={{
                            latitude: (origin.lat + destLat) / 2,
                            longitude: (origin.lng + destLng) / 2,
                            zoom: 9,
                        }}
                        style={{ width: '100%', height: '100%' }}
                    >
                        <NavigationControl position="top-right" showCompass={false} />

                        <Marker latitude={origin.lat} longitude={origin.lng} anchor="center">
                            <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#4e7e8c', border: '2px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,.3)' }} />
                        </Marker>

                        <Marker latitude={destLat} longitude={destLng} anchor="center">
                            <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#dc2626', border: '2px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,.3)' }} />
                        </Marker>

                        {route && (
                            <Source type="geojson" data={{ type: 'Feature', geometry: route.geometry, properties: {} }}>
                                <Layer
                                    type="line"
                                    paint={{
                                        'line-color': trafficColour,
                                        'line-width': 4,
                                        'line-opacity': 0.8,
                                    }}
                                />
                            </Source>
                        )}
                    </Map>
                </div>

                {/* Route info */}
                {loading && (
                    <div className="flex items-center gap-2 mt-3 text-sm text-neutral-500">
                        <Loader2 size={14} className="animate-spin" /> calculating route...
                    </div>
                )}
                {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
                {route && !loading && (
                    <div className="mt-3 space-y-2">
                        <div className="flex items-center gap-3 text-sm">
                            <span className="font-bold text-neutral-900">{formatDistance(route.distance)}</span>
                            <span className="text-neutral-500">·</span>
                            <span className="font-bold text-neutral-900">{formatDuration(route.duration)}</span>
                            <span
                                className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full text-white"
                                style={{ background: trafficColour }}
                            >
                                {route.trafficStatus}
                            </span>
                        </div>

                        <button
                            type="button"
                            onClick={() => setShowSteps(!showSteps)}
                            className="text-xs text-neutral-600 hover:text-black flex items-center gap-1"
                        >
                            {showSteps ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            {route.steps.length} step{route.steps.length !== 1 ? 's' : ''}
                        </button>
                        {showSteps && (
                            <ol className="text-xs text-neutral-600 space-y-1 pl-4 list-decimal">
                                {route.steps.map((step, i) => (
                                    <li key={i}>
                                        {step.instruction}
                                        <span className="text-neutral-400 ml-1">({formatDistance(step.distance)})</span>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

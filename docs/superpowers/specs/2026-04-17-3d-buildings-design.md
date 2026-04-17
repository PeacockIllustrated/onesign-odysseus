# 3D building visualisation on the site map

*Design spec — 2026-04-17*

## Summary

Enable 3D building extrusion on the existing `/admin/map` page so staff can see the physical shape of buildings around a delivery/work site. When a user clicks "view site in 3D" on a pin popup, the camera smoothly tilts to 60° pitch and zooms to street level. A "reset view" button returns to the default flat overhead view. No new routes, no new data, no new server actions — purely a client-side rendering enhancement.

## Scope

**In scope**

- Mapbox GL `fill-extrusion` layer on the `building` composite source, visible at zoom 15+
- "View site in 3D" button in the pin popup (`MapPopup`)
- Smooth `flyTo` animation: zoom 17, pitch 60°, centred on the pin
- Floating "reset view" button when camera is tilted
- Building colour: neutral light grey (`#ddd`) at 70% opacity, matching the Onesign light palette

**Out of scope**

- Signage placement markers / annotations
- Custom building colours per client
- Screenshot / export
- Building height data for areas where OSM has no coverage (flat footprints are acceptable)
- New routes, pages, tables, or server actions

## Implementation

### MapClient.tsx changes

1. **Add the 3D buildings layer on map load.** Use the `onLoad` callback on the `<Map>` component:

```tsx
const handleMapLoad = useCallback((evt: any) => {
    const map = evt.target;
    const layers = map.getStyle().layers;
    // Find the first symbol layer to insert buildings beneath labels.
    let labelLayerId: string | undefined;
    for (const layer of layers) {
        if (layer.type === 'symbol' && layer.layout?.['text-field']) {
            labelLayerId = layer.id;
            break;
        }
    }
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
}, []);
```

2. **Track camera tilt state** to show/hide the reset button:

```tsx
const [isTilted, setIsTilted] = useState(false);
const mapRef = useRef<any>(null);
```

3. **`flyToSite` handler** called from the popup:

```tsx
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
```

4. **`resetView` handler:**

```tsx
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
```

5. **Reset view button** — floating over the map when tilted:

```tsx
{isTilted && (
    <button
        onClick={resetView}
        className="absolute top-3 left-3 z-10 px-3 py-2 bg-white border border-neutral-200 rounded-lg shadow text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
    >
        ↩ reset view
    </button>
)}
```

### MapPopup.tsx changes

Add `onViewSite` prop:

```tsx
interface Props {
    pin: SitePin;
    onShowRoute?: (pin: SitePin) => void;
    onViewSite?: (lat: number, lng: number) => void;
}
```

Render a button at the bottom of the popup:

```tsx
{onViewSite && (
    <button onClick={() => onViewSite(pin.lat, pin.lng)} ...>
        🏢 view site in 3D
    </button>
)}
```

### Wire in MapClient

Pass `flyToSite` to `MapPopup`:

```tsx
<MapPopup pin={selectedPin} onShowRoute={handleShowRoute} onViewSite={flyToSite} />
```

Add `ref={mapRef}` to the `<Map>` component and `onLoad={handleMapLoad}`.

## Edge cases

- **No building data at the location** — camera still tilts and zooms; buildings appear as flat 2D footprints. No crash, just less visual depth. Commercial premises in UK towns typically have good OSM coverage.
- **User clicks "view site in 3D" then clicks another pin** — the new popup opens at the zoomed/tilted level. The "view site" button on the new popup flies to that pin's location. Reset button stays visible.
- **Route polylines + 3D buildings** — polylines render on the ground plane beneath extruded buildings. Mapbox handles the z-ordering automatically.

## Testing

- **Manual smoke:** open `/admin/map`, click a pin in a city centre (e.g. Newcastle NE1), click "view site in 3D" — verify camera tilts + buildings render in 3D. Click "reset view" — verify flat overhead returns. Zoom in manually past level 15 — verify buildings appear without clicking the button.

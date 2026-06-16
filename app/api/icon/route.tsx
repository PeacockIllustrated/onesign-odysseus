import { ImageResponse } from 'next/og';

// Brand app-icon, generated as PNG at request time (no rasteriser dependency).
// A white disc on the dark brand background with a teal "1" stem — a stand-in
// for the real Onesign mark; swap in commissioned art when available.
// Query: ?size=192|512 and ?maskable=1 (full-bleed background for the OS mask).
export function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const size = Math.min(Math.max(parseInt(searchParams.get('size') ?? '512', 10) || 512, 48), 512);
    const maskable = searchParams.get('maskable') === '1';

    // Maskable icons must fill the whole square (the OS clips a safe circle),
    // so keep the mark inside ~76% of the canvas and don't round the corners.
    const pad = maskable ? Math.round(size * 0.14) : 0;
    const inner = size - pad * 2;
    const disc = Math.round(inner * 0.74);
    const stemH = Math.round(disc * 0.46);
    const stemW = Math.round(disc * 0.13);

    return new ImageResponse(
        (
            <div
                style={{
                    width: size,
                    height: size,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#1a1f23',
                    borderRadius: maskable ? 0 : Math.round(size * 0.22),
                }}
            >
                <div
                    style={{
                        width: disc,
                        height: disc,
                        borderRadius: disc,
                        background: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <div style={{ width: stemW, height: stemH, borderRadius: stemW, background: '#4e7e8c' }} />
                </div>
            </div>
        ),
        { width: size, height: size }
    );
}

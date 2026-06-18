import { ImageResponse } from 'next/og';

// Apple touch icon (iOS home-screen / installed PWA). Next auto-links this.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
    const s = 180;
    const disc = Math.round(s * 0.74);
    const stemH = Math.round(disc * 0.46);
    const stemW = Math.round(disc * 0.13);
    return new ImageResponse(
        (
            <div
                style={{
                    width: s,
                    height: s,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#1a1f23',
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
        size
    );
}

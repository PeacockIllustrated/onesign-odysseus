import type { MetadataRoute } from 'next';

// Web App Manifest — makes Odysseus installable ("Add to Home Screen") on
// Android / desktop Chrome and iOS 16.4+. Served at /manifest.webmanifest and
// auto-linked by Next. Icons are generated as PNG by app/api/icon (ImageResponse)
// so we don't need a rasteriser in the repo.
export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'Onesign Odysseus',
        short_name: 'Odysseus',
        description: 'Onesign & Digital — production management platform',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait-primary',
        background_color: '#1a1f23',
        theme_color: '#4e7e8c',
        icons: [
            { src: '/api/icon?size=192', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/api/icon?size=512', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/api/icon?size=512&maskable=1', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
    };
}

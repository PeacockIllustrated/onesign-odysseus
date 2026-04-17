'use client';

import Link from 'next/link';
import type { SitePin } from './page';

interface Props {
    pin: SitePin;
}

const ROW_CONFIG = [
    { key: 'quotes' as const, emoji: '📋', label: 'quote', href: '/admin/quotes' },
    { key: 'artwork' as const, emoji: '🎨', label: 'artwork', href: '/admin/artwork' },
    { key: 'production' as const, emoji: '⚙️', label: 'production job', href: '/admin/jobs' },
    { key: 'deliveries' as const, emoji: '🚚', label: 'delivery', href: '/admin/deliveries' },
    { key: 'maintenance' as const, emoji: '🔧', label: 'maintenance', href: '/admin/maintenance' },
] as const;

export function MapPopup({ pin }: Props) {
    return (
        <div style={{ minWidth: 200, fontFamily: 'system-ui, sans-serif' }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{pin.siteName}</div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 2 }}>{pin.address}</div>
            <div style={{ fontSize: 11, color: '#999', marginBottom: 8 }}>
                Client: {pin.orgName}
            </div>
            <div style={{ borderTop: '1px solid #eee', paddingTop: 6 }}>
                {ROW_CONFIG.map(({ key, emoji, label, href }) => {
                    const count = pin[key];
                    if (count === 0) return null;
                    return (
                        <Link
                            key={key}
                            href={href}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                fontSize: 12,
                                padding: '3px 0',
                                color: '#4e7e8c',
                                textDecoration: 'none',
                            }}
                        >
                            <span>{emoji} {count} {label}{count > 1 ? 's' : ''}</span>
                            <span style={{ fontSize: 10, color: '#999' }}>→</span>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}

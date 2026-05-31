import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { getBackshopItem } from '@/lib/backshop/queries';
import { BackshopDetail } from '../BackshopDetail';

export const dynamic = 'force-dynamic';

export default async function BackshopItemPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const item = await getBackshopItem(id);
    if (!item) notFound();

    // QR encodes the signed reference-PDF URL so the floor can pull it up on a
    // phone. Generated server-side from the freshly-signed URL each render.
    let qrDataUrl: string | null = null;
    if (item.pdfUrl) {
        try {
            qrDataUrl = await QRCode.toDataURL(item.pdfUrl, {
                margin: 1,
                width: 240,
            });
        } catch {
            qrDataUrl = null;
        }
    }

    return <BackshopDetail item={item} qrDataUrl={qrDataUrl} />;
}

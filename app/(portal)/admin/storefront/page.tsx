import StorefrontClient from './StorefrontClient';

export const metadata = { title: 'Storefront Studio' };

export default function StorefrontPage() {
    return (
        <div className="p-6">
            <StorefrontClient />
        </div>
    );
}

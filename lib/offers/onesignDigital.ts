
export type PackageTier = 'LAUNCH' | 'SCALE' | 'DOMINATE';
export type TierLevel = 'entry' | 'popular' | 'enterprise';

export interface PackageDeliverable {
    text: string;
    isBold?: boolean; // For "Everything in..." lines
}

export interface GrowthPackage {
    id: string;
    name: PackageTier;
    tier: TierLevel; // Visual styling tier
    price: number | string; // string for ranges if needed, currently fixed
    priceSuffix: string; // e.g., "/ month"
    term: string;
    adSpendIncluded: string; // e.g., "£200 / month"
    positioningLine: string;
    visualCue: string;
    isRecommended?: boolean;
    deliverables: PackageDeliverable[];
}

export interface AddOnDisplay {
    key: string; // Unique identifier for DB storage
    title: string;
    price: string;
    description?: string; // e.g. "4 short-form video ads"
}

export interface AcceleratorCategory {
    title: string;
    items: AddOnDisplay[];
}

export const DIGITAL_PACKAGES: GrowthPackage[] = [
    {
        id: 'launch',
        name: 'LAUNCH',
        tier: 'entry',
        price: 1000,
        priceSuffix: '/ month',
        term: '3 months',
        adSpendIncluded: '£200 / month',
        positioningLine: 'Validate demand and generate initial enquiries.',
        visualCue: 'Entry-level, clean, minimal',
        deliverables: [
            { text: 'Facebook & Instagram ads managed' },
            { text: '2–3 ad creatives per month' },
            { text: 'Copywriting & offer setup' },
            { text: 'Local targeting & lead forms' },
            { text: 'Lead delivery (email + phone)' },
            { text: 'Monthly performance snapshot' },
        ],
    },
    {
        id: 'scale',
        name: 'SCALE',
        tier: 'popular',
        price: 2000,
        priceSuffix: '/ month',
        term: '6 months',
        adSpendIncluded: '£500 / month',
        positioningLine: 'Increase enquiry volume while improving lead quality.',
        visualCue: 'More depth and movement',
        isRecommended: true,
        deliverables: [
            { text: 'Everything in Launch', isBold: true },
            { text: '4–6 creatives per month (video-first)' },
            { text: 'Ongoing creative testing' },
            { text: 'Retargeting campaigns' },
            { text: 'Campaigns split by service or location' },
            { text: 'Monthly performance review' },
        ],
    },
    {
        id: 'dominate',
        name: 'DOMINATE',
        tier: 'enterprise',
        price: 5000,
        priceSuffix: '/ month',
        term: '12 months',
        adSpendIncluded: '£1,000 / month',
        positioningLine: 'Control demand across regions and support nationwide growth.',
        visualCue: 'Strong, bold, confident; enterprise feel',
        deliverables: [
            { text: 'Everything in Scale', isBold: true },
            { text: '8–12 high-quality creatives per month' },
            { text: 'Multi-region, multi-campaign strategy' },
            { text: 'Advanced retargeting & lookalike audiences' },
            { text: 'Lead qualification & filtering' },
            { text: 'Monthly strategy & optimisation call' },
            { text: 'Priority support' },
        ],
    },
];

export const ACCELERATORS: AcceleratorCategory[] = [
    {
        title: 'Content & Creative',
        items: [
            { key: 'video_content_boost', title: 'Video Content Boost', price: '£750 / month', description: '4 short-form video ads' },
            { key: 'premium_creative_pack', title: 'Premium Creative Pack', price: '£1,500 / month', description: '8–10 creatives (video + static)' },
        ],
    },
    {
        title: 'Funnel & Conversion',
        items: [
            { key: 'landing_page_build', title: 'Landing Page Build', price: '£1,500 – £3,000', description: 'one-off' },
            { key: 'cro', title: 'Conversion Rate Optimisation (CRO)', price: '£500 / month' },
        ],
    },
    {
        title: 'Lead Nurture & CRM',
        items: [
            { key: 'email_nurture', title: 'Email Nurture System', price: '£750 setup + £250 / month' },
            { key: 'crm_setup', title: 'CRM Setup & Automation', price: '£1,500 – £3,000', description: 'one-off' },
        ],
    },
    {
        title: 'Traffic & Platform Expansion',
        items: [
            { key: 'advanced_retargeting', title: 'Advanced Retargeting', price: '£500 / month' },
            { key: 'ad_spend_expansion', title: 'Ad Spend Expansion', price: 'From £500 / month' },
            { key: 'linkedin_ads', title: 'LinkedIn Ads Management', price: '£1,000 / month', description: 'excludes spend' },
            { key: 'google_search_ads', title: 'Google Search Ads', price: '£750 / month', description: 'excludes spend' },
        ],
    },
    {
        title: 'Strategy & Content Capture',
        items: [
            { key: 'quarterly_strategy', title: 'Quarterly Growth Strategy Session', price: '£1,000 / quarter' },
            { key: 'content_day', title: 'On-Site Content Day', price: 'From £1,500 / day' },
        ],
    },
];

// Helper to format price consistently
export function formatPrice(price: number | string): string {
    if (typeof price === 'number') {
        return `£${price.toLocaleString()}`;
    }
    return price;
}

// Helper to get package by ID
export function getPackageById(id: string): GrowthPackage | undefined {
    return DIGITAL_PACKAGES.find(p => p.id === id);
}

// Helper to get all accelerator items as a flat array
export function getAllAccelerators(): AddOnDisplay[] {
    return ACCELERATORS.flatMap(cat => cat.items);
}

// Helper to get accelerator by key
export function getAcceleratorByKey(key: string): AddOnDisplay | undefined {
    return getAllAccelerators().find(a => a.key === key);
}

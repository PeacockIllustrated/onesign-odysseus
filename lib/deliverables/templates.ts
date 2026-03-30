/**
 * Deliverable Templates
 * 
 * Defines per-package monthly deliverables based on the documented key deliverables.
 * Used by admin to generate deliverable rows for each client org.
 */

import { PackageTier } from '@/lib/offers/onesignDigital';

// =============================================================================
// TYPES
// =============================================================================

export type DeliverableCategory = 'creative' | 'campaign' | 'reporting' | 'support';

export interface DeliverableTemplate {
    key: string;
    title: string;
    description: string;
    category: DeliverableCategory;
}

// =============================================================================
// LAUNCH PACKAGE DELIVERABLES
// =============================================================================

const LAUNCH_DELIVERABLES: DeliverableTemplate[] = [
    {
        key: 'ads_managed',
        title: 'Facebook & Instagram Ads Managed',
        description: 'Monthly ad account management across Meta platforms',
        category: 'campaign',
    },
    {
        key: 'creatives_2_3',
        title: 'Ad Creatives (2–3)',
        description: 'Design and production of 2–3 ad creatives',
        category: 'creative',
    },
    {
        key: 'copywriting_offer',
        title: 'Copywriting & Offer Setup',
        description: 'Ad copy and offer messaging for campaigns',
        category: 'creative',
    },
    {
        key: 'local_targeting',
        title: 'Local Targeting & Lead Forms',
        description: 'Geo-targeting configuration and lead capture forms',
        category: 'campaign',
    },
    {
        key: 'lead_delivery',
        title: 'Lead Delivery',
        description: 'Leads delivered via email and phone notification',
        category: 'support',
    },
    {
        key: 'monthly_snapshot',
        title: 'Monthly Performance Snapshot',
        description: 'Summary report of campaign performance metrics',
        category: 'reporting',
    },
];

// =============================================================================
// SCALE PACKAGE DELIVERABLES (includes Launch)
// =============================================================================

const SCALE_ADDITIONAL: DeliverableTemplate[] = [
    {
        key: 'creatives_4_6',
        title: 'Ad Creatives (4–6, Video-First)',
        description: 'Design and production of 4–6 creatives with video priority',
        category: 'creative',
    },
    {
        key: 'creative_testing',
        title: 'Ongoing Creative Testing',
        description: 'A/B testing of creatives to optimise performance',
        category: 'campaign',
    },
    {
        key: 'retargeting',
        title: 'Retargeting Campaigns',
        description: 'Retargeting audiences who have engaged with ads or website',
        category: 'campaign',
    },
    {
        key: 'campaigns_split',
        title: 'Campaigns Split by Service/Location',
        description: 'Campaign segmentation by service type or geographic area',
        category: 'campaign',
    },
    {
        key: 'monthly_review',
        title: 'Monthly Performance Review',
        description: 'Detailed review call discussing performance and next steps',
        category: 'reporting',
    },
];

// Build Scale by replacing the creatives with upgraded version
const SCALE_DELIVERABLES: DeliverableTemplate[] = [
    // Include Launch deliverables except the basic creatives (replaced by 4-6)
    ...LAUNCH_DELIVERABLES.filter(d => d.key !== 'creatives_2_3'),
    ...SCALE_ADDITIONAL,
];

// =============================================================================
// DOMINATE PACKAGE DELIVERABLES (includes Scale)
// =============================================================================

const DOMINATE_ADDITIONAL: DeliverableTemplate[] = [
    {
        key: 'creatives_8_12',
        title: 'High-Quality Creatives (8–12)',
        description: 'Premium creative production: 8–12 assets per month',
        category: 'creative',
    },
    {
        key: 'multi_region',
        title: 'Multi-Region Campaign Strategy',
        description: 'Multi-region, multi-campaign approach for nationwide reach',
        category: 'campaign',
    },
    {
        key: 'advanced_retargeting',
        title: 'Advanced Retargeting & Lookalikes',
        description: 'Lookalike audiences and sophisticated retargeting funnels',
        category: 'campaign',
    },
    {
        key: 'lead_filtering',
        title: 'Lead Qualification & Filtering',
        description: 'Lead scoring and filtering to improve quality',
        category: 'support',
    },
    {
        key: 'strategy_call',
        title: 'Monthly Strategy & Optimisation Call',
        description: 'Strategic planning call with dedicated account manager',
        category: 'reporting',
    },
    {
        key: 'priority_support',
        title: 'Priority Support',
        description: 'Priority response times and dedicated support channel',
        category: 'support',
    },
];

// Build Dominate by replacing Scale creatives with upgraded version
const DOMINATE_DELIVERABLES: DeliverableTemplate[] = [
    // Include Scale deliverables except the 4-6 creatives (replaced by 8-12)
    ...SCALE_DELIVERABLES.filter(d => d.key !== 'creatives_4_6'),
    ...DOMINATE_ADDITIONAL,
];

// =============================================================================
// EXPORTS
// =============================================================================

/**
 * Get deliverable templates for a specific package tier
 */
export function getTemplatesForPackage(packageKey: PackageTier | string): DeliverableTemplate[] {
    const tier = packageKey.toUpperCase() as PackageTier;

    switch (tier) {
        case 'LAUNCH':
            return LAUNCH_DELIVERABLES;
        case 'SCALE':
            return SCALE_DELIVERABLES;
        case 'DOMINATE':
            return DOMINATE_DELIVERABLES;
        default:
            return LAUNCH_DELIVERABLES; // Fallback to base package
    }
}

/**
 * Get all unique template keys across all packages
 */
export function getAllTemplateKeys(): string[] {
    const allTemplates = [
        ...LAUNCH_DELIVERABLES,
        ...SCALE_ADDITIONAL,
        ...DOMINATE_ADDITIONAL,
    ];
    return [...new Set(allTemplates.map(t => t.key))];
}

/**
 * Get template by key
 */
export function getTemplateByKey(key: string): DeliverableTemplate | undefined {
    const allTemplates = [
        ...LAUNCH_DELIVERABLES,
        ...SCALE_ADDITIONAL,
        ...DOMINATE_ADDITIONAL,
    ];
    return allTemplates.find(t => t.key === key);
}

/**
 * Get deliverable count per package (for display)
 */
export const PACKAGE_DELIVERABLE_COUNTS: Record<PackageTier, number> = {
    LAUNCH: LAUNCH_DELIVERABLES.length,
    SCALE: SCALE_DELIVERABLES.length,
    DOMINATE: DOMINATE_DELIVERABLES.length,
};

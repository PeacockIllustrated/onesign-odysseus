'use client';

import {
    Megaphone,
    FileText,
    Users,
    Target,
    RefreshCcw,
    TrendingUp,
    CheckCircle,
    Clock,
    DollarSign,
    Zap,
    Layers,
    MessageSquare,
    Mail,
    Globe,
    Settings,
    type LucideIcon,
} from 'lucide-react';

// Domain-specific icon mapping for OneSign Digital
export const GrowthIcons = {
    Ads: Megaphone,
    Content: FileText,
    Leads: Users,
    Strategy: Target,
    Retargeting: RefreshCcw,
    Growth: TrendingUp,
    // Utility icons
    Check: CheckCircle,
    Time: Clock,
    Price: DollarSign,
    Speed: Zap,
    Layers: Layers,
    Chat: MessageSquare,
    Email: Mail,
    Web: Globe,
    Settings: Settings,
} as const;

export type GrowthIconName = keyof typeof GrowthIcons;

interface IconProps {
    name: GrowthIconName;
    className?: string;
    size?: number;
}

export function Icon({ name, className = '', size = 20 }: IconProps) {
    const IconComponent = GrowthIcons[name];
    return <IconComponent className={className} size={size} />;
}

// Export individual icons for direct use
export {
    Megaphone,
    FileText,
    Users,
    Target,
    RefreshCcw,
    TrendingUp,
    CheckCircle,
    Clock,
    DollarSign,
    Zap,
    Layers,
    MessageSquare,
    Mail,
    Globe,
    Settings,
    type LucideIcon,
};

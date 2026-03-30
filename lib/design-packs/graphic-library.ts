/**
 * Graphic Library
 *
 * Comprehensive icon and graphic element catalog for professional signage design
 * Categorized for easy browsing and selection
 */

import type { LucideIcon } from 'lucide-react';
import {
    // Wayfinding & Navigation
    ArrowRight, ArrowLeft, ArrowUp, ArrowDown,
    ArrowUpRight, ArrowUpLeft, ArrowDownRight, ArrowDownLeft,
    MoveRight, MoveLeft, MoveUp, MoveDown,
    Navigation, Navigation2, Compass, MapPin, Map,
    SignpostBig, Signpost,

    // Facilities & Amenities
    Coffee, UtensilsCrossed, Soup,
    ShoppingBag, ShoppingCart, Store,
    Wifi, Phone, Mail, Info,
    Printer, FileText, Clipboard,
    Bed, Sofa, Armchair,

    // Accessibility & Safety
    Accessibility, Ear, Eye, Volume2,
    HeartPulse, Hospital, Pill, Stethoscope,
    Shield, ShieldAlert, ShieldCheck, AlertTriangle,
    Flame, Zap, Droplet, Wind,

    // Transportation & Parking
    Car, Bus, Bike, Truck, Train,
    PlaneTakeoff, PlaneLanding, Ship, Anchor,
    ParkingCircle, ParkingSquare,

    // Nature & Outdoor
    TreePine, Trees, TreeDeciduous, Flower2, Leaf,
    Sun, Moon, Cloud, CloudRain, Snowflake,
    Mountain, Waves, Sprout, Bug,

    // Activities & Recreation
    Dumbbell, Trophy, Medal, Target,
    Music, Film, Camera, Palette,
    BookOpen, GraduationCap, School, Library,
    Gamepad2, Puzzle, Sparkles,

    // Building & Rooms
    Home, Building, Building2, Warehouse, Factory,
    DoorOpen, DoorClosed, Lock, Unlock,
    LayoutDashboard, LayoutGrid,

    // Services
    Wrench, Settings, Cog,
    Clock, Calendar, Timer, Hourglass,
    Users, User, UserPlus, UserCheck,
    Bell, BellRing, Flag, Bookmark,

    // Shapes & Decorative
    Circle, Square, Triangle,
    Star, Heart,
    Plus, Minus, X, Check,

    // Directions & Pointers
    ChevronRight, ChevronLeft, ChevronUp, ChevronDown,
    ChevronsRight, ChevronsLeft, ChevronsUp, ChevronsDown,
    CornerDownRight, CornerDownLeft, CornerUpRight, CornerUpLeft,
} from 'lucide-react';

// =============================================================================
// ICON CATEGORY TYPES
// =============================================================================

export type IconCategory =
    | 'wayfinding'
    | 'facilities'
    | 'accessibility'
    | 'transport'
    | 'nature'
    | 'activities'
    | 'building'
    | 'services'
    | 'shapes'
    | 'arrows';

export interface GraphicIcon {
    id: string;
    name: string;
    component: LucideIcon;
    category: IconCategory;
    keywords: string[];
}

// =============================================================================
// ICON CATALOG
// =============================================================================

export const ICON_LIBRARY: GraphicIcon[] = [
    // WAYFINDING & NAVIGATION
    { id: 'arrow-right', name: 'Arrow Right', component: ArrowRight, category: 'arrows', keywords: ['direction', 'right', 'next'] },
    { id: 'arrow-left', name: 'Arrow Left', component: ArrowLeft, category: 'arrows', keywords: ['direction', 'left', 'back'] },
    { id: 'arrow-up', name: 'Arrow Up', component: ArrowUp, category: 'arrows', keywords: ['direction', 'up', 'above'] },
    { id: 'arrow-down', name: 'Arrow Down', component: ArrowDown, category: 'arrows', keywords: ['direction', 'down', 'below'] },
    { id: 'arrow-up-right', name: 'Arrow Diagonal Up-Right', component: ArrowUpRight, category: 'arrows', keywords: ['direction', 'diagonal'] },
    { id: 'arrow-up-left', name: 'Arrow Diagonal Up-Left', component: ArrowUpLeft, category: 'arrows', keywords: ['direction', 'diagonal'] },
    { id: 'move-right', name: 'Long Arrow Right', component: MoveRight, category: 'arrows', keywords: ['direction', 'right', 'long'] },
    { id: 'move-left', name: 'Long Arrow Left', component: MoveLeft, category: 'arrows', keywords: ['direction', 'left', 'long'] },
    { id: 'navigation', name: 'Navigation Compass', component: Navigation, category: 'wayfinding', keywords: ['compass', 'direction', 'map'] },
    { id: 'compass', name: 'Compass', component: Compass, category: 'wayfinding', keywords: ['navigation', 'direction', 'orientation'] },
    { id: 'map-pin', name: 'Map Pin', component: MapPin, category: 'wayfinding', keywords: ['location', 'marker', 'you are here'] },
    { id: 'map', name: 'Map', component: Map, category: 'wayfinding', keywords: ['navigation', 'route', 'location'] },
    { id: 'signpost', name: 'Signpost', component: Signpost, category: 'wayfinding', keywords: ['direction', 'sign', 'pointer'] },

    // FACILITIES & AMENITIES
    { id: 'coffee', name: 'Café / Coffee', component: Coffee, category: 'facilities', keywords: ['café', 'coffee', 'refreshments', 'drinks'] },
    { id: 'utensils', name: 'Restaurant / Dining', component: UtensilsCrossed, category: 'facilities', keywords: ['restaurant', 'dining', 'food', 'eating'] },
    { id: 'soup', name: 'Food / Kitchen', component: Soup, category: 'facilities', keywords: ['food', 'kitchen', 'canteen'] },
    { id: 'shopping-bag', name: 'Shop / Retail', component: ShoppingBag, category: 'facilities', keywords: ['shop', 'store', 'retail', 'gift shop'] },
    { id: 'store', name: 'Store Front', component: Store, category: 'facilities', keywords: ['shop', 'retail', 'store'] },
    { id: 'wifi', name: 'WiFi / Internet', component: Wifi, category: 'facilities', keywords: ['wifi', 'internet', 'wireless', 'connectivity'] },
    { id: 'phone', name: 'Telephone', component: Phone, category: 'facilities', keywords: ['phone', 'telephone', 'call', 'contact'] },
    { id: 'info', name: 'Information', component: Info, category: 'facilities', keywords: ['information', 'help', 'assistance', 'enquiries'] },
    { id: 'printer', name: 'Printer / Services', component: Printer, category: 'facilities', keywords: ['printer', 'printing', 'copy', 'services'] },
    { id: 'bed', name: 'Accommodation', component: Bed, category: 'facilities', keywords: ['bed', 'accommodation', 'hotel', 'lodging'] },

    // ACCESSIBILITY & SAFETY
    { id: 'accessibility', name: 'Wheelchair Access', component: Accessibility, category: 'accessibility', keywords: ['wheelchair', 'accessible', 'disabled', 'mobility'] },
    { id: 'ear', name: 'Hearing Loop', component: Ear, category: 'accessibility', keywords: ['hearing', 'audio', 'deaf', 'loop'] },
    { id: 'eye', name: 'Visual Aid', component: Eye, category: 'accessibility', keywords: ['visual', 'sight', 'blind', 'vision'] },
    { id: 'volume', name: 'Audio Description', component: Volume2, category: 'accessibility', keywords: ['audio', 'sound', 'description'] },
    { id: 'heart-pulse', name: 'First Aid / Medical', component: HeartPulse, category: 'accessibility', keywords: ['first aid', 'medical', 'health', 'emergency'] },
    { id: 'hospital', name: 'Medical Centre', component: Hospital, category: 'accessibility', keywords: ['hospital', 'medical', 'clinic', 'health'] },
    { id: 'shield-alert', name: 'Warning / Caution', component: ShieldAlert, category: 'accessibility', keywords: ['warning', 'caution', 'alert', 'danger'] },
    { id: 'alert-triangle', name: 'Alert / Hazard', component: AlertTriangle, category: 'accessibility', keywords: ['alert', 'warning', 'hazard', 'caution'] },
    { id: 'flame', name: 'Fire / Heat', component: Flame, category: 'accessibility', keywords: ['fire', 'heat', 'hazard', 'emergency'] },
    { id: 'shield-check', name: 'Safety / Secure', component: ShieldCheck, category: 'accessibility', keywords: ['safety', 'secure', 'protected', 'safe'] },

    // TRANSPORTATION & PARKING
    { id: 'car', name: 'Car / Parking', component: Car, category: 'transport', keywords: ['car', 'parking', 'vehicle', 'automobile'] },
    { id: 'parking-circle', name: 'Parking Symbol', component: ParkingCircle, category: 'transport', keywords: ['parking', 'car park', 'P'] },
    { id: 'bus', name: 'Bus / Coach', component: Bus, category: 'transport', keywords: ['bus', 'coach', 'public transport'] },
    { id: 'bike', name: 'Bicycle', component: Bike, category: 'transport', keywords: ['bicycle', 'bike', 'cycling', 'cycle'] },
    { id: 'train', name: 'Train / Rail', component: Train, category: 'transport', keywords: ['train', 'rail', 'railway', 'metro'] },
    { id: 'plane-takeoff', name: 'Airport / Departures', component: PlaneTakeoff, category: 'transport', keywords: ['airport', 'plane', 'flight', 'departures'] },
    { id: 'plane-landing', name: 'Airport / Arrivals', component: PlaneLanding, category: 'transport', keywords: ['airport', 'plane', 'flight', 'arrivals'] },

    // NATURE & OUTDOOR
    { id: 'tree-pine', name: 'Pine Tree', component: TreePine, category: 'nature', keywords: ['tree', 'pine', 'forest', 'woodland'] },
    { id: 'trees', name: 'Forest / Woods', component: Trees, category: 'nature', keywords: ['trees', 'forest', 'woods', 'nature'] },
    { id: 'tree-deciduous', name: 'Deciduous Tree', component: TreeDeciduous, category: 'nature', keywords: ['tree', 'oak', 'deciduous', 'nature'] },
    { id: 'flower', name: 'Flower / Garden', component: Flower2, category: 'nature', keywords: ['flower', 'garden', 'floral', 'botanical'] },
    { id: 'leaf', name: 'Leaf / Nature', component: Leaf, category: 'nature', keywords: ['leaf', 'nature', 'green', 'plant'] },
    { id: 'sun', name: 'Sun / Daylight', component: Sun, category: 'nature', keywords: ['sun', 'sunny', 'daylight', 'weather'] },
    { id: 'moon', name: 'Moon / Night', component: Moon, category: 'nature', keywords: ['moon', 'night', 'evening'] },
    { id: 'mountain', name: 'Mountain / Hills', component: Mountain, category: 'nature', keywords: ['mountain', 'hills', 'peak', 'terrain'] },
    { id: 'waves', name: 'Water / Lake', component: Waves, category: 'nature', keywords: ['water', 'lake', 'sea', 'waves'] },
    { id: 'sprout', name: 'Growth / Eco', component: Sprout, category: 'nature', keywords: ['sprout', 'eco', 'sustainable', 'green'] },

    // ACTIVITIES & RECREATION
    { id: 'dumbbell', name: 'Gym / Fitness', component: Dumbbell, category: 'activities', keywords: ['gym', 'fitness', 'exercise', 'sports'] },
    { id: 'trophy', name: 'Trophy / Achievement', component: Trophy, category: 'activities', keywords: ['trophy', 'achievement', 'winner', 'award'] },
    { id: 'target', name: 'Target / Goal', component: Target, category: 'activities', keywords: ['target', 'goal', 'aim', 'objective'] },
    { id: 'music', name: 'Music / Audio', component: Music, category: 'activities', keywords: ['music', 'audio', 'sound', 'concert'] },
    { id: 'camera', name: 'Photography', component: Camera, category: 'activities', keywords: ['camera', 'photography', 'photo', 'picture'] },
    { id: 'palette', name: 'Art / Creative', component: Palette, category: 'activities', keywords: ['art', 'creative', 'painting', 'design'] },
    { id: 'book-open', name: 'Reading / Library', component: BookOpen, category: 'activities', keywords: ['book', 'reading', 'library', 'literature'] },
    { id: 'graduation-cap', name: 'Education / Learning', component: GraduationCap, category: 'activities', keywords: ['education', 'learning', 'study', 'school'] },
    { id: 'library', name: 'Library', component: Library, category: 'activities', keywords: ['library', 'books', 'reading', 'study'] },

    // BUILDING & ROOMS
    { id: 'home', name: 'Home / Main', component: Home, category: 'building', keywords: ['home', 'main', 'house', 'building'] },
    { id: 'building', name: 'Building / Office', component: Building, category: 'building', keywords: ['building', 'office', 'corporate', 'structure'] },
    { id: 'building-2', name: 'Tower / Complex', component: Building2, category: 'building', keywords: ['tower', 'complex', 'skyscraper'] },
    { id: 'door-open', name: 'Entrance / Entry', component: DoorOpen, category: 'building', keywords: ['door', 'entrance', 'entry', 'open'] },
    { id: 'door-closed', name: 'Exit / Closed', component: DoorClosed, category: 'building', keywords: ['door', 'exit', 'closed'] },
    { id: 'lock', name: 'Secure / Private', component: Lock, category: 'building', keywords: ['lock', 'secure', 'private', 'restricted'] },
    { id: 'layout-grid', name: 'Rooms / Layout', component: LayoutGrid, category: 'building', keywords: ['rooms', 'layout', 'floor plan', 'grid'] },

    // SERVICES
    { id: 'wrench', name: 'Maintenance / Tools', component: Wrench, category: 'services', keywords: ['wrench', 'maintenance', 'tools', 'repair'] },
    { id: 'settings', name: 'Settings / Services', component: Settings, category: 'services', keywords: ['settings', 'services', 'configuration'] },
    { id: 'clock', name: 'Time / Hours', component: Clock, category: 'services', keywords: ['clock', 'time', 'hours', 'schedule'] },
    { id: 'calendar', name: 'Calendar / Dates', component: Calendar, category: 'services', keywords: ['calendar', 'dates', 'schedule', 'booking'] },
    { id: 'users', name: 'Group / Team', component: Users, category: 'services', keywords: ['users', 'group', 'team', 'people'] },
    { id: 'user', name: 'Person / Individual', component: User, category: 'services', keywords: ['user', 'person', 'individual', 'profile'] },
    { id: 'bell', name: 'Notification / Alert', component: Bell, category: 'services', keywords: ['bell', 'notification', 'alert', 'announcement'] },
    { id: 'flag', name: 'Flag / Marker', component: Flag, category: 'services', keywords: ['flag', 'marker', 'bookmark', 'important'] },

    // SHAPES & DECORATIVE
    { id: 'circle', name: 'Circle', component: Circle, category: 'shapes', keywords: ['circle', 'round', 'shape'] },
    { id: 'square', name: 'Square', component: Square, category: 'shapes', keywords: ['square', 'box', 'shape'] },
    { id: 'triangle', name: 'Triangle', component: Triangle, category: 'shapes', keywords: ['triangle', 'shape', 'geometric'] },
    { id: 'star', name: 'Star', component: Star, category: 'shapes', keywords: ['star', 'favorite', 'featured'] },
    { id: 'heart', name: 'Heart', component: Heart, category: 'shapes', keywords: ['heart', 'love', 'like', 'favorite'] },
    { id: 'sparkles', name: 'Sparkles', component: Sparkles, category: 'shapes', keywords: ['sparkles', 'sparkle', 'shine', 'decorative'] },
    { id: 'plus', name: 'Plus / Add', component: Plus, category: 'shapes', keywords: ['plus', 'add', 'cross', 'positive'] },
    { id: 'check', name: 'Check / Tick', component: Check, category: 'shapes', keywords: ['check', 'tick', 'confirm', 'yes'] },

    // ARROWS & CHEVRONS
    { id: 'chevron-right', name: 'Chevron Right', component: ChevronRight, category: 'arrows', keywords: ['chevron', 'right', 'next'] },
    { id: 'chevron-left', name: 'Chevron Left', component: ChevronLeft, category: 'arrows', keywords: ['chevron', 'left', 'back'] },
    { id: 'chevron-up', name: 'Chevron Up', component: ChevronUp, category: 'arrows', keywords: ['chevron', 'up', 'above'] },
    { id: 'chevron-down', name: 'Chevron Down', component: ChevronDown, category: 'arrows', keywords: ['chevron', 'down', 'below'] },
    { id: 'chevrons-right', name: 'Double Chevron Right', component: ChevronsRight, category: 'arrows', keywords: ['chevrons', 'right', 'fast forward'] },
    { id: 'corner-down-right', name: 'Corner Arrow Down-Right', component: CornerDownRight, category: 'arrows', keywords: ['corner', 'turn', 'arrow'] },
    { id: 'corner-up-right', name: 'Corner Arrow Up-Right', component: CornerUpRight, category: 'arrows', keywords: ['corner', 'turn', 'arrow'] },
];

// =============================================================================
// DECORATIVE PATTERNS
// =============================================================================

export type PatternStyle =
    | 'diagonal-lines'
    | 'grid'
    | 'dots'
    | 'circles'
    | 'hexagons'
    | 'waves'
    | 'organic'
    | 'geometric';

export interface DecorativePattern {
    id: string;
    name: string;
    style: PatternStyle;
    svgPattern: (primaryColor: string, secondaryColor: string) => string;
}

export const PATTERN_LIBRARY: DecorativePattern[] = [
    {
        id: 'diagonal-lines',
        name: 'Diagonal Lines',
        style: 'diagonal-lines',
        svgPattern: (primary, secondary) => `
            <pattern id="pattern-diagonal" x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
                <line x1="0" y1="0" x2="10" y2="10" stroke="${primary}" stroke-width="1" opacity="0.2"/>
            </pattern>
        `
    },
    {
        id: 'grid',
        name: 'Grid Pattern',
        style: 'grid',
        svgPattern: (primary, secondary) => `
            <pattern id="pattern-grid" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="${primary}" stroke-width="0.5" opacity="0.15"/>
            </pattern>
        `
    },
    {
        id: 'dots',
        name: 'Dot Pattern',
        style: 'dots',
        svgPattern: (primary, secondary) => `
            <pattern id="pattern-dots" x="0" y="0" width="15" height="15" patternUnits="userSpaceOnUse">
                <circle cx="7.5" cy="7.5" r="1.5" fill="${primary}" opacity="0.2"/>
            </pattern>
        `
    },
    {
        id: 'circles',
        name: 'Circle Rings',
        style: 'circles',
        svgPattern: (primary, secondary) => `
            <pattern id="pattern-circles" x="0" y="0" width="30" height="30" patternUnits="userSpaceOnUse">
                <circle cx="15" cy="15" r="8" fill="none" stroke="${primary}" stroke-width="1" opacity="0.15"/>
            </pattern>
        `
    },
    {
        id: 'hexagons',
        name: 'Hexagon Grid',
        style: 'hexagons',
        svgPattern: (primary, secondary) => `
            <pattern id="pattern-hexagons" x="0" y="0" width="40" height="35" patternUnits="userSpaceOnUse">
                <path d="M20,5 L30,15 L30,25 L20,35 L10,25 L10,15 Z" fill="none" stroke="${primary}" stroke-width="0.5" opacity="0.2"/>
            </pattern>
        `
    },
    {
        id: 'waves',
        name: 'Wave Pattern',
        style: 'waves',
        svgPattern: (primary, secondary) => `
            <pattern id="pattern-waves" x="0" y="0" width="40" height="20" patternUnits="userSpaceOnUse">
                <path d="M0,10 Q10,5 20,10 T40,10" fill="none" stroke="${primary}" stroke-width="1" opacity="0.2"/>
            </pattern>
        `
    },
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export function getIconById(id: string): GraphicIcon | undefined {
    return ICON_LIBRARY.find(icon => icon.id === id);
}

export function getIconsByCategory(category: IconCategory): GraphicIcon[] {
    return ICON_LIBRARY.filter(icon => icon.category === category);
}

export function searchIcons(query: string): GraphicIcon[] {
    const lowerQuery = query.toLowerCase();
    return ICON_LIBRARY.filter(icon =>
        icon.name.toLowerCase().includes(lowerQuery) ||
        icon.keywords.some(keyword => keyword.toLowerCase().includes(lowerQuery))
    );
}

export function getAllCategories(): { id: IconCategory; label: string; count: number }[] {
    const categories: { id: IconCategory; label: string }[] = [
        { id: 'wayfinding', label: 'Wayfinding & Navigation' },
        { id: 'facilities', label: 'Facilities & Amenities' },
        { id: 'accessibility', label: 'Accessibility & Safety' },
        { id: 'transport', label: 'Transportation & Parking' },
        { id: 'nature', label: 'Nature & Outdoor' },
        { id: 'activities', label: 'Activities & Recreation' },
        { id: 'building', label: 'Building & Rooms' },
        { id: 'services', label: 'Services' },
        { id: 'shapes', label: 'Shapes & Decorative' },
        { id: 'arrows', label: 'Arrows & Directions' },
    ];

    return categories.map(cat => ({
        ...cat,
        count: ICON_LIBRARY.filter(icon => icon.category === cat.id).length
    }));
}

export function getPatternById(id: string): DecorativePattern | undefined {
    return PATTERN_LIBRARY.find(pattern => pattern.id === id);
}

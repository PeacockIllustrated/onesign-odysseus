'use client';

import { DesignPack, SignSize, GraphicElement } from '@/lib/design-packs/types';
import { SIGN_TEMPLATE_GENERATORS, SIGN_TEMPLATE_LABELS, SignTemplateType } from '@/lib/design-packs/sign-templates';
import { DEFAULT_SIGN_SIZE, getSignDimensions } from '@/lib/design-packs/sign-dimensions';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { updateDesignPackData } from '@/lib/design-packs/actions';
import { Loader2, ChevronDown, Info, ZoomIn, ZoomOut, Sparkles } from 'lucide-react';
import { GraphicLibrary } from './GraphicLibrary';
import { GraphicElementEditor } from './GraphicElementEditor';
import { renderGraphicElements } from '@/lib/design-packs/icon-renderer';

interface SignPreviewsProps {
    pack: DesignPack;
}

const SIGN_TYPES: SignTemplateType[] = ['entrance', 'wayfinding', 'info_board', 'regulatory', 'interactive', 'fascia', 'totem', 'door_plate', 'parking_sign', 'safety_warning', 'accessibility'];

// Default content generator for each sign type
const getDefaultContentFor = (type: SignTemplateType, projectName: string): Record<string, string> => {
    const defaults: Record<SignTemplateType, Record<string, string>> = {
        entrance: {
            main: projectName || 'visitor centre',
            subtitle: 'main entrance',
        },
        wayfinding: {
            destination: 'visitor centre',
            distance: '200 metres',
            facilities: '♿ accessible • ☕ café • ℹ information',
        },
        info_board: {
            title: 'about this site',
            line1: 'this historic woodland has been carefully managed for over',
            line2: '400 years. the diverse habitats support numerous species',
            line3: 'of wildlife including badgers, deer, and over 50 bird species.',
            feature1: '• ancient oak and beech woodland',
            feature2: '• circular walking trails (2-5km)',
            feature3: '• seasonal wildflower meadows',
        },
        regulatory: {
            message: 'no entry',
        },
        interactive: {
            title: 'scan for info',
            instruction1: 'point your camera at this code',
            instruction2: 'to access digital trail guide',
        },
        fascia: {
            name: projectName || 'visitor centre',
        },
        totem: {
            name: projectName || 'visitor centre',
            direction1: 'car park →',
            direction2: 'café →',
            direction3: 'toilets ←',
            direction4: 'shop ←',
        },
        door_plate: {
            number: 'office 201',
            name: 'meeting room',
        },
        parking_sign: {
            type: 'visitor parking',
            direction: '→',
        },
        safety_warning: {
            message: 'caution',
            detail: 'hazard ahead',
        },
        accessibility: {
            message: 'accessible',
            detail: 'entrance',
        },
    };

    return defaults[type] || {};
};

export function SignPreviews({ pack }: SignPreviewsProps) {
    const [selectedType, setSelectedType] = useState<SignTemplateType>('entrance');
    const [selectedSize, setSelectedSize] = useState<SignSize>('medium');
    const [content, setContent] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [expandedEditor, setExpandedEditor] = useState(true);
    const [zoom, setZoom] = useState<number>(100);
    const [graphicLibraryOpen, setGraphicLibraryOpen] = useState(false);
    const [graphicElements, setGraphicElements] = useState<GraphicElement[]>([]);

    // Check if design elements are selected
    const hasTypography = !!pack.data_json.typography;
    const hasColours = !!pack.data_json.colours;

    // Load existing sign data or defaults
    useEffect(() => {
        const existingSign = pack.data_json.sign_types?.find(s => s.type === selectedType);

        if (existingSign) {
            setSelectedSize(existingSign.size || 'medium');
            setContent(existingSign.content || getDefaultContentFor(selectedType, pack.project_name));
            setGraphicElements(existingSign.graphics || []);
        } else {
            setSelectedSize('medium');
            setContent(getDefaultContentFor(selectedType, pack.project_name));
            setGraphicElements([]);
        }
    }, [selectedType, pack.data_json.sign_types, pack.project_name]);

    const handleContentChange = useCallback((field: string, value: string) => {
        setContent(prev => ({ ...prev, [field]: value }));
    }, []);

    const handleSelectIcon = useCallback((iconId: string) => {
        const dimensions = getSignDimensions(selectedType, selectedSize);
        const primaryColor = pack.data_json.colours?.primary?.hex || '#000000';

        // Add new graphic element in the center of the sign
        const newElement: GraphicElement = {
            id: `graphic-${Date.now()}`,
            icon_id: iconId,
            x: dimensions.width_mm / 2,
            y: dimensions.height_mm / 2,
            size: 40,
            rotation: 0,
            color: primaryColor,
            opacity: 1,
        };

        setGraphicElements(prev => [...prev, newElement]);
    }, [selectedType, selectedSize, pack.data_json.colours]);

    const handleUpdateGraphics = useCallback((updatedElements: GraphicElement[]) => {
        setGraphicElements(updatedElements);
    }, []);

    const handleSave = useCallback(async () => {
        setSaving(true);

        // Update or add sign type preview
        const existingSigns = pack.data_json.sign_types || [];
        const existingIndex = existingSigns.findIndex(s => s.type === selectedType);

        const newSign = {
            type: selectedType,
            size: selectedSize,
            shape: 'rectangle' as const, // Default shape
            content,
            graphics: graphicElements,
            pattern_id: null,
            preview_svg: '', // Generated on demand
            notes: null,
        };

        const updatedSigns = existingIndex >= 0
            ? existingSigns.map((s, i) => i === existingIndex ? newSign : s)
            : [...existingSigns, newSign];

        await updateDesignPackData(pack.id, {
            sign_types: updatedSigns,
        });

        setSaving(false);
    }, [pack.id, selectedType, selectedSize, content, graphicElements, pack.data_json.sign_types]);

    // Auto-save after 1 second of inactivity
    useEffect(() => {
        const timer = setTimeout(() => {
            if (hasTypography && hasColours) {
                handleSave();
            }
        }, 1000);

        return () => clearTimeout(timer);
    }, [content, selectedSize, hasTypography, hasColours, handleSave]);

    if (!hasTypography || !hasColours) {
        return (
            <div className="text-center py-12 bg-neutral-50 rounded-[var(--radius-md)] border border-neutral-200">
                <Info size={32} className="mx-auto mb-3 text-neutral-400" />
                <p className="text-sm text-neutral-600 mb-2">sign previews will appear here</p>
                <p className="text-xs text-neutral-500">
                    complete typography and colour selections to see live previews
                </p>
            </div>
        );
    }

    // Generate dynamic SVG with custom content (memoized for performance)
    const dynamicSVG = useMemo(() => {
        return generateSignWithContent(
            selectedType,
            pack.data_json,
            pack.project_name,
            selectedSize,
            content,
            graphicElements
        );
    }, [selectedType, selectedSize, content, graphicElements, pack.data_json.colours, pack.data_json.typography, pack.project_name]);

    const dimensions = getSignDimensions(selectedType, selectedSize);

    return (
        <div className="space-y-4">
            {/* Sign Type Tabs */}
            <div className="border-b border-neutral-200">
                <div className="flex flex-wrap gap-1">
                    {SIGN_TYPES.map((type) => (
                        <button
                            key={type}
                            onClick={() => setSelectedType(type)}
                            className={`
                                px-4 py-2.5 text-xs font-medium transition-colors relative
                                ${
                                    selectedType === type
                                        ? 'text-black border-b-2 border-black'
                                        : 'text-neutral-600 hover:text-black hover:bg-neutral-50'
                                }
                            `}
                        >
                            {SIGN_TEMPLATE_LABELS[type]}
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-6">
                {/* Content Editor */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="text-sm font-medium text-neutral-900">sign content</h4>
                            <p className="text-xs text-neutral-500 mt-0.5">
                                customize text for this sign type
                            </p>
                        </div>
                        {saving && (
                            <span className="text-xs text-neutral-500 flex items-center gap-1">
                                <Loader2 size={12} className="animate-spin" />
                                saving...
                            </span>
                        )}
                    </div>

                    {/* Size Selector */}
                    <div>
                        <label className="text-xs font-medium text-neutral-700 block mb-2">
                            sign size
                        </label>
                        <div className="flex gap-2">
                            {(['small', 'medium', 'large'] as SignSize[]).map((size) => (
                                <button
                                    key={size}
                                    onClick={() => setSelectedSize(size)}
                                    className={`
                                        flex-1 px-3 py-2 text-xs font-medium rounded-[var(--radius-sm)] border-2 transition-all
                                        ${
                                            selectedSize === size
                                                ? 'border-black bg-black text-white'
                                                : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300'
                                        }
                                    `}
                                >
                                    {size}
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-neutral-500 mt-2">
                            {dimensions.label} • {dimensions.typical_viewing_distance} viewing distance
                        </p>
                    </div>

                    {/* Content Fields */}
                    <div className="space-y-3">
                        <button
                            onClick={() => setExpandedEditor(!expandedEditor)}
                            className="flex items-center gap-2 text-xs font-medium text-neutral-700 hover:text-black"
                        >
                            <ChevronDown
                                size={14}
                                className={`transition-transform ${expandedEditor ? 'rotate-180' : ''}`}
                            />
                            text fields
                        </button>

                        {expandedEditor && (
                            <div className="space-y-3 pl-4">
                                {Object.entries(content).map(([field, value]) => (
                                    <div key={field}>
                                        <label className="text-xs font-medium text-neutral-600 block mb-1 capitalize">
                                            {field.replace(/([A-Z])/g, ' $1').replace(/\d+/, (match) => ` ${match}`).trim()}
                                        </label>
                                        <input
                                            type="text"
                                            value={value}
                                            onChange={(e) => handleContentChange(field, e.target.value)}
                                            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                                            placeholder={`Enter ${field}...`}
                                        />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Graphic Elements Section */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-neutral-700 block">
                                graphic elements
                            </label>
                            <button
                                onClick={() => setGraphicLibraryOpen(true)}
                                className="px-3 py-1.5 text-xs font-medium bg-black text-white rounded-[var(--radius-sm)] hover:bg-neutral-800 transition-colors flex items-center gap-1.5"
                            >
                                <Sparkles size={14} />
                                add graphic
                            </button>
                        </div>

                        <GraphicElementEditor
                            elements={graphicElements}
                            signWidth={getSignDimensions(selectedType, selectedSize).width_mm}
                            signHeight={getSignDimensions(selectedType, selectedSize).height_mm}
                            availableColors={[
                                pack.data_json.colours?.primary?.hex || '#000000',
                                pack.data_json.colours?.secondary?.hex || '#FFFFFF',
                                ...(pack.data_json.colours?.accents?.map(a => a.hex) || [])
                            ].filter(Boolean)}
                            onUpdate={handleUpdateGraphics}
                        />
                    </div>

                    {/* Info Card */}
                    <div className="bg-blue-50 border border-blue-200 rounded-[var(--radius-sm)] p-3">
                        <p className="text-xs font-medium text-blue-900 mb-1">auto-fitting enabled</p>
                        <p className="text-xs text-blue-700">
                            text size automatically adjusts to fit within sign dimensions. longer text will appear smaller.
                        </p>
                    </div>
                </div>

                {/* Live Preview */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="text-sm font-medium text-neutral-900">live preview</h4>
                            <p className="text-xs text-neutral-500 mt-0.5">
                                see how your content looks in real-time
                            </p>
                        </div>

                        {/* Zoom Controls */}
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-neutral-600 font-medium">zoom:</span>
                            {[50, 100, 200].map((zoomLevel) => (
                                <button
                                    key={zoomLevel}
                                    onClick={() => setZoom(zoomLevel)}
                                    className={`
                                        px-3 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] border transition-all
                                        ${
                                            zoom === zoomLevel
                                                ? 'border-black bg-black text-white'
                                                : 'border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400'
                                        }
                                    `}
                                >
                                    {zoomLevel}%
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="bg-neutral-100 rounded-[var(--radius-md)] p-6 flex items-center justify-center min-h-[500px] overflow-auto">
                        <div
                            className="bg-white rounded shadow-lg transition-transform origin-center"
                            style={{ transform: `scale(${zoom / 100})` }}
                            dangerouslySetInnerHTML={{ __html: dynamicSVG }}
                        />
                    </div>

                    <div className="text-xs text-neutral-500 space-y-1">
                        <p>• preview shown at scale with actual colour palette</p>
                        <p>• typography and materials from your selections</p>
                        <p>• dimensions and mounting specs included</p>
                    </div>
                </div>
            </div>

            {/* Graphic Library Modal */}
            <GraphicLibrary
                isOpen={graphicLibraryOpen}
                onClose={() => setGraphicLibraryOpen(false)}
                onSelectIcon={handleSelectIcon}
                currentColor={pack.data_json.colours?.primary?.hex || '#000000'}
            />
        </div>
    );
}

// Helper function to generate SVG with custom content and auto-fitting
function generateSignWithContent(
    type: SignTemplateType,
    data: any,
    projectName: string,
    size: SignSize,
    content: Record<string, string>,
    graphics: GraphicElement[] = []
): string {
    const primary = data.colours?.primary || { hex: '#000000', name: 'black' };
    const secondary = data.colours?.secondary || { hex: '#FFFFFF', name: 'white' };
    const primaryFont = data.typography?.primary_font?.family || 'sans-serif';
    const secondaryFont = data.typography?.secondary_font?.family || 'sans-serif';
    const accent = data.colours?.accents?.[0]?.hex || primary.hex;
    const dimensions = getSignDimensions(type, size);

    // Calculate auto-fit font sizes based on content length
    const calculateFontSize = (text: string, baseSize: number, maxWidth: number): number => {
        const charCount = text.length;
        const estimatedWidth = charCount * (baseSize * 0.6); // Rough estimate
        if (estimatedWidth > maxWidth) {
            return Math.max(Math.floor(baseSize * (maxWidth / estimatedWidth)), 14); // Min 14px
        }
        return baseSize;
    };

    // Generate sign based on type
    switch (type) {
        case 'entrance':
            const entranceMainSize = calculateFontSize(content.main || projectName, 96, 700);
            const entranceSubSize = calculateFontSize(content.subtitle || '', 28, 700);
            const entranceGraphics = renderGraphicElements(graphics, 800, 400, dimensions.width_mm, dimensions.height_mm);

            return `
<svg width="800" height="500" xmlns="http://www.w3.org/2000/svg">
    <rect fill="${primary.hex}" width="800" height="400" stroke="#ddd" stroke-width="2"/>
    <rect fill="${accent}" width="800" height="12" y="0"/>
    ${entranceGraphics}
    <text x="400" y="180" font-family="${primaryFont}, sans-serif" font-weight="700" fill="${secondary.hex}" font-size="${entranceMainSize}" text-anchor="middle" dominant-baseline="middle">${content.main || projectName}</text>
    <text x="400" y="260" font-family="sans-serif" font-size="${entranceSubSize}" fill="${secondary.hex}" text-anchor="middle" opacity="0.8">${content.subtitle || ''}</text>
    <circle cx="60" cy="340" r="20" stroke="${secondary.hex}" fill="none" stroke-width="2"/>
    <text x="100" y="345" font-family="sans-serif" font-size="14" fill="${secondary.hex}">entrance</text>
    <text x="400" y="440" font-family="monospace" font-size="12" fill="#666" text-anchor="middle">${dimensions.label} • ${dimensions.typical_viewing_distance} viewing distance</text>
    <text x="400" y="465" font-family="sans-serif" font-size="11" fill="#999" text-anchor="middle">preview shown at 1:5 scale</text>
</svg>`.trim();

        case 'wayfinding':
            const destSize = calculateFontSize(content.destination || '', 48, 400);
            const distSize = calculateFontSize(content.distance || '', 24, 400);
            const wayfindingGraphics = renderGraphicElements(graphics, 600, 300, dimensions.width_mm, dimensions.height_mm);

            return `
<svg width="600" height="380" xmlns="http://www.w3.org/2000/svg">
    <rect fill="${secondary.hex}" width="600" height="300" stroke="${primary.hex}" stroke-width="4"/>
    ${wayfindingGraphics}
    <path d="M 480 150 L 540 150 L 510 120 M 540 150 L 510 180" stroke="${primary.hex}" stroke-width="4" fill="none" stroke-linecap="round"/>
    <text x="60" y="100" font-family="${primaryFont}, sans-serif" font-weight="600" fill="${primary.hex}" font-size="${destSize}">${content.destination || ''}</text>
    <text x="60" y="160" font-family="sans-serif" font-size="${distSize}" fill="${primary.hex}" opacity="0.7">${content.distance || ''}</text>
    <rect fill="${accent}" width="600" height="6" y="200"/>
    <text x="60" y="240" font-family="sans-serif" font-size="18" fill="${primary.hex}" opacity="0.6">${content.facilities || ''}</text>
    <text x="300" y="335" font-family="monospace" font-size="12" fill="#666" text-anchor="middle">${dimensions.label} • ${dimensions.typical_viewing_distance} viewing distance</text>
    <text x="300" y="360" font-family="sans-serif" font-size="11" fill="#999" text-anchor="middle">preview shown at 1:3 scale</text>
</svg>`.trim();

        case 'info_board':
            const titleSize = calculateFontSize(content.title || '', 36, 620);
            const infoBoardGraphics = renderGraphicElements(graphics, 700, 500, dimensions.width_mm, dimensions.height_mm);

            return `
<svg width="700" height="600" xmlns="http://www.w3.org/2000/svg">
    <rect fill="${secondary.hex}" width="700" height="500" stroke="${primary.hex}" stroke-width="3"/>
    <rect fill="${accent}" width="700" height="80"/>
    ${infoBoardGraphics}
    <text x="40" y="50" font-family="${primaryFont}, sans-serif" font-weight="700" fill="${secondary.hex}" font-size="${titleSize}">${content.title || ''}</text>
    <text x="40" y="130" font-family="${secondaryFont}, sans-serif" font-size="20" fill="${primary.hex}">${content.line1 || ''}</text>
    <text x="40" y="160" font-family="${secondaryFont}, sans-serif" font-size="20" fill="${primary.hex}">${content.line2 || ''}</text>
    <text x="40" y="190" font-family="${secondaryFont}, sans-serif" font-size="20" fill="${primary.hex}">${content.line3 || ''}</text>
    <line x1="40" y1="220" x2="660" y2="220" stroke="${accent}" stroke-width="2" opacity="0.3"/>
    <text x="40" y="260" font-family="${secondaryFont}, sans-serif" font-size="18" fill="${primary.hex}">${content.feature1 || ''}</text>
    <text x="40" y="290" font-family="${secondaryFont}, sans-serif" font-size="18" fill="${primary.hex}">${content.feature2 || ''}</text>
    <text x="40" y="320" font-family="${secondaryFont}, sans-serif" font-size="18" fill="${primary.hex}">${content.feature3 || ''}</text>
    <circle cx="350" cy="410" r="40" fill="${accent}" opacity="0.15"/>
    <path d="M 335 395 L 345 410 L 355 395 M 350 410 L 350 430" stroke="${primary.hex}" stroke-width="2" fill="none"/>
    <text x="350" y="540" font-family="monospace" font-size="12" fill="#666" text-anchor="middle">${dimensions.label} • ${dimensions.typical_viewing_distance} reading distance</text>
    <text x="350" y="565" font-family="sans-serif" font-size="11" fill="#999" text-anchor="middle">preview shown at 1:4 scale</text>
</svg>`.trim();

        case 'totem':
            const totemNameSize = calculateFontSize(content.name || projectName, 42, 260);
            const totemGraphics = renderGraphicElements(graphics, 400, 800, dimensions.width_mm, dimensions.height_mm);

            return `
<svg width="400" height="800" xmlns="http://www.w3.org/2000/svg">
    <rect fill="#6B5D52" x="170" y="500" width="60" height="300"/>
    <rect fill="${primary.hex}" x="50" y="50" width="300" height="500" rx="8"/>
    <rect fill="${accent}" x="50" y="50" width="300" height="80" rx="8" ry="0"/>
    ${totemGraphics}
    <text x="200" y="105" font-family="${primaryFont}, sans-serif" font-weight="700" fill="${secondary.hex}" font-size="${totemNameSize}" text-anchor="middle">${content.name || projectName}</text>
    <text x="80" y="220" font-family="sans-serif" font-size="28" fill="${secondary.hex}">${content.direction1 || ''}</text>
    <text x="80" y="280" font-family="sans-serif" font-size="28" fill="${secondary.hex}">${content.direction2 || ''}</text>
    <text x="80" y="340" font-family="sans-serif" font-size="28" fill="${secondary.hex}">${content.direction3 || ''}</text>
    <text x="80" y="400" font-family="sans-serif" font-size="28" fill="${secondary.hex}">${content.direction4 || ''}</text>
</svg>`.trim();

        default:
            // Fallback to template generators for other types
            return SIGN_TEMPLATE_GENERATORS[type](data, projectName, size, graphics);
    }
}

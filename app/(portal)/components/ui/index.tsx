'use client';

import { ReactNode } from 'react';
import {
    LucideIcon,
    FolderOpen,
    FileText,
    Package,
    CheckSquare,
    Zap,
    CreditCard,
    BarChart3,
    Users,
    Building2
} from 'lucide-react';

// Icon mapping for StatsCard (allows passing string from Server Components)
const iconMap: Record<string, LucideIcon> = {
    package: Package,
    zap: Zap,
    checkSquare: CheckSquare,
    creditCard: CreditCard,
    barChart: BarChart3,
    users: Users,
    building: Building2,
    fileText: FileText,
    folderOpen: FolderOpen,
};

// =============================================================================
// CARD
// =============================================================================

interface CardProps {
    children: ReactNode;
    className?: string;
}

export function Card({ children, className = '' }: CardProps) {
    return (
        <div className={`card-base ${className}`}>
            {children}
        </div>
    );
}

interface StatsCardProps {
    label: string;
    value: string | number;
    sublabel?: string;
    icon?: string; // Icon name string instead of component
}

export function StatsCard({ label, value, sublabel, icon }: StatsCardProps) {
    const Icon = icon ? iconMap[icon] : null;

    return (
        <Card>
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">{label}</p>
                    <p className="text-2xl font-bold text-neutral-900">{value}</p>
                    {sublabel && <p className="text-xs text-neutral-400 mt-1">{sublabel}</p>}
                </div>
                {Icon && (
                    <div className="w-10 h-10 rounded-[var(--radius-sm)] bg-neutral-100 flex items-center justify-center">
                        <Icon size={18} className="text-neutral-500" />
                    </div>
                )}
            </div>
        </Card>
    );
}

// =============================================================================
// CHIP / BADGE
// =============================================================================

type ChipVariant = 'default' | 'draft' | 'review' | 'approved' | 'scheduled' | 'done' | 'active' | 'paused';

const chipStyles: Record<ChipVariant, string> = {
    default: 'bg-neutral-100 text-neutral-700 border-neutral-200',
    draft: 'bg-neutral-100 text-neutral-600 border-neutral-200',
    review: 'bg-amber-50 text-amber-700 border-amber-200',
    approved: 'bg-green-50 text-green-700 border-green-200',
    scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
    done: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    active: 'bg-green-50 text-green-700 border-green-200',
    paused: 'bg-neutral-100 text-neutral-500 border-neutral-200',
};

interface ChipProps {
    children: ReactNode;
    variant?: ChipVariant;
    className?: string;
}

export function Chip({ children, variant = 'default', className = '' }: ChipProps) {
    return (
        <span className={`badge ${chipStyles[variant]} ${className}`}>
            {children}
        </span>
    );
}

// =============================================================================
// EMPTY STATE
// =============================================================================

type EmptyStateType = 'deliverables' | 'assets' | 'reports' | 'generic';

const emptyStateConfig: Record<EmptyStateType, { icon: LucideIcon; defaultMessage: string }> = {
    deliverables: { icon: Package, defaultMessage: 'No deliverables this month' },
    assets: { icon: FolderOpen, defaultMessage: 'Your asset library is empty' },
    reports: { icon: FileText, defaultMessage: 'No reports generated yet' },
    generic: { icon: FolderOpen, defaultMessage: 'Nothing to display here' },
};

interface EmptyStateProps {
    type?: EmptyStateType;
    title?: string;
    description?: string;
    action?: ReactNode;
}

export function EmptyState({ type = 'generic', title, description, action }: EmptyStateProps) {
    const config = emptyStateConfig[type];
    const Icon = config.icon;

    return (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="w-14 h-14 rounded-full bg-neutral-100 flex items-center justify-center mb-4">
                <Icon size={24} className="text-neutral-400" />
            </div>
            <h3 className="text-sm font-semibold text-neutral-900 mb-1">{title || config.defaultMessage}</h3>
            {description && <p className="text-sm text-neutral-500 max-w-sm mx-auto mb-4">{description}</p>}
            {action && <div className="mt-4">{action}</div>}
        </div>
    );
}

// =============================================================================
// DATA TABLE
// =============================================================================

interface Column<T> {
    key: string;
    header: string;
    render?: (row: T) => ReactNode;
    className?: string;
}

interface DataTableProps<T> {
    columns: Column<T>[];
    data: T[];
    keyField: keyof T;
    onRowClick?: (row: T) => void;
    emptyState?: ReactNode;
}

export function DataTable<T extends Record<string, unknown>>({
    columns,
    data,
    keyField,
    onRowClick,
    emptyState,
}: DataTableProps<T>) {
    if (data.length === 0) {
        return <>{emptyState || <EmptyState />}</>;
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full">
                <thead>
                    <tr className="border-b border-neutral-200">
                        {columns.map((col) => (
                            <th
                                key={col.key}
                                className={`px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide ${col.className || ''}`}
                            >
                                {col.header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                    {data.map((row) => (
                        <tr
                            key={String(row[keyField])}
                            className={`${onRowClick ? 'cursor-pointer hover:bg-neutral-50' : ''} transition-colors`}
                            onClick={() => onRowClick?.(row)}
                        >
                            {columns.map((col) => (
                                <td key={col.key} className={`px-4 py-3 text-sm text-neutral-700 ${col.className || ''}`}>
                                    {col.render ? col.render(row) : String(row[col.key] ?? '')}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// =============================================================================
// MODAL
// =============================================================================

interface ModalProps {
    open: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50"
                onClick={onClose}
            />

            {/* Modal content */}
            <div className="relative bg-white rounded-[var(--radius-md)] shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
                    <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
                    <button
                        onClick={onClose}
                        className="text-neutral-400 hover:text-neutral-600 transition-colors"
                    >
                        <span className="sr-only">Close</span>
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="p-5">{children}</div>
            </div>
        </div>
    );
}

// =============================================================================
// FILE UPLOAD
// =============================================================================

interface FileUploadProps {
    onUpload: (files: File[]) => void;
    accept?: string;
    multiple?: boolean;
    loading?: boolean;
}

export function FileUpload({ onUpload, accept, multiple = false, loading = false }: FileUploadProps) {
    function handleDrop(e: React.DragEvent) {
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            onUpload(multiple ? files : [files[0]]);
        }
    }

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
        const files = Array.from(e.target.files || []);
        if (files.length > 0) {
            onUpload(files);
        }
    }

    return (
        <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed border-neutral-200 rounded-[var(--radius-md)] p-8 text-center hover:border-neutral-300 transition-colors"
        >
            <FolderOpen className="mx-auto text-neutral-400 mb-3" size={32} />
            <p className="text-sm text-neutral-600 mb-2">
                {loading ? 'Uploading...' : 'Drag & drop files here'}
            </p>
            <label className="btn-secondary text-xs cursor-pointer">
                Browse files
                <input
                    type="file"
                    accept={accept}
                    multiple={multiple}
                    onChange={handleChange}
                    className="hidden"
                    disabled={loading}
                />
            </label>
        </div>
    );
}

// =============================================================================
// PAGE HEADER
// =============================================================================

interface PageHeaderProps {
    title: string;
    description?: string;
    action?: ReactNode;
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
    return (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-6">
            <div className="min-w-0">
                <h1 className="text-xl font-bold text-neutral-900 tracking-tight">{title}</h1>
                {description && <p className="text-sm text-neutral-500 mt-1">{description}</p>}
            </div>
            {action && <div className="shrink-0">{action}</div>}
        </div>
    );
}

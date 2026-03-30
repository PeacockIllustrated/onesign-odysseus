'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient, type ClientAsset, type AssetType } from '@/lib/supabase';
import { PageHeader, Card, Chip, EmptyState, FileUpload } from '@/app/(portal)/components/ui';
import { Grid, List, Download, Trash2, Image, FileText, Video, File, Eye } from 'lucide-react';

type ViewMode = 'grid' | 'list';
type TypeFilter = 'all' | AssetType;

const typeIcons: Record<AssetType, typeof File> = {
    creative: Image,
    brand: Image,
    document: FileText,
    other: File,
};

export default function AssetsPage() {
    const [assets, setAssets] = useState<ClientAsset[]>([]);
    const [previewAsset, setPreviewAsset] = useState<ClientAsset | null>(null);

    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [viewMode, setViewMode] = useState<ViewMode>('grid');
    const [filter, setFilter] = useState<TypeFilter>('all');
    const [orgId, setOrgId] = useState<string | null>(null);

    useEffect(() => {
        loadAssets();
    }, []);

    async function loadAssets() {
        const supabase = createBrowserClient();

        // Get current user's org
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: membership } = await supabase
            .from('org_members')
            .select('org_id')
            .eq('user_id', user.id)
            .single();

        if (membership) {
            setOrgId(membership.org_id);

            const { data } = await supabase
                .from('client_assets')
                .select('*')
                .eq('org_id', membership.org_id)
                .order('created_at', { ascending: false });

            setAssets(data || []);
        }
        setLoading(false);
    }

    async function handleUpload(files: File[]) {
        if (!orgId) return;

        setUploading(true);
        const supabase = createBrowserClient();

        for (const file of files) {
            // Upload to storage
            const path = `${orgId}/${Date.now()}-${file.name}`;
            const { error: uploadError } = await supabase.storage
                .from('client-assets')
                .upload(path, file);

            if (uploadError) {
                console.error('Upload error:', uploadError);
                continue;
            }

            // Determine type based on mime
            let type: AssetType = 'other';
            if (file.type.startsWith('image/')) type = 'creative';
            else if (file.type.startsWith('video/')) type = 'creative';
            else if (file.type === 'application/pdf' || file.type.includes('document')) type = 'document';

            // Create asset record
            await supabase
                .from('client_assets')
                .insert({
                    org_id: orgId,
                    name: file.name,
                    storage_path: path,
                    type,
                    file_size: file.size,
                    mime_type: file.type,
                });
        }

        await loadAssets();
        setUploading(false);
    }

    async function handleDelete(asset: ClientAsset) {
        if (!confirm('Delete this asset?')) return;

        const supabase = createBrowserClient();

        // Delete from storage
        await supabase.storage
            .from('client-assets')
            .remove([asset.storage_path]);

        // Delete record
        await supabase
            .from('client_assets')
            .delete()
            .eq('id', asset.id);

        setAssets((prev) => prev.filter((a) => a.id !== asset.id));
    }

    async function handleDownload(asset: ClientAsset) {
        const supabase = createBrowserClient();
        const { data } = await supabase.storage
            .from('client-assets')
            .createSignedUrl(asset.storage_path, 60);

        if (data?.signedUrl) {
            window.open(data.signedUrl, '_blank');
        }
    }

    const filteredAssets = filter === 'all'
        ? assets
        : assets.filter((a) => a.type === filter);

    const typeFilters: { value: TypeFilter; label: string }[] = [
        { value: 'all', label: 'All' },
        { value: 'creative', label: 'Creatives' },
        { value: 'brand', label: 'Brand' },
        { value: 'document', label: 'Documents' },
        { value: 'other', label: 'Other' },
    ];

    function formatFileSize(bytes?: number) {
        if (!bytes) return '';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    return (
        <div>
            <PageHeader
                title="Assets"
                description="Upload and manage your brand assets and creative files"
            />

            {/* Upload area */}
            <Card className="mb-6">
                <FileUpload
                    onUpload={handleUpload}
                    multiple
                    loading={uploading}
                    accept="image/*,video/*,application/pdf,.doc,.docx"
                />
            </Card>

            {/* Toolbar */}
            <div className="flex items-center justify-between gap-3 mb-4">
                {/* Type filter */}
                <div className="flex gap-2 overflow-x-auto pb-2 min-w-0">
                    {typeFilters.map((t) => (
                        <button
                            key={t.value}
                            onClick={() => setFilter(t.value)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] whitespace-nowrap transition-colors ${filter === t.value
                                ? 'bg-black text-white'
                                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                                }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* View toggle */}
                <div className="flex gap-1 bg-neutral-100 rounded-[var(--radius-sm)] p-1 shrink-0">
                    <button
                        onClick={() => setViewMode('grid')}
                        className={`p-1.5 rounded-[var(--radius-sm)] ${viewMode === 'grid' ? 'bg-white shadow-sm' : ''}`}
                    >
                        <Grid size={14} />
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        className={`p-1.5 rounded-[var(--radius-sm)] ${viewMode === 'list' ? 'bg-white shadow-sm' : ''}`}
                    >
                        <List size={14} />
                    </button>
                </div>
            </div>

            {/* Assets display */}
            {loading ? (
                <div className="text-center py-12 text-sm text-neutral-500">Loading...</div>
            ) : filteredAssets.length === 0 ? (
                <Card>
                    <EmptyState
                        type="assets"
                        title="No assets"
                        description="Upload files to get started."
                    />
                </Card>
            ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {filteredAssets.map((asset) => (
                        <Card key={asset.id} className="group relative overflow-hidden">
                            <div className="aspect-square bg-neutral-100 rounded-[var(--radius-sm)] mb-3 overflow-hidden relative">
                                <AssetThumbnail asset={asset} />
                            </div>
                            <p className="text-sm font-medium text-neutral-900 truncate">{asset.name}</p>
                            <div className="flex items-center gap-2 mt-1">
                                <Chip variant="default">{asset.type}</Chip>
                                <span className="text-xs text-neutral-400">{formatFileSize(asset.file_size)}</span>
                            </div>

                            {/* Actions overlay */}
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 z-10">
                                {asset.type === 'creative' && (asset.mime_type?.startsWith('image/') || asset.name.match(/\.(jpg|jpeg|png|gif|webp)$/i)) && (
                                    <button
                                        onClick={() => setPreviewAsset(asset)}
                                        className="p-1.5 bg-white/90 backdrop-blur-sm rounded-[var(--radius-sm)] shadow-sm hover:bg-white text-neutral-700"
                                        title="Preview"
                                    >
                                        <Eye size={14} />
                                    </button>
                                )}
                                <button
                                    onClick={() => handleDownload(asset)}
                                    className="p-1.5 bg-white/90 backdrop-blur-sm rounded-[var(--radius-sm)] shadow-sm hover:bg-white"
                                >
                                    <Download size={14} />
                                </button>
                                <button
                                    onClick={() => handleDelete(asset)}
                                    className="p-1.5 bg-white/90 backdrop-blur-sm rounded-[var(--radius-sm)] shadow-sm hover:bg-red-50 text-red-500"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </Card>
                    ))}
                </div>
            ) : (
                <Card>
                    <div className="divide-y divide-neutral-100">
                        {filteredAssets.map((asset) => {
                            const Icon = typeIcons[asset.type] || File;
                            return (
                                <div key={asset.id} className="flex items-center justify-between py-3 group">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-10 h-10 bg-neutral-100 rounded-[var(--radius-sm)] flex items-center justify-center shrink-0 overflow-hidden relative">
                                            {asset.type === 'creative' && (asset.mime_type?.startsWith('image/') || asset.name.match(/\.(jpg|jpeg|png|gif|webp)$/i)) ? (
                                                <AssetThumbnail asset={asset} small />
                                            ) : (
                                                <Icon size={18} className="text-neutral-400" />
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-neutral-900 truncate">{asset.name}</p>
                                            <p className="text-xs text-neutral-400">{formatFileSize(asset.file_size)}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Chip variant="default">{asset.type}</Chip>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {asset.type === 'creative' && (asset.mime_type?.startsWith('image/') || asset.name.match(/\.(jpg|jpeg|png|gif|webp)$/i)) && (
                                                <button
                                                    onClick={() => setPreviewAsset(asset)}
                                                    className="p-1.5 hover:bg-neutral-100 rounded-[var(--radius-sm)] text-neutral-600"
                                                    title="Preview"
                                                >
                                                    <Eye size={14} />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleDownload(asset)}
                                                className="p-1.5 hover:bg-neutral-100 rounded-[var(--radius-sm)]"
                                            >
                                                <Download size={14} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(asset)}
                                                className="p-1.5 hover:bg-red-50 rounded-[var(--radius-sm)] text-red-500"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Card>
            )}


            {/* Image Preview Modal */}
            {previewAsset && (
                <AssetPreviewModal
                    asset={previewAsset}
                    onClose={() => setPreviewAsset(null)}
                />
            )}
        </div>
    );
}

function AssetThumbnail({ asset, small = false }: { asset: ClientAsset; small?: boolean }) {
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const Icon = typeIcons[asset.type] || File;
    const isImage = asset.type === 'creative' && (asset.mime_type?.startsWith('image/') || asset.name.match(/\.(jpg|jpeg|png|gif|webp)$/i));

    useEffect(() => {
        if (!isImage) return;

        let mounted = true;
        async function loadUrl() {
            const supabase = createBrowserClient();
            const { data } = await supabase.storage
                .from('client-assets')
                .createSignedUrl(asset.storage_path, 3600); // 1 hour expiry

            if (mounted && data?.signedUrl) {
                setImageUrl(data.signedUrl);
            }
        }

        loadUrl();
        return () => { mounted = false; };
    }, [asset.storage_path, isImage]);

    if (isImage && imageUrl) {
        return (
            <img
                src={imageUrl}
                alt={asset.name}
                className={`w-full h-full object-cover ${small ? '' : 'transition-transform duration-300 group-hover:scale-105'}`}
            />
        );
    }

    return (
        <div className={`w-full h-full flex items-center justify-center ${small ? 'bg-neutral-100' : 'bg-neutral-100'}`}>
            <Icon size={small ? 18 : 32} className="text-neutral-400" />
        </div>
    );
}

function AssetPreviewModal({ asset, onClose }: { asset: ClientAsset; onClose: () => void }) {
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;
        async function loadUrl() {
            const supabase = createBrowserClient();
            const { data } = await supabase.storage
                .from('client-assets')
                .createSignedUrl(asset.storage_path, 3600); // 1 hour expiry

            if (mounted && data?.signedUrl) {
                setImageUrl(data.signedUrl);
                setLoading(false);
            }
        }

        loadUrl();
        return () => { mounted = false; };
    }, [asset.storage_path]);

    // Close on escape key
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 md:p-8" onClick={onClose}>
            <div className="relative max-w-full max-h-full flex items-center justify-center p-2" onClick={(e) => e.stopPropagation()}>
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute -top-12 right-0 text-white/70 hover:text-white transition-colors"
                >
                    <span className="sr-only">Close</span>
                    <Eye size={24} className="rotate-45" /> {/* Just using Eye as placeholder if X not imported, but SVG below covers it */}
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>

                {loading ? (
                    <div className="text-white">Loading...</div>
                ) : imageUrl ? (
                    <img
                        src={imageUrl}
                        alt={asset.name}
                        className="max-w-full max-h-[90vh] object-contain rounded-md shadow-2xl"
                    />
                ) : (
                    <div className="text-white">Failed to load image</div>
                )}
            </div>
        </div>
    );
}


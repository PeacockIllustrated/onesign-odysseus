'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    ArrowLeft,
    Plus,
    Loader2,
    Save,
    FileText,
    CheckCircle2,
    RotateCcw,
    Trash2,
    Info,
} from 'lucide-react';
import { Card, Chip } from '@/app/(portal)/components/ui';
import {
    updateSurvey,
    saveSurveyItems,
    setSurveyStatus,
    deleteSurvey,
} from '@/lib/site-surveys/actions';
import {
    CONDITION_FLAGS,
    SURVEY_STATUS_LABELS,
    type SurveyConditions,
    type SurveyDetail,
    type SurveyPhotoWithUrl,
    type SurveyStatus,
} from '@/lib/site-surveys/types';
import { ItemEditor } from './ItemEditor';
import { PhotoGrid } from './PhotoGrid';
import {
    blankItem,
    clearSurveyDraft,
    itemToInput,
    readSurveyDraft,
    rowToEditItem,
    writeSurveyDraft,
    type EditItem,
} from './editor-types';

interface HeaderState {
    title: string;
    orgId: string;
    clientName: string;
    siteId: string;
    siteAddress: string;
    contactId: string;
    surveyDate: string;
}

interface Props {
    detail: SurveyDetail;
    orgs: { id: string; name: string }[];
    contacts: { id: string; org_id: string; first_name: string; last_name: string }[];
    sites: { id: string; org_id: string; name: string }[];
}

function buildInitial(detail: SurveyDetail): {
    header: HeaderState;
    conditions: SurveyConditions;
    notes: string;
    items: EditItem[];
} {
    const s = detail.survey;
    return {
        header: {
            title: s.title ?? '',
            orgId: s.org_id ?? '',
            clientName: s.client_name ?? '',
            siteId: s.site_id ?? '',
            siteAddress: s.site_address ?? '',
            contactId: s.contact_id ?? '',
            surveyDate: s.survey_date,
        },
        conditions: s.conditions_json ?? {},
        notes: s.notes ?? '',
        items: detail.items.map(rowToEditItem),
    };
}

const inputCls =
    'w-full text-sm border border-neutral-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black';

export function SurveyClient({ detail, orgs, contacts, sites }: Props) {
    const router = useRouter();
    const id = detail.survey.id;
    const serverInitial = useMemo(() => buildInitial(detail), [detail]);

    const [header, setHeader] = useState<HeaderState>(serverInitial.header);
    const [conditions, setConditions] = useState<SurveyConditions>(
        serverInitial.conditions,
    );
    const [notes, setNotes] = useState(serverInitial.notes);
    const [items, setItems] = useState<EditItem[]>(serverInitial.items);
    const [photos, setPhotos] = useState<SurveyPhotoWithUrl[]>(detail.photos);
    const [status, setStatus] = useState<SurveyStatus>(detail.survey.status);

    const [draftRestored, setDraftRestored] = useState(false);
    const [savedAt, setSavedAt] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [saving, startSave] = useTransition();
    const [statusPending, startStatus] = useTransition();

    // Restore a local draft AFTER mount (never in the initializer — that would
    // mismatch the SSR'd HTML). This is the "don't lose work on-site" guarantee.
    useEffect(() => {
        const d = readSurveyDraft(id);
        if (!d) return;
        /* eslint-disable react-hooks/set-state-in-effect --
           one-time, hydration-safe restore of the on-device draft: localStorage
           is unavailable during SSR, so it must be read after mount, not in the
           state initializer (that would cause a hydration mismatch). */
        setHeader(d.header);
        setConditions(d.conditions);
        setNotes(d.notes);
        setItems(d.items);
        setDraftRestored(true);
        /* eslint-enable react-hooks/set-state-in-effect */
    }, [id]);

    // Autosave the typed state to the device (photos are server-side already).
    const firstRun = useRef(true);
    useEffect(() => {
        if (firstRun.current) {
            firstRun.current = false;
            return;
        }
        const t = setTimeout(
            () => writeSurveyDraft(id, { header, conditions, notes, items }),
            500,
        );
        return () => clearTimeout(t);
    }, [id, header, conditions, notes, items]);

    const orgContacts = header.orgId
        ? contacts.filter((c) => c.org_id === header.orgId)
        : [];
    const orgSites = header.orgId
        ? sites.filter((s) => s.org_id === header.orgId)
        : [];

    const generalPhotos = useMemo(
        () => photos.filter((p) => !p.item_id),
        [photos],
    );

    const patchHeader = (patch: Partial<HeaderState>) =>
        setHeader((h) => ({ ...h, ...patch }));
    const patchCondition = (patch: Partial<SurveyConditions>) =>
        setConditions((c) => ({ ...c, ...patch }));

    const updateItem = (key: string, patch: Partial<EditItem>) =>
        setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
    const removeItem = (key: string) =>
        setItems((prev) => prev.filter((it) => it.key !== key));
    const addItem = () => setItems((prev) => [...prev, blankItem()]);

    const addPhoto = (p: SurveyPhotoWithUrl) => setPhotos((prev) => [...prev, p]);
    const updatePhotoState = (p: SurveyPhotoWithUrl) =>
        setPhotos((prev) => prev.map((x) => (x.id === p.id ? p : x)));
    const deletePhotoState = (pid: string) =>
        setPhotos((prev) => prev.filter((x) => x.id !== pid));

    function handleSave() {
        setError(null);
        startSave(async () => {
            const headerRes = await updateSurvey(id, {
                title: header.title,
                org_id: header.orgId || null,
                client_name: header.clientName,
                site_id: header.siteId || null,
                site_address: header.siteAddress,
                contact_id: header.contactId || null,
                survey_date: header.surveyDate,
                conditions,
                notes,
            });
            if (!headerRes.ok) {
                setError(headerRes.error);
                return;
            }

            const itemsRes = await saveSurveyItems(
                id,
                items.map((it, i) => itemToInput(it, i)),
            );
            if (!itemsRes.ok) {
                setError(itemsRes.error);
                return;
            }

            // Reconcile: rows now carry DB ids (so per-item photos can attach).
            setItems(itemsRes.data.map(rowToEditItem));
            clearSurveyDraft(id);
            setDraftRestored(false);
            firstRun.current = true; // don't immediately re-persist a fresh draft
            setSavedAt(new Date().toLocaleTimeString());
        });
    }

    function toggleStatus() {
        const next: SurveyStatus = status === 'completed' ? 'draft' : 'completed';
        startStatus(async () => {
            const res = await setSurveyStatus(id, next);
            if (!res.ok) {
                setError(res.error);
                return;
            }
            setStatus(next);
        });
    }

    function handleDelete() {
        if (
            !window.confirm(
                'Delete this survey and all its photos? This cannot be undone.',
            )
        )
            return;
        startSave(async () => {
            const res = await deleteSurvey(id);
            if (!res.ok) {
                setError(res.error);
                return;
            }
            clearSurveyDraft(id);
            router.push('/admin/site-surveys');
        });
    }

    function discardDraft() {
        clearSurveyDraft(id);
        const init = serverInitial;
        setHeader(init.header);
        setConditions(init.conditions);
        setNotes(init.notes);
        setItems(init.items);
        setDraftRestored(false);
    }

    return (
        <div className="mx-auto max-w-5xl p-4 md:p-6">
            {/* Top bar */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <Link
                        href="/admin/site-surveys"
                        className="rounded p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-black"
                    >
                        <ArrowLeft size={18} />
                    </Link>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-lg font-bold tracking-tight">
                                {detail.survey.reference}
                            </h1>
                            <Chip variant={status === 'completed' ? 'approved' : 'draft'}>
                                {SURVEY_STATUS_LABELS[status]}
                            </Chip>
                        </div>
                        {header.title && (
                            <p className="text-sm text-neutral-500">{header.title}</p>
                        )}
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Link
                        href={`/admin/site-surveys/${id}/pack`}
                        target="_blank"
                        className="inline-flex items-center gap-2 rounded border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-50"
                    >
                        <FileText size={15} /> survey pack
                    </Link>
                    <button
                        onClick={toggleStatus}
                        disabled={statusPending}
                        className="inline-flex items-center gap-2 rounded border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-50"
                    >
                        {statusPending ? (
                            <Loader2 size={15} className="animate-spin" />
                        ) : (
                            <CheckCircle2 size={15} />
                        )}
                        {status === 'completed' ? 'reopen' : 'mark complete'}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="btn-primary inline-flex items-center gap-2"
                    >
                        {saving ? (
                            <Loader2 size={15} className="animate-spin" />
                        ) : (
                            <Save size={15} />
                        )}
                        save
                    </button>
                </div>
            </div>

            {draftRestored && (
                <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    <span className="inline-flex items-center gap-2">
                        <Info size={15} /> Restored unsaved changes from this device.
                    </span>
                    <button
                        onClick={discardDraft}
                        className="inline-flex items-center gap-1 text-xs font-semibold hover:underline"
                    >
                        <RotateCcw size={13} /> discard
                    </button>
                </div>
            )}

            {error && (
                <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                </div>
            )}
            {savedAt && !error && (
                <p className="mb-4 text-xs text-neutral-400">Saved at {savedAt}</p>
            )}

            <div className="space-y-4">
                {/* Header / client */}
                <Card className="space-y-3">
                    <h3 className="text-sm font-bold">Survey details</h3>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                            <label className="text-xs font-medium text-neutral-600">Title</label>
                            <input
                                value={header.title}
                                onChange={(e) => patchHeader({ title: e.target.value })}
                                className={inputCls}
                                placeholder="e.g. Frontage signage survey"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-neutral-600">
                                Survey date
                            </label>
                            <input
                                type="date"
                                value={header.surveyDate}
                                onChange={(e) => patchHeader({ surveyDate: e.target.value })}
                                className={inputCls}
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-neutral-600">
                                Client (existing)
                            </label>
                            <select
                                value={header.orgId}
                                onChange={(e) =>
                                    patchHeader({
                                        orgId: e.target.value,
                                        siteId: '',
                                        contactId: '',
                                    })
                                }
                                className={inputCls}
                            >
                                <option value="">— none / prospect —</option>
                                {orgs.map((o) => (
                                    <option key={o.id} value={o.id}>
                                        {o.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-medium text-neutral-600">
                                Client name {header.orgId ? '(override)' : '(if not listed)'}
                            </label>
                            <input
                                value={header.clientName}
                                onChange={(e) => patchHeader({ clientName: e.target.value })}
                                className={inputCls}
                                placeholder="e.g. Slick Construction"
                            />
                        </div>
                        {header.orgId && (
                            <>
                                <div>
                                    <label className="text-xs font-medium text-neutral-600">
                                        Site
                                    </label>
                                    <select
                                        value={header.siteId}
                                        onChange={(e) => patchHeader({ siteId: e.target.value })}
                                        className={inputCls}
                                    >
                                        <option value="">— none —</option>
                                        {orgSites.map((s) => (
                                            <option key={s.id} value={s.id}>
                                                {s.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-neutral-600">
                                        Contact
                                    </label>
                                    <select
                                        value={header.contactId}
                                        onChange={(e) => patchHeader({ contactId: e.target.value })}
                                        className={inputCls}
                                    >
                                        <option value="">— none —</option>
                                        {orgContacts.map((c) => (
                                            <option key={c.id} value={c.id}>
                                                {c.first_name} {c.last_name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </>
                        )}
                        <div className="sm:col-span-2">
                            <label className="text-xs font-medium text-neutral-600">
                                Site address
                            </label>
                            <input
                                value={header.siteAddress}
                                onChange={(e) => patchHeader({ siteAddress: e.target.value })}
                                className={inputCls}
                                placeholder="e.g. 14 High St, Gateshead NE8"
                            />
                        </div>
                    </div>
                </Card>

                {/* Access & build conditions */}
                <Card className="space-y-3">
                    <h3 className="text-sm font-bold">Access &amp; build conditions</h3>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {CONDITION_FLAGS.map(({ key, label }) => (
                            <label
                                key={key}
                                className="inline-flex items-center gap-2 text-sm text-neutral-700"
                            >
                                <input
                                    type="checkbox"
                                    checked={!!conditions[key]}
                                    onChange={(e) =>
                                        patchCondition({ [key]: e.target.checked })
                                    }
                                    className="h-4 w-4 rounded border-neutral-300"
                                />
                                {label}
                            </label>
                        ))}
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                            <label className="text-xs font-medium text-neutral-600">
                                Access notes
                            </label>
                            <textarea
                                value={conditions.access_notes ?? ''}
                                onChange={(e) => patchCondition({ access_notes: e.target.value })}
                                rows={2}
                                className={inputCls}
                                placeholder="height, obstructions, working hours…"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-neutral-600">
                                Parking / loading
                            </label>
                            <textarea
                                value={conditions.parking_notes ?? ''}
                                onChange={(e) => patchCondition({ parking_notes: e.target.value })}
                                rows={2}
                                className={inputCls}
                                placeholder="where the van/MEWP can go"
                            />
                        </div>
                    </div>
                </Card>

                {/* Items */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold">
                            Measured items ({items.length})
                        </h3>
                        <button
                            onClick={addItem}
                            className="inline-flex items-center gap-2 rounded border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50"
                        >
                            <Plus size={14} /> add item
                        </button>
                    </div>
                    {items.length === 0 ? (
                        <Card>
                            <p className="py-6 text-center text-sm text-neutral-500">
                                No items yet — add the signs / parts you measured.
                            </p>
                        </Card>
                    ) : (
                        items.map((it, i) => (
                            <ItemEditor
                                key={it.key}
                                item={it}
                                index={i}
                                surveyId={id}
                                photos={photos.filter((p) => p.item_id === it.id)}
                                onChange={(patch) => updateItem(it.key, patch)}
                                onRemove={() => removeItem(it.key)}
                                onAddPhoto={addPhoto}
                                onUpdatePhoto={updatePhotoState}
                                onDeletePhoto={deletePhotoState}
                            />
                        ))
                    )}
                </div>

                {/* General photos */}
                <Card className="space-y-2">
                    <h3 className="text-sm font-bold">General site photos</h3>
                    <PhotoGrid
                        surveyId={id}
                        itemId={null}
                        photos={generalPhotos}
                        onAdd={addPhoto}
                        onUpdate={updatePhotoState}
                        onDelete={deletePhotoState}
                    />
                </Card>

                {/* Survey notes */}
                <Card className="space-y-2">
                    <h3 className="text-sm font-bold">Survey notes</h3>
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={3}
                        className={inputCls}
                        placeholder="overall observations, anything else the designer/estimator needs"
                    />
                </Card>

                {/* Danger zone */}
                <div className="pt-2">
                    <button
                        onClick={handleDelete}
                        disabled={saving}
                        className="inline-flex items-center gap-2 text-sm font-medium text-red-600 hover:text-red-700"
                    >
                        <Trash2 size={15} /> delete survey
                    </button>
                </div>
            </div>
        </div>
    );
}

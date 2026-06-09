'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    ArrowLeft,
    Loader2,
    FileText,
    CheckCircle2,
    Trash2,
    Info,
    Check,
} from 'lucide-react';
import {
    updateSurvey,
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
import { SurveyPhotos } from './SurveyPhotos';
import {
    clearSurveyDraft,
    readSurveyDraft,
    writeSurveyDraft,
} from './editor-types';
import { panelCls, sectionTitleCls, secondaryBtnCls } from '../ui';

interface Props {
    detail: SurveyDetail;
    // accepted for symmetry with the route loader; unused in the simple flow
    orgs?: unknown;
    contacts?: unknown;
    sites?: unknown;
}

const bigInput =
    'w-full rounded-lg border border-neutral-300 px-3.5 py-3 text-base transition-colors focus:border-[#4e7e8c] focus:outline-none focus:ring-2 focus:ring-[#e8f0f3]';

type SaveState = 'idle' | 'saving' | 'saved';

export function SurveyClient({ detail }: Props) {
    const router = useRouter();
    const id = detail.survey.id;

    const initial = useMemo(
        () => ({
            client: detail.survey.client_name ?? '',
            job: detail.survey.title ?? '',
            date: detail.survey.survey_date,
            conditions: (detail.survey.conditions_json ?? {}) as SurveyConditions,
            notes: detail.survey.notes ?? '',
        }),
        [detail],
    );

    const [client, setClient] = useState(initial.client);
    const [job, setJob] = useState(initial.job);
    const [surveyDate, setSurveyDate] = useState(initial.date);
    const [conditions, setConditions] = useState<SurveyConditions>(
        initial.conditions,
    );
    const [notes, setNotes] = useState(initial.notes);
    const [photos, setPhotos] = useState<SurveyPhotoWithUrl[]>(detail.photos);
    const [status, setStatus] = useState<SurveyStatus>(detail.survey.status);

    const [draftRestored, setDraftRestored] = useState(false);
    const [saveState, setSaveState] = useState<SaveState>('idle');
    const [error, setError] = useState<string | null>(null);
    const [busy, startBusy] = useTransition();

    // Restore an on-device draft after mount (hydration-safe).
    useEffect(() => {
        const d = readSurveyDraft(id);
        if (!d) return;
        /* eslint-disable react-hooks/set-state-in-effect -- localStorage is
           unavailable during SSR; restoring here avoids a hydration mismatch. */
        setClient(d.client);
        setJob(d.job);
        setSurveyDate(d.date);
        setConditions(d.conditions);
        setNotes(d.notes);
        setDraftRestored(true);
        /* eslint-enable react-hooks/set-state-in-effect */
    }, [id]);

    // Silent auto-save: write the device draft immediately, persist to the
    // server debounced. No "Save" button to forget.
    const firstRun = useRef(true);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (firstRun.current) {
            firstRun.current = false;
            return;
        }
        writeSurveyDraft(id, { client, job, date: surveyDate, conditions, notes });
        // "Saving…" is UI feedback for the debounced device/server write below.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSaveState('saving');
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(async () => {
            const res = await updateSurvey(id, {
                client_name: client,
                title: job,
                survey_date: surveyDate,
                conditions,
                notes,
            });
            if (res.ok) {
                clearSurveyDraft(id);
                setDraftRestored(false);
                setSaveState('saved');
            } else {
                setError(res.error);
                setSaveState('idle');
            }
        }, 900);
        return () => {
            if (timer.current) clearTimeout(timer.current);
        };
    }, [id, client, job, surveyDate, conditions, notes]);

    const toggleCondition = (key: keyof SurveyConditions) =>
        setConditions((c) => ({ ...c, [key]: !c[key] }));

    const addPhoto = (p: SurveyPhotoWithUrl) => setPhotos((prev) => [...prev, p]);
    const updatePhoto = (p: SurveyPhotoWithUrl) =>
        setPhotos((prev) => prev.map((x) => (x.id === p.id ? p : x)));
    const removePhoto = (pid: string) =>
        setPhotos((prev) => prev.filter((x) => x.id !== pid));

    function finish() {
        if (timer.current) clearTimeout(timer.current);
        const next: SurveyStatus = status === 'completed' ? 'draft' : 'completed';
        startBusy(async () => {
            await updateSurvey(id, {
                client_name: client,
                title: job,
                survey_date: surveyDate,
                conditions,
                notes,
            });
            const res = await setSurveyStatus(id, next);
            if (!res.ok) {
                setError(res.error);
                return;
            }
            clearSurveyDraft(id);
            setSaveState('saved');
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
        startBusy(async () => {
            const res = await deleteSurvey(id);
            if (!res.ok) {
                setError(res.error);
                return;
            }
            clearSurveyDraft(id);
            router.push('/admin/site-surveys');
        });
    }

    return (
        <div className="mx-auto max-w-2xl p-4 md:p-6">
            {/* Top bar */}
            <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <Link
                        href="/admin/site-surveys"
                        className="rounded p-1.5 text-neutral-400 transition-colors hover:bg-[#e8f0f3] hover:text-[#3a5f6a]"
                    >
                        <ArrowLeft size={18} />
                    </Link>
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-[#3a5f6a]">
                            {detail.survey.reference}
                        </span>
                        <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                                status === 'completed'
                                    ? 'bg-[#e8f0f3] text-[#3a5f6a]'
                                    : 'bg-neutral-100 text-neutral-600'
                            }`}
                        >
                            {SURVEY_STATUS_LABELS[status]}
                        </span>
                    </div>
                </div>
                <span className="text-xs text-neutral-400">
                    {saveState === 'saving'
                        ? 'Saving…'
                        : saveState === 'saved'
                          ? 'Saved ✓'
                          : ''}
                </span>
            </div>

            {draftRestored && (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    <Info size={15} /> Picked up where you left off on this device.
                </div>
            )}
            {error && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                </div>
            )}

            <div className="space-y-5">
                {/* Who & what */}
                <div className={`${panelCls} space-y-3 p-4`}>
                    <div>
                        <label className="mb-1 block text-sm font-semibold text-neutral-700">
                            Who is this for?
                        </label>
                        <input
                            value={client}
                            onChange={(e) => setClient(e.target.value)}
                            className={bigInput}
                            placeholder="Client name, e.g. Slick Construction"
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-semibold text-neutral-700">
                            What’s the job?
                        </label>
                        <input
                            value={job}
                            onChange={(e) => setJob(e.target.value)}
                            className={bigInput}
                            placeholder="e.g. Shop frontage signage"
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-semibold text-neutral-700">
                            Date
                        </label>
                        <input
                            type="date"
                            value={surveyDate}
                            onChange={(e) => setSurveyDate(e.target.value)}
                            className={bigInput}
                        />
                    </div>
                </div>

                {/* How it works */}
                <div className="rounded-lg border border-[#b8d0d8] bg-[#e8f0f3] px-4 py-3 text-sm text-[#2f4d56]">
                    <p className="mb-1 font-semibold">How to do this survey</p>
                    <ol className="list-decimal space-y-0.5 pl-5">
                        <li>Take a photo of each sign or part.</li>
                        <li>Draw the sizes on the photo and type the width × height.</li>
                        <li>Tick anything special and add a note.</li>
                        <li>Tap <strong>Finish survey</strong>.</li>
                    </ol>
                </div>

                {/* Photos */}
                <div>
                    <div className={`mb-2 ${sectionTitleCls}`}>
                        Photos &amp; measurements
                    </div>
                    <SurveyPhotos
                        surveyId={id}
                        photos={photos}
                        onAdd={addPhoto}
                        onUpdate={updatePhoto}
                        onDelete={removePhoto}
                    />
                </div>

                {/* Anything special */}
                <div>
                    <div className={`mb-2 ${sectionTitleCls}`}>
                        Anything special? (tap any that apply)
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {CONDITION_FLAGS.map(({ key, label }) => {
                            const on = !!conditions[key];
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => toggleCondition(key)}
                                    className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold transition-colors ${
                                        on
                                            ? 'bg-[#4e7e8c] text-white shadow-sm'
                                            : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                                    }`}
                                >
                                    {on && <Check size={15} />}
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Notes */}
                <div>
                    <div className={`mb-2 ${sectionTitleCls}`}>
                        Notes for the office (optional)
                    </div>
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={3}
                        className={bigInput}
                        placeholder="Anything else the designer or estimator should know"
                    />
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center">
                    <button
                        onClick={finish}
                        disabled={busy}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#4e7e8c] px-4 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-[#3a5f6a] disabled:opacity-60"
                    >
                        {busy ? (
                            <Loader2 size={18} className="animate-spin" />
                        ) : (
                            <CheckCircle2 size={18} />
                        )}
                        {status === 'completed' ? 'Re-open survey' : 'Finish survey'}
                    </button>
                    <Link
                        href={`/admin/site-surveys/${id}/pack`}
                        target="_blank"
                        className={`${secondaryBtnCls} justify-center px-4 py-3.5`}
                    >
                        <FileText size={16} /> Survey pack
                    </Link>
                </div>

                <div className="pt-2 text-center">
                    <button
                        onClick={handleDelete}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-400 hover:text-red-600"
                    >
                        <Trash2 size={13} /> delete this survey
                    </button>
                </div>
            </div>
        </div>
    );
}

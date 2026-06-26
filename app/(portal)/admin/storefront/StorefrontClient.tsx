'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader2, Plus, Save } from 'lucide-react';
import { listDesigns } from '@/lib/visualiser/actions';
import type { VisualiserDesignRow } from '@/lib/visualiser/types';
import {
    DEFAULT_TEMPLATE,
    getStorefrontProject,
    getSurveyAnchors,
    listLinkableSurveys,
    listStorefrontProjects,
    saveStorefrontProject,
    type LinkableSurvey,
    type PlacedSign,
    type StorefrontProjectListItem,
    type StorefrontSpec,
    type SurveyAnchor,
} from '@/lib/storefront';

const loading = () => (
    <div className="flex h-full items-center justify-center text-sm text-neutral-500">
        <Loader2 size={18} className="mr-2 animate-spin" aria-hidden /> Loading…
    </div>
);
const StorefrontScene = dynamic(() => import('./StorefrontScene'), { ssr: false, loading });
const StorefrontTraceTool = dynamic(() => import('./StorefrontTraceTool'), { ssr: false, loading });

type Mode = 'template' | 'trace';

function signFromDesign(d: VisualiserDesignRow): PlacedSign {
    return {
        widthMm: d.params_json.panelWidthMm,
        heightMm: d.params_json.panelHeightMm,
        colour: d.params_json.panelColor ?? '#dfe7ee',
        label: d.name,
    };
}

export default function StorefrontClient() {
    const [mode, setMode] = useState<Mode>('template');
    const [spec, setSpec] = useState<StorefrontSpec>(DEFAULT_TEMPLATE);
    const [sign, setSign] = useState<PlacedSign | null>(null);

    const [designs, setDesigns] = useState<VisualiserDesignRow[]>([]);
    const [designId, setDesignId] = useState<string>('');

    const [projects, setProjects] = useState<StorefrontProjectListItem[]>([]);
    const [projectId, setProjectId] = useState<string | null>(null);
    const [projectName, setProjectName] = useState('');

    const [surveys, setSurveys] = useState<LinkableSurvey[]>([]);
    const [surveyId, setSurveyId] = useState<string>('');
    const [surveyAnchors, setSurveyAnchors] = useState<SurveyAnchor[]>([]);

    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    useEffect(() => {
        listDesigns().then((r) => r.ok && setDesigns(r.data));
        listStorefrontProjects().then((r) => r.ok && setProjects(r.data));
        listLinkableSurveys().then((r) => r.ok && setSurveys(r.data));
    }, []);

    useEffect(() => {
        if (!surveyId) {
            setSurveyAnchors([]);
            return;
        }
        getSurveyAnchors(surveyId).then((r) => setSurveyAnchors(r.ok ? r.data : []));
    }, [surveyId]);

    const pickDesign = (id: string) => {
        setDesignId(id);
        const d = designs.find((x) => x.id === id);
        setSign(d ? signFromDesign(d) : null);
    };

    const onSave = async () => {
        setSaving(true);
        setMsg(null);
        const res = await saveStorefrontProject({
            id: projectId,
            name: projectName.trim() || 'Untitled storefront',
            spec,
            surveyId: surveyId || null,
            designId: designId || null,
        });
        setSaving(false);
        if (!res.ok) {
            setMsg(res.error);
            return;
        }
        setProjectId(res.data.id);
        setMsg('Saved.');
        const list = await listStorefrontProjects();
        if (list.ok) setProjects(list.data);
    };

    const onLoad = async (id: string) => {
        if (!id) return;
        const res = await getStorefrontProject(id);
        if (!res.ok) {
            setMsg(res.error);
            return;
        }
        setSpec(res.data.spec);
        setProjectId(res.data.id);
        setProjectName(res.data.name);
        setSurveyId(res.data.survey_id ?? '');
        const did = res.data.linked_visualiser_design_id ?? '';
        setDesignId(did);
        const d = designs.find((x) => x.id === did);
        setSign(d ? signFromDesign(d) : null);
        setMode('template');
        setMsg(`Loaded ${res.data.name}.`);
    };

    const onNew = () => {
        setProjectId(null);
        setProjectName('');
        setSpec(DEFAULT_TEMPLATE);
        setSign(null);
        setDesignId('');
        setSurveyId('');
        setMsg(null);
        setMode('trace');
    };

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-lg font-semibold text-neutral-800">Storefront Studio</h1>
                <p className="mt-1 max-w-2xl text-sm text-neutral-500">
                    Reconstruct a prospect&apos;s shopfront to scale from primitive blocks (no AI mesh), then
                    drop a sign from the visualiser into the fascia at 1:1. Proportions come from a survey or a
                    calibrated photo trace, so the model is dimensionally true.
                </p>
            </div>

            {/* project + survey toolbar */}
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-2.5">
                <input
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="Project name"
                    className="w-44 rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs"
                />
                <button
                    type="button"
                    onClick={onSave}
                    disabled={saving}
                    className="flex items-center gap-1.5 rounded-md bg-[#4e7e8c] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#3a5f6a] disabled:opacity-60"
                >
                    {saving ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Save size={13} aria-hidden />}
                    Save
                </button>
                <button
                    type="button"
                    onClick={onNew}
                    className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                >
                    <Plus size={13} aria-hidden /> New
                </button>
                <select
                    value={projectId ?? ''}
                    onChange={(e) => onLoad(e.target.value)}
                    className="rounded-md border border-neutral-300 px-2 py-1.5 text-xs"
                >
                    <option value="">Load project…</option>
                    {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                            {p.reference} · {p.name}
                        </option>
                    ))}
                </select>
                <select
                    value={surveyId}
                    onChange={(e) => setSurveyId(e.target.value)}
                    className="rounded-md border border-neutral-300 px-2 py-1.5 text-xs"
                    title="Link a site survey as the dimensional source of truth"
                >
                    <option value="">Link survey…</option>
                    {surveys.map((s) => (
                        <option key={s.id} value={s.id}>
                            {s.reference} · {s.label}
                        </option>
                    ))}
                </select>
                {msg && <span className="text-xs text-neutral-500">{msg}</span>}
            </div>

            {/* sign picker */}
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-neutral-600">Add from visualiser:</span>
                <select
                    value={designId}
                    onChange={(e) => pickDesign(e.target.value)}
                    className="rounded-md border border-neutral-300 px-2 py-1.5 text-xs"
                >
                    <option value="">No sign</option>
                    {designs.map((d) => (
                        <option key={d.id} value={d.id}>
                            {d.name} · {d.params_json.panelWidthMm}×{d.params_json.panelHeightMm} mm
                        </option>
                    ))}
                </select>
                {sign && (
                    <span className="text-xs text-neutral-500">
                        Placed at 1:1 — {sign.widthMm}×{sign.heightMm} mm
                    </span>
                )}
            </div>

            {/* mode tabs */}
            <div className="inline-flex rounded-lg border border-neutral-200 bg-neutral-50 p-0.5 text-xs font-medium">
                {(['template', 'trace'] as Mode[]).map((m) => (
                    <button
                        key={m}
                        type="button"
                        onClick={() => setMode(m)}
                        className={`rounded-md px-3 py-1.5 transition ${
                            mode === m ? 'bg-[#4e7e8c] text-white' : 'text-neutral-600 hover:bg-neutral-100'
                        }`}
                    >
                        {m === 'template' ? '3D Model' : 'Trace from photo'}
                    </button>
                ))}
            </div>

            {mode === 'template' ? (
                <div className="h-[64vh] w-full overflow-hidden rounded-xl border border-neutral-200 bg-[#e4f0f8]">
                    <StorefrontScene spec={spec} sign={sign} />
                </div>
            ) : (
                <StorefrontTraceTool sign={sign} onSpec={setSpec} surveyAnchors={surveyAnchors} />
            )}
        </div>
    );
}

import { requireAdmin } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase-server';
import { PageHeader, Card, Chip } from '@/app/(portal)/components/ui';
import { notFound } from 'next/navigation';
import { getRateCardForPricingSet } from '@/lib/quoter/rate-card';
import { QuoteDetailClient } from './QuoteDetailClient';
import { Quote, QuoteItem, PanelLettersV1Input } from '@/lib/quoter/types';
import { hasOverrides } from '@/lib/quoter/utils';
import Link from 'next/link';
import { ArrowLeft, Printer, Copy, AlertTriangle, History, Send } from 'lucide-react';
import { DuplicateQuoteButton } from './DuplicateQuoteButton';
import { QuoteHeaderEdit } from './QuoteHeaderEdit';
import { CreateJobButton } from './CreateJobButton';
import { CreateInvoiceButton } from './CreateInvoiceButton';

interface PageProps {
    params: Promise<{ id: string }>;
}

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatPence(pence: number): string {
    return `£${(pence / 100).toFixed(2)}`;
}

function getStatusVariant(status: string): 'draft' | 'review' | 'approved' | 'done' | 'default' {
    switch (status) {
        case 'draft': return 'draft';
        case 'sent': return 'review';
        case 'accepted': return 'approved';
        case 'rejected': return 'default';
        case 'expired': return 'default';
        default: return 'default';
    }
}

export default async function QuoteDetailPage({ params }: PageProps) {
    await requireAdmin();

    const { id } = await params;
    const supabase = await createServerClient();

    // Fetch quote with items
    const { data: quote, error: quoteError } = await supabase
        .from('quotes')
        .select('*')
        .eq('id', id)
        .single();

    if (quoteError || !quote) {
        notFound();
    }

    const { data: items } = await supabase
        .from('quote_items')
        .select('*')
        .eq('quote_id', id)
        .order('created_at', { ascending: true });

    // Fetch audit logs
    const { data: audits } = await supabase
        .from('quote_audits')
        .select('*')
        .eq('quote_id', id)
        .order('created_at', { ascending: false });

    // Check for existing production job
    const { data: existingProductionJob } = await supabase
        .from('production_jobs')
        .select('id, job_number')
        .eq('quote_id', id)
        .maybeSingle();

    // Check for existing invoice
    const { data: existingInvoice } = await supabase
        .from('invoices')
        .select('id, invoice_number')
        .eq('quote_id', id)
        .neq('status', 'cancelled')
        .maybeSingle();

    // Get rate card for this quote's pricing set
    const rateCard = await getRateCardForPricingSet(quote.pricing_set_id);

    // Prepare simplified rate card data for client component
    const panelMaterials = Array.from(rateCard.panelPriceByMaterialAndSize.keys())
        .map(key => key.split('::')[0])
        .filter((v, i, a) => a.indexOf(v) === i);

    const panelFinishes = Array.from(rateCard.finishCostPerM2ByFinish.keys());

    const finishRulesByType: Record<string, string[]> = {};
    for (const [type, finishes] of rateCard.finishRulesByType) {
        finishRulesByType[type] = Array.from(finishes);
    }

    // Additional rate card data for client-side validation
    const availableHeights = Array.from(rateCard.ledsPerLetterByHeight.keys()).sort((a, b) => a - b);
    const letterPriceKeys = Array.from(rateCard.letterUnitPriceByTypeFinishHeight.keys());

    const quoteData = quote as Quote;
    const itemsData = (items || []) as QuoteItem[];
    const totalPence = itemsData.reduce((sum, item) => sum + (item.line_total_pence || 0), 0);

    return (
        <div>
            <div className="mb-4">
                <Link
                    href="/admin/quotes"
                    className="text-sm text-neutral-500 hover:text-neutral-900 flex items-center gap-1"
                >
                    <ArrowLeft size={14} />
                    Back to Quotes
                </Link>
            </div>

            <PageHeader
                title={quoteData.quote_number}
                description={quoteData.customer_name || 'No customer name'}
                action={
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        <DuplicateQuoteButton quoteId={id} />
                        <Link
                            href={`/admin/quotes/${id}/print`}
                            target="_blank"
                            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-neutral-600 bg-neutral-100 hover:bg-neutral-200 rounded-[var(--radius-sm)] transition-colors"
                        >
                            <Printer size={14} />
                            Print / PDF
                        </Link>
                        <Link
                            href={`/admin/quotes/${id}/client`}
                            target="_blank"
                            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-black hover:bg-neutral-800 rounded-[var(--radius-sm)] transition-colors"
                        >
                            <Send size={14} />
                            Client PDF
                        </Link>
                        {quoteData.status === 'accepted' && (
                            <>
                                <CreateJobButton
                                    quoteId={id}
                                    existingJobId={existingProductionJob?.id ?? null}
                                    existingJobNumber={existingProductionJob?.job_number ?? null}
                                />
                                <CreateInvoiceButton
                                    quoteId={id}
                                    orgId={(quoteData as any).org_id || ''}
                                    existingInvoiceId={existingInvoice?.id ?? null}
                                    existingInvoiceNumber={existingInvoice?.invoice_number ?? null}
                                />
                            </>
                        )}
                        <Chip variant={getStatusVariant(quoteData.status)}>
                            {quoteData.status}
                        </Chip>
                    </div>
                }
            />

            {/* Quote Info */}
            <Card className="mb-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-neutral-900">Quote Details</h2>
                    <QuoteHeaderEdit quote={quoteData} />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 md:gap-6">
                    <div>
                        <p className="text-xs font-medium text-neutral-500 uppercase mb-1">Customer</p>
                        <p className="text-sm text-neutral-900">{quoteData.customer_name || '—'}</p>
                    </div>
                    <div>
                        <p className="text-xs font-medium text-neutral-500 uppercase mb-1">Email</p>
                        <p className="text-sm text-neutral-900">{quoteData.customer_email || '—'}</p>
                    </div>
                    <div>
                        <p className="text-xs font-medium text-neutral-500 uppercase mb-1">Phone</p>
                        <p className="text-sm text-neutral-900">{quoteData.customer_phone || '—'}</p>
                    </div>
                    <div>
                        <p className="text-xs font-medium text-neutral-500 uppercase mb-1">Created</p>
                        <p className="text-sm text-neutral-900">{formatDate(quoteData.created_at)}</p>
                    </div>
                    <div>
                        <p className="text-xs font-medium text-neutral-500 uppercase mb-1">Updated</p>
                        <p className="text-sm text-neutral-900">{formatDate(quoteData.updated_at)}</p>
                    </div>
                    {quoteData.valid_until && (
                        <div>
                            <p className="text-xs font-medium text-neutral-500 uppercase mb-1">Valid Until</p>
                            <p className={`text-sm ${new Date(quoteData.valid_until) < new Date() ? 'text-red-600 font-medium' : 'text-neutral-900'}`}>
                                {new Date(quoteData.valid_until).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </p>
                        </div>
                    )}
                </div>
                {quoteData.notes_internal && (
                    <div className="mt-6 pt-4 border-t border-neutral-100">
                        <p className="text-xs font-medium text-neutral-500 uppercase mb-1">Internal Notes</p>
                        <p className="text-sm text-neutral-600 italic whitespace-pre-wrap">{quoteData.notes_internal}</p>
                    </div>
                )}
            </Card>

            {/* Line Items */}
            <Card className="mb-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-neutral-900">Line Items</h2>
                    <div className="text-sm">
                        <span className="text-neutral-500">Total: </span>
                        <span className="font-bold text-lg">{formatPence(totalPence)}</span>
                    </div>
                </div>

                {itemsData.length === 0 ? (
                    <p className="text-sm text-neutral-500 py-4 text-center">
                        No line items yet. Add one below.
                    </p>
                ) : (
                    <div className="space-y-3">
                        {itemsData.map((item, index) => {
                            const input = item.input_json as PanelLettersV1Input;
                            const output = item.output_json as {
                                derived?: { panels_needed?: number; area_m2?: number };
                                letter_sets_breakdown?: { qty: number; type: string }[];
                            };
                            const itemHasOverrides = hasOverrides(input);

                            return (
                                <div
                                    key={item.id}
                                    className={`p-4 rounded-[var(--radius-sm)] border ${itemHasOverrides
                                        ? 'bg-amber-50 border-amber-200'
                                        : 'bg-neutral-50 border-neutral-200'
                                        }`}
                                >
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-medium text-neutral-900">
                                                    Item {index + 1}: {item.item_type === 'panel_letters_v1' ? 'Panel + Letters' : item.item_type}
                                                </p>
                                                {itemHasOverrides && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 rounded">
                                                        <AlertTriangle size={10} />
                                                        Override
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-neutral-500 mt-1">
                                                {output.derived?.panels_needed || 0} panels • {output.derived?.area_m2?.toFixed(2) || 0} m² • {output.letter_sets_breakdown?.reduce((sum, s) => sum + s.qty, 0) || 0} letters
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-bold text-neutral-900">
                                                {formatPence(item.line_total_pence)}
                                            </p>
                                            <QuoteDetailClient
                                                quoteId={id}
                                                itemId={item.id}
                                                mode="item-actions"
                                                pricingSetId={quote.pricing_set_id}
                                                rateCard={{ panelMaterials, panelFinishes, finishRulesByType, availableHeights, letterPriceKeys }}
                                                initialValues={input}
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </Card>

            {/* Add Line Item Form */}
            <QuoteDetailClient
                quoteId={id}
                pricingSetId={quote.pricing_set_id}
                rateCard={{
                    panelMaterials,
                    panelFinishes,
                    finishRulesByType,
                    availableHeights,
                    letterPriceKeys,
                }}
            />

            {/* Audit Log */}
            <div className="mt-12 mb-8">
                <div className="flex items-center gap-2 mb-4">
                    <History size={18} className="text-neutral-500" />
                    <h2 className="text-sm font-semibold text-neutral-900">Edition History</h2>
                </div>
                {audits && audits.length > 0 ? (
                    <Card>
                        <div className="divide-y divide-neutral-100">
                            {audits.map((audit) => (
                                <div key={audit.id} className="py-3 last:pb-0 first:pt-0">
                                    <div className="flex items-center justify-between gap-4">
                                        <div>
                                            <p className="text-sm font-medium text-neutral-900">
                                                {audit.summary}
                                            </p>
                                            <p className="text-xs text-neutral-500">
                                                by {audit.user_email} • {formatDate(audit.created_at)}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-[10px] px-1.5 py-0.5 font-bold uppercase tracking-wider bg-neutral-100 text-neutral-500 rounded">
                                                {audit.action.replace(/_/g, ' ')}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                ) : (
                    <p className="text-xs text-neutral-500 italic">No edition history yet.</p>
                )}
            </div>
        </div>
    );
}

import { PageHeader, Card } from '@/app/(portal)/components/ui';
import { CreditCard } from 'lucide-react';

export default function BillingPage() {
    return (
        <div>
            <PageHeader
                title="Billing"
                description="Manage your subscription and payment details"
            />

            <Card>
                <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-14 h-14 rounded-full bg-neutral-100 flex items-center justify-center mb-4">
                        <CreditCard size={24} className="text-neutral-400" />
                    </div>
                    <h3 className="text-sm font-medium text-neutral-900 mb-1">Billing coming soon</h3>
                    <p className="text-xs text-neutral-500 max-w-xs">
                        Online billing and payment management will be available in a future update.
                        For now, please contact your account manager for any billing queries.
                    </p>
                    <a
                        href="mailto:accounts@onesignanddigital.com"
                        className="btn-secondary text-xs mt-4"
                    >
                        Contact accounts
                    </a>
                </div>
            </Card>
        </div>
    );
}


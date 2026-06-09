import { getProductionApprovalByToken } from '@/lib/artwork/production-approval-actions';
import ProductionApprovalView from './ProductionApprovalView';

export default async function ProductionSignOffPage({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = await params;
    const result = await getProductionApprovalByToken(token);

    if ('error' in result) {
        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: "'Gilroy', 'Inter', system-ui, -apple-system, sans-serif",
                background: '#fafafa',
            }}>
                <div style={{ textAlign: 'center', maxWidth: '400px', padding: '40px' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.3 }}>
                        {result.status === 'revoked' ? '\u26D4' : '\u26A0'}
                    </div>
                    <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#111', marginBottom: '8px' }}>
                        {result.status === 'revoked' && 'link revoked'}
                        {result.status === 'invalid' && 'invalid link'}
                        {result.status === 'completed' && 'sign-off complete'}
                        {result.status === 'active' && 'link error'}
                    </h1>
                    <p style={{ fontSize: '14px', color: '#888', lineHeight: 1.5 }}>
                        {result.error}
                    </p>
                    <p style={{ fontSize: '12px', color: '#bbb', marginTop: '24px' }}>
                        ask the artwork team to mint a new link
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div style={{
            minHeight: '100vh',
            fontFamily: "'Gilroy', 'Inter', system-ui, -apple-system, sans-serif",
            background: '#f5f5f5',
            paddingTop: '20px',
            paddingBottom: '40px',
        }}>
            <ProductionApprovalView data={result} token={token} />
        </div>
    );
}

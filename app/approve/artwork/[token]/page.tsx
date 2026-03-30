import { getApprovalByToken } from '@/lib/artwork/approval-actions';
import ApprovalClientView from './ApprovalClientView';

export default async function ArtworkApprovalPage({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = await params;
    const result = await getApprovalByToken(token);

    // Error states
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
                <div style={{
                    textAlign: 'center',
                    maxWidth: '400px',
                    padding: '40px',
                }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.3 }}>
                        {result.status === 'expired' ? '\u23F0' : result.status === 'revoked' ? '\u26D4' : '\u26A0'}
                    </div>
                    <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#111', marginBottom: '8px' }}>
                        {result.status === 'expired' && 'link expired'}
                        {result.status === 'revoked' && 'link revoked'}
                        {result.status === 'invalid' && 'invalid link'}
                    </h1>
                    <p style={{ fontSize: '14px', color: '#888', lineHeight: 1.5 }}>
                        {result.error}
                    </p>
                    <p style={{ fontSize: '12px', color: '#bbb', marginTop: '24px' }}>
                        please contact onesign & digital for a new approval link
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
            <ApprovalClientView data={result} token={token} />
        </div>
    );
}

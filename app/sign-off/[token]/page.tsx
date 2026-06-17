import { getApprovalByToken } from '@/lib/artwork/approval-actions';
import ApprovalClientView from './ApprovalClientView';
import { stageBackground } from '@/components/studio/tokens';

const FONT = "'Gilroy', 'Inter', system-ui, -apple-system, sans-serif";

export default async function ArtworkSignOffPage({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = await params;
    const result = await getApprovalByToken(token);

    if ('error' in result) {
        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: FONT,
                background: stageBackground(false),
                padding: '24px',
            }}>
                <div style={{
                    textAlign: 'center',
                    maxWidth: '420px',
                    padding: '44px 40px',
                    borderRadius: '24px',
                    background: 'rgba(255,255,255,0.045)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
                }}>
                    <div style={{ fontSize: '46px', marginBottom: '16px', opacity: 0.55 }}>
                        {result.status === 'expired' ? '⏰' : result.status === 'revoked' ? '⛔' : '⚠'}
                    </div>
                    <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>
                        {result.status === 'expired' && 'link expired'}
                        {result.status === 'revoked' && 'link revoked'}
                        {result.status === 'invalid' && 'invalid link'}
                    </h1>
                    <p style={{ fontSize: '14px', color: 'rgba(238,244,246,0.65)', lineHeight: 1.5 }}>
                        {result.error}
                    </p>
                    <p style={{ fontSize: '12px', color: 'rgba(238,244,246,0.4)', marginTop: '24px' }}>
                        please contact onesign &amp; digital for a new approval link
                    </p>
                </div>
            </div>
        );
    }

    // ApprovalClientView owns its own full-bleed themed stage (so the
    // light/dark toggle can repaint the whole surface).
    return <ApprovalClientView data={result} token={token} />;
}

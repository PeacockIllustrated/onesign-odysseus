import { getPodByToken } from '@/lib/deliveries/actions';
import { PodClientView } from './PodClientView';

interface PageProps {
    params: Promise<{ token: string }>;
}

export default async function PodPage({ params }: PageProps) {
    const { token } = await params;
    const result = await getPodByToken(token);

    if ('error' in result) {
        return (
            <div className="min-h-screen bg-neutral-100 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
                    {result.status === 'invalid' && (
                        <>
                            <p className="text-4xl mb-3">&#128279;</p>
                            <h1 className="text-xl font-bold text-neutral-900 mb-2">Invalid Link</h1>
                            <p className="text-sm text-neutral-500">This delivery link is not valid.</p>
                        </>
                    )}
                    {result.status === 'signed' && (
                        <>
                            <p className="text-4xl mb-3">&#9989;</p>
                            <h1 className="text-xl font-bold text-neutral-900 mb-2">Already Confirmed</h1>
                            <p className="text-sm text-neutral-500">
                                This delivery was signed by {result.data?.pod_signed_by ?? 'unknown'}.
                            </p>
                        </>
                    )}
                    {result.status === 'refused' && (
                        <>
                            <p className="text-4xl mb-3">&#10060;</p>
                            <h1 className="text-xl font-bold text-neutral-900 mb-2">Delivery Refused</h1>
                            <p className="text-sm text-neutral-500">This delivery was refused.</p>
                        </>
                    )}
                </div>
            </div>
        );
    }

    return <PodClientView token={token} data={result.data} />;
}

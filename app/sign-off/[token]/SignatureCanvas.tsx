'use client';

import { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';

export interface SignatureCanvasRef {
    clear: () => void;
    toDataURL: () => string;
    isEmpty: () => boolean;
}

interface SignatureCanvasProps {
    width?: number;
    height?: number;
    onSignatureChange?: (dataUrl: string | null) => void;
}

const SignatureCanvas = forwardRef<SignatureCanvasRef, SignatureCanvasProps>(
    function SignatureCanvas({ width = 500, height = 200, onSignatureChange }, ref) {
        const canvasRef = useRef<HTMLCanvasElement>(null);
        const [isDrawing, setIsDrawing] = useState(false);
        const [hasDrawn, setHasDrawn] = useState(false);

        useEffect(() => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            ctx.strokeStyle = '#111';
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
        }, []);

        const getPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
            const canvas = canvasRef.current;
            if (!canvas) return { x: 0, y: 0 };
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;

            if ('touches' in e) {
                const touch = e.touches[0];
                return {
                    x: (touch.clientX - rect.left) * scaleX,
                    y: (touch.clientY - rect.top) * scaleY,
                };
            }

            return {
                x: (e.clientX - rect.left) * scaleX,
                y: (e.clientY - rect.top) * scaleY,
            };
        }, []);

        const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext('2d');
            if (!ctx) return;

            const { x, y } = getPos(e);
            ctx.beginPath();
            ctx.moveTo(x, y);
            setIsDrawing(true);
        }, [getPos]);

        const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
            if (!isDrawing) return;
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext('2d');
            if (!ctx) return;

            const { x, y } = getPos(e);
            ctx.lineTo(x, y);
            ctx.stroke();
        }, [isDrawing, getPos]);

        const stopDrawing = useCallback(() => {
            if (isDrawing) {
                setIsDrawing(false);
                setHasDrawn(true);
                const canvas = canvasRef.current;
                if (canvas && onSignatureChange) {
                    onSignatureChange(canvas.toDataURL('image/png'));
                }
            }
        }, [isDrawing, onSignatureChange]);

        useImperativeHandle(ref, () => ({
            clear: () => {
                const canvas = canvasRef.current;
                const ctx = canvas?.getContext('2d');
                if (!ctx || !canvas) return;
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                setHasDrawn(false);
                onSignatureChange?.(null);
            },
            toDataURL: () => {
                return canvasRef.current?.toDataURL('image/png') || '';
            },
            isEmpty: () => !hasDrawn,
        }));

        return (
            <div style={{ width: '100%', maxWidth: `${width}px` }}>
                <canvas
                    ref={canvasRef}
                    width={width}
                    height={height}
                    style={{
                        width: '100%',
                        height: 'auto',
                        aspectRatio: `${width} / ${height}`,
                        border: '1px solid #ddd',
                        borderRadius: '6px',
                        background: '#fafafa',
                        cursor: 'crosshair',
                        touchAction: 'none',
                    }}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                />
                <p style={{ fontSize: '11px', color: '#aaa', marginTop: '4px', textAlign: 'center' }}>
                    draw your signature above
                </p>
            </div>
        );
    }
);

export default SignatureCanvas;

import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface BarcodeScannerProps {
  onScan: (value: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState('');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const scannerId = 'barcode-scanner-region';
    const scanner = new Html5Qrcode(scannerId);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          scanner
            .stop()
            .then(() => {
              if (mountedRef.current) onScan(decodedText);
            })
            .catch(() => {});
        },
        () => {} // ignore scan failures (continuous scanning)
      )
      .catch(() => {
        if (mountedRef.current) {
          setError('Camera access failed. Please allow camera permission.');
        }
      });

    return () => {
      mountedRef.current = false;
      scanner.stop().catch(() => {});
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-lg p-4 w-full max-w-sm">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-bold text-neutral">Scan Plot Tag</h3>
          <button
            onClick={onClose}
            className="text-gray-500 min-w-[44px] min-h-[44px] text-sm font-medium"
          >
            Close
          </button>
        </div>
        <div id="barcode-scanner-region" className="w-full" />
        {error && <p className="text-error text-sm mt-2">{error}</p>}
        <p className="text-sm text-gray-500 mt-2 text-center">
          Point camera at a QR code or barcode
        </p>
      </div>
    </div>
  );
}

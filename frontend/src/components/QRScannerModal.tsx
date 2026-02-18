import { useEffect } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface Props {
  open: boolean;
  onClose: () => void;
  onScan: (result: string) => void;
}

const SCANNER_DIV_ID = 'html5-qr-scanner';

export default function QRScannerModal({ open, onClose, onScan }: Props) {
  useEffect(() => {
    if (!open) return;

    const scanner = new Html5Qrcode(SCANNER_DIV_ID);
    let cleanedUp = false;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText) => {
          if (!cleanedUp) {
            cleanedUp = true;
            scanner
              .stop()
              .catch(() => {})
              .finally(() => {
                onScan(decodedText);
                onClose();
              });
          }
        },
        () => {}, // ignore per-frame decode errors
      )
      .catch(() => {});

    return () => {
      if (!cleanedUp) {
        cleanedUp = true;
        scanner.stop().catch(() => {});
      }
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-safe-top py-4">
        <div>
          <p className="text-white font-semibold text-base">Scan Plot Code</p>
          <p className="text-gray-400 text-xs mt-0.5">
            Point at a QR code or barcode
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-white text-2xl leading-none p-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Close scanner"
        >
          ✕
        </button>
      </div>

      {/* Camera viewport */}
      <div className="flex-1 flex items-center justify-center">
        <div className="relative w-full max-w-sm px-4">
          <div id={SCANNER_DIV_ID} className="w-full rounded-xl overflow-hidden" />
        </div>
      </div>

      {/* Footer hint */}
      <div className="px-4 pb-8 pt-4">
        <p className="text-gray-500 text-xs text-center">
          Accepts: plot ID number · R3C5 format · URL
        </p>
      </div>
    </div>
  );
}

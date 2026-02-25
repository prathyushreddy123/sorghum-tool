import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { PlotImage } from '../types';

interface ImageCaptureProps {
  plotId: number;
  imageType?: 'panicle' | 'full_plant';
  buttonLabel?: string;
  helpText?: string;
  onImageCaptured?: (blob: Blob) => void;
  onImageUploaded?: (image: PlotImage) => void;
}

async function compressImage(file: File, maxWidth = 1200): Promise<File> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          resolve(new File([blob!], file.name, { type: 'image/jpeg' }));
        },
        'image/jpeg',
        0.8
      );
    };
    img.src = URL.createObjectURL(file);
  });
}

export default function ImageCapture({ plotId, imageType = 'panicle', buttonLabel = 'Take Photo', helpText, onImageCaptured, onImageUploaded }: ImageCaptureProps) {
  const [images, setImages] = useState<PlotImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.getImages(plotId, imageType).then(setImages).catch(() => {});
  }, [plotId, imageType]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError('');
    try {
      const compressed = await compressImage(file);
      onImageCaptured?.(compressed);
      const img = await api.uploadImage(plotId, compressed, imageType);
      setImages((prev) => [img, ...prev]);
      onImageUploaded?.(img);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleDelete(imageId: number) {
    try {
      await api.deleteImage(imageId);
      setImages((prev) => prev.filter((img) => img.id !== imageId));
    } catch {
      setError('Failed to delete image');
    }
  }

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="px-4 py-2 bg-card text-primary rounded-lg text-sm font-medium min-h-[44px] border border-primary disabled:opacity-50"
      >
        {uploading ? 'Uploading...' : buttonLabel}
      </button>

      {helpText && <p className="text-gray-400 text-xs mt-1">{helpText}</p>}
      {error && <p className="text-error text-xs mt-1">{error}</p>}

      {images.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {images.map((img) => (
            <div key={img.id} className="relative">
              <img
                src={api.getImageUrl(img.filename)}
                alt={img.original_name}
                className="w-20 h-20 object-cover rounded-lg border border-gray-200"
              />
              <button
                type="button"
                onClick={() => handleDelete(img.id)}
                className="absolute -top-2 -right-2 w-6 h-6 bg-error text-white rounded-full text-xs flex items-center justify-center"
              >
                X
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

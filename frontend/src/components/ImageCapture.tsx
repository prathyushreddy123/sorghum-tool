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
  const galleryRef = useRef<HTMLInputElement>(null);

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
      if (galleryRef.current) galleryRef.current.value = '';
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
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex-1 px-3 py-2 bg-card text-primary rounded-lg text-sm font-medium min-h-[44px] border border-primary disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <circle cx="12" cy="13" r="3" />
          </svg>
          {uploading ? 'Uploading...' : 'Camera'}
        </button>
        <button
          type="button"
          onClick={() => galleryRef.current?.click()}
          disabled={uploading}
          className="flex-1 px-3 py-2 bg-card text-primary rounded-lg text-sm font-medium min-h-[44px] border border-primary disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          {uploading ? 'Uploading...' : 'Gallery'}
        </button>
      </div>

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

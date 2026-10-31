"use client";

import React, { useState, useRef } from "react";
import Image from "next/image";

interface MediaUploaderProps {
  coverImage?: string;
  images: string[];
  onChange: (data: { coverImage: string; images: string[] }) => void;
  maxFiles?: number;
}

export function MediaUploader({
  coverImage = "",
  images = [],
  onChange,
  maxFiles = 6,
}: MediaUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadError(null);

    // Validate maximum file count
    if (images.length + files.length > maxFiles) {
      setUploadError(`You can upload a maximum of ${maxFiles} images.`);
      return;
    }

    setIsUploading(true);

    try {
      const newUploadedUrls: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Client validation: size <= 5MB
        if (file.size > 5 * 1024 * 1024) {
          throw new Error(`"${file.name}" exceeds the maximum 5MB size limit.`);
        }

        // Client validation: MIME
        const allowed = ["image/jpeg", "image/png", "image/webp"];
        if (!allowed.includes(file.type)) {
          throw new Error(`"${file.name}" has an unsupported format. Allowed formats: JPEG, PNG, WebP.`);
        }

        const formData = new FormData();
        formData.append("file", file);
        formData.append("folder", "mdshakib_books");

        const response = await fetch("/api/admin/media/upload", {
          method: "POST",
          body: formData,
        });

        const data = await response.json();

        if (!response.ok || !data.secure_url) {
          throw new Error(data.error || `Failed to upload "${file.name}".`);
        }

        newUploadedUrls.push(data.secure_url);
      }

      const updatedImages = [...images, ...newUploadedUrls];
      const updatedCover = coverImage || updatedImages[0] || "";

      onChange({
        coverImage: updatedCover,
        images: updatedImages,
      });
    } catch (err: any) {
      console.error("Upload error:", err);
      setUploadError(err?.message || "Failed to upload image(s).");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleSetCover = (url: string) => {
    onChange({
      coverImage: url,
      images: images.includes(url) ? images : [url, ...images],
    });
  };

  const handleRemoveImage = (urlToRemove: string) => {
    const updatedImages = images.filter((url) => url !== urlToRemove);
    let updatedCover = coverImage;

    if (coverImage === urlToRemove) {
      updatedCover = updatedImages[0] || "";
    }

    onChange({
      coverImage: updatedCover,
      images: updatedImages,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <label className="block text-sm font-semibold text-white">Book Images</label>
          <p className="text-xs text-gray-400 mt-0.5">
            Upload cover and preview pages (JPEG, PNG, WebP up to 5MB each). Maximum {maxFiles} images.
          </p>
        </div>
        <button
          type="button"
          disabled={isUploading || images.length >= maxFiles}
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#222222] hover:bg-[#2A2A2A] text-white border border-[#333333] transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isUploading ? (
            <>
              <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span>Uploading...</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4 text-[var(--color-primary-gold,#C9A24A)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Upload Image</span>
            </>
          )}
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileSelect}
        className="hidden"
      />

      {uploadError && (
        <div className="p-3 text-xs rounded-lg bg-red-950/60 border border-red-800 text-red-200">
          {uploadError}
        </div>
      )}

      {images.length === 0 ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-[#333333] hover:border-[var(--color-primary-gold,#C9A24A)]/50 rounded-xl p-8 text-center cursor-pointer transition bg-[#141414] group"
        >
          <div className="w-12 h-12 rounded-full bg-[#1F1F1F] text-gray-400 group-hover:text-[var(--color-primary-gold,#C9A24A)] flex items-center justify-center mx-auto mb-3 transition">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-300">Click to upload book cover & gallery</p>
          <p className="text-xs text-gray-500 mt-1">Direct signed Cloudinary integration with magic byte security</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {images.map((url, idx) => {
            const isCover = coverImage === url;

            return (
              <div
                key={idx}
                className={`relative group rounded-lg overflow-hidden border ${
                  isCover ? "border-[var(--color-primary-gold,#C9A24A)] ring-1 ring-[var(--color-primary-gold,#C9A24A)]" : "border-[#2A2A2A]"
                } bg-[#161616] aspect-[3/4] flex items-center justify-center`}
              >
                <img
                  src={url}
                  alt={`Book preview ${idx + 1}`}
                  className="w-full h-full object-cover"
                />

                {isCover && (
                  <span className="absolute top-2 left-2 bg-[var(--color-primary-gold,#C9A24A)] text-black text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded shadow">
                    Cover
                  </span>
                )}

                {/* Hover overlay with actions */}
                <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
                  {!isCover && (
                    <button
                      type="button"
                      onClick={() => handleSetCover(url)}
                      className="w-full py-1 text-[11px] font-semibold text-white bg-emerald-700 hover:bg-emerald-600 rounded transition"
                    >
                      Set as Cover
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemoveImage(url)}
                    className="w-full py-1 text-[11px] font-semibold text-red-200 bg-red-900/80 hover:bg-red-800 rounded transition"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


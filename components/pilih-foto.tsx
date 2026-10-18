"use client";

import { Camera, ImageIcon, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/** Foto bukti: tombol Kamera (langsung buka kamera belakang) + Galeri, dengan pratinjau. */
export function PilihFoto({ file, onChange }: { file: File | null; onChange: (f: File | null) => void }) {
  const kamera = useRef<HTMLInputElement>(null);
  const galeri = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) return setUrl(null);
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const pilih = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.files?.[0] ?? null);
    e.target.value = ""; // supaya memilih file yang sama tetap memicu onChange
  };

  return (
    <div className="foto">
      <input ref={kamera} type="file" accept="image/*" capture="environment" hidden onChange={pilih} />
      <input ref={galeri} type="file" accept="image/*" hidden onChange={pilih} />
      {url ? (
        <div className="foto-prev">
          {/* eslint-disable-next-line @next/next/no-img-element -- pratinjau lokal (blob:), bukan aset */}
          <img src={url} alt="Pratinjau bukti" />
          <button type="button" className="btn-x" onClick={() => onChange(null)} aria-label="Hapus foto">
            <X className="ic" />
          </button>
        </div>
      ) : (
        <div className="foto-btns">
          <button type="button" className="btn-line" onClick={() => kamera.current?.click()}>
            <Camera className="ic" /> kamera/
          </button>
          <button type="button" className="btn-line" onClick={() => galeri.current?.click()}>
            <ImageIcon className="ic" /> galeri/
          </button>
        </div>
      )}
    </div>
  );
}

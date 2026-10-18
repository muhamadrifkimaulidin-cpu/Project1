"use client";

/** Input rupiah: keyboard angka di HP, titik ribuan otomatis saat mengetik. Nilai = angka bulat (rupiah). */
export function InputUang({
  id,
  nilai,
  onChange,
  required,
}: {
  id: string;
  nilai: number | null;
  onChange: (v: number | null) => void;
  required?: boolean;
}) {
  const teks = nilai === null ? "" : nilai.toLocaleString("id-ID");
  return (
    <div className="inp-unit inp-rp">
      <span className="unit unit-l">Rp</span>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        required={required}
        value={teks}
        placeholder="0"
        onChange={(e) => {
          const digit = e.target.value.replace(/\D/g, "").slice(0, 12); // maks Rp999 miliar
          onChange(digit ? Number(digit) : null);
        }}
      />
    </div>
  );
}

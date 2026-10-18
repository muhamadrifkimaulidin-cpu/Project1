// Label & pilihan modul R&D — aman dipakai di server maupun browser.
export const SUBJENIS = {
  produk: { racikan: "Racikan", menu: "Menu", kemasan: "Kemasan", lainnya: "Lainnya" },
  sistem: { sop: "SOP pembuatan", alat: "Alat", supplier: "Supplier", alur_kas: "Alur kas", lainnya: "Lainnya" },
} as const;

export type Jalur = keyof typeof SUBJENIS;
export const TAHAP = ["ide", "diuji", "evaluasi", "diadopsi", "dihentikan"] as const;
export type Tahap = (typeof TAHAP)[number];

export function labelSubjenis(jalur: Jalur, subjenis: string): string {
  return (SUBJENIS[jalur] as Record<string, string>)[subjenis] ?? subjenis;
}

export const LABEL_TAHAP: Record<Tahap, string> = {
  ide: "Ide",
  diuji: "Diuji",
  evaluasi: "Evaluasi",
  diadopsi: "Diadopsi",
  dihentikan: "Dihentikan",
};

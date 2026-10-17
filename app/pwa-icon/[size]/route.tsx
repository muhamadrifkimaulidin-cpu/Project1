import { ImageResponse } from "next/og";
import { IkonKedai } from "@/components/ikon-kedai";

const UKURAN = [192, 512];

export function generateStaticParams() {
  return UKURAN.map((s) => ({ size: String(s) }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (!UKURAN.includes(size)) return new Response("Not found", { status: 404 });
  return new ImageResponse(<IkonKedai size={size} />, { width: size, height: size });
}

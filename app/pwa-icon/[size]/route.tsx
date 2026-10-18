import { ImageResponse } from "next/og";
import { Ikon3Rally } from "@/components/ikon-3rally";

const UKURAN = [192, 512];

export function generateStaticParams() {
  return UKURAN.map((s) => ({ size: String(s) }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (!UKURAN.includes(size)) return new Response("Not found", { status: 404 });
  return new ImageResponse(<Ikon3Rally size={size} />, { width: size, height: size });
}

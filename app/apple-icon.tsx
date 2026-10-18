import { ImageResponse } from "next/og";
import { Ikon3Rally } from "@/components/ikon-3rally";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<Ikon3Rally size={180} />, size);
}

import { ImageResponse } from "next/og";
import { IkonKedai } from "@/components/ikon-kedai";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<IkonKedai size={180} />, size);
}

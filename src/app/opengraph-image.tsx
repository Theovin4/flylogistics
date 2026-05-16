import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Fly Logistics";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#080a10", color: "white", padding: 70 }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ color: "#ff9f1c", fontSize: 34, fontWeight: 800, letterSpacing: 5 }}>FLY LOGISTICS</div>
          <div style={{ marginTop: 28, maxWidth: 860, fontSize: 82, lineHeight: 0.95, fontWeight: 900 }}>
            AI-powered global logistics OS
          </div>
          <div style={{ marginTop: 34, fontSize: 28, color: "#c8cbd4" }}>Freight. Fleet. Warehousing. Intelligence.</div>
        </div>
      </div>
    ),
    size
  );
}

import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#080a10",
          color: "#ffffff",
          display: "flex",
          height: "100%",
          justifyContent: "center",
          width: "100%"
        }}
      >
        <div
          style={{
            alignItems: "center",
            background: "linear-gradient(135deg, #ff7a00 0%, #ffb347 100%)",
            borderRadius: 96,
            boxShadow: "0 36px 90px rgba(255,122,0,0.42)",
            display: "flex",
            height: 360,
            justifyContent: "center",
            transform: "skewX(-8deg)",
            width: 360
          }}
        >
          <div style={{ color: "#080a10", fontSize: 220, fontWeight: 900, lineHeight: 1 }}>F</div>
        </div>
      </div>
    ),
    { width: 512, height: 512 }
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SachiSeva - సాచిసేవ | AP Sachivalayam Welfare App" },
      {
        name: "description",
        content:
          "SachiSeva: Check eligibility for 30+ Andhra Pradesh government welfare schemes and get document checklists for Sachivalayam services. Telugu + English, offline-ready.",
      },
      { name: "theme-color", content: "#0A3D62" },
      { property: "og:title", content: "SachiSeva - సాచిసేవ" },
      {
        property: "og:description",
        content: "AP Sachivalayam Welfare Eligibility App",
      },
    ],
  }),
  component: Index,
});

function Index() {
  useEffect(() => {
    window.location.replace("/sachiseva/index.html");
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#0A3D62",
        color: "#fff",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: 28, margin: 0 }}>సాచిసేవ</h1>
        <p style={{ opacity: 0.8, marginTop: 8 }}>Loading SachiSeva…</p>
        <p style={{ marginTop: 16 }}>
          <a href="/sachiseva/index.html" style={{ color: "#F0A500" }}>
            Open app
          </a>
        </p>
      </div>
    </div>
  );
}

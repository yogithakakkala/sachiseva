import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — SachiSeva" },
      { name: "description", content: "SachiSeva is a community service prototype for Andhra Pradesh Sachivalayam services." },
    ],
  }),
  component: About,
});

function About() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold text-primary">About SachiSeva</h1>
      <p className="text-muted-foreground">సాచిసేవ గురించి</p>
      <div className="prose prose-sm mt-6 space-y-4 text-foreground">
        <p>
          <b>SachiSeva</b> is a <b>community service prototype</b> designed to make Andhra Pradesh
          Sachivalayam services easier to access — especially for citizens who don't know which
          scheme they qualify for or which office to visit for a missing document.
        </p>
        <p>
          It is <b>not an official Government of Andhra Pradesh product</b>. Scheme information
          shown is indicative and should be verified at your local Sachivalayam.
        </p>
        <h2 className="font-semibold text-primary mt-6">What it offers</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Nearest Sachivalayam finder with a map (OpenStreetMap).</li>
          <li>Welfare scheme browsing with eligibility and document checklists.</li>
          <li>Online application submission with document upload.</li>
          <li>Realtime status tracking + email notifications on status changes.</li>
          <li>Direct messaging with staff via each application thread.</li>
          <li>Bilingual voice assistant (English / తెలుగు) using the browser Web Speech API.</li>
        </ul>
        <h2 className="font-semibold text-primary mt-6">For Sachivalayam staff</h2>
        <p>
          The Admin dashboard is available at <Link to="/admin" className="text-primary underline">/admin</Link>{" "}
          to accounts that have been granted the <code>admin</code> role.
        </p>
        <h2 className="font-semibold text-primary mt-6">Free-tier only</h2>
        <p>
          This prototype uses only free-tier services: browser Geolocation, OpenStreetMap tiles,
          the Web Speech API and Lovable Cloud. SMS delivery is intentionally out of scope — a
          placeholder in the notification pipeline shows where a real SMS gateway (Fast2SMS,
          Twilio) would be plugged in.
        </p>
      </div>
    </div>
  );
}

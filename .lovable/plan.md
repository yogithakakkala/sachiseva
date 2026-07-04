
# SachiSeva — AP Sachivalayam Services App

React + TypeScript + Tailwind on Lovable Cloud (Supabase). All integrations free-tier.

## 1. Enable Lovable Cloud + schema

Migrations create:

- `sachivalayam_centers` — name, address, mandal, district, latitude, longitude, phone. Public read. Seed 8 AP centers.
- `schemes` — name, description, required_documents (text[]), eligibility. Public read. Seed 6 flagship AP welfare schemes.
- `document_offices` — document_type, issuing_office_type. Public read. Seed common docs (Aadhaar → Aadhaar Seva Kendra, Caste → Tahsildar, Income → MRO, Ration → Civil Supplies, Birth → Municipal, Bank → Bank branch).
- `profiles` — id (FK auth.users), full_name, phone, uploaded_document_types (text[]). Auto-created via trigger on signup. Owner RLS.
- `applications` — id, user_id, scheme_id, status enum `application_status` (`submitted|under_review|approved|rejected`), submitted_documents jsonb, created_at, updated_at. Owner + admin read; owner insert; admin update.
- `application_messages` — id, application_id, sender_id, body, attachment_url, created_at. Visible to app owner + admins.
- `app_role` enum + `user_roles` table + `has_role()` SECURITY DEFINER function (per platform rules).
- Storage buckets: `documents` (private, owner+admin), `application-attachments` (private).
- All required GRANTs and RLS policies.

## 2. Auth

Email/password sign-in via Supabase Auth (phone OTP noted as optional). Integration-managed `_authenticated` layout gates protected routes. Admin role assigned via SQL — documented on the About page.

## 3. Status change notifications

Postgres trigger fires an edge/server function `notify-status-change` on `applications.status` update:
- Sends email via Resend free tier if `RESEND_API_KEY` set (guarded — no crash if missing).
- Clearly commented `// TODO: plug real SMS gateway (Fast2SMS / Twilio) here`.
- Realtime subscription in `/my-applications` reflects the change instantly.

## 4. Routes

Public:
- `/` — Home hero + feature grid (EN/TE labels), AP palette
- `/schemes` — cards list
- `/schemes/$id` — details + Apply CTA
- `/centers` — Leaflet map, geolocation, nearest highlighted (Haversine)
- `/about` — prototype disclaimer
- `/auth` — sign-in/up

Authenticated `/_authenticated/`:
- `/apply/$schemeId` — dynamic form, doc checklist, missing-doc callout linking to nearest office of that type, file upload to `documents` bucket
- `/my-applications` — realtime status list
- `/my-applications/$id` — status timeline, message thread, additional upload
- `/profile` — manage uploaded document types

Admin `/_authenticated/admin/` (gated by `has_role('admin')`):
- `/admin` — all applications with status filter
- `/admin/$id` — view docs/messages, change status

Global floating **VoiceAssistant** FAB on every page.

## 5. Voice assistant

Web Speech API (`SpeechRecognition` + `speechSynthesis`). Language toggle `en-IN` / `te-IN`. Rule-based intent matcher covering: how to apply for X, nearest center, application status, required documents for Y, generic help. Speaks reply in selected language; falls back to text if speech unsupported.

## 6. Locator

`react-leaflet` + OpenStreetMap tiles (no key). Geolocation → Haversine → sorted list + distinct nearest marker. Reused from `/apply/$schemeId` when a required document is missing (filters to the mapped office type).

## 7. Theme + nav

Tailwind tokens updated in `src/styles.css` to AP palette: deep blue `#0A3D7E` primary, saffron `#F0A500` accent, white surfaces. Mobile-first sticky top nav: Home · Schemes · My Applications · Nearest Center · Admin (staff only) · sign-in/out.

## Technical details

- New packages: `leaflet`, `react-leaflet`, `@types/leaflet`.
- Server functions in `src/lib/*.functions.ts` for admin listings (require `has_role('admin')`).
- Public reads use browser client + narrow `TO anon` SELECT policies.
- Owner reads use browser client + owner RLS policies (`auth.uid()`).
- Notify function is a TanStack server route `/api/public/webhooks/status-change` verified by a shared secret from the DB trigger; sends Resend email if key set.
- Leaflet CSS imported once in `__root.tsx`.
- Existing `/sachiseva/*` static PWA files untouched.

## Out of scope

- Real SMS delivery (placeholder + comment only).
- Payments, granular admin permissions beyond single `admin` role.

Approve and I'll enable Lovable Cloud, ship migrations + seed data, install Leaflet, and build all routes plus the voice assistant.

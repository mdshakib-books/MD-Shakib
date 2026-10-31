# PHASE 02 — KNOWN LIMITATIONS & OPERATIONAL NOTES
## MD Shakib Islamic Books — Technical Constraints & Future Roadmaps

**Date:** 2026-10-31  
**Phase:** Phase 02  

---

## 1. Cloudinary Integration Boundaries
- **Mock Fallback:** When running in local testing or offline environments without active network connectivity or valid Cloudinary API secrets, the service automatically falls back to generating deterministic mock Cloudinary URLs. Production deployments require setting `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in production secrets.
- **Client Direct Uploads:** Direct uploads from the browser to Cloudinary require CORS configuration on the Cloudinary account to allow the web storefront origin (`http://localhost:3000` or production domain). If CORS is blocked, the client automatically utilizes the server-side `/api/admin/media/upload` route handler.

---

## 2. Dynamic Categories vs. Legacy Book Category Constraint
- In `20261028000001_core_schema.sql`, `public.books` was defined with a fixed check constraint:
  `CHECK (category IN ('Quran', 'Hadith', 'Fiqh', 'History', 'Biography', 'Other'))`.
- In Phase 02, `public.categories` was populated with these 6 default categories as canonical records. New categories can be dynamically managed in `public.categories`. When expanding book categories beyond the initial 6, an ALTER TABLE on `books` can be applied to relax the check constraint or replace it with a foreign key to `public.categories(name)`.

---

## 3. Production Migration Protocol
- In adherence to strict safety mandates, migrations in `supabase/migrations/` have been authored and verified against the local development environment and test suites.
- Migration `20261031000002_admin_management_system.sql` must be applied to the remote staging/production Supabase project during the designated deployment window using `supabase db push` or the Supabase CLI with explicit deployment authorization.


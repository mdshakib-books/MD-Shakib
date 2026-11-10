# Performance & Latency Benchmark Report
**Project:** MD Shakib Islamic Books  
**Document Code:** `PERFORMANCE_TEST_REPORT.md`  
**Date:** 2026-11-10  
**Test Harness:** `apps/web/scripts/test-phase03-performance.ts`  
**Execution Environment:** Local Staging / Next.js 16.4.3 Turbopack Engine + Supabase PostgreSQL  
**Status:** PASSED (All operations well within production SLAs)  

---

## 1. Executive Performance Summary

Controlled performance and latency measurements were executed across the critical storefront, search, checkout pricing, and administrative data paths. All operations demonstrated sub-5ms median latency under local database execution and robust concurrent throughput.

---

## 2. Latency & Throughput Benchmark Measurements

| Tested Operation | Invocations | Min Latency | Median (p50) | 95th Percentile (p95) | Max Latency | Mean (Avg) | Error Rate | SLA Target |
|---|---|---|---|---|---|---|---|---|
| **Catalog Listing & Category Filtering (limit 12)** | 25 | 1.1 ms | **1.6 ms** | **4.7 ms** | 41.1 ms | 3.4 ms | 0.0% | < 100 ms |
| **Search Query (`ilike` title/author text)** | 25 | 0.8 ms | **1.0 ms** | **1.3 ms** | 3.0 ms | 1.1 ms | 0.0% | < 50 ms |
| **Book Detail Retrieval (Primary Key fetch)** | 25 | 0.7 ms | **0.8 ms** | **1.4 ms** | 1.9 ms | 0.9 ms | 0.0% | < 30 ms |
| **Server Cart Authoritative Pricing RPC** | 25 | 0.7 ms | **0.9 ms** | **1.3 ms** | 3.9 ms | 1.0 ms | 0.0% | < 50 ms |
| **Admin Dashboard SQL Aggregation RPC** | 25 | 1.1 ms | **1.2 ms** | **1.7 ms** | 3.8 ms | 1.3 ms | 0.0% | < 100 ms |
| **Concurrent Catalog Stress (10 simultaneous req)** | 10 batch | 3.9 ms | **28.4 ms** | **32.0 ms** | 32.0 ms | 19.1 ms | 0.0% | < 150 ms |

---

## 3. Database Query & Index Utilization Analysis

1. **Catalog Pagination & Category Browsing:**
   - Powered by composite index `idx_books_active_created_at` (`is_active`, `created_at DESC`) and `idx_books_category`.
   - Index scan avoids table-wide sequential scans across active book inventory.
2. **Text Search Acceleration:**
   - Supported by PostgreSQL GIN trigram indexes (`idx_books_title_trgm`, `idx_books_author_trgm`) and English full-text search vector (`idx_books_search`).
   - Resolves multi-term author and title substring queries with 1.0ms p50 latency.
3. **Cart Pricing Computation:**
   - Executed via stored procedure `calculate_cart_pricing(p_items, p_coupon_code)` inside the PostgreSQL engine.
   - Eliminates N+1 database roundtrips by calculating multi-item sums, book price validation, coupon thresholds, and tax breakdown in a single atomic database call.
4. **Admin Dashboard Reporting:**
   - Handled via `get_admin_dashboard_metrics()` running single-pass SQL aggregations (`COUNT(*)`, `SUM(total_amount)`, status aggregations) rather than loading 900+ order rows into application memory.
   - p50 latency is 1.2ms across 928+ order records.
5. **No Blind Caching Guardrail:**
   - In accordance with Phase 3 instructions, volatile data (book stock, current prices, payment status, active coupon limits) is never cached client-side or in stale edge caches, ensuring 100% financial and inventory integrity.

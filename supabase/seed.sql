-- ==============================================================================
-- MD Shakib Islamic Books — Supabase Migration 004
-- Deterministic Non-Sensitive Development Seed Data
-- ==============================================================================

-- ==============================================================================
-- 1. SEED BOOKS (Catalog Fixtures matching legacy seed categories)
-- ==============================================================================
INSERT INTO public.books (
    id, title, author, description, price, stock, discount, category, language, pages, publisher, image_url, cover_image, is_active
) VALUES 
(
    'a0000000-0000-0000-0000-000000000001',
    'The Noble Quran (English Translation & Commentary)',
    'Dr. Muhammad Muhsin Khan & Dr. Muhammad Taqi-ud-Din Al-Hilali',
    'A comprehensive English translation of the meanings of the Noble Quran with commentary and tafsir references.',
    899.00,
    45,
    10,
    'Quran',
    'English / Arabic',
    1150,
    'Darussalam',
    'https://images.unsplash.com/photo-1609599006353-e629aaabfeae?auto=format&fit=crop&q=80&w=600',
    'https://images.unsplash.com/photo-1609599006353-e629aaabfeae?auto=format&fit=crop&q=80&w=600',
    TRUE
),
(
    'a0000000-0000-0000-0000-000000000002',
    'Sahih Al-Bukhari (Summarized Edition)',
    'Imam Muhammad Al-Bukhari',
    'The pristine and authentic collection of traditions and sayings of Prophet Muhammad (peace be upon him).',
    1250.00,
    28,
    15,
    'Hadith',
    'English / Arabic',
    980,
    'Darussalam',
    'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&q=80&w=600',
    'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&q=80&w=600',
    TRUE
),
(
    'a0000000-0000-0000-0000-000000000003',
    'The Sealed Nectar (Ar-Raheeq Al-Makhtum)',
    'Safiur Rahman Al-Mubarakpuri',
    'Award-winning biography of Prophet Muhammad (peace be upon him) detailing his life, character, and mission.',
    550.00,
    60,
    5,
    'Biography',
    'English',
    580,
    'Darussalam',
    'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&q=80&w=600',
    'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&q=80&w=600',
    TRUE
),
(
    'a0000000-0000-0000-0000-000000000004',
    'Fundamentals of Islamic Jurisprudence (Fiqh Us-Sunnah)',
    'Sayyid Sabiq',
    'Classical comprehensive overview of Islamic legal rulings pertaining to acts of worship and transactions.',
    750.00,
    20,
    0,
    'Fiqh',
    'English',
    640,
    'American Trust Publications',
    'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&q=80&w=600',
    'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&q=80&w=600',
    TRUE
),
(
    'a0000000-0000-0000-0000-000000000005',
    'Lost Islamic History: Reclaiming Muslim Civilisation from the Past',
    'Firas Alkhateeb',
    'Explores the golden age, achievements, cultural contributions, and triumphs of Islamic civilisation.',
    499.00,
    35,
    10,
    'History',
    'English',
    312,
    'Hurst Publishers',
    'https://images.unsplash.com/photo-1495446815901-a7297e633e8d?auto=format&fit=crop&q=80&w=600',
    'https://images.unsplash.com/photo-1495446815901-a7297e633e8d?auto=format&fit=crop&q=80&w=600',
    TRUE
)
ON CONFLICT (id) DO NOTHING;


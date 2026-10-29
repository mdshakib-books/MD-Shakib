import { BookItem } from "@/components/commerce/BookCard";

export interface BookDetail extends BookItem {
  description: string;
  publisher?: string;
  publishedDate?: string;
  pages?: number;
  language?: string;
  images?: string[];
}

export const MOCK_BOOKS: BookDetail[] = [
  {
    id: "a0000000-0000-0000-0000-000000000001",
    title: "The Noble Quran (English Translation & Commentary)",
    author: "Dr. Muhammad Muhsin Khan & Dr. Muhammad Taqi-ud-Din Al-Hilali",
    price: 899,
    discount: 10,
    stock: 45,
    category: "Quran",
    language: "English / Arabic",
    pages: 1150,
    publisher: "Darussalam",
    publishedDate: "2020-01-01",
    imageUrl:
      "https://images.unsplash.com/photo-1609599006353-e629aaabfeae?auto=format&fit=crop&q=80&w=600",
    images: [
      "https://images.unsplash.com/photo-1609599006353-e629aaabfeae?auto=format&fit=crop&q=80&w=600",
      "https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&q=80&w=600",
    ],
    description:
      "A comprehensive, authentic English translation of the meanings of the Noble Quran with commentary, classical tafsir footnotes, and context for contemporary readers.",
  },
  {
    id: "a0000000-0000-0000-0000-000000000002",
    title: "Sahih Al-Bukhari (Summarized Edition)",
    author: "Imam Muhammad Al-Bukhari",
    price: 1250,
    discount: 15,
    stock: 28,
    category: "Hadith",
    language: "English / Arabic",
    pages: 980,
    publisher: "Darussalam",
    publishedDate: "2019-05-15",
    imageUrl:
      "https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&q=80&w=600",
    images: [
      "https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&q=80&w=600",
    ],
    description:
      "The pristine and most authentic collection of the traditions, practices, and sayings of the Prophet Muhammad (peace be upon him), summarized for study and practical guidance.",
  },
  {
    id: "a0000000-0000-0000-0000-000000000003",
    title: "The Sealed Nectar (Ar-Raheeq Al-Makhtum)",
    author: "Safiur Rahman Al-Mubarakpuri",
    price: 550,
    discount: 5,
    stock: 60,
    category: "Biography",
    language: "English",
    pages: 580,
    publisher: "Darussalam",
    publishedDate: "2018-03-20",
    imageUrl:
      "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&q=80&w=600",
    images: [
      "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&q=80&w=600",
    ],
    description:
      "Award-winning authoritative biography of the Prophet Muhammad (peace be upon him). Honored by the Muslim World League for its historical accuracy and profound narrative.",
  },
  {
    id: "a0000000-0000-0000-0000-000000000004",
    title: "Fundamentals of Islamic Jurisprudence (Fiqh Us-Sunnah)",
    author: "Sayyid Sabiq",
    price: 750,
    discount: 0,
    stock: 20,
    category: "Fiqh",
    language: "English",
    pages: 640,
    publisher: "American Trust Publications",
    publishedDate: "2017-09-10",
    imageUrl:
      "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&q=80&w=600",
    images: [
      "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&q=80&w=600",
    ],
    description:
      "A classical, lucid exposition of Islamic legal rulings pertaining to acts of devotion, ethics, prayer, fasting, and interpersonal transactions based directly upon the Quran and authentic Sunnah.",
  },
  {
    id: "a0000000-0000-0000-0000-000000000005",
    title: "Lost Islamic History: Reclaiming Muslim Civilisation from the Past",
    author: "Firas Alkhateeb",
    price: 499,
    discount: 10,
    stock: 35,
    category: "History",
    language: "English",
    pages: 312,
    publisher: "Hurst Publishers",
    publishedDate: "2021-02-14",
    imageUrl:
      "https://images.unsplash.com/photo-1495446815901-a7297e633e8d?auto=format&fit=crop&q=80&w=600",
    images: [
      "https://images.unsplash.com/photo-1495446815901-a7297e633e8d?auto=format&fit=crop&q=80&w=600",
    ],
    description:
      "An engaging exploration of the Islamic world's rich contributions to geography, medicine, mathematics, statecraft, philosophy, and global civilisation across over a millennium.",
  },
];

export const MOCK_CATEGORIES = ["Quran", "Hadith", "Biography", "Fiqh", "History", "Other"];

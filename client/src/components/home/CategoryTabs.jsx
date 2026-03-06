import React, { useState } from "react";

const categories = [
    {
        id: "all",
        label: "All",
        icon: (
            <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
            </svg>
        ),
    },
    {
        id: "books",
        label: "Books",
        icon: (
            <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
            </svg>
        ),
    },
    {
        id: "clothing",
        label: "Clothing",
        // using a different icon here for clothes, maybe shopping bag
        icon: (
            <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                />
            </svg>
        ),
    },
    {
        id: "ebooks",
        label: "E-Books",
        icon: (
            <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
                />
            </svg>
        ),
    },
];

const CategoryTabs = () => {
    const [activeTab, setActiveTab] = useState("all");

    return (
        <div className="w-full bg-[var(--color-main-bg)] pt-6 pb-2 overflow-x-auto hide-scrollbar">
            <div className="max-w-[1200px] mx-auto px-4 flex space-x-4 min-w-max justify-start md:justify-center">
                {categories.map((category) => (
                    <button
                        key={category.id}
                        onClick={() => setActiveTab(category.id)}
                        className={`flex items-center space-x-2 px-6 py-2.5 rounded-full transition-all duration-300 font-medium text-sm border-2 ${
                            activeTab === category.id
                                ? "bg-gradient-to-r from-[var(--color-primary-gold)] to-[var(--color-accent-gold)] text-black border-transparent shadow-[0_0_15px_rgba(201,162,74,0.3)]"
                                : "bg-[var(--color-secondary-dark)] text-gray-400 border-[var(--color-border-dark)] hover:border-[var(--color-primary-gold)] hover:text-[var(--color-primary-gold)]"
                        }`}
                    >
                        <span
                            className={
                                activeTab === category.id
                                    ? "text-black"
                                    : "text-[var(--color-primary-gold)]"
                            }
                        >
                            {category.icon}
                        </span>
                        <span>{category.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
};

export default CategoryTabs;

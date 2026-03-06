import React from "react";

const CategoryTabs = ({
    categories = [],
    activeCategory,
    onSelectCategory,
}) => {
    return (
        <div className="flex justify-center space-x-3 overflow-x-auto py-4 no-scrollbar">
            <button
                onClick={() => onSelectCategory("")}
                className={`px-6 py-2 rounded-[20px] whitespace-nowrap text-sm font-medium transition-colors ${
                    !activeCategory
                        ? "bg-[var(--color-primary-gold)] text-black shadow-[0_0_15px_rgba(201,162,74,0.3)]"
                        : "bg-[#111111] border border-[#2A2A2A] text-gray-400 hover:text-[var(--color-primary-gold)] hover:border-[var(--color-primary-gold)]"
                }`}
            >
                All Books
            </button>
            {categories?.map((cat) => (
                <button
                    key={cat}
                    onClick={() => onSelectCategory(cat)}
                    className={`px-6 py-2 rounded-[20px] whitespace-nowrap text-sm font-medium transition-colors ${
                        activeCategory === cat
                            ? "bg-[var(--color-primary-gold)] text-black shadow-[0_0_15px_rgba(201,162,74,0.3)]"
                            : "bg-[#111111] border border-[#2A2A2A] text-gray-400 hover:text-[var(--color-primary-gold)] hover:border-[var(--color-primary-gold)]"
                    }`}
                >
                    {cat}
                </button>
            ))}
        </div>
    );
};

export default CategoryTabs;

import React from "react";

const CategoryTabs = ({
    categories = [],
    activeCategory,
    onSelectCategory,
}) => {
    return (
        <div className="flex space-x-2 overflow-x-auto py-2 no-scrollbar">
            <button
                onClick={() => onSelectCategory("")}
                className={`px-4 py-2 rounded-full whitespace-nowrap text-sm ${
                    !activeCategory
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
            >
                All Books
            </button>
            {categories?.map((cat) => (
                <button
                    key={cat}
                    onClick={() => onSelectCategory(cat)}
                    className={`px-4 py-2 rounded-full whitespace-nowrap text-sm ${
                        activeCategory === cat
                            ? "bg-blue-600 text-white"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                >
                    {cat}
                </button>
            ))}
        </div>
    );
};

export default CategoryTabs;

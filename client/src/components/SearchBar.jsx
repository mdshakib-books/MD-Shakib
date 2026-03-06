import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const SearchBar = ({ initialValue = "", onSearch }) => {
    const [query, setQuery] = useState(initialValue);
    const navigate = useNavigate();

    const handleSubmit = (e) => {
        e.preventDefault();
        if (onSearch) {
            onSearch(query);
        } else {
            navigate(`/books?search=${encodeURIComponent(query)}`);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="flex w-full max-w-md">
            <input
                type="text"
                placeholder="Search books, authors..."
                className="w-full px-4 py-2 border border-gray-300 rounded-l focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
            />
            <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-r hover:bg-blue-700 transition"
            >
                Search
            </button>
        </form>
    );
};

export default SearchBar;

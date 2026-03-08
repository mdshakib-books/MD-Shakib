import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../components/admin/AdminLayout";
import { adminService } from "../services/adminService";
import { useToast } from "../context/ToastContext";

const CATEGORIES = ["Quran", "Hadith", "Fiqh", "History", "Biography", "Other"];

const INITIAL = {
    title: "",
    author: "",
    description: "",
    category: "",
    price: "",
    stock: "",
    language: "",
    pages: "",
    publisher: "",
    publishedDate: "",
};

const AdminAddBookPage = () => {
    const navigate = useNavigate();
    const { addToast } = useToast();
    const fileRef = useRef(null);

    const [form, setForm] = useState(INITIAL);
    const [imageFile, setImageFile] = useState(null);
    const [preview, setPreview] = useState(null);
    const [errors, setErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm((p) => ({ ...p, [name]: value }));
        setErrors((p) => ({ ...p, [name]: "" }));
    };

    const handleImage = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const allowed = ["image/jpeg", "image/png", "image/webp"];
        if (!allowed.includes(file.type)) {
            setErrors((p) => ({
                ...p,
                image: "Only JPG / PNG / WebP allowed",
            }));
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            setErrors((p) => ({ ...p, image: "File too large (max 5 MB)" }));
            return;
        }
        setImageFile(file);
        setPreview(URL.createObjectURL(file));
        setErrors((p) => ({ ...p, image: "" }));
    };

    const validate = () => {
        const e = {};
        if (!form.title.trim()) e.title = "Title is required";
        if (!form.author.trim()) e.author = "Author is required";
        if (!form.description.trim()) e.description = "Description is required";
        if (!form.category) e.category = "Category is required";
        if (!form.price || Number(form.price) <= 0)
            e.price = "Price must be > 0";
        if (form.stock === "" || Number(form.stock) < 0)
            e.stock = "Stock must be ≥ 0";
        if (!imageFile) e.image = "Cover image is required";
        return e;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const errs = validate();
        if (Object.keys(errs).length) {
            setErrors(errs);
            return;
        }

        const fd = new FormData();
        Object.entries(form).forEach(([k, v]) => {
            if (v !== "") fd.append(k, v);
        });
        fd.append("images", imageFile);

        setSubmitting(true);
        try {
            await adminService.createBook(fd);
            addToast("Book added successfully!", "success");
            navigate("/admin/books");
        } catch (err) {
            const msg = err.response?.data?.message || "Failed to add book";
            addToast(msg, "error");
        } finally {
            setSubmitting(false);
        }
    };

    // Helpers
    const field = (label, name, type = "text", placeholder = "") => (
        <div>
            <label className="block text-sm text-gray-400 mb-1">{label}</label>
            <input
                type={type}
                name={name}
                value={form[name]}
                onChange={handleChange}
                placeholder={placeholder}
                className={`w-full bg-[#0B0B0B] border rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 outline-none transition focus:border-[var(--color-primary-gold)] ${
                    errors[name] ? "border-red-500" : "border-[#2A2A2A]"
                }`}
            />
            {errors[name] && (
                <p className="text-red-400 text-xs mt-1">{errors[name]}</p>
            )}
        </div>
    );

    return (
        <AdminLayout>
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-heading text-[var(--color-primary-gold)]">
                        Add New Book
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">
                        Fill in book details and upload a cover image
                    </p>
                </div>
                <button
                    onClick={() => navigate("/admin/books")}
                    className="text-gray-400 hover:text-white text-sm border border-[#2A2A2A] px-4 py-2 rounded-lg transition"
                >
                    ← Back to Books
                </button>
            </div>

            <form onSubmit={handleSubmit} noValidate>
                <div className="grid lg:grid-cols-[1fr_300px] gap-8">
                    {/* ── Left: Form fields ─────────────────── */}
                    <div className="space-y-5 bg-[#111111] border border-[#2A2A2A] rounded-xl p-6">
                        {field(
                            "Book Title *",
                            "title",
                            "text",
                            "e.g. Sahih Al-Bukhari",
                        )}
                        {field(
                            "Author Name *",
                            "author",
                            "text",
                            "e.g. Imam Bukhari",
                        )}

                        {/* Description */}
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">
                                Description *
                            </label>
                            <textarea
                                name="description"
                                value={form.description}
                                onChange={handleChange}
                                rows={4}
                                placeholder="Brief description of the book..."
                                className={`w-full bg-[#0B0B0B] border rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 outline-none transition resize-none focus:border-[var(--color-primary-gold)] ${
                                    errors.description
                                        ? "border-red-500"
                                        : "border-[#2A2A2A]"
                                }`}
                            />
                            {errors.description && (
                                <p className="text-red-400 text-xs mt-1">
                                    {errors.description}
                                </p>
                            )}
                        </div>

                        {/* Category */}
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">
                                Category *
                            </label>
                            <select
                                name="category"
                                value={form.category}
                                onChange={handleChange}
                                className={`w-full bg-[#0B0B0B] border rounded-lg px-4 py-2.5 text-sm text-white outline-none transition focus:border-[var(--color-primary-gold)] ${
                                    errors.category
                                        ? "border-red-500"
                                        : "border-[#2A2A2A]"
                                }`}
                            >
                                <option value="">Select category…</option>
                                {CATEGORIES.map((c) => (
                                    <option key={c} value={c}>
                                        {c}
                                    </option>
                                ))}
                            </select>
                            {errors.category && (
                                <p className="text-red-400 text-xs mt-1">
                                    {errors.category}
                                </p>
                            )}
                        </div>

                        {/* Price + Stock */}
                        <div className="grid grid-cols-2 gap-4">
                            {field(
                                "Price (₹) *",
                                "price",
                                "number",
                                "e.g. 299",
                            )}
                            {field("Stock *", "stock", "number", "e.g. 50")}
                        </div>

                        {/* Optional Product Details */}
                        <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">
                                Product Details (optional)
                            </p>
                            <div className="grid grid-cols-2 gap-4">
                                {field(
                                    "Language",
                                    "language",
                                    "text",
                                    "e.g. Arabic, English",
                                )}
                                {field("Pages", "pages", "number", "e.g. 450")}
                                {field(
                                    "Publisher",
                                    "publisher",
                                    "text",
                                    "e.g. Darussalam",
                                )}
                                {field(
                                    "Published Date",
                                    "publishedDate",
                                    "date",
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ── Right: Image upload ────────────────── */}
                    <div className="space-y-4">
                        <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6">
                            <p className="text-sm text-gray-400 mb-3">
                                Cover Image *
                            </p>

                            {/* Preview box */}
                            <div
                                onClick={() => fileRef.current?.click()}
                                className={`relative cursor-pointer rounded-xl border-2 border-dashed flex flex-col items-center justify-center overflow-hidden transition min-h-[220px] ${
                                    errors.image
                                        ? "border-red-500"
                                        : "border-[#2A2A2A] hover:border-[var(--color-primary-gold)]"
                                }`}
                            >
                                {preview ? (
                                    <img
                                        src={preview}
                                        alt="preview"
                                        className="w-full h-full object-cover rounded-xl"
                                        style={{ maxHeight: 260 }}
                                    />
                                ) : (
                                    <div className="flex flex-col items-center gap-2 p-6 text-center">
                                        <svg
                                            className="w-10 h-10 text-gray-600"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth="1.5"
                                                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                                            />
                                        </svg>
                                        <p className="text-gray-500 text-sm">
                                            Click to upload
                                        </p>
                                        <p className="text-gray-600 text-xs">
                                            JPG · PNG · WebP — max 5 MB
                                        </p>
                                    </div>
                                )}
                            </div>

                            <input
                                ref={fileRef}
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                className="hidden"
                                onChange={handleImage}
                            />
                            {errors.image && (
                                <p className="text-red-400 text-xs mt-2">
                                    {errors.image}
                                </p>
                            )}
                            {imageFile && (
                                <p className="text-gray-500 text-xs mt-2 truncate">
                                    {imageFile.name}
                                </p>
                            )}
                        </div>

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={submitting}
                            className="w-full py-3 rounded-xl bg-[var(--color-primary-gold)] text-black font-bold hover:bg-[var(--color-accent-gold)] disabled:opacity-50 disabled:cursor-not-allowed transition"
                        >
                            {submitting ? "Uploading…" : "Add Book"}
                        </button>
                    </div>
                </div>
            </form>
        </AdminLayout>
    );
};

export default AdminAddBookPage;

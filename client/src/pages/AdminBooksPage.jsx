import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../components/admin/AdminLayout";
import { adminService } from "../services/adminService";
import { useToast } from "../context/ToastContext";
import { formatPrice } from "../utils/formatPrice";

const CATEGORIES = ["Quran", "Hadith", "Fiqh", "History", "Biography", "Other"];

// ── Tiny reusable components ─────────────────────────────────────────────────

const Spinner = () => (
    <tr>
        <td colSpan="6" className="text-center py-16">
            <div className="inline-block w-8 h-8 border-2 border-[var(--color-primary-gold)] border-t-transparent rounded-full animate-spin" />
        </td>
    </tr>
);

const Empty = ({ cols }) => (
    <tr>
        <td colSpan={cols} className="text-center py-16 text-gray-500">
            No books found
        </td>
    </tr>
);

// ── Edit modal ────────────────────────────────────────────────────────────────

const EditModal = ({ book, onClose, onSaved }) => {
    const { addToast } = useToast();
    const [form, setForm] = useState({
        title: book.title || "",
        author: book.author || "",
        description: book.description || "",
        category: book.category || "",
        price: book.price ?? "",
        stock: book.stock ?? "",
    });
    const [imageFile, setImageFile] = useState(null);
    const [saving, setSaving] = useState(false);

    const handleChange = (e) =>
        setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData();
        Object.entries(form).forEach(([k, v]) => fd.append(k, v));
        if (imageFile) fd.append("image", imageFile);

        setSaving(true);
        try {
            const updated = await adminService.updateBook(book._id, fd);
            addToast("Book updated!", "success");
            onSaved(updated);
        } catch (err) {
            addToast(err.response?.data?.message || "Update failed", "error");
        } finally {
            setSaving(false);
        }
    };

    const inp = (label, name, type = "text") => (
        <div>
            <label className="block text-xs text-gray-400 mb-1">{label}</label>
            <input
                type={type}
                name={name}
                value={form[name]}
                onChange={handleChange}
                className="w-full bg-[#0B0B0B] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-primary-gold)] transition"
            />
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-[#111111] border border-[#2A2A2A] rounded-2xl w-full max-w-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-5">
                    <h2 className="font-heading text-lg text-[var(--color-primary-gold)]">
                        Edit Book
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-white text-xl"
                    >
                        ✕
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {inp("Title", "title")}
                    {inp("Author", "author")}
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">
                            Description
                        </label>
                        <textarea
                            name="description"
                            value={form.description}
                            onChange={handleChange}
                            rows={3}
                            className="w-full bg-[#0B0B0B] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-primary-gold)] transition resize-none"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">
                            Category
                        </label>
                        <select
                            name="category"
                            value={form.category}
                            onChange={handleChange}
                            className="w-full bg-[#0B0B0B] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-primary-gold)] transition"
                        >
                            {CATEGORIES.map((c) => (
                                <option key={c} value={c}>
                                    {c}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        {inp("Price (₹)", "price", "number")}
                        {inp("Stock", "stock", "number")}
                    </div>

                    {/* Replace image */}
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">
                            Replace Cover Image (optional)
                        </label>
                        <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={(e) =>
                                setImageFile(e.target.files[0] || null)
                            }
                            className="text-sm text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-[#2A2A2A] file:text-white file:text-xs cursor-pointer"
                        />
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-2.5 rounded-lg border border-[#2A2A2A] text-gray-400 hover:border-[#3A3A3A] text-sm transition"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="flex-1 py-2.5 rounded-lg bg-[var(--color-primary-gold)] text-black font-bold text-sm hover:bg-[var(--color-accent-gold)] disabled:opacity-50 transition"
                        >
                            {saving ? "Saving…" : "Save Changes"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// ── Delete confirm ────────────────────────────────────────────────────────────

const DeleteConfirm = ({ book, onClose, onDeleted }) => {
    const { addToast } = useToast();
    const [loading, setLoading] = useState(false);

    const handleDelete = async () => {
        setLoading(true);
        try {
            await adminService.deleteBook(book._id);
            addToast("Book removed", "info");
            onDeleted(book._id);
        } catch (err) {
            addToast(err.response?.data?.message || "Delete failed", "error");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-[#111111] border border-[#2A2A2A] rounded-2xl w-full max-w-sm p-6 shadow-2xl">
                <h2 className="font-heading text-lg text-red-400 mb-2">
                    Delete Book?
                </h2>
                <p className="text-gray-400 text-sm mb-1">
                    This will disable the book from the storefront.
                </p>
                <p className="text-white text-sm font-medium mb-6 truncate">
                    "{book.title}"
                </p>
                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2.5 rounded-lg border border-[#2A2A2A] text-gray-400 text-sm transition hover:border-[#3A3A3A]"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleDelete}
                        disabled={loading}
                        className="flex-1 py-2.5 rounded-lg bg-red-600 text-white font-bold text-sm hover:bg-red-700 disabled:opacity-50 transition"
                    >
                        {loading ? "Deleting…" : "Delete"}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Main page ─────────────────────────────────────────────────────────────────

const AdminBooksPage = () => {
    const navigate = useNavigate();
    const [books, setBooks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editTarget, setEditTarget] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);

    useEffect(() => {
        const load = async () => {
            try {
                const data = await adminService.getBooks();
                setBooks(data);
            } catch {
                /* silent — error shown via empty state */
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const handleSaved = (updated) => {
        setBooks((prev) =>
            prev.map((b) => (b._id === updated._id ? updated : b)),
        );
        setEditTarget(null);
    };

    const handleDeleted = (id) => {
        setBooks((prev) => prev.filter((b) => b._id !== id));
        setDeleteTarget(null);
    };

    return (
        <AdminLayout>
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-heading text-[var(--color-primary-gold)]">
                        Manage Books
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">
                        {books.length} total
                    </p>
                </div>
                <button
                    onClick={() => navigate("/admin/books/add")}
                    className="bg-[var(--color-primary-gold)] text-black px-5 py-2.5 rounded-lg font-bold text-sm hover:bg-[var(--color-accent-gold)] transition"
                >
                    + Add New Book
                </button>
            </div>

            {/* Table */}
            <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="border-b border-[#2A2A2A] text-gray-400 text-xs uppercase tracking-wide">
                        <tr>
                            <th className="px-5 py-4 text-left">Book</th>
                            <th className="px-5 py-4 text-left">Category</th>
                            <th className="px-5 py-4 text-left">Price</th>
                            <th className="px-5 py-4 text-left">Stock</th>
                            <th className="px-5 py-4 text-left">Status</th>
                            <th className="px-5 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1a1a1a]">
                        {loading ? (
                            <Spinner />
                        ) : books.length === 0 ? (
                            <Empty cols={6} />
                        ) : (
                            books.map((book) => (
                                <tr
                                    key={book._id}
                                    className="hover:bg-[#161616] transition"
                                >
                                    {/* Book info */}
                                    <td className="px-5 py-3">
                                        <div className="flex items-center gap-3">
                                            <img
                                                src={
                                                    book.imageUrl ||
                                                    "https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&q=80&w=60"
                                                }
                                                alt={book.title}
                                                className="w-10 h-13 object-cover rounded"
                                            />
                                            <div className="min-w-0">
                                                <p className="text-white font-medium truncate max-w-[180px]">
                                                    {book.title}
                                                </p>
                                                <p className="text-gray-500 text-xs truncate max-w-[180px]">
                                                    {book.author}
                                                </p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-5 py-3 text-gray-400">
                                        {book.category}
                                    </td>
                                    <td className="px-5 py-3 text-[var(--color-primary-gold)] font-medium">
                                        {formatPrice(book.price)}
                                    </td>
                                    <td className="px-5 py-3">
                                        <span
                                            className={
                                                book.stock === 0
                                                    ? "text-red-400"
                                                    : "text-white"
                                            }
                                        >
                                            {book.stock}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3">
                                        <span
                                            className={`px-2 py-1 rounded-full text-xs font-medium ${
                                                book.isActive
                                                    ? "bg-green-900/40 text-green-400"
                                                    : "bg-red-900/40 text-red-400"
                                            }`}
                                        >
                                            {book.isActive
                                                ? "Active"
                                                : "Inactive"}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() =>
                                                    setEditTarget(book)
                                                }
                                                className="px-3 py-1.5 rounded-lg border border-[#2A2A2A] text-gray-300 text-xs hover:border-[var(--color-primary-gold)] hover:text-[var(--color-primary-gold)] transition"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() =>
                                                    setDeleteTarget(book)
                                                }
                                                className="px-3 py-1.5 rounded-lg border border-[#2A2A2A] text-gray-300 text-xs hover:border-red-500 hover:text-red-400 transition"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modals */}
            {editTarget && (
                <EditModal
                    book={editTarget}
                    onClose={() => setEditTarget(null)}
                    onSaved={handleSaved}
                />
            )}
            {deleteTarget && (
                <DeleteConfirm
                    book={deleteTarget}
                    onClose={() => setDeleteTarget(null)}
                    onDeleted={handleDeleted}
                />
            )}
        </AdminLayout>
    );
};

export default AdminBooksPage;

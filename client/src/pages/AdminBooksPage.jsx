import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../components/admin/AdminLayout";
import AdminConfirmModal from "../components/admin/AdminConfirmModal";
import { adminService } from "../services/adminService";
import { useToast } from "../context/ToastContext";
import { formatPrice } from "../utils/formatPrice";

const CATEGORIES = ["Quran", "Hadith", "Fiqh", "History", "Biography", "Other"];

// ── Spinner / Empty helpers ────────────────────────────────────────────────────

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

// ── Edit Modal ─────────────────────────────────────────────────────────────────

const EditModal = ({ book, onClose, onSaved }) => {
    const { addToast } = useToast();
    const [form, setForm] = useState({
        title: book.title || "",
        author: book.author || "",
        description: book.description || "",
        category: book.category || CATEGORIES[0],
        price: book.price ?? "",
        stock: book.stock ?? "",
        discount: book.discount ?? 0,
        language: book.language || "",
        pages: book.pages ?? "",
        publisher: book.publisher || "",
        publishedDate: book.publishedDate
            ? new Date(book.publishedDate).toISOString().split("T")[0]
            : "",
    });
    const [newFiles, setNewFiles] = useState([]); // Files[] to upload
    const [coverTarget, setCoverTarget] = useState(null); // URL being set as cover
    const [removeTarget, setRemoveTarget] = useState(null); // URL being removed
    const [saving, setSaving] = useState(false);
    const [coverLoading, setCoverLoading] = useState(false);
    const [removeLoading, setRemoveLoading] = useState(false);

    const [currentBook, setCurrentBook] = useState(book); // Tracks server state of images

    const handleChange = (e) =>
        setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData();
        Object.entries(form).forEach(([k, v]) => fd.append(k, v));
        newFiles.forEach((f) => fd.append("images", f));

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

    const handleSetCover = async (url) => {
        setCoverLoading(true);
        try {
            const updated = await adminService.setCoverImage(book._id, url);
            setCurrentBook(updated);
            addToast("Cover image updated", "success");
            setCoverTarget(null);
        } catch (err) {
            addToast(
                err.response?.data?.message || "Failed to set cover",
                "error",
            );
        } finally {
            setCoverLoading(false);
        }
    };

    const handleRemoveImage = async () => {
        if (!removeTarget) return;
        setRemoveLoading(true);
        try {
            const updated = await adminService.deleteBookImage(
                book._id,
                removeTarget,
            );
            setCurrentBook(updated);
            addToast("Image removed", "info");
            setRemoveTarget(null);
        } catch (err) {
            addToast(
                err.response?.data?.message || "Failed to remove image",
                "error",
            );
        } finally {
            setRemoveLoading(false);
        }
    };

    const inp = (label, name, type = "text", extra = {}) => (
        <div>
            <label className="block text-xs text-gray-400 mb-1">{label}</label>
            <input
                type={type}
                name={name}
                value={form[name]}
                onChange={handleChange}
                {...extra}
                className="w-full bg-[#0B0B0B] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-primary-gold)] transition"
            />
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-[#111111] border border-[#2A2A2A] rounded-2xl w-full max-w-xl p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
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
                    <div className="grid grid-cols-3 gap-3">
                        {inp("Price (₹)", "price", "number", { min: 0 })}
                        {inp("Stock", "stock", "number", { min: 0 })}
                        {inp("Discount (%)", "discount", "number", {
                            min: 0,
                            max: 100,
                        })}
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">
                            Product Details (optional)
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                            {inp("Language", "language")}
                            {inp("Pages", "pages", "number", { min: 1 })}
                            {inp("Publisher", "publisher")}
                            {inp("Published Date", "publishedDate", "date")}
                        </div>
                    </div>

                    {/* Existing Images Grid */}
                    {(currentBook.images || []).length > 0 && (
                        <div>
                            <label className="block text-xs text-gray-400 mb-2">
                                Existing Images ({currentBook.images.length}/5)
                            </label>
                            <div className="grid grid-cols-4 gap-2">
                                {currentBook.images.map((url, i) => (
                                    <div
                                        key={i}
                                        className="relative group rounded-lg overflow-hidden border border-[#2A2A2A]"
                                    >
                                        <img
                                            src={url}
                                            alt={`img-${i}`}
                                            className="w-full aspect-[3/4] object-cover"
                                        />
                                        {url === currentBook.coverImage && (
                                            <div className="absolute top-0 left-0 right-0 bg-[var(--color-primary-gold)] text-black text-[9px] font-bold text-center py-0.5">
                                                COVER
                                            </div>
                                        )}
                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex flex-col items-center justify-center gap-1.5 p-1">
                                            {url !== currentBook.coverImage && (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setCoverTarget(url)
                                                    }
                                                    className="text-[9px] bg-[var(--color-primary-gold)] text-black px-2 py-0.5 rounded font-semibold"
                                                >
                                                    Set Cover
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setRemoveTarget(url)
                                                }
                                                className="text-[9px] bg-red-600 text-white px-2 py-0.5 rounded font-semibold"
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Add New Images */}
                    {(currentBook.images || []).length < 5 && (
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">
                                Add Images (up to{" "}
                                {5 - (currentBook.images || []).length} more)
                            </label>
                            <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                multiple
                                onChange={(e) =>
                                    setNewFiles(
                                        Array.from(e.target.files).slice(
                                            0,
                                            5 -
                                                (currentBook.images || [])
                                                    .length,
                                        ),
                                    )
                                }
                                className="text-sm text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-[#2A2A2A] file:text-white file:text-xs cursor-pointer"
                            />
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-2.5 rounded-lg border border-[#2A2A2A] text-gray-400 hover:border-[#3A3A3A] text-sm transition"
                        >
                            Close
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

            {/* Set Cover Confirm */}
            {coverTarget && (
                <AdminConfirmModal
                    title="Set as Cover Image?"
                    message="This will become the primary display image for this book."
                    dangerous={false}
                    loading={coverLoading}
                    onConfirm={() => handleSetCover(coverTarget)}
                    onCancel={() => setCoverTarget(null)}
                />
            )}

            {/* Remove Image Confirm */}
            {removeTarget && (
                <AdminConfirmModal
                    title="Remove Image?"
                    message="This image will be permanently deleted from Cloudinary."
                    dangerous
                    loading={removeLoading}
                    onConfirm={handleRemoveImage}
                    onCancel={() => setRemoveTarget(null)}
                />
            )}
        </div>
    );
};

// ── Delete Confirm ─────────────────────────────────────────────────────────────

const DeleteConfirm = ({ book, onClose, onDeleted }) => {
    const { addToast } = useToast();
    const [loading, setLoading] = useState(false);

    const handleDelete = async () => {
        setLoading(true);
        try {
            await adminService.deleteBook(book._id);
            addToast("Book deactivated", "info");
            onDeleted(book._id);
        } catch (err) {
            addToast(err.response?.data?.message || "Delete failed", "error");
        } finally {
            setLoading(false);
        }
    };

    return (
        <AdminConfirmModal
            title="Deactivate Book?"
            message={`"${book.title}" will be hidden from the storefront. You can reactivate it later.`}
            dangerous
            loading={loading}
            onConfirm={handleDelete}
            onCancel={onClose}
        />
    );
};

// ── Main Page ──────────────────────────────────────────────────────────────────

const AdminBooksPage = () => {
    const navigate = useNavigate();
    const { addToast } = useToast();
    const [books, setBooks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editTarget, setEditTarget] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [activeBusyId, setActiveBusyId] = useState(null);

    useEffect(() => {
        const load = async () => {
            try {
                const data = await adminService.getBooks();
                setBooks(data);
            } catch {
                /* silent */
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
        // Soft delete — just mark as inactive in UI
        setBooks((prev) =>
            prev.map((b) => (b._id === id ? { ...b, isActive: false } : b)),
        );
        setDeleteTarget(null);
    };

    const toggleActive = async (book) => {
        setActiveBusyId(book._id);
        try {
            const fd = new FormData();
            fd.append("isActive", !book.isActive);
            const updated = await adminService.updateBook(book._id, fd);
            setBooks((prev) =>
                prev.map((b) => (b._id === book._id ? updated : b)),
            );
            addToast(
                updated.isActive ? "Book activated" : "Book deactivated",
                "success",
            );
        } catch (err) {
            addToast(
                err.response?.data?.message || "Failed to update",
                "error",
            );
        } finally {
            setActiveBusyId(null);
        }
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
            <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl overflow-x-auto">
                <table className="w-full min-w-[980px] text-sm">
                    <thead className="border-b border-[#2A2A2A] text-gray-400 text-xs uppercase tracking-wide">
                        <tr>
                            <th className="px-5 py-4 text-left">Book</th>
                            <th className="px-5 py-4 text-left">Category</th>
                            <th className="px-5 py-4 text-left">Price</th>
                            <th className="px-5 py-4 text-left">Discount</th>
                            <th className="px-5 py-4 text-left">Stock</th>
                            <th className="px-5 py-4 text-left">Status</th>
                            <th className="px-5 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1a1a1a]">
                        {loading ? (
                            <Spinner />
                        ) : books.length === 0 ? (
                            <Empty cols={7} />
                        ) : (
                            books.map((book) => (
                                <tr
                                    key={book._id}
                                    className="hover:bg-[#161616] transition"
                                >
                                    <td className="px-5 py-3">
                                        <div className="flex items-center gap-3">
                                            <img
                                                src={
                                                    book.coverImage ||
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
                                    <td className="px-5 py-3 text-gray-400">
                                        {book.discount ? (
                                            <span className="text-green-400">
                                                {book.discount}% off
                                            </span>
                                        ) : (
                                            <span className="text-gray-600">
                                                —
                                            </span>
                                        )}
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
                                            className={`px-2 py-1 rounded-full text-xs font-medium ${book.isActive ? "bg-green-900/40 text-green-400" : "bg-red-900/40 text-red-400"}`}
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
                                                    toggleActive(book)
                                                }
                                                disabled={
                                                    activeBusyId === book._id
                                                }
                                                className={`px-3 py-1.5 rounded-lg border text-xs transition disabled:opacity-50 ${
                                                    book.isActive
                                                        ? "border-yellow-600 text-yellow-400 hover:bg-yellow-700 hover:text-white"
                                                        : "border-green-600 text-green-400 hover:bg-green-700 hover:text-white"
                                                }`}
                                            >
                                                {activeBusyId === book._id
                                                    ? "…"
                                                    : book.isActive
                                                      ? "Deactivate"
                                                      : "Activate"}
                                            </button>
                                            {book.isActive && (
                                                <button
                                                    onClick={() =>
                                                        setDeleteTarget(book)
                                                    }
                                                    className="px-3 py-1.5 rounded-lg border border-[#2A2A2A] text-gray-300 text-xs hover:border-red-500 hover:text-red-400 transition"
                                                >
                                                    Delete
                                                </button>
                                            )}
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

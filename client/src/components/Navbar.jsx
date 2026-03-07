import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { logoutUser } from "../redux/slices/authSlice";
import { fetchCart } from "../redux/slices/cartSlice";
import LogoutModal from "./LogoutModal";
import { FiBell } from "react-icons/fi";

const Navbar = () => {
    const { user } = useSelector((state) => state.auth);
    const { items: cartItems, guestItems } = useSelector((state) => state.cart);
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const location = useLocation();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const [showLogoutModal, setShowLogoutModal] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            if (window.scrollY > 80) {
                setScrolled(true);
            } else {
                setScrolled(false);
            }
        };

        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    useEffect(() => {
        if (user) {
            dispatch(fetchCart());
        }
    }, [user, dispatch]);

    const cartCount = user
        ? cartItems?.reduce((total, item) => total + item.quantity, 0) || 0
        : guestItems?.reduce((total, item) => total + item.quantity, 0) || 0;

    const handleLogoutConfirm = () => {
        dispatch(logoutUser());
        navigate("/login");
    };

    const handleLogout = () => {
        dispatch(logoutUser());
        navigate("/login");
    };

    const navLinks = [
        { name: "Home", path: "/" },
        { name: "Books", path: "/books" },
        { name: "About", path: "/about" },
        { name: "Support", path: "/support" },
    ];

    const isHomePage = location.pathname === "/";

    // Dynamic Navbar classes based on route and scroll state
    const navClasses = isHomePage
        ? `fixed w-full top-0 left-0 z-50 transition-all duration-300 ${
              scrolled
                  ? "bg-[#111111] border-b border-[#2A2A2A] shadow-lg backdrop-blur-md"
                  : "bg-transparent border-transparent text-white"
          }`
        : "sticky top-0 z-50 transition-all duration-300 bg-[#111111] border-b border-[#2A2A2A] shadow-lg";

    return (
        <React.Fragment>
            <nav className={navClasses}>
                <div className="max-w-[1200px] mx-auto px-6 h-[72px] flex items-center justify-between">
                    {/* Mobile Hamburger Menu */}
                    <button
                        className="md:hidden text-[var(--color-primary-gold)] focus:outline-none"
                        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                    >
                        <svg
                            className="w-6 h-6"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            {isMobileMenuOpen ? (
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d="M6 18L18 6M6 6l12 12"
                                />
                            ) : (
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d="M4 6h16M4 12h16M4 18h16"
                                />
                            )}
                        </svg>
                    </button>

                    {/* Logo (Left) */}
                    <Link
                        to="/"
                        className="font-heading text-2xl font-bold text-[var(--color-primary-gold)] tracking-wide transition-transform hover:text-[var(--color-accent-gold)]"
                    >
                        MD SHAKIB
                    </Link>

                    {/* Desktop Menu Items (Center) */}
                    <div className="hidden md:flex space-x-8 absolute left-1/2 transform -translate-x-1/2">
                        {navLinks.map((link) => (
                            <Link
                                key={link.name}
                                to={link.path}
                                className={`font-body text-sm font-medium transition-colors hover:text-[var(--color-primary-gold)] ${
                                    location.pathname === link.path
                                        ? "text-[var(--color-primary-gold)]"
                                        : "text-[var(--color-text-light)]"
                                }`}
                            >
                                {link.name}
                            </Link>
                        ))}
                    </div>

                    {/* Right Side Icons */}
                    <div className="flex items-center space-x-6 text-[var(--color-primary-gold)]">
                        {/* Search Icon - Hide on /books page */}
                        {location.pathname !== "/books" && (
                            <button
                                onClick={() => navigate("/books")}
                                className="hover:text-[var(--color-accent-gold)] transition-colors hidden sm:block"
                                title="Search books"
                            >
                                <svg
                                    className="w-[18px] h-[18px]"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth="2"
                                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                                    />
                                </svg>
                            </button>
                        )}

                        {/* Account Icon */}
                        <div className="relative group hidden sm:block">
                            <Link
                                to={
                                    user
                                        ? user.role === "admin"
                                            ? "/admin"
                                            : "/profile"
                                        : "/login"
                                }
                                className="hover:text-[var(--color-accent-gold)] transition-colors"
                            >
                                <svg
                                    className="w-[18px] h-[18px]"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth="2"
                                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                                    />
                                </svg>
                            </Link>

                            {/* Dropdown for desktop */}
                            {user && (
                                <div className="absolute right-0 mt-4 w-48 bg-[var(--color-secondary-dark)] border border-[var(--color-border-dark)] rounded-[12px] shadow-luxury opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 overflow-hidden">
                                    <div className="px-4 py-3 border-b border-[var(--color-border-dark)]">
                                        <p className="text-sm text-[var(--color-text-muted)] truncate">
                                            Hello, {user.name}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => navigate("/orders")}
                                        className="w-full text-left block px-4 py-3 text-sm text-[var(--color-text-light)] hover:text-[var(--color-primary-gold)] hover:bg-[#1a1a1a] transition-colors"
                                    >
                                        My Orders
                                    </button>
                                    <button
                                        onClick={() => setShowLogoutModal(true)}
                                        className="w-full text-left block px-4 py-3 text-sm text-[var(--color-text-light)] hover:text-[var(--color-primary-gold)] hover:bg-[#1a1a1a] transition-colors"
                                    >
                                        Log Out
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Cart Icon (guests + normal users, hidden for admin) */}
                        {user?.role !== "admin" && (
                            <Link
                                to="/cart"
                                className="relative hover:text-[var(--color-accent-gold)] transition-colors"
                            >
                                <svg
                                    className="w-[18px] h-[18px]"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth="2"
                                        d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                                    />
                                </svg>

                                {cartCount > 0 && (
                                    <span className="absolute -top-2 -right-2 bg-[var(--color-primary-gold)] text-[var(--color-secondary-dark)] text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                                        {cartCount > 9 ? "9+" : cartCount}
                                    </span>
                                )}
                            </Link>
                        )}

                        {/* Notification Icon (Only for admin) */}
                        {user?.role === "admin" && (
                            <button
                                className="relative hover:text-[var(--color-accent-gold)] transition-colors"
                                title="Notifications"
                            >
                                <svg
                                    className="w-[18px] h-[18px]"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth="2"
                                        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14V11a6 6 0 10-12 0v3c0 .386-.146.735-.405 1.003L4 17h5m6 0a3 3 0 11-6 0"
                                    />
                                </svg>

                                {/* Notification Count */}
                                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                                    3
                                </span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Mobile Menu Dropdown */}
                {isMobileMenuOpen && (
                    <div className="md:hidden bg-[var(--color-secondary-dark)] border-t border-[var(--color-border-dark)] absolute w-full left-0 z-50">
                        <div className="px-4 pt-2 pb-4 space-y-1">
                            {navLinks.map((link) => (
                                <Link
                                    key={link.name}
                                    to={link.path}
                                    onClick={() => setIsMobileMenuOpen(false)}
                                    className={`block px-3 py-2 rounded-md font-medium font-body ${
                                        location.pathname === link.path
                                            ? "text-[var(--color-primary-gold)] bg-[#1a1a1a]"
                                            : "text-[var(--color-text-light)] hover:bg-[#1a1a1a] hover:text-[var(--color-primary-gold)]"
                                    }`}
                                >
                                    {link.name}
                                </Link>
                            ))}
                            {user ? (
                                <button
                                    onClick={() => {
                                        setShowLogoutModal(true);
                                        setIsMobileMenuOpen(false);
                                    }}
                                    className="block w-full text-left px-3 py-2 rounded-md font-medium text-red-500 hover:bg-[#1a1a1a]"
                                >
                                    Log Out
                                </button>
                            ) : (
                                <Link
                                    to="/login"
                                    onClick={() => setIsMobileMenuOpen(false)}
                                    className="block px-3 py-2 rounded-md font-medium text-[var(--color-primary-gold)] hover:bg-[#1a1a1a]"
                                >
                                    Log In
                                </Link>
                            )}
                        </div>
                    </div>
                )}

                {/* Logout Modal */}
                <LogoutModal
                    isOpen={showLogoutModal}
                    onClose={() => setShowLogoutModal(false)}
                    onConfirm={handleLogoutConfirm}
                />
            </nav>
        </React.Fragment>
    );
};

export default Navbar;

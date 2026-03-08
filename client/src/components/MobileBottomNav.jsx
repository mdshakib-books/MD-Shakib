import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";

const MobileBottomNav = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const user = useSelector((state) => state.auth.user);
    const isAdmin = user?.role === "admin";

    const navItems = isAdmin
        ? [
              {
                  name: "Dashboard",
                  route: "/admin/dashboard",
                  icon: (
                      <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                      >
                          <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="1.5"
                              d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                          />
                      </svg>
                  ),
              },
              {
                  name: "Books",
                  route: "/admin/books",
                  icon: (
                      <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                      >
                          <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="1.5"
                              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                          />
                      </svg>
                  ),
              },
              {
                  name: "Orders",
                  route: "/admin/orders",
                  icon: (
                      <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                      >
                          <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="1.5"
                              d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                          />
                      </svg>
                  ),
              },
              {
                  name: "Users",
                  route: "/admin/users",
                  icon: (
                      <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                      >
                          <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="1.5"
                              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                          />
                      </svg>
                  ),
              },
              {
                  name: "Profile",
                  route: "/admin/profile",
                  icon: (
                      <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                      >
                          <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="1.5"
                              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                          />
                      </svg>
                  ),
              },
          ]
        : [
              {
                  name: "Home",
                  route: "/",
                  icon: (
                      <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                      >
                          <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="1.5"
                              d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                          />
                      </svg>
                  ),
              },
              {
                  name: "Books",
                  route: "/books",
                  icon: (
                      <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                      >
                          <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="1.5"
                              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                          />
                      </svg>
                  ),
              },
              {
                  name: "Cart",
                  route: "/cart",
                  icon: (
                      <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                      >
                          <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="1.5"
                              d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                          />
                      </svg>
                  ),
              },
              {
                  name: "Orders",
                  route: "/orders",
                  icon: (
                      <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                      >
                          <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="1.5"
                              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                          />
                      </svg>
                  ),
              },
              {
                  name: "Profile",
                  route: "/profile",
                  icon: (
                      <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                      >
                          <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="1.5"
                              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                          />
                      </svg>
                  ),
              },
          ];

    return (
        <div className="md:hidden fixed bottom-0 left-[2px] right-[2px] h-[70px] bg-[#0B0B0B] border border-[#2A2A2A] rounded-t-[22px] shadow-[0_-8px_25px_rgba(0,0,0,0.6)] z-[9999]">
            <div className="flex justify-around items-center h-full px-2">
                {navItems.map((item) => {
                    const isActive =
                        location.pathname === item.route ||
                        (isAdmin &&
                            item.route !== "/admin/dashboard" &&
                            location.pathname.startsWith(item.route));

                    return (
                        <button
                            key={item.name}
                            onClick={() => navigate(item.route)}
                            className="flex flex-col items-center justify-center w-16 h-full transition-transform active:scale-95 touch-manipulation group"
                        >
                            {/* Icon Container */}
                            <div
                                className={`
                                    flex items-center justify-center
                                    w-[38px] h-[38px] rounded-full
                                    border-[1.5px]
                                    transition-all duration-300
                                    ${
                                        isActive
                                            ? "border-[#C9A24A] text-[#C9A24A] shadow-[0_0_12px_rgba(201,162,74,0.6)] scale-110"
                                            : "border-transparent text-[#9CA3AF] group-hover:text-[#C9A24A]"
                                    }
                                `}
                            >
                                {item.icon}
                            </div>

                            {/* Label */}
                            <span
                                className={`
                                    text-[11px] font-body mt-1 transition-colors duration-300
                                    ${isActive ? "text-[#C9A24A]" : "text-[#F5F5F5] group-hover:text-[#C9A24A]"}
                                `}
                            >
                                {item.name}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default MobileBottomNav;

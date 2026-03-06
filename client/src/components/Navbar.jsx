import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { logoutUser } from "../redux/slices/authSlice";

const Navbar = () => {
    const { user } = useSelector((state) => state.auth);
    const dispatch = useDispatch();
    const navigate = useNavigate();

    const handleLogout = async () => {
        await dispatch(logoutUser());
        navigate("/login");
    };

    return (
        <nav className="bg-white shadow p-4 flex justify-between items-center">
            <Link to="/" className="text-xl font-bold text-blue-600">
                MD Shakib
            </Link>
            <div className="space-x-4">
                <Link to="/books" className="text-gray-600 hover:text-blue-600">
                    Books
                </Link>
                <Link to="/cart" className="text-gray-600 hover:text-blue-600">
                    Cart
                </Link>
                {user ? (
                    <>
                        <Link
                            to={user.role === "admin" ? "/admin" : "/profile"}
                            className="text-gray-600 hover:text-blue-600"
                        >
                            Profile
                        </Link>
                        <button
                            onClick={handleLogout}
                            className="text-red-500 hover:text-red-700"
                        >
                            Logout
                        </button>
                    </>
                ) : (
                    <Link
                        to="/login"
                        className="text-blue-500 hover:text-blue-700 font-medium"
                    >
                        Login
                    </Link>
                )}
            </div>
        </nav>
    );
};

export default Navbar;

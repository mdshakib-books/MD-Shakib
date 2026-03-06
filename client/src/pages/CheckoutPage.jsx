import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useCart } from "../hooks/useCart";
import { orderService } from "../services/orderService";

const CheckoutPage = () => {
    const { cart, loading } = useCart();
    const navigate = useNavigate();
    const [address, setAddress] = useState("");

    useEffect(() => {
        console.log("CheckoutPage loaded.");
    }, []);

    const handlePlaceOrder = async (e) => {
        e.preventDefault();
        try {
            console.log("Placing order...");
            await orderService.createOrder({ shippingAddress: address });
            navigate("/orders");
        } catch (err) {
            console.error(err);
        }
    };

    if (loading) return null; // handle in real app

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            <Navbar />
            <main className="flex-grow container mx-auto px-4 py-8 flex justify-center">
                <div className="bg-white p-8 rounded-lg shadow-sm max-w-lg w-full">
                    <h1 className="text-2xl font-bold mb-6">Checkout</h1>
                    <form onSubmit={handlePlaceOrder}>
                        <div className="mb-6">
                            <label className="block text-gray-700 font-medium mb-2">
                                Shipping Address
                            </label>
                            <textarea
                                className="w-full border rounded p-3"
                                rows="4"
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                                required
                                placeholder="Enter full address"
                            ></textarea>
                        </div>
                        <div className="border-t pt-4 mb-6">
                            <div className="flex justify-between font-bold text-lg">
                                <span>Total Amount:</span>
                                <span>₹{cart?.totalAmount || "0"}</span>
                            </div>
                        </div>
                        <button
                            type="submit"
                            className="w-full bg-blue-600 text-white font-medium py-3 rounded hover:bg-blue-700"
                        >
                            Place Order
                        </button>
                    </form>
                </div>
            </main>
            <Footer />
        </div>
    );
};

export default CheckoutPage;

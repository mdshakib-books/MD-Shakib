import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { fetchCart } from "../redux/slices/cartSlice";
import { cartService } from "../services/cartService";

export const useCart = () => {
    const dispatch = useDispatch();
    const {
        items: cartItems,
        loading,
        error,
    } = useSelector((state) => state.cart);

    // Provide a structure identical to the backend response for local compatibility
    const cart = { items: cartItems };

    const loadCart = () => {
        dispatch(fetchCart());
    };

    const addToCart = async (productId, qty) => {
        await cartService.addToCart(productId, qty);
        await loadCart();
    };

    return { cart, loading, error, addToCart, fetchCart: loadCart };
};

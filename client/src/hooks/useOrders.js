import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { fetchOrders } from "../redux/slices/orderSlice";

export const useOrders = () => {
    const dispatch = useDispatch();
    const {
        items: orders,
        loading,
        error,
    } = useSelector((state) => state.orders);

    const loadOrders = () => {
        dispatch(fetchOrders());
    };

    useEffect(() => {
        loadOrders();
    }, [dispatch]);

    return { orders, loading, error, fetchOrders: loadOrders };
};

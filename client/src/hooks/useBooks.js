import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { fetchBooks } from "../redux/slices/bookSlice";

export const useBooks = (params = {}) => {
    const dispatch = useDispatch();
    const {
        items: books,
        loading,
        error,
    } = useSelector((state) => state.books);

    useEffect(() => {
        dispatch(fetchBooks(params));
    }, [dispatch, JSON.stringify(params)]);

    return { books, loading, error };
};

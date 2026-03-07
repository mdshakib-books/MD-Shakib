import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { authService } from "../../services/authService";
import { cartService } from "../../services/cartService";

export const registerUser = createAsyncThunk(
    "auth/register",
    async (userData, { rejectWithValue }) => {
        try {
            const data = await authService.register(userData);
            return data.data;
        } catch (err) {
            return rejectWithValue(
                err.response?.data?.message || "Registration failed",
            );
        }
    },
);

export const loginUser = createAsyncThunk(
    "auth/login",
    async (credentials, { rejectWithValue }) => {
        try {
            const data = await authService.login(credentials);
            const user = data.data.user;

            // Merge guest cart → DB cart immediately after login
            try {
                const raw = localStorage.getItem("guest_cart");
                const guestCart = raw ? JSON.parse(raw) : [];
                if (guestCart.length > 0) {
                    await cartService.mergeCart(guestCart);
                    localStorage.removeItem("guest_cart");
                }
            } catch {
                // Non-fatal: proceed even if merge fails
            }

            return user;
        } catch (err) {
            return rejectWithValue(
                err.response?.data?.message || "Login failed",
            );
        }
    },
);

export const logoutUser = createAsyncThunk(
    "auth/logout",
    async (_, { rejectWithValue }) => {
        try {
            await authService.logout();
            return null;
        } catch (err) {
            return rejectWithValue(
                err.response?.data?.message || "Logout failed",
            );
        }
    },
);

export const fetchProfile = createAsyncThunk(
    "auth/fetchProfile",
    async (_, { rejectWithValue }) => {
        try {
            const data = await authService.getProfile();
            return data;
        } catch (err) {
            return rejectWithValue(
                err.response?.data?.message || "Failed to fetch profile",
            );
        }
    },
);

export const forgotPassword = createAsyncThunk(
    "auth/forgotPassword",
    async (email, { rejectWithValue }) => {
        try {
            const data = await authService.forgotPassword(email);
            return data;
        } catch (err) {
            return rejectWithValue(
                err.response?.data?.message || "Failed to send reset email",
            );
        }
    },
);

export const resetPassword = createAsyncThunk(
    "auth/resetPassword",
    async ({ token, newPassword }, { rejectWithValue }) => {
        try {
            const data = await authService.resetPassword(token, newPassword);
            return data;
        } catch (err) {
            return rejectWithValue(
                err.response?.data?.message || "Failed to reset password",
            );
        }
    },
);

export const changePassword = createAsyncThunk(
    "auth/changePassword",
    async ({ oldPassword, newPassword }, { rejectWithValue }) => {
        try {
            const data = await authService.changePassword(
                oldPassword,
                newPassword,
            );
            return data;
        } catch (err) {
            return rejectWithValue(
                err.response?.data?.message || "Failed to change password",
            );
        }
    },
);

const authSlice = createSlice({
    name: "auth",
    initialState: {
        user: JSON.parse(localStorage.getItem("user") || "null"),
        token: localStorage.getItem("token") || null,
        refreshToken: localStorage.getItem("refreshToken") || null,
        loading: false,
        error: null,
        isAuthenticated: !!localStorage.getItem("token"),
    },
    reducers: {
        setUser: (state, action) => {
            state.user = action.payload;
        },
        clearAuth: (state) => {
            state.user = null;
            state.token = null;
            state.refreshToken = null;
            state.isAuthenticated = false;
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            // Register
            .addCase(registerUser.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(registerUser.fulfilled, (state) => {
                state.loading = false;
            })
            .addCase(registerUser.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            // Login
            .addCase(loginUser.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(loginUser.fulfilled, (state, action) => {
                state.loading = false;
                state.user = action.payload;
                state.token = localStorage.getItem("token");
                state.refreshToken = localStorage.getItem("refreshToken");
                state.isAuthenticated = true;
            })
            .addCase(loginUser.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
                state.isAuthenticated = false;
            })
            // Logout
            .addCase(logoutUser.pending, (state) => {
                state.loading = true;
            })
            .addCase(logoutUser.fulfilled, (state) => {
                state.loading = false;
                state.user = null;
                state.token = null;
                state.refreshToken = null;
                state.isAuthenticated = false;
                state.error = null;
            })
            .addCase(logoutUser.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            // Fetch Profile
            .addCase(fetchProfile.pending, (state) => {
                state.loading = true;
            })
            .addCase(fetchProfile.fulfilled, (state, action) => {
                state.loading = false;
                state.user = action.payload;
            })
            .addCase(fetchProfile.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            // Forgot Password
            .addCase(forgotPassword.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(forgotPassword.fulfilled, (state) => {
                state.loading = false;
            })
            .addCase(forgotPassword.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            // Reset Password
            .addCase(resetPassword.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(resetPassword.fulfilled, (state) => {
                state.loading = false;
            })
            .addCase(resetPassword.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            // Change Password
            .addCase(changePassword.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(changePassword.fulfilled, (state) => {
                state.loading = false;
            })
            .addCase(changePassword.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            });
    },
});

export const { setUser, clearAuth } = authSlice.actions;
export default authSlice.reducer;

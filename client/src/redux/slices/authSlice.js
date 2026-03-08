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

// ── OTP-based password reset thunks ──────────────────────────────────────────

export const sendOtp = createAsyncThunk(
    "auth/sendOtp",
    async (email, { rejectWithValue }) => {
        try {
            const data = await authService.sendOtp(email);
            return data;
        } catch (err) {
            return rejectWithValue(
                err.response?.data?.message || "Failed to send OTP",
            );
        }
    },
);

export const verifyOtp = createAsyncThunk(
    "auth/verifyOtp",
    async ({ email, otp }, { rejectWithValue }) => {
        try {
            const data = await authService.verifyOtp(email, otp);
            return data;
        } catch (err) {
            return rejectWithValue(
                err.response?.data?.message || "OTP verification failed",
            );
        }
    },
);

export const resetPasswordOtp = createAsyncThunk(
    "auth/resetPasswordOtp",
    async ({ email, newPassword }, { rejectWithValue }) => {
        try {
            const data = await authService.resetPasswordOtp(email, newPassword);
            return data.data?.user || null;
        } catch (err) {
            return rejectWithValue(
                err.response?.data?.message || "Password reset failed",
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
            // Send OTP
            .addCase(sendOtp.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(sendOtp.fulfilled, (state) => {
                state.loading = false;
            })
            .addCase(sendOtp.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            // Verify OTP
            .addCase(verifyOtp.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(verifyOtp.fulfilled, (state) => {
                state.loading = false;
            })
            .addCase(verifyOtp.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            // Reset Password (OTP)
            .addCase(resetPasswordOtp.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(resetPasswordOtp.fulfilled, (state, action) => {
                state.loading = false;
                if (action.payload) {
                    state.user = action.payload;
                    state.token = localStorage.getItem("token");
                    state.refreshToken = localStorage.getItem("refreshToken");
                    state.isAuthenticated = true;
                }
            })
            .addCase(resetPasswordOtp.rejected, (state, action) => {
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

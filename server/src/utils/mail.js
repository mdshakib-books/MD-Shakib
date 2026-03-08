import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,         // Changed from 587
    secure: true,      // Changed to true for port 465
    auth: {
        user: process.env.EMAIL,
        pass: process.env.PASS, 
    },
    tls: {
        rejectUnauthorized: false
    }
});

transporter.verify((err, success) => {
    if (err) {
        console.log("SMTP ERROR:", err);
    } else {
        console.log("SMTP READY");
    }
});
// ── OTP for password reset ────────────────────────────────────────────────────
export const sendOtp = async (to, otp) => {
    try {
        await transporter.sendMail({
            from: `"MD Shakib Books" <${process.env.EMAIL}>`,
            to,
            subject: "OTP Verification for Password Reset — MD Shakib Books",
            html: `
                <div style="font-family:Inter,sans-serif;max-width:480px;margin:auto;background:#111;color:#f5f5f5;border-radius:12px;overflow:hidden;">
                    <div style="background:#0b0b0b;padding:24px 32px;border-bottom:1px solid #2a2a2a;">
                        <h2 style="margin:0;color:#c9a24a;font-size:20px;letter-spacing:2px;">MD SHAKIB BOOKS</h2>
                    </div>
                    <div style="padding:32px;">
                        <h3 style="margin-top:0;color:#f5f5f5;">Password Reset OTP</h3>
                        <p style="color:#9ca3af;line-height:1.7;">
                            Use the OTP below to reset your password. It is valid for <strong style="color:#f5f5f5;">5 minutes</strong>.
                        </p>
                        <div style="margin:24px 0;text-align:center;">
                            <span style="display:inline-block;background:#0b0b0b;border:2px solid #c9a24a;color:#c9a24a;font-size:36px;font-weight:700;letter-spacing:12px;padding:16px 32px;border-radius:8px;">
                                ${otp}
                            </span>
                        </div>
                        <p style="color:#6b7280;font-size:13px;">
                            If you didn't request this, please ignore this email. Do not share this OTP with anyone.
                        </p>
                    </div>
                    <div style="background:#0b0b0b;padding:16px 32px;text-align:center;color:#6b7280;font-size:12px;border-top:1px solid #2a2a2a;">
                        © 2026 MD Shakib Books. All rights reserved.
                    </div>
                </div>
            `,
        });
        console.log("OTP email sent to:", to);
    } catch (error) {
        console.error("MAIL ERROR (OTP):", error);
        throw error;
    }
};

// ── OTP for delivery (legacy) ─────────────────────────────────────────────────
export const sendOtpDelivery = async (user, otp) => {
    try {
        await transporter.sendMail({
            from: `"MD Shakib Books" <${process.env.EMAIL}>`,
            to: user.email,
            subject: "OTP Verification for Delivery — MD Shakib Books",
            text: `Your delivery OTP is ${otp}. Do not share it with anyone. It expires in 5 minutes.`,
        });
        console.log("Delivery OTP email sent to:", user.email);
    } catch (error) {
        console.error("MAIL ERROR (Delivery OTP):", error);
        throw error;
    }
};

// ── Order confirmation ────────────────────────────────────────────────────────
export const sendOrderConfirmationMail = async (user, order) => {
    try {
        const itemsHtml = order.items
            .map(
                (item) => `
                <tr>
                    <td style="padding:10px 8px;border-bottom:1px solid #2a2a2a;color:#f5f5f5;">${item.title}</td>
                    <td style="padding:10px 8px;border-bottom:1px solid #2a2a2a;color:#9ca3af;text-align:center;">${item.quantity}</td>
                    <td style="padding:10px 8px;border-bottom:1px solid #2a2a2a;color:#c9a24a;text-align:right;">₹${item.price * item.quantity}</td>
                </tr>`,
            )
            .join("");

        const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";

        await transporter.sendMail({
            from: `"MD Shakib Books" <${process.env.EMAIL}>`,
            to: user.email,
            subject: `Order Confirmed #${order._id} — MD Shakib Books`,
            html: `
                <div style="font-family:Inter,sans-serif;max-width:560px;margin:auto;background:#111;color:#f5f5f5;border-radius:12px;overflow:hidden;">
                    <div style="background:#0b0b0b;padding:24px 32px;border-bottom:1px solid #2a2a2a;">
                        <h2 style="margin:0;color:#c9a24a;font-size:20px;letter-spacing:2px;">MD SHAKIB BOOKS</h2>
                    </div>
                    <div style="padding:32px;">
                        <h3 style="margin-top:0;color:#f5f5f5;">🎉 Your Order is Confirmed!</h3>
                        <p style="color:#9ca3af;">Hi <strong style="color:#f5f5f5;">${user.name}</strong>, thank you for your purchase.</p>

                        <div style="background:#0b0b0b;border:1px solid #2a2a2a;border-radius:8px;padding:16px;margin:20px 0;">
                            <p style="margin:4px 0;color:#9ca3af;font-size:13px;">ORDER ID</p>
                            <p style="margin:4px 0;color:#c9a24a;font-family:monospace;font-size:14px;">#${order._id}</p>
                        </div>

                        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                            <thead>
                                <tr style="background:#0b0b0b;">
                                    <th style="padding:10px 8px;text-align:left;color:#9ca3af;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Book</th>
                                    <th style="padding:10px 8px;text-align:center;color:#9ca3af;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Qty</th>
                                    <th style="padding:10px 8px;text-align:right;color:#9ca3af;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Amount</th>
                                </tr>
                            </thead>
                            <tbody>${itemsHtml}</tbody>
                        </table>

                        <div style="text-align:right;padding:12px 0;border-top:2px solid #2a2a2a;">
                            <span style="color:#9ca3af;font-size:14px;">Total: </span>
                            <span style="color:#c9a24a;font-size:20px;font-weight:700;">₹${order.totalAmount}</span>
                        </div>

                        <div style="background:#0b0b0b;border:1px solid #2a2a2a;border-radius:8px;padding:16px;margin:20px 0;display:flex;align-items:center;gap:8px;">
                            <span style="font-size:20px;">🚚</span>
                            <div>
                                <p style="margin:2px 0;color:#f5f5f5;font-size:14px;font-weight:600;">Estimated Delivery</p>
                                <p style="margin:2px 0;color:#9ca3af;font-size:13px;">3–5 business days</p>
                            </div>
                        </div>

                        <div style="text-align:center;margin-top:24px;">
                            <a href="${clientUrl}/orders/${order._id}"
                               style="display:inline-block;background:#c9a24a;color:#000;text-decoration:none;font-weight:700;padding:14px 32px;border-radius:8px;font-size:15px;">
                                Track Your Order →
                            </a>
                        </div>
                    </div>
                    <div style="background:#0b0b0b;padding:16px 32px;text-align:center;color:#6b7280;font-size:12px;border-top:1px solid #2a2a2a;">
                        © 2026 MD Shakib Books. All rights reserved.
                    </div>
                </div>
            `,
        });
        console.log("Order confirmation email sent to:", user.email);
    } catch (error) {
        console.error("MAIL ERROR (Order Confirmation):", error);
        // Non-fatal: do not rethrow — order already saved
    }
};

// ── Registration OTP ──────────────────────────────────────────────────────────
export const sendRegistrationOtp = async (email, otp) => {
    try {
        await transporter.sendMail({
            from: `"MD Shakib Books" <${process.env.EMAIL}>`,
            to: email,
            subject: "Verify your email — MD Shakib Books",
            html: `
                <div style="font-family:Inter,sans-serif;max-width:480px;margin:auto;background:#111;color:#f5f5f5;border-radius:12px;overflow:hidden;">
                    <div style="background:#0b0b0b;padding:24px 32px;border-bottom:1px solid #2a2a2a;">
                        <h2 style="margin:0;color:#c9a24a;font-size:20px;letter-spacing:2px;">MD SHAKIB BOOKS</h2>
                    </div>
                    <div style="padding:32px;">
                        <h3 style="margin-top:0;color:#f5f5f5;">Verify Your Email Address</h3>
                        <p style="color:#9ca3af;line-height:1.7;">
                            Use the OTP below to complete your registration. It is valid for <strong style="color:#f5f5f5;">5 minutes</strong>.
                        </p>
                        <div style="margin:24px 0;text-align:center;">
                            <span style="display:inline-block;background:#0b0b0b;border:2px solid #c9a24a;color:#c9a24a;font-size:36px;font-weight:700;letter-spacing:12px;padding:16px 32px;border-radius:8px;">
                                ${otp}
                            </span>
                        </div>
                        <p style="color:#6b7280;font-size:13px;">
                            If you did not attempt to create an account, please ignore this email.
                        </p>
                    </div>
                    <div style="background:#0b0b0b;padding:16px 32px;text-align:center;color:#6b7280;font-size:12px;border-top:1px solid #2a2a2a;">
                        © 2026 MD Shakib Books. All rights reserved.
                    </div>
                </div>
            `,
        });
        console.log("Registration OTP sent to:", email);
    } catch (error) {
        console.error("MAIL ERROR (Registration OTP):", error);
        throw error;
    }
};

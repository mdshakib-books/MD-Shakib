import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            index: true,
        },
        action: {
            type: String,
            enum: [
                "CREATE",
                "UPDATE",
                "DELETE",
                "SOFT_DELETE",
                "RESTORE",
                "LOGIN",
                "LOGOUT",
                "PAYMENT",
            ],
            required: true,
            index: true,
        },
        modelName: {
            type: String,
            required: true,
            index: true,
        },
        modelId: {
            type: mongoose.Schema.Types.ObjectId,
            index: true,
        },
        changes: {
            type: Object,
            default: {},
        },
        oldValues: {
            type: Object,
            default: {},
        },
        newValues: {
            type: Object,
            default: {},
        },
        ipAddress: {
            type: String,
        },
        userAgent: {
            type: String,
        },
        status: {
            type: String,
            enum: ["SUCCESS", "FAILED"],
            default: "SUCCESS",
        },
        errorMessage: {
            type: String,
        },
    },
    {
        timestamps: true,
        expireAfterSeconds: 30 * 24 * 60 * 60, // Auto-cleanup after 30 days
    },
);

const AuditLog = mongoose.model("AuditLog", auditLogSchema);
export default AuditLog;

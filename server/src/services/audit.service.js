import AuditLog from "../models/auditLog.model.js";

class AuditService {
    async log(data) {
        try {
            const {
                userId,
                action,
                modelName,
                modelId,
                oldValues = {},
                newValues = {},
                ipAddress,
                userAgent,
                status = "SUCCESS",
                errorMessage,
            } = data;

            const changes = this._calculateChanges(oldValues, newValues);

            const auditLog = await AuditLog.create({
                userId,
                action,
                modelName,
                modelId,
                changes,
                oldValues,
                newValues,
                ipAddress,
                userAgent,
                status,
                errorMessage,
            });

            return auditLog;
        } catch (error) {
            console.error("Failed to create audit log:", error);
            return null;
        }
    }

    async logAction(
        req,
        action,
        modelName,
        modelId,
        oldValues = {},
        newValues = {},
    ) {
        return this.log({
            userId: req.user?._id,
            action,
            modelName,
            modelId,
            oldValues,
            newValues,
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get("user-agent"),
        });
    }

    async getAuditLogs(filters = {}, pagination = {}) {
        const { page = 1, limit = 20 } = pagination;
        const skip = (page - 1) * limit;

        const logs = await AuditLog.find(filters)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const total = await AuditLog.countDocuments(filters);

        return {
            logs,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        };
    }

    async getUserActivityLogs(userId, days = 30) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        return AuditLog.find({
            userId,
            createdAt: { $gte: startDate },
        })
            .sort({ createdAt: -1 })
            .lean();
    }

    _calculateChanges(oldValues, newValues) {
        const changes = {};

        // Find updated fields
        Object.keys(newValues).forEach((key) => {
            if (
                JSON.stringify(oldValues[key]) !==
                JSON.stringify(newValues[key])
            ) {
                changes[key] = {
                    from: oldValues[key],
                    to: newValues[key],
                };
            }
        });

        // Find deleted fields
        Object.keys(oldValues).forEach((key) => {
            if (!(key in newValues)) {
                changes[key] = {
                    from: oldValues[key],
                    to: null,
                };
            }
        });

        return changes;
    }
}

export default new AuditService();

import { asyncHandler } from "../utils/asyncHandler.js";
import auditService from "../services/audit.service.js";

export const auditLog = asyncHandler(async (req, res, next) => {
    // Attach audit logger to request
    req.auditLog = async (
        action,
        modelName,
        modelId,
        oldValues = {},
        newValues = {},
    ) => {
        await auditService.logAction(
            req,
            action,
            modelName,
            modelId,
            oldValues,
            newValues,
        );
    };
    next();
});

export default auditLog;

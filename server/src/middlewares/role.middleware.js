import { ApiError } from "../utils/ApiError.js";
import { USER_ROLES } from "../utils/user.constants.js";

export const authorizeRoles = (...roles) => {
    return (req, res, next) => {
        if (!req.user?.role || !roles.includes(req.user.role)) {
            throw new ApiError(
                403,
                "You do not have permission to perform this action",
            );
        }
        next();
    };
};

export const isAdmin = authorizeRoles(USER_ROLES.ADMIN);

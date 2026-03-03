export const getPaginationOptions = (req) => {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    // Build sorting object dynamically based on query params (e.g., sort=-createdAt)
    let sort = {};
    if (req.query.sort) {
        const sortParts = req.query.sort.split(",");
        sortParts.forEach((part) => {
            const isDescending = part.startsWith("-");
            const field = isDescending ? part.substring(1) : part;
            sort[field] = isDescending ? -1 : 1;
        });
    } else {
        // Default sort
        sort = { createdAt: -1 };
    }

    return { page, limit, skip, sort };
};

export const buildPaginatedResponse = (data, totalDocs, page, limit) => {
    return {
        items: data,
        pagination: {
            totalItems: totalDocs,
            currentPage: page,
            totalPages: Math.ceil(totalDocs / limit),
            limit: limit,
            hasNextPage: page * limit < totalDocs,
            hasPrevPage: page > 1,
        },
    };
};

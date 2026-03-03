export const parseQueryParams = (req) => {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    // Sorting
    let sort = {};
    if (req.query.sort) {
        const sortParts = req.query.sort.split(",");
        sortParts.forEach((part) => {
            const isDescending = part.startsWith("-");
            const field = isDescending ? part.substring(1) : part;
            sort[field] = isDescending ? -1 : 1;
        });
    } else {
        sort = { createdAt: -1 };
    }

    // Price range filtering
    const minPrice = parseFloat(req.query.minPrice);
    const maxPrice = parseFloat(req.query.maxPrice);

    return { page, limit, skip, sort, minPrice, maxPrice };
};

import { createAdminClient } from "@/lib/supabase/admin";

export interface ImportResult {
  success: boolean;
  totalRows: number;
  inserted: number;
  updated: number;
  errors: string[];
}

/**
 * Escapes a cell value for safe RFC 4180 CSV export.
 */
function escapeCsv(val: any): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Parses CSV content into header and rows supporting quoted multi-line fields.
 */
function parseCsv(csvText: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines: string[] = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    if (char === '"') {
      insideQuotes = !insideQuotes;
      current += char;
    } else if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && csvText[i + 1] === "\n") {
        i++;
      }
      if (current.trim().length > 0) {
        lines.push(current);
      }
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim().length > 0) {
    lines.push(current);
  }

  if (lines.length === 0) return { headers: [], rows: [] };

  const splitRow = (line: string): string[] => {
    const fields: string[] = [];
    let field = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQ = !inQ;
        }
      } else if (c === "," && !inQ) {
        fields.push(field.trim());
        field = "";
      } else {
        field += c;
      }
    }
    fields.push(field.trim());
    return fields;
  };

  const rawHeaders = splitRow(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitRow(lines[i]);
    const rowObj: Record<string, string> = {};
    rawHeaders.forEach((h, idx) => {
      rowObj[h] = values[idx] ?? "";
    });
    rows.push(rowObj);
  }

  return { headers: rawHeaders, rows };
}

/**
 * Generates RFC 4180 compliant CSV of catalog books (2.31).
 */
export async function exportBooksToCsv(): Promise<string> {
  const adminDb = createAdminClient();

  const { data: books, error } = await adminDb
    .from("books")
    .select(`
      id,
      title,
      author,
      category,
      price,
      stock,
      discount,
      sku,
      isbn_10,
      isbn_13,
      weight_grams,
      length_cm,
      width_cm,
      height_cm,
      is_active
    `)
    .order("title", { ascending: true });

  if (error || !books) {
    throw new Error(`Failed to query books for export: ${error?.message}`);
  }

  const headers = [
    "id",
    "title",
    "author",
    "category",
    "price",
    "stock",
    "discount",
    "sku",
    "isbn_10",
    "isbn_13",
    "weight_grams",
    "length_cm",
    "width_cm",
    "height_cm",
    "is_active",
  ];

  const lines = [headers.join(",")];

  for (const b of books) {
    const row = [
      escapeCsv(b.id),
      escapeCsv(b.title),
      escapeCsv(b.author),
      escapeCsv(b.category),
      escapeCsv(b.price),
      escapeCsv(b.stock),
      escapeCsv(b.discount),
      escapeCsv(b.sku),
      escapeCsv(b.isbn_10),
      escapeCsv(b.isbn_13),
      escapeCsv(b.weight_grams),
      escapeCsv(b.length_cm),
      escapeCsv(b.width_cm),
      escapeCsv(b.height_cm),
      escapeCsv(b.is_active ? "true" : "false"),
    ];
    lines.push(row.join(","));
  }

  return lines.join("\n");
}

/**
 * Parses and ingests a bulk product catalog CSV with validation and upsert logic (2.30).
 */
export async function importBooksFromCsv(
  csvContent: string,
  adminId?: string
): Promise<ImportResult> {
  const { headers, rows } = parseCsv(csvContent);

  if (rows.length === 0) {
    return {
      success: false,
      totalRows: 0,
      inserted: 0,
      updated: 0,
      errors: ["CSV is empty or missing data rows."],
    };
  }

  const adminDb = createAdminClient();
  let inserted = 0;
  let updated = 0;
  const errors: string[] = [];

  const validCategories = ["Quran", "Hadith", "Fiqh", "History", "Biography", "Other"];

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const rowNum = idx + 2; // accounting for 1-based index and header row

    const title = row.title?.trim();
    const author = row.author?.trim();
    const category = row.category?.trim();
    const priceStr = row.price?.trim();
    const stockStr = row.stock?.trim();

    if (!title) {
      errors.push(`Row ${rowNum}: Title is mandatory.`);
      continue;
    }
    if (!author) {
      errors.push(`Row ${rowNum}: Author is mandatory.`);
      continue;
    }
    if (!category || !validCategories.includes(category)) {
      errors.push(`Row ${rowNum}: Invalid category '${category}'. Must be one of: ${validCategories.join(", ")}`);
      continue;
    }

    const price = parseFloat(priceStr);
    if (isNaN(price) || price < 0) {
      errors.push(`Row ${rowNum}: Price must be a non-negative number.`);
      continue;
    }

    const stock = stockStr ? parseInt(stockStr, 10) : 0;
    if (isNaN(stock) || stock < 0) {
      errors.push(`Row ${rowNum}: Stock must be a non-negative integer.`);
      continue;
    }

    const discount = row.discount ? parseInt(row.discount, 10) : 0;
    const sku = row.sku?.trim() || null;
    const isbn10 = row.isbn_10?.trim() || null;
    const isbn13 = row.isbn_13?.trim() || null;
    const weightGrams = row.weight_grams ? parseInt(row.weight_grams, 10) : null;
    const lengthCm = row.length_cm ? parseFloat(row.length_cm) : null;
    const widthCm = row.width_cm ? parseFloat(row.width_cm) : null;
    const heightCm = row.height_cm ? parseFloat(row.height_cm) : null;
    const isActive = row.is_active === "false" ? false : true;

    // Check if updating existing book by ID or SKU
    let existingBook: any = null;
    if (row.id && row.id.length === 36) {
      const { data } = await adminDb.from("books").select("id").eq("id", row.id).maybeSingle();
      existingBook = data;
    } else if (sku) {
      const { data } = await adminDb.from("books").select("id").eq("sku", sku).maybeSingle();
      existingBook = data;
    }

    if (existingBook) {
      const { error: updErr } = await adminDb
        .from("books")
        .update({
          title,
          author,
          category,
          price,
          stock,
          discount: Math.min(100, Math.max(0, discount)),
          sku,
          isbn_10: isbn10,
          isbn_13: isbn13,
          weight_grams: weightGrams,
          length_cm: lengthCm,
          width_cm: widthCm,
          height_cm: heightCm,
          is_active: isActive,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingBook.id);

      if (updErr) {
        errors.push(`Row ${rowNum}: Failed to update book: ${updErr.message}`);
      } else {
        updated++;
      }
    } else {
      const defaultImg = "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c";
      const { error: insErr } = await adminDb.from("books").insert({
        title,
        author,
        category,
        price,
        stock,
        discount: Math.min(100, Math.max(0, discount)),
        sku,
        isbn_10: isbn10,
        isbn_13: isbn13,
        weight_grams: weightGrams,
        length_cm: lengthCm,
        width_cm: widthCm,
        height_cm: heightCm,
        is_active: isActive,
        image_url: defaultImg,
        cover_image: defaultImg,
        images: [defaultImg],
        description: "",
      });

      if (insErr) {
        errors.push(`Row ${rowNum}: Failed to insert book: ${insErr.message}`);
      } else {
        inserted++;
      }
    }
  }

  return {
    success: errors.length === 0,
    totalRows: rows.length,
    inserted,
    updated,
    errors,
  };
}

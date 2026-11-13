import { requireUser } from "@/lib/auth";
import { handle, ok } from "@/lib/http";
import { listProducts } from "@/lib/products";

export async function GET() {
  return handle(async () => {
    await requireUser();
    const products = await listProducts();
    return ok({ products });
  });
}

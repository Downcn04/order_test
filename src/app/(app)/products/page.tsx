import { requirePageUser } from "@/lib/auth";
import { listProducts } from "@/lib/products";
import { RedeemButton } from "@/components/RedeemButton";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const user = await requirePageUser();
  const products = await listProducts();

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold">可兑换商品</h1>
        <p className="text-sm text-zinc-500">
          当前积分：<span className="font-medium text-zinc-900">{user.balance}</span>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {products.map((product) => (
          <div
            key={product.id}
            className="flex flex-col gap-3 rounded-xl bg-white p-5 shadow-sm"
          >
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-medium">{product.name}</h2>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    product.kind === "LOCAL"
                      ? "bg-sky-100 text-sky-700"
                      : "bg-violet-100 text-violet-700"
                  }`}
                >
                  {product.kind === "LOCAL" ? "本地发放" : "外部兑换码"}
                </span>
              </div>
              <p className="mt-1 text-sm text-zinc-500">
                {product.description}
              </p>
            </div>
            <div className="mt-auto flex items-end justify-between">
              <span className="text-lg font-semibold">{product.price} 积分</span>
              <RedeemButton
                productId={product.id}
                productName={product.name}
                price={product.price}
                balance={user.balance}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

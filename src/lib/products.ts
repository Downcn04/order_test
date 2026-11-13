import { prisma } from "./db";

export async function listProducts() {
  return prisma.product.findMany({
    where: { active: true },
    orderBy: { sort: "asc" },
  });
}

export async function getProduct(idOrCode: string) {
  return prisma.product.findFirst({
    where: {
      active: true,
      OR: [{ id: idOrCode }, { code: idOrCode }],
    },
  });
}

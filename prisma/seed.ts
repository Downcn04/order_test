import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("demo1234", 10);

  const alice = await prisma.user.upsert({
    where: { email: "alice@example.com" },
    update: { displayName: "Alice" },
    create: {
      email: "alice@example.com",
      passwordHash,
      displayName: "Alice",
      balance: 0,
    },
  });

  const bob = await prisma.user.upsert({
    where: { email: "bob@example.com" },
    update: { displayName: "Bob" },
    create: {
      email: "bob@example.com",
      passwordHash,
      displayName: "Bob",
      balance: 200,
    },
  });

  await prisma.pointTransaction.upsert({
    where: {
      type_refId: { type: "ADJUSTMENT", refId: "bob-initial-grant" },
    },
    update: {},
    create: {
      userId: bob.id,
      delta: 200,
      balanceAfter: 200,
      type: "ADJUSTMENT",
      refType: "seed",
      refId: "bob-initial-grant",
    },
  });

  const tasks = [
    {
      code: "daily_checkin",
      title: "每日签到",
      description: "打开应用并签到，领取 10 积分。",
      reward: 10,
      sort: 1,
    },
    {
      code: "read_docs",
      title: "阅读入门文档",
      description: "阅读产品入门文档，领取 20 积分。",
      reward: 20,
      sort: 2,
    },
    {
      code: "share_project",
      title: "分享项目",
      description: "把项目分享给一位朋友，领取 30 积分。",
      reward: 30,
      sort: 3,
    },
  ];

  for (const task of tasks) {
    await prisma.task.upsert({
      where: { code: task.code },
      update: {
        title: task.title,
        description: task.description,
        reward: task.reward,
        sort: task.sort,
        active: true,
      },
      create: task,
    });
  }

  const products = [
    {
      code: "theme_pack",
      name: "本地会员主题包",
      description: "由本站即时发放的虚拟主题包。",
      kind: "LOCAL" as const,
      price: 40,
      sort: 1,
    },
    {
      code: "ebook",
      name: "Digital handbook",
      description: "通过外部兑换码服务发放的电子手册。",
      kind: "EXTERNAL" as const,
      providerProductId: "ebook",
      price: 60,
      sort: 2,
    },
    {
      code: "theme",
      name: "Theme pack",
      description: "通过外部兑换码服务发放的主题包。",
      kind: "EXTERNAL" as const,
      providerProductId: "theme",
      price: 80,
      sort: 3,
    },
    {
      code: "course",
      name: "Course access",
      description: "通过外部兑换码服务发放的课程访问码。",
      kind: "EXTERNAL" as const,
      providerProductId: "course",
      price: 100,
      sort: 4,
    },
  ];

  for (const product of products) {
    await prisma.product.upsert({
      where: { code: product.code },
      update: {
        name: product.name,
        description: product.description,
        kind: product.kind,
        providerProductId: product.providerProductId ?? null,
        price: product.price,
        sort: product.sort,
        active: true,
      },
      create: {
        ...product,
        providerProductId: product.providerProductId ?? null,
      },
    });
  }

  console.log("Seed complete");
  console.log(`  alice@example.com / demo1234 (balance ${alice.balance})`);
  console.log(`  bob@example.com / demo1234 (balance ${bob.balance})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

# 积分与数字商品兑换 Demo

## 项目描述

这是一个可本地运行的 Web App：用户注册登录后完成预置任务获得积分，再用积分兑换数字商品。商品分两类：

- **本地商品**：由系统直接生成兑换码。
- **外部商品**：由服务端调用 [Digital Goods API](https://digital-goods-api.vercel.app/) 发放兑换码，`productId` 使用 API 文档中的 `ebook` / `course` / `theme`。

这个项目的重点不是 CRUD，而是**外部服务不可靠时的账目一致性**：API 可能超时、限流、返回 5xx 或 4xx，但无论哪种情况，都要保证不重复扣分、不重复发码、不丢码，页面如实反映订单状态。

核心实现思路：

- 先扣分、再调外部 API，扣分与订单在同一数据库事务中完成。
- 三层幂等：前端 `idempotencyKey` → 数据库唯一约束 → 外部 API `requestId`。
- 订单状态机：`PENDING / DELIVERED / REFUNDED / NEEDS_ATTENTION`。
- 只有“确定失败”才退款；超时/5xx 等不确定结果保持 PENDING，由独立 Worker 对账。
- 对账时先 `GET` 再决定是否重发，重试永远复用同一 `requestId`。
- Fake Provider 可注入超时、5xx、429、422，方便测试与演示。

不包含：运营后台、真实支付、短信验证、找回密码。

## 技术栈

- Next.js 16（App Router，Route Handlers 作为后端）+ React 19 + TypeScript
- PostgreSQL 16 + Prisma 6
- Tailwind CSS
- bcryptjs + DB Session + httpOnly Cookie
- Vitest（单元 + 集成测试）
- 独立 Worker 进程做订单对账

## 功能

- 注册 / 登录 / 登出，不同用户数据隔离
- 任务列表与领取积分（同一任务只能领一次）
- 积分余额与收支流水
- 商品列表（本地商品 + 外部兑换码商品）
- 兑换流程：扣分 → 调外部 API → 状态机收敛
- 兑换记录：处理中 / 已到账 / 已退款 / 需处理，展示兑换码
- 并发安全：条件更新扣分 + 数据库唯一约束
- 外部 API 超时/报错时由 Worker 对账

---

## 首次打开

### 前置要求

- Node.js >= 20.9
- 任选其一：Docker，或本机已安装 PostgreSQL 16

### 方式 A：Docker（跨平台，推荐）

```bash
# 1. 启动数据库（映射到 localhost:5433）
docker compose up -d

# 2. 安装依赖 + 初始化环境变量/迁移/演示数据
npm install
npm run setup

# 3. 同时启动 Web 和对账 Worker
npm run start:all
```

### 方式 B：Windows 本机 PostgreSQL（不需要 Docker）

```bash
npm install
npm run setup:local-db   # 初始化并启动项目独立实例（端口 5433），写入 .env
npm run setup            # 应用迁移 + 写入演示数据
npm run start:all
```

`setup:local-db` 会自动：查找 PostgreSQL 安装目录 → 初始化 `.pgdata/` → 启动实例 → 创建 `rewards` 数据库 → 更新 `.env` 的 `DATABASE_URL`。重复执行是安全的。

### 打开

浏览器访问 <http://localhost:3000>。

| 账号 | 密码 | 初始积分 |
|---|---|---|
| `alice@example.com` | `demo1234` | 0（体验做任务流程） |
| `bob@example.com` | `demo1234` | 200（快速体验兑换） |

默认 `PROVIDER_MODE=fake`，**不需要 API Key**，兑换外部商品会即时返回假兑换码。

### 脚本说明

| 命令 | 作用 |
|---|---|
| `npm run setup` | 复制 `.env.example`（如缺失）、检查数据库连通性、执行迁移和 seed |
| `npm run setup:local-db` | Windows：初始化/启动本机独立 PostgreSQL 并写 `.env` |
| `npm run start:all` | 同时启动 `next dev` 和 Worker，Ctrl+C 一起退出 |
| `npm run dev` | 只启动 Web |
| `npm run worker` | 只启动对账 Worker（单独终端） |

> `npm run setup` 之前必须先有可连接的 PostgreSQL。若连不上，脚本会提示先执行 `docker compose up -d` 或 `npm run setup:local-db`。

---

## 环境变量

复制模板：

```bash
cp .env.example .env
```

| 变量 | 说明 |
|---|---|
| `DATABASE_URL` | 默认 `postgresql://app:app@localhost:5433/rewards?schema=public` |
| `SESSION_SECRET` | 会话签名用，生产环境请换成随机长字符串 |
| `SESSION_TTL_DAYS` | 会话有效期，默认 7 天 |
| `PROVIDER_MODE` | `fake`（开发/测试）或 `real`（真实外部 API） |
| `DIGITAL_GOODS_API_KEY` | 真实模式必填；**只放服务端，不要提交到仓库** |
| `DIGITAL_GOODS_BASE_URL` | 外部 API 根地址 |
| `DIGITAL_GOODS_PROXY` | 可选，调用外部 API 的 HTTP 代理（如 `http://127.0.0.1:7897`）；Node fetch 默认不走系统代理 |
| `PROVIDER_TIMEOUT_MS` | 调用外部 API 的超时，默认 15000ms |
| `WORKER_INTERVAL_MS` | Worker 轮询间隔，默认 20000ms |
| `WORKER_BATCH_SIZE` | 每轮最多处理订单数，默认 3 |

外部 API Key 默认 14 天有效，且有请求频率/每日/总兑换码额度限制，**不要用压测方式验证**。开发与测试请保持 `PROVIDER_MODE=fake`。

## 数据库

- 迁移文件在 `prisma/migrations/`，演示数据在 `prisma/seed.ts`。
- `npm run setup` 会执行 `prisma migrate deploy` + `prisma db seed`。
- 重复执行 seed 是幂等的（使用 `upsert`），会更新任务/商品定义，但**不会清空已有用户的积分和订单进度**。
- 修改 schema 后：`npm run db:migrate` 生成新迁移。

如需手动初始化 PostgreSQL（不使用脚本），见文末附录。

## 测试

```bash
npm test              # 单元 + 集成测试
npm run test:unit
npm run test:integration
```

集成测试连接 `DATABASE_URL` 指向的数据库，会创建独立临时用户/商品并在结束后清理，不影响演示账号。运行前需保证数据库已启动并执行过迁移。

覆盖场景：

- 余额恰好够一次时，10 个并发兑换只成功 1 单，余额与流水一致
- 同一 `idempotencyKey` 并发提交只创建 1 单、只扣 1 次
- 外部调用超时后，Worker 通过 `requestId` 查到已发放的码，不再扣分
- 422 商品不可用 → 退款恰好一次，重复对账不重复退
- 同一任务重复领取只加一次分
- 两个 Worker 并发抢占不会重复处理同一订单

## 故障演示（Fake Provider）

`PROVIDER_MODE=fake` 时，可向服务端注入下一次外部调用的行为：

```bash
# 下一次调用超时（结果未知）
curl.exe -X POST http://localhost:3000/api/dev/provider ^
  -H "Content-Type: application/json" ^
  -d "{\"behavior\":{\"type\":\"timeout\"}}"

# 下一次返回 422（商品不可用，会退款）
curl.exe -X POST http://localhost:3000/api/dev/provider ^
  -H "Content-Type: application/json" ^
  -d "{\"behavior\":{\"type\":\"http\",\"status\":422}}"
```

然后去商品页兑换外部商品，观察订单状态与积分变化；超时订单会由 Worker 在一轮轮询内对账完成。

## 关键设计

### 1. 先扣分，后调用外部 API

创建订单与扣分在**同一数据库事务**中完成：

```sql
UPDATE "User" SET balance = balance - :cost
WHERE id = :uid AND balance >= :cost;
```

- 条件更新由数据库行锁保证，并发下不可能超兑。
- 若后续外部调用失败，走退款；不会出现“码已发、分没扣”。
- 订单与负向流水同事务写入，任何一步失败整体回滚。

### 2. 三层幂等

| 层 | 机制 | 防止 |
|---|---|---|
| 前端 | 每次点击生成 `idempotencyKey`，失败重试复用 | 双击 / 网络重试 |
| 数据库 | `Order(userId, idempotencyKey)` 唯一约束 | 并发重复下单 |
| 外部 API | `requestId` 由订单 ID 派生，重试永不变 | 重复发码 |
| 账本 | `PointTransaction(type, refId)` 唯一约束 | 重复扣分 / 退款 |

### 3. 订单状态机

```
PENDING ──200──────────────► DELIVERED
   │──400/409/422──────────► REFUNDED（退款 + 反向流水）
   │──401──────────────────► NEEDS_ATTENTION（Key 问题，不退款）
   └──超时/5xx/429─────────► PENDING（退避重试）
                                └ 重试耗尽 → NEEDS_ATTENTION（不自动退款）
```

**只有确定失败（未发码）才退款**。超时、5xx、429 属于结果未知，保持 PENDING，由 Worker 对账。

### 4. 对账

Worker 每轮用 `FOR UPDATE SKIP LOCKED` 抢占待处理订单，先 `GET /deliveries/{requestId}`：

- 查到 → 置为 DELIVERED 并保存兑换码
- 404 → 用**同一 requestId** 重新 POST
- 仍不确定 → 指数退避，尊重 `Retry-After`
- 达到最大次数 → NEEDS_ATTENTION，页面提供“重新查询”

这样即使“POST 超时但服务端已发码”，也不会重复发码。

### 5. 本地商品

不经过外部 API，在扣分事务内直接生成兑换码并置为 DELIVERED，同样受唯一约束与状态机保护。

## 目录结构

```
prisma/            schema、迁移、seed
scripts/           setup、setup-local-db、dev-all、worker
src/lib/           认证、积分、订单、Provider、对账等核心逻辑
src/app/api/       Route Handlers
src/app/(app)/     登录后页面
src/app/(auth)/    登录/注册
tests/             单元与集成测试
```

## 已知限制

- 对账依赖独立 Worker 进程；若部署到 Serverless，需要改成定时任务。
- 限流为进程内实现，多实例部署下不精确（演示项目足够）。
- 极端不确定状态会保留为 NEEDS_ATTENTION 并支持手动重新查询，刻意不自动退款。
- 尚未实现“关闭页面后重开仍复用幂等 key”，目前依赖兑换记录页展示已有订单。
- 未实现运营后台、真实支付、短信验证/找回密码。
- 外部 Key 有有效期与额度限制；真实模式需自行保证 Key 有效。

## 附录：手动初始化 PostgreSQL（Windows，不使用脚本）

```powershell
$pg = "C:\Program Files\PostgreSQL\16\bin"

& "$pg\initdb.exe" -D .pgdata -U app --auth=trust --encoding=UTF8 --locale=C
& "$pg\pg_ctl.exe" -D .pgdata -o "-p 5433" -l .pgdata\server.log start
& "$pg\createdb.exe" -h 127.0.0.1 -p 5433 -U app rewards
```

停止：

```powershell
& "C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe" -D .pgdata stop
```

> `.pgdata/` 已加入 `.gitignore`。该实例只使用 trust 认证，仅用于本地开发。

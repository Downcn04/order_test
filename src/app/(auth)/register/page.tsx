"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RegisterPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, email, password }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error?.message ?? "注册失败");
      }
      router.push("/");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "注册失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-semibold">注册</h1>
      <p className="mt-1 text-sm text-zinc-500">注册后即可领取积分。</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block">
          <span className="text-sm text-zinc-600">昵称</span>
          <input
            required
            maxLength={40}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
          />
        </label>
        <label className="block">
          <span className="text-sm text-zinc-600">邮箱</span>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
          />
        </label>
        <label className="block">
          <span className="text-sm text-zinc-600">密码（至少 6 位）</span>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
          />
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-zinc-900 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {loading ? "注册中…" : "注册"}
        </button>
      </form>
      <p className="mt-4 text-sm text-zinc-500">
        已有账号？{" "}
        <Link href="/login" className="text-zinc-900 underline">
          登录
        </Link>
      </p>
    </div>
  );
}

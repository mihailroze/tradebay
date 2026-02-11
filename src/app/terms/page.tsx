import TopNav from "@/components/TopNav";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-5 py-10">
        <TopNav />
        <main className="rounded-3xl border border-neutral-800 bg-neutral-900 p-6">
          <h1 className="text-2xl font-semibold tracking-tight">Условия использования</h1>
          <p className="mt-4 text-sm text-neutral-300">
            TradeBay предоставляет площадку для публикации игровых лотов и связи между пользователями.
            Сделки совершаются между продавцом и покупателем. Пользователь обязан указывать корректную
            информацию о товаре и соблюдать правила платформы.
          </p>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-neutral-300">
            <li>Запрещены мошеннические, незаконные и вводящие в заблуждение объявления.</li>
            <li>Платформа вправе скрывать или удалять лоты при жалобах и нарушениях.</li>
            <li>Платежи в Trade Coin могут замораживаться до подтверждения сделки.</li>
            <li>Споры рассматриваются администрацией с правом release/refund по эскроу.</li>
            <li>Используя сервис, пользователь принимает эти условия.</li>
          </ul>
          <p className="mt-6 text-xs text-neutral-500">Версия: 1.0 · Обновлено: 2026-02-11</p>
        </main>
      </div>
    </div>
  );
}

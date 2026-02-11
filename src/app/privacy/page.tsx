import TopNav from "@/components/TopNav";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-5 py-10">
        <TopNav />
        <main className="rounded-3xl border border-neutral-800 bg-neutral-900 p-6">
          <h1 className="text-2xl font-semibold tracking-tight">Политика конфиденциальности</h1>
          <p className="mt-4 text-sm text-neutral-300">
            TradeBay обрабатывает данные Telegram-профиля и данные сделок только в объеме, необходимом
            для работы сервиса: авторизация, публикация лотов, платежи, эскроу и модерация.
          </p>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-neutral-300">
            <li>Мы сохраняем Telegram ID, username, отображаемое имя и технические метки активности.</li>
            <li>Данные о платежах и транзакциях хранятся для финансового учета и антифрода.</li>
            <li>Логи ошибок и безопасности могут включать технические метаданные запросов.</li>
            <li>Данные не передаются третьим лицам, кроме необходимых провайдеров (Telegram/Railway).</li>
            <li>Для удаления аккаунта и данных обратитесь администратору проекта.</li>
          </ul>
          <p className="mt-6 text-xs text-neutral-500">Версия: 1.0 · Обновлено: 2026-02-11</p>
        </main>
      </div>
    </div>
  );
}

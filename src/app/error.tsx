"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="error-page">
      <h1>Não foi possível abrir a aplicação.</h1>
      <p>Confira se o banco de dados está ativo e tente novamente.</p>
      <button onClick={reset}>Tentar novamente</button>
    </main>
  );
}

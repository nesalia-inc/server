import { QueryClientProvider, ErrorBoundary } from "@deessejs/client-react";

function ErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div style={{ padding: "2rem", textAlign: "center" }}>
      <h2>Something went wrong</h2>
      <p style={{ color: "#666" }}>{error.message}</p>
      <button
        onClick={reset}
        style={{
          marginTop: "1rem",
          padding: "0.5rem 1rem",
          cursor: "pointer",
        }}
      >
        Retry
      </button>
    </div>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ErrorBoundary fallback={<ErrorFallback />}>
          <QueryClientProvider>{children}</QueryClientProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}

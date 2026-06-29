import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const cairo = Cairo({
  subsets: ["arabic"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-cairo",
});

export const metadata: Metadata = {
  title: "في ذكرى سليمان أبو عنزة — رحمه الله",
  description: "صفحة تعزية وذكرى — رحمه الله وأسكنه فسيح جناته",
  icons: {
    icon: "/assets/images/favicon-32.png",
    apple: "/assets/images/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    locale: "ar_EG",
    siteName: "في ذكرى سليمان أبو عنزة",
    title: "في ذكرى سليمان أبو عنزة — رحمه الله",
    description: "صفحة تعزية وذكرى — تلاواته وكلمات من الأحباء",
    url: "https://sulaiman-abu-anza.vercel.app/",
    images: [
      {
        url: "https://sulaiman-abu-anza.vercel.app/assets/images/og-image.png",
        width: 1200,
        height: 630,
        alt: "سليمان أبو عنزة — رحمه الله",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "في ذكرى سليمان أبو عنزة — رحمه الله",
    description: "صفحة تعزية وذكرى — تلاواته وكلمات من الأحباء",
    images: ["https://sulaiman-abu-anza.vercel.app/assets/images/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${cairo.variable} h-full antialiased`}
    >
      <head>
        {/* Sentry configuration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.SENTRY_RELEASE = { id: 'sulaiman@1.0.0' };
              window.sentryOnLoad = function () {
                const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
                Sentry.init({
                  environment: isLocal ? 'development' : 'production',
                  integrations: [
                    Sentry.browserTracingIntegration(),
                    Sentry.replayIntegration({
                      maskAllText: true,
                      blockAllMedia: true,
                    }),
                  ],
                  tracesSampleRate: isLocal ? 1.0 : 0.2,
                  tracePropagationTargets: ['localhost', /^https:\\/\\/.*\\.supabase\\.co/],
                  replaysSessionSampleRate: isLocal ? 1.0 : 0.1,
                  replaysOnErrorSampleRate: 1.0,
                  dataCollection: { userInfo: false },
                  ignoreErrors: ['ResizeObserver loop limit exceeded', /^Script error\\.?$/],
                  denyUrls: [
                    /extensions\\//i,
                    /^chrome:\\/\\//i,
                    /^moz-extension:\\/\\//i,
                    /^safari-extension:\\/\\//i,
                  ],
                  beforeSend(event) {
                    if (event.request?.data) delete event.request.data;
                    return event;
                  },
                });
              };
            `,
          }}
        />
        <Script
          src="https://js.sentry-cdn.com/c6d8c563b7394e5aaeb4016638126f73.min.js"
          crossOrigin="anonymous"
          strategy="beforeInteractive"
        />
      </head>
      <body className="min-h-full bg-memorial-pearl text-memorial-deep antialiased font-cairo">
        {children}
      </body>
    </html>
  );
}

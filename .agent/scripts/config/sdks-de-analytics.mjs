/**
 * Os SDKs de analytics e de telemetria que o Guard 24 procura no `package.json` (#495) — {{PROJECT_NAME}}
 *
 * Configuracao do PROJETO: o `/upgrade` copia-a quando falta e NUNCA a substitui. Acrescentar os do projeto; tirar um
 * que nao se aplique. Cada entrada:
 *   - `produto`: o nome com que o aviso o diz;
 *   - `pacotes`: nomes EXATOS do npm, ou um PREFIXO terminado em `/` ou em `-` (`@sentry/` apanha `@sentry/nextjs`);
 *   - `nomes`: como o inventario (`docs/legal/privacy-inventory.md`) o pode nomear — procura-se cada um como PALAVRA,
 *     com as MAIUSCULAS do nome ("amplitude" numa frase nao e a Amplitude), numa LINHA DE TABELA do inventario.
 *
 * O porque de cada um estar aqui: todos recolhem, por omissao, dados de quem usa a app (um id, o IP, o que fez, e no
 * caso dos de erros e de sessao, o que estava no ecra). Os sem cookies (Plausible, Umami) tambem: declaram-se.
 */
export const SDKS_DE_ANALYTICS = [
  { produto: "Google Analytics", pacotes: ["react-ga4", "react-ga", "vue-gtag", "ngx-google-analytics"], nomes: ["Google Analytics", "GA4", "Google Tag Manager"] },
  // O `@next/third-parties` traz o Analytics, o Tag Manager, o Maps e o YouTube: o aviso diz os quatro.
  { produto: "Google third-parties (Analytics, Tag Manager, Maps, YouTube)", pacotes: ["@next/third-parties"], nomes: ["Google Analytics", "Google Tag Manager", "Google Maps", "YouTube"] },
  { produto: "Segment", pacotes: ["@segment/"], nomes: ["Segment"] },
  { produto: "Mixpanel", pacotes: ["mixpanel-browser", "mixpanel"], nomes: ["Mixpanel"] },
  { produto: "Amplitude", pacotes: ["@amplitude/", "amplitude-js"], nomes: ["Amplitude"] },
  { produto: "PostHog", pacotes: ["posthog-js", "posthog-node", "posthog-react-native"], nomes: ["PostHog"] },
  { produto: "Hotjar", pacotes: ["@hotjar/", "react-hotjar"], nomes: ["Hotjar"] },
  { produto: "Sentry", pacotes: ["@sentry/"], nomes: ["Sentry"] },
  { produto: "Datadog RUM", pacotes: ["@datadog/browser-"], nomes: ["Datadog"] },
  { produto: "LogRocket", pacotes: ["logrocket"], nomes: ["LogRocket"] },
  { produto: "FullStory", pacotes: ["@fullstory/"], nomes: ["FullStory"] },
  { produto: "Plausible", pacotes: ["plausible-tracker", "next-plausible"], nomes: ["Plausible"] },
  { produto: "Umami", pacotes: ["@umami/"], nomes: ["Umami"] },
];

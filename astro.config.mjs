// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightLlmsTxt from "starlight-llms-txt";

import vercel from "@astrojs/vercel";

export default defineConfig({
  site: "https://docs.ufba.app",

  integrations: [
    starlight({
      title: "App UFBA - Docs",
      description:
        "Documentação do ecossistema ufba.app — arquitetura, integrações técnicas com SIGAA/Moodle/Classroom, modelo de dados e como contribuir.",
      logo: {
        src: "./src/assets/logo.svg",
        alt: "Brasão da UFBA",
        replacesTitle: true,
      },
      customCss: ["./src/styles/custom.css"],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/ufba-app",
        },
      ],
      sidebar: [
        {
          label: "Visão geral",
          items: [{ label: "O que é o ufba.app", slug: "visao-geral" }],
        },
        {
          label: "Integrações",
          items: [{ autogenerate: { directory: "integracoes" } }],
        },
        {
          label: "Modelo de dados",
          items: [{ label: "Entidades e relações", slug: "modelo-de-dados" }],
        },
        {
          label: "Contribuindo",
          items: [{ label: "Como contribuir", slug: "contribuindo" }],
        },
      ],
      plugins: [starlightLlmsTxt()],
    }),
  ],

  adapter: vercel(),
});
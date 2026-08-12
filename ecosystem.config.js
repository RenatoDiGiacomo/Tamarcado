// PM2 — processo de produção da API (architecture.md §8.3).
// `cwd` aponta para o symlink `current` (modelo de releases, DL-060): cada deploy
// troca /opt/tamarcado/current -> releases/<id> e reinicia o PM2 apontando aqui.
// O pacote de produção tem `dist/` na raiz da release (montado por `pnpm deploy`).
module.exports = {
  apps: [
    {
      name: "tamarcado-api",
      cwd: "/opt/tamarcado/current",
      script: "dist/main.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
  ],
};

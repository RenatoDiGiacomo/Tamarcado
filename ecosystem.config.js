// PM2 — processo de produção da API (architecture.md §8.3).
module.exports = {
  apps: [
    {
      name: "tamarcado-api",
      cwd: "/opt/tamarcado/apps/api",
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

module.exports = {
  apps: [
    {
      name: "m3u4me",
      script: "npm",
      args: "run start",
      env: {
        PORT: 8080,
        NODE_ENV: "production"
      },
    },
  ],
};

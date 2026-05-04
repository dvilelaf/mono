module.exports = {
  apps: [
    {
      name: "growth-jobs",
      cwd: __dirname,
      script: "./node_modules/.bin/tsx",
      args: "src/index.ts",
      env: {
        NODE_ENV: "production",
      },
      max_memory_restart: "400M",
      out_file: "/tmp/growth-jobs.out.log",
      error_file: "/tmp/growth-jobs.err.log",
      time: true,
    },
  ],
};

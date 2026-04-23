module.exports = {
  apps: [
    {
      name: "wiki-jobs",
      cwd: __dirname,
      script: "./node_modules/.bin/tsx",
      args: "src/index.ts",
      env: {
        NODE_ENV: "production",
      },
      max_memory_restart: "400M",
      out_file: "/tmp/wiki-jobs.out.log",
      error_file: "/tmp/wiki-jobs.err.log",
      time: true,
    },
  ],
};

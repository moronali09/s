module.exports = {
  apps: [
    {
      name: "sparrowbot",
      script: "./index.js",
      instances: 1,
      autorestart: true,
      restart_delay: 10000,
      watch: false,
      max_memory_restart: "200M",
      env: {}
    }
  ]
}

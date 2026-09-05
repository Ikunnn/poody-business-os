module.exports = {
  apps: [
    {
      name: 'poody-mock',
      cwd: 'C:/Users/Marketing Catra/mock-server',
      script: 'server.js',
      env: { PORT: 8000, NODE_ENV: 'production' },
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      error_file: 'C:/Users/Marketing Catra/logs/mock-error.log',
      out_file: 'C:/Users/Marketing Catra/logs/mock-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      exp_backoff_restart_delay: 100
    },
    {
      name: 'poody-prototype',
      cwd: 'C:/Users/Marketing Catra/agentic-prototype',
      script: 'server.js',
      env: { PORT: 8001, NODE_ENV: 'production' },
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      error_file: 'C:/Users/Marketing Catra/logs/poody-error.log',
      out_file: 'C:/Users/Marketing Catra/logs/poody-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      exp_backoff_restart_delay: 100
    }
  ]
};

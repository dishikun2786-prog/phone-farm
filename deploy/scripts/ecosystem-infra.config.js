// PM2 config for PhoneFarm infrastructure services on VPS
module.exports = {
  apps: [
    {
      name: 'redis-server',
      script: 'D:\\Redis\\redis-server.exe',
      args: 'D:\\Redis\\redis.conf',
      cwd: 'D:\\Redis',
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 20,
      restart_delay: 3000,
      env: {
        PATH: process.env.PATH
      }
    },
    {
      name: 'nats-server',
      script: 'D:\\NATS\\nats-server.exe',
      args: '-a 127.0.0.1 -p 4222',
      cwd: 'D:\\NATS',
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 20,
      restart_delay: 3000,
    },
    {
      name: 'minio-server',
      script: 'D:\\MinIO\\minio.exe',
      args: 'server D:\\MinIO\\data --address :9000 --console-address :9001',
      cwd: 'D:\\MinIO',
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 20,
      restart_delay: 3000,
      env: {
        MINIO_ROOT_USER: 'minioadmin',
        MINIO_ROOT_PASSWORD: 'minioadmin',
      }
    },
    {
      name: 'phonefarm-control',
      script: 'node_modules/.bin/tsx',
      args: 'src/index.ts',
      cwd: 'D:\\www\\phone\\control-server',
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 20,
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production',
      },
      env_file: 'D:\\www\\phone\\control-server\\.env',
    },
    {
      name: 'phonefarm-relay',
      script: 'node_modules/.bin/tsx',
      args: 'src/vps-relay.ts',
      cwd: 'D:\\www\\phone\\control-server',
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 20,
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production',
      },
      env_file: 'D:\\www\\phone\\control-server\\.env',
    }
  ]
};

// Proses aplikasi SunDY di VPS, dijalankan PM2 sebagai user "sundyapp".
// Jalurnya lewat symlink /www/sundy/current, dan deploy.sh selalu menjalankan
// `pm2 delete` + `pm2 start` berkas ini, sehingga rilis baru pasti terpakai.
module.exports = {
  apps: [
    {
      name: "sundy",
      cwd: "/www/sundy/current/.next/standalone",
      script: "server.js",
      // Rahasia dibaca dari berkas bersama; tidak pernah disalin ke folder rilis.
      node_args: "--env-file=/www/sundy/shared/.env",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        HOSTNAME: "127.0.0.1",
      },
      max_memory_restart: "700M",
      time: true,
    },
  ],
};

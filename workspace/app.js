
const express = require('express');
const os = require('os');
const app = express();
const PORT = 3000;

function formatUptime(seconds) {
    function pad(n) { return n < 10 ? '0' + n : n; }
    const days = Math.floor(seconds / (3600 * 24));
    seconds -= days * 3600 * 24;
    const hours = Math.floor(seconds / 3600);
    seconds -= hours * 3600;
    const minutes = Math.floor(seconds / 60);
    seconds -= minutes * 60;
    const formattedTime = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    return days > 0 ? `${days} hari, ${formattedTime}` : formattedTime;
}

app.get('/status', (req, res) => {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const uptimeInSeconds = os.uptime();

    res.json({
        status: 'berjalan',
        platform: os.platform(),
        architecture: os.arch(),
        cpuCount: os.cpus().length,
        totalMemoryMB: (totalMemory / 1024 / 1024).toFixed(2),
        freeMemoryMB: (freeMemory / 1024 / 1024).toFixed(2),
        loadAverage: os.loadavg(), // Array of 1, 5, and 15 minute load averages
        uptime: formatUptime(uptimeInSeconds),
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, () => {
    console.log(`Server jalan di http://localhost:${PORT}. Cek /status`);
});

/**
 * Performance Monitoring Script
 * Tracks server metrics and logs them
 */

const os = require('os');
const process = require('process');

class PerformanceMonitor {
    constructor() {
        this.startTime = Date.now();
        this.metrics = {
            requests: 0,
            errors: 0,
            activeConnections: 0,
            peakConnections: 0,
            totalDataSent: 0,
            totalDataReceived: 0
        };
    }
    
    start(intervalMs = 60000) {
        console.log('📊 Performance monitoring started');
        
        setInterval(() => {
            this.logMetrics();
        }, intervalMs);
    }
    
    logMetrics() {
        const uptime = Math.floor((Date.now() - this.startTime) / 1000);
        const memUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        
        console.log('\n' + '='.repeat(50));
        console.log('📊 Performance Metrics');
        console.log('='.repeat(50));
        console.log(`Uptime: ${this.formatUptime(uptime)}`);
        console.log(`\nMemory Usage:`);
        console.log(`  RSS: ${this.formatBytes(memUsage.rss)}`);
        console.log(`  Heap Used: ${this.formatBytes(memUsage.heapUsed)}`);
        console.log(`  Heap Total: ${this.formatBytes(memUsage.heapTotal)}`);
        console.log(`  External: ${this.formatBytes(memUsage.external)}`);
        console.log(`\nSystem:`);
        console.log(`  Free Memory: ${this.formatBytes(os.freemem())}`);
        console.log(`  Total Memory: ${this.formatBytes(os.totalmem())}`);
        console.log(`  CPU Load: ${os.loadavg()[0].toFixed(2)}`);
        console.log(`\nApplication:`);
        console.log(`  Active Connections: ${this.metrics.activeConnections}`);
        console.log(`  Peak Connections: ${this.metrics.peakConnections}`);
        console.log(`  Total Requests: ${this.metrics.requests}`);
        console.log(`  Total Errors: ${this.metrics.errors}`);
        console.log('='.repeat(50) + '\n');
    }
    
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }
    
    formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        let parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        parts.push(`${secs}s`);
        
        return parts.join(' ');
    }
    
    recordConnection() {
        this.metrics.activeConnections++;
        if (this.metrics.activeConnections > this.metrics.peakConnections) {
            this.metrics.peakConnections = this.metrics.activeConnections;
        }
    }
    
    recordDisconnection() {
        this.metrics.activeConnections = Math.max(0, this.metrics.activeConnections - 1);
    }
    
    recordRequest() {
        this.metrics.requests++;
    }
    
    recordError() {
        this.metrics.errors++;
    }
}

module.exports = PerformanceMonitor;
